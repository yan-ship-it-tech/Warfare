// ─────────────────────────────────────────────────────────────────────────
// Static terrain scenery — dressing, not data.
//
// Everything here is decorative geometry with no id, no detail panel, no
// entry in data/. That distinction matters: these are not additional
// battlefield assets competing with the real ones for attention or
// implying a specific real facility exists at a specific point (the same
// caution that kept a real photo off the two generic "representative
// infrastructure" power-plant assets in Pass 5 applies doubly to inventing
// a whole 3D building). This is what makes the strip read as *a* fought-
// over place rather than empty ground with icons floating over it —
// nothing here is a claim about *the* place.
//
// Same authored-geometry aesthetic as src/three/models.ts and the same
// reason: this sandbox cannot fetch binary assets, so anything sourced
// would be trusted under a licence nobody here could read. Primitives,
// same as the hero tier.
//
// Pass 10 adds the mixed-biome landmark kinds (villages at three condition
// tiers, an urban cluster, a port, a ruined-infrastructure set-piece, a
// hand-placed wreck) plus the coastal water plane from terrain3d.ts — see
// that file's header for why the shoreline position is a fixed world-X
// rather than something derived from the live `Projection` passed in here.
//
// Pass 14 adds: a destroyed coastal bridge + pontoon crossing spanning the
// terrain3d.ts inlet (same fixed-world-X convention, and same reason); three
// new landmark kinds terrain features Pass 15 needs before it can site
// assets "into" them (forest patch, elevated treeline, built-up block); a
// couple of static smoke columns as contested-zone dressing; and skipping
// any LANDMARKS entry that would land inside the OSM metric inset's
// footprint (osmTerrain.ts) — no generic village drawn on top of the real
// rail junction it now sits next to.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import type { Side } from "../types";
import type { Projection } from "../scene/projection";
import { terrainHeight, buildWater, WATER_LEVEL_Y } from "./terrain3d";
import { worldXFor, STRIP_HALF_Z } from "./worldMapping";
import { osmInsetBounds } from "./osmTerrain";

const CONCRETE = new THREE.MeshStandardMaterial({ color: "#6b6d63", flatShading: true, roughness: 0.92 });
const CONCRETE_DARK = new THREE.MeshStandardMaterial({ color: "#4a4b43", flatShading: true, roughness: 0.95 });
const METAL_RUST = new THREE.MeshStandardMaterial({ color: "#6b4a3a", flatShading: true, roughness: 0.8, metalness: 0.2 });
const METAL_TANK = new THREE.MeshStandardMaterial({ color: "#8a8f92", flatShading: true, roughness: 0.5, metalness: 0.4 });
const WOOD = new THREE.MeshStandardMaterial({ color: "#5c4a34", flatShading: true, roughness: 1 });
const SANDBAG = new THREE.MeshStandardMaterial({ color: "#8c7f5c", flatShading: true, roughness: 1 });
const DIRT_WALL = new THREE.MeshStandardMaterial({ color: "#3e3826", flatShading: true, roughness: 1 });
const CANVAS = new THREE.MeshStandardMaterial({ color: "#4f5a41", flatShading: true, roughness: 0.9 });
const WIRE = new THREE.MeshStandardMaterial({ color: "#3a3a38", flatShading: true, roughness: 0.6, metalness: 0.5 });

// ── Pass 10 materials: villages, urban cluster, port, wreck ──────────────
const WALL_INTACT = new THREE.MeshStandardMaterial({ color: "#8a7a5c", flatShading: true, roughness: 0.9 });
const WALL_DAMAGED = new THREE.MeshStandardMaterial({ color: "#5f5748", flatShading: true, roughness: 0.95 });
const WALL_RUINED = new THREE.MeshStandardMaterial({ color: "#332f28", flatShading: true, roughness: 1 });
const ROOF_INTACT = new THREE.MeshStandardMaterial({ color: "#7a3b32", flatShading: true, roughness: 0.85 });
const ROOF_DAMAGED = new THREE.MeshStandardMaterial({ color: "#4a2a24", flatShading: true, roughness: 0.9 });
const RUBBLE = new THREE.MeshStandardMaterial({ color: "#302c26", flatShading: true, roughness: 1 });
const URBAN_WALL_A = new THREE.MeshStandardMaterial({ color: "#5a5f66", flatShading: true, roughness: 0.8 });
const URBAN_WALL_B = new THREE.MeshStandardMaterial({ color: "#6b6558", flatShading: true, roughness: 0.8 });
const PIER_WOOD = new THREE.MeshStandardMaterial({ color: "#4a4438", flatShading: true, roughness: 1 });
const WRECK_HULL = new THREE.MeshStandardMaterial({ color: "#211d17", flatShading: true, roughness: 0.85, metalness: 0.3 });
const EMBER = new THREE.MeshStandardMaterial({
  color: "#ff5a1f",
  emissive: "#ff5a1f",
  emissiveIntensity: 1.5,
  flatShading: true,
  roughness: 0.6,
});

// ── Pass 14 materials: bridge, forest patch / treeline, built-up block ────
const BRIDGE_DECK = new THREE.MeshStandardMaterial({ color: "#6f6d63", flatShading: true, roughness: 0.9 });
const TREE_TRUNK = WOOD;
const TREE_CANOPY = new THREE.MeshStandardMaterial({ color: "#4d5a34", flatShading: true, roughness: 0.95 });
const TREE_CANOPY_BARE = new THREE.MeshStandardMaterial({ color: "#3a352a", flatShading: true, roughness: 0.95 });
const MOUND = new THREE.MeshStandardMaterial({ color: "#4c4a34", flatShading: true, roughness: 1 });
// Reuses the near-line "shattered treeline" trunk-only silhouette that
// props.ts already established for damaged ground, at hand-placed scale.
const SMOKE = new THREE.MeshStandardMaterial({
  color: "#6a6b66",
  flatShading: true,
  roughness: 1,
  transparent: true,
  depthWrite: false,
});

function box(w: number, h: number, d: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
function cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

// ── landmark structures (a few, unique, placed by hand) ───────────────────

/** A representative power-generation node — cooling structure + switchyard,
 *  not any specific named plant. See the file header on why this stays
 *  generic on purpose. */
export function buildPowerPlant(): THREE.Group {
  const g = new THREE.Group();
  const tower = cyl(2.6, 3.6, 8, 12, CONCRETE);
  tower.position.y = 4;
  g.add(tower);
  const towerNeck = cyl(2.9, 2.6, 1, 12, CONCRETE_DARK);
  towerNeck.position.y = 7.9;
  g.add(towerNeck);

  const switchyard = box(9, 3.2, 5.5, CONCRETE_DARK);
  switchyard.position.set(-7, 1.6, 0);
  g.add(switchyard);
  for (let i = 0; i < 5; i++) {
    const pylon = box(0.25, 3.6, 0.25, METAL_TANK);
    pylon.position.set(-2 + i * 1.4, 1.8, 6.5);
    g.add(pylon);
    const arm = box(2.6, 0.15, 0.15, METAL_TANK);
    arm.position.set(-2 + i * 1.4, 3.2, 6.5);
    g.add(arm);
  }
  return g;
}

/** A fuel/POL depot — tank farm with a low containment berm. */
export function buildFuelDepot(): THREE.Group {
  const g = new THREE.Group();
  const positions: [number, number][] = [
    [-3, -2], [0, -2.4], [3, -2],
    [-1.6, 1.4], [1.6, 1.4],
  ];
  for (const [x, z] of positions) {
    const r = 1.5 + (Math.abs(x * z) % 3) * 0.15;
    const tank = cyl(r, r, 2.6, 14, METAL_TANK);
    tank.position.set(x, 1.3, z);
    g.add(tank);
    const cap = cyl(r * 1.02, r * 1.02, 0.15, 14, METAL_RUST);
    cap.position.set(x, 2.65, z);
    g.add(cap);
  }
  const berm = new THREE.Mesh(
    new THREE.TorusGeometry(5.6, 0.5, 6, 20),
    DIRT_WALL,
  );
  berm.rotation.x = Math.PI / 2;
  berm.position.y = 0.2;
  g.add(berm);
  return g;
}

/** A forward-ish command post — dug-in, camouflaged, antenna mast, not a
 *  building that would ever actually be visible from a distance. */
export function buildCommandPost(): THREE.Group {
  const g = new THREE.Group();
  const bunker = box(5, 1.6, 4, DIRT_WALL);
  bunker.position.y = 0.8;
  g.add(bunker);
  const roofBerm = box(5.6, 0.5, 4.6, DIRT_WALL);
  roofBerm.position.y = 1.85;
  g.add(roofBerm);
  const tent = box(2.6, 1.4, 2.2, CANVAS);
  tent.position.set(-3.6, 0.7, 1.5);
  tent.rotation.y = 0.3;
  g.add(tent);
  const mast = cyl(0.05, 0.08, 5, 5, METAL_TANK);
  mast.position.set(2.6, 2.5, -1.5);
  g.add(mast);
  const antenna = cyl(0.5, 0.5, 0.05, 8, WIRE);
  antenna.rotation.x = Math.PI / 2;
  antenna.position.set(2.6, 4.8, -1.5);
  g.add(antenna);
  return g;
}

type Condition = "ruined" | "damaged" | "intact";

/** One small house, condition-dependent: fewer/tilted walls and a missing
 *  or askew roof the more damaged it is, with an occasional rubble pile
 *  beside anything that isn't intact. */
function buildHouse(condition: Condition, r: () => number): THREE.Group {
  const g = new THREE.Group();
  const wallMat = condition === "intact" ? WALL_INTACT : condition === "damaged" ? WALL_DAMAGED : WALL_RUINED;
  const w = 2.6 + r() * 1.2;
  const d = 2.2 + r() * 1;
  const h = 1.6 + r() * 0.5;
  const body = box(w, h, d, wallMat);
  body.position.y = h / 2;
  if (condition === "ruined") {
    body.rotation.z = (r() - 0.5) * 0.35;
    body.scale.y = 0.55 + r() * 0.3;
  } else if (condition === "damaged") {
    body.rotation.z = (r() - 0.5) * 0.1;
  }
  g.add(body);

  const hasRoof = condition === "intact" ? true : condition === "damaged" ? r() > 0.3 : r() > 0.78;
  if (hasRoof) {
    const roofMat = condition === "intact" ? ROOF_INTACT : ROOF_DAMAGED;
    const roof = cyl(0, Math.max(w, d) * 0.75, 1.1, 4, roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 0.4;
    if (condition !== "intact") roof.rotation.z = (r() - 0.5) * 0.3;
    g.add(roof);
  }

  if (condition !== "intact" && r() > 0.4) {
    const rub = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + r() * 0.5, 0), RUBBLE);
    rub.position.set(w * 0.7, 0.3, (r() - 0.5) * d);
    rub.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    g.add(rub);
  }
  return g;
}

/** A cluster of houses at one condition tier — the "rural village" unit
 *  item 3 asked for, reused at each of the three damage tiers rather than
 *  three separate builders, since only the material/completeness choice
 *  actually differs. */
function buildVillage(condition: Condition, seed: number, count: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  for (let i = 0; i < count; i++) {
    const house = buildHouse(condition, r);
    const angle = (i / count) * Math.PI * 2 + r() * 0.6;
    const radius = 3 + r() * 5.5;
    house.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * 0.7);
    house.rotation.y += r() * Math.PI * 2;
    g.add(house);
  }
  return g;
}

/** A small town skyline — the "urban cluster" tier, reserved for the intact
 *  50 km+ bands per item 1's gradient. A handful of taller rectangular
 *  volumes rather than a real streetscape; the point is silhouette, viewed
 *  from the distance this always renders at. */
function buildUrbanCluster(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const mats = [URBAN_WALL_A, URBAN_WALL_B];
  for (let i = 0; i < 9; i++) {
    const w = 2 + r() * 2.2;
    const d = 2 + r() * 2.2;
    const h = 4 + r() * 11;
    const b = box(w, h, d, mats[i % 2]);
    b.position.set((r() - 0.5) * 18, h / 2, (r() - 0.5) * 13);
    b.rotation.y = r() * 0.3;
    g.add(b);
  }
  return g;
}

/** A small harbour: a couple of warehouse volumes on the dry side plus a
 *  pier reaching out over the water — this is the "place to build out the
 *  Russia-naval category" item 2 asked for, sitting right at the coastline
 *  buildWater() draws. */
function buildPortHarbor(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = box(4, 2.8 + (i % 2) * 0.6, 6, CONCRETE_DARK);
    b.position.set(-7 + i * 5.5, 1.4, -2 + (i % 2) * 1.5);
    g.add(b);
  }
  const pier = box(2, 0.4, 15, PIER_WOOD);
  pier.position.set(7, 0.2, 0);
  g.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = cyl(0.14, 0.14, 1.6, 6, PIER_WOOD);
    post.position.set(6.1, -0.6, -7 + i * 2.8);
    g.add(post);
  }
  return g;
}

/** A destroyed piece of key infrastructure — a collapsed span with exposed
 *  rebar, standing in for a bridge or rail junction. This is item 1's
 *  "occasional destroyed key infrastructure" in the otherwise-intact 50 km+
 *  band: rare and hand-placed rather than scattered. */
function buildRuinedInfrastructure(): THREE.Group {
  const g = new THREE.Group();
  const base = box(7.5, 2.2, 5, WALL_RUINED);
  base.position.y = 1.1;
  base.rotation.z = 0.1;
  g.add(base);
  const collapse = box(6.2, 1, 4.4, RUBBLE);
  collapse.position.set(1.2, 0.5, 0.4);
  collapse.rotation.set(0.15, 0.4, 0.08);
  g.add(collapse);
  for (let i = 0; i < 4; i++) {
    const strut = cyl(0.06, 0.06, 2.4, 4, METAL_RUST);
    strut.position.set(-2.4 + i * 1.4, 1.6, 2.2);
    strut.rotation.z = 0.3;
    g.add(strut);
  }
  return g;
}

/** One hand-placed burnt vehicle husk with a smouldering ember accent —
 *  distinct from props.ts's instanced wreck field (props:wrecks), which
 *  covers the near-line *density* of this but can't carry a per-instance
 *  emissive glow. A handful of these mark specific "still burning" points
 *  rather than trying to make every one of the instanced husks glow. */
function buildWreckMarker(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const hull = box(1.2 + r() * 1.3, 0.55 + r() * 0.3, 2.4 + r() * 1.3, WRECK_HULL);
  hull.position.y = 0.35;
  hull.rotation.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.5);
  g.add(hull);
  if (r() > 0.4) {
    const turret = box(0.7, 0.4, 0.9, WRECK_HULL);
    turret.position.set(0.1, 0.75, -0.2);
    turret.rotation.y = r() * Math.PI;
    g.add(turret);
  }
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.2 + r() * 0.15, 6, 5), EMBER);
  ember.position.set(0.15 + (r() - 0.5) * 0.6, 0.45, 0.2 + (r() - 0.5) * 0.6);
  g.add(ember);
  return g;
}

/** A static smoke plume — layered, widening, fading discs drifting slightly
 *  off vertical, standing in for an animated particle system this scene
 *  doesn't have (everything else here is non-animated too; see the file
 *  header on props.ts's InstancedMesh convention). `depthWrite: false` on
 *  SMOKE keeps overlapping puffs from fighting each other's depth test as
 *  the camera orbits, which a flat opacity stack alone doesn't fix. */
function buildSmokeColumn(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const drift = { x: (r() - 0.5) * 1.4, z: (r() - 0.5) * 1.4 };
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + t * 1.1, 7, 5), SMOKE.clone());
    (puff.material as THREE.MeshStandardMaterial).opacity = 0.34 * (1 - t * 0.6);
    puff.position.set(drift.x * t, 0.6 + t * 3.4, drift.z * t);
    // Transparent — keep its own draw call/depth sort rather than merging
    // (mergeStaticGroup skips anything flagged noMerge). Each puff also owns
    // a CLONED material (per-puff opacity), which is the one place this file
    // creates materials outside the shared module-level consts — flagged so
    // disposeScenery() below knows to free it on rebuild instead of leaking
    // one set of clones per scene rebuild (a live band edit, most commonly).
    puff.userData.noMerge = true;
    puff.userData.ownMaterial = true;
    g.add(puff);
  }
  return g;
}

/** One simple tree — trunk + canopy, the "still has cover" silhouette
 *  (props.ts's ambient scatter is bare trunks only, the damaged-ground
 *  read; this is the healthy-canopy read a forest patch or an elevated
 *  treeline needs to plausibly work as cover/a position). `bare` swaps in
 *  the scorched canopy tone for the rare tree inside the destruction
 *  gradient's inner bands. */
function buildTree(r: () => number, bare = false): THREE.Group {
  const g = new THREE.Group();
  const h = 1.6 + r() * 1.3;
  const trunk = cyl(0.09, 0.14, h, 5, TREE_TRUNK);
  trunk.position.y = h / 2;
  g.add(trunk);
  const canopy = cyl(0, 0.75 + r() * 0.45, 1.5 + r() * 0.9, 6, bare ? TREE_CANOPY_BARE : TREE_CANOPY);
  canopy.position.y = h + 0.5;
  g.add(canopy);
  return g;
}

/** A stand of trees dense enough to plausibly cover a firing position —
 *  the "forest patches (artillery cover)" terrain feature Pass 15's
 *  tactical-siting pass needs to exist before it can place anything into
 *  it. Distinct from `props.ts`'s ambient scatter (ubiquitous, bare,
 *  damage-tinted) by being a deliberate, denser, healthier stand. */
function buildForestPatch(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = r() * 4.4;
    const tree = buildTree(r);
    tree.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad * 0.8);
    tree.rotation.y = r() * Math.PI * 2;
    g.add(tree);
  }
  return g;
}

/** Raised ground with a treeline along its crest — the "elevated treelines
 *  (drone positions)" terrain feature, same Pass-15-needs-this-to-exist-first
 *  reasoning as the forest patch above. The mound is a flattened, stretched
 *  low-poly dome rather than a proper heightfield bump (this is a hand-placed
 *  landmark, not a terrain edit — see the file header on why the destruction
 *  gradient and coastal basin stay fixed-world-X functions instead). */
function buildElevatedTreeline(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(5.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MOUND);
  mound.scale.set(1, 0.34, 0.6);
  g.add(mound);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * 2;
    const tree = buildTree(r);
    tree.position.set(t * 3.6, 1.55, (r() - 0.5) * 0.8);
    tree.rotation.y = r() * Math.PI * 2;
    g.add(tree);
  }
  return g;
}

/** A small, damaged built-up block — closer to the line than
 *  `buildUrbanCluster` (reserved for the intact 50 km+ tier by the
 *  destruction gradient), fewer and rougher buildings, some rubble. The
 *  "a built-up block or two" terrain feature for infantry/urban positions
 *  Pass 15's human/positional layer will want to site into. Reuses
 *  `buildHouse`'s condition tiers rather than a third bespoke building
 *  shape — a block is a denser cluster of the same damaged structures a
 *  village already has, not a different kind of object. */
function buildBuiltUpBlock(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  for (let i = 0; i < 6; i++) {
    const condition: Condition = r() > 0.55 ? "damaged" : "ruined";
    const house = buildHouse(condition, r);
    house.scale.setScalar(1.3 + r() * 0.5); // reads as a block frontage, not a cottage
    const a = (i / 6) * Math.PI * 2 + r() * 0.5;
    const rad = 3.5 + r() * 3.5;
    house.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad * 0.75);
    house.rotation.y += r() * Math.PI * 2;
    g.add(house);
  }
  return g;
}

function rngLocal(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

const villageRuined = () => buildVillage("ruined", 0xb17e, 5);
const villageDamaged = () => buildVillage("damaged", 0xc0de, 6);
const villageIntact = () => buildVillage("intact", 0xfeed, 7);

const LANDMARK_BUILDERS = {
  power_plant: buildPowerPlant,
  fuel_depot: buildFuelDepot,
  command_post: buildCommandPost,
  village_ruined: villageRuined,
  village_damaged: villageDamaged,
  village_intact: villageIntact,
  urban_cluster: () => buildUrbanCluster(0x7089),
  port_harbor: buildPortHarbor,
  ruined_infrastructure: buildRuinedInfrastructure,
  wreck_marker: () => buildWreckMarker(0x9a11),
  smoke_column_a: () => buildSmokeColumn(0x5a0c),
  smoke_column_b: () => buildSmokeColumn(0x22e9),
  smoke_column_c: () => buildSmokeColumn(0x9917),
  // Two seeds each, same convention villageRuined/Damaged/Intact already
  // use — a repeated kind at the same seed would be a visible stamp; Pass
  // 15's siting pass may want more variety once it starts placing assets
  // into these, at which point adding a third seed is a one-line change.
  forest_patch_a: () => buildForestPatch(0xf0e51),
  forest_patch_b: () => buildForestPatch(0xf0e52),
  elevated_treeline_a: () => buildElevatedTreeline(0x7ee11),
  elevated_treeline_b: () => buildElevatedTreeline(0x7ee12),
  built_up_block_a: () => buildBuiltUpBlock(0xb10c1),
  built_up_block_b: () => buildBuiltUpBlock(0xb10c2),
} as const;

interface LandmarkSpec {
  kind: keyof typeof LANDMARK_BUILDERS;
  side: Side;
  km: number;
  z: number;
  rotationY: number;
}

/**
 * Fixed, hand-placed landmarks — a handful, not a scatter. Distance stops
 * follow item 1's destruction gradient (ruined near the line, damaged
 * through the mid bands, intact/urban past 50 km) and item 3's ask for a
 * mixed biome — villages, an urban cluster, rolling steppe left as bare
 * terrain, forest belts handled in props.ts. km values are real distances
 * from the zero line; the world-X they land at goes through the same
 * `Projection` the ruler and every real asset use (`worldXFor` below), so a
 * live band edit moves these exactly as it moves everything else — unlike
 * the destruction-gradient *tint* in terrain3d.ts, which is a fixed
 * world-X and does not track band edits (see that file's header).
 */
const LANDMARKS: LandmarkSpec[] = [
  { kind: "power_plant", side: "side_a", km: 95, z: 22, rotationY: 0.4 },
  { kind: "power_plant", side: "side_b", km: 110, z: -18, rotationY: -0.3 },
  { kind: "fuel_depot", side: "side_a", km: 42, z: -26, rotationY: 0.2 },
  { kind: "fuel_depot", side: "side_b", km: 55, z: 30, rotationY: -0.5 },
  { kind: "command_post", side: "side_a", km: 12, z: 40, rotationY: 0.6 },
  { kind: "command_post", side: "side_b", km: 14, z: -36, rotationY: -0.2 },

  // 0-5 km: total destruction — ruined villages right at the line.
  { kind: "village_ruined", side: "side_a", km: 3, z: -44, rotationY: 0.5 },
  { kind: "village_ruined", side: "side_b", km: 3.5, z: 40, rotationY: -0.4 },

  // 5-20 km: damaged forest + mixed-condition structures.
  { kind: "village_damaged", side: "side_a", km: 11, z: 32, rotationY: 0.9 },
  { kind: "village_damaged", side: "side_b", km: 9, z: -30, rotationY: -0.7 },

  // 20-50 km: lighter but visible damage — still calling these "damaged",
  // one tier gentler in practice since buildHouse's own randomness already
  // gives a lighter touch than the 5-20 km pair above.
  { kind: "village_intact", side: "side_a", km: 28, z: -48, rotationY: 0.2 },
  { kind: "village_intact", side: "side_b", km: 33, z: 46, rotationY: -0.6 },

  // 50 km+: mostly intact — a second intact village plus one urban cluster
  // per side, and one occasional destroyed piece of key infrastructure so
  // the "mostly" in "mostly intact" stays honest.
  { kind: "village_intact", side: "side_a", km: 140, z: 20, rotationY: 0.7 },
  { kind: "village_intact", side: "side_b", km: 180, z: -22, rotationY: -0.3 },
  { kind: "urban_cluster", side: "side_a", km: 130, z: -40, rotationY: 0.15 },
  { kind: "urban_cluster", side: "side_b", km: 170, z: 34, rotationY: -0.25 },
  { kind: "ruined_infrastructure", side: "side_a", km: 230, z: 6, rotationY: 0.3 },
  { kind: "ruined_infrastructure", side: "side_b", km: 150, z: 8, rotationY: -0.15 },

  // The coast: a port right at the shoreline (see buildWater in
  // terrain3d.ts) — this is the "place to build out the Russia-naval
  // category" item 2 asked for.
  { kind: "port_harbor", side: "side_b", km: 262, z: -4, rotationY: -0.1 },

  // A couple of hand-placed burning wrecks with an ember glow, on top of
  // props.ts's instanced wreck field.
  { kind: "wreck_marker", side: "side_a", km: 2, z: 8, rotationY: 0.4 },
  { kind: "wreck_marker", side: "side_b", km: 2.2, z: -10, rotationY: -0.6 },
  { kind: "wreck_marker", side: "side_a", km: 4, z: -26, rotationY: 1.1 },

  // Pass 14 item 6: contested-zone dressing — static smoke over the belt
  // that's already the densest with props.ts's instanced craters/wrecks.
  { kind: "smoke_column_a", side: "side_a", km: 1.4, z: -6, rotationY: 0 },
  { kind: "smoke_column_b", side: "side_b", km: 1.8, z: 12, rotationY: 0 },
  { kind: "smoke_column_c", side: "side_a", km: 3.2, z: 18, rotationY: 0 },

  // Pass 14: terrain FEATURES for Pass 15 to site tactical positions into
  // (artillery cover, a drone position, urban infantry ground) — not the
  // positions themselves, which is explicitly next pass's job
  // (PLANNING.md's dependency order). Kept inside the first ~20 km, where
  // that siting will actually happen — a forest patch at 140 km would be
  // scenery no future pass could use for anything.
  { kind: "forest_patch_a", side: "side_a", km: 8, z: -14, rotationY: 0.3 },
  { kind: "forest_patch_b", side: "side_b", km: 7, z: 18, rotationY: -0.5 },
  { kind: "elevated_treeline_a", side: "side_a", km: 15, z: 50, rotationY: 0.6 },
  { kind: "elevated_treeline_b", side: "side_b", km: 17, z: -46, rotationY: -0.3 },
  { kind: "built_up_block_a", side: "side_a", km: 6, z: 16, rotationY: 0.2 },
  { kind: "built_up_block_b", side: "side_b", km: 6.5, z: -18, rotationY: -0.4 },
];

// ── near-line belt (instanced: trench segments, wire, fighting positions) ─

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

const dummy = new THREE.Object3D();

/** A zigzag trench line — not one long straight cut (real trenches traverse
 *  to limit blast/enfilade along their own length), rendered as a chain of
 *  short angled segments hugging the terrain near the line. */
function buildTrenchLine(proj: Projection, side: Side): THREE.Group {
  const g = new THREE.Group();
  const trenchMat = DIRT_WALL;
  const segLen = 3.2;
  const r = rng(side === "side_a" ? 0x7a11 : 0xbeef);
  let z = -STRIP_HALF_Z + 6;
  const x0 = worldXFor(side, 0.4, proj);
  const x1 = worldXFor(side, 2.2, proj);

  while (z < STRIP_HALF_Z - 6) {
    const jog = (r() - 0.5) * (x1 - x0) * 0.6;
    const x = x0 + (x1 - x0) * 0.5 + jog;
    const trench = box(1.6, 0.9, segLen, trenchMat);
    trench.position.set(x, terrainHeight(x, z) + 0.1, z);
    trench.rotation.y = (r() - 0.5) * 0.5;
    g.add(trench);

    // Timber shoring posts along the trench wall — real dugouts are shored
    // with whatever's on hand, and it's the detail that reads as "somebody
    // dug in here" rather than "a rectangle was placed here".
    const post = box(0.12, 1.1, 0.12, WOOD);
    post.position.set(x + 0.75, terrainHeight(x, z) + 0.55, z);
    post.rotation.y = trench.rotation.y;
    g.add(post);

    z += segLen * 0.85;
  }
  return g;
}

/** Concertina wire + dragon's-teeth belt — the instanced obstacle line just
 *  forward of a trench line. */
function buildObstacleBelt(proj: Projection, side: Side, count: number): THREE.InstancedMesh {
  const geo = new THREE.ConeGeometry(0.35, 0.6, 4);
  const mesh = new THREE.InstancedMesh(geo, CONCRETE_DARK, count);
  const r = rng(side === "side_a" ? 0x0bad : 0xf00d);
  const xCenter = worldXFor(side, 0.15, proj);

  for (let i = 0; i < count; i++) {
    const z = -STRIP_HALF_Z + (i / count) * STRIP_HALF_Z * 2;
    const x = xCenter + (r() - 0.5) * 2.2;
    dummy.position.set(x, terrainHeight(x, z) + 0.3, z);
    dummy.rotation.set(0, r() * Math.PI, 0);
    dummy.scale.setScalar(0.8 + r() * 0.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = `scenery:obstacles:${side}`;
  return mesh;
}

/** Small dug-in fighting positions — sandbagged pits — scattered within the
 *  first couple of km either side, denser than the deep rear and sparse
 *  right at the churned scar where nothing stays standing (same logic
 *  props.ts already uses for treelines). */
function buildFightingPositions(proj: Projection, side: Side, count: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(side === "side_a" ? 0x5150 : 0x1234);
  const xNear = worldXFor(side, 1, proj);
  const xFar = worldXFor(side, 7, proj);

  for (let i = 0; i < count; i++) {
    const x = xNear + (xFar - xNear) * r();
    const z = (r() * 2 - 1) * STRIP_HALF_Z;
    const pit = cyl(1.1, 1.3, 0.5, 6, DIRT_WALL);
    pit.position.set(x, terrainHeight(x, z) - 0.1, z);
    g.add(pit);
    for (let b = 0; b < 5; b++) {
      const bag = box(0.55, 0.28, 0.32, SANDBAG);
      const a = (b / 5) * Math.PI * 1.4 - Math.PI * 0.7;
      bag.position.set(x + Math.cos(a) * 1.15, terrainHeight(x, z) + 0.15, z + Math.sin(a) * 1.15);
      bag.rotation.y = a;
      g.add(bag);
    }
  }
  return g;
}

// ── coastal bridge + pontoon crossing (Pass 14 items 4/5) ─────────────────
// Same fixed-world-X convention as terrain3d.ts's destruction gradient and
// coastal basin, and for the same reason: this spans a specific carved
// piece of that basin's inlet, so it has to move in lockstep with it, not
// with a live band edit. It goes through `terrainHeight`/`WATER_LEVEL_Y`
// directly rather than the generic LANDMARKS anchor-and-rotate placement
// every other entry above uses, because a bridge's whole job is to react to
// the ground changing height under it along its length — a single anchor
// point with a fixed local shape can't do that (see docs/DECISIONS.md
// Pass 14 for what went wrong when this was tried as an ordinary landmark).
const BRIDGE_X = -112;
/** Span, in z. Tightened from an original 34–78 after checking the actual
 *  carved depression at this x against terrain3d.ts's `coastThresholdAt` —
 *  COAST_INLET_SIGMA (9) makes for a narrower true inlet than the wider span
 *  implied, and a bridge whose "collapsed centre" landed on ground that was
 *  never wet in the first place was worse than the seam this pass exists to
 *  fix. 42–60 tightly brackets the real dip (dry until ~z 46, genuinely
 *  below WATER_LEVEL_Y only within a few units of z 50, dry again by ~54 —
 *  see docs/DECISIONS.md Pass 14 for the sampled numbers). */
const BRIDGE_Z0 = 42;
const BRIDGE_Z1 = 60;
/** Clearance above whichever is higher at a given z — the (possibly
 *  depressed) ground or the water surface — so the deck can never intersect
 *  either regardless of exactly where the inlet's noise-wobbled shoreline
 *  actually falls at that point. Adaptive on purpose: hand-tuning a fixed
 *  height against a procedural, noise-carved coastline is a losing game. */
function bridgeDeckY(z: number): number {
  return Math.max(terrainHeight(BRIDGE_X, z), WATER_LEVEL_Y) + 1.6;
}

/** A destroyed span (collapsed centre, exposed rebar — same language as
 *  `buildRuinedInfrastructure`) plus a low pontoon crossing beside it — more
 *  representative of this war than an intact bridge (Pass 14 brief item 5),
 *  and it demonstrates the inlet from terrain3d.ts is real, crossable water
 *  rather than a colour change in the ground. */
function buildCoastalBridge(): THREE.Group {
  const g = new THREE.Group();
  g.name = "scenery:bridge";
  const r = rngLocal(0xb41d9e);
  const segments = 7;
  const gapAt = 3; // the collapsed segment, landing on the real wet centre (z≈50)
  const segLen = (BRIDGE_Z1 - BRIDGE_Z0) / segments;

  for (let i = 0; i < segments; i++) {
    const z = BRIDGE_Z0 + (i + 0.5) * segLen;
    const y = bridgeDeckY(z);
    if (i === gapAt) {
      const collapse = box(2.4, 0.5, segLen * 1.3, RUBBLE);
      collapse.position.set(BRIDGE_X + 0.6, Math.max(terrainHeight(BRIDGE_X, z), WATER_LEVEL_Y) + 0.3, z);
      collapse.rotation.set(0.28, 0.15, 0.35);
      g.add(collapse);
      for (let s = 0; s < 3; s++) {
        const strut = cyl(0.05, 0.05, 2.1, 4, METAL_RUST);
        strut.position.set(BRIDGE_X + (r() - 0.5) * 1.6, y - 0.6, z + (s - 1) * (segLen * 0.35));
        strut.rotation.z = 0.4 + r() * 0.3;
        g.add(strut);
      }
      continue;
    }
    const deck = box(2.2, 0.4, segLen * 0.92, BRIDGE_DECK);
    deck.position.set(BRIDGE_X, y, z);
    g.add(deck);
    // Piers flanking the collapsed segment stand in the water; the rest of
    // the intact deck is close enough to grade not to need one.
    if (Math.abs(i - gapAt) === 1) {
      const pier = cyl(0.5, 0.65, Math.max(0.6, y - WATER_LEVEL_Y), 8, CONCRETE_DARK);
      pier.position.set(BRIDGE_X, (y + WATER_LEVEL_Y) / 2, z);
      g.add(pier);
    }
  }

  // Pontoon crossing: a chain of low floats + a plank walkway, offset to one
  // side of the destroyed span — the field-expedient replacement, not a
  // repair of the original.
  const pontoonX = BRIDGE_X + 4.2;
  const floatCount = 12;
  for (let i = 0; i < floatCount; i++) {
    const z = BRIDGE_Z0 + ((i + 0.5) / floatCount) * (BRIDGE_Z1 - BRIDGE_Z0);
    const y = Math.max(terrainHeight(pontoonX, z), WATER_LEVEL_Y) + 0.18;
    const float = box(1.3, 0.3, (BRIDGE_Z1 - BRIDGE_Z0) / floatCount + 0.15, METAL_RUST);
    float.position.set(pontoonX + (r() - 0.5) * 0.2, y, z);
    g.add(float);
  }
  // Walkway across the floats, built as short segments rather than one long
  // plank — the pontoon crossing sits right at the water, and a single
  // straight beam across a noise-wobbled shoreline would clip it somewhere
  // along its length. Short segments, each independently levelled between
  // its two floats, follow the same adaptive height they do.
  for (let i = 0; i < floatCount - 1; i++) {
    const z0 = BRIDGE_Z0 + ((i + 0.5) / floatCount) * (BRIDGE_Z1 - BRIDGE_Z0);
    const z1 = BRIDGE_Z0 + ((i + 1.5) / floatCount) * (BRIDGE_Z1 - BRIDGE_Z0);
    const y0 = Math.max(terrainHeight(pontoonX, z0), WATER_LEVEL_Y) + 0.34;
    const y1 = Math.max(terrainHeight(pontoonX, z1), WATER_LEVEL_Y) + 0.34;
    const seg = box(0.7, 0.06, z1 - z0 + 0.1, WOOD);
    seg.position.set(pontoonX, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = Math.atan2(y1 - y0, z1 - z0);
    g.add(seg);
  }

  return g;
}

export interface SceneryBudget {
  fightingPositionsPerSide: number;
  obstaclesPerSide: number;
}

export const SCENERY_BUDGET: Record<"high" | "low", SceneryBudget> = {
  high: { fightingPositionsPerSide: 14, obstaclesPerSide: 90 },
  low: { fightingPositionsPerSide: 6, obstaclesPerSide: 40 },
};

/** Builds the whole scenery group: landmarks + near-line belt + the coastal
 *  water plane + the coastal bridge, both sides. Called alongside
 *  buildTerrain()/buildProps() and disposed the same way. `halfWidthX` sizes
 *  the water plane's far edge to match whatever terrain extent was actually
 *  generated. */
export function buildScenery(proj: Projection, budget: SceneryBudget, halfWidthX: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "scenery";

  // A generic village drawn on top of the real Pokrovsk-AOI rail junction
  // (osmTerrain.ts) would read as a rendering bug, not two honest layers —
  // so any LANDMARKS entry whose world position falls inside the inset's
  // footprint is skipped rather than drawn through it.
  const insetBounds = osmInsetBounds(proj);
  for (const spec of LANDMARKS) {
    const x = worldXFor(spec.side, spec.km, proj);
    if (x >= insetBounds.xMin && x <= insetBounds.xMax && spec.z >= insetBounds.zMin && spec.z <= insetBounds.zMax) {
      continue;
    }
    const model = LANDMARK_BUILDERS[spec.kind]();
    model.position.set(x, terrainHeight(x, spec.z), spec.z);
    model.rotation.y = spec.rotationY;
    model.name = `scenery:landmark:${spec.kind}:${spec.side}`;
    g.add(model);
  }

  for (const side of ["side_a", "side_b"] as Side[]) {
    g.add(buildTrenchLine(proj, side));
    g.add(buildObstacleBelt(proj, side, budget.obstaclesPerSide));
    g.add(buildFightingPositions(proj, side, budget.fightingPositionsPerSide));
  }

  g.add(buildCoastalBridge());

  const water = buildWater(halfWidthX);
  if (water) g.add(water);

  return g;
}

export function disposeScenery(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
      o.geometry.dispose();
      // Every material in this file is a shared module-level const EXCEPT
      // the smoke puffs' per-instance opacity clones (see buildSmokeColumn) —
      // those are the only ones this rebuild actually owns.
      if (o.userData.ownMaterial && !Array.isArray(o.material)) o.material.dispose();
    }
  });
}
