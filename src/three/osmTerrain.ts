// ─────────────────────────────────────────────────────────────────────────
// The OSM metric inset — Pass 17 item 1.
//
// Resolves docs/OSM_PIPELINE.md's "pick one before writing extrusion code"
// choice: **Option 1, metric inset**, per PLANNING.md's decisions-already-
// made table. `data/osm/pokrovsk.json`'s real rail/tree/road/river geometry
// is drawn at a single true-to-itself scale (1 "unit-per-km" derived from
// the live band projection at one anchor point, not the compressed axis)
// inside one band's span — a local patch, not a claim about the whole map.
// Never call this "Pokrovsk" in UI copy; it's an illustrative composite that
// happens to be built from one real town's geometry. See docs/DECISIONS.md
// Pass 17 for the full anchor/scale derivation.
//
// The 1.7 MB source file is loaded via a dynamic import, not a static one —
// it gets its own chunk (191 KB gzipped) that only downloads once the 3D
// terrain actually builds, same reasoning that makes Scene3D itself
// React.lazy. loadOsmData() memoizes the promise so a re-render never
// re-fetches it.
// ── Pass 25 ──────────────────────────────────────────────────────────────
// The patch is still drawn at 1:1 — a real metre of rail is a world metre of
// rail — and it is now WINDOWED rather than clipped only at the strip edge.
//
// The reason is the zone model. The Line zone is 3,000 world metres wide and
// stands for 50 km of real depth. The AOI is 20 km across. Drawing all of it
// at 1:1 would put six and a half times the zone's entire width of real
// geometry into it and spill through both transition seams; scaling it down
// to fit would break the one thing this data is here for, which is being true
// to itself next to a 7 m vehicle. So the patch keeps its scale and gives up
// its extent: a PATCH_HALF_X_KM x PATCH_HALF_Z_KM window of the real extract,
// centred on the AOI, drawn 1:1, anchored inside The Line.
//
// `ANCHOR_KM` is unchanged at 17, so the OSM-railhead ammo point's own
// `placement_rationale` in data/assets/ still says something true — what
// changed is only where 17 km lands in world space, which is the zone
// model's business and not this file's.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import type { Side } from "../types";
import { surfaceHeight } from "./terrain3d";
import { worldXFor } from "./worldMapping";
import { METRES_PER_KM } from "./zones";

// ── anchor + scale ─────────────────────────────────────────────────────
/** Where the inset sits: side_a's near-front band (op_near, 5-30 km) — real
 *  Ukrainian territory, matching where a town like this actually would be,
 *  without the UI ever asserting it IS that town. 17 km leaves a comfortable
 *  margin either side of the AOI's own ~9 km half-extent before the band's
 *  5 km / 30 km edges (docs/DECISIONS.md Pass 17 works the exact numbers). */
// Exported (Pass 18) so the OSM-railhead ammo point's siting code — and its
// own data/assets/*.json rationale text — can cite the literal same
// constant instead of a second hardcoded "17" that could silently drift
// from this one.
export const ANCHOR_SIDE: Side = "side_a";
export const ANCHOR_KM = 17;
/**
 * The window into the extract, in the OSM data's own km frame.
 *
 * 1.2 km either side along the depth axis: 2.4 km of the Line zone's 3,000 m,
 * which still leaves the zone's inner sixth (the churned belt, the trench
 * line, the river) clear and puts the patch where a town behind the immediate
 * contact line would actually be.
 *
 * 2.5 km either side laterally: Z is genuine metres and the strip is +/-6 km,
 * so this is a free choice rather than a forced one, and a 2.4 x 5 km patch
 * reads as ONE PLACE. The full +/-5.7 km the strip allows drew a band of real
 * geometry straight across the whole frontage, which reads as a texture
 * rather than as a town.
 *
 * The window is OFFSET, not centred, and that offset was measured rather than
 * guessed. Total vertex density across the extract is close to uniform along
 * X, but the RAIL is not: 79% of rail vertices inside |z| < 2.5 km sit
 * between x = -0.4 and x = +2.0 km — that is the freight yard, which is the
 * one feature of this extract anyone will recognise as real. A window centred
 * on the AOI captured 103 rail segments; this one captures roughly three
 * times that, from the same data at the same 1:1 scale.
 */
const PATCH_HALF_X_KM = 1.2;
const PATCH_HALF_Z_KM = 2.5;
/** Centre of the window in the extract's own frame, km east of the AOI
 *  centre. See above — this is where the yard is. */
const PATCH_CENTER_X_KM = 0.8;

/** World units per real km inside the patch — 1,000, i.e. 1:1, and that is
 *  the whole point of the patch. It is NOT the scene's depth scale any more
 *  (there isn't one — see zones.ts), which is exactly why the window above
 *  has to be small. tacticalSiting.ts sites the OSM-railhead ammo point
 *  through this and must keep doing so rather than re-deriving a second
 *  answer. */
export function unitsPerKm(): number {
  return METRES_PER_KM;
}

export function anchorXAt(): number {
  return worldXFor(ANCHOR_SIDE, ANCHOR_KM);
}

// ── OSM data shape (subset actually used) ─────────────────────────────────
interface OsmFeature {
  type: "rail_line" | "tree_row" | "road" | "river";
  closed: boolean;
  xz: [number, number][]; // [east_km, south_km] relative to the AOI centre
}
interface OsmFile {
  features: OsmFeature[];
  source: { attribution: string; license: string };
}

let osmPromise: Promise<OsmFile> | null = null;
/** Loads and memoizes data/osm/pokrovsk.json. Safe to call every render —
 *  the dynamic import only actually fetches once. */
export function loadOsmData(): Promise<OsmFile> {
  if (!osmPromise) {
    osmPromise = import("../../data/osm/pokrovsk.json").then((m) => m.default as unknown as OsmFile);
  }
  return osmPromise;
}

// ── clipping ────────────────────────────────────────────────────────────
/** Splits a polyline at wherever it leaves the ±PATCH_HALF_X_KM box, dropping
 *  the outside runs entirely. A vertex-level cut, not a true segment/box
 *  intersection (Liang-Barsky) — at this data's 5 m simplification, the
 *  difference is at most one vertex's worth of a line that would have kept
 *  going in roughly the same direction anyway, and it keeps this function
 *  simple. Flagged rather than silently upgraded later without a reason to. */
function clipPolyline(pts: [number, number][]): [number, number][][] {
  const out: [number, number][][] = [];
  let run: [number, number][] = [];
  const inside = (p: [number, number]) =>
    Math.abs(p[0] - PATCH_CENTER_X_KM) <= PATCH_HALF_X_KM && Math.abs(p[1]) <= PATCH_HALF_Z_KM;
  for (const p of pts) {
    if (inside(p)) run.push(p);
    else if (run.length) {
      out.push(run);
      run = [];
    }
  }
  if (run.length > 1) out.push(run);
  return out;
}

function ringBBox(pts: [number, number][]): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, x1, z0, z1 };
}

function ringArea(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/** Standard ray-casting point-in-polygon test, km-space. */
function pointInRing(x: number, z: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ── deterministic RNG (same convention as props.ts/scenery.ts) ────────────
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

// ── ribbon builder (shared by rail + road + the in-patch river) ──────────
/** Accumulates one indexed BufferGeometry across every clipped sub-polyline
 *  of every feature of one type, so the whole layer (all 303 rail features,
 *  clipped) is one Mesh, one draw call — "instance from the start" applies
 *  to merged ribbons as much as to InstancedMesh. */
class RibbonBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private cursor = 0;

  constructor(
    private readonly width: number,
    private readonly color: THREE.Color,
    private readonly yOffset: number,
  ) {}

  addPolyline(worldPts: { x: number; z: number }[]): void {
    if (worldPts.length < 2) return;
    const start = this.cursor;
    for (let i = 0; i < worldPts.length; i++) {
      const p = worldPts[i];
      // Perpendicular direction from the local tangent, so the ribbon has a
      // real width and follows the path's own turns rather than staying
      // axis-aligned.
      const prev = worldPts[Math.max(0, i - 1)];
      const next = worldPts[Math.min(worldPts.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // Perpendicular in the XZ plane: (-dz, dx).
      const nx = -dz * (this.width / 2);
      const nz = dx * (this.width / 2);
      const y = surfaceHeight(p.x, p.z) + this.yOffset;
      this.positions.push(p.x - nx, y, p.z - nz, p.x + nx, y, p.z + nz);
      this.colors.push(this.color.r, this.color.g, this.color.b, this.color.r, this.color.g, this.color.b);
      if (i > 0) {
        const a = start + (i - 1) * 2;
        const b = a + 1;
        const c = start + i * 2;
        const d = c + 1;
        // Same +Y winding derived for terrain3d.ts's river ribbon.
        this.indices.push(a, d, b, a, c, d);
      }
    }
    this.cursor += worldPts.length * 2;
  }

  build(name: string): THREE.Mesh | null {
    if (this.indices.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setIndex(this.indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    return mesh;
  }
}

const RAIL_COLOR = new THREE.Color("#8a887c"); // ballast grey
const ROAD_COLOR = new THREE.Color("#7a7260"); // packed dirt/gravel track
const RIVER_COLOR = new THREE.Color("#2f5561");
const TREE_TRUNK_COLOR = new THREE.Color("#4a4237");

/** Sample pitch for instanced trees, METRES. A real windbreak plants at
 *  4-8 m; 18 draws the row rather than the individual trees, which is the
 *  honest read of what the source data actually says — it gives a row's
 *  path, never individual tree positions (docs/OSM_PIPELINE.md). Tightening
 *  it to true planting distance would multiply the instance count fourfold
 *  to assert positions the data does not contain. */
const TREE_PITCH = 18;
/** Trees per km² for a closed wood/parcel ring, scattered by rejection
 *  sampling rather than a grid. Raised with the metric rescale: the cap used
 *  to be the binding constraint at any real parcel size. */
const WOOD_TREES_PER_KM2 = 900;
const WOOD_TREES_MAX = 60;

interface OsmBuildResult {
  group: THREE.Group;
  attribution: string;
}

/**
 * Builds the whole inset: rail + road ribbons, a small in-patch river
 * ribbon, and one combined InstancedMesh for every tree (open windbreak rows
 * sampled along their clipped path, closed wood/parcel rings rejection-
 * sampled by area). Pure given `osm` — safe to call every time the
 * terrain-building effect re-runs; the caller owns memoizing the data load.
 */
export function buildOsmInset(osm: OsmFile): OsmBuildResult {
  const group = new THREE.Group();
  group.name = "osm-inset";

  const scale = unitsPerKm();
  const anchorX = anchorXAt();
  // See the file header: "east" maps to increasing world-X (toward the
  // front/toward side_b) regardless of which side the inset anchors on —
  // real terrain east of Pokrovsk is the direction Russian forces have
  // actually approached from on this front, so the mapping stays honest
  // rather than arbitrary.
  // The window's own centre lands on the anchor, so offsetting the window
  // inside the extract does not slide the drawn patch out of its zone.
  const toWorld = (p: [number, number]) => ({
    x: anchorX + (p[0] - PATCH_CENTER_X_KM) * scale,
    z: p[1] * scale,
  });

  // Metres (Pass 24): a double-track rail corridor with its ballast is
  // ~6 m across, a rural road ~7, a minor river ~26. Before this pass the
  // same numbers were 0.4/0.7/1.6 of an undefined unit.
  // 9 m rather than 6: this is a yard, not a single running line, and a 6 m
  // ribbon is 2 px from a 1 km camera — measured on a screenshot where the
  // patch was present in the scene graph and invisible in the frame.
  const rail = new RibbonBuilder(9, RAIL_COLOR, 0.35);
  const road = new RibbonBuilder(7, ROAD_COLOR, 0.2);
  const river = new RibbonBuilder(26, RIVER_COLOR, -1.2);

  const treePositions: { x: number; y: number; z: number; scale: number; rotY: number }[] = [];

  for (const f of osm.features) {
    if (f.type === "rail_line" || f.type === "road" || f.type === "river") {
      const builder = f.type === "rail_line" ? rail : f.type === "road" ? road : river;
      for (const run of clipPolyline(f.xz)) {
        builder.addPolyline(run.map((p) => toWorld(p)));
      }
      continue;
    }

    // tree_row: closed = a wood/parcel to fill, open = a windbreak to follow.
    if (f.closed) {
      const bbox = ringBBox(f.xz);
      if (
        bbox.x0 > PATCH_CENTER_X_KM + PATCH_HALF_X_KM ||
        bbox.x1 < PATCH_CENTER_X_KM - PATCH_HALF_X_KM ||
        bbox.z0 > PATCH_HALF_Z_KM ||
        bbox.z1 < -PATCH_HALF_Z_KM
      ) {
        continue; // no overlap with the patch at all
      }
      const areaKm2 = ringArea(f.xz);
      const count = Math.min(WOOD_TREES_MAX, Math.max(1, Math.round(areaKm2 * WOOD_TREES_PER_KM2)));
      const r = rng(hashFeature(f));
      let placed = 0;
      let guard = 0;
      while (placed < count && guard < count * 25) {
        guard++;
        const x = bbox.x0 + r() * (bbox.x1 - bbox.x0);
        const z = bbox.z0 + r() * (bbox.z1 - bbox.z0);
        if (Math.abs(x - PATCH_CENTER_X_KM) > PATCH_HALF_X_KM || Math.abs(z) > PATCH_HALF_Z_KM) continue;
        if (!pointInRing(x, z, f.xz)) continue;
        const w = toWorld([x, z]);
        treePositions.push({
          x: w.x,
          y: surfaceHeight(w.x, w.z),
          z: w.z,
          scale: 2.4 + r() * 2.6,
          rotY: r() * Math.PI * 2,
        });
        placed++;
      }
    } else {
      for (const run of clipPolyline(f.xz)) {
        const worldRun = run.map((p) => toWorld(p));
        let acc = 0;
        for (let i = 1; i < worldRun.length; i++) {
          const a = worldRun[i - 1];
          const b = worldRun[i];
          const segLen = Math.hypot(b.x - a.x, b.z - a.z);
          let t = acc > 0 ? TREE_PITCH - acc : 0;
          for (; t < segLen; t += TREE_PITCH) {
            const u = t / segLen;
            const x = a.x + (b.x - a.x) * u;
            const z = a.z + (b.z - a.z) * u;
            const r = rng(hashFeature(f) ^ (i * 7919) ^ Math.round(t * 100));
            treePositions.push({ x, y: surfaceHeight(x, z), z, scale: 3 + r() * 3.4, rotY: r() * Math.PI * 2 });
          }
          acc = t - segLen;
        }
      }
    }
  }
  const railMesh = rail.build("osm:rail");
  const roadMesh = road.build("osm:road");
  const riverMesh = river.build("osm:river");
  if (railMesh) group.add(railMesh);
  if (roadMesh) group.add(roadMesh);
  if (riverMesh) group.add(riverMesh);

  if (treePositions.length > 0) {
    const geo = new THREE.CylinderGeometry(0.07, 0.26, 1, 5);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: TREE_TRUNK_COLOR, flatShading: true, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, treePositions.length);
    const dummy = new THREE.Object3D();
    treePositions.forEach((t, i) => {
      dummy.position.set(t.x, t.y - 0.05, t.z);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.set(1, t.scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = "osm:trees";
    group.add(mesh);
  }

  return { group, attribution: osm.source.attribution };
}

function hashFeature(f: OsmFeature): number {
  let h = 2166136261;
  for (const [x, z] of f.xz) {
    h ^= Math.round(x * 1000);
    h = Math.imul(h, 16777619);
    h ^= Math.round(z * 1000);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function disposeOsmInset(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
      o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}
