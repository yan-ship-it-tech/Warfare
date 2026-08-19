// ─────────────────────────────────────────────────────────────────────────
// Synthetic stylized terrain strip.
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
// Pass 10 adds a destruction gradient and a coastal basin. Both are keyed on
// FIXED world-X thresholds authored against the shipped bands.json/domains.json
// projection at build time, not on a live `Projection` passed in at render
// time — same convention the zero-line scar just below already used. Bands
// are user-editable (see BandsEditorPanel); if this gradient chased every
// edit, terrainHeight() would need a `Projection` argument, and every other
// caller of it (props.ts, scenery.ts, Scene3D.tsx's pads/tethers/trenches)
// would silently start disagreeing about ground height the moment someone
// dragged a band slider mid-session. Fixed thresholds keep terrainHeight() a
// pure (x, z) -> number function, which is the thing every other module's
// anchoring depends on. See docs/DECISIONS.md Pass 10 for the flagged
// deviation this is — the brief describes the gradient in km, this reads it
// in the world-X those km map to under the *default* bands only.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { STRIP_HALF_Z } from "./worldMapping";

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

// ── destruction gradient ────────────────────────────────────────────────
// World-X equivalents of the brief's 5 / 20 / 50 km stops, computed once
// against the shipped bands.json + domains.json projection (side_b:
// worldXFor("side_b", 5|20|50, proj) ≈ 39 / 61 / 82 — symmetric on side_a).
// `damageIntensity` returns 1 at the line, tapering to a small residual
// beyond 50 km-equivalent (never quite 0) so an "occasional destroyed key
// infrastructure" placement out in the intact zone still reads as plausible
// rather than needing a special case.
const DESTRUCTION_X = [0, 39, 61, 82, 170];
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

// ── coastal basin (Black Sea, both sides' deep rear, wrapping toward the
//    front at one lateral flank) ─────────────────────────────────────────
// Pass 10 shipped this as x > 126 only — side_b's deep rear exclusively, a
// fixed rectangle glued to the far edge with no connection to the front.
// Two things wrong with that, both from the brief: (a) "both sides have
// Black Sea access" — the data already agrees (side_a fields three coastal
// USV/drone assets, MANTAS T-12/Sonobot-5/Magura V5, all `domain: "sea"`),
// but side_a had no water to put them on; (b) a coastline that only exists
// deep in the rear reads as disconnected from "operationally relevant,"
// which is specifically about the front having a coastal flank.
//
// Both fixed here, without touching a single existing asset's placement:
//  1. SYMMETRIC — depends on |x|, not x, so side_a's deep rear gets the same
//     basin side_b's already had. `COAST_X0`/`COAST_X1` are unchanged, so
//     every asset Pass 10 sited against them (side_b's power-plant strategic
//     target at x≈122 staying dry, the Black Sea Fleet vessels at x≈139/142
//     sitting in full-depth water) is untouched; side_a's mirror-image
//     equivalents land the same way.
//  2. AN INLET — the shoreline threshold is no longer a constant in x; it
//     dips from the baseline 126 down to `COAST_NEAR_X` (105) in a Gaussian
//     band centred on `COAST_INLET_Z`, so at that one lateral flank the
//     coast reaches meaningfully closer to the line — genuinely "wraps
//     toward the front" rather than sitting only at the far end.
//
//     105, not something closer to the line: chosen with a margin past
//     every currently-placed asset this checked against — side_a's own
//     near-shore drones (worldX ≈85–104), the Forward Distribution Hub
//     (worldX≈91.5) and the Integrated Air Defense C2 Network (worldX≈85)
//     all sit BELOW 105, so none of them end up standing in a depression
//     regardless of where lateralLayout's hash-spread happens to put their
//     Z. Pulling the inlet in far enough to actually reach those specific
//     assets — genuinely giving the sea-domain trio real water — would need
//     to know their Z ahead of a build that runs before they're placed, or
//     move their `distance_km_from_zero`, which is a data/placement change
//     this pass didn't make (that's Pass 15's "review every asset's
//     distance-from-front for doctrinal plausibility," not a terrain pass).
//     Flagged, not silently left, in docs/BACKLOG.md.
//
// `COAST_INLET_Z` is picked clear of every LANDMARKS entry that falls in the
// affected x-range on either side (scenery.ts) — see docs/DECISIONS.md
// Pass 14 for the checked list. Z carries no distance claim (file header,
// worldMapping.ts), so unlike the x-thresholds this is stylistic placement,
// not a number derived from anything real.
export const COAST_X0 = 126;
export const COAST_X1 = 140;
export const COAST_DEPTH = 9;
export const WATER_LEVEL_Y = -2.4;
export const COAST_NEAR_X = 105;
export const COAST_INLET_Z = 50;
export const COAST_INLET_SIGMA = 9;

/** How close the shoreline's start-of-depression threshold sits to the
 *  front at a given z — COAST_X0 away from the inlet, sweeping down to
 *  COAST_NEAR_X at its centre. Exported so buildWater() can shape the
 *  visible water mesh to the exact same curve; if the two ever drifted apart
 *  the glossy water surface would stop lining up with the tinted, depressed
 *  ground under it. */
export function coastThresholdAt(z: number): number {
  const pull = Math.exp(-Math.pow((z - COAST_INLET_Z) / COAST_INLET_SIGMA, 2));
  return COAST_X0 - (COAST_X0 - COAST_NEAR_X) * pull;
}

/** How far below the undepressed terrain height (x, z) sits, 0 on dry land,
 *  ramping smoothly to COAST_DEPTH once past the (wobbled) shoreline.
 *  Symmetric in x — see file header. */
function coastalDepression(x: number, z: number): number {
  const ax = Math.abs(x);
  const threshold = coastThresholdAt(z);
  if (ax <= threshold - 20) return 0;
  // A low-frequency wobble so the shoreline isn't a razor-straight cliff.
  const wobble = (valueNoise(z * 0.045, 3.5, 41) - 0.5) * 9;
  const start = threshold + wobble;
  const end = start + (COAST_X1 - COAST_X0);
  if (ax <= start) return 0;
  const t = smooth(THREE.MathUtils.clamp((ax - start) / (end - start), 0, 1));
  return t * COAST_DEPTH;
}

/**
 * Ground height at a world (x, z).
 *
 * Deliberately low-amplitude: the front this depicts is open rolling steppe,
 * and inventing mountains to make a 3D view look dramatic would be the same
 * dishonesty the terrain-exaggeration note called out in Pass 4. Relief here
 * is ridges and shallow draws, plus the one feature that genuinely dominates
 * the ground near the line — churn — and, past Pass 10, the coastal basin.
 */
export function terrainHeight(x: number, z: number): number {
  const broad = valueNoise(x * 0.012, z * 0.012, 1) * 5.2;
  const mid = valueNoise(x * 0.045, z * 0.045, 7) * 1.9;
  const fine = valueNoise(x * 0.16, z * 0.16, 13) * 0.5;
  let h = broad + mid + fine - 3.4;

  // A shallow draw running across the strip — the kind of feature that
  // actually dictates covered approach routes on ground like this.
  h -= Math.exp(-Math.pow((z - 18) / 14, 2)) * 1.5;

  // The zero-line scar: ground churned by sustained fires, dropping into a
  // shell-pocked belt a few km either side of the line.
  const scar = Math.exp(-Math.pow(x / 26, 2));
  h -= scar * 1.7;
  h += scar * (valueNoise(x * 0.55, z * 0.55, 29) - 0.5) * 2.6;

  // Coastal basin — carves the Black Sea inlet on the side_b deep rear.
  h -= coastalDepression(x, z);

  return h;
}

const COLOR_GROUND_LOW = new THREE.Color("#4c4a34");
const COLOR_GROUND_HIGH = new THREE.Color("#6f6b48");
const COLOR_SCAR = new THREE.Color("#3a352b");
const COLOR_A = new THREE.Color("#3f5068");
const COLOR_B = new THREE.Color("#65403c");
// Destruction-gradient tint: what "the ground itself looks fought-over"
// reads as, layered under the discrete crater/wreck/rubble props rather than
// standing in for them — see props.ts and scenery.ts for the objects.
const COLOR_SCORCHED = new THREE.Color("#2a2620");
// Field tint for the mid/far dry-land bands — a loose patchwork suggestion
// of cultivated ground rather than literal furrow geometry, matching the
// vertex-coloured aesthetic everything else here already uses.
const COLOR_FIELD_DRY = new THREE.Color("#8a7f42");
const COLOR_FIELD_GREEN = new THREE.Color("#5c7a3e");
const COLOR_WATER_SHALLOW = new THREE.Color("#3d7078");
const COLOR_WATER_DEEP = new THREE.Color("#122430");

/**
 * Builds the terrain mesh. Vertex-coloured rather than textured: a flat-shaded
 * facet palette is the whole visual language here, and it costs one geometry
 * instead of a texture fetch.
 */
export function buildTerrain(halfWidthX: number): THREE.Mesh {
  const segX = Math.min(360, Math.max(140, Math.round(halfWidthX * 1.1)));
  const segZ = 92;
  const geo = new THREE.PlaneGeometry(halfWidthX * 2, STRIP_HALF_Z * 2 + 40, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);

    // Elevation ramp first, then the side tint, then a loose field patchwork
    // on dry mid/far ground, then damage/scar tint on top, then the coastal
    // basin colour last — each layer has to be able to win over the one
    // before it, in the order that reads as "closest to the camera's actual
    // read of the ground."
    const t = THREE.MathUtils.clamp((h + 4) / 8, 0, 1);
    c.copy(COLOR_GROUND_LOW).lerp(COLOR_GROUND_HIGH, t);

    const sideMix = THREE.MathUtils.clamp(Math.abs(x) / 190, 0, 1) * 0.32;
    c.lerp(x < 0 ? COLOR_A : COLOR_B, sideMix);

    // Field patchwork: only where damage is already low (item 3's "fields")
    // — coarse cells so it reads as parcels, not noise.
    const dmg = damageIntensity(x);
    if (dmg < 0.5) {
      const cell = valueNoise(x * 0.05, z * 0.05, 61);
      const fieldMix = (1 - dmg * 2) * 0.4;
      c.lerp(cell > 0.5 ? COLOR_FIELD_DRY : COLOR_FIELD_GREEN, Math.max(0, fieldMix));
    }

    const scar = Math.exp(-Math.pow(x / 24, 2));
    c.lerp(COLOR_SCAR, scar * 0.75);
    // Broader scorch tint from the destruction gradient, independent of the
    // tight zero-line scar term above — this is what makes 5-20 km read as
    // "damaged" rather than just "near a slightly darker line."
    c.lerp(COLOR_SCORCHED, dmg * 0.5);

    // Wet-sand-to-shallow-water tint for the fringe between the shoreline
    // and the visible water plane's near edge (buildWater() below) — driven
    // by the actual depression amount, not inferred from final height (a
    // low broad-noise dip far from the coast must never read as wet).
    const depression = coastalDepression(x, z);
    if (depression > 0.05) {
      c.lerp(COLOR_WATER_SHALLOW, Math.min(1, depression / COAST_DEPTH * 1.6));
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
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

// ── water surface ─────────────────────────────────────────────────────────
// A separate, smoother-shaded plane sitting a fixed level above the carved
// basin floor — this is what actually reads as water rather than as a dark
// wet-looking dip in the same matte ground material. Sized to `halfWidthX`
// so its far edge always matches whatever terrain extent was actually
// generated, even though its near edge (the shoreline) is fixed — see the
// file header on why the shoreline itself doesn't track live band edits.
const WATER_MAT = new THREE.MeshStandardMaterial({
  color: "#1c3946",
  flatShading: true,
  roughness: 0.18,
  metalness: 0.05,
  transparent: true,
  opacity: 0.88,
});

/** One side's water surface. The near edge follows `coastThresholdAt(z)` —
 *  the SAME curve `coastalDepression()` carves into the terrain — row by
 *  row, rather than being a fixed-width rectangle: PlaneGeometry generates
 *  vertices at a normalised local x in [-0.5, 0.5] per row, and each row's
 *  local x is remapped through that row's own near/far span. Built from a
 *  unit-width PlaneGeometry for exactly that reason — a per-row width only
 *  has meaning once every row starts from the same [-0.5, 0.5] parameter
 *  range. Keeping this in lockstep with the depression is what stops the
 *  glossy water mesh sitting somewhere other than the tinted, carved ground
 *  under it once the shoreline stopped being a constant. */
function buildWaterSide(sign: 1 | -1, halfWidthX: number): THREE.Mesh {
  const farX = Math.max(COAST_X0 + 16 + 10, halfWidthX + 10);
  const rows = 40;
  const cols = Math.max(8, Math.round((farX - (COAST_NEAR_X + 16)) / 4));
  const zSpan = STRIP_HALF_Z * 2 + 20;
  const geo = new THREE.PlaneGeometry(1, zSpan, cols, rows);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const nearX = coastThresholdAt(z) + 16; // inland of the wobble — always wet
    const width = Math.max(1, farX - nearX);
    const t = pos.getX(i) + 0.5; // 0 at the shore, 1 at the far edge
    c.copy(COLOR_WATER_SHALLOW).lerp(COLOR_WATER_DEEP, THREE.MathUtils.clamp(t, 0, 1));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    pos.setX(i, sign * (nearX + t * width));
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = WATER_MAT.clone();
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, WATER_LEVEL_Y, 0);
  mesh.name = `water:${sign > 0 ? "side_b" : "side_a"}`;
  return mesh;
}

/** Both sides' Black Sea access — see the coastal-basin header above for why
 *  this is now two mirrored meshes instead of one. */
export function buildWater(halfWidthX: number): THREE.Group | null {
  const g = new THREE.Group();
  g.name = "water";
  g.add(buildWaterSide(1, halfWidthX));
  g.add(buildWaterSide(-1, halfWidthX));
  return g;
}
