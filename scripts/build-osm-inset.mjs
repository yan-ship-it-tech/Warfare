#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Trims a fetched OSM extract (data/osm/<aoi>.json, ~1.7 MB for Pokrovsk) down
// to the small, radius-clipped subset the 3D view's metric inset actually
// draws (src/three/osmTerrain.ts). Mechanical/build-time work only — same
// split fetch-osm-data.mjs already uses between "fetch" and "reduce": this is
// a second reduce stage, from "everything fetched" to "everything one
// specific renderer needs." Deterministic scatter/instancing logic is NOT
// here — that stays in osmTerrain.ts at runtime, same as every other prop
// scatter in this codebase (props.ts).
//
// Why this exists at all: importing the full source file directly into the
// 3D view's bundle would ship ~1.7 MB of lat/lon pairs, OSM tags and features
// hundreds of km outside the patch that will ever render (see docs/DECISIONS.md
// Pass 14 for the actual before/after size). This keeps the SOURCE file
// (data/osm/pokrovsk.json) as the full, re-fetchable provenance record and
// writes a small derived file next to it.
//
// Usage: node scripts/build-osm-inset.mjs [--aoi=pokrovsk]
// Output: data/osm/<aoi>.inset.json — regenerate after any change to the
// clip radius or inset constants in src/three/osmTerrain.ts (both are
// duplicated here deliberately; see that file's header).
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const aoi = (args.find((a) => a.startsWith("--aoi=")) ?? "--aoi=pokrovsk").slice(6);

// Keep the WHOLE polygon if its centroid is this close to the AOI origin —
// generous on purpose (see osmTerrain.ts: the runtime scatter pass applies
// the tighter RENDER_RADIUS_KM as the real visible cutoff, so a polygon kept
// here but centred just inside KEEP_RADIUS_KM still gets correctly thinned
// at scatter time rather than drawing trees past the patch edge).
const KEEP_RADIUS_KM = 10;
// True clip radius for open polylines (rail, windbreaks) — segments are cut
// exactly at this circle, not just filtered by point.
const RENDER_RADIUS_KM = 8.5;
// A clipped rail/windbreak fragment shorter than this is very likely a
// bbox-overshoot nub (a long disused line grazing the very edge of the
// circle) rather than a real feature worth a mesh. Dropped rather than
// rendered as a barely-visible speck.
const MIN_CHAIN_KM = 0.015;

const srcPath = path.join(__dirname, "..", "data", "osm", `${aoi}.json`);
const src = JSON.parse(readFileSync(srcPath, "utf8"));

function dist(p) {
  return Math.hypot(p[0], p[1]);
}

/** Clips a polyline to a circle of radius R centred on the origin. Segments
 *  with both endpoints outside are treated as non-crossing (a chord entirely
 *  outside the visible patch would be an edge case vanishingly rare at this
 *  AOI's point density after the fetch pipeline's 5 m Douglas-Peucker pass —
 *  flagged rather than handled exactly, see docs/DECISIONS.md Pass 14).
 *  Returns an array of chains (a line can exit and re-enter the circle). */
function clipPolyline(points, R) {
  const chains = [];
  let current = [];
  const pushCurrent = () => {
    if (current.length >= 2) chains.push(current);
    current = [];
  };
  const intersect = (a, b) => {
    // Point on segment a->b where distance from origin first equals R,
    // solved as a quadratic in the segment parameter t.
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const A = dx * dx + dz * dz;
    const B = 2 * (a[0] * dx + a[1] * dz);
    const C = a[0] * a[0] + a[1] * a[1] - R * R;
    const disc = B * B - 4 * A * C;
    if (A === 0 || disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-B - sq) / (2 * A);
    const t2 = (-B + sq) / (2 * A);
    const t = t1 >= 0 && t1 <= 1 ? t1 : t2 >= 0 && t2 <= 1 ? t2 : null;
    if (t === null) return null;
    return [a[0] + dx * t, a[1] + dz * t];
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const pIn = dist(p) <= R;
    if (i === 0) {
      if (pIn) current.push(p);
      continue;
    }
    const prev = points[i - 1];
    const prevIn = dist(prev) <= R;
    if (prevIn && pIn) {
      current.push(p);
    } else if (prevIn && !pIn) {
      const x = intersect(prev, p);
      if (x) current.push(x);
      pushCurrent();
    } else if (!prevIn && pIn) {
      const x = intersect(prev, p);
      pushCurrent(); // in case a stray single point survived (shouldn't)
      current = x ? [x, p] : [p];
    }
    // both outside: no-op, per the header note above.
  }
  pushCurrent();
  return chains;
}

function chainLengthKm(chain) {
  let sum = 0;
  for (let i = 1; i < chain.length; i++) {
    sum += Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]);
  }
  return sum;
}

const out = { rail_line: [], tree_row_open: [], tree_row_closed: [] };

for (const f of src.features) {
  if (f.type === "rail_line") {
    for (const chain of clipPolyline(f.xz, RENDER_RADIUS_KM)) {
      if (chainLengthKm(chain) >= MIN_CHAIN_KM) out.rail_line.push(chain);
    }
  } else if (f.type === "tree_row" && !f.closed) {
    for (const chain of clipPolyline(f.xz, RENDER_RADIUS_KM)) {
      if (chainLengthKm(chain) >= MIN_CHAIN_KM) out.tree_row_open.push(chain);
    }
  } else if (f.type === "tree_row" && f.closed) {
    const xs = f.xz.map((p) => p[0]);
    const zs = f.xz.map((p) => p[1]);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cz = zs.reduce((a, b) => a + b, 0) / zs.length;
    if (Math.hypot(cx, cz) <= KEEP_RADIUS_KM) out.tree_row_closed.push(f.xz);
  }
  // road / river: fetched but not rendered by this pass — see docs/BACKLOG.md.
}

const result = {
  generated_by: "scripts/build-osm-inset.mjs",
  source: srcPath.replace(path.join(__dirname, ".."), "").replace(/^\//, ""),
  license: src.source.license,
  attribution: src.source.attribution,
  render_radius_km: RENDER_RADIUS_KM,
  keep_radius_km: KEEP_RADIUS_KM,
  counts: {
    rail_line: out.rail_line.length,
    tree_row_open: out.tree_row_open.length,
    tree_row_closed: out.tree_row_closed.length,
  },
  rail_line: out.rail_line,
  tree_row_open: out.tree_row_open,
  tree_row_closed: out.tree_row_closed,
};

const outPath = path.join(__dirname, "..", "data", "osm", `${aoi}.inset.json`);
writeFileSync(outPath, JSON.stringify(result));
const bytes = Buffer.byteLength(JSON.stringify(result));
console.log(`wrote ${outPath}`);
console.log(`counts: rail_line=${out.rail_line.length} tree_row_open=${out.tree_row_open.length} tree_row_closed=${out.tree_row_closed.length}`);
console.log(`size: ${(bytes / 1024).toFixed(1)} KB (source was ${(Buffer.byteLength(readFileSync(srcPath)) / 1024).toFixed(0)} KB)`);
