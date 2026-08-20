# PLANNING — Next major push (Passes 16–21)

Forward-looking brief. Companion to `docs/DECISIONS.md` (why past choices were made)
and `docs/BACKLOG.md` (known gaps). This file holds what's coming next.

**Renumbered twice now.** An earlier draft used 13–18; that collided with
`docs/DECISIONS.md`'s own Pass 13/14 (OSM fetch/reduce, `pokrovsk.json`). The corrected
draft checked `DECISIONS.md` directly, found its highest logged pass was **15**, and
shifted everything to start at **16**: 13→16, 14→17, 15→18, 16→19, 17→20, 18→21.
`CLAUDE_CODE_BRIEFS_PASS13-18.md` is now `PASS16-21.md`. References to genuinely older,
completed passes (5, 7, 8, 11, 12) and to `DECISIONS.md`'s own Pass 13 were left alone —
those are real history, not part of the collision. **Before starting Pass 17, it's still
worth a fast `grep -n "^## Pass" docs/DECISIONS.md` to confirm 16 didn't collide with
anything logged after this document was written** — cheap insurance against a third
renumbering.

**Convention:** raw feedback gets captured wherever convenient (phone notes, etc.),
then transcribed here as a numbered brief before each Claude Code pass. Each pass
gets its own section. Sessions read `CLAUDE.md` → `DECISIONS.md` → this file.

**Scope decision for this whole push:** work on the **3D WebGL view only**
(`src/three/`). The 2D schematic view (`src/scene/`) is explicitly deferred — it's
cheap to bring back into line once the 3D view settles. Do not spend pass budget on it.

---

## Decisions already made (do not re-litigate)

| Question | Decision |
|---|---|
| OSM geometry vs. band-compressed X axis | **Option 1 (metric inset)** for the near-front band, at true 1:1. Plus pattern-derived procedural dressing elsewhere. Do **not** claim "this is Pokrovsk" in UI copy — it stays an illustrative composite. |
| Visual style direction | Evolve toward **consistent stylized realism** — detailed silhouettes, shared material palette. Not photoreal, not primitive boxes. `MODEL_STYLE_GUIDE.md` gets revised, not discarded. |
| Renderer | Real 3D geometry (`src/three/`). Confirmed — no 2.5D sprite path. |
| ODbL attribution | Required and non-optional once OSM data renders. "© OpenStreetMap contributors" visible in the 3D view and/or About page. |
| Marker/ring/fill instancing | **Done, Pass 19** (`withInstancedOpacity()`, `Scene3D.tsx`). The custom shader scenario-focus dimming needed now exists — draw calls 1140→892 from this alone. Don't re-litigate the approach; it's shipped and verified. |
| Drop no longer selects | Pass 16 reversed a Pass 11 decision here (drop selects → drop just drops; tap still selects). Logged in `DECISIONS.md`'s "Where the brief and prior passes disagree" section. If any later pass's UX assumes drop-selects, it's wrong — check against current behavior, not the old brief. |

---

## ✅ Pass 16 — Performance and interaction — DONE

**Landed at `bd04cba`.** Full detail in `DECISIONS.md`; summary for context on later passes:

- Style+layout per pan: **11.07ms → 1.67ms (−85%)**. JS heap after a pan: 33.3MB → 14.0MB
  (−58%). DOM nodes: 4083 → 1050 (−74%). Root cause was ~90 label buttons being reconciled
  through React state at 60Hz; labels are now direct DOM writes, layout skips when nothing
  moved (80–96% of idle frames), occlusion probing capped at 28/layout (was ~500/frame).
- Gesture discriminator, z-order, camera-azimuth header/legend, distance ruler, jumping
  dots — all done. Legend.tsx's hardcoded orientation was fixed too (not in the original
  brief, logged as a deviation).
- **New performance ceiling identified: 845 draw calls**, of which ~273 are the per-asset
  marker/ring/fill trio — see the instancing decision above.
- **Testing pattern established, and it matters for every pass after this one:** a green
  build passed twice while the feature was fully broken (labels pinned to the corner from
  an uninitialized-pin NaN comparison; labels invisible until first camera move from a
  commit-order race). Both were only caught by actually looking at a screenshot. Tests now
  assert real `getBoundingClientRect()` geometry on first paint, not just class names or
  counts. **Every remaining pass should verify the same way** — build passing is not
  evidence, take a screenshot.
- **Not confirmed fixed:** the border/seam artifact. Pass 16 addressed the *interaction*
  layer (z-order, jumping dots); if the seam is a terrain-layer rendering artifact rather
  than an interaction one, it's still open — **first thing to check in Pass 17.**

---

## ✅ Pass 17 — World and terrain — DONE

**Landed at `8d0afe0`.** Full detail in `DECISIONS.md`; summary for context on later passes:

- Seam artifact confirmed and fixed (it was `Scene3D.tsx`'s standing distance-graticule lines,
  redundant with Pass 16's own DOM ruler — removed outright, A/B-tested not assumed).
- OSM metric inset shipped (`src/three/osmTerrain.ts`): real rail/road/river/tree geometry from
  `data/osm/pokrovsk.json`, drawn at true 1:1 scale inside `op_near`/side_a/17 km, anchor/scale
  derived live from the projection. ODbL credit visible in-scene and on the About page.
- Pattern-derived dressing (`scripts/analyze-osm-patterns.mjs`) retuned `props.ts`/`terrain3d.ts`'s
  tree-belt orientation and field-cell frequency to real measured ratios.
- River (not an extended coastline — a deliberate either/or call, justified in `DECISIONS.md`)
  crosses the strip, with a destroyed bridge + pontoon crossing. Pass 10's coastal basin kept,
  untouched. `isInWater()` now guards every scatter/placement loop, closing a pre-existing gap
  for the coastal basin too.
- `TERRAIN_FEATURES` (`src/three/scenery.ts` — not `osmTerrain.ts`) ships real standing geometry
  for Pass 18 to site assets into: forest patches, elevated treelines, built-up blocks.
- **New draw-call ceiling for Pass 19: 1140** (was 845/865), from the bridge/pontoon/ten terrain
  features — recorded, not fixed, matching Pass 16's own precedent of deferring instancing.

---

## ✅ Pass 18 — Tactical asset placement — DONE

**Landed this pass.** Full detail in `DECISIONS.md`; summary for context on later passes:

- **`placement_rationale`** (new optional field, `{text, sources[]}`) added to all 103 assets
  (89 shipped + 14 new). Sourced from each asset's own already-audited characteristics plus
  `doctrine.md` §2, per a documented, bounded scope decision — not 103 fresh research passes.
- **Three real distance/band corrections found on review**: NASAMS 19→95 km (the one the brief
  named), TOS-1A 21→6 km (exceeded its own stated range), Sonobot-5 60→20 km (same). Patriot
  (40 km) reviewed and kept, now citing the real "SAMbush" forward-ambush tactic alongside its
  own "well back from the line" framing.
- **Straight-line ranks fixed as a data change**, not a 3D-only visual hack: 14 groups of
  same-side/category assets sharing an identical km got small, disclosed, in-band nudges — X is
  shared with the 2D view and the ruler, so it was never going to be faked in one renderer alone.
- **`src/three/tacticalSiting.ts`** (new) — a post-process on `lateralLayout()`, not a change to
  it: artillery gravitates to real forest patches, drone teams/observation posts to elevated
  treelines, logistics to built-up blocks (one asset — the `side_a` ammunition point — sits on an
  actual OSM rail vertex, not a proxy), air-defense toward the real `LANDMARK` it plausibly
  defends, command posts pushed apart from each other rather than toward a point.
- **14 new human/positional assets**, `infantry` group populated for the first time (was 0):
  dismounted squad, dugout, casualty collection point, artillery firing position, command post,
  observation post, ammo point × 2 sides. Icon registry needed zero changes — the existing
  group→icon fallback chain already absorbed every new category.
- **Roster-level same-category swap** (`RosterSwapPicker`, `DetailPanel.tsx`) — reuses Pass 11's
  `duplicateAsset()`/`customAssets` mechanism directly rather than rebuilding it. Additive only
  (nothing hidden/removed), which is what makes "every category stays represented" true by
  construction rather than by a separately-maintained guard.
- Verified headless throughout: 0 Data Health errors, category counts cross-checked against an
  independent hand-run tally, the railhead ammo point's pin confirmed sitting inside the real OSM
  tree cluster by screenshot, the swap flow driven end-to-end (not just type-checked).

---

## ✅ Pass 19 — 3D model integration — DONE

**Landed this pass.** Full detail in `DECISIONS.md`; summary for context on later passes:

- **The sourcing premise (items 1/3/4) was never executable here** — tested, not assumed: binary
  fetches from the manifest's own hosts (Wikimedia uploads, Sketchfab-style media) return a 403 on
  the CONNECT tunnel, and the manifest's own README independently confirms "this sandbox has no
  network access." License-filtering was still applied to the manifest's own local data.
- **The per-instance-opacity shader Pass 16 deferred is built** (`withInstancedOpacity()`,
  `Scene3D.tsx`): marker/ring/fill collapse from ~309 individual draws to 3 `InstancedMesh`es via a
  custom `onBeforeCompile` shader patch. Draw calls: **1140 → 892**.
- **`buildTrenchLines()`/`buildFightingPositions()` instanced** (`scenery.ts`), the last un-instanced
  repeated geometry, same pattern `buildObstacleBelt`/`props.ts` already used. Draw calls: **892 →
  767**. Final ceiling for Pass 20/21: **767**, down from Pass 17's 1140 despite ~19 new hero models
  added on top — both numbers real, HUD-measured, cross-checked by hand.
- **All five Russian UGVs got authored geometry, not hidden** — the sourcing premise being moot made
  the brief's own "hide + swap" fallback unnecessary; building them was the stronger, achievable
  answer. Human figures (dismounted squad/CP/OP/CCP, 4 variants off one shared base) and Pass 18's
  three fortification categories (dugout/artillery-position/ammo-point) also got real geometry — 19
  new `HERO_BUILDERS` entries total, none of the brief's item-2 questions left silently unaddressed.
- **Material palette governance** (`src/three/palette.ts`, new): Pass 12's deferred recommendation,
  made — three measured near-duplicate pairs merged into literal aliases, `SCENERY_MATERIALS`
  exported as the governance list Pass 12 asked for. Re-measured before trusting Pass 12's old "19"
  number: it had drifted to 27 by Pass 19. A further, looser cluster was measured, disclosed, and
  left for a dedicated follow-up rather than risked inline — see `BACKLOG.md`.
- **`docs/MODEL_STYLE_GUIDE.md` revised**, not just audited — the new geometry categories (UGVs,
  human figures, fortification hero models) are checked against it, and the scenery-material audit
  section documents the actual fix rather than a still-open recommendation.

---

## ✅ Pass 20 — Detail page, imagery, symbology — DONE

**Ran out of order** (17/18/19 hadn't landed yet — this pass had no
dependency on them and was explicitly requested next). Full writeup in
`docs/DECISIONS.md`. Summary for later passes:

- All 3 items shipped: 64/66 GREEN+AMBER assets now carry a real, spot-
  checked Commons photo with license/attribution (`Asset.image`, additive);
  the picture sits directly under the asset name; the key-facts grid's
  permanently-empty 4th cell (3 facts in a 2-column grid) is fixed; every
  asset's detail-panel symbol is now a real MIL-STD-2525C SIDC via
  milsymbol.js, lazy-loaded so it doesn't touch the main bundle.
- **Scope boundary, worth knowing before extending it:** the symbol swap is
  detail-panel only. The map markers (`src/three/`, `src/scene/AssetNode.tsx`)
  and `AssetLibraryPage`'s list icons still use the old hand-drawn
  `resolveIcon()` set — swapping those is a real integration project (Pass
  16's "never touch React state per frame" constraint applies), not a
  follow-on line item. Logged in `docs/BACKLOG.md`.
- 2 assets (`side_b-naval-admiral-grigorovich`, `side_b-uav-kub-1`) couldn't
  be pinned to one specific still image even though the ledger lists them
  GREEN — left on the honest placeholder treatment rather than guessed.

---

## Pass 20 (original brief, for reference)

**Model: Sonnet 5, Medium effort.**

**Imagery research is already done — use it, don't redo it.** `imagery-sourcing-ledger.xlsx`
covers all 89 assets: 65 confirmed Wikimedia Commons sources with verified licenses, 13
confirmed to have no free source (use a placeholder/generic silhouette for these), 8
conceptual entries flagged for representative (not unit-specific) imagery, 2
casualty-related entries flagged sensitive (non-graphic representative image or leave
blank), and 1 (MANTAS T-12) worth a quick DVIDS check to close out. Import directly from
the ledger rather than re-searching.

1. **Wire up imagery from the ledger.** Track license + attribution per image the same way
   asset citations are tracked. Do **not** bulk-scrape image search results for anything
   not already in the ledger — that's the one shortcut that would undermine the project's
   sourcing standard.
2. **Rework detail page layout.** Goal per user: understand *how it looks*, *key data*,
   *how and where it's used in this war*, and *how its role changed*.
   - Picture directly under the asset name.
   - Fix the persistently empty field in the key-characteristics table.
   - Keep "what changed vs traditional warfare" — user explicitly likes it as-is.
3. **Replace the top-left symbol.** Currently reads as arbitrary. Switch to proper
   **NATO/APP-6 (MIL-STD-2525) symbology** — `milsymbol.js` is MIT-licensed and does this
   well. Bonus: correct symbology is itself a teaching feature for this audience.

---

## ✅ Pass 21 — Scenario rework (Key Lessons) — DONE

**Landed this pass.** Full detail in `docs/DECISIONS.md`; summary for later passes:

- Branch reconciliation checked first, per the brief: the working branch was missing Pass
  20 (`b4b50c3` was not an ancestor) — the same divergence category Pass 20 itself hit.
  Merged the deploy branch in before any content work, verified with a build.
- The brief's one named bug (`kill-chain-compression`'s Russian Lancet) fixed, plus **four
  more of the same shape found by auditing every lesson's assets against their own
  `short_role`/`employment_notes` text**, not just the lesson title:
  `pattern-of-life-detection` (a jamming/denial asset shown for a detection lesson),
  `fiber-optic-immunity` (an RF-only drone shown for an RF-jamming-immunity lesson),
  `distributed-kill-chains` (a deep-rear centralized air-defense hub shown for a
  squad-level-decentralization lesson), `deep-rear-is-reachable` (an 18 km near-front
  logistics hub shown for a "deep rear isn't safe" lesson).
- Two lessons that genuinely needed both sides but didn't say so (`ew-invisible-
  battlefield`, `drone-attrition-share`) got explicit narration naming each side's role,
  per brief item 2.
- Two of Pass 18's positional assets swapped in where they fit better than what a lesson
  had used since Pass 6 (brief item 4): `side_a-c2-position-command-post` (whose own text
  was written to draw exactly the distinction `distributed-kill-chains` needed) and the two
  `*-medical-point-forward` assets (verified, and textually a near-exact match for
  `drone-dense-corridor`'s claim) replacing the older unverified `*-medical-casevac-chain`
  composite nodes.
- Scenario-focus dimming on Pass 19's instanced markers **checked, not assumed** — Pass 19
  had landed by the time this pass ran, so the brief's conditional applied: verified via
  headless Chromium against real `.is-focused`/`.is-dimmed` DOM state and four screenshots.
  Reads correctly.
- One new connection added (Switchblade 300 → Leleka-100, `data_c2`), mirrored into
  `connections.json`, so the reworked `kill-chain-compression` lesson is a genuinely
  connected chain rather than three unconnected markers with the right labels.
- Two honest, not-fully-closed gaps carried to `docs/BACKLOG.md`: no wired-FPV strike drone
  asset exists (the `fiber-optic-immunity` fix uses two ground robots instead), and no
  strategic-rear-band logistics asset exists (`deep-rear-is-reachable` uses the deepest one
  that does, 80 km, short of the 200+ km the lesson's claim is really about).

---

## Cross-cutting gaps worth fixing

- **Test suite: partially addressed by Pass 16.** It established the right pattern (assert
  real `getBoundingClientRect()` geometry, screenshot before declaring done) after two bugs
  slipped past class-name/count assertions twice. Every remaining pass should follow that
  pattern, not just Pass 16. Still worth formalizing as a standing regression suite for the
  Pass 8 invariants (grounding, label collision, lateral spread) rather than re-proving them
  ad hoc each time.
- **Performance budget: established by Pass 16.** Baseline is now real: 845 draw calls,
  1.67ms style+layout per pan, 14.0MB heap. Every later pass touching `src/three/` should
  measure against this, the same way Pass 16 did — not just "feels smoother."
- **Cloudflare Worker still undeployed** (code exists since Pass 7, needs a human with an
  account). Blocks shared editing. Decide whether it matters for this push or stays parked.
- **`scenery.ts` material cleanup — done, Pass 19.** The 3 measurably-redundant pairs Pass 12
  flagged (plus one more that had drifted in since, from Pass 17) are merged into literal
  aliases; `SCENERY_MATERIALS`/`palette.ts` are the governance lists Pass 12 asked for. A
  second, looser near-duplicate cluster was measured and disclosed rather than chased in the
  same pass — real follow-up, logged with numbers in `BACKLOG.md`, not a vague "someday."

---

## Suggested sequencing

```
16. Perf + interaction        ← DONE (bd04cba)             (Opus 4.8, High)
17. World + terrain           ← DONE (8d0afe0)              (Sonnet 5, High)
18. Tactical placement        ← DONE (4aed067)              (Sonnet 5, High)
19. Model integration         ← DONE (e3dc40a)              (Sonnet 5, High)
20. Detail page + imagery     ← DONE, ran out of order — merged after 17-19  (Sonnet 5, Medium)
21. Scenario rework           ← DONE                          (Sonnet 5, Medium)
22. Key Lessons audit         ← DONE (diagnostic only)         (Opus/Sonnet 5, High)
23. Commit approved lesson set ← DONE                          (Opus 5, High)
24. (reserved — see note)
25. Model kit / roster gaps   ← NEXT                           (renumbered from an earlier draft)
```

**Passes 22–23 — the Key Lessons thread.** These were not in the original 16–21 plan; they
were added after Pass 21 because the Key Lessons content had never been checked against the
finished research. Pass 22 was diagnostic only (`LESSON_AUDIT.md` — audited all 10 lessons
against the three lessons-learned references, now committed at `docs/references/`, and
proposed a 15-lesson replacement set). Pass 23 committed the approved set plus the
data-integrity fixes the audit found; see `PASS23_HANDOFF.md`.

Two things a later pass should know about that thread:
- **Pass 22 ran once against a wrong Ukrainian document** (a source catalog, not a
  synthesis), was corrected in place after the real document was supplied, and every changed
  finding is marked `[CORRECTED]` in `LESSON_AUDIT.md` §0. Read §0 before citing any score
  from that report.
- **Pass 23 wrote three lesson fields nothing renders** (`corpus_support`, `contested`,
  `caution`) because its brief put `src/` out of scope. The data distinction is real and
  committed; the UI for it is open work, logged in `BACKLOG.md` under "Open after Pass 23."

**Pass 25 is the model-kit / roster-gap pass** (renumbered from an earlier draft's numbering).
Its input is `LESSON_AUDIT.md` §7.1, restated in `BACKLOG.md` under "Roster gaps the approved
lesson set needs" — seven asset gaps the committed lesson set now depends on, with the audit's
own priorities attached. Pass 24 is reserved rather than assigned; if nothing claims it, Pass
25 can move up rather than leaving a hole.

20 ran out of the suggested order (its own branch diverged before 17/18/19 landed — no
remaining research dependency, the imagery ledger was already done). Reconciled and
merged into the deploy branch after the fact; see `DECISIONS.md`'s Pass 20 section and
the merge note appended there for what that reconciliation covered, including the 14
Pass 18 positional assets (dismounted squad, dugout, observation post, command post,
casualty point, ammo point, artillery firing position — ×2 sides) that didn't exist yet
when Pass 20's branch was cut and so needed the same image-fallback/SIDC treatment
applied after the merge, not during Pass 20 itself.

**Paste-in order:** Pass 25 (model kit / roster gaps) next. **After each pass:**
screenshot-verify per Pass 16's standard before moving on — a green build is not evidence.
