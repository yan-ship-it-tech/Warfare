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
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import type { Side } from "../types";
import type { Projection } from "../scene/projection";
import { terrainHeight } from "./terrain3d";
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

const LANDMARK_BUILDERS = {
  power_plant: buildPowerPlant,
  fuel_depot: buildFuelDepot,
  command_post: buildCommandPost,
} as const;

interface LandmarkSpec {
  kind: keyof typeof LANDMARK_BUILDERS;
  side: Side;
  km: number;
  z: number;
  rotationY: number;
}

/** Fixed, hand-placed landmarks — a handful, not a scatter. One of each per
 *  side, at illustrative rear-area distances, so the deep-rear bands read
 *  as somewhere rather than as bare ground the schematic view's icons used
 *  to float over. */
const LANDMARKS: LandmarkSpec[] = [
  { kind: "power_plant", side: "side_a", km: 95, z: 22, rotationY: 0.4 },
  { kind: "power_plant", side: "side_b", km: 110, z: -18, rotationY: -0.3 },
  { kind: "fuel_depot", side: "side_a", km: 42, z: -26, rotationY: 0.2 },
  { kind: "fuel_depot", side: "side_b", km: 55, z: 30, rotationY: -0.5 },
  { kind: "command_post", side: "side_a", km: 12, z: 40, rotationY: 0.6 },
  { kind: "command_post", side: "side_b", km: 14, z: -36, rotationY: -0.2 },
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

/** Builds the whole scenery group: landmarks + near-line belt, both sides.
 *  Called alongside buildTerrain()/buildProps() and disposed the same way. */
export function buildScenery(proj: Projection, budget: SceneryBudget): THREE.Group {
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

  return g;
}

export function disposeScenery(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
      o.geometry.dispose();
    }
  });
}
