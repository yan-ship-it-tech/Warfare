// ─────────────────────────────────────────────────────────────────────────
// Static-geometry merge.
//
// Pass 13's baseline measurement said 845 draw calls for a scene of ~90
// assets. Almost none of that is the assets: it is the *dressing* — every
// sandbag in every fighting position, every plank of every landmark, every
// box and cylinder of every hero model is its own THREE.Mesh, and each one
// is its own draw call even though it never moves, never changes colour and
// shares a material with dozens of its neighbours.
//
// This walks a finished group, bakes each static mesh's world transform into
// its vertices, and merges everything sharing a material into one mesh. The
// triangle count is unchanged — the picture is identical — but the per-draw
// overhead collapses, which is the half of frame cost a phone actually feels.
//
// What it deliberately leaves alone:
//   • InstancedMesh          already one draw for N copies; merging would undo that
//   • THREE.Line / LineSegments  different draw mode, can't share a batch
//   • anything with a `userData.noMerge` flag, or a named object a caller
//     still needs to find with getObjectByName()
//
// Geometries are normalised to non-indexed before merging: mergeGeometries()
// refuses a mix, and this scene's low-poly flat-shaded style shares no
// vertices between faces anyway, so nothing is lost by dropping the index.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Attributes kept on a merged geometry. Anything else a source geometry
 *  carries is dropped — mergeGeometries() requires every input to agree on
 *  the attribute set, and these three are what this scene's materials read. */
const KEEP = ["position", "normal", "uv"] as const;

/** Width of one merge bucket along X, world units. Roughly a screenful at the
 *  default framing — small enough that panning to one end of the strip still
 *  culls the other, large enough that a bucket holds real batches. */
const MERGE_BUCKET_X = 90;

function normalise(geo: THREE.BufferGeometry): THREE.BufferGeometry | null {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!KEEP.includes(name as (typeof KEEP)[number])) g.deleteAttribute(name);
  }
  // A geometry missing one of the three can't join the batch — bail rather
  // than merging something that would render with garbage normals or UVs.
  for (const name of KEEP) {
    if (!g.getAttribute(name)) {
      g.dispose();
      return null;
    }
  }
  g.morphAttributes = {};
  return g;
}

export interface MergeResult {
  /** Draw calls before / after, for the perf log. */
  before: number;
  after: number;
}

/**
 * Merges every mergeable descendant of `root` in place. Returns what it did
 * so a caller (or the HUD) can report it.
 */
export function mergeStaticGroup(root: THREE.Object3D): MergeResult {
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // Keyed by material AND by a coarse X bucket. Material alone would collapse
  // the whole strip's concrete into one mesh spanning ~400 world units, which
  // can never be frustum-culled — trading 300 draw calls for rasterising the
  // far rear on every frame is not obviously a win. Bucketing keeps the
  // batches big and the culling coarse-but-real.
  const batches = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; sources: THREE.Mesh[] }>();
  const materialKeys = new Map<THREE.Material, number>();
  let before = 0;

  root.traverse((o) => {
    if (o === root) return;
    if (o instanceof THREE.InstancedMesh) {
      before += 1;
      return;
    }
    if (!(o instanceof THREE.Mesh)) {
      if ((o as THREE.Line).isLine) before += 1;
      return;
    }
    before += 1;
    if (o.userData.noMerge) return;
    const mat = o.material;
    if (Array.isArray(mat)) return; // multi-material mesh — leave it be
    const geo = normalise(o.geometry);
    if (!geo) return;
    // Bake the mesh's transform RELATIVE to root, so the merged result can be
    // parented to root and land in exactly the same place.
    const local = new THREE.Matrix4().multiplyMatrices(rootInverse, o.matrixWorld);
    geo.applyMatrix4(local);
    let matKey = materialKeys.get(mat);
    if (matKey === undefined) {
      matKey = materialKeys.size;
      materialKeys.set(mat, matKey);
    }
    const key = `${matKey}:${Math.floor(local.elements[12] / MERGE_BUCKET_X)}`;
    const bucket = batches.get(key);
    if (bucket) {
      bucket.geos.push(geo);
      bucket.sources.push(o);
    } else {
      batches.set(key, { mat, geos: [geo], sources: [o] });
    }
  });

  let after = before;
  for (const { mat, geos, sources } of batches.values()) {
    // A material used exactly once saves nothing and costs a geometry clone.
    if (geos.length < 2) {
      geos.forEach((g) => g.dispose());
      continue;
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    for (const src of sources) {
      src.geometry.dispose();
      src.removeFromParent();
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `merged:${mat.name || mat.type}:${sources.length}`;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    after -= sources.length - 1;
  }

  // Groups left holding nothing are pure overhead in the traversal the
  // renderer runs every frame. Repeat until stable — emptying a leaf group
  // can leave its parent empty too.
  for (;;) {
    const empties: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o !== root && o.children.length === 0 && !(o as THREE.Mesh).isMesh && !(o as THREE.Line).isLine) {
        empties.push(o);
      }
    });
    if (empties.length === 0) break;
    for (const e of empties) e.removeFromParent();
  }

  return { before, after };
}
