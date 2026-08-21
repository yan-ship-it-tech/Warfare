// ─────────────────────────────────────────────────────────────────────────
// Synthetic stylized terrain strip — metric as of Pass 24.
//
// Explicitly NOT real geography and not satellite imagery (that was tried in
// Pass 4 and reverted — see docs/DECISIONS.md). This is a representative
// cross-section: rolling steppe relief, a churned scar along the zero line,
// low-poly flat-shaded facets and a muted palette, so it reads as a teaching
// diagram that happens to be three-dimensional rather than as a map of
// anywhere in particular.
//
// Height is a deterministic value-noise sum — same seed, same terrain, every
// load — so an asset placed on the surface never moves between sessions.
//
// ── What Pass 25 changed ─────────────────────────────────────────────────
// Z and Y are metres. X is not: it is zone-relative depth (see zones.ts), and
// every X threshold in this file is stated in km and converted through
// `worldXFor` so it lands in the right zone at the right fraction of it.
//
// terrainHeight() is still a pure (x, z) → number function with no
// `Projection` argument — that contract is what every other module's
// anchoring depends on, and it survives intact: the zone model is a constant
// of the build, so nothing a user edits can move the ground.
//
// ── The fidelity gradient is RETIRED ─────────────────────────────────────
// Pass 24 faded terrain detail with the axis's compression, because past the
// true-scale boundary the mesh's own X sampling was too coarse to carry a
// high-frequency octave without aliasing. There is no compression any more
// and the whole world is 19.2 km wide, so the mesh resolves fine detail
// EVERYWHERE and the ground gets it everywhere. That is not only a
// simplification: "sparse / empty ground" was one of the three failure modes
// this pass exists to remove, and a detail ramp that switched off two zones
// out of three was a direct contributor to it. `groundFidelity()` survives as
// a function so callers keep one place to ask the question, and now answers
// 1 across the whole represented world.
//
// Per-zone CHARACTER replaces per-distance fidelity: each zone gets its own
// ground tint, damage level and dressing density, so crossing a transition
// reads as arriving somewhere different rather than as detail draining away.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { TERRAIN_HALF_Z, TERRAIN_X_OVERRUN, worldXFor } from "./worldMapping";
import { METRES_PER_KM, HALF_EXTENT_M, ZONE_GAPS, zoneAtSaturating } from "./zones";

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** One octave of value noise. */
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/** Smooth 1 → 0 ramp between two |x| stops, in world units. */
function fade(v: number, a: number, b: number): number {
  if (v <= a) return 1;
  if (v >= b) return 0;
  return 1 - smooth((v - a) / (b - a));
}

// ── fidelity ────────────────────────────────────────────────────────────
/**
 * Retired as a gradient (see the header). Full detail across the whole
 * represented world; the only fade left is the last 600 m of terrain overrun
 * past the deepest zone, where the ground is running out and the haze has
 * already taken it. Kept as a function because props.ts and scenery.ts want
 * one place to ask "is this ground real enough to stand a tree on", and
 * because answering 1 in one place is cheaper than deleting the question from
 * five call sites.
 */
const DETAIL_FULL_TO = HALF_EXTENT_M;
const DETAIL_GONE_AT = HALF_EXTENT_M + 600;

export function groundFidelity(x: number): number {
  return fade(Math.abs(x), DETAIL_FULL_TO, DETAIL_GONE_AT);
}

// ── destruction gradient ────────────────────────────────────────────────
// The brief's 5 / 20 / 50 km stops, in km, converted through the axis rather
// than transcribed as world-X numbers that could silently stop meaning those
// distances. `damageIntensity` returns 1 at the line, tapering to a small
// residual past 150 km (never quite 0) so an "occasional destroyed key
// infrastructure" placement out in the intact zone still reads as plausible.
const DESTRUCTION_KM = [0, 5, 20, 50, 150];
const DESTRUCTION_X = DESTRUCTION_KM.map((km) => worldXFor("side_b", km));
const DESTRUCTION_V = [1, 0.82, 0.42, 0.14, 0.02];

export function damageIntensity(x: number): number {
  const d = Math.abs(x);
  if (d >= DESTRUCTION_X[DESTRUCTION_X.length - 1]) return DESTRUCTION_V[DESTRUCTION_V.length - 1];
  for (let i = 0; i < DESTRUCTION_X.length - 1; i++) {
    const x0 = DESTRUCTION_X[i];
    const x1 = DESTRUCTION_X[i + 1];
    if (d <= x1) {
      const t = smooth((d - x0) / (x1 - x0));
      return DESTRUCTION_V[i] + (DESTRUCTION_V[i + 1] - DESTRUCTION_V[i]) * t;
    }
  }
  return DESTRUCTION_V[DESTRUCTION_V.length - 1];
}

// ── field / belt pattern constants ───────────────────────────────────────
// Pass 17 derived these from `scripts/analyze-osm-patterns.mjs` against
// data/osm/pokrovsk.json: a measured windbreak orientation (~157.5°) and a
// measured parcel-to-row size ratio (0.486). Pass 24 restated them in metres.
//
// **Pass 25 keeps the Z frequencies and re-derives the X ones**, and the
// reason is worth stating rather than burying: the OSM ratio was measured on
// real ground, where both axes are metres. Z still is. X is now zone-relative
// depth, compressed roughly 17× inside The Line — so carrying the measured X
// frequency across unchanged would draw parcels seventeen times too long in
// the one direction the viewer can most easily compare against the 7 m
// vehicle standing on them. The X frequencies below are chosen so the pattern
// reads at roughly the same on-screen scale in both axes; the measured
// ORIENTATION and RATIO are preserved in Z and in props.ts's row spacing,
// which is where they were measured and where they still mean something.
/** Field-cell noise frequency along X, per world metre (≈450 m period). */
export const FIELD_CELL_X_FREQ = 0.002_22;
/** Companion frequency across Z, per real metre (≈555 m period) — the
 *  measured parcel scale, unchanged. */
export const FIELD_CELL_Z_FREQ = 0.001_80;
/** Windbreak-belt frequency along X, per world metre (≈530 m period). */
export const BELT_X_FREQ = 0.001_90;
/** Companion z-frequency for the same belt pattern (≈880 m period) —
 *  measured, unchanged. */
export const BELT_Z_FREQ = 0.001_13;

// ── coastal basin (Black Sea, side_b deep rear only) ────────────────────
// Pass 25 moved the shoreline out from 258/460 km to 300/560 km, for a
// content reason rather than an aesthetic one: side_b's three naval assets
// sit at 350, 440 and 480 km, and the shoreline has to start inshore of the
// first of them and finish outboard of the last, or the Black Sea Fleet ends
// up parked on dry steppe. The port landmark at 262 km stays on land, which
// is where a port is.
//
// The other change is what it costs. Under the old compressed axis this whole
// feature lived where 200 real km was under 3 km of world extent — a
// silhouette. In the Strategic Rear zone it is a first-class feature covering
// a real fraction of the zone, so the zone's dressing has to keep both the
// inshore and the offshore halves populated.
export const COAST_KM0 = 300;
export const COAST_KM1 = 560;
export const COAST_X0 = worldXFor("side_b", COAST_KM0);
export const COAST_X1 = worldXFor("side_b", COAST_KM1);
export const COAST_DEPTH = 60;
export const WATER_LEVEL_Y = -18;

/** How far below the undepressed terrain height (x, z) sits, 0 on dry land,
 *  ramping smoothly to COAST_DEPTH once past the (wobbled) shoreline. */
function coastalDepression(x: number, z: number): number {
  if (x <= COAST_X0 - 2_000) return 0;
  // A low-frequency wobble so the shoreline isn't a razor-straight cliff.
  const wobble = (valueNoise(z * 0.000_55, 3.5, 41) - 0.5) * 700;
  const start = COAST_X0 + wobble;
  const end = COAST_X1 + wobble;
  if (x <= start) return 0;
  const t = smooth(THREE.MathUtils.clamp((x - start) / (end - start), 0, 1));
  return t * COAST_DEPTH;
}

// ── river (crosses the front — Pass 17 item 4) ────────────────────────────
// Runs along Z (crossing the strip, not along it) at a wobbling X on the zero
// line itself — a front that runs along a major river, which is the Kherson
// configuration and the reason this feature exists.
//
// Sized against the roster, and Pass 25 had to resize it. Under the old axis
// the channel was 1.2 km bank to bank centred 300 m onto side_b's ground,
// with the nearest asset 1.2 real km = 1,200 world units away, so it could
// not reach anything. Under the zone model the nearest asset sits at
// `LINE_INNER_INSET_M` = 170 world metres from the line, and the old channel
// would have drowned roughly a third of both sides' Line-zone rosters. The
// channel is now 250 m of world bank-to-bank, entirely inside the 340 m
// asset-free corridor the two inner insets reserve, and the destroyed bridge
// and pontoon crossing that make it legible are unchanged.
export const RIVER_CENTER_X = 0;
export const RIVER_HALF_WIDTH = 125;
export const RIVER_DEPTH = 15;
export const RIVER_WATER_LEVEL_Y = -11;

/** Wobbling channel centre — same low-frequency-noise shoreline technique
 *  coastalDepression() uses, applied along Z since this channel runs the
 *  other way across the strip. */
export function riverCenterAt(z: number): number {
  return RIVER_CENTER_X + (valueNoise(z * 0.000_52, 91.5, 53) - 0.5) * 900;
}

/** How far below the undepressed terrain (x, z) sits inside the river
 *  channel, 0 outside it. Same smooth falloff shape as coastalDepression. */
function riverDepression(x: number, z: number): number {
  const d = Math.abs(x - riverCenterAt(z));
  if (d >= RIVER_HALF_WIDTH) return 0;
  return smooth(1 - d / RIVER_HALF_WIDTH) * RIVER_DEPTH;
}

/** True wherever the coastal basin or the river genuinely holds water.
 *  props.ts's scatter and scenery.ts's near-line dressing both skip
 *  instancing here, so a tree, crater or trench segment never lands
 *  underwater. The threshold is a small margin past the visible shoreline so
 *  a prop's own footprint doesn't overhang the bank. */
export function isInWater(x: number, z: number): boolean {
  return coastalDepression(x, z) > 1 || riverDepression(x, z) > 1;
}

/**
 * Ground height at a world (x, z), in metres above mean ground.
 *
 * Deliberately low-amplitude: the front this depicts is open rolling steppe,
 * and inventing mountains to make a 3D view look dramatic would be the same
 * dishonesty the terrain-exaggeration note called out in Pass 4. Relief here
 * is ridges and shallow draws of a few tens of metres over kilometres, plus
 * the one feature that genuinely dominates the ground near the line — churn —
 * plus the coastal basin (Pass 10) and the river (Pass 17).
 */
export function terrainHeight(x: number, z: number): number {
  const f = groundFidelity(x);

  // Three octaves, all of them everywhere. ~2.9 km / ~770 m / ~167 m
  // wavelengths against a 19.2 km-wide world, which puts roughly six broad
  // ridges across the whole depth and real texture inside every zone.
  const broad = valueNoise(x * 0.000_35, z * 0.000_35, 1) * 46;
  const mid = valueNoise(x * 0.001_3, z * 0.001_3, 7) * 15 * f;
  const fine = valueNoise(x * 0.006, z * 0.006, 13) * 4 * f;
  let h = broad + mid + fine - 30;

  // A shallow draw running across the strip — the kind of feature that
  // actually dictates covered approach routes on ground like this.
  h -= Math.exp(-Math.pow((z - 1_500) / 1_300, 2)) * 13 * f;

  // The zero-line scar: ground churned by sustained fires. Its width is
  // authored in WORLD metres, not real ones — 480 m of world either side of
  // the line, which under The Line zone's own mapping stands for the first
  // ~8 km of real ground. Pass 24 had this at 2,600 m against an axis where
  // that meant 2.6 real km; carried over unchanged it would have churned the
  // entire Line zone flat.
  const scar = Math.exp(-Math.pow(x / 480, 2));
  h -= scar * 14;
  h += scar * (valueNoise(x * 0.005_5, z * 0.005_5, 29) - 0.5) * 22 * f;

  // Coastal basin — carves the Black Sea inlet on the side_b deep rear.
  h -= coastalDepression(x, z);

  // The river — carves the channel crossing the front (Pass 17).
  h -= riverDepression(x, z);

  return h;
}

// ── zone character (Pass 25) ─────────────────────────────────────────────
/**
 * Per-zone ground tint. This is what replaces the retired fidelity gradient:
 * crossing a transition should read as arriving somewhere with a different
 * character, not as detail draining away toward a horizon.
 *
 *   The Line          churned, scorched, low-value olive-brown — years of
 *                     fires on the same ground.
 *   Operational Depth working agricultural steppe, drier and lighter; damaged
 *                     in places, farmed in others.
 *   Strategic Rear    greener and more intact, because most of it is — which
 *                     is exactly why the things that ARE struck out here read
 *                     as deliberate rather than incidental.
 */
const ZONE_GROUND_TINT: Record<string, THREE.Color> = {
  line: new THREE.Color("#4b4632"),
  depth: new THREE.Color("#6d6746"),
  rear: new THREE.Color("#57683f"),
};
const ZONE_TINT_STRENGTH = 0.34;

/** Neutral slate the transition seam is painted in — deliberately NOT a
 *  landscape colour. A reader should be able to tell at a glance that the
 *  seam is a piece of cartography rather than a river, a road or a boundary
 *  anything is defending.
 *
 *  The first attempt at this was a smooth light-grey band and it read,
 *  unmistakably, as a motorway — which is the worst possible outcome for a
 *  feature whose entire job is to say "this is not a thing on the ground".
 *  What fixes it is DASHING: nothing in a landscape is dashed, so a dashed
 *  band can only be read as a drawn mark. The band is also darker than the
 *  ground now rather than lighter, so it recedes instead of leading the eye
 *  along itself the way a road does. */
const COLOR_SEAM = new THREE.Color("#20242c");
const COLOR_SEAM_EDGE = new THREE.Color("#98a2b4");
/** Dash period and duty across the strip, metres. 620 m on / 300 m off is
 *  coarse enough to survive the whole-world framing, where the gap is only
 *  ~20 px wide, and fine enough to read as a dash rather than as a gap in the
 *  ground at a single-zone framing. */
const SEAM_DASH_PERIOD_M = 920;
const SEAM_DASH_ON_M = 620;

/** 1 on a dash, 0 in the gap between dashes. Keyed on Z so the dashes run
 *  across the strip the way the seam does. */
export function zoneSeamDash(z: number): number {
  const t = ((z % SEAM_DASH_PERIOD_M) + SEAM_DASH_PERIOD_M) % SEAM_DASH_PERIOD_M;
  return t < SEAM_DASH_ON_M ? 1 : 0;
}
/** Feather either side of a gap, world metres. Small — the seam must read as
 *  an edit to the map, not as a gradient in the ground. */
const SEAM_FEATHER_M = 40;

/**
 * 1 inside a zone transition gap, 0 outside it, feathered by SEAM_FEATHER_M.
 * Exported so scenery.ts's transition markers stand exactly where the ground
 * changes colour rather than approximately near it.
 */
export function zoneSeam(x: number): number {
  const d = Math.abs(x);
  for (const gap of ZONE_GAPS) {
    if (d >= gap.startM - SEAM_FEATHER_M && d <= gap.endM + SEAM_FEATHER_M) {
      if (d >= gap.startM && d <= gap.endM) return 1;
      const off = d < gap.startM ? gap.startM - d : d - gap.endM;
      return 1 - smooth(off / SEAM_FEATHER_M);
    }
  }
  return 0;
}

/** 1 exactly on a gap's two edges, falling off over ~55 m — the bright rule
 *  that makes the seam legible from a low camera where the flat painted band
 *  is nearly edge-on. Dashed (zoneSeamDash) and deliberately restrained: the
 *  first tuning was a solid 0.75 lerp over 55 m and read as lit runway
 *  markings, which is a road by another name. */
export function zoneSeamEdge(x: number): number {
  const d = Math.abs(x);
  let best = 0;
  for (const gap of ZONE_GAPS) {
    for (const edge of [gap.startM, gap.endM]) {
      const off = Math.abs(d - edge);
      if (off < 32) best = Math.max(best, 1 - smooth(off / 32));
    }
  }
  return best;
}

const COLOR_GROUND_LOW = new THREE.Color("#4c4a34");
const COLOR_GROUND_HIGH = new THREE.Color("#6f6b48");
const COLOR_SCAR = new THREE.Color("#3a352b");
const COLOR_A = new THREE.Color("#3f5068");
const COLOR_B = new THREE.Color("#65403c");
const COLOR_SCORCHED = new THREE.Color("#2a2620");
// Pass 25 pushed these apart. A parcel patchwork is the only thing carrying
// ground legibility in the open field between shelterbelts at a 1-3 km
// framing, and at the old separation the two tones were within a few percent
// of each other once the elevation ramp and the zone tint had been applied on
// top — measured on a screenshot, where the result read as one flat olive.
const COLOR_FIELD_DRY = new THREE.Color("#9a8b42");
const COLOR_FIELD_GREEN = new THREE.Color("#4e7336");
const COLOR_WATER_SHALLOW = new THREE.Color("#3d7078");
const COLOR_WATER_DEEP = new THREE.Color("#122430");

/**
 * The haze colour everything fades into — the same value the sky gradient
 * meets the ground at (see buildSky), which is what makes the horizon read as
 * atmosphere rather than as the edge of a plate. Exported so the sky and the
 * fog cannot drift apart from it.
 */
export const HORIZON_COLOR = new THREE.Color("#161d29");

/**
 * Atmospheric haze as a function of position, 0 (clear) → 1 (fully hazed).
 *
 * Deliberately *not* three.js fog, which is keyed on distance from the camera.
 * With the yaw lock (Pass 24) the camera looks across the depth axis, so
 * camera distance and depth are close to uncorrelated — a distance fog would
 * haze the near ground at the left and right of frame just as hard as the
 * deep rear behind it, which is the opposite of the cue wanted. This is keyed
 * on the axis itself: depth hazes, and the lateral plate edges haze on the
 * same curve so the strip reads as a sector inside a larger landscape rather
 * than as a floating tile. Camera fog is still enabled on top, doing the
 * ordinary job of separating near from far along the view direction.
 */
/**
 * Depth haze, per zone. There is no compression to key on any more, and there
 * is a hard constraint that did not exist before: **no zone may read as empty
 * or safe.** Pass 24's curve reached 0.98 at the deepest rear, which is a
 * perfectly good way of saying "the geography out here is not real" and a
 * perfectly terrible way of saying "an active long-range campaign is being
 * fought here". So the haze is now a light, per-zone depth cue that tops out
 * at HAZE_DEPTH_MAX and never hides the ground.
 */
const HAZE_DEPTH_MAX = 0.3;
/** Where the lateral fade begins and ends, metres. It begins outside the
 *  represented sector — inside the sector the ground is a place and must look
 *  like one — and is complete short of where the terrain actually stops
 *  (TERRAIN_HALF_Z), so the plate's real edge is fully dissolved before it is
 *  reached rather than merely faint at it. */
const HAZE_Z_START = 7_000;
const HAZE_Z_FULL = 15_000;
export function atmosphericHaze(x: number, z: number): number {
  // Depth haze is now a function of position along the axis, scaled so it is
  // 0 at the zero line and HAZE_DEPTH_MAX at the outer edge of the deepest
  // zone. Squared so the near two zones stay almost perfectly clear and the
  // build-up is concentrated where the ground genuinely is furthest away.
  const t = THREE.MathUtils.clamp(Math.abs(x) / HALF_EXTENT_M, 0, 1);
  const depth = HAZE_DEPTH_MAX * t * t;
  const lateral = THREE.MathUtils.clamp(
    (Math.abs(z) - HAZE_Z_START) / (HAZE_Z_FULL - HAZE_Z_START),
    0,
    1,
  );
  // The lateral term still has to reach a true 1.0 at its own limit: anything
  // short of that leaves a few percent of lit ground colour at the plate's cut
  // edge, and a few percent is enough to draw that edge as a line against the
  // sky. It is raised to a power rather than smoothstepped — smoothstep is
  // steepest at its midpoint, and from a low camera the whole fade band
  // collapses into a few degrees of screen, which turns a gradient into a
  // visible diagonal. A gentle power curve spends most of its travel out where
  // the ground is already far away.
  //
  // Past the deepest zone the terrain overrun hazes out on the same curve, so
  // the world ends in atmosphere in all four directions rather than on a cut.
  const overrun = THREE.MathUtils.clamp(
    (Math.abs(x) - HALF_EXTENT_M) / Math.max(1, TERRAIN_X_OVERRUN),
    0,
    1,
  );
  return Math.min(1, Math.max(depth, Math.pow(lateral, 1.6), Math.pow(overrun, 1.4)));
}

/**
 * A MeshStandardMaterial that fades to HORIZON_COLOR by a per-vertex haze
 * amount, applied AFTER lighting.
 *
 * The first attempt did this in the vertex colour, and it did not work: the
 * ground is lit, so a hazed vertex colour is still multiplied by the sun and
 * the hemisphere term and lands somewhere either side of the sky it is
 * supposed to be dissolving into. The plate's far edge stayed visible as a
 * lighter trapezoid against a darker sky — precisely the hard-edged cut this
 * pass exists to remove — and the water plane, being near-specular, was worse.
 * Haze is atmosphere in front of a surface, so it has to be applied to the
 * outgoing light, not to the albedo. Six lines of onBeforeCompile, injected
 * right after <opaque_fragment> so it is still in linear space before
 * tonemapping and the colour-space transform.
 */
export function hazedStandardMaterial(
  params: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHorizon = { value: HORIZON_COLOR };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "attribute float aHaze;\nvarying float vHaze;\n#include <common>")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHaze = aHaze;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "uniform vec3 uHorizon;\nvarying float vHaze;\n#include <common>")
      .replace(
        "#include <opaque_fragment>",
        "#include <opaque_fragment>\ngl_FragColor.rgb = mix( gl_FragColor.rgb, uHorizon, clamp( vHaze, 0.0, 1.0 ) );",
      );
  };
  mat.customProgramCacheKey = () => "depth-haze";
  return mat;
}

/**
 * X sample positions for the terrain grid, graded so vertex density follows
 * the near register rather than being spread evenly over an axis that is 57%
 * true scale and 43% logarithm.
 *
 * `|t|^GRADE` concentrates samples toward the zero line. Pass 25 softened it
 * from 1.7 to 1.25: the axis is 19.2 km wide now rather than 140, so uniform
 * sampling would already be ~48 m and the aggressive grade was starving the
 * two outer zones to buy resolution the near one did not need. At 1.25 the
 * spacing runs ~12 m at the line to ~60 m at the outer edge of the terrain
 * overrun, which resolves every octave in terrainHeight() everywhere — which
 * is the precondition for retiring the fidelity gradient at all.
 */
const TERRAIN_GRADE = 1.25;
function gradedX(segments: number, halfX: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 - 1;
    xs.push(Math.sign(t) * halfX * Math.pow(Math.abs(t), TERRAIN_GRADE));
  }
  return xs;
}

/**
 * Builds the terrain mesh. Vertex-coloured rather than textured: a flat-shaded
 * facet palette is the whole visual language here, and it costs one geometry
 * instead of a texture fetch.
 *
 * Hand-built rather than a PlaneGeometry as of Pass 24 — PlaneGeometry can
 * only segment uniformly, and uniform segmentation on this axis would spend
 * as many vertices on the 4,000 km nobody can resolve as on the 5 km that is
 * the subject of the tool.
 */
export function buildTerrain(halfWidthX: number): THREE.Mesh {
  const segX = 520;
  // 520 x 140 = 73k vertices / 145k triangles for the whole ground. Both
  // counts are graded (see gradedX and the zs loop) so the density is spent
  // inside the represented sector rather than on the hazed lateral filler.
  const segZ = 140;
  const halfZ = TERRAIN_HALF_Z;
  const xs = gradedX(segX, halfWidthX);
  // Z is graded the same way X is, and for the same reason: the sector is
  // 6 km either side and the ground runs to 16, so a uniform grid would spend
  // over half its vertices on deliberately-hazed ground. `^1.8` puts ~90 m
  // spacing inside the sector and ~500 m at the outer edge.
  const zs: number[] = [];
  for (let i = 0; i <= segZ; i++) {
    const t = (i / segZ) * 2 - 1;
    zs.push(Math.sign(t) * halfZ * Math.pow(Math.abs(t), 1.8));
  }

  const nx = segX + 1;
  const nz = segZ + 1;
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const haze = new Float32Array(nx * nz);
  const indices: number[] = [];
  const c = new THREE.Color();

  for (let iz = 0; iz < nz; iz++) {
    const z = zs[iz];
    for (let ix = 0; ix < nx; ix++) {
      const x = xs[ix];
      const i = iz * nx + ix;
      const h = terrainHeight(x, z);
      positions[i * 3] = x;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = z;

      // Elevation ramp first, then the side tint, then a loose field
      // patchwork on dry mid/far ground, then damage/scar tint, then the
      // water tints. Haze is NOT in this stack — it is air in front of the
      // ground, so it is a per-vertex amount consumed after lighting (see
      // hazedStandardMaterial), not a paint layer on the albedo.
      const t = THREE.MathUtils.clamp((h + 34) / 68, 0, 1);
      c.copy(COLOR_GROUND_LOW).lerp(COLOR_GROUND_HIGH, t);

      const sideMix = THREE.MathUtils.clamp(Math.abs(x) / (halfWidthX * 0.55), 0, 1) * 0.32;
      c.lerp(x < 0 ? COLOR_A : COLOR_B, sideMix);

      const dmg = damageIntensity(x);
      // Parcel patchwork. Two octaves, and it no longer switches off over the
      // fought-over ground near the line.
      //
      // It used to vanish entirely at dmg >= 0.5, which left the whole
      // near-register band — the part of the map anyone actually reads — a
      // single flat olive tone. That was invisible before Pass 24 because the
      // band was a few hundred world units wide; at 1 unit = 1 m it is tens of
      // kilometres of unbroken colour, and it is the main reason the ground
      // reads as "no terrain features" at the km-scale zooms this tool is used
      // at. Individual props cannot fill that gap: a 0.22 m trunk is sub-pixel
      // beyond ~250 m of camera distance, measured, so at these ranges tonal
      // variation in the ground itself is the only thing that can carry it.
      //
      // Churned ground still reads as churned — the patchwork is damped by
      // damage rather than cut, and the scar/scorch layers below still paint
      // over the top of it.
      const cellA = valueNoise(x * FIELD_CELL_X_FREQ, z * FIELD_CELL_Z_FREQ, 61);
      const cellB = valueNoise(x * FIELD_CELL_X_FREQ * 2.7, z * FIELD_CELL_Z_FREQ * 2.7, 131);
      const fieldMix = (1 - dmg * 0.6) * 0.55;
      c.lerp(cellA > 0.5 ? COLOR_FIELD_DRY : COLOR_FIELD_GREEN, Math.max(0, fieldMix));
      // Finer second octave, half strength — breaks the ~1.6 km parcels into
      // something that still varies inside one screen at a 2-4 km framing.
      c.lerp(cellB > 0.5 ? COLOR_FIELD_DRY : COLOR_FIELD_GREEN, Math.max(0, fieldMix * 0.45));

      // Zone character. Applied after the field patchwork so the parcels
      // survive inside it, and before the scar/scorch layers so churned
      // ground still overrides everything.
      const zoneTint = ZONE_GROUND_TINT[zoneAtSaturating(x).id];
      if (zoneTint) c.lerp(zoneTint, ZONE_TINT_STRENGTH);

      // Scar tint. Authored in WORLD metres like the scar in terrainHeight —
      // 700 m either side of the line, standing for roughly the first 12 km
      // of real ground. Carried over from Pass 24's 2,400 unchanged it would
      // have painted most of The Line zone one flat churned tone.
      const scar = Math.exp(-Math.pow(x / 700, 2));
      c.lerp(COLOR_SCAR, scar * 0.75);
      c.lerp(COLOR_SCORCHED, dmg * 0.5);

      // The transition seam, painted last on the ground layer: a flat neutral
      // band with a bright rule on each edge. Deliberately visible — the
      // brief's words are "not blended, not hidden".
      const seam = zoneSeam(x);
      if (seam > 0) c.lerp(COLOR_SEAM, seam * 0.7);
      const seamEdge = zoneSeamEdge(x) * zoneSeamDash(z);
      if (seamEdge > 0) c.lerp(COLOR_SEAM_EDGE, seamEdge * 0.42);

      const depression = coastalDepression(x, z);
      if (depression > 0.5) {
        c.lerp(COLOR_WATER_SHALLOW, Math.min(1, (depression / COAST_DEPTH) * 1.6));
      }
      const riverWet = riverDepression(x, z);
      if (riverWet > 0.5) {
        c.lerp(COLOR_WATER_SHALLOW, Math.min(1, (riverWet / RIVER_DEPTH) * 1.6));
      }

      haze[i] = atmosphericHaze(x, z);

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }

  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const cIdx = a + nx;
      const d = cIdx + 1;
      // Winding chosen so the face normal points +Y (the camera is above).
      indices.push(a, cIdx, b, b, cIdx, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aHaze", new THREE.BufferAttribute(haze, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = hazedStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.96,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.name = "terrain";
  return mesh;
}

// ── sky (Pass 24) ─────────────────────────────────────────────────────────
/**
 * The horizon, art-directed. With yaw locked there are exactly two of them —
 * the compressed fade toward each side's rear — and until this pass both
 * ended in flat black void, because a hard-edged plate with nothing behind it
 * is what you get when the scene has no principled extent.
 *
 * One inverted sphere, vertex-coloured on a vertical gradient: deep at the
 * zenith, meeting HORIZON_COLOR exactly at local y = 0 so terrain haze and sky
 * are the same colour where they touch and the seam disappears. One draw call,
 * no texture, no shader — the same authored-primitive discipline as everything
 * else in the scene.
 *
 * The sphere is centred on the CAMERA each frame, not on the world, which
 * makes the gradient's meeting point sit at eye level. That is not a
 * convenience: for a flat ground plane the true horizon IS at eye level, at
 * every altitude, so a camera-centred gradient is the correct one and a
 * world-centred one drifts wrong the moment the camera climbs.
 */
const COLOR_ZENITH = new THREE.Color("#080b12");
const COLOR_BELOW = new THREE.Color("#0b0f16");

export function buildSky(): THREE.Mesh {
  // Unit radius: the caller scales and repositions this onto the camera every
  // frame (see Scene3D's tick). A sky is infinitely far away, so pinning it to
  // a world radius is the wrong model and — at this scene's scale — an
  // expensive wrong model: a 320 km sphere forces the far plane out past it,
  // and a far/near ratio that large is what destroys depth precision for the
  // 7 m vehicles at the other end of the range.
  const radius = 1;
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const yN = pos.getY(i) / radius; // −1 … 1
    if (yN >= 0) {
      // A steep curve: the gradient does most of its work in the lowest
      // fifth of the sky, which is where a real haze band actually sits.
      c.copy(HORIZON_COLOR).lerp(COLOR_ZENITH, smooth(Math.min(1, Math.pow(yN, 0.42))));
    } else {
      // Flat HORIZON_COLOR below the horizon line, deliberately. Anything
      // darker down here gives the terrain plate's fully-hazed far edge
      // something to be visible against, which reintroduces exactly the hard
      // cut the haze exists to dissolve. COLOR_BELOW is kept as the value the
      // very bottom of the dome reaches, far below anything ever framed.
      c.copy(HORIZON_COLOR).lerp(COLOR_BELOW, smooth(Math.min(1, Math.max(0, -yN - 0.55) * 3)));
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // depthTest OFF and renderOrder far negative: the sky is painted first,
  // unconditionally, and never participates in depth at all. That is what
  // frees the depth range to be spent entirely on real geometry.
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky";
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

// ── water surface ─────────────────────────────────────────────────────────
/** Water gets the same after-lighting haze as the ground. It needs it more,
 *  not less: a near-specular surface out in the compressed register read as a
 *  bright smear against the horizon before this. */
function makeWaterMaterial(): THREE.MeshStandardMaterial {
  // Roughness was 0.18 when the whole scene was 350 units across and the
  // river was 12 of them. At true scale a near-mirror surface 1.2 km wide
  // catches the sun as a hard white band across the front — measured, not
  // guessed: it is the brightest thing in the frame in the pre-fix
  // screenshots. 0.5 keeps a sheen without the specular sheet.
  return hazedStandardMaterial({
    color: "#1c3946",
    vertexColors: true,
    flatShading: true,
    roughness: 0.5,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9,
  });
}

export function buildWater(halfWidthX: number): THREE.Mesh | null {
  const nearX = COAST_X0 + 1_200; // inland of the shoreline wobble — always wet
  const farX = Math.max(nearX + 1_000, halfWidthX + 1_000);
  const width = farX - nearX;
  const geo = new THREE.PlaneGeometry(width, TERRAIN_HALF_Z * 2, 16, 24);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const haze = new Float32Array(pos.count);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const localX = pos.getX(i);
    const t = THREE.MathUtils.clamp((localX + width / 2) / width, 0, 1);
    c.copy(COLOR_WATER_SHALLOW).lerp(COLOR_WATER_DEEP, t);
    const wx = localX + nearX + width / 2;
    haze[i] = atmosphericHaze(wx, pos.getZ(i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    pos.setX(i, wx);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aHaze", new THREE.BufferAttribute(haze, 1));
  geo.computeVertexNormals();

  const mat = makeWaterMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, WATER_LEVEL_Y, 0);
  mesh.name = "water";
  return mesh;
}

// ── river water (Pass 17 item 4) ──────────────────────────────────────────
// A winding ribbon rather than a rotated PlaneGeometry — the channel's centre
// wobbles with Z (riverCenterAt()), so a flat rectangle can't follow it. One
// indexed BufferGeometry, one draw call.
export function buildRiverWater(): THREE.Mesh {
  const steps = 96;
  const zMin = -TERRAIN_HALF_Z;
  const zMax = TERRAIN_HALF_Z;
  const positions: number[] = [];
  const colors: number[] = [];
  const hazes: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  // Slightly inset from the carved bank so the visible water sits inside the
  // depression rather than exactly on its (already-smooth) edge.
  const halfW = RIVER_HALF_WIDTH * 0.82;

  for (let i = 0; i <= steps; i++) {
    const z = zMin + (i / steps) * (zMax - zMin);
    const center = riverCenterAt(z);
    positions.push(center - halfW, RIVER_WATER_LEVEL_Y, z, center + halfW, RIVER_WATER_LEVEL_Y, z);
    c.copy(COLOR_WATER_SHALLOW).lerp(COLOR_WATER_DEEP, 0.55);
    const hz = atmosphericHaze(center, z);
    hazes.push(hz, hz);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i > 0) {
      const prevLeft = (i - 1) * 2;
      const prevRight = prevLeft + 1;
      const curLeft = i * 2;
      const curRight = curLeft + 1;
      // Winding chosen so the cross product faces +Y (docs/DECISIONS.md
      // Pass 17) — a hand-built ribbon sets no normals for us.
      indices.push(prevLeft, curRight, prevRight, prevLeft, curLeft, curRight);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("aHaze", new THREE.Float32BufferAttribute(hazes, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = makeWaterMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "river-water";
  return mesh;
}

/** Exported for the scatter loops, which need "how many metres is a km"
 *  without importing zones.ts themselves. */
export { METRES_PER_KM };
