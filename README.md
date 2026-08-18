# Multi-Domain Warfare Digital Twin

An interactive, illustrative cross-section of a modern multi-domain
battlefield — deep rear to zero line, mirrored on two opposing sides, stacked
across eight domain layers. Built as a teaching and briefing tool for UAV
instructors, sales and defence procurement audiences.

> **This is a composite teaching model, not a map.** It is built from
> open-source doctrine, publicly reported equipment characteristics and generic
> force-structure patterns. It does not depict real current unit positions.
> Named systems appear as representative examples that make a category
> concrete. The disclaimer is stated in the app's own About panel.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm run preview    # serve the production build
```

Open `#bench` (e.g. `http://localhost:5173/#bench`) for the renderer
head-to-head that settled the layered-DOM vs. WebGL question. See
[docs/DECISIONS.md](docs/DECISIONS.md) for the numbers and the reasoning.

## What's here

Build-sequence steps 1, 2, 4 and 5 from the master prompt, on the four assets
that shipped with the scaffold. Step 3 (the breadth pass across every category)
is deliberately not done — the mechanics get proven first, then categories go
in one at a time.

- Scrollable oblique cross-section. Horizontal scroll moves toward and through
  the zero line into the opposing side; vertical scroll moves between domain
  layers. A persistent ruler labels distance independently per side.
- Every asset, band, domain, connection and doctrine marker comes from `data/`.
  Nothing about the battlefield is hardcoded in a component.
- Click any asset for the full detail panel: role, characteristics, employment,
  what changed versus traditional warfare, dependencies, imagery and sources —
  with unsourced claims flagged as unverified rather than presented as fact.
- Dependency overlay with a distinct stroke per connection type, direction
  arrows, per-edge descriptions on hover, and filtering by type.
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
docs/DECISIONS.md         stack, rendering call, open items, what's deferred
```

## Sources

[`docs/doctrine.md`](docs/doctrine.md) is the narrative reference every asset's
`contrast_vs_traditional` draws from. Per-asset citations live in each asset's
`sources` array and render in the detail panel. The ruler's doctrine overlay
carries a source tag per marker.
