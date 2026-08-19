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
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import type { Side } from "../types";
import type { Projection } from "../scene/projection";
import { terrainHeight, buildWater } from "./terrain3d";
import { worldXFor, STRIP_HALF_Z } from "./worldMapping";

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

export interface SceneryBudget {
  fightingPositionsPerSide: number;
  obstaclesPerSide: number;
}

export const SCENERY_BUDGET: Record<"high" | "low", SceneryBudget> = {
  high: { fightingPositionsPerSide: 14, obstaclesPerSide: 90 },
  low: { fightingPositionsPerSide: 6, obstaclesPerSide: 40 },
};

/** Builds the whole scenery group: landmarks + near-line belt + the coastal
 *  water plane, both sides. Called alongside buildTerrain()/buildProps() and
 *  disposed the same way. `halfWidthX` sizes the water plane's far edge to
 *  match whatever terrain extent was actually generated. */
export function buildScenery(proj: Projection, budget: SceneryBudget, halfWidthX: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "scenery";

  for (const spec of LANDMARKS) {
    const model = LANDMARK_BUILDERS[spec.kind]();
    const x = worldXFor(spec.side, spec.km, proj);
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

  const water = buildWater(halfWidthX);
  if (water) g.add(water);

  return g;
}

export function disposeScenery(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
      o.geometry.dispose();
    }
  });
}
