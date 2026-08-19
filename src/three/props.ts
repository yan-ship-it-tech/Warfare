// ─────────────────────────────────────────────────────────────────────────
// Scatter props — the environmental detail that makes the strip read as
// ground rather than as a coloured plane.
//
// Every prop type is a single InstancedMesh: one geometry, one material, one
// draw call for hundreds of objects. This is where instancing genuinely
// earns its place (the hero models are ~11 unique objects and would gain
// nothing from it), and it is why the prop budget can be raised later without
// the frame cost tracking it linearly.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { STRIP_HALF_Z, hashId } from "./worldMapping";
import { terrainHeight } from "./terrain3d";

/** Deterministic RNG so the scatter is identical on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

const dummy = new THREE.Object3D();

/**
 * Shattered treeline — the single most recognisable signature of ground that
 * has been fought over for years, and cheap to convey: bare tapered trunks,
 * no canopy, densest where the shelling has been heaviest.
 */
function buildTrees(halfWidthX: number, count: number): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(0.05, 0.22, 1, 5);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#4a4237", flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(0x5eed);

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    const x = (r() * 2 - 1) * halfWidthX;
    const z = (r() * 2 - 1) * STRIP_HALF_Z;

    // Treelines in this landscape follow field boundaries, not open ground —
    // banding on z keeps them in belts instead of dusting them everywhere.
    const belt = Math.abs(Math.sin(z * 0.09 + x * 0.004));
    if (belt < 0.72 && r() > 0.12) continue;
    // Thinned out right at the line, where nothing is left standing.
    if (Math.abs(x) < 16 && r() > 0.25) continue;

    const h = 2.2 + r() * 3.4;
    dummy.position.set(x, terrainHeight(x, z) - 0.1, z);
    dummy.rotation.set((r() - 0.5) * 0.22, r() * Math.PI, (r() - 0.5) * 0.22);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed++, dummy.matrix);
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = true;
  mesh.name = "props:trees";
  return mesh;
}

/**
 * Shell craters, concentrated on the zero line. The density falloff either
 * side is doing real explanatory work — it is the visual answer to "why is
 * everything pushed back from the line."
 */
function buildCraters(count: number): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(1, 0.55, 0.36, 9);
  const mat = new THREE.MeshStandardMaterial({ color: "#2f2b22", flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(0xc4a7e5);

  for (let i = 0; i < count; i++) {
    // Gaussian-ish clustering on x via summed uniforms.
    const g = (r() + r() + r() - 1.5) / 1.5;
    const x = g * 34;
    const z = (r() * 2 - 1) * STRIP_HALF_Z;
    const s = 0.7 + r() * 1.9;
    dummy.position.set(x, terrainHeight(x, z) - 0.16, z);
    dummy.rotation.set(0, r() * Math.PI, 0);
    dummy.scale.set(s, 0.5 + r() * 0.5, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "props:craters";
  return mesh;
}

/** Low scrub/debris, everywhere, cheapest possible ground texture break-up. */
function buildScrub(halfWidthX: number, count: number): THREE.InstancedMesh {
  const geo = new THREE.TetrahedronGeometry(0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#5b5a3e", flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(0x9b1d);

  for (let i = 0; i < count; i++) {
    const x = (r() * 2 - 1) * halfWidthX;
    const z = (r() * 2 - 1) * STRIP_HALF_Z;
    const s = 0.4 + r() * 1.1;
    dummy.position.set(x, terrainHeight(x, z) + 0.1, z);
    dummy.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "props:scrub";
  return mesh;
}

export interface PropBudget {
  trees: number;
  craters: number;
  scrub: number;
}

/** Tuned down on low-power devices — see Scene3D's quality detection. */
export const PROP_BUDGET: Record<"high" | "low", PropBudget> = {
  high: { trees: 900, craters: 340, scrub: 700 },
  low: { trees: 300, craters: 130, scrub: 220 },
};

export function buildProps(halfWidthX: number, budget: PropBudget): THREE.Group {
  const g = new THREE.Group();
  g.name = "props";
  g.add(buildTrees(halfWidthX, budget.trees));
  g.add(buildCraters(budget.craters));
  g.add(buildScrub(halfWidthX, budget.scrub));
  return g;
}

/** Unique-but-stable prop rotation for an asset id, so a marker's little
 *  ground pad doesn't sit at the same angle as every other one. */
export function stableAngle(id: string): number {
  return hashId(id) * Math.PI * 2;
}
