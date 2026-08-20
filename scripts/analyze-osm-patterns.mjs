#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Derives the field/tree-row pattern statistics Pass 17 item 3 asks for:
// "derive procedural dressing patterns from the OSM data (tree-row spacing
// and orientation, field block size) and apply across the wider map."
//
// This is a one-off analysis, not a build step — it prints numbers, and the
// numbers get hand-copied into src/three/props.ts and src/three/terrain3d.ts
// as authored constants with a comment citing this script, the same
// established convention terrain3d.ts's DESTRUCTION_X thresholds already
// use ("computed once ... at build time, not live"). Re-run this after a
// `data/osm/<aoi>.json` update to see whether the derived numbers moved
// enough to be worth re-tuning.
//
// What this deliberately does NOT do: convert km to world-units. The scene's
// axes have no single km-per-unit constant (X is band-compressed per
// worldMapping.ts; Z "carries no distance claim of its own") — so the
// numbers below are ratios (an orientation angle, an aspect ratio) applied
// to retune the EXISTING procedural constants' relationships to each other,
// not absolute distances applied directly to world-unit geometry.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const aoiArg = process.argv.find((a) => a.startsWith("--aoi="));
const aoi = aoiArg ? aoiArg.slice("--aoi=".length) : "pokrovsk";
const path = fileURLToPath(new URL(`../data/osm/${aoi}.json`, import.meta.url));
const data = JSON.parse(readFileSync(path, "utf8"));

const rows = data.features.filter((f) => f.type === "tree_row");
const open = rows.filter((f) => !f.closed); // windbreaks: a line to follow
const closed = rows.filter((f) => f.closed); // woods/parcels: an area to fill

/** Undirected line angle (first→last point), folded into [0, π). */
function angleOf(f) {
  const pts = f.xz;
  const [x0, z0] = pts[0];
  const [x1, z1] = pts[pts.length - 1];
  let a = Math.atan2(z1 - z0, x1 - x0);
  if (a < 0) a += Math.PI;
  if (a >= Math.PI) a -= Math.PI;
  return a;
}

function length(f) {
  let L = 0;
  for (let i = 1; i < f.xz.length; i++) {
    L += Math.hypot(f.xz[i][0] - f.xz[i - 1][0], f.xz[i][1] - f.xz[i - 1][1]);
  }
  return L;
}

function ringArea(pts) {
  let A = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    A += x1 * z2 - x2 * z1;
  }
  return Math.abs(A) / 2;
}

function median(sorted) {
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
}

console.log(`AOI: ${aoi} (${path})`);
console.log(`tree_row: ${rows.length} total, ${open.length} open (windbreaks), ${closed.length} closed (wood/parcel fills)\n`);

// ── orientation: dominant angle among the open (linear) rows ─────────────
const angles = open.map(angleOf).filter((a) => !Number.isNaN(a));
const bins = new Array(12).fill(0); // 12 x 15-degree bins spanning 0-180
for (const a of angles) bins[Math.min(11, Math.floor(((a * 180) / Math.PI) / 15))]++;
let maxBin = 0;
bins.forEach((c, i) => { if (c > bins[maxBin]) maxBin = i; });
const dominantDeg = maxBin * 15 + 7.5;
console.log("orientation histogram (15° bins):", bins.map((c, i) => `${i * 15}-${i * 15 + 15}:${c}`).join(" "));
console.log(`dominant row orientation: ~${dominantDeg}° from the AOI's east axis\n`);

// ── row length (windbreak segment scale) ──────────────────────────────────
const lens = open.map(length).sort((a, b) => a - b);
console.log(`open row length (km): median ${median(lens).toFixed(3)}, p90 ${lens[Math.floor(lens.length * 0.9)].toFixed(3)}\n`);

// ── perpendicular spacing between roughly-parallel rows ───────────────────
// Rotate centroids into the dominant-angle frame; the gap between adjacent
// rows' perpendicular coordinate approximates the gap between field strips.
const theta = (dominantDeg * Math.PI) / 180;
const cos = Math.cos(-theta), sin = Math.sin(-theta);
function centroid(f) {
  let sx = 0, sz = 0;
  for (const [x, z] of f.xz) { sx += x; sz += z; }
  return [sx / f.xz.length, sz / f.xz.length];
}
const perp = open.map((f) => { const [cx, cz] = centroid(f); return cx * sin + cz * cos; }).sort((a, b) => a - b);
const gaps = [];
for (let i = 1; i < perp.length; i++) gaps.push(perp[i] - perp[i - 1]);
gaps.sort((a, b) => a - b);
console.log(`perpendicular gap between row centroids (km): median ${median(gaps).toFixed(3)}\n`);

// ── closed-ring (wood/parcel) area → implied block side ──────────────────
const areas = closed.map((f) => ringArea(f.xz)).sort((a, b) => a - b);
const sides = areas.map(Math.sqrt);
console.log(`closed-ring area (km²): n=${areas.length}, median ${median(areas).toFixed(4)}, p90 ${areas[Math.floor(areas.length * 0.9)].toFixed(4)}`);
console.log(`implied block side √area (km): median ${median(sides).toFixed(3)}, p90 ${sides[Math.floor(sides.length * 0.9)].toFixed(3)}\n`);

// ── derived ratios actually applied in props.ts / terrain3d.ts ───────────
const rowLenMedianKm = median(lens);
const blockSideMedianKm = median(sides);
const aspectRatio = blockSideMedianKm / rowLenMedianKm; // "blocks are ~this fraction as wide as rows are long"

// props.ts's belt formula is `sin(z*Z_FREQ + x*X_FREQ)`. A row of trees IS one
// contour of that function, so the row's own measured direction should match
// the contour direction — NOT (a common mix-up) the perpendicular "repeat"
// direction between bands. The contour of `z*Z_FREQ + x*X_FREQ = const` runs
// perpendicular to the gradient (X_FREQ, Z_FREQ), i.e. along (-Z_FREQ, X_FREQ).
// Solving for the X_FREQ that makes that direction equal the measured
// dominant angle, holding Z_FREQ fixed (the wavelength itself has no real-km
// analogue to derive — see the file header — only the ORIENTATION is informed
// by data):
//   direction angle of (-Z_FREQ, X_FREQ) = dominantDeg
//   → X_FREQ / Z_FREQ = tan(180° - dominantDeg)
const EXISTING_Z_FREQ = 0.09; // props.ts buildTrees()'s current z-coefficient, unchanged
const targetRatio = Math.tan(((180 - dominantDeg) * Math.PI) / 180);
const derivedXFreq = EXISTING_Z_FREQ * targetRatio;
console.log("── derived, applied downstream ──");
console.log(`block-side / row-length aspect ratio: ${aspectRatio.toFixed(3)}  → terrain3d.ts field-cell x/z frequency anisotropy`);
console.log(
  `contour orientation target: X_FREQ/Z_FREQ = tan(${(180 - dominantDeg).toFixed(1)}°) = ${targetRatio.toFixed(4)}` +
    `  → props.ts buildTrees(): X_FREQ = ${EXISTING_Z_FREQ} * ${targetRatio.toFixed(4)} ≈ ${derivedXFreq.toFixed(4)} (was 0.004)`,
);
