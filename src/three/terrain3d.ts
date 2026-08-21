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
// ── What Pass 24 changed ─────────────────────────────────────────────────
// Every length in this file is now a METRE (depthAxis.ts: 1 world unit = 1 m)
// and every X threshold is stated in km and converted through the axis, so a
// feature that is meant to sit 250 km out actually sits 250 km out instead of
// at whatever world-X a per-band pixel allocation happened to put it. The
// relief itself was retuned to real steppe: ridges of tens of metres over
// wavelengths of kilometres, where it used to be tens of "units" over ~80.
//
// terrainHeight() is still a pure (x, z) → number function with no
// `Projection` argument — that contract is what every other module's
// anchoring depends on, and it survives *better* now than before, because
// depthUnitsFor() is a constant of the build rather than something a band
// edit can move. The Pass 10 caveat that this file's thresholds "do not track
// live band edits" is retired: nothing tracks band edits any more, by design.
//
// ── Fidelity gradient (Pass 24, brief item B1) ───────────────────────────
// Detail fades with the compression, using the compression itself as the
// input rather than a distance ramp invented alongside it. The fine octave is
// gone by ~26 km-equivalent of squeeze, the mid octave by ~55; past that only
// broad landform silhouette survives. This is not only an aesthetic rule: the
// terrain mesh's own X sampling coarsens toward the rear (buildTerrain below
// grades it), so a high-frequency octave out there would alias, and anything
// standing on terrainHeight() would float. Detail that the mesh cannot
// resolve must not exist in the height function either.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { TERRAIN_HALF_Z, worldXFor } from "./worldMapping";
import { UNITS_PER_KM, compressionAtUnits } from "./depthAxis";

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

// ── the fidelity gradient ───────────────────────────────────────────────
/** Where each octave gives out, in world units. Stated as km through the
 *  axis so the intent is legible: the fine octave survives the whole
 *  drone-dense corridor and dies just past the true-scale boundary; the mid
 *  octave carries into the near far-register and dies where the squeeze
 *  passes ~50×. */
const DETAIL_FINE_FULL = worldXFor("side_b", 12);
const DETAIL_FINE_GONE = worldXFor("side_b", 55);
const DETAIL_MID_FULL = worldXFor("side_b", 40);
const DETAIL_MID_GONE = worldXFor("side_b", 320);

/** 1 where the ground is drawn as a place, 0 where it is a silhouette. Also
 *  read by props.ts and scenery.ts so scatter, dressing and landform all fade
 *  on one curve instead of three. */
export function groundFidelity(x: number): number {
  return fade(Math.abs(x), DETAIL_FINE_FULL, DETAIL_FINE_GONE);
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

// ── OSM-derived pattern constants (Pass 17 item 3) ────────────────────────
// Numbers below come from `scripts/analyze-osm-patterns.mjs` run against
// data/osm/pokrovsk.json — see docs/DECISIONS.md Pass 17 for the derivation.
// Pass 24 keeps the *ratios* (which is all the OSM data actually informs) and
// restates the base wavelengths in metres, where they finally have a real
// analogue: the field-cell wavelength below is ~1.6 km along the depth axis,
// which is the scale a parcel patchwork actually reads at.
/** Field-cell noise frequency along X, per metre (≈1.6 km wavelength). */
export const FIELD_CELL_X_FREQ = 0.000_63;
/** = FIELD_CELL_X_FREQ / 0.486 — real OSM parcels measure smaller, relative
 *  to the windbreak rows bordering them, than one isotropic frequency
 *  implies, so Z is scaled and X is not (unchanged ratio from Pass 17). */
export const FIELD_CELL_Z_FREQ = 0.001_30;
/** = 0.001_13 (props.ts's z-frequency) × tan(180° − 157.5°) — the
 *  x-frequency that makes the belt pattern's contour match the dominant
 *  orientation measured across Pokrovsk's real windbreak rows. Unchanged
 *  ratio, restated per metre. */
export const BELT_X_FREQ = 0.000_47;
/** Companion z-frequency for the same belt pattern (≈880 m wavelength). */
export const BELT_Z_FREQ = 0.001_13;

// ── coastal basin (Black Sea, side_b deep rear only) ────────────────────
// Stated in km now. The pre-Pass-24 world-X thresholds (126/140) worked out
// to roughly 258 km and 460 km under the old projection; those are the
// numbers carried forward, so the shoreline sits where it always meant to.
// Note this whole feature lives deep inside the compressed register, where
// 200 km of real distance is under 3 km of world extent — it is a silhouette
// out there, which is exactly what the fidelity rule says it should be.
export const COAST_KM0 = 258;
export const COAST_KM1 = 460;
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
// Runs along Z (crossing the strip, not along it) at a wobbling X near the
// zero line, biased slightly onto side_b's bank — the same near/far-bank
// asymmetry the real Kherson front has. At true scale the channel can finally
// be a real river: 1.2 km bank to bank, 18 m deep, which is Dnipro-class and
// was 12 m wide under the old unit convention.
//
// Sized against the actual roster the same way Pass 17 did it: the closest
// any asset sits to the line is 2 km either side = 2,000 units, so a channel
// whose half-width stays well under that can never put a real asset in the
// water.
export const RIVER_CENTER_X = 300;
export const RIVER_HALF_WIDTH = 600;
export const RIVER_DEPTH = 18;
export const RIVER_WATER_LEVEL_Y = -13;

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
  const ax = Math.abs(x);
  const fFine = fade(ax, DETAIL_FINE_FULL, DETAIL_FINE_GONE);
  const fMid = fade(ax, DETAIL_MID_FULL, DETAIL_MID_GONE);

  // Broad landform: ~2.9 km wavelength, ±23 m. Survives to the horizon —
  // this is the silhouette the far register keeps.
  const broad = valueNoise(x * 0.000_35, z * 0.000_35, 1) * 46;
  const mid = valueNoise(x * 0.001_3, z * 0.001_3, 7) * 15 * fMid;
  const fine = valueNoise(x * 0.006, z * 0.006, 13) * 4 * fFine;
  let h = broad + mid + fine - 30;

  // A shallow draw running across the strip — the kind of feature that
  // actually dictates covered approach routes on ground like this.
  h -= Math.exp(-Math.pow((z - 1_500) / 1_300, 2)) * 13 * fMid;

  // The zero-line scar: ground churned by sustained fires, dropping into a
  // shell-pocked belt a couple of km either side of the line.
  const scar = Math.exp(-Math.pow(x / 2_600, 2));
  h -= scar * 14;
  h += scar * (valueNoise(x * 0.005_5, z * 0.005_5, 29) - 0.5) * 22 * fFine;

  // Coastal basin — carves the Black Sea inlet on the side_b deep rear.
  h -= coastalDepression(x, z);

  // The river — carves the channel crossing the front (Pass 17).
  h -= riverDepression(x, z);

  return h;
}

const COLOR_GROUND_LOW = new THREE.Color("#4c4a34");
const COLOR_GROUND_HIGH = new THREE.Color("#6f6b48");
const COLOR_SCAR = new THREE.Color("#3a352b");
const COLOR_A = new THREE.Color("#3f5068");
const COLOR_B = new THREE.Color("#65403c");
const COLOR_SCORCHED = new THREE.Color("#2a2620");
const COLOR_FIELD_DRY = new THREE.Color("#8a7f42");
const COLOR_FIELD_GREEN = new THREE.Color("#5c7a3e");
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
/** How fast depth haze builds with the compression: haze is 0.5 where the
 *  axis compresses by HAZE_K. 25 puts the half-way point near 150 km, ~0.81
 *  at 500 km and ~0.98 at the deepest rear — heavy enough that the far
 *  register reads as atmosphere rather than as ground, gentle enough that the
 *  transition out of the true-scale register is not a wall. */
const HAZE_K = 25;
/** Where the lateral fade begins and ends, metres. It begins well outside the
 *  represented sector — inside the sector the ground is a place and must look
 *  like one — and is complete at 30 km, short of where the terrain actually
 *  stops (TERRAIN_HALF_Z, 32 km), so the plate's real edge is fully dissolved
 *  before it is reached rather than merely faint at it. An earlier tuning
 *  started the fade at 0.82 of the sector half-width and put visible fog
 *  across the near edge of the plate — the edge closest to the camera, which
 *  is the one place haze reads as a mistake. */
const HAZE_Z_START = 9_000;
const HAZE_Z_FULL = 30_000;
export function atmosphericHaze(x: number, z: number): number {
  // Depth haze is driven by the COMPRESSION, not by distance — the same input
  // the fidelity gradient uses, so "the air thickens exactly where the
  // geography stops being true" is a statement about the code. It is
  // identically zero throughout the true-scale register, which is what makes
  // the near ground read as a place: an earlier tuning started the fade at
  // 20 km and put 29% haze on ground that is drawn 1:1, i.e. hazed the one
  // part of the scene that has nothing to apologise for.
  const c = compressionAtUnits(x);
  const depth = (c - 1) / (HAZE_K + c - 1);
  const lateral = THREE.MathUtils.clamp(
    (Math.abs(z) - HAZE_Z_START) / (HAZE_Z_FULL - HAZE_Z_START),
    0,
    1,
  );
  // Depth is the dominant term and reaches opaque on its own at the deepest
  // rear — that IS the horizon. The lateral term only has to dissolve the
  // cut edge of the plate, so it tops out well short of it.
  // Both terms reach a true 1.0 at their own limit. Anything short of that
  // leaves a few percent of lit ground colour at the plate's cut edge, and a
  // few percent is enough to draw the edge as a line against the sky — which
  // is the whole artifact this is here to remove.
  // `lateral` is raised to a power rather than smoothstepped. smoothstep is
  // steepest at its midpoint, and from a low camera the whole 9-24 km fade
  // band collapses into a few degrees of screen — which turned a gradient
  // into a visible diagonal line across the ground. A gentle power curve
  // spends most of its travel out where the ground is already far away.
  return Math.min(1, Math.max(depth, Math.pow(lateral, 1.6)));
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
 * `|t|^GRADE` concentrates samples toward the zero line: ~26 m spacing at the
 * line, ~250 m at 20 km, ~450 m at the deepest rear. In *km* terms that last
 * figure is ~440 km per segment — the fidelity gradient, arrived at by the
 * geometry rather than asserted on top of it.
 */
const TERRAIN_GRADE = 1.7;
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
  // 520 x 116 = 60k vertices / 120k triangles for the whole ground. Both
  // counts are graded (see gradedX and the zs loop) so the density is spent
  // where the geography is true, not spread evenly over an axis that is 43%
  // logarithm and a strip that is 81% deliberately-hazed filler.
  const segZ = 116;
  const halfZ = TERRAIN_HALF_Z;
  const xs = gradedX(segX, halfWidthX);
  // Z is graded the same way X is, and for the same reason: the sector is
  // 6 km either side and the ground runs to 32, so a uniform grid would spend
  // four fifths of its vertices on deliberately-hazed ground. `^2.2` puts
  // ~120 m spacing inside the sector and ~1.4 km at the outer edge.
  const zs: number[] = [];
  for (let i = 0; i <= segZ; i++) {
    const t = (i / segZ) * 2 - 1;
    zs.push(Math.sign(t) * halfZ * Math.pow(Math.abs(t), 2.2));
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
      const fieldMix = (1 - dmg * 0.6) * 0.4;
      c.lerp(cellA > 0.5 ? COLOR_FIELD_DRY : COLOR_FIELD_GREEN, Math.max(0, fieldMix));
      // Finer second octave, half strength — breaks the ~1.6 km parcels into
      // something that still varies inside one screen at a 2-4 km framing.
      c.lerp(cellB > 0.5 ? COLOR_FIELD_DRY : COLOR_FIELD_GREEN, Math.max(0, fieldMix * 0.45));

      const scar = Math.exp(-Math.pow(x / 2_400, 2));
      c.lerp(COLOR_SCAR, scar * 0.75);
      c.lerp(COLOR_SCORCHED, dmg * 0.5);

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
 *  without importing depthAxis themselves. */
export const METRES_PER_KM = UNITS_PER_KM;
