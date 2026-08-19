// ─────────────────────────────────────────────────────────────────────────
// Scatter props — the environmental detail that makes the strip read as
// ground rather than as a coloured plane.
//
// Every prop type is a single InstancedMesh: one geometry, one material, one
// draw call for hundreds of objects. This is where instancing genuinely
// earns its place (the hero models are ~11 unique objects and would gain
// nothing from it), and it is why the prop budget can be raised later without
// the frame cost tracking it linearly.
//
// Pass 10: trees and wrecks now use `damageIntensity(x)` from terrain3d.ts to
// vary per-instance colour (InstancedMesh.setColorAt — one extra buffer, not
// an extra draw call) so the same treeline mesh reads as a shattered, bare
// belt near the line and a healthy green one further out, instead of a single
// flat colour everywhere.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { STRIP_HALF_Z, hashId } from "./worldMapping";
import { terrainHeight, damageIntensity } from "./terrain3d";

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
 * no canopy, densest where the shelling has been heaviest. Colour now shifts
 * from bare/scorched near the line to a green canopy tint further out, via
 * the same damage gradient the terrain and wreck scatter read.
 */
function buildTrees(halfWidthX: number, count: number): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(0.05, 0.22, 1, 5);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#4a4237", flatShading: true, roughness: 1, vertexColors: true });
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

/**
 * Burnt-out vehicle husks — the "burning wrecks" the 0-5/5-20 km destruction
 * gradient calls for. Instanced like craters (concentrated the same way,
 * same Gaussian-ish clustering) rather than hand-placed unique groups: there
 * is no per-instance emissive/flame accent here on purpose, because an
 * InstancedMesh shares one material across every instance and a flickering
 * flame would need one anyway — scenery.ts's hand-placed landmarks are where
 * that per-object detail belongs (see buildWreckMarker there). This mesh is
 * what makes wrecks read as a *field* of them near the line, not a couple of
 * isolated set-pieces.
 */
function buildWreckHusks(count: number): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1.3, 0.6, 2.4);
  const mat = new THREE.MeshStandardMaterial({ color: "#241f18", flatShading: true, roughness: 0.85, metalness: 0.25 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(0xdead10cc);

  for (let i = 0; i < count; i++) {
    // Tighter clustering than craters — wrecks are rarer and belong closer
    // to the line, inside roughly the 0-10 km destruction band.
    const g = (r() + r() + r() - 1.5) / 1.5;
    const x = g * 20;
    const z = (r() * 2 - 1) * STRIP_HALF_Z;
    const s = 0.7 + r() * 0.6;
    dummy.position.set(x, terrainHeight(x, z) + 0.28, z);
    dummy.rotation.set((r() - 0.5) * 0.4, r() * Math.PI, (r() - 0.5) * 0.5);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
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

/** Tuned down on low-power devices — see Scene3D's quality detection. */
export const PROP_BUDGET: Record<"high" | "low", PropBudget> = {
  high: { trees: 900, craters: 340, scrub: 700, wrecks: 46 },
  low: { trees: 300, craters: 130, scrub: 220, wrecks: 18 },
};

export function buildProps(halfWidthX: number, budget: PropBudget): THREE.Group {
  const g = new THREE.Group();
  g.name = "props";
  g.add(buildTrees(halfWidthX, budget.trees));
  g.add(buildCraters(budget.craters));
  g.add(buildScrub(halfWidthX, budget.scrub));
  g.add(buildWreckHusks(budget.wrecks));
  return g;
}

/** Unique-but-stable prop rotation for an asset id, so a marker's little
 *  ground pad doesn't sit at the same angle as every other one. */
export function stableAngle(id: string): number {
  return hashId(id) * Math.PI * 2;
}
