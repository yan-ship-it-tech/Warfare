# Claude Code briefs — Passes 13–18

Each section below is self-contained and meant to be pasted into its own Claude Code
session, one pass at a time, in order. Every brief assumes the session starts by reading
`CLAUDE.md`, then `docs/DECISIONS.md`'s most recent passes, then `docs/PLANNING.md`
(this push's full context — read the relevant pass section there for background this
brief compresses out), then `docs/BACKLOG.md`.

Standing instructions for every pass, not repeated per-brief:
- Flag any place you deviate from the literal brief, in `docs/DECISIONS.md` under a
  "Where the brief and prior passes disagreed" heading — established convention, keep it.
- Do not regress Pass 8 (grounding via `platform_domain`, label collision index, lateral
  spreading, side-ID ring). Check with `git diff --stat` before committing.
- Validate with `npm run build` + a headless Playwright smoke pass, same as every prior
  pass — no test suite exists yet (see Pass 13 item 1, which starts fixing that).
- Update `CLAUDE.md` if file map or commands changed. Log the pass in `docs/DECISIONS.md`
  and close/update items in `docs/BACKLOG.md`.

---

## Pass 13 brief — Performance and interaction (blocking)

Read `docs/PLANNING.md` → "Pass 13" for full context. This pass blocks 14–16; nothing
else in this push should start until it lands.

1. Add a dev-only frame-time / draw-call overlay (toggle via a query param or key
   binding, not visible in production). Record a baseline number in `docs/DECISIONS.md`
   before touching anything else — "sluggish" needs to become a number.
2. Profile and fix the pan/zoom stutter and occasional freeze. Check for: per-frame
   allocations in the render loop, DOM thrash from label rendering, raycasting on every
   pointer-move rather than throttled/on-demand, unthrottled resize or scroll handlers.
   Report before/after numbers from item 1.
3. Two-finger horizontal pan on mobile is far too slow — retune the sensitivity, keeping
   it consistent with the damping already added in Pass 7 (don't re-solve a solved
   problem, adjust the existing curve).
4. Fix drag-and-drop reliability: drags frequently fail to start or open the detail panel
   instead. Implement a proper gesture discriminator — movement/time threshold before a
   drag commits, tap fires only if neither threshold is crossed. Test with an actual
   Playwright drag gesture, not by reading the code — Pass 11 found two real bugs this
   way (wrong hit-test target, a `useCallback` dependency issue tearing down the drag's
   own listeners) that code review missed.
5. Stop rendering every asset label all the time. Show on hover/selection/proximity, cap
   the simultaneously visible count, animate the transitions smoothly. Reuse
   `src/scene/labelGrid.ts` — do not build a second collision system.
6. Remove the blue/red dots that lag behind their asset during pan/zoom and snap back.
   First confirm what they encode — if it's side, it's redundant with the Pass 8 side-ID
   ring and should just be deleted; if it's something else, say so in `DECISIONS.md`
   before removing.
7. Fix z-order: the selected asset's map marker currently renders through the open detail
   panel.
8. Fix header orientation: rotating the camera 180° should update which side's label
   ("Ukraine" / "Russia") shows on which edge of the header — currently static regardless
   of camera azimuth.
9. Restore a distance scale/ruler. The X axis is deliberately non-linear (band-compressed,
   see `docs/DECISIONS.md` Pass 5/6) — the ruler should make that compression visible
   (e.g. banded/non-uniform tick marks) rather than implying linear distance.

---

## Pass 14 brief — World and terrain

Depends on Pass 13 landing first. Read `docs/PLANNING.md` → "Pass 14", and
`docs/OSM_PIPELINE.md` before starting. OSM data now exists at `data/osm/pokrovsk.json`
(fetched manually outside the sandbox — see `docs/OSM_HANDOFF.md` for the pipeline that
produced it).

1. Integrate `data/osm/pokrovsk.json` using the **metric-inset** approach: render the AOI
   at true 1:1 scale as a local patch within the near-front band, rather than stretching
   it across the full band-compressed X axis. Extrude rail lines along each feature's
   `xz` point list; instance tree props along `tree_row` features, respecting the
   `closed` flag (closed ring = wood/forest polygon to fill with scattered trees, open
   line = windbreak to place trees along at intervals).
   Do not present this in UI copy as literally "Pokrovsk" — the app is an illustrative
   composite; treat this as representative Donbas terrain character, not a claimed real
   location.
2. Add the required "© OpenStreetMap contributors" credit, visible in the 3D view
   (a corner credit) and/or the About page.
3. Derive procedural dressing parameters from the OSM data — typical tree-row spacing and
   orientation, typical field block size — and apply them across the rest of the terrain
   so the whole map reads as Donbas steppe, not just the inset patch.
4. Rework the water body: currently sits only at the far end of each side's territory.
   Move/extend it to wrap around where the frontline meets the coast, since both sides
   have Black Sea access and it's operationally relevant. As part of this, decide and
   record in `DECISIONS.md`: keep it as coastline, or add a river feature (e.g.
   Dnipro-style) running along/across part of the front — a river is more characteristic
   of this specific war and pairs naturally with item 5. Pick one and justify it briefly;
   don't build both.
5. Add a bridge. If a river was added in item 4, make it a *destroyed* bridge with a
   pontoon crossing nearby rather than an intact one — more representative of the war.
6. Fix the empty, seamed zero line:
   - Remove the visible hard border/seam at X=0 — it currently reads as a rendering
     artifact, not a battlefield feature.
   - Add contested-zone dressing: craters, burnt vehicle hulks, smoke, damaged tree
     lines.
   - Add terrain features later passes will need: forest patches usable as artillery
     cover, elevated tree lines usable as drone positions, a built-up block or two.

---

## Pass 15 brief — Tactical asset placement

Depends on Pass 14 (terrain features must exist to place assets into). Read
`docs/PLANNING.md` → "Pass 15".

1. Review every asset's distance-from-front against real-world doctrine for that asset
   class. Flag and correct implausible placements — e.g. a medium-range SAM like NASAMS
   sitting at 20 km, dangerously exposed for a system that in practice defends cities and
   infrastructure well back from the line.
   Add a `placement_rationale` field per asset with a citation, using the same two-source
   verification standard already applied to asset facts (`docs/DECISIONS.md` /
   `scripts/audit-content.mjs`). Run the audit script against the new field.
2. Break assets out of the straight-line-per-distance layout into dispersed,
   terrain-driven positions.
3. Site assets tactically, using Pass 14's terrain: air defense near the high-value asset
   it plausibly defends; artillery hidden in forest patches; drone teams on elevated tree
   lines; logistics on road/rail nodes; command posts dispersed and rearward.
4. Build an asset **swap** mechanism — replace a placed asset with another of the same
   category without disturbing the rest of the layout — and guarantee every asset
   category remains represented on the map at all times, even though not every individual
   asset needs to be placed simultaneously.
5. Reuse the existing **duplicate** function from Pass 11 (Asset Editor storage) for
   swarm/multi-instance placement — don't rebuild it.
6. Explicitly allow and support legitimate duplicates (multiple FPV teams, multiple
   Starlink terminals, etc.) — this is realistic, not a bug to prevent.
7. Add a human/positional layer as first-class map objects: infantry/dismounted soldiers,
   infantry shelters/dugouts, and tactical positions — medical point, artillery firing
   position, command post, observation post, ammo point. This closes part of the
   infantry/engineering gap already recorded in `docs/BACKLOG.md`.

---

## Pass 16 brief — 3D model integration

Depends on Pass 13 (needs the performance headroom). Read `docs/PLANNING.md` → "Pass 16".
Source list: `3d-model-sourcing-manifest.xlsx` (uploaded separately to this session/repo
— 72 assets: 47 with a free sourced candidate, 8 flagged "Weak/Verify", 17 with no free
source found).

1. License filter, before importing anything:
   - Reject any model whose listing indicates it was ripped from a commercial game —
     real legal exposure for a public-facing tool. Note the manifest already flags one
     such case explicitly (a PzH 2000 candidate).
   - Log CC-BY attribution requirements per model in a single tracked location (extend
     `docs/DECISIONS.md` or add `docs/MODEL_ATTRIBUTION.md`).
   - Exclude anything tagged NoAI if the import/processing pipeline itself would involve
     AI-assisted retexturing or mesh cleanup; fine to use as-is otherwise.
   - For the 8 "Weak/Verify" rows in the manifest, confirm license and correct variant
     before use; drop to the fallback noted in the manifest if verification fails.
2. Build a normalization pipeline applied to every imported model:
   - Decimate to a shared triangle budget (start around 2–8k tris for hero/detail units,
     under 500 for background or heavily-instanced units — tune against the Pass 13
     performance baseline, don't guess).
   - Retexture/recolor toward a shared material palette so ~40 different original artists'
     work reads as one consistent family rather than an asset flip.
   - Convert to glTF/GLB with Draco compression.
   - Generate LODs; swap to a silhouette or billboard representation when zoomed out.
3. Revise `docs/MODEL_STYLE_GUIDE.md` to define the new target style — detailed
   silhouette, shared material palette — replacing the current box+cylinder-primitive
   rule from Pass 12. Reuse Pass 12's audit method (measure with grep/scripted
   color-distance checks, don't eyeball) to verify compliance once done.
4. Use instancing for anything repeated: trees, dragon's teeth, infantry, duplicated FPV
   teams/Starlink terminals from Pass 15.
5. For assets with no sourced model whose category is otherwise represented, hide them
   from default map display but keep them reachable via the Pass 15 swap mechanism.
   Exception: all five Russian UGVs (Kurier, Omich-2, Uran-6, Uran-9, Varan) in the
   manifest have no free source — hiding all five leaves that category fully unrepresented
   on the Russian side. At minimum source one via paid purchase or build one custom
   low-poly model so the category isn't empty.
6. Build the procedural fortification geometry called out in `docs/PLANNING.md`:
   trenches (spline + boolean subtract or displacement, not a sourced model), dragon's
   teeth (instanced low-poly primitive along a spline), sandbag/fighting positions.
   This is not blocked on sourced models and can proceed in parallel with items 1–5.
7. Fold in the `scenery.ts` material-reuse cleanup flagged as a recommendation in Pass 12
   (19 ungoverned one-off materials) as part of this pass's palette work, rather than as
   a separate pass.

---

## Pass 17 brief — Detail page, imagery, symbology

No hard dependency on 14–16; can run in parallel if you're running two threads. Read
`docs/PLANNING.md` → "Pass 17".

1. Source 1–2 images per asset (~90 assets). This is primarily a research task:
   - Acceptable sources: Wikimedia Commons (verify per-file license before use — not all
     Commons content is free), official Ukrainian MoD releases (frequently CC BY 4.0),
     US DoD imagery (public domain).
   - Do not bulk-scrape general image search results — this would break the sourcing
     standard already applied to every other fact in the project.
   - Track license and required attribution per image the same way asset facts are
     tracked and audited; extend `scripts/audit-content.mjs` if useful, or a parallel
     `docs/IMAGE_SOURCES.md` ledger.
   - Where a licensed photo genuinely cannot be found for an asset, leave it flagged
     rather than substituting an unrelated or uncertain image.
2. Rework the detail page layout so the page answers: what does it look like, what are
   the key facts, how/where is it used in this war, how did its role change.
   - Place the primary image directly below the asset name.
   - Fix the key-characteristics table field that is persistently empty — find the root
     cause (missing data vs. a template bug) rather than just hiding the field.
   - Leave "what changed vs. traditional warfare" as-is — explicitly confirmed working.
3. Replace the current top-left symbol (reads as arbitrary/random) with proper NATO
   APP-6 / MIL-STD-2525 symbology. Use `milsymbol.js` (MIT license) rather than
   hand-rolling icons — correct symbology also serves this project's teaching purpose
   for its stated audience.

---

## Pass 18 brief — Scenario (Key Lessons) rework

Content-only pass, no hard dependency on 13–17 beyond Pass 13's general stability. Read
`docs/PLANNING.md` → "Pass 18".

1. Audit every existing Key Lessons scenario. Each scenario names one lesson; every asset
   included in that scenario's "show on map" view must directly demonstrate that lesson.
   Remove assets that don't. Named example already flagged: "The kill chain collapsed
   from hours to minutes" currently includes a Russian Lancet alongside the Ukrainian
   Leleka/HIMARS/howitzer chain it's meant to illustrate — the Lancet doesn't serve that
   specific lesson and should be removed from it (it may still be a fine example asset
   for a different, opposing-side lesson).
2. Where a scenario legitimately needs assets from both sides (e.g. a counter-battery or
   EW duel lesson), make the opposing asset's role explicit in the scenario's narration
   text rather than leaving it as an unexplained extra marker on the map.
3. This is a content/data pass, not a mechanism pass — scenario focus mode itself was
   fixed in Pass 11 and should not need code changes here. If you find yourself editing
   the focus-mode mechanism, stop and check whether that's actually in scope.
