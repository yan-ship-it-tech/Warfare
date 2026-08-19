# OSM pipeline — session handoff

Plain-language summary of the session that added `scripts/fetch-osm-data.mjs`.
Written to be pasted into a fresh Claude session (or read by a human) without
any of the prior conversation.

Branch: `claude/osm-rail-tree-pipeline-fmtc6z` · commit `2a2b093`

> **Update (Pass 12):** `data/osm/pokrovsk.json` is now committed — everything
> below describing it as missing is history, not current state. It got in via
> a route this doc didn't originally cover: the user was on an iPhone, the
> raw-OSM-data export wouldn't save from Safari, so they used overpass-turbo's
> *GeoJSON* export instead (a real downloadable/pasteable blob) and pasted it
> into chat. `--raw=` now accepts that format directly — see
> `docs/OSM_PIPELINE.md`'s "On a phone, use the GeoJSON export instead"
> section and `docs/DECISIONS.md` Pass 12. One thing still open: the
> `rail_line` layer in that file is a single 5 m segment, not a real rail
> network — see `docs/BACKLOG.md`. `data/osm/kramatorsk.json` still doesn't
> exist; the same phone/GeoJSON route below would get it.

---

## TL;DR

1. You asked for a script that pulls real OpenStreetMap lines (rail, tree rows,
   roads, rivers) around Pokrovsk, and for the resulting JSON to be committed.
2. **The script exists and works.** `scripts/fetch-osm-data.mjs`.
3. **The JSON is not committed**, because the sandbox this ran in blocks
   network access to Overpass (HTTP 403 at the egress proxy, every mirror).
4. Nothing was faked to cover the gap — inventing coordinates for a real town
   and committing them as OSM data would look identical to real data.
5. **You can finish it in about a minute** from your own machine. Two ways,
   both below.

---

## 1. What is in the repo now

| File | What it is |
|---|---|
| `scripts/fetch-osm-data.mjs` | The whole pipeline. Fetch stage + offline reduce stage. |
| `docs/OSM_PIPELINE.md` | Full reference: AOIs, queries, output schema, licensing, integration options. |
| `data/osm/README.md` | Placeholder explaining what belongs in that folder and why it's empty. |
| `docs/DECISIONS.md` → "Pass 11" | Why every choice was made, and every deviation from your brief. |
| `docs/BACKLOG.md` → "Pass 11" | The four things left open. |
| `package.json` | New script: `npm run fetch:osm`. |

**No `src/` code was touched.** Nothing about how the app renders changed.

## 2. The blocker, precisely

```
$ curl -sv https://overpass-api.de/api/status
> CONNECT overpass-api.de:443 HTTP/1.1
< HTTP/1.1 403 Forbidden
```

Same 403 from `overpass.kumi.systems`, `overpass.private.coffee`,
`overpass.osm.ch`, `z.overpass-api.de`, `lz4.overpass-api.de` and
`api.openstreetmap.org`. That pattern means a host allowlist — the environment
is configured not to reach those hosts — not a mirror having a bad day. It will
not fix itself on a retry, and routing around an egress policy is not something
an agent session should do.

## 3. How to unblock it — pick one

### Option A — you have a normal internet connection

```bash
git checkout claude/osm-rail-tree-pipeline-fmtc6z
npm install                                       # if you haven't
node scripts/fetch-osm-data.mjs                   # → data/osm/pokrovsk.json
node scripts/fetch-osm-data.mjs --aoi=kramatorsk  # → data/osm/kramatorsk.json
git add data/osm && git commit -m "Add OSM extracts for Pokrovsk and Kramatorsk" && git push
```

### Option B — no terminal internet, just a browser

```bash
node scripts/fetch-osm-data.mjs --print-query      # prints the Overpass query
```

1. Paste that query into <https://overpass-turbo.eu> and press Run.
2. **Export → download/copy as raw OSM data** → save as e.g. `pokrovsk-raw.json`.
3. Feed it to the offline half of the script — no network used:

```bash
node scripts/fetch-osm-data.mjs --raw=pokrovsk-raw.json   # → data/osm/pokrovsk.json
```

Both options produce a byte-identical file. The fetch stage only retrieves; all
the actual processing happens locally either way.

## 4. What the script does, in order

1. **Query** — one Overpass request per AOI covering all four feature classes.
2. **Classify** — each returned way becomes `rail_line`, `tree_row`, `road` or
   `river`, by tag precedence.
3. **Simplify** — Douglas–Peucker at 5 m (OSM rail has survey-grade vertex
   density no view at this scale can resolve). `--tolerance=0` turns it off.
4. **Project** — lat/lon → local metric frame: kilometres east (`x`) and south
   (`z`) of the AOI centre.
5. **Write** — `data/osm/<aoi>.json`, sorted deterministically so a re-run
   either shows a real data change in git or shows nothing.

Useful flags: `--aoi=`, `--bbox=s,w,n,e`, `--features=rail,trees`,
`--tolerance=`, `--raw=`, `--save-raw=`, `--out=`, `--print-query`, `--help`.

### AOIs already configured

| id | Area | bbox (S, W, N, E) |
|---|---|---|
| `pokrovsk` (default) | Pokrovsk, Donetsk Oblast | `48.2028,37.0628,48.3628,37.3028` |
| `kramatorsk` | Kramatorsk, Donetsk Oblast | `48.6394,37.4361,48.7994,37.6761` |

## 5. Output file shape (what the integration step will consume)

```jsonc
{
  "aoi":        { "id", "name", "center": [lat, lon], "bbox": [s, w, n, e] },
  "projection": { "kind": "equirectangular", "origin": [lat, lon], "units": "km",
                  "axes": "x = east, z = south (north is -z)" },
  "source":     { "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors", ... },
  "counts":     { "features", "rail_line", "tree_row", "road", "river", "skipped": {...} },
  "features": [
    {
      "type": "rail_line" | "tree_row" | "road" | "river",
      "id": "osm_12345",
      "closed": false,             // true = a ring (wood/forest polygon, not a line)
      "length_km": 2.417,
      "points": [[lat, lon], ...], // original frame, kept so it can be re-projected later
      "xz":     [[x, z], ...],     // km east / km south of AOI centre — index-aligned with points
      "tags":   { "railway": "rail" }
    }
  ]
}
```

## 6. Deviations from your brief (all deliberate, all flagged)

| Brief said | What was done | Why |
|---|---|---|
| Project to "scene coordinates" | Projects to **metric km** | The app's X axis isn't geographic — see §7. Metric is the honest input for all three ways forward. |
| `timeout:25`, four separate queries | `timeout:180`, one merged query | Four classes over a 17 km box regularly exceeds 25 s; one query is a third of the load on a volunteer-run service. |
| One `osm-terrain-data.json` | `data/osm/<aoi>.json` | You describe running it against a second AOI; one file each stops Pokrovsk and Kramatorsk overwriting one another. |
| `tree_row` covers tree rows + forest + wood | Kept that type, **added** `closed` + raw tags | A windbreak is a line to place trees *along*; a wood is a polygon to *fill*. The flattened type alone can't tell them apart. |

## 7. Two decisions to make before anyone writes rendering code

### (a) The app's X axis is not real distance

`src/three/worldMapping.ts` maps X to **band-compressed** distance from the
front line — non-linear on purpose, so a 0–5 km FPV envelope and a 500 km
strike target both fit on one legible axis (`docs/DECISIONS.md` Pass 5/6). The
terrain is synthetic noise, never real geography.

So real Pokrovsk geometry can't just be laid over the existing world: 17 km of
real ground crosses band boundaries and gets stretched at different rates,
which visibly bends a straight rail line. Three honest ways out:

1. **Metric inset** — draw the AOI at true 1:1 scale inside one band's span, as
   a local patch. Geometry stays true; coverage is partial.
2. **Lateral only** — use the AOI's north–south extent on Z (which makes no
   distance claim) and ignore east–west; rail lines become texture rather than
   located features.
3. **A separate real-geography view** — a third renderer where both axes are
   metric. Most honest, most work.

### (b) The renderer question you already flagged

Real 3D meshes (extrude rail along the point list, instance tree props) vs.
2.5D layered sprites (styled SVG/canvas paths). Still open — that was the
"blocked on the diagnostic" item in your original brief. It's a *different*
question from (a); both need answering.

### (c) ODbL attribution — not optional

OSM data is ODbL 1.0. Anything that draws it owes a visible
"© OpenStreetMap contributors" credit. The string ships inside every output
file's `source` block so it travels with the data, but **nothing renders it
yet** — that lands on whoever does the integration (About page and/or a corner
credit in the view that draws the lines).

---

## 8. Prompt to hand the next session

Once `data/osm/pokrovsk.json` exists:

> Read `docs/OSM_PIPELINE.md` and `docs/DECISIONS.md` (Pass 11), then integrate
> `data/osm/pokrovsk.json` into the 3D view. Use **option _N_** from the
> "Integration" section for the geography-vs-band-compressed-axis problem, and
> render it as **real 3D geometry / 2.5D paths** [pick one]: extrude rail lines
> along their `xz` point lists and instance tree props along `tree_row`
> features (respecting the `closed` flag — closed rings are woods to fill, open
> lines are windbreaks to follow). Add the required
> "© OpenStreetMap contributors" credit. Log the pass in `docs/DECISIONS.md`.

If the data still isn't there, the next session cannot do the integration —
it would have to invent the geometry, which is the thing this pass refused to
do.
