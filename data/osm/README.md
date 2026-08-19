# data/osm/

Committed OpenStreetMap extracts, one file per AOI, produced by
`scripts/fetch-osm-data.mjs`. See `docs/OSM_PIPELINE.md`.

**Expected contents (not present yet):**

| File | AOI | Status |
|---|---|---|
| `pokrovsk.json` | Pokrovsk, Donetsk Oblast (~17 km box) | **Pending** — the fetch cannot run in an agent session; this environment's egress proxy returns 403 for `overpass-api.de` and every mirror. |
| `kramatorsk.json` | Kramatorsk, Donetsk Oblast | Pending, pass 2. |

Run `node scripts/fetch-osm-data.mjs` from a machine with open egress to fill
these in — or run the query in overpass-turbo.eu and feed the saved response to
`--raw=`. Nothing here is hand-authored: invented coordinates for a real place,
committed as OSM data, would be indistinguishable from the real thing and are
not an acceptable placeholder.

Data drawn from these files is **ODbL 1.0** and requires a visible
"© OpenStreetMap contributors" credit wherever it is rendered.
