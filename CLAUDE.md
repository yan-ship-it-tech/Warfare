# CLAUDE.md

Guidance for Claude Code (or any fresh agent session) working in this repo.

## What this is

A **Multi-Domain Warfare Digital Twin** — an interactive teaching/briefing
tool visualizing the Russo-Ukrainian war. React 18 + TypeScript + Vite SPA,
entirely data-driven from JSON in `data/`, deployed to GitHub Pages via
`.github/workflows/deploy-pages.yml` on every push to `main` or
`claude/warfare-digital-twin-scaffold-19u7kt`.

Two renderers, both real, neither a mockup:
- **3D terrain view** (default) — `src/three/`, a genuine WebGL scene:
  Three.js draws terrain/models/fog on a perspective camera; real DOM
  `<button>` elements stay the labels and hit-targets, positioned by
  projecting world coordinates to screen space every frame. Terrain is
  synthetic (deterministic value noise), never real geography — see
  "Why this isn't a real map" in `src/pages/AboutPage.tsx`.
- **Schematic 2D cross-section view** — `src/scene/`, one toolbar click
  away. Owns the distance ruler, the band editor's live feedback, and the
  dependency-line overlay; the 3D view reads the same underlying
  projection (`src/scene/projection.ts`) so the two views can never
  disagree about where anything is.

**Read `docs/DECISIONS.md` before assuming anything about *why* the code
looks the way it does.** It's a full build log across 12 passes, written
specifically so a fresh session doesn't have to rediscover reasoning that's
already settled — rendering approach, licensing constraints, what got
reverted and why, every place a later pass's literal instructions collided
with something an earlier pass learned. Treat it as required reading before
making an architectural change, not optional history.

**Then read `docs/PLANNING.md`** — the forward-looking brief for the next
major push (Passes 16–21), with a sequencing/dependency order and a
"decisions already made, do not re-litigate" table of its own. The stated
reading order for any session is `CLAUDE.md` → `DECISIONS.md` →
`PLANNING.md`.

## Where things live

| Path | What |
|---|---|
| `data/assets/*.json` | One file per asset — the whole roster (103 as of Pass 18, incl. 14 first-class `infantry`/`medical`/`artillery`/`c2`/`logistics` human-and-positional assets). Add a new asset by adding a new file (or via the in-app Asset Editor, see below); no code change needed. Every asset carries a `placement_rationale` (Pass 18 — why its `distance_km_from_zero` is doctrinally plausible, sourced same convention as `sources`; see `docs/CONTENT_PIPELINE.md`). |
| `data/bands.json`, `domains.json`, `groups.json`, `connections.json`, `lessons.json`, `doctrine_markers.json` | Everything else the world model is built from. |
| `data/osm/*.json` | Committed OpenStreetMap line extracts, one file per AOI (rail lines, tree rows, roads, rivers), produced by `scripts/fetch-osm-data.mjs`. ODbL — requires a visible "© OpenStreetMap contributors" credit wherever rendered. See `docs/OSM_PIPELINE.md`; `pokrovsk.json` is in (303 rail features, mostly `railway=disused` — a former freight yard, see `docs/DECISIONS.md` Pass 13) and **integrated into the 3D view as of Pass 17** (`src/three/osmTerrain.ts`, metric inset, see below), `kramatorsk.json` is not fetched yet (this sandbox's egress is still blocked; the fetch itself has to run elsewhere). |
| `data/catalog/*.json` | Swap-target systems (per-asset "compare this slot against a different real system" dropdown). |
| `src/data/loader.ts` | `loadWorld()` — assembles the `WorldModel` from the JSON above plus live overrides. Validates every asset via `src/data/validate.ts`, never throws on a bad file (degrades gracefully into a Data Health issue instead). |
| `src/data/model.ts` | Loader-derived types sitting on top of the schema in `src/types.ts` (the actual `Asset` contract). |
| `src/data/placement.ts` | **Engagement domain vs. platform domain** — resolves how high off the deck to draw an asset. Read the file header before touching altitude/tether logic in either renderer. |
| `src/scene/labelGrid.ts` | The one label-collision index both renderers share (uniform grid, cost scales with local crowding rather than roster size). `clear()` lets the 3D loop reuse one index per frame instead of allocating a new one. |
| `src/three/perfMonitor.ts` + `src/components/PerfOverlay.tsx` | Pass 16's frame-time / draw-call readout — the performance budget made visible. Allocation-free sampling in the render loop; the overlay polls it 4×/second and never re-renders per frame. On in `npm run dev`; in production it's the nav drawer's "Performance HUD" switch or `?perf=1` (query param, not hash — the hash is the router's). **Record the numbers before and after any rendering change.** |
| `src/three/` | The WebGL scene: `Scene3D.tsx` (main component — also owns drag-to-reposition and the tap/drag discriminator, hung off each DOM pin's `onPointerDown`, see Pass 11 and Pass 16), `worldMapping.ts` (world-unit conversion + `DOMAIN_ALTITUDE` + `worldXToKm`, the inverse a drag needs to turn a drop point back into a distance), `terrain3d.ts` (synthetic terrain, plus the coastal basin and — Pass 17 — the river the front crosses; `isInWater()` is the one check every scatter/placement loop needs before instancing into either), `models.ts` (`HERO_BUILDERS`, 30 entries as of Pass 19 — authored, not sourced, low-poly 3D models for a subset of assets, incl. Pass 19's 5 Russian UGVs, human figures, and Pass 18's fortification hero geometry; materials import from `palette.ts`), `palette.ts` (Pass 19 — the shared vehicle/hero material list, relocated out of `models.ts` so every builder file can reach for the same materials; `HERO_MATERIALS` export), `scenery.ts` (decorative trench lines/obstacle belts/power plant/etc., not clickable — Pass 17 adds the destroyed bridge + pontoon crossing and `TERRAIN_FEATURES`/`LANDMARKS`, both exported so Pass 18's siting code can read real feature/landmark coordinates instead of guessing; Pass 19 instances the trench/fighting-position belt and exports `SCENERY_MATERIALS` as its own governed material list), `props.ts` (instanced scatter — trees/craters), `osmTerrain.ts` (Pass 17 — the OSM metric inset: dynamically-imported `data/osm/pokrovsk.json`, clipped and drawn at its own true scale inside one band; `unitsPerKmAt`/`anchorXAt`/`ANCHOR_SIDE`/`ANCHOR_KM` exported so `tacticalSiting.ts` can site one asset on the exact same anchor rather than a second, independent guess; read this file's header before touching the anchor/scale derivation), `tacticalSiting.ts` (Pass 18 — a post-process on `worldMapping.ts`'s `lateralLayout()`, not a change to it: blends terrain-affine categories' already-collision-safe lateral position toward real `TERRAIN_FEATURES`/`LANDMARKS`; read this file's header before changing which categories get which affinity). |
| `src/state/overridesState.tsx` + `persistence.ts` | The live-edit layer: distance-band edits, per-asset placement/text/media overrides, and brand-new assets built in the Asset Editor all persist here — to `localStorage` by default, or a shared Cloudflare Worker if `VITE_SYNC_URL` is configured (see `docs/DEPLOY_SYNC_WORKER.md`). |
| `src/components/` | `AppHeader` (hamburger + brand) + `NavDrawer` (every toggle/filter, plus nav links to the routed pages below — Pass 9 replaced the old stacked-button `Toolbar` with this), `PageShell` (chrome for a routed page), `DetailPanel` (per-asset view + inline edit controls + Duplicate + — Pass 18 — `RosterSwapPicker`, a same-category swap that reuses Duplicate's own clone-into-`customAssets` mechanism), `AssetEditorPanel` (build a whole new asset from scratch, live; also opens directly into edit mode for a custom asset via `ViewState.editorTarget`), `BandsEditorPanel`, `Legend`, `SyncControls`, `CategoryFilterMenu`, `ScenarioFocusBanner` (Pass 11 — the visible entry/exit for `ViewState.focusRequest`'s scenario-focus mode). |
| `src/pages/` | Routed pages — `registry.tsx` (the `PAGES` array `NavDrawer`/`App.tsx` read; add a page by adding one entry here plus a component, see Pass 9), `DataHealthPage`, `LessonsPage`, `AboutPage`, `AssetLibraryPage` (Pass 11 — browse/filter every asset by side and category, independent of where it sits on the map). |
| `src/symbology/` | Pass 20 — `sidc.ts` resolves an asset (side/group/category/domain) to a real MIL-STD-2525C SIDC string; `MilSymbol.tsx` renders it via `milsymbol.js` (MIT). Detail-panel only (header badge + hero-image fallback) — the map renderers and `AssetLibraryPage` still use `src/icons/registry.tsx`'s hand-drawn set, see `docs/BACKLOG.md`. Lazy-loaded (`React.lazy` in `DetailPanel.tsx`) — milsymbol is ~780 kB on its own and would otherwise land in the main bundle. |
| `src/state/router.tsx` | Hash-based router (`#/health`, `#/lessons`, `#/about`) — not pushState, since GitHub Pages project sites have no server-side rewrite for it. Extends the `#bench` escape hatch `main.tsx` already used for the same reason. |
| `worker/` | Cloudflare Worker + KV — the real shared-sync backend, written and dry-run verified but **not deployable from an agent session** (no Cloudflare credentials here — needs a human with an account). |
| `docs/doctrine.md` | The sourced narrative spine. Every asset's `contrast_vs_traditional` and `employment_notes` should pull framing from here, not invent it fresh. |
| `docs/CONTENT_PIPELINE.md` | **Read before adding or editing asset content.** Two-pass process: draft a category, then verify it in a *separate* sitting via `node scripts/audit-content.mjs --write`, which derives each asset's `verification` status from its `sources` array (never hand-authored). |
| `docs/OSM_PIPELINE.md` | **Read before touching the OSM pipeline.** AOIs, queries, output schema, the ODbL obligation, and why real geography can't be laid over the band-compressed X axis unchanged. |
| `docs/BACKLOG.md` | Everything flagged but not done — category gaps, deferred decisions, things explicitly decided against. Check here before assuming a gap was overlooked. |
| `docs/PLANNING.md` | **The forward-looking brief.** What's coming next (currently Passes 16–21), a "do not re-litigate" table of decisions already made for that push, and an explicit dependency/sequencing order. Read after `DECISIONS.md`, before starting new work. |
| `docs/CLAUDE_CODE_BRIEFS_PASS16-21.md` | The self-contained, paste-in brief text for each of Passes 16–21 — one section per pass, meant to be dropped into a fresh Claude Code session at the start of that pass. `docs/PLANNING.md` carries the background each brief compresses out; read that first. |
| `docs/3d-model-sourcing-manifest.xlsx` | Pass 19's source list — 72 candidate 3D models (47 with a free sourced candidate, 8 flagged "Weak/Verify", 17 with no free source), with license/attribution info per row. Read before starting Pass 19. |
| `docs/imagery-sourcing-ledger.xlsx` | Pass 20's source list — all 89 assets, one row each (`Imagery Sourcing` sheet), rolled up on a `Summary` sheet: 65 `GREEN` (confirmed Wikimedia Commons category/file, open license, verified this session), 1 `AMBER` (MANTAS T-12 — secondary citation only, needs one more verification pass, e.g. a DVIDS check), 13 `RED` (no free source found — placeholder/generic silhouette), 8 `CONCEPTUAL` (not a single physical asset — representative image, clearly labeled as such), 2 `CONCEPTUAL-SENSITIVE` (casualty/CASEVAC-adjacent — non-graphic representative image only, or leave blank). Import directly; don't re-search. Read before starting Pass 20. |
| `docs/DEPLOY_SYNC_WORKER.md` | Human walkthrough for deploying the Worker (one remaining manual step: `wrangler deploy` + two repo secrets). |
| `docs/MODEL_STYLE_GUIDE.md` | **Read before adding or editing any 3D geometry** in `src/three/`. Proportions, poly budget, material/palette rules and silhouette conventions, measured off the hero tier (`models.ts`) and audited against `scenery.ts`/`props.ts`/`terrain3d.ts` — see Pass 12. |
| `scripts/` | `audit-content.mjs` (verification), `fetch-osm-data.mjs` (Overpass → `data/osm/<aoi>.json`; two stages, and `--raw=` runs the second one with no network), `analyze-osm-patterns.mjs` (Pass 17 — derives real tree-row orientation/spacing stats from an OSM file; re-run after updating one to see whether `props.ts`/`terrain3d.ts`'s pattern constants should move), `import-catalog.py` + `fill-sources.py` (spreadsheet → asset JSON, the repeatable path for the next ad hoc content drop). |

## Commands

```
npm run dev         # local dev server
npm run build        # tsc -b && vite build — run before every commit
npm run typecheck    # tsc --noEmit only, faster iteration
npm run preview      # serve the production build locally
node scripts/audit-content.mjs [--write]   # content verification pass
node scripts/fetch-osm-data.mjs [--aoi=pokrovsk|kramatorsk]   # OSM extract → data/osm/
node scripts/analyze-osm-patterns.mjs [--aoi=pokrovsk]        # real tree-row/parcel stats, prints derived pattern constants
```

No test suite exists yet — validate changes with `npm run build` plus a
headless Playwright smoke pass (Chromium is pre-installed at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; launch with
`--use-gl=swiftshader --enable-unsafe-swiftshader --no-sandbox` against
`npm run preview -- --port 4173`) — this is the pattern used throughout
`docs/DECISIONS.md` for verifying rendering/UI changes.

## Conventions worth knowing before editing

- **Sides are generic in the data layer.** `data/*.json` only ever knows
  `side_a` / `side_b`; the Ukraine/Russia labeling lives entirely in
  `src/config/ui.ts`. Don't hardcode "Ukraine"/"Russia" into `data/` or
  loader logic.
- **`domain` is what an asset *fights in*, not where it *sits*.** Every SAM
  battery is `domain: "air"` because a Patriot is an air-domain weapon — but
  it stands on the ground. Anything asking "how high do I draw this?" must go
  through `resolvePlatformDomain()` in `src/data/placement.ts` (explicit
  `platform_domain`, else inferred from the category prefix), never `domain`
  directly. Pass 7 fixed the tether bug for tanks and ships and missed 16
  assets by keying on `domain`; Pass 8 split the two meanings. Both renderers
  now go through the same resolver — keep it that way.
- **`verification` is derived, never hand-written.** Same for `band_id`
  display vs. actual placement — `distance_km_from_zero` against the
  *current* (possibly user-edited) bands is the source of truth; the stored
  `band_id` is informational only.
- **Authored geometry only, never fetched *binary* assets.** This
  environment's egress proxy blocks binary fetches, so any sourced 3D
  model or icon would be a license assumed rather than read. Every hero
  model, scenery piece, and icon in this repo is procedural/hand-authored
  for that reason — keep it that way rather than trying to source one.
  Coordinates are the deliberate exception (`data/osm/`): a named source
  under a license we can actually read, ODbL, whose price is a visible
  "© OpenStreetMap contributors" credit wherever the data is drawn.
- **The 3D render loop must not touch React state per frame.** Pass 16's
  biggest single win: label positions are written straight to the DOM nodes
  by `Scene3D`'s tick, and React only ever mounts the *roster* of pins.
  Reintroducing a `setState` in the loop puts ~90 component re-renders back
  on every frame — that was 89% of the per-frame style/layout cost. The loop
  also skips its whole layout pass when nothing moved, so anything that
  invalidates label positions without moving the camera (selection, hover,
  focus, a pin node mounting, a drag) must bump `layoutDirtyRef`.
- **`npm run build` passing is not evidence that a rendering change works.**
  Pass 16 shipped green builds twice with every label parked at the screen's
  top-left corner, and then with labels that never appeared until the camera
  moved. Both were found by taking a screenshot and looking at it. Drive the
  real app (`npm run preview` + headless Chromium) and assert on real
  geometry — `getBoundingClientRect()`, `elementFromPoint()` — not on class
  names and counts, which passed happily in both broken states.
- **A bad or incomplete asset file should degrade the tool, not break it.**
  `validateAsset()` is warning-based; almost nothing is a hard error. Match
  that philosophy in new validation code.
- **Every deviation from a literal instruction gets flagged, not silently
  taken.** See the "Where the brief and prior passes disagreed" section at
  the end of most passes in `docs/DECISIONS.md` — that's the expected
  standard for this repo, not a one-off.
- **Costs and confidence are always shown, never omitted.** "Not publicly
  disclosed" is a valid, expected value — don't invent a number to fill
  the field.

## Git

Primary branch for this work: `claude/warfare-digital-twin-scaffold-19u7kt`.
Do not create a PR unless explicitly asked. Do not push to a different
branch without explicit permission.
