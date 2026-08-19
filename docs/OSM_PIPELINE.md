# OSM rail-line & tree-line pipeline

Pulling real rail lines, windbreak tree rows, roads and rivers for a named
area of interest, once, and committing the result as static JSON.

Script: `scripts/fetch-osm-data.mjs`. Output: `data/osm/<aoi>.json`.

---

## Status: Pokrovsk is in; the fetch is still blocked in agent sessions

`data/osm/pokrovsk.json` is committed (Pass 12/13) — produced from GeoJSON
exports pasted in from a phone, not from a fetch run inside this repo's
sandbox (see below). `data/osm/kramatorsk.json` still needs the same
treatment. One resolved data-quality note: Pokrovsk's rail network is almost
entirely tagged `railway=disused` rather than `rail` (a former Soviet-era
freight yard, still real trackage) — `classify()` now recognizes that and
the file carries 303 rail features. See `docs/DECISIONS.md` Pass 13.

The reduce/projection half of the pipeline is written, exercised and
deterministic. The **fetch half has never run to completion from inside this
sandbox**: this environment's egress proxy refuses the tunnel to Overpass.

```
$ curl -sv https://overpass-api.de/api/status
> CONNECT overpass-api.de:443 HTTP/1.1
< HTTP/1.1 403 Forbidden
* CONNECT tunnel failed, response 403
```

The proxy's own status endpoint records it as
`connect_rejected — gateway answered 403 to CONNECT (policy denial or upstream
failure)`. Same answer from `overpass.kumi.systems`,
`overpass.private.coffee`, `overpass.osm.ch`, `z.overpass-api.de`,
`lz4.overpass-api.de` and `api.openstreetmap.org` — this is a host-allowlist
denial, not a flaky mirror, and the proxy's README is explicit that policy
denials get reported rather than routed around.

So `data/osm/pokrovsk.json` is **not** in the repo yet. It cannot be
hand-written either: inventing coordinates for a real town and committing them
as OSM data would be a fabrication that looks exactly like the real thing.

**To produce it,** on any machine with normal internet:

```bash
git checkout claude/osm-rail-tree-pipeline-fmtc6z
node scripts/fetch-osm-data.mjs                  # → data/osm/pokrovsk.json
node scripts/fetch-osm-data.mjs --aoi=kramatorsk # → data/osm/kramatorsk.json
git add data/osm && git commit -m "Add OSM terrain data for Pokrovsk AOI"
```

**Or without running node against the API at all** — paste the query below into
<https://overpass-turbo.eu>, run it, *Export → download/copy as raw OSM data*,
then hand the saved file to the offline half:

```bash
node scripts/fetch-osm-data.mjs --raw=pokrovsk-overpass.json
```

Both routes produce a byte-identical file for the same input — the fetch stage
does nothing but retrieve.

**On a phone, use the GeoJSON export instead.** overpass-turbo's raw-OSM-data
export is an API response with no filename — iOS Safari mostly refuses to
save it. *Export → GeoJSON* is a real downloadable/pasteable blob, and `--raw=`
accepts it directly (auto-detected by `"type": "FeatureCollection"`, converted
to the same internal shape before classify/simplify/project run) — no
conversion step, no different output. This is how `data/osm/pokrovsk.json`
was actually produced (Pass 12): exported as GeoJSON, pasted into chat, saved
to a file, reduced offline. If pasting fails too, the *Export* panel's "copy
to clipboard" under GeoJSON also works — same content either way.

---

## The AOIs

| id | Area | Centre (lat, lon) | bbox (S, W, N, E) | Why |
|---|---|---|---|---|
| `pokrovsk` (default) | Pokrovsk, Donetsk Oblast | 48.2828, 37.1828 | `48.2028,37.0628,48.3628,37.3028` | Dense rail junction, classic steppe tree-row pattern; extends east toward Myrnohrad to catch the rail yards. ~17 km box. |
| `kramatorsk` | Kramatorsk, Donetsk Oblast | 48.7194, 37.5561 | `48.6394,37.4361,48.7994,37.6761` | Pass 2. Larger urban core, the Kazennyi Torets river break, airport infrastructure, more terrain variety. |

Add an AOI by adding one entry to `AOIS` in the script; nothing else changes.
`--bbox=s,w,n,e` overrides a stored box ad hoc (the projection origin is then
recomputed as the box centre).

## The queries

Pokrovsk:

```
[out:json][timeout:180];
(
  way["railway"="rail"](48.2028,37.0628,48.3628,37.3028);
  way["natural"="tree_row"](48.2028,37.0628,48.3628,37.3028);
  way["landuse"="forest"](48.2028,37.0628,48.3628,37.3028);
  way["natural"="wood"](48.2028,37.0628,48.3628,37.3028);
  way["highway"~"^(primary|secondary|tertiary)$"](48.2028,37.0628,48.3628,37.3028);
  way["waterway"="river"](48.2028,37.0628,48.3628,37.3028);
);
out geom;
```

Kramatorsk:

```
[out:json][timeout:180];
(
  way["railway"="rail"](48.6394,37.4361,48.7994,37.6761);
  way["natural"="tree_row"](48.6394,37.4361,48.7994,37.6761);
  way["landuse"="forest"](48.6394,37.4361,48.7994,37.6761);
  way["natural"="wood"](48.6394,37.4361,48.7994,37.6761);
  way["highway"~"^(primary|secondary|tertiary)$"](48.6394,37.4361,48.7994,37.6761);
  way["waterway"="river"](48.6394,37.4361,48.7994,37.6761);
);
out geom;
```

`node scripts/fetch-osm-data.mjs --aoi=<id> --print-query` regenerates either
one, so the copy above can never be the only source of truth.

Deviations from the query in the brief, both deliberate:

- **`timeout:180`, not `25`.** Four feature classes over a 17 km box regularly
  runs past 25 s on a busy mirror, and a timeout there burns somebody else's
  CPU for nothing.
- **One query, not four.** Same selectors, same results, a third of the load on
  a volunteer-run service. Feature classes are recovered from tags on the way
  back, and `--features=rail,trees` narrows the query when only some are wanted.

Ways only, as the brief specifies. Some large forests are mapped as
multipolygon *relations* and will not appear — worth revisiting if the tree
coverage looks thin once the data is in hand.

## Output shape

```jsonc
{
  "generated_by": "scripts/fetch-osm-data.mjs",
  "aoi":     { "id", "name", "note", "center": [lat, lon], "bbox": [s, w, n, e] },
  "projection": {
    "kind": "equirectangular",
    "origin": [lat, lon],          // AOI centre
    "units": "km",
    "axes": "x = east, z = south (north is -z)",
    "m_per_deg_lat": 111195.785,   // WGS84 series, evaluated once at the origin
    "m_per_deg_lon": 74216.564
  },
  "simplification": { "algorithm": "douglas-peucker", "tolerance_m": 5, "vertices_in", "vertices_out" },
  "source":  { "api", "endpoint", "query", "fetched_at", "license": "ODbL 1.0",
               "attribution": "© OpenStreetMap contributors", "attribution_required": true },
  "counts":  { "features", "rail_line", "tree_row", "road", "river", "skipped": { ... } },
  "features": [
    {
      "type": "rail_line" | "tree_row" | "road" | "river",
      "id": "osm_12345",
      "osm_id": 12345,
      "closed": false,             // true = ring (a wood/forest polygon, not a line)
      "length_km": 2.417,          // measured before simplification
      "points": [[lat, lon], ...], // 6 dp
      "xz":     [[x, z], ...],     // km east / km south of the AOI centre, 3 dp
      "tags":   { "railway": "rail" }
    }
  ]
}
```

Notes on the shape:

- **`points` and `xz` are index-aligned** — same vertices, two frames.
  Everything a renderer needs is in `xz`; `points` is kept so the data can be
  re-projected later without re-fetching.
- **`closed` matters.** The brief folds `natural=tree_row`,
  `landuse=forest` and `natural=wood` all into `type: "tree_row"`, which is
  what the script does — but a windbreak is a line to instance trees *along*
  and a wood is a polygon to fill. `closed` plus `tags` is how you tell them
  apart; the flattened `type` alone is not enough. Flagged rather than
  silently re-designed.
- **Simplification is Douglas–Peucker at 5 m**, run on the metric points so the
  tolerance means metres in both axes. `--tolerance=0` disables it. OSM rail
  ways carry survey-grade vertex density that no view at this scale can
  resolve; the raw `points` remain available at full fidelity in the raw
  Overpass response if `--save-raw` was used.
- **Deterministic.** Features are sorted by `(type, osm_id)` and all numbers
  are rounded, so re-running on the same input produces a byte-identical file
  and git shows a real data change or nothing.
- **Nothing is silently dropped.** `counts.skipped` reports every element that
  did not become a feature, by reason (`no_geometry`, `unclassified`,
  `not_requested`, `degenerate`).

## Licensing — this one has an obligation attached

OpenStreetMap data is **ODbL 1.0**. Drawing these features in the app requires
a visible **"© OpenStreetMap contributors"** credit; a derived database
produced from it and published would additionally have to be offered under
ODbL. The attribution string ships inside every output file's `source` block
so it travels with the data, but *nothing renders it yet* — whoever does the
integration pass has to put it on screen (the About page and/or a corner
credit in the view that draws the lines). Listed in `docs/BACKLOG.md`.

This does not conflict with CLAUDE.md's "authored geometry only, never fetched
binary assets" rule. That rule exists because a fetched 3D model or icon
carries a license nobody in the session can actually read. Coordinates from a
named source under a known, attributed, share-alike license are the case the
rule was drawn around — but the credit is the price, so it is not optional.

## Integration — deliberately not done here

Turning this JSON into geometry is blocked on the renderer diagnostic (real 3D
meshes vs. 2.5D layered sprites), per the brief. One finding from this repo
that the integration prompt will need either way:

**The scene's X axis is not geographic distance.** `src/three/worldMapping.ts`
maps X to *band-compressed* distance from the zero line — a non-linear
allocation that fits a 0–5 km FPV envelope and a 500 km deep-strike target on
one legible axis (docs/DECISIONS.md Pass 5/6). Z is a lateral strip of a few
km carrying no distance claim, and the terrain is synthetic value noise, never
real geography (`src/pages/AboutPage.tsx`, "Why this isn't a real map").

So a 17 km metric AOI cannot simply be laid over the existing world: at the
default bands, 17 km of real ground spans two band boundaries and would be
stretched non-uniformly, which visibly warps a straight rail line. The
plausible resolutions — pick one *before* writing extrusion code:

1. **Metric inset.** Draw the AOI at true 1:1 scale inside one band's span, as
   a local patch rather than a world-spanning layer. Geometry stays honest;
   coverage is partial.
2. **Lateral only.** Use the AOI's north–south extent on Z (which carries no
   distance claim) and ignore its east–west extent, i.e. treat the rail lines
   as texture rather than as located features.
3. **A separate real-geography view.** A third renderer where X and Z are both
   metric, alongside the existing band-compressed one — the honest option, and
   the most work.

The projection this script emits (metric km east/south of the AOI centre) is
the input all three need, which is why the script stops there and does not
pretend to emit scene units.
