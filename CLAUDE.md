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
  "Why this isn't a real map" in `src/components/AboutPanel.tsx`.
- **Schematic 2D cross-section view** — `src/scene/`, one toolbar click
  away. Owns the distance ruler, the band editor's live feedback, and the
  dependency-line overlay; the 3D view reads the same underlying
  projection (`src/scene/projection.ts`) so the two views can never
  disagree about where anything is.

**Read `docs/DECISIONS.md` before assuming anything about *why* the code
looks the way it does.** It's a full build log across 8 passes, written
specifically so a fresh session doesn't have to rediscover reasoning that's
already settled — rendering approach, licensing constraints, what got
reverted and why, every place a later pass's literal instructions collided
with something an earlier pass learned. Treat it as required reading before
making an architectural change, not optional history.

## Where things live

| Path | What |
|---|---|
| `data/assets/*.json` | One file per asset — the whole roster. Add a new asset by adding a new file (or via the in-app Asset Editor, see below); no code change needed. |
| `data/bands.json`, `domains.json`, `groups.json`, `connections.json`, `lessons.json`, `doctrine_markers.json` | Everything else the world model is built from. |
| `data/catalog/*.json` | Swap-target systems (per-asset "compare this slot against a different real system" dropdown). |
| `src/data/loader.ts` | `loadWorld()` — assembles the `WorldModel` from the JSON above plus live overrides. Validates every asset via `src/data/validate.ts`, never throws on a bad file (degrades gracefully into a Data Health issue instead). |
| `src/data/model.ts` | Loader-derived types sitting on top of the schema in `src/types.ts` (the actual `Asset` contract). |
| `src/data/placement.ts` | **Engagement domain vs. platform domain** — resolves how high off the deck to draw an asset. Read the file header before touching altitude/tether logic in either renderer. |
| `src/scene/labelGrid.ts` | The one label-collision index both renderers share (uniform grid, cost scales with local crowding rather than roster size). |
| `src/three/` | The WebGL scene: `Scene3D.tsx` (main component), `worldMapping.ts` (world-unit conversion + `DOMAIN_ALTITUDE`), `terrain3d.ts` (synthetic terrain), `models.ts` (`HERO_BUILDERS` — authored, not sourced, low-poly 3D models for a subset of assets), `scenery.ts` (decorative trench lines/obstacle belts/power plant/etc., not clickable), `props.ts` (instanced scatter — trees/craters). |
| `src/state/overridesState.tsx` + `persistence.ts` | The live-edit layer: distance-band edits, per-asset placement/text/media overrides, and brand-new assets built in the Asset Editor all persist here — to `localStorage` by default, or a shared Cloudflare Worker if `VITE_SYNC_URL` is configured (see `docs/DEPLOY_SYNC_WORKER.md`). |
| `src/components/` | `Toolbar`, `DetailPanel` (per-asset view + inline edit controls), `AssetEditorPanel` (build a whole new asset from scratch, live), `DataHealthPanel`, `BandsEditorPanel`, `LessonsPanel`, `AboutPanel`, `Legend`, `SyncControls`, `CategoryFilterMenu`. |
| `worker/` | Cloudflare Worker + KV — the real shared-sync backend, written and dry-run verified but **not deployable from an agent session** (no Cloudflare credentials here — needs a human with an account). |
| `docs/doctrine.md` | The sourced narrative spine. Every asset's `contrast_vs_traditional` and `employment_notes` should pull framing from here, not invent it fresh. |
| `docs/CONTENT_PIPELINE.md` | **Read before adding or editing asset content.** Two-pass process: draft a category, then verify it in a *separate* sitting via `node scripts/audit-content.mjs --write`, which derives each asset's `verification` status from its `sources` array (never hand-authored). |
| `docs/BACKLOG.md` | Everything flagged but not done — category gaps, deferred decisions, things explicitly decided against. Check here before assuming a gap was overlooked. |
| `docs/DEPLOY_SYNC_WORKER.md` | Human walkthrough for deploying the Worker (one remaining manual step: `wrangler deploy` + two repo secrets). |
| `scripts/` | `audit-content.mjs` (verification), `import-catalog.py` + `fill-sources.py` (spreadsheet → asset JSON, the repeatable path for the next ad hoc content drop). |

## Commands

```
npm run dev         # local dev server
npm run build        # tsc -b && vite build — run before every commit
npm run typecheck    # tsc --noEmit only, faster iteration
npm run preview      # serve the production build locally
node scripts/audit-content.mjs [--write]   # content verification pass
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
- **Authored geometry only, never fetched binary assets.** This
  environment's egress proxy blocks binary fetches, so any sourced 3D
  model or icon would be a license assumed rather than read. Every hero
  model, scenery piece, and icon in this repo is procedural/hand-authored
  for that reason — keep it that way rather than trying to source one.
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
