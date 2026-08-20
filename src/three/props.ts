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
  const r = rng(0x5eed);

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    const x = (r() * 2 - 1) * PROP_EXTENT;
    const z = (r() * 2 - 1) * SCENERY_HALF_Z;

    // Treelines in this landscape follow field boundaries, not open ground —
    // banding keeps them in belts instead of dusting them everywhere. The
    // frequency ratio is Pass 17's, derived from data/osm/pokrovsk.json's real
    // windbreak-row orientation; Pass 24 only restated both terms per metre.
    const belt = Math.abs(Math.sin(z * BELT_Z_FREQ + x * BELT_X_FREQ));
    if (belt < 0.72 && r() > 0.12) continue;
    // Thinned out right at the line, where nothing is left standing.
    if (Math.abs(x) < 1_600 && r() > 0.25) continue;
    // And thinned toward the rear on the same curve the terrain detail fades
    // on, so the belt dissolves into the compressed register instead of
    // stopping at a line.
    if (r() > groundFidelity(x) * 0.85 + 0.15) continue;
    // Thinned laterally on the same curve, so the belt does not stop dead at
    // the sector's edge and announce it.
    if (Math.abs(z) > STRIP_HALF_Z && r() * (SCENERY_HALF_Z - STRIP_HALF_Z) < Math.abs(z) - STRIP_HALF_Z) continue;
    // Nothing grows in the river or the coastal basin.
    if (isInWater(x, z)) continue;

    const dmg = damageIntensity(x);
    // A damaged belt also skews shorter — storm-broken trunks, not full height.
    const h = (2.2 + r() * 3.4) * (1 - dmg * 0.35);
    dummy.position.set(x, terrainHeight(x, z) - 0.1, z);
    dummy.rotation.set((r() - 0.5) * 0.22, r() * Math.PI, (r() - 0.5) * 0.22);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    tmpColor.copy(TREE_BARE).lerp(TREE_HEALTHY, 1 - dmg);
    mesh.setColorAt(placed, tmpColor);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  mesh.name = "props:trees";
  return mesh;
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
  const r = rng(0x9b1d);

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    const x = (r() * 2 - 1) * PROP_EXTENT;
    const z = (r() * 2 - 1) * SCENERY_HALF_Z;
    if (isInWater(x, z)) continue;
    if (r() > groundFidelity(x) * 0.85 + 0.15) continue;
    if (Math.abs(z) > STRIP_HALF_Z && r() * (SCENERY_HALF_Z - STRIP_HALF_Z) < Math.abs(z) - STRIP_HALF_Z) continue;
    const s = 0.4 + r() * 1.1;
    dummy.position.set(x, terrainHeight(x, z) + 0.1, z);
    dummy.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "props:scrub";
  return mesh;
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
