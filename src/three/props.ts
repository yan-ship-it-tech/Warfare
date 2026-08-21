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
// Pass 25: the scatter covers the WHOLE world.
//
// Pass 24 capped it at 34 km along a 140 km axis, because past the true-scale
// boundary each tree would have stood for hundreds of km of real ground. The
// consequence was that two thirds of the axis had no ground detail at all,
// which is one of the three failure modes this pass exists to remove. There
// is no compressed register any more and the world is 19.2 km wide end to
// end, so every zone gets the same scatter machinery — retuned per zone
// character rather than switched off (see ZONE_SCATTER below).
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { STRIP_HALF_Z, SCENERY_HALF_Z, TERRAIN_HALF_X, hashId } from "./worldMapping";
import { zoneAtSaturating } from "./zones";
import {
  terrainHeight,
  damageIntensity,
  isInWater,
  groundFidelity,
  BELT_X_FREQ,
  BELT_Z_FREQ,
} from "./terrain3d";

/** How deep the scatter reaches, world metres — the whole represented world
 *  plus the terrain overrun, so the scatter never stops before the ground
 *  does. */
const PROP_EXTENT = TERRAIN_HALF_X;

/**
 * Per-zone scatter character. The zones stand for very different ground and
 * have to look like it, and the ONE thing none of them may do is look empty.
 *
 *   tree      how much of the belt pattern survives — near the line the
 *             windbreaks are shattered stumps, deep in the rear they are
 *             intact rows.
 *   scrub     ground cover. Highest in the rear (nothing has burned it) and
 *             in the operational depth (untended field margins).
 *   canopy    tint toward TREE_HEALTHY, on top of the damage-driven tint.
 *
 * Nothing here goes below 0.55: a zone that renders at a third of the
 * scatter density of its neighbour reads as "less happens here", and that is
 * the specific misreading this pass may not produce.
 */
const ZONE_SCATTER: Record<string, { tree: number; scrub: number }> = {
  line: { tree: 0.62, scrub: 0.8 },
  depth: { tree: 1.0, scrub: 1.0 },
  rear: { tree: 1.05, scrub: 0.95 },
};
function zoneScatter(x: number): { tree: number; scrub: number } {
  return ZONE_SCATTER[zoneAtSaturating(x).id] ?? ZONE_SCATTER.depth;
}

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
/** Pass 25 halved the per-cell tree count and raised the minimum cell size.
 *  With the canopy layer added, the old 8-per-22 m cell put a maximum of one
 *  tree per 60 m² on the ground — a closed forest, on open farmed steppe,
 *  which is what a close screenshot showed. 5 per 34 m cell is one per 230 m²
 *  before the belt and damage filters, and the filters then cluster what
 *  survives into the windbreak rows where it belongs. */
const TREE_PER_CELL = 5;
const SCRUB_PER_CELL = 6;
const CELL_MIN_M = 34;
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
/** Ceiling on the bubble — see recentreLocalProps. 3.2 km puts the whole
 *  budget over 6.4 x 6.4 km at maximum spread, which is one tree every ~99 m:
 *  thin, but still a scatter, and past this framing the belts carry it. */
const LOCAL_HALF_MAX_M = 3_200;

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
const BELT_GREEN = new THREE.Color("#63753e"); // intact shelterbelt mass
const BELT_SHOT = new THREE.Color("#4a4436"); // shot to pieces, near the line

/**
 * CANOPY — Pass 25.
 *
 * The trunks below are 0.22 m across. At 1 km of camera distance that is
 * 0.4 px wide: measured, and the reason a screenshot at that framing showed
 * bare ground where 4,200 trees were in fact being drawn. Trunks alone can
 * only carry a treeline from about 300 m in.
 *
 * A canopy is what makes a tree a shape rather than a line. It is a separate
 * InstancedMesh rather than a merged trunk+canopy geometry because the two
 * have to be populated on DIFFERENT rules from the same cell grid: near the
 * line the trees genuinely are bare shattered poles, and one merged geometry
 * cannot drop the canopy per instance.
 */
function buildCanopies(count: number): THREE.InstancedMesh {
  // Four-sided cone: flat-shaded, reads as a mass at range and as a stylised
  // crown up close, and 8 triangles rather than the ~200 a sphere would cost
  // over 3,000 instances.
  const geo = new THREE.ConeGeometry(1, 1.7, 5);
  geo.translate(0, 0.85, 0);
  // White base: the instance colour IS the colour here. (The trunks below
  // multiply a tinted base by their instance colour, which is why they read
  // so dark — deliberate there, wrong for a canopy.)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = "props:canopies";
  fillCanopies(mesh, 0, 0, PROP_EXTENT);
  return mesh;
}

const CANOPY_HEALTHY = new THREE.Color("#4f5e33");
const CANOPY_AUTUMN = new THREE.Color("#6b5f2c");

/** Canopies, on the same cell grid and the same belt rule as the trunks, so a
 *  crown always sits on a trunk. Skipped where the damage gradient says the
 *  wood has been stripped — that is the visual difference between a shattered
 *  belt at the line and an intact windbreak in the rear, and it is now
 *  carried by presence/absence of mass rather than by a tint on a 0.4 px
 *  pole. */
export function fillCanopies(mesh: THREE.InstancedMesh, cx: number, cz: number, half: number): void {
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
        const belt = Math.abs(Math.sin(z * BELT_Z_FREQ + x * BELT_X_FREQ));
        if (belt < 0.72 && rc > 0.12) continue;
        if (Math.abs(x) < 260 && rd > 0.25) continue;
        if (rc > groundFidelity(x) * zoneScatter(x).tree) continue;
        if (Math.abs(z) > STRIP_HALF_Z && rd * (SCENERY_HALF_Z - STRIP_HALF_Z) < Math.abs(z) - STRIP_HALF_Z) continue;
        if (isInWater(x, z)) continue;
        // The one rule the trunks do not have: a stripped tree has no crown.
        const dmg = damageIntensity(x);
        if (rb < dmg * 0.85) continue;

        const h = (4 + rc * 7) * (1 - dmg * 0.35);
        // Crown sits on the top two thirds of the trunk and is a little wider
        // than tall, which is what a shelterbelt poplar/acacia actually looks
        // like from above.
        dummy.position.set(x, terrainHeight(x, z) - 0.1 + h * 0.45, z);
        dummy.rotation.set(0, rb * Math.PI, 0);
        dummy.scale.set(2.4 + rd * 1.8, h * 0.68, 2.4 + ra * 1.8);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        tmpColor.copy(CANOPY_HEALTHY).lerp(CANOPY_AUTUMN, rd * 0.7);
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
        // Thinned right at the line, where nothing is left standing. 260 m of
        // world, not 1,600 — the whole Line zone is 3 km wide now, and the
        // Pass 24 figure would have stripped the trees off a fifth of it.
        if (Math.abs(x) < 260 && rd > 0.25) continue;
        // Per-zone density (see ZONE_SCATTER) and the ground's own fidelity
        // at the very outer edge, where the terrain is running out.
        if (rc > groundFidelity(x) * zoneScatter(x).tree) continue;
        // Thinned laterally so the belt does not stop dead at the sector edge.
        if (Math.abs(z) > STRIP_HALF_Z && rd * (SCENERY_HALF_Z - STRIP_HALF_Z) < Math.abs(z) - STRIP_HALF_Z) continue;
        if (isInWater(x, z)) continue;

        const dmg = damageIntensity(x);
        // 4-11 m: a shelterbelt poplar or acacia, which is what these are.
        // Pass 24's 2.2-5.6 m described a sapling.
        const h = (4 + rc * 7) * (1 - dmg * 0.35);
        dummy.position.set(x, terrainHeight(x, z) - 0.1, z);
        dummy.rotation.set((ra - 0.5) * 0.22, rb * Math.PI, (rd - 0.5) * 0.22);
        dummy.scale.set(1.7, h, 1.7);
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
 * everything pushed back from the line." The Gaussian's width is 560 world
 * metres, which under The Line zone's own mapping stands for roughly the
 * first 15 km of real ground. Pass 24's 3,400 was a real 3.4 km against a
 * metric axis; carried across unchanged it would have spread the crater field
 * across all three zones and said the deep rear is shelled like the line is.
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
    const x = g * 900;
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

/**
 * Scrub — steppe shrub and rank weed in the untended field margins.
 *
 * Pass 25 scaled this up by roughly 4x, from 0.2-0.75 m to 1.5-4 m, and the
 * reason is measured rather than aesthetic: at 0.5 m a scrub clump is under a
 * pixel from 500 m of camera distance, so the entire 3,000-instance budget
 * was contributing nothing at any framing wider than a courtyard. 1.5-4 m is
 * a real steppe shrub or a clump of rank weed on an untended margin — it is
 * both more honest about what is on abandoned farmland after three years and
 * the only version of this layer that is ever visible. It settled at
 * 1.4-3.0 m across and half that tall — flat clumps, not pyramids.
 */
function buildScrub(count: number): THREE.InstancedMesh {
  const geo = new THREE.TetrahedronGeometry(0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#4e5334", flatShading: true, roughness: 1 });
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
        if (rc > groundFidelity(x) * zoneScatter(x).scrub) continue;
        if (Math.abs(z) > STRIP_HALF_Z && rc * (SCENERY_HALF_Z - STRIP_HALF_Z) < Math.abs(z) - STRIP_HALF_Z) continue;
        // Flatter than it is wide: a clump of rank weed or low scrub, not a
        // boulder. An earlier tuning at 1.6-4 m on all three axes filled the
        // close framing with what read as a field of traffic cones.
        dummy.position.set(x, terrainHeight(x, z) + 0.15, z);
        dummy.rotation.set(ra * 0.3, rb * Math.PI, rc * 0.3);
        dummy.scale.set(1.4 + rc * 1.6, 0.7 + ra * 1.0, 1.4 + rb * 1.6);
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
 * calls for, clustered inside roughly the first 330 world metres either side
 * of the line — which is the first ~5.5 real km, the ground where a vehicle
 * actually gets killed and left.
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
    const x = g * 330;
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
  canopies: number;
  craters: number;
  scrub: number;
  wrecks: number;
  belts: number;
  tracks: number;
}

/** Pass 25 raised the crater and wreck counts and added the two new layers.
 *  The world got a great deal smaller (19.2 km end to end against 140), so
 *  the same instance budget now buys real density instead of one object every
 *  few hundred metres — which is the whole of why the "sparse ground" failure
 *  mode was arithmetic rather than tuning. Still one draw call per type, and
 *  still tuned down on low-power devices — see Scene3D's quality detection. */
export const PROP_BUDGET: Record<"high" | "low", PropBudget> = {
  high: { trees: 4200, canopies: 3400, craters: 1800, scrub: 3000, wrecks: 320, belts: 900, tracks: 700 },
  low: { trees: 1400, canopies: 1100, craters: 650, scrub: 900, wrecks: 120, belts: 420, tracks: 340 },
};

export function buildProps(budget: PropBudget): THREE.Group {
  const g = new THREE.Group();
  g.name = "props";
  g.add(buildTrees(budget.trees));
  g.add(buildCanopies(budget.canopies));
  g.add(buildCraters(budget.craters));
  g.add(buildScrub(budget.scrub));
  g.add(buildWreckHusks(budget.wrecks));
  g.add(buildShelterBelts(budget.belts));
  g.add(buildFarmTracks(budget.tracks));
  return g;
}

/**
 * FARM TRACKS — Pass 25, and the other half of the km-range legibility fix.
 *
 * The shelterbelts give the ground structure along one axis. Between them is
 * open field, and open field with nothing on it renders as a flat coloured
 * plane at every framing wider than a few hundred metres — which is the
 * "sparse / empty ground" failure mode in the one place the shelterbelts do
 * not reach.
 *
 * What is actually there on this ground is the track network: unsurfaced
 * field roads running along the belts and cutting across them, pale against
 * the crop because they are compacted earth. They are the right feature for
 * the same reason the belts are — this is farmland, and that is what farmland
 * looks like from a kilometre up — and they read at range because a track is
 * hundreds of metres long even though it is only six metres wide.
 *
 * Flat ribbons rather than raised boxes: a track is a surface, and giving it
 * height would make it a wall at grazing angles, which is exactly the artifact
 * the low camera finds first.
 */
const TRACK_WIDTH_M = 7;
const TRACK_COLOR = new THREE.Color("#7c7458");
const TRACK_COLOR_WORN = new THREE.Color("#5f5a45");

function buildFarmTracks(count: number): THREE.InstancedMesh {
  // A unit quad lying in XZ, so a per-instance scale gives width and length.
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    roughness: 1,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = "props:tracks";
  const r = rng(0x7ac5a1);

  const bx = BELT_X_FREQ;
  const bz = BELT_Z_FREQ;
  const norm = Math.hypot(bx, bz);
  const ux = -bz / norm;
  const uz = bx / norm;
  const px = bx / norm;
  const pz = bz / norm;
  const alongHeading = Math.atan2(ux, uz);
  const acrossHeading = Math.atan2(px, pz);
  const reach = Math.hypot(PROP_EXTENT, SCENERY_HALF_Z);

  let placed = 0;
  // Two families: one running with the belts (offset half a spacing, so it
  // sits down the middle of a field rather than under a hedge), one cutting
  // across them at the field-block pitch.
  const families: Array<{ dx: number; dz: number; sx: number; sz: number; heading: number; pitch: number; offset: number }> = [
    { dx: px, dz: pz, sx: ux, sz: uz, heading: alongHeading, pitch: BELT_SPACING_M, offset: BELT_SPACING_M * 0.5 },
    { dx: ux, dz: uz, sx: px, sz: pz, heading: acrossHeading, pitch: BELT_SPACING_M * 1.35, offset: BELT_SPACING_M * 0.18 },
  ];

  outer: for (const fam of families) {
    const lines = Math.ceil((2 * reach) / fam.pitch);
    for (let li = -lines; li <= lines; li++) {
      const d = li * fam.pitch + fam.offset;
      let t = -reach;
      while (t < reach) {
        if (placed >= count) break outer;
        const segLen = 420 + r() * 900;
        const gap = 40 + r() * 260;
        const midT = t + segLen / 2;
        const x = fam.dx * d + fam.sx * midT;
        const z = fam.dz * d + fam.sz * midT;
        t += segLen + gap;
        if (Math.abs(x) > PROP_EXTENT || Math.abs(z) > SCENERY_HALF_Z) continue;
        if (isInWater(x, z)) continue;
        const dmg = damageIntensity(x);
        // Churned ground has no legible track network left on it.
        if (r() < dmg * 0.7) continue;

        dummy.position.set(x, terrainHeight(x, z) + 0.35, z);
        dummy.rotation.set(0, fam.heading, 0);
        dummy.scale.set(TRACK_WIDTH_M * (0.75 + r() * 0.8), 1, segLen);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        tmpColor.copy(TRACK_COLOR).lerp(TRACK_COLOR_WORN, r());
        mesh.setColorAt(placed, tmpColor);
        placed++;
      }
    }
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * SHELTERBELTS — Pass 25, and the single most important addition in it.
 *
 * The scatter above is made of objects a few metres across, and a few metres
 * is sub-pixel from anywhere past a few hundred metres of camera distance.
 * That is not a budget problem and no instance count fixes it: at the
 * framings this tool is actually read at — a whole zone, or the whole world —
 * ground legibility has to come from features that are HUNDREDS of metres
 * long, or it does not come at all.
 *
 * Windbreak belts are exactly that feature, and they are the correct one
 * rather than a convenient one: this is farmed steppe, and the thing that
 * structures it visually from above is the grid of planted shelterbelts
 * between the fields. `scripts/analyze-osm-patterns.mjs` measured their real
 * orientation and spacing off the Pokrovsk extract (docs/DECISIONS.md Pass
 * 17), and BELT_X_FREQ/BELT_Z_FREQ already encode it — the same pattern the
 * individual trees are banded on, so the belts and the trees agree by
 * construction instead of being two separate guesses at the same landscape.
 *
 * One InstancedMesh, static (not camera-local): a belt is big enough to be
 * worth drawing wherever it is, and 900 boxes is 10,800 triangles.
 */
const BELT_WIDTH_M = 20;
const BELT_HEIGHT_M = 7;
/** Perpendicular spacing between belt lines, metres — derived from the two
 *  frequencies rather than chosen, so it can never drift from the tree
 *  banding. π / |(BELT_X_FREQ, BELT_Z_FREQ)| ≈ 1.4 km, which is a plausible
 *  field block on this ground. */
const BELT_SPACING_M = Math.PI / Math.hypot(BELT_X_FREQ, BELT_Z_FREQ);

function buildShelterBelts(count: number): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    // White base — the instance colour carries it, same reason as the canopy.
    color: 0xffffff,
    flatShading: true,
    roughness: 1,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = "props:shelterbelts";
  const r = rng(0x5ce17ee5);

  // A belt line is the set of points where x·Bx + z·Bz is a constant. Walk
  // along each line in segments, leaving gaps — a real shelterbelt runs the
  // length of a field and stops, it is not an infinite hedge.
  const bx = BELT_X_FREQ;
  const bz = BELT_Z_FREQ;
  const norm = Math.hypot(bx, bz);
  // Unit vector along the line, and the line's own heading for the box.
  const ux = -bz / norm;
  const uz = bx / norm;
  const heading = Math.atan2(ux, uz);
  // Perpendicular unit vector — the direction the line index steps along.
  const px = bx / norm;
  const pz = bz / norm;

  // Enough lines to cross the whole plate diagonally.
  const reach = Math.hypot(PROP_EXTENT, SCENERY_HALF_Z);
  const lines = Math.ceil((2 * reach) / BELT_SPACING_M);

  let placed = 0;
  outer: for (let li = -lines; li <= lines; li++) {
    const d = li * BELT_SPACING_M;
    let t = -reach;
    while (t < reach) {
      if (placed >= count) break outer;
      const segLen = 260 + r() * 620;
      const gap = 90 + r() * 340;
      const midT = t + segLen / 2;
      const x = px * d + ux * midT;
      const z = pz * d + uz * midT;
      t += segLen + gap;
      if (Math.abs(x) > PROP_EXTENT || Math.abs(z) > SCENERY_HALF_Z) continue;
      if (isInWater(x, z)) continue;
      // Near the line the belts are shot to pieces: shorter, sparser, and
      // tinted toward the bare colour the trunks already use.
      const dmg = damageIntensity(x);
      if (r() < dmg * 0.62) continue;
      const len = segLen * (1 - dmg * 0.45);
      const h = BELT_HEIGHT_M * (1 - dmg * 0.5);

      dummy.position.set(x, terrainHeight(x, z) - 0.4, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(BELT_WIDTH_M * (0.8 + r() * 0.5), h, len);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      tmpColor.copy(BELT_SHOT).lerp(BELT_GREEN, 1 - dmg);
      mesh.setColorAt(placed, tmpColor);
      placed++;
    }
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
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
  // Pass 25 capped the ceiling at LOCAL_HALF_MAX_M rather than the whole
  // world. Spread over the full 25 x 18 km plate the tree budget is one tree
  // every ~330 m, which is not a landscape — and at the framings where the
  // bubble would be that wide, an individual 5 m tree is under a pixel
  // anyway, so the ground is carried by the shelterbelts and the terrain tint
  // instead (both static, both global). Keeping the bubble tight means the
  // ground the camera is actually near always has real density in it.
  const half = THREE.MathUtils.clamp(orbitRadius * 1.35, LOCAL_HALF_MIN_M, LOCAL_HALF_MAX_M);
  const moved = Math.hypot(cx - state.x, cz - state.z);
  // Refill on a quarter of the bubble's travel, or on any real zoom change.
  if (moved < half * 0.25 && Math.abs(half - state.half) < half * 0.2) return false;

  const trees = group.getObjectByName("props:trees") as THREE.InstancedMesh | undefined;
  const canopies = group.getObjectByName("props:canopies") as THREE.InstancedMesh | undefined;
  const scrub = group.getObjectByName("props:scrub") as THREE.InstancedMesh | undefined;
  if (trees) fillTrees(trees, cx, cz, half);
  if (canopies) fillCanopies(canopies, cx, cz, half);
  if (scrub) fillScrub(scrub, cx, cz, half);
  state.x = cx;
  state.z = cz;
  state.half = half;
  return Boolean(trees || canopies || scrub);
}
