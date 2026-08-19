# Multi-Domain Warfare Digital Twin

An interactive, illustrative cross-section of the Russo-Ukrainian war — deep
rear to zero line, mirrored on Ukraine and Russia, stacked across eight
domain layers. Built as a teaching and briefing tool for UAV instructors,
sales and defence procurement audiences.

> **This is a composite teaching model, not a map.** It is built from
> open-source doctrine, publicly reported equipment characteristics, and two
> user-supplied equipment catalogs. It does not depict real current unit
> positions, troop dispositions, or order of battle — named systems are real,
> currently-fielded equipment reported in this war, but where each sits on
> the map is a representative placement within a distance band, not a
> measured position. The disclaimer is stated in the app's own About panel.

## Running it

```bash
npm install
npm run dev              # http://localhost:5173
npm run build            # production build to dist/, multi-chunk
npm run build:standalone # single-file build for publishing as a static artifact
npm run preview          # serve the production build
```

Run `node scripts/audit-content.mjs` for the content verification report.

Open `#bench` (e.g. `http://localhost:5173/#bench`) for the renderer
head-to-head that settled the layered-DOM vs. WebGL question. See
[docs/DECISIONS.md](docs/DECISIONS.md) for the numbers and the reasoning, and
[docs/BACKLOG.md](docs/BACKLOG.md) for what's flagged but not yet resolved
(most notably: a shared sync endpoint needs standing up — the adapter ships,
the URL is yours to create).

**Public URL:** pushes to this branch auto-build and deploy to GitHub Pages
via `.github/workflows/deploy-pages.yml`. One-time setup if not already done:
repo Settings → Pages → Source → "GitHub Actions".

## What's here

- **3D terrain view (default)** — a real WebGL scene: perspective camera you
  can orbit, a synthetic stylized terrain strip (rolling steppe, a churned
  scar along the zero line, instanced treelines and craters), distance fog,
  and altitude that actually means altitude — air and space assets sit above
  the ground plane on a tether to their true position. Eleven hero assets
  carry real low-poly 3D models; the rest are markers. Deliberately not a
  real map: satellite geography was tried in Pass 4 and reverted because it
  cannot share one legible axis across 0–5 km and 500 km+ (docs/DECISIONS.md).
  Labels stay DOM buttons — crisp, tabbable, screen-reader reachable.
- **Schematic view** — one toolbar click away, and still the home of the
  distance ruler, the live band editor and the dependency-line overlay.
  Horizontal scroll moves toward and through the
  zero line into the opposing side; vertical scroll moves between domain
  layers. A single persistent ruler labels distance independently per side —
  every node's screen position matches its true distance, in every lane.
- Every asset, band, domain, connection, doctrine marker, and equipment
  catalog entry comes from `data/`. Nothing about the battlefield is
  hardcoded in a component.
- Click any asset for the full detail panel: a guaranteed cost tile plus 3
  comparable key facts, role, characteristics, employment, what changed
  versus traditional warfare, notable sourced moments, dependencies, media
  and sources — with unsourced claims flagged as unverified.
- Every free-text field in the detail panel is editable in place (inline
  "edit", independent "reset to authored text"), and the Media section
  accepts pictures and video uploaded from your device — pictures persist,
  video plays for the current session (see the backlog for why).
- **System swap**: an asset tagged with a `comparison_group` (14 of 27) can
  show any same-side, same-role system from `data/catalog/` instead — e.g.
  Russia's armor slot showing T-90M instead of the default T-72B3 — without
  touching its position, connections, or role narrative.
- **Key lessons** — 10 lessons seeded from `docs/doctrine.md`, each carrying
  the doctrine section and source tag behind it, and each pointing at the
  assets that demonstrate it: "show on map" flies the 3D camera to that set
  and dims the rest.
- **Verification status on every asset** — `verified · N sources`,
  `1 source only`, or `unverified`, derived from the citations by
  `scripts/audit-content.mjs` rather than hand-written. See
  [docs/CONTENT_PIPELINE.md](docs/CONTENT_PIPELINE.md).
- Editable distance bands and per-asset placement, live. Storage is pluggable
  (`src/state/persistence.ts`): this browser by default, a shared REST store
  when `VITE_SYNC_URL` is set, plus Export/Import to move a working set
  between devices with no backend at all.
- Category show/hide across 18 groups, independent of the domain layers.
- Dependency overlay with a distinct stroke per connection type, direction
  arrows, per-edge descriptions on hover, and hover-to-isolate a node's
  own edges when several converge on one hub.
- Pending-target handling: a connection may point at an asset that does not
  exist yet. Both documented behaviours are implemented and switchable.
- Data health panel listing everything the loader flagged — a working checklist
  while the remaining categories get filled in.

## Adding an asset

Drop a new file in `data/assets/`. That's the whole procedure.

```bash
data/assets/side_a-uav-reconnaissance-tactical.json
```

The loader globs the directory, so the asset appears on next reload — no
registry, no import, no code change. Any connection already pointing at its id
resolves automatically and its pending stub disappears. Click any pending stub
in the app to copy a pre-filled JSON skeleton for exactly that id.

Follow the conventions in [`data/README.md`](data/README.md) (the scaffold's own
guide) — particularly the sourcing convention: where research is thin, say so
in `sources` rather than presenting a guess as fact. The app surfaces that
distinction in the detail panel and in Data health.

## Layout

```
data/                     the battlefield, as data
  assets/*.json           one asset per file
  bands.json              distance bands (echelon structure)
  domains.json            domain layers, in vertical scroll order
  connections.json        flat dependency list
  doctrine_markers.json   sourced depth findings for the ruler overlay
src/
  types.ts                the scaffold schema, unmodified — the contract
  config/ui.ts            side labels, palettes, view geometry
  data/
    loader.ts             globs, validates, merges edges, builds pending stubs
    validate.ts           runtime schema checks
    model.ts              loader-derived types (does not extend the schema)
  three/
    worldMapping.ts       band-compressed px → 3D world coords (pure)
    terrain3d.ts          synthetic stylized terrain heightfield
    models.ts             procedural low-poly hero models
    props.ts              instanced trees / craters / scrub
    Scene3D.tsx           the WebGL scene (lazy-loaded)
  scene/
    projection.ts         battlefield → screen geometry (pure, no DOM)
    Scene.tsx             scroll container, lanes, rail
    Ruler.tsx             distance axis + doctrine overlay
    AssetNode.tsx         one placed node
    ConnectionsOverlay.tsx dependency lines
    vignettes.ts          reactive-behaviour registry (step 6 seam)
  components/             detail panel, toolbar, about, data health, legend
  icons/registry.tsx      uniform illustrated icon set
  bench/Bench.tsx         DOM vs. WebGL benchmark (#bench)
  three/                  (see above)
scripts/audit-content.mjs content verification audit
docs/DECISIONS.md         stack, rendering calls, open items, what's deferred
docs/CONTENT_PIPELINE.md  two-pass drafting/verification process
docs/doctrine.md          the sourced narrative spine; seeds data/lessons.json
```

## Sources

[`docs/doctrine.md`](docs/doctrine.md) is the narrative reference every asset's
`contrast_vs_traditional` draws from. Per-asset citations live in each asset's
`sources` array and render in the detail panel. The ruler's doctrine overlay
carries a source tag per marker.
