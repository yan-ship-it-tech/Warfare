// ─────────────────────────────────────────────────────────────────────────
// The OSM metric inset — real Pokrovsk-AOI rail and tree-line geometry,
// drawn as a small local patch rather than stretched across the
// band-compressed X axis.
//
// Why a patch and not a layer: `src/three/worldMapping.ts`'s whole X axis is
// non-linear on purpose (docs/DECISIONS.md Pass 5/6) — a straight real rail
// line laid across it would visibly bend where it crosses a band boundary.
// `docs/OSM_HANDOFF.md` named three honest ways out; this is **option 1,
// metric inset** (the decision recorded in docs/PLANNING.md's "do not
// re-litigate" table): pick one point on the axis, and around it draw the
// AOI at a single true-to-itself scale, independent of the surrounding
// compression. The geometry stays honest; coverage is deliberately partial.
// This is NOT "Pokrovsk" in UI copy anywhere — see the About page and
// CLAUDE.md — it is real terrain *character* (a real Donbas rail junction
// and its shelterbelt pattern), placed as an illustrative composite.
//
// Consumes `data/osm/<aoi>.inset.json`, a small (~140 KB) file DERIVED from
// the full fetched extract by `scripts/build-osm-inset.mjs` — see that
// script's header for why: importing the 1.7 MB source directly would ship
// lat/lon pairs, OSM tags and ~90% of features that fall outside any patch
// this module ever draws, straight into the already-lazy Scene3D bundle.
// Regenerate the derived file after changing RENDER_RADIUS/anchor constants
// here (they're duplicated in the script deliberately, see its header).
//
// What this draws, per the brief's two feature classes:
//   rail_line        → a merged ribbon mesh per line, hugging live terrain
//                       height so a rebuilt strip never leaves rail floating
//   tree_row (open)   → windbreak: tree instances placed AT INTERVALS ALONG
//                       the line (a row to follow)
//   tree_row (closed) → wood: tree instances SCATTERED INSIDE the polygon,
//                       density ∝ area (a stand to fill)
// `road`/`river` are in the source data but not rendered here — the brief's
// item 1 only asks for rail extrusion + tree instancing; flagged as a scope
// trim in docs/BACKLOG.md rather than silently expanded or silently dropped.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import insetData from "../../data/osm/pokrovsk.inset.json";
import type { Projection } from "../scene/projection";
import { terrainHeight } from "./terrain3d";
import { worldXFor } from "./worldMapping";
import { mergeStaticGroup } from "./mergeStatic";
import { OSM_ATTRIBUTION, OSM_LICENSE, OSM_INSET_SIDE, OSM_INSET_KM } from "../config/osm";

interface InsetFile {
  license: string;
  attribution: string;
  render_radius_km: number;
  keep_radius_km: number;
  counts: { rail_line: number; tree_row_open: number; tree_row_closed: number };
  rail_line: [number, number][][];
  tree_row_open: [number, number][][];
  tree_row_closed: [number, number][][];
}

const DATA = insetData as unknown as InsetFile;

// Re-exported so every existing import site in this module (and Scene3D.tsx)
// keeps working unchanged — src/config/osm.ts is the source of truth now
// (see that file's header for why the split exists), this module just also
// asserts the data file agrees with it rather than silently trusting two
// copies to stay in sync.
export { OSM_ATTRIBUTION, OSM_LICENSE, OSM_INSET_SIDE, OSM_INSET_KM };
if (DATA.attribution !== OSM_ATTRIBUTION || DATA.license !== OSM_LICENSE) {
  // A future re-fetch changed the source's license/attribution block and
  // nobody updated src/config/osm.ts to match — fail loudly in dev rather
  // than silently shipping a credit that no longer matches the data it's
  // crediting.
  console.error(
    "osmTerrain: data/osm/pokrovsk.inset.json's license/attribution no longer matches src/config/osm.ts — update the literal there.",
  );
}
/** Lateral centre. Z carries no distance claim (worldMapping.ts) — this is
 *  a stylistic placement, not a derived number, chosen clear of every
 *  LANDMARKS entry whose km places it in the same x-neighbourhood. */
export const OSM_INSET_Z = 0;
/** World units per real kilometre inside the patch — its own constant
 *  scale, decoupled from the compressed axis around it (that decoupling is
 *  the entire point of "metric inset"). Chosen small enough that the
 *  patch's ~17 km real diameter (2 × RENDER_RADIUS_KM) reads as a local
 *  detail rather than swallowing the neighbours picked clear of above; see
 *  Pass 14 for the worked margin. */
export const OSM_INSET_UNITS_PER_KM = 1.1;
const RENDER_RADIUS_KM = DATA.render_radius_km;
const RADIUS_WORLD = RENDER_RADIUS_KM * OSM_INSET_UNITS_PER_KM;

export interface InsetBounds {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  cx: number;
  cz: number;
  radius: number;
}

/** World-space footprint of the patch, for two consumers: the border frame
 *  drawn around it, and scenery.ts's landmark placement, which skips any
 *  LANDMARKS entry that would land inside this box rather than drawing a
 *  generic village on top of the real one. */
export function osmInsetBounds(proj: Projection): InsetBounds {
  const cx = worldXFor(OSM_INSET_SIDE, OSM_INSET_KM, proj);
  return {
    xMin: cx - RADIUS_WORLD,
    xMax: cx + RADIUS_WORLD,
    zMin: OSM_INSET_Z - RADIUS_WORLD,
    zMax: OSM_INSET_Z + RADIUS_WORLD,
    cx,
    cz: OSM_INSET_Z,
    radius: RADIUS_WORLD,
  };
}

function toWorld(cx: number, p: [number, number]): { x: number; z: number } {
  return { x: cx + p[0] * OSM_INSET_UNITS_PER_KM, z: OSM_INSET_Z + p[1] * OSM_INSET_UNITS_PER_KM };
}

// ── materials — reusing the existing shared palette, not declaring new
//    one-offs, per docs/MODEL_STYLE_GUIDE.md § Materials ───────────────────
const RAIL_BED = new THREE.MeshStandardMaterial({ color: "#6b6558", flatShading: true, roughness: 0.95 });
const RAIL_STEEL = new THREE.MeshStandardMaterial({ color: "#8d919b", flatShading: true, roughness: 0.5, metalness: 0.4 });
const TREE_MAT = new THREE.MeshStandardMaterial({ color: "#4a4237", flatShading: true, roughness: 1, vertexColors: true });
const TREE_GREEN = new THREE.Color("#4d5a34");
const TREE_BARE = new THREE.Color("#3a352a");

/** Deterministic RNG — same convention as props.ts/scenery.ts: same seed,
 *  same scatter, every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

/** One flat ribbon quad-strip along a polyline, elevation-following. Not a
 *  THREE.TubeGeometry along a fitted curve — that would round the corners
 *  and draw something other than the actual surveyed vertices, and the
 *  brief is explicit: "extrude rail lines along their xz point lists." */
function buildRibbon(pts: THREE.Vector3[], width: number, mat: THREE.Material, liftY: number): THREE.Mesh | null {
  if (pts.length < 2) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    dir.subVectors(next, prev);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    side.crossVectors(up, dir).normalize().multiplyScalar(width / 2);
    const p = pts[i];
    positions.push(p.x + side.x, p.y + liftY, p.z + side.z, p.x - side.x, p.y + liftY, p.z - side.z);
    normals.push(0, 1, 0, 0, 1, 0);
    // No material here actually samples a texture — this exists only so
    // mergeStaticGroup() (Pass 13) accepts this geometry into a batch; it
    // requires every merged geometry to share the same attribute set.
    const v = i / Math.max(1, pts.length - 1);
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const a = (i - 1) * 2;
      const b = i * 2;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return new THREE.Mesh(geo, mat);
}

/** A rail line as two stacked ribbons — a wider ballast bed and a narrower,
 *  darker metal rail strip on top — cheap enough to stay within the poly
 *  budget per docs/MODEL_STYLE_GUIDE.md while still reading as "rail," not
 *  "path." Elevation follows the live `terrainHeight()` at each vertex, so
 *  a rebuilt strip (a live band edit) can never leave track floating over
 *  or buried under the ground it was drawn against.
 *
 *  Lift (0.32/0.46, bed under rail) is bigger than it looks like it needs to
 *  be, and that is deliberate: the first version used ~0.1, matching the
 *  analytic terrainHeight() value at each rail vertex exactly, and the rail
 *  was invisible — buried under the terrain MESH almost everywhere. The
 *  terrain is a coarse grid (buildTerrain(), ~1–2.5 units between samples)
 *  linearly interpolated between vertices, so its rendered surface tracks
 *  terrainHeight()'s smooth curve only approximately; the gap between the
 *  two is exactly the kind of thing multiple noise octaves compound rather
 *  than cancel. 0.3–0.5 is the same order every other "sits on the ground"
 *  object in this file already uses for the same reason (the obstacle belt
 *  in scenery.ts rides +0.3, its fighting-position sandbags +0.15) — not a
 *  new convention, just one this file hadn't needed until now. */
function buildRailLine(cx: number, xz: [number, number][]): THREE.Group | null {
  const pts = xz.map((p) => {
    const w = toWorld(cx, p);
    return new THREE.Vector3(w.x, terrainHeight(w.x, w.z), w.z);
  });
  const bed = buildRibbon(pts, 0.8, RAIL_BED, 0.32);
  const rail = buildRibbon(pts, 0.34, RAIL_STEEL, 0.46);
  if (!bed || !rail) return null;
  const g = new THREE.Group();
  g.add(bed, rail);
  return g;
}

/** Point-in-polygon (ray casting), for scattering trees inside a wood. */
function pointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polygonArea(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(a) / 2;
}

function polygonBBox(poly: [number, number][]) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of poly) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, x1, z0, z1 };
}

// ── tree density: calibrated in WORLD units, not real ones ────────────────
// A first version of this used real-world figures directly — ~900 trees/km²
// inside a wood, one tree every ~18 m along a windbreak — and it produced a
// single solid black mass covering the whole patch. The reason: a tree's own
// geometry (trunk + canopy, ~1–2 world units across) is NOT scaled down by
// OSM_INSET_UNITS_PER_KM the way its POSITION is — nothing in this scene is
// drawn to real proportion (see docs/MODEL_STYLE_GUIDE.md § 1, "world units
// are not to-scale"). So real 18 m tree spacing became ~0.02 world units
// between trunks each ~1–2 units wide: several hundred-fold overlap. Real
// wood polygons here are mostly tiny too (median 0.0039 km² — a 60ish-metre
// copse), which at any inset scale collapses to *smaller than one tree's own
// canopy* — there is no scale at which "N realistically-spaced trees" reads
// as anything but a blob for a feature that size.
//
// The fix is the same move MODEL_STYLE_GUIDE.md already made for geometry:
// legibility, not literalism. Counts and spacing below are picked directly
// in WORLD units — enough to read as "a stand" or "a row" without the
// instances burying each other — using the polygon/line's REAL size only as
// a relative signal (bigger wood → more trees, longer row → more trees),
// never as a literal density conversion.
const WOOD_TREES_MIN = 1;
const WOOD_TREES_MAX = 6;
/** Tuned so a polygon at roughly the 90th percentile of this AOI's wood
 *  sizes (~0.04 km², see docs/DECISIONS.md Pass 14 for the measured
 *  distribution) lands close to WOOD_TREES_MAX, and the long tail of larger
 *  woods clamps rather than re-triggering the overlap this replaced. */
const WOOD_DENSITY_PER_WORLD_UNIT2 = 100;
/** Spacing along a windbreak, in world units — comfortably more than one
 *  tree's own canopy width so a row of them reads as a row, not a hedge. */
const WINDBREAK_TREE_SPACING_WORLD = 1.6;

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** Minimum gap between any two accepted tree instances, in WORLD units —
 *  applied GLOBALLY, not per polygon. A real mapped forest is routinely
 *  digitised as dozens of adjacent, near-touching polygon fragments rather
 *  than one shape (this AOI has a real belt of ~290 of them within one
 *  km-radius band, see docs/DECISIONS.md Pass 14): scattering each fragment
 *  independently — even with the sane, world-calibrated count from
 *  WOOD_DENSITY_PER_WORLD_UNIT2 — still stacks hundreds of independently-
 *  placed clusters into the same physical space, right back to the solid
 *  mass this whole rewrite exists to avoid. A shared rejection radius across
 *  every candidate, wood or windbreak, is what actually fixes that: it does
 *  not matter how many polygons proposed a point near an already-accepted
 *  tree, only the first one wins. */
const MIN_TREE_GAP_WORLD = 2.2;

function buildInsetTrees(cx: number): THREE.InstancedMesh | null {
  const r = rng(0x05540c8);
  // World-space, and the single source of truth for "is this spot taken" —
  // every candidate, from either feature type, is checked and inserted here
  // before anything is added to the render list.
  const accepted: { x: number; z: number }[] = [];
  const gapSq = MIN_TREE_GAP_WORLD * MIN_TREE_GAP_WORLD;
  const tryPlace = (localX: number, localZ: number): boolean => {
    const w = toWorld(cx, [localX, localZ]);
    for (let i = 0; i < accepted.length; i++) {
      const dx = accepted[i].x - w.x;
      const dz = accepted[i].z - w.z;
      if (dx * dx + dz * dz < gapSq) return false;
    }
    accepted.push(w);
    return true;
  };

  const stepKm = WINDBREAK_TREE_SPACING_WORLD / OSM_INSET_UNITS_PER_KM;
  for (const line of DATA.tree_row_open) {
    let acc = 0;
    let placedAny = false;
    for (let i = 1; i < line.length; i++) {
      const [x0, z0] = line[i - 1];
      const [x1, z1] = line[i];
      const segLen = Math.hypot(x1 - x0, z1 - z0);
      let t = (stepKm - acc) / Math.max(segLen, 1e-6);
      while (t <= 1) {
        if (tryPlace(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) placedAny = true;
        t += stepKm / Math.max(segLen, 1e-6);
      }
      acc = (acc + segLen) % stepKm;
    }
    // A clipped fragment shorter than one step still gets marked — a
    // windbreak too short to show a row of trees at a legible spacing is
    // still a windbreak, not nothing. (Skipped if the midpoint lost to the
    // gap check — that means a neighbour already marks this ground.)
    if (!placedAny && line.length >= 2) {
      const [x, z] = line[Math.floor(line.length / 2)];
      tryPlace(x, z);
    }
  }

  for (const poly of DATA.tree_row_closed) {
    const areaWorld = polygonArea(poly) * OSM_INSET_UNITS_PER_KM * OSM_INSET_UNITS_PER_KM;
    const count = Math.min(WOOD_TREES_MAX, Math.max(WOOD_TREES_MIN, Math.round(areaWorld * WOOD_DENSITY_PER_WORLD_UNIT2)));
    const { x0, x1, z0, z1 } = polygonBBox(poly);
    let placed = 0;
    let guard = 0;
    // A generous guard, not `count * N`: with the global gap check active, a
    // polygon sitting inside an already-dense stretch of forest can fail
    // every candidate it proposes, and that is the correct outcome (the
    // ground it covers already has trees on it), not a bug to retry forever.
    while (placed < count && guard < 200) {
      guard++;
      const x = x0 + r() * (x1 - x0);
      const z = z0 + r() * (z1 - z0);
      if (pointInPolygon(x, z, poly) && tryPlace(x, z)) placed++;
    }
  }

  if (accepted.length === 0) return null;

  const geo = new THREE.CylinderGeometry(0.05, 0.2, 1, 5);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, TREE_MAT, accepted.length);
  accepted.forEach((w, i) => {
    const h = 2 + r() * 3;
    dummy.position.set(w.x, terrainHeight(w.x, w.z) - 0.1, w.z);
    dummy.rotation.set((r() - 0.5) * 0.2, r() * Math.PI, (r() - 0.5) * 0.2);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    tmpColor.copy(TREE_BARE).lerp(TREE_GREEN, 0.55 + r() * 0.35);
    mesh.setColorAt(i, tmpColor);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = "osm:trees";
  return mesh;
}

/** A thin standing rectangle looping the patch's real footprint — makes the
 *  "why does the ground pattern suddenly change here" a deliberate, legible
 *  design choice (a sourced local map, framed like one) instead of a seam a
 *  viewer has to guess at. */
function buildFrame(bounds: InsetBounds): THREE.LineLoop {
  const y = 0.4;
  const pts = [
    new THREE.Vector3(bounds.xMin, y, bounds.zMin),
    new THREE.Vector3(bounds.xMax, y, bounds.zMin),
    new THREE.Vector3(bounds.xMax, y, bounds.zMax),
    new THREE.Vector3(bounds.xMin, y, bounds.zMax),
  ];
  const mat = new THREE.LineBasicMaterial({ color: "#cfd6e0", transparent: true, opacity: 0.4 });
  const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
  loop.name = "osm:frame";
  return loop;
}

/**
 * Builds the whole inset: framed rail ribbons (merged into a couple of draw
 * calls, same convention Pass 13 established for scenery) plus one
 * instanced tree mesh covering both windbreaks and woods. Rebuilt alongside
 * terrain/scenery — i.e. only when `proj` changes, not per frame.
 */
export function buildOsmInset(proj: Projection): THREE.Group {
  const bounds = osmInsetBounds(proj);
  const g = new THREE.Group();
  g.name = "osm-inset";

  const rails = new THREE.Group();
  for (const xz of DATA.rail_line) {
    const line = buildRailLine(bounds.cx, xz);
    if (line) rails.add(line);
  }
  mergeStaticGroup(rails);
  g.add(rails);

  const trees = buildInsetTrees(bounds.cx);
  if (trees) g.add(trees);

  g.add(buildFrame(bounds));

  return g;
}

export function disposeOsmInset(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh || o instanceof THREE.LineLoop) {
      o.geometry.dispose();
    }
  });
}
