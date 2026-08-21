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
import type { DamageSite } from "./scenery";
import {
  surfaceHeight,
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
/** Ceiling on the bubble — see recentreLocalProps.
 *
 *  Pass 26 raised this from 3,200 m, which was the direct cause of the
 *  reported "detail only renders at one camera distance". The default framing
 *  orbits at 3,200 m, so the bubble was ALREADY at its ceiling there: one
 *  deliberate zoom-out step to 6-8 km grew the visible ground to 3.1 x 6.8 km
 *  while the scatter stayed pinned inside a fixed 6.4 x 6.4 km box centred on
 *  the target, and everything past that box was bare. The sweet spot was not a
 *  sweet spot, it was the last framing where the bubble still covered the
 *  frame.
 *
 *  9,000 m covers the visible ground out to roughly a 6.7 km orbit, and past
 *  that the aggregation below — not a bigger bubble — is what keeps the ground
 *  populated, because spreading a fixed budget over more ground can only ever
 *  thin it. */
const LOCAL_HALF_MAX_M = 9_000;

/**
 * SCATTER AGGREGATION — Pass 26, and the "coarser but still-populated
 * fallback" the brief asks for.
 *
 * A 5 m tree is 0.6 px at an 8 km orbit. That is not a budget problem and no
 * instance count fixes it: sub-pixel is sub-pixel, and 4,200 invisible trees
 * cost exactly as much as 4,200 visible ones. The only way a scatter layer
 * survives a wide framing is for each drawn instance to stand for MORE THAN
 * ONE plant.
 *
 * So past the range where an individual tree resolves, an instance becomes a
 * COPSE: `agg` trees drawn as one mass. The linear scale grows as sqrt(agg),
 * which is what keeps the ground-coverage FRACTION constant — a copse of 16
 * trees covers 16x the area of one tree, so it is 4x wider. The layer thins
 * in instance count and coarsens in shape without ever thinning in coverage,
 * which is the difference between an LOD and a fade-out.
 *
 * This is a disclosed departure from 1:1 scale, and it is a different thing
 * from the marker/model boost in Scene3D: a marker is a symbol standing in
 * for one object whose real size a reader can check against the tank beside
 * it, whereas a copse is an honest aggregate — that ground really does carry
 * that much wood, drawn as one mass instead of sixteen sub-pixel ones. It
 * only ever engages beyond the range at which the individual trees could be
 * told apart anyway.
 */
const SCATTER_MIN_PX = 3.2;
const SCATTER_MAX_AGG = 60;
/** Nominal width of one drawn plant, metres — the canopy is the widest part
 *  and the thing whose apparent size decides legibility. */
const SCATTER_BASE_W_M = 5.5;

/** How many plants one instance should stand for at this zoom. 1 means "draw
 *  real individual trees", which is what happens at every framing where a
 *  real individual tree is actually resolvable. */
function aggregationFor(metresPerPixel: number): number {
  if (!(metresPerPixel > 0)) return 1;
  const wantW = SCATTER_MIN_PX * metresPerPixel;
  const agg = Math.pow(wantW / SCATTER_BASE_W_M, 2);
  return THREE.MathUtils.clamp(agg, 1, SCATTER_MAX_AGG);
}

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
export function fillCanopies(mesh: THREE.InstancedMesh, cx: number, cz: number, half: number, agg = 1): void {
  const cap = mesh.instanceMatrix.count;
  // sqrt(agg) — see aggregationFor. One instance stands for `agg` crowns and
  // is therefore sqrt(agg) times wider, which holds the covered ground area
  // constant as the camera pulls back.
  const spread = Math.sqrt(agg);
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
        dummy.position.set(x, surfaceHeight(x, z) - 0.1 + h * 0.45 * spread, z);
        dummy.rotation.set(0, rb * Math.PI, 0);
        // Height grows more slowly than width: a copse is a broad low mass,
        // not a single enormous tree. Capping the vertical growth is what
        // keeps the aggregate reading as woodland rather than as a scale bug.
        dummy.scale.set((2.4 + rd * 1.8) * spread, h * 0.68 * Math.min(spread, 2.2), (2.4 + ra * 1.8) * spread);
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
export function fillTrees(mesh: THREE.InstancedMesh, cx: number, cz: number, half: number, agg = 1): void {
  const cap = mesh.instanceMatrix.count;
  const spread = Math.sqrt(agg);
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
        dummy.position.set(x, surfaceHeight(x, z) - 0.1, z);
        dummy.rotation.set((ra - 0.5) * 0.22, rb * Math.PI, (rd - 0.5) * 0.22);
        // Trunks thicken with the aggregate but do not grow taller with it —
        // a stand of trees is not a taller tree.
        dummy.scale.set(1.7 * spread, h * Math.min(spread, 1.6), 1.7 * spread);
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
 * SHELL CRATERS — rebuilt in Pass 26.
 *
 * Craters existed before this pass and were reported, from a real device, as
 * "no craters anywhere". Both are true, and the arithmetic says why: they were
 * drawn 1.4-5.2 m across and 0.2-0.4 m proud, in a Gaussian only 900 m wide
 * around the zero line. At the 3.2 km default framing that is 0.6 px on a
 * feature with almost no tonal contrast against the ground it sits in — so the
 * layer was being drawn, and correctly, and could not be seen at any framing a
 * reader actually uses.
 *
 * Two things change. The bowls are now REAL SIZE — a 152 mm round digs a
 * 4-7 m crater and a heavy air-dropped bomb considerably more, so 4-16 m
 * across is the honest range and it is also 2-5x more legible. And each bowl
 * gets a SCORCH APRON: a flat, dark, polygon-offset disc 2.6-3.4x the bowl's
 * radius, which is what actually reads at a kilometre because it is 20-50 m
 * across and has real tonal contrast against the field.
 *
 * The apron is the load-bearing half. A crater bowl is a shape, and shapes
 * need pixels; a scorch mark is a TONE, and tone survives being one pixel.
 * Together they give the pockmarked ground the reference imagery shows, at
 * every framing from a few tens of metres out to the whole zone.
 *
 * Density: driven by `damageIntensity`, so it covers the whole of The Line
 * rather than a 900 m band, and boosted near the depths where assets actually
 * stand (`anchorXs`) — the brief's "denser near labelled assets". The anchor
 * term keys on DEPTH only, not on each asset's exact lateral position: the
 * lateral layout is owned by Scene3D and re-runs on filter changes, and
 * rebuilding the crater field whenever a filter moved an asset sideways would
 * be a far worse trade than a crater field that is right about depth and
 * spread across the frontage.
 */
const CRATER_SPAN_M = 3_000;

/** Rejection-sampled density for one crater at world x, in [0,1].
 *
 *  The exponent is doing real work: at 1.6 the acceptance ratio between the
 *  ground at the line and the ground at km 16 was only 2.6:1, which put the
 *  median crater at km ~16 and read as a uniform sprinkle rather than as a
 *  front. 2.6 makes it ~8:1, which is the concentration the reference imagery
 *  actually shows. */
function craterDensityAt(x: number, anchorXs: readonly number[]): number {
  let d = Math.pow(damageIntensity(x), 2.6);
  // Plus a bump near each asset depth — 240 m of world either side.
  for (let i = 0; i < anchorXs.length; i++) {
    const dx = (x - anchorXs[i]) / 240;
    if (dx > -3 && dx < 3) d += 0.4 * Math.exp(-dx * dx);
  }
  return Math.min(1, d);
}

interface CraterSample {
  x: number;
  z: number;
  /** Bowl radius, metres. */
  s: number;
  rot: number;
  depth: number;
  apron: number;
  apronRot: number;
  apronAspect: number;
  scorch: number;
}

/**
 * Sample the crater field ONCE and let both meshes read the same list.
 *
 * The first cut of this drew the bowls and the aprons in two separate loops
 * off two RNGs seeded identically, on the theory that the same seed replays
 * the same positions. It does not: the two loops draw different numbers of
 * values per iteration, so the sequences align for exactly one crater and
 * then diverge, which would have put every apron on bare ground next to a
 * crater rather than under one. Sampling once removes the failure mode
 * instead of tuning around it.
 */
function sampleCraters(count: number, anchorXs: readonly number[]): CraterSample[] {
  const r = rng(0xc4a7e5);
  const out: CraterSample[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 60) {
    guard++;
    const x = (r() * 2 - 1) * CRATER_SPAN_M;
    // STRIP_HALF_Z, not SCENERY_HALF_Z: 86% of the field was landing on the
    // lateral filler outside the represented sector, where the camera never
    // looks. Measured, not assumed — 317 of 2,200 aprons were inside the
    // near frame before this changed.
    const z = (r() * 2 - 1) * STRIP_HALF_Z;
    if (r() > craterDensityAt(x, anchorXs)) continue;
    if (isInWater(x, z)) continue; // no shell craters mid-river
    // 4-16 m across: a 152 mm round through to a heavy glide bomb.
    const s = 2 + r() * 6;
    out.push({
      x,
      z,
      s,
      rot: r() * Math.PI,
      depth: 0.5 + r() * 0.7,
      // 3.0-4.0x the bowl: 24-64 m of stained ground per hit, which is what
      // a km-range framing actually resolves.
      apron: s * (3 + r()),
      apronRot: r() * Math.PI,
      apronAspect: 0.8 + r() * 0.4,
      scorch: 0.55 + r() * 0.45,
    });
  }
  return out;
}

function buildCraters(samples: readonly CraterSample[]): THREE.InstancedMesh {
  // Wider and shallower than the old bowl: a real crater is a saucer, and a
  // saucer is what reads from above. 7 sides keeps a 2,200-crater field
  // under 31k triangles.
  const geo = new THREE.CylinderGeometry(1, 0.42, 0.5, 7);
  const mat = new THREE.MeshStandardMaterial({ color: "#241f18", flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, samples.length));
  for (let i = 0; i < samples.length; i++) {
    const c = samples[i];
    dummy.position.set(c.x, surfaceHeight(c.x, c.z) - 0.22, c.z);
    dummy.rotation.set(0, c.rot, 0);
    dummy.scale.set(c.s, c.depth, c.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = samples.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "props:craters";
  return mesh;
}

/** Both ends deliberately DARKER than the ground they sit on.
 *
 *  The first cut used #4a4133 / #2b241c against ground that the ash wash in
 *  terrain3d.ts had just lifted to roughly #524c3c — so the weathered end of
 *  the range was within a few percent of the ground's own value and the
 *  aprons, though drawn correctly and at 9 px, were invisible at the default
 *  framing. A burn mark's whole job here is tonal contrast; it has to be a
 *  value the ground never is. */
const COLOR_SCORCH_HOT = new THREE.Color("#1f1a13");
const COLOR_SCORCH_OLD = new THREE.Color("#39311f");

/** The scorch aprons — read straight off the same sample list as the bowls,
 *  so an apron is always centred on a crater by construction. Flat discs with
 *  polygon offset, exactly like the farm tracks: a burn is a stain on a
 *  surface, and giving it height would make it a disc standing on edge at the
 *  grazing angles this camera spends its time at. */
function buildCraterScorch(samples: readonly CraterSample[]): THREE.InstancedMesh {
  const geo = new THREE.CircleGeometry(1, 10);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    transparent: true,
    opacity: 0.93,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, samples.length));
  for (let i = 0; i < samples.length; i++) {
    const c = samples[i];
    dummy.position.set(c.x, surfaceHeight(c.x, c.z) + 0.12, c.z);
    dummy.rotation.set(0, c.apronRot, 0);
    dummy.scale.set(c.apron, 1, c.apron * c.apronAspect);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    // Fresher (darker) nearer the line, weathered further back.
    tmpColor.copy(COLOR_SCORCH_OLD).lerp(COLOR_SCORCH_HOT, damageIntensity(c.x) * c.scorch);
    mesh.setColorAt(i, tmpColor);
  }
  mesh.count = samples.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = "props:crater-scorch";
  return mesh;
}

/**
 * RUBBLE AND DEBRIS — Pass 26.
 *
 * Scattered around the structure sites that scenery.ts draws in a damaged or
 * ruined condition, because that is where rubble comes from: a collapsed
 * building throws its own mass 20-60 m in every direction, and ground that
 * has been fought through is littered with it well beyond the wall line.
 *
 * Sites come from scenery.ts's own `DAMAGE_SITES` rather than from a second
 * hand-written coordinate table, so debris can never drift away from the
 * buildings it fell off.
 */
function buildDebris(count: number, sites: readonly DamageSite[]): THREE.InstancedMesh {
  // Octahedron, not dodecahedron: 8 triangles against 36, for a chunk of
  // broken slab whose silhouette is angular either way. At 1,100-2,600
  // instances that is 30-94k triangles saved for no visible difference.
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#3b362d", flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(0x0deb815);
  if (!sites.length) {
    mesh.count = 0;
    mesh.name = "props:debris";
    return mesh;
  }

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    const site = sites[Math.floor(r() * sites.length) % sites.length];
    if (r() > site.severity) continue;
    // Clustered hard against the structures, with a long tail outward.
    const t = Math.pow(r(), 0.55);
    const ang = r() * Math.PI * 2;
    const rad = site.radius * (0.35 + t * 1.5);
    const x = site.x + Math.cos(ang) * rad;
    const z = site.z + Math.sin(ang) * rad * 0.8;
    if (isInWater(x, z)) continue;
    // 0.8-3.4 m chunks: broken slab and collapsed masonry, not gravel.
    const s = 0.4 + r() * 1.3;
    dummy.position.set(x, surfaceHeight(x, z) + s * 0.35, z);
    dummy.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    dummy.scale.set(s * (0.7 + r() * 0.9), s * (0.4 + r() * 0.5), s * (0.7 + r() * 0.9));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "props:debris";
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
export function fillScrub(mesh: THREE.InstancedMesh, cx: number, cz: number, half: number, agg = 1): void {
  const cap = mesh.instanceMatrix.count;
  const spread = Math.sqrt(agg);
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
        dummy.position.set(x, surfaceHeight(x, z) + 0.15, z);
        dummy.rotation.set(ra * 0.3, rb * Math.PI, rc * 0.3);
        dummy.scale.set(
          (1.4 + rc * 1.6) * spread,
          (0.7 + ra * 1.0) * Math.min(spread, 2),
          (1.4 + rb * 1.6) * spread,
        );
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
    dummy.position.set(x, surfaceHeight(x, z) + 0.28, z);
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
  debris: number;
}

/** What the prop layer needs to know about the rest of the world in order to
 *  put damage where damage belongs. Both are optional: with neither, the
 *  crater field falls back to the pure destruction gradient and the debris
 *  layer is empty, which is exactly the old behaviour. */
export interface PropContext {
  /** World-X of every placed asset — craters cluster around these. */
  anchorXs?: readonly number[];
  /** Structure sites that have shed rubble — see scenery.ts's damageSites(). */
  damageSites?: readonly DamageSite[];
}

/** Pass 25 raised the crater and wreck counts and added the two new layers.
 *  The world got a great deal smaller (19.2 km end to end against 140), so
 *  the same instance budget now buys real density instead of one object every
 *  few hundred metres — which is the whole of why the "sparse ground" failure
 *  mode was arithmetic rather than tuning. Still one draw call per type, and
 *  still tuned down on low-power devices — see Scene3D's quality detection. */
export const PROP_BUDGET: Record<"high" | "low", PropBudget> = {
  high: { trees: 4200, canopies: 3400, craters: 4200, scrub: 3000, wrecks: 320, belts: 2600, tracks: 1900, debris: 2600 },
  low: { trees: 1400, canopies: 1100, craters: 2200, scrub: 900, wrecks: 120, belts: 1300, tracks: 950, debris: 1100 },
};

export function buildProps(budget: PropBudget, ctx: PropContext = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = "props";
  const craters = sampleCraters(budget.craters, ctx.anchorXs ?? []);
  g.add(buildTrees(budget.trees));
  g.add(buildCanopies(budget.canopies));
  // Aprons before bowls: both are near-flat and near-coincident, and drawing
  // the stained ground first lets the bowl's own depth-tested rim sit on top
  // of it rather than fight it.
  g.add(buildCraterScorch(craters));
  g.add(buildCraters(craters));
  g.add(buildScrub(budget.scrub));
  g.add(buildWreckHusks(budget.wrecks));
  g.add(buildShelterBelts(budget.belts));
  g.add(buildFarmTracks(budget.tracks));
  g.add(buildDebris(budget.debris, ctx.damageSites ?? []));
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
/** Pass 26: 7 m was the bare carriageway. A field road on this ground is a
 *  worn pair of ruts plus its verges and turn-out — 8-20 m of paler, compacted
 *  ground — and at a 6-8 km framing the difference is 0.9 px against 2.2 px,
 *  i.e. between invisible and legible. */
const TRACK_WIDTH_M = 11;
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
    { dx: px, dz: pz, sx: ux, sz: uz, heading: alongHeading, pitch: BELT_SPACING_M * 0.5, offset: BELT_SPACING_M * 0.25 },
    { dx: ux, dz: uz, sx: px, sz: pz, heading: acrossHeading, pitch: BELT_SPACING_M * 0.7, offset: BELT_SPACING_M * 0.18 },
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

        dummy.position.set(x, surfaceHeight(x, z) + 0.35, z);
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
  //
  // Pass 26 walks the grid at HALF the measured spacing. Only ~21 of the
  // full-spacing lines intersect the plate at all (the support width of a
  // 25.2 x 18 km box in the belt normal is 15.4 km against a 1,421 m pitch),
  // so the old grid put a belt line every 1.4 km — 17 screen px apart at a
  // 6-8 km framing, i.e. two or three lines across the whole frame, which is
  // structure a reader cannot read as structure. Halving the pitch is not a
  // change to the MEASURED pattern: the primary rows stay exactly where the
  // OSM-derived frequencies put them, and the intermediate rows are the minor
  // field divisions between them, which is how a real shelterbelt grid is
  // laid out. The intermediate rows are drawn shorter and thinner (see
  // `minor` below) so the measured grid still dominates.
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

  // Enough lines to cross the whole plate diagonally, at half the measured
  // pitch — see above.
  const reach = Math.hypot(PROP_EXTENT, SCENERY_HALF_Z);
  const pitch = BELT_SPACING_M / 2;
  const lines = Math.ceil((2 * reach) / pitch);

  let placed = 0;
  outer: for (let li = -lines; li <= lines; li++) {
    const d = li * pitch;
    // Odd indices are the intermediate rows: shorter runs, more gaps.
    const minor = li % 2 !== 0;
    let t = -reach;
    while (t < reach) {
      if (placed >= count) break outer;
      const segLen = (260 + r() * 620) * (minor ? 0.7 : 1);
      const gap = (90 + r() * 340) * (minor ? 1.5 : 1);
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
      const h = BELT_HEIGHT_M * (1 - dmg * 0.5) * (minor ? 0.8 : 1);

      dummy.position.set(x, surfaceHeight(x, z) - 0.4, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(BELT_WIDTH_M * (0.8 + r() * 0.5) * (minor ? 0.7 : 1), h, len);
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
  state: { x: number; z: number; half: number; agg: number },
  /** World metres per screen pixel AT THE ORBIT RADIUS — Scene3D already
   *  derives this for its symbology (`orbitRadius * pxToWorld`). Passed in
   *  rather than guessed from `half` so the aggregation tracks the real
   *  viewport: the same orbit radius is a very different framing on a 390 px
   *  phone and a 1,600 px desktop, and the whole point of the aggregation is
   *  to hit a target size in PIXELS. */
  metresPerPixel = 0,
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
  const agg = aggregationFor(metresPerPixel);
  const moved = Math.hypot(cx - state.x, cz - state.z);
  // Refill on a quarter of the bubble's travel, on any real zoom change, or
  // when the aggregation tier has moved enough to change what is drawn.
  if (
    moved < half * 0.25 &&
    Math.abs(half - state.half) < half * 0.2 &&
    Math.abs(agg - state.agg) < Math.max(0.35, state.agg * 0.22)
  )
    return false;

  const trees = group.getObjectByName("props:trees") as THREE.InstancedMesh | undefined;
  const canopies = group.getObjectByName("props:canopies") as THREE.InstancedMesh | undefined;
  const scrub = group.getObjectByName("props:scrub") as THREE.InstancedMesh | undefined;
  if (trees) fillTrees(trees, cx, cz, half, agg);
  if (canopies) fillCanopies(canopies, cx, cz, half, agg);
  if (scrub) fillScrub(scrub, cx, cz, half, agg);
  state.x = cx;
  state.z = cz;
  state.half = half;
  state.agg = agg;
  return Boolean(trees || canopies || scrub);
}
