# data/osm/

Committed OpenStreetMap extracts, one file per AOI, produced by
`scripts/fetch-osm-data.mjs`. See `docs/OSM_PIPELINE.md`.

| File | AOI | Status |
|---|---|---|
| `pokrovsk.json` | Pokrovsk, Donetsk Oblast (~17 km box) | **Committed** (Pass 12) and **integrated** into the 3D view's metric inset (Pass 14, `src/three/osmTerrain.ts`). 1415 features: 303 rail lines (mostly `railway=disused` — a former Soviet-era freight yard, see `docs/DECISIONS.md` Pass 13), 1010 tree rows/woods, 99 roads, 3 rivers. |
| `pokrovsk.inset.json` | derived from `pokrovsk.json` | **Generated**, not hand-authored or independently sourced — `scripts/build-osm-inset.mjs` radius-clips and strips `pokrovsk.json` down to the ~140 KB the 3D view's renderer actually needs (rail lines + tree rows only, no `points`/`tags`/`osm_id`), so the lazy 3D bundle doesn't ship the full 1.7 MB fetch. Regenerate after any change to the clip radius or renderer's inset constants — see that script's header. Not meant to be read by anything except `src/three/osmTerrain.ts`. |
| `kramatorsk.json` | Kramatorsk, Donetsk Oblast | Still pending — the fetch cannot run in an agent session (this environment's egress proxy returns 403 for `overpass-api.de` and every mirror; see `docs/OSM_PIPELINE.md`). Same phone/GeoJSON-export route that produced `pokrovsk.json` would get it. |

Run `node scripts/fetch-osm-data.mjs --aoi=kramatorsk` from a machine with
open egress to fill in the last row — or run the query in overpass-turbo.eu
and feed the saved response to `--raw=`. Nothing here is hand-authored:
invented coordinates for a real place, committed as OSM data, would be
indistinguishable from the real thing and are not an acceptable placeholder.

Data drawn from these files is **ODbL 1.0** and requires a visible
"© OpenStreetMap contributors" credit wherever it is rendered — see the 3D
view's corner tag and the About page's "The one patch of real terrain"
section, both driven from `src/config/osm.ts` rather than hand-typed twice.
