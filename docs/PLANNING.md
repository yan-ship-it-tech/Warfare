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
| Marker/ring/fill instancing | **Deferred to Pass 19**, deliberately. `InstancedMesh` has no per-instance opacity without a custom shader, and scenario-focus dimming needs exactly that. Pass 16 took the free half (3 shared geometries instead of 273 near-duplicate uploads) and logged the rest in `BACKLOG.md`. Don't re-litigate — build the shader in Pass 19 alongside the material-palette work it depends on. |
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

## Pass 19 — 3D model integration

**Model: Sonnet 5, High effort.**

Depends on: Pass 16 (perf headroom — done). Source data: `docs/3d-model-sourcing-manifest.xlsx`
(72 assets — 47 sourced free, 8 need license verification, 17 have no free source).

1. **License filter first.** Reject game-ripped models outright (real legal exposure for a
   public briefing tool). Log CC-BY attribution obligations. Check NoAI tags.
2. **Build the per-instance-opacity shader Pass 16 deferred.** `InstancedMesh` has no
   per-instance opacity out of the box; scenario-focus dimming needs it. This is what turns
   the marker/ring/fill trio (~273 of the 845 draw calls) into ~3. Do this alongside the
   material-palette work below — they're the same shader-authoring effort.
3. **Normalization pipeline, applied to every model:**
   - decimate to a shared triangle budget (suggest ~2–8k for hero units, <500 for
     background/instanced units — measure against the Pass 16 baseline: 845 draw calls,
     11.07ms style+layout pre-fix)
   - retexture/recolor to a shared palette so 40 artists' work reads as one family
   - convert to glTF/GLB with Draco compression
   - generate LODs; swap to silhouette/billboard when zoomed out
4. **Revise `MODEL_STYLE_GUIDE.md`** to define the new target (detailed silhouette,
   shared materials) rather than the current box+cylinder rule. Pass 12's audit method
   — measure, don't eyeball — should be reused.
5. **Instancing is mandatory** for anything else repeated (trees, dragon's teeth, infantry,
   duplicated FPV teams), on top of the marker/ring/fill work above.
6. **Hide unmodeled assets whose category is otherwise represented**, still reachable via
   the swap mechanism from Pass 18.
   - **Watch out:** all five Russian UGVs have no free source model. Hiding them all
     leaves that category unrepresented on the Russian side. At least one needs a paid
     purchase or a custom low-poly model.
7. **Still-missing fortification geometry:** trenches, dragon's teeth, sandbag positions.
   These are procedural (spline + instancing), not sourced — highest realism-per-effort
   item on the whole list, and they define what a Ukrainian front line looks like.

**Verify with real numbers, per Pass 16's standard:** measure draw calls before/after the
instancing work lands, the same way Pass 16 measured style+layout time. A claim of "845 →
X draw calls" needs the same rigor as "11.07ms → 1.67ms" did.

---

## Pass 20 — Detail page, imagery, symbology

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

## Pass 21 — Scenario rework (Key Lessons)

**Model: Sonnet 5, Medium effort.**

Scenarios currently pull in assets that don't serve the lesson. Example given: "The kill
chain collapsed from hours to minutes" includes a Leleka, HIMARS, a howitzer (all Ukrainian)
*and* a Russian Lancet — the Lancet doesn't illustrate that lesson and muddies it.

1. Audit all scenarios; each should name a lesson and show only the assets that
   demonstrate it.
2. Where a scenario genuinely needs both sides (e.g. counter-battery, EW duel), make the
   opposing asset's role explicit in the narration rather than leaving it as an unexplained
   extra marker.
3. Scenario focus mode itself works (fixed in Pass 11) — this is a *content* pass, not a
   mechanism pass. Note scenario-focus dimming is what's driving the instancing work in
   Pass 19 — if that hasn't landed yet, dimming behavior on instanced markers may look
   different than before; check it still reads correctly.

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
- **`scenery.ts` material cleanup** — 19 ungoverned one-off materials flagged in Pass 12,
  left as a recommendation. Fold into Pass 19's material-palette work rather than doing
  it separately.

---

## Suggested sequencing

```
16. Perf + interaction        ← DONE (bd04cba)             (Opus 4.8, High)
17. World + terrain           ← DONE (8d0afe0)              (Sonnet 5, High)
18. Tactical placement        ← DONE (this pass)            (Sonnet 5, High)
19. Model integration         ← needs 16 for headroom       (Sonnet 5, High)
20. Detail page + imagery     ← imagery already sourced      (Sonnet 5, Medium)
21. Scenario rework           ← content only, after 16       (Sonnet 5, Medium)
```

19 is next. Its draw-call ceiling to instance against is now **1140** (Pass 17's number — Pass 18
added zero net new draw calls of its own; the new human-layer assets and siting logic reuse the
existing marker/ring/fill trio and existing terrain-feature geometry rather than adding meshes).
20 has no remaining research dependency — the ledger is done.

**Paste-in order:** Pass 19 next. **After each pass:** screenshot-verify per Pass 16's
standard before moving on — a green build is not evidence.
