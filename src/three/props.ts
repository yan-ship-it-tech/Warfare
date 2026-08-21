// ─────────────────────────────────────────────────────────────────────────
// Scatter props — the environmental detail that makes the strip read as
// ground rather than as a coloured plane.
//
// Every prop type is a single InstancedMesh: one geometry, one material, one
// draw call for hundreds of objects. This is where instancing genuinely
// earns its place, and it is why the prop budget can be raised without the
// frame cost tracking it linearly.
//
// Pass 10: trees and wrecks vary per-instance colour by `damageIntensity(x)`
// so the same mesh reads as a shattered bare belt near the line and a healthy
// green one further out.
//
// Pass 24: metres, and a scatter *extent* rather than a scatter over the whole
// axis. Props are ground detail; ground detail is a near-register claim. Past
// PROP_EXTENT_KM the fidelity gradient says the geography is schematic, so
// dusting individual trees out there would be asserting exactly the kind of
// detail the compression has already destroyed — and each of those trees
// would be covering hundreds of km of real ground. The scatter therefore
// lives inside the true-scale register and thins on `groundFidelity()` at its
// outer edge instead of stopping on a visible line.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { STRIP_HALF_Z, SCENERY_HALF_Z, hashId, worldXFor } from "./worldMapping";
import {
  terrainHeight,
  damageIntensity,
  isInWater,
  groundFidelity,
  BELT_X_FREQ,
  BELT_Z_FREQ,
} from "./terrain3d";

/** How deep the scatter reaches, in km. Just inside the true-scale boundary:
 *  every prop here is drawn at its real size, so it may only stand on ground
 *  that is drawn at real size too. */
const PROP_EXTENT_KM = 34;
const PROP_EXTENT = worldXFor("side_b", PROP_EXTENT_KM);

/** Deterministic RNG so the scatter is identical on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

/**
 * CAMERA-LOCAL SCATTER — the fix for "the ground has no features any more".
 *
 * Pass 24 made one world unit one metre, which multiplied the scatter's real
 * footprint by ~10,000x in area without changing the instance budget. 4,200
 * trees over PROP_EXTENT_KM x SCENERY_HALF_Z is 1,632 km2 of ground: one tree
 * every 623 m. That is not a tuning problem, it is arithmetic — landscape
 * density over that area needs millions of instances, which no frame budget
 * here allows.
 *
 * So the budget follows the camera instead of being spread over ground nobody
 * is looking at. Trees and scrub are placed on a deterministic world-space
 * cell grid, and only the cells inside a bubble around the camera's target are
 * filled. The bubble tracks the orbit radius: zoomed in, the same 4,200 trees
 * cover ~2 km2 at ~20 m spacing and read as a landscape; zoomed out, they
 * spread and thin, which costs nothing because a 1 m trunk is sub-pixel at
 * that range anyway.
 *
 * Placement is keyed on the CELL's integer coordinates, not on draw order, so
 * a tree's position is a pure function of where it is in the world. Recentring
 * the bubble therefore slides the window over a fixed landscape instead of
 * resampling it — no popping, no shimmer, and returning to a place shows the
 * same trees.
 */
/** Cells across the bubble's width. The cell SIZE is derived from this and the
 *  bubble's extent rather than fixed, so the budget is spent evenly over
 *  whatever ground is in view: a fixed cell size either starves a close-up
 *  (too few cells to reach the budget) or piles the whole budget into one
 *  corner of a wide view (the cap hit before the loop reaches the far cells).
 *  Both were observed — the first is why the ground still looked bare after
 *  the first attempt at this. */
const CELLS_ACROSS = 38;
const TREE_PER_CELL = 8;
const SCRUB_PER_CELL = 6;
const CELL_MIN_M = 22;
const CELL_MAX_M = 2_400;
/** Bubble half-extent as a multiple of the camera's orbit radius, clamped.
 *  The floor is deliberately small. The frame is only ~2 x orbitRadius x
 *  tan(fov/2) of ground wide, so a bubble much larger than the orbit radius
 *  spreads the budget over ground that is off-screen: at a 200 m orbit the
 *  visible strip is ~78 m across, and a 700 m bubble (the first value tried
 *  here) put ~4 of 1,400 trees in frame — measured, which is why this is
 *  140 and not a round number picked by feel. The ceiling is the old global
 *  extent, so fully zoomed out behaves exactly as before. */
const LOCAL_HALF_MIN_M = 140;

/** Integer hash -> [0,1). Deterministic per cell, decorrelated between the
 *  three draws we take from each cell. */
function cellRand(i: number, j: number, k: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const TREE_BARE = new THREE.Color("#3a352a"); // near the line: bare, scorched
const TREE_HEALTHY = new THREE.Color("#4d5a34"); // deep rear: green canopy tint

/**
 * Shattered treeline — the single most recognisable signature of ground that
 * has been fought over for years, and cheap to convey: bare tapered trunks,
 * no canopy, densest where the shelling has been heaviest.
 *
 * Now metric: a trunk is 2.2–5.6 m tall and 0.22 m at the base, which is a
 * tree. Before Pass 24 the same numbers described something ~150 m tall.
 */
function buildTrees(count: number): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(0.05, 0.22, 1, 5);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#4a4237", flatShading: true, roughness: 1, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = true;
  mesh.name = "props:trees";
  fillTrees(mesh, 0, 0, PROP_EXTENT);
  return mesh;
}

/**
 * Fill the tree mesh from the deterministic cell grid, over a bubble of
 * `half` metres around (cx, cz). Re-runnable: the caller re-invokes this when
 * the camera target has moved far enough to be worth recentring.
 *
 * Every filter here is the pre-existing one, unchanged — belts, the bare strip
 * at the line, the fidelity thin-out toward the rear, the lateral thin-out and
 * the water test. Only *where the candidates come from* has changed.
 */
export function fillTrees(mesh: THREE.InstancedMesh, cx: number, cz: number, half: number): void {
  const cap = mesh.instanceMatrix.count;
  const halfZ = Math.min(half, SCENERY_HALF_Z);
  const cell = THREE.MathUtils.clamp((half * 2) / CELLS_ACROSS, CELL_MIN_M, CELL_MAX_M);
  const i0 = Math.floor((cx - half) / cell);
  const i1 = Math.ceil((cx + half) / cell);
  const j0 = Math.floor((cz - halfZ) / cell);
  const j1 = Math.ceil((cz + halfZ) / cell);
  let placed = 0;

  outer: for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (let k = 0; k < TREE_PER_CELL; k++) {
        if (placed >= cap) break outer;
        const ra = cellRand(i, j, k * 7);
        const rb = cellRand(i, j, k * 7 + 1);
        const rc = cellRand(i, j, k * 7 + 2);
        const rd = cellRand(i, j, k * 7 + 3);
        const x = (i + ra) * cell;
        const z = (j + rb) * cell;
        if (Math.abs(x) > PROP_EXTENT) continue;

        // Treelines follow field boundaries, not open ground — banding keeps
        // them in belts. Ratio is Pass 17's, from the real OSM windbreak rows.
        const belt = Math.abs(Math.sin(z * BELT_Z_FREQ + x * BELT_X_FREQ));
        if (belt < 0.72 && rc > 0.12) continue;
        // Thinned right at the line, where nothing is left standing.
        if (Math.abs(x) < 1_600 && rd > 0.25) continue;
        // Thinned toward the rear on the terrain's own fidelity curve.
        if (rc > groundFidelity(x) * 0.85 + 0.15) continue;
        // Thinned laterally so the belt does not stop dead at the sector edge.
        if (Math.abs(z) > STRIP_HALF_Z && rd * (SCENERY_HALF_Z - STRIP_HALF_Z) < Math.abs(z) - STRIP_HALF_Z) continue;
        if (isInWater(x, z)) continue;

        const dmg = damageIntensity(x);
        const h = (2.2 + rc * 3.4) * (1 - dmg * 0.35);
        dummy.position.set(x, terrainHeight(x, z) - 0.1, z);
        dummy.rotation.set((ra - 0.5) * 0.22, rb * Math.PI, (rd - 0.5) * 0.22);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        tmpColor.copy(TREE_BARE).lerp(TREE_HEALTHY, 1 - dmg);
        mesh.setColorAt(placed, tmpColor);
        placed++;
      }
    }
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * Shell craters, concentrated on the zero line. The density falloff either
 * side is doing real explanatory work — it is the visual answer to "why is
 * everything pushed back from the line." The Gaussian's width is 3.4 km now
 * because that is what the old 34 "units" was always meant to represent.
 */
function buildCraters(count: number): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(1, 0.55, 0.36, 9);
  const mat = new THREE.MeshStandardMaterial({ color: "#2f2b22", flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(0xc4a7e5);

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    // Gaussian-ish clustering on x via summed uniforms.
    const g = (r() + r() + r() - 1.5) / 1.5;
    const x = g * 3_400;
    const z = (r() * 2 - 1) * SCENERY_HALF_Z;
    if (isInWater(x, z)) continue; // no shell craters mid-river
    const s = 0.7 + r() * 1.9;
    dummy.position.set(x, terrainHeight(x, z) - 0.16, z);
    dummy.rotation.set(0, r() * Math.PI, 0);
    dummy.scale.set(s, 0.5 + r() * 0.5, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "props:craters";
  return mesh;
}

/** Low scrub/debris, cheapest possible ground texture break-up. Kept inside
 *  the near register for the same reason as the trees. */
function buildScrub(count: number): THREE.InstancedMesh {
  const geo = new THREE.TetrahedronGeometry(0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#5b5a3e", flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = "props:scrub";
  fillScrub(mesh, 0, 0, PROP_EXTENT);
  return mesh;
}

/** Scrub, same camera-local cell grid as the trees. */
export function fillScrub(mesh: THREE.InstancedMesh, cx: number, cz: number, half: number): void {
  const cap = mesh.instanceMatrix.count;
  const halfZ = Math.min(half, SCENERY_HALF_Z);
  const cell = THREE.MathUtils.clamp((half * 2) / CELLS_ACROSS, CELL_MIN_M, CELL_MAX_M);
  const i0 = Math.floor((cx - half) / cell);
  const i1 = Math.ceil((cx + half) / cell);
  const j0 = Math.floor((cz - halfZ) / cell);
  const j1 = Math.ceil((cz + halfZ) / cell);
  let placed = 0;

  outer: for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (let k = 0; k < SCRUB_PER_CELL; k++) {
        if (placed >= cap) break outer;
        const ra = cellRand(i, j, 100 + k * 5);
        const rb = cellRand(i, j, 101 + k * 5);
        const rc = cellRand(i, j, 102 + k * 5);
        const x = (i + ra) * cell;
        const z = (j + rb) * cell;
        if (Math.abs(x) > PROP_EXTENT) continue;
        if (isInWater(x, z)) continue;
        if (rc > groundFidelity(x) * 0.85 + 0.15) continue;
        if (Math.abs(z) > STRIP_HALF_Z && rc * (SCENERY_HALF_Z - STRIP_HALF_Z) < Math.abs(z) - STRIP_HALF_Z) continue;
        dummy.position.set(x, terrainHeight(x, z) + 0.1, z);
        dummy.rotation.set(ra * Math.PI, rb * Math.PI, rc * Math.PI);
        dummy.scale.setScalar(0.4 + rc * 1.1);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
    }
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Burnt-out vehicle husks — the "burning wrecks" the destruction gradient
 * calls for, clustered inside roughly the first 2 km either side of the line.
 * Instanced like craters; the per-object flame accent lives on scenery.ts's
 * hand-placed markers, since one InstancedMesh shares one material.
 */
function buildWreckHusks(count: number): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1.3, 0.6, 2.4);
  const mat = new THREE.MeshStandardMaterial({ color: "#241f18", flatShading: true, roughness: 0.85, metalness: 0.25 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(0xdead10cc);

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    const g = (r() + r() + r() - 1.5) / 1.5;
    const x = g * 2_000;
    const z = (r() * 2 - 1) * SCENERY_HALF_Z;
    if (isInWater(x, z)) continue; // a burnt hull can sit on a riverbank, not in the channel
    const s = 0.7 + r() * 0.6;
    dummy.position.set(x, terrainHeight(x, z) + 0.28, z);
    dummy.rotation.set((r() - 0.5) * 0.4, r() * Math.PI, (r() - 0.5) * 0.5);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "props:wrecks";
  return mesh;
}

export interface PropBudget {
  trees: number;
  craters: number;
  scrub: number;
  wrecks: number;
}

/** Raised alongside the metric rescale: the same counts that read as a
 *  populated strip over the old compressed extent read as empty ground over
 *  68 km × 12 km of real terrain. Still one draw call per type, and still
 *  tuned down on low-power devices — see Scene3D's quality detection. */
export const PROP_BUDGET: Record<"high" | "low", PropBudget> = {
  high: { trees: 4200, craters: 1000, scrub: 3000, wrecks: 180 },
  low: { trees: 1400, craters: 380, scrub: 900, wrecks: 70 },
};

export function buildProps(budget: PropBudget): THREE.Group {
  const g = new THREE.Group();
  g.name = "props";
  g.add(buildTrees(budget.trees));
  g.add(buildCraters(budget.craters));
  g.add(buildScrub(budget.scrub));
  g.add(buildWreckHusks(budget.wrecks));
  return g;
}

/** Unique-but-stable prop rotation for an asset id, so a marker's little
 *  ground pad doesn't sit at the same angle as every other one. */
export function stableAngle(id: string): number {
  return hashId(id) * Math.PI * 2;
}

/**
 * Recentre the camera-local scatter on (cx, cz) for the given orbit radius.
 * Called from Scene3D's layout pass, which already only runs when something
 * moved; this additionally no-ops unless the target has travelled far enough
 * to be worth the refill, so a slow pan does not rebuild 7,200 matrices every
 * frame. Returns true when it actually refilled.
 */
export function recentreLocalProps(
  group: THREE.Group,
  cx: number,
  cz: number,
  orbitRadius: number,
  state: { x: number; z: number; half: number },
): boolean {
  // Bubble tracks the orbit radius: enough ground to fill the frame, never so
  // little that the edge is visible, never more than the old global extent.
  const half = THREE.MathUtils.clamp(orbitRadius * 1.35, LOCAL_HALF_MIN_M, PROP_EXTENT);
  const moved = Math.hypot(cx - state.x, cz - state.z);
  // Refill on a quarter of the bubble's travel, or on any real zoom change.
  if (moved < half * 0.25 && Math.abs(half - state.half) < half * 0.2) return false;

  const trees = group.getObjectByName("props:trees") as THREE.InstancedMesh | undefined;
  const scrub = group.getObjectByName("props:scrub") as THREE.InstancedMesh | undefined;
  if (trees) fillTrees(trees, cx, cz, half);
  if (scrub) fillScrub(scrub, cx, cz, half);
  state.x = cx;
  state.z = cz;
  state.half = half;
  return Boolean(trees || scrub);
}
