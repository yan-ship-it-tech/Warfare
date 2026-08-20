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

// ── OSM-derived pattern constants (Pass 17 item 3) ────────────────────────
// Numbers below come from `scripts/analyze-osm-patterns.mjs` run against
// data/osm/pokrovsk.json, not from eyeballing a value that looked plausible
// — see docs/DECISIONS.md Pass 17 for the script's printed output and the
// exact derivation. This file's field-patchwork tint gets the block-size
// anisotropy; props.ts's `buildTrees()` belt banding gets the orientation
// (BELT_X_FREQ, re-exported for that file to import rather than duplicating
// the derivation there).
/** Field-cell noise frequency along X — unchanged from the pre-Pass-17
 *  isotropic 0.05, since only the anisotropy (the Z/X ratio) is what the OSM
 *  data actually informs; the base wavelength has no real-km analogue to
 *  derive it from (see the analysis script's header). */
export const FIELD_CELL_X_FREQ = 0.05;
/** = FIELD_CELL_X_FREQ / (median closed-ring √area ÷ median open-row length)
 *  = 0.05 / 0.486 ≈ 0.103 — real OSM parcels measure smaller, relative to the
 *  windbreak rows bordering them, than one isotropic frequency implies. */
export const FIELD_CELL_Z_FREQ = 0.103;
/** = 0.09 (props.ts's unchanged z-frequency) × tan(180° − 157.5°) ≈ 0.0373 —
 *  the x-frequency that makes the belt pattern's own contour line match the
 *  dominant orientation measured across Pokrovsk's real windbreak rows,
 *  instead of the un-derived 0.004 it shipped with before this pass. */
export const BELT_X_FREQ = 0.0373;

// ── coastal basin (Black Sea, side_b deep rear only) ────────────────────
// Same fixed-world-X convention as the destruction gradient above. Chosen so
// the existing side_b-strategic-target-power-plant asset (250 km, x≈122)
// stays dry with a margin, and the new Black Sea Fleet vessels this pass
// adds (440/480 km, x≈139/142) sit in full-depth water — see
// docs/DECISIONS.md Pass 10 for the worked numbers.
export const COAST_X0 = 126;
export const COAST_X1 = 140;
export const COAST_DEPTH = 9;
export const WATER_LEVEL_Y = -2.4;

/** How far below the undepressed terrain height (x, z) sits, 0 on dry land,
 *  ramping smoothly to COAST_DEPTH once past the (wobbled) shoreline. */
function coastalDepression(x: number, z: number): number {
  if (x <= COAST_X0 - 20) return 0;
  // A low-frequency wobble so the shoreline isn't a razor-straight cliff.
  const wobble = (valueNoise(z * 0.045, 3.5, 41) - 0.5) * 9;
  const start = COAST_X0 + wobble;
  const end = COAST_X1 + wobble;
  if (x <= start) return 0;
  const t = smooth(THREE.MathUtils.clamp((x - start) / (end - start), 0, 1));
  return t * COAST_DEPTH;
}

// ── river (crosses the front — Pass 17 item 4) ────────────────────────────
// Chosen over "wrap the coastal basin forward to meet the front", the other
// option the brief posed. A river crossing the contact line is far more
// characteristic of this specific war (Dnipro/Kherson) than extending the
// existing Black Sea inlet, and it explains *why* the front sits where it
// does rather than only decorating the deep rear — see docs/DECISIONS.md
// Pass 17 for the full reasoning. The existing coastal basin ~130+ world-X
// out is untouched: it isn't "the front," it's Pass 10's already-shipped
// Black Sea Fleet / port-harbor setting, and nothing here moves it.
//
// Runs along Z (crossing the strip, not along it) at a wobbling X near the
// zero line, biased slightly onto side_b's bank — the same near/far-bank
// asymmetry the real Kherson front has (Ukraine holding the near bank,
// Russia the far one). The offset and half-width were sized against the
// actual shipped roster, not guessed: the closest any current asset sits to
// the line is exactly 2 km on both sides (worldX ±18.83 under the default
// projection — docs/DECISIONS.md Pass 17), so a channel whose water width
// stays under ~16 world units can never put a real asset underwater.
export const RIVER_CENTER_X = 3;
export const RIVER_HALF_WIDTH = 6;
export const RIVER_DEPTH = 3.2;
export const RIVER_WATER_LEVEL_Y = -3;

/** Wobbling channel centre — same low-frequency-noise shoreline technique
 *  coastalDepression() already uses, applied along Z instead of X since this
 *  channel runs the other way across the strip. */
export function riverCenterAt(z: number): number {
  return RIVER_CENTER_X + (valueNoise(z * 0.05, 91.5, 53) - 0.5) * 10;
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
 *  underwater — a gap that existed for the coastal basin even before this
 *  pass (nothing previously excluded it either) and is fixed here as the
 *  same check now has two basins to guard instead of one. The 0.15
 *  threshold is a small margin past the visible shoreline so a prop's own
 *  footprint doesn't overhang the bank. */
export function isInWater(x: number, z: number): boolean {
  return coastalDepression(x, z) > 0.15 || riverDepression(x, z) > 0.15;
}

/**
 * Ground height at a world (x, z).
 *
 * Deliberately low-amplitude: the front this depicts is open rolling steppe,
 * and inventing mountains to make a 3D view look dramatic would be the same
 * dishonesty the terrain-exaggeration note called out in Pass 4. Relief here
 * is ridges and shallow draws, plus the one feature that genuinely dominates
 * the ground near the line — churn — and, past Pass 10, the coastal basin
 * and (Pass 17) the river.
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

  // The river — carves the channel crossing the front (Pass 17).
  h -= riverDepression(x, z);

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
    // — coarse cells so it reads as parcels, not noise. Frequencies are
    // anisotropic rather than a uniform 0.05/0.05: FIELD_CELL_Z_FREQ is
    // derived from data/osm/pokrovsk.json (scripts/analyze-osm-patterns.mjs)
    // rather than picked by eye — see docs/DECISIONS.md Pass 17 for the
    // worked numbers. Real closed parcels there measure smaller, relative to
    // the open windbreak rows bordering them, than a single isotropic
    // frequency implies; scaling Z alone (not X) makes the patchwork read
    // narrower crossing the strip laterally than running along the depth
    // axis, the same elongation props.ts's retuned belt orientation gives
    // the treeline bands — one consistent "which way the land is parcelled"
    // story between the two files instead of two unrelated guesses.
    const dmg = damageIntensity(x);
    if (dmg < 0.5) {
      const cell = valueNoise(x * FIELD_CELL_X_FREQ, z * FIELD_CELL_Z_FREQ, 61);
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
    // Same wet-fringe treatment for the river channel — a separate check
    // since it has its own depth scale and can be true where the coastal one
    // never is (they never overlap in practice, given how far apart they sit
    // in X, but each is independent so neither depends on that staying true).
    const riverWet = riverDepression(x, z);
    if (riverWet > 0.05) {
      c.lerp(COLOR_WATER_SHALLOW, Math.min(1, (riverWet / RIVER_DEPTH) * 1.6));
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

export function buildWater(halfWidthX: number): THREE.Mesh | null {
  const nearX = COAST_X0 + 16; // inland of the shoreline wobble — always wet
  const farX = Math.max(nearX + 10, halfWidthX + 10);
  const width = farX - nearX;
  const geo = new THREE.PlaneGeometry(width, STRIP_HALF_Z * 2 + 20, Math.max(8, Math.round(width / 4)), 24);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const localX = pos.getX(i);
    const t = THREE.MathUtils.clamp((localX + width / 2) / width, 0, 1);
    c.copy(COLOR_WATER_SHALLOW).lerp(COLOR_WATER_DEEP, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    pos.setX(i, localX + nearX + width / 2);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = WATER_MAT.clone();
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, WATER_LEVEL_Y, 0);
  mesh.name = "water";
  return mesh;
}

// ── river water (Pass 17 item 4) ──────────────────────────────────────────
// A winding ribbon rather than a rotated PlaneGeometry — the channel's centre
// wobbles with Z (riverCenterAt()), so a flat rectangle can't follow it. Built
// as one indexed BufferGeometry, one draw call, matching the "instance from
// the start, don't retrofit" budget discipline the rest of this pass follows.
export function buildRiverWater(): THREE.Mesh {
  const steps = 72;
  const zMin = -STRIP_HALF_Z - 8;
  const zMax = STRIP_HALF_Z + 8;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  // Slightly inset from the carved bank so the visible water sits inside the
  // depression rather than exactly on its (already-smooth) edge.
  const halfW = RIVER_HALF_WIDTH * 0.82;

  for (let i = 0; i <= steps; i++) {
    const z = zMin + (i / steps) * (zMax - zMin);
    const center = riverCenterAt(z);
    // left bank vertex, then right bank vertex — two per step.
    positions.push(center - halfW, RIVER_WATER_LEVEL_Y, z, center + halfW, RIVER_WATER_LEVEL_Y, z);
    c.copy(COLOR_WATER_SHALLOW).lerp(COLOR_WATER_DEEP, 0.55);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i > 0) {
      const prevLeft = (i - 1) * 2;
      const prevRight = prevLeft + 1;
      const curLeft = i * 2;
      const curRight = curLeft + 1;
      // Winding chosen so the cross product faces +Y (see docs/DECISIONS.md
      // Pass 17 for the worked check) — this is a hand-built ribbon, not a
      // PlaneGeometry, so nothing sets that for us automatically.
      indices.push(prevLeft, curRight, prevRight, prevLeft, curLeft, curRight);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = WATER_MAT.clone();
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "river-water";
  return mesh;
}
