#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// OSM terrain-line fetcher — rail lines, tree rows, roads and rivers for a
// named AOI, pulled once and committed as static JSON.
//
// Run:
//   node scripts/fetch-osm-data.mjs                      # Pokrovsk (default AOI)
//   node scripts/fetch-osm-data.mjs --aoi=kramatorsk
//   node scripts/fetch-osm-data.mjs --print-query        # query only, no network
//   node scripts/fetch-osm-data.mjs --raw=overpass.json  # skip the network entirely
//
// The pipeline is deliberately two-stage, and BOTH stages are in this file:
//
//   1. FETCH   — one Overpass query per AOI, POSTed to a mirror, saved verbatim.
//   2. REDUCE  — classify → simplify → project → write data/osm/<aoi>.json.
//
// Stage 2 is pure and runs offline from a saved Overpass response via `--raw=`.
// That split exists because it is genuinely useful (re-projecting or
// re-simplifying committed data must not mean re-hitting a rate-limited public
// API), and because it is the only way this script runs to completion in an
// agent session: this repo's sandbox blocks overpass-api.de and every mirror at
// the egress proxy (HTTP 403 on CONNECT). See docs/OSM_PIPELINE.md.
//
// NEVER call Overpass from the deployed app. It is rate-limited, it is a
// volunteer-funded service, and the data does not change on a timescale this
// tool cares about. Fetch once, commit the output, read the committed file.
//
// Licensing: OpenStreetMap data is ODbL 1.0. Any view that draws these
// features must carry "© OpenStreetMap contributors" — the attribution string
// is written into every output file's `source` block so it travels with the
// data rather than living only in a doc. Note this is *data*, not a fetched
// binary asset: the "authored geometry only" rule in CLAUDE.md exists because
// a fetched model carries a license nobody in the session can actually read,
// and coordinates under a known, attributed, share-alike license are the case
// that rule was drawn around rather than an exception to it.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ── AOIs ─────────────────────────────────────────────────────────────────
// bbox is Overpass order: south, west, north, east.
const AOIS = {
  pokrovsk: {
    name: "Pokrovsk, Donetsk Oblast",
    note: "Dense rail junction, classic steppe tree-row pattern; extends east toward Myrnohrad to catch the rail yards.",
    center: [48.2828, 37.1828],
    bbox: [48.2028, 37.0628, 48.3628, 37.3028],
  },
  kramatorsk: {
    name: "Kramatorsk, Donetsk Oblast",
    note: "Larger urban core, the Kazennyi Torets river break, airport infrastructure, more terrain variety.",
    center: [48.7194, 37.5561],
    bbox: [48.6394, 37.4361, 48.7994, 37.6761],
  },
};

// ── feature classes ──────────────────────────────────────────────────────
// Each entry is one group of Overpass way selectors plus the type its members
// land under in the output. `--features=` selects a subset by key.
const FEATURE_CLASSES = {
  rail: {
    type: "rail_line",
    // Bare `way["railway"]` (any value), not `="rail"`. Pass 15 (see
    // docs/DECISIONS.md) found Pokrovsk's rail layer was a single 5 m
    // fragment because a real freight yard was tagged `railway=disused`, not
    // `rail` — RAIL_TRACK_VALUES below was widened to classify disused/
    // abandoned/construction/narrow_gauge track as rail_line too, but that
    // fix only ever landed in classify(); the query itself still only asked
    // for `="rail"` and always under-fetched. Pokrovsk's real 303-feature
    // rail layer exists only because a human ran a second manual query
    // outside this script and merged it in by hand. Widening the selector
    // here so a live/print-query run finds it in one pass.
    selectors: ['way["railway"]'],
  },
  trees: {
    type: "tree_row",
    // tree_row is the linear windbreak; forest/wood are the areal patches the
    // windbreaks run between. The brief folds all three into "tree_row", so
    // that is the `type` they carry — but each feature also keeps its raw tags
    // and a `closed` flag, which is what a renderer needs to tell "instance
    // trees along this line" from "fill this polygon with trees".
    selectors: [
      'way["natural"="tree_row"]',
      'way["landuse"="forest"]',
      'way["natural"="wood"]',
    ],
  },
  roads: {
    type: "road",
    // Widened from primary/secondary/tertiary-only (the original rural rail-
    // and-tree-row AOIs) to include residential streets — a dense urban
    // district's road grid is mostly `highway=residential`, and excluding it
    // there means "roads" is nearly empty for exactly the AOIs that need it
    // most. classify() needed no change: it already returns "road" for any
    // truthy `highway` tag, so this was a query-selector gap, not a
    // classification gap.
    selectors: ['way["highway"~"^(primary|secondary|tertiary|residential)$"]'],
  },
  rivers: {
    type: "river",
    selectors: ['way["waterway"="river"]'],
  },
  buildings: {
    type: "building",
    // Opt-in, not in DEFAULT_FEATURES: a rural rail/tree-row AOI (Pokrovsk,
    // Kramatorsk) has no need for building footprints and they'd dwarf the
    // rest of the file; a dense residential/mixed-use district AOI does.
    // Pass `--features=rail,trees,roads,rivers,buildings` explicitly for
    // those. Building ways are frequently closed rings (polygons) — no extra
    // handling needed, `reduce()` already derives `closed` generically from
    // first-point/last-point equality for any feature type.
    selectors: ['way["building"]'],
  },
};

const DEFAULT_FEATURES = ["rail", "trees", "roads", "rivers"];

// Primary first, then community mirrors, tried in order on connect/5xx failure
// only — never on a 400 or 403, which are answers rather than glitches.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const USER_AGENT =
  "warfare-digital-twin/0.1 (one-off AOI fetch; https://github.com/yan-ship-it-tech/warfare)";

// ── args ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq === -1) flags[arg.slice(2)] = true;
    else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return flags;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
fetch-osm-data.mjs — pull rail/tree/road/river lines for an AOI

  --aoi=<id>          ${Object.keys(AOIS).join(" | ")}   (default: pokrovsk)
  --bbox=s,w,n,e      override the AOI bbox (centre is recomputed from it)
  --features=a,b      subset of: ${Object.keys(FEATURE_CLASSES).join(",")}  (default: all)
  --tolerance=<m>     Douglas-Peucker tolerance in metres (default: 5, 0 disables)
  --endpoint=<url>    force one Overpass endpoint instead of the mirror list
  --raw=<file>        reduce a saved Overpass response; no network at all.
                      Accepts either native Overpass JSON ({elements:[...]})
                      or overpass-turbo's GeoJSON export ({type:"FeatureCollection"})
  --save-raw=<file>   also write the verbatim Overpass response here
  --out=<file>        output path (default: data/osm/<aoi>.json)
  --print-query       print the Overpass QL and exit
  --quiet             suppress the summary
`);
  process.exit(0);
}

const aoiId = String(args.aoi ?? "pokrovsk");
const aoi = AOIS[aoiId];
if (!aoi) {
  console.error(`Unknown AOI "${aoiId}". Known: ${Object.keys(AOIS).join(", ")}`);
  process.exit(1);
}

const bbox = args.bbox ? String(args.bbox).split(",").map(Number) : aoi.bbox;
if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) {
  console.error("--bbox must be four numbers: south,west,north,east");
  process.exit(1);
}
// An overridden bbox gets its own centre; otherwise the AOI's stated centre
// stands, so the projection origin is stable across re-runs.
const center = args.bbox ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : aoi.center;

const featureKeys = String(args.features ?? DEFAULT_FEATURES.join(",")).split(",");
for (const key of featureKeys) {
  if (!FEATURE_CLASSES[key]) {
    console.error(
      `Unknown feature class "${key}". Known: ${Object.keys(FEATURE_CLASSES).join(", ")}`,
    );
    process.exit(1);
  }
}

const toleranceM = args.tolerance === undefined ? 5 : Number(args.tolerance);
if (!Number.isFinite(toleranceM) || toleranceM < 0) {
  console.error("--tolerance must be a non-negative number of metres");
  process.exit(1);
}

const outPath = String(args.out ?? `data/osm/${aoiId}.json`);

// ── query ────────────────────────────────────────────────────────────────
function buildQuery(box, keys) {
  const bboxStr = box.join(",");
  const lines = keys.flatMap((key) =>
    FEATURE_CLASSES[key].selectors.map((sel) => `  ${sel}(${bboxStr});`),
  );
  // Timeout scales past the brief's 25 s: the four-class query over a 17 km box
  // routinely takes longer than that on a busy mirror, and a timeout there
  // costs a full re-run of somebody else's CPU.
  return `[out:json][timeout:180];\n(\n${lines.join("\n")}\n);\nout geom;\n`;
}

const query = buildQuery(bbox, featureKeys);

if (args["print-query"]) {
  process.stdout.write(query);
  process.exit(0);
}

// ── fetch ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(endpoints, body) {
  let lastError = null;
  for (const endpoint of endpoints) {
    // 2s, 4s, 8s, 16s — the same backoff this repo uses for git retries.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await sleep(2 ** attempt * 1000);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "User-Agent": USER_AGENT,
          },
          body,
        });
        if (res.ok) return { endpoint, json: await res.json() };
        const detail = `${res.status} ${res.statusText}`;
        // 400 is a bad query and 403 is a policy/ban answer: retrying either
        // just costs a volunteer-run service. 429/504 are Overpass saying
        // "busy", which is what the backoff is for.
        if (res.status === 400 || res.status === 403) {
          throw Object.assign(new Error(`${endpoint}: ${detail}`), { fatal: true });
        }
        lastError = new Error(`${endpoint}: ${detail}`);
      } catch (err) {
        if (err.fatal) throw err;
        // Node's fetch collapses transport failures to "fetch failed"; the real
        // reason — including an egress proxy answering 403 to CONNECT — is one
        // level down in `cause`, when it survives at all.
        const cause = err.cause?.message ?? err.cause?.code ?? null;
        lastError = new Error(`${endpoint}: ${err.message}${cause ? ` (${cause})` : ""}`);
      }
      console.error(`  retrying (${lastError.message})`);
    }
  }
  throw lastError ?? new Error("no endpoints tried");
}

// ── projection ───────────────────────────────────────────────────────────
// Equirectangular about the AOI centre. Over a 17 km box the scale factors are
// effectively constant, so they are evaluated once at the origin latitude
// (WGS84 series) and applied linearly — the "nothing fancier than this at this
// scale" the brief asks for, with the constants right rather than rounded.
//
// Axes, in the Three.js convention the renderer already uses: +X east, +Z south
// (north is -Z, so a top-down camera reads north-up), units km.
//
// This is a *metric* local frame. It is deliberately NOT the scene's own X
// axis: src/three/worldMapping.ts maps X to band-compressed distance from the
// zero line, which is not real geography and never was (docs/DECISIONS.md
// Pass 5/6). How a metric 17 km frame lands inside a band-compressed scene is
// the integration step's call, not this script's.
function makeProjector([lat0, lon0]) {
  const phi = (lat0 * Math.PI) / 180;
  const mPerDegLat =
    111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi) - 0.0023 * Math.cos(6 * phi);
  const mPerDegLon =
    111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);
  const project = ([lat, lon]) => [
    ((lon - lon0) * mPerDegLon) / 1000,
    ((lat0 - lat) * mPerDegLat) / 1000,
  ];
  return { project, mPerDegLat, mPerDegLon };
}

// ── simplification ───────────────────────────────────────────────────────
// Douglas-Peucker on the projected (metric) points, so the tolerance is a real
// distance in metres rather than a degree fudge meaning different things along
// lat and lon. Endpoints are always kept, so a line never shortens.
function simplify(points, toleranceKm) {
  if (toleranceKm <= 0 || points.length < 3) return points.map((_, i) => i);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;
    const [ax, az] = points[first];
    const [bx, bz] = points[last];
    const dx = bx - ax;
    const dz = bz - az;
    const segLenSq = dx * dx + dz * dz;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, pz] = points[i];
      let dist;
      if (segLenSq === 0) {
        dist = Math.hypot(px - ax, pz - az);
      } else {
        // Perpendicular distance to the segment, clamped to it, so a hairpin's
        // far point isn't measured against an infinite line.
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / segLenSq));
        dist = Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceKm) {
      keep[maxIdx] = 1;
      stack.push([first, maxIdx], [maxIdx, last]);
    }
  }
  const idx = [];
  for (let i = 0; i < keep.length; i++) if (keep[i]) idx.push(i);
  return idx;
}

// ── classification ───────────────────────────────────────────────────────
// Tag precedence, most specific first. A way carrying both `railway=rail` and a
// highway tag (level crossings do exist) reads as rail, which is the more
// load-bearing feature for this tool.
// Pokrovsk's OSM rail data turned out to be almost entirely `railway=disused`
// — a Soviet-era freight yard mapped as no-longer-operating track, not as
// active `rail`. That's still real trackage (alignment, sidings, yard
// throat) and exactly what "dense rail junction" in this AOI's note refers
// to, so it counts as `rail_line` here rather than being dropped on the
// active/disused distinction. `abandoned`/`construction` are the same call:
// physical rail geometry, whatever its current operating status. `platform`
// and the explicit `railway=no` are deliberately excluded — a station
// platform is not a track. Status survives in `tags.railway` on the output
// feature, so a renderer that wants to distinguish operating from disused
// track still can.
const RAIL_TRACK_VALUES = new Set(["rail", "disused", "abandoned", "construction", "narrow_gauge"]);

function classify(tags = {}) {
  if (RAIL_TRACK_VALUES.has(tags.railway)) return "rail_line";
  if (tags.waterway === "river") return "river";
  if (tags.natural === "tree_row") return "tree_row";
  if (tags.landuse === "forest" || tags.natural === "wood") return "tree_row";
  if (tags.highway) return "road";
  if (tags.building) return "building";
  return null;
}

const round = (n, dp) => Number(n.toFixed(dp));

// ── input normalization ─────────────────────────────────────────────────
// `--raw=` accepts two shapes: native Overpass JSON (`{elements:[...]}`,
// geometry as `{lat,lon}` objects — what a live fetch or overpass-turbo's
// "Export -> download as raw OSM data" produces) and GeoJSON
// (`{type:"FeatureCollection", features:[...]}`, coordinates as `[lon,lat]`
// pairs — what overpass-turbo's "Export -> GeoJSON" produces). The GeoJSON
// route matters in practice: it's the one export format iOS Safari reliably
// turns into a real downloadable/pasteable blob, which is the whole reason
// this branch exists — see docs/OSM_HANDOFF.md.
//
// Only LineString/Polygon (and their Multi- forms) are handled, which is
// everything a `way["k"="v"](bbox); out geom;` query can produce — a raw
// node or relation has no business in this pipeline's output. Polygon rings
// close on themselves (first point repeats as last), which is exactly the
// `closed` signal `reduce()` already derives from the endpoints, so no
// separate closed/open handling is needed here.
function geojsonToElements(fc) {
  const elements = [];
  for (const feature of fc.features ?? []) {
    const geom = feature.geometry;
    if (!geom) continue;
    const props = feature.properties ?? {};
    const { "@id": idStr, ...tags } = props;
    const idSource = idStr ?? feature.id ?? "";
    const idMatch = /(\d+)/.exec(String(idSource));
    if (!idMatch) continue;
    const id = Number(idMatch[1]);

    let rings;
    if (geom.type === "LineString") rings = [geom.coordinates];
    else if (geom.type === "Polygon") rings = [geom.coordinates[0]];
    else if (geom.type === "MultiLineString") rings = geom.coordinates;
    else if (geom.type === "MultiPolygon") rings = geom.coordinates.map((poly) => poly[0]);
    else continue; // Point / GeometryCollection: not a way, not this pipeline's problem.

    rings.forEach((ring, i) => {
      elements.push({
        type: "way",
        // Multi- geometries would otherwise collide on one OSM id across
        // multiple emitted ways; suffixed only when it actually happens.
        id: rings.length > 1 ? Number(`${id}${i}`) : id,
        tags,
        geometry: ring.map(([lon, lat]) => ({ lat, lon })),
      });
    });
  }
  return elements;
}

function normalizeToElements(raw) {
  if (raw && raw.type === "FeatureCollection") {
    return { elements: geojsonToElements(raw), geojson_timestamp: raw.timestamp ?? null };
  }
  return raw;
}

// ── reduce ───────────────────────────────────────────────────────────────
function reduce(raw, { projector, toleranceKm, wantedTypes }) {
  const features = [];
  const skipped = { no_geometry: 0, unclassified: 0, not_requested: 0, degenerate: 0 };
  let rawVertices = 0;

  for (const el of raw.elements ?? []) {
    if (el.type !== "way" || !Array.isArray(el.geometry)) {
      skipped.no_geometry++;
      continue;
    }
    const type = classify(el.tags);
    if (!type) {
      skipped.unclassified++;
      continue;
    }
    // A live fetch is already limited by the query, so this only ever bites on
    // `--raw` — reducing a saved response that is broader than the classes
    // asked for now yields the same file a live `--features=` run would.
    if (!wantedTypes.has(type)) {
      skipped.not_requested++;
      continue;
    }
    // Overpass emits null geometry entries for nodes clipped by the bbox;
    // dropping them keeps the line contiguous rather than jumping to 0,0.
    const latlon = el.geometry.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (latlon.length < 2) {
      skipped.degenerate++;
      continue;
    }
    rawVertices += latlon.length;

    const pts = latlon.map((p) => [p.lat, p.lon]);
    const xz = pts.map(projector.project);
    const keep = simplify(xz, toleranceKm);
    const first = pts[0];
    const last = pts[pts.length - 1];

    features.push({
      type,
      id: `osm_${el.id}`,
      osm_id: el.id,
      closed: first[0] === last[0] && first[1] === last[1],
      // Measured on the full vertex list, before simplification — the length is
      // a fact about the feature, not about how coarsely we chose to store it.
      length_km: round(
        xz.reduce(
          (sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - xz[i - 1][0], p[1] - xz[i - 1][1])),
          0,
        ),
        3,
      ),
      points: keep.map((i) => [round(pts[i][0], 6), round(pts[i][1], 6)]),
      xz: keep.map((i) => [round(xz[i][0], 3), round(xz[i][1], 3)]),
      tags: el.tags ?? {},
    });
  }

  // Deterministic order — same input, byte-identical output, so a re-run shows
  // up in git as a real data change or as nothing at all.
  features.sort((a, b) => a.type.localeCompare(b.type) || a.osm_id - b.osm_id);
  return { features, skipped, rawVertices };
}

// ── main ─────────────────────────────────────────────────────────────────
const projector = makeProjector(center);
const toleranceKm = toleranceM / 1000;

let raw;
let source;

if (args.raw) {
  const parsed = JSON.parse(readFileSync(String(args.raw), "utf8"));
  const isGeojson = parsed?.type === "FeatureCollection";
  raw = normalizeToElements(parsed);
  source = {
    api: "Overpass API",
    endpoint: `(offline, ${isGeojson ? "GeoJSON export" : "Overpass JSON"} from ${aoi.name} query, user-supplied)`,
    query,
    fetched_at: isGeojson ? raw.geojson_timestamp : (parsed.osm3s?.timestamp_osm_base ?? null),
  };
} else {
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
    // Node's built-in fetch ignores HTTPS_PROXY unless told otherwise.
    console.error("note: HTTPS_PROXY is set — re-run with NODE_USE_ENV_PROXY=1 if this hangs");
  }
  const endpoints = args.endpoint ? [String(args.endpoint)] : ENDPOINTS;
  console.error(`Querying Overpass for ${aoi.name} [${bbox.join(",")}] ...`);
  let result;
  try {
    result = await fetchOverpass(endpoints, query);
  } catch (err) {
    console.error(`\nOverpass fetch failed: ${err.message}`);
    console.error(
      "\nIn a sandboxed environment an egress proxy refusing the tunnel (Overpass\n" +
        "not on the allowed-host list) surfaces here as a bare \"fetch failed\" /\n" +
        "\"Request was cancelled\". Nothing in this script can route around that,\n" +
        "and it should not try.\n\n" +
        "Fetch the response somewhere with open egress — overpass-turbo.eu\n" +
        "(Export -> download as raw OSM data) or curl with the query printed by\n" +
        "--print-query — then run the offline reduce stage on the result:\n" +
        `  node scripts/fetch-osm-data.mjs --aoi=${aoiId} --raw=<saved.json>\n` +
        "See docs/OSM_PIPELINE.md.",
    );
    process.exit(1);
  }
  raw = result.json;
  if (args["save-raw"]) {
    mkdirSync(dirname(String(args["save-raw"])), { recursive: true });
    writeFileSync(String(args["save-raw"]), JSON.stringify(raw, null, 2));
  }
  source = {
    api: "Overpass API",
    endpoint: result.endpoint,
    query,
    fetched_at: new Date().toISOString(),
  };
}

const wantedTypes = new Set(featureKeys.map((k) => FEATURE_CLASSES[k].type));
const { features, skipped, rawVertices } = reduce(raw, { projector, toleranceKm, wantedTypes });

const counts = {};
for (const f of features) counts[f.type] = (counts[f.type] ?? 0) + 1;

const out = {
  generated_by: "scripts/fetch-osm-data.mjs",
  aoi: {
    id: aoiId,
    name: aoi.name,
    note: aoi.note,
    center,
    bbox,
  },
  projection: {
    kind: "equirectangular",
    origin: center,
    units: "km",
    axes: "x = east, z = south (north is -z)",
    m_per_deg_lat: round(projector.mPerDegLat, 3),
    m_per_deg_lon: round(projector.mPerDegLon, 3),
    note: "Metric local frame, NOT scene units — the renderer's X axis is band-compressed distance (src/three/worldMapping.ts).",
  },
  simplification: {
    algorithm: toleranceKm > 0 ? "douglas-peucker" : "none",
    tolerance_m: toleranceM,
    vertices_in: rawVertices,
    vertices_out: features.reduce((n, f) => n + f.points.length, 0),
  },
  source: {
    ...source,
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    attribution_required: true,
  },
  counts: { features: features.length, ...counts, skipped },
  features,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

if (!args.quiet) {
  const pct = rawVertices
    ? Math.round((1 - out.simplification.vertices_out / rawVertices) * 100)
    : 0;
  const byType = Object.entries(counts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  console.error(`Wrote ${outPath}`);
  console.error(`  features   ${features.length}  (${byType || "none"})`);
  console.error(`  vertices   ${rawVertices} → ${out.simplification.vertices_out} (-${pct}% at ${toleranceM} m)`);
  console.error(
    `  skipped    ${Object.entries(skipped)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")}`,
  );
}
