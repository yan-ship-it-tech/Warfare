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

## Pass 17 — World and terrain

**Model: Sonnet 5, High effort.**

Depends on: Pass 16 (done). Enables: Pass 18 (assets need terrain features to be placed
*into*). `data/osm/pokrovsk.json` exists in the repo (115k lines, already committed) but is
not imported or consumed anywhere in `src/three/` — this pass starts from zero on the
integration itself, the data is just sitting there ready to use.

0. **First: check whether the border/seam artifact is still present.** Pass 16 fixed the
   interaction-layer version of several similar-sounding bugs but didn't confirm this one.
   If it's a terrain rendering seam, it belongs here — item 6 below was already going to
   touch this area, just make sure it's actually resolved and verified with a screenshot,
   not assumed fixed because Pass 16 touched something adjacent.
1. **Integrate `data/osm/pokrovsk.json`** per the metric-inset decision above. Extrude rail
   lines along their `xz` lists; instance tree props along `tree_row` features, respecting
   the `closed` flag (closed ring = wood to fill, open line = windbreak to follow).
   Read `docs/OSM_PIPELINE.md` first. **Watch the draw-call budget while doing this** —
   Pass 16 got the ceiling to 845 with real measurement discipline; tree/rail instancing
   done carelessly here could blow past it. Instance from the start, don't retrofit.
2. **Add the ODbL credit.** Non-optional.
3. **Derive procedural dressing patterns** from the OSM data (tree-row spacing and
   orientation, field block size) and apply across the wider map so the whole terrain
   reads as Donbas steppe, not just the inset patch.
4. **Water body rework.** Currently sits only at the far end of each side. Should wrap
   around the near/underside where the frontline meets the coast — both sides have Black
   Sea access and it's operationally relevant.
   - **Consider a river instead of / in addition to coast.** A river running along or
     across the front, with a destroyed bridge, is far more characteristic of this war
     (Dnipro in Kherson) than a coastline, and gives the frontline zone a natural feature.
     Worth deciding explicitly.
5. **Add a bridge** (user request). If the river option above is taken, a *destroyed*
   bridge plus a pontoon crossing tells the story better than an intact one.
6. **Make the zero line not empty.** Currently: no assets cross, nothing burning, no
   infantry, and a visible hard seam/border artifact (see item 0).
   - Remove the visible seam — it reads as a rendering bug.
   - Add contested-zone dressing: craters, burnt vehicle hulks, smoke, damaged treelines.
   - Terrain features that later passes can place assets into: forest patches (artillery
     cover), elevated treelines (drone positions), built-up blocks.

**Verification standard (per Pass 16):** don't trust `npm run build`. Screenshot the
result — seam, water, bridge, dressing should all be visually confirmable, not just
present in the scene graph.

---

## Pass 18 — Tactical asset placement

**Model: Sonnet 5, High effort.**

Depends on: Pass 17. This is the pass that most directly serves "capture the experience
of war in Ukraine."

1. **Review every asset's distance-from-front for doctrinal plausibility.** Current values
   include some that don't hold up (NASAMS at 20 km is far forward and very exposed for a
   medium-range SAM that in practice defends cities and infrastructure well back).
   - **Add a `placement_rationale` field with a citation**, matching the existing
     two-source verification standard already used for asset facts. Placement should be
     as auditable as the rest of the data. Run it through `scripts/audit-content.mjs`.
2. **Break up the straight lines.** Assets currently sit in a rank at each distance.
   Real deployment is dispersed, terrain-driven, and clustered by function.
3. **Tactically sensible siting** — assets should sit where they'd actually sit:
   Patriot near a high-value target it defends; artillery hidden in forest; drone team on
   an elevated treeline; logistics on a road/rail node; command post dispersed and rearward.
   This requires Pass 17's terrain features to exist first.
4. **Not every asset should be on the map at once.** Build:
   - a **swap** mechanism (replace a placed asset with another of the same category),
   - **duplicate** (already exists from Pass 11 — reuse, don't rebuild),
   - and a guarantee that **every category stays represented** on the map.
5. **Allow legitimate duplicates.** FPV teams, Starlink terminals etc. should appear
   multiple times — that's accurate, not a bug.
6. **Add missing human/positional layer:** infantry and dismounted soldiers, infantry
   shelters/dugouts, and tactical positions as first-class map objects — medical point,
   artillery firing position, command post, observation post, ammo point.
   Note: `BACKLOG.md` already records infantry and engineering as known category gaps —
   this closes part of that.
7. **Selection behavior changed in Pass 16** (drop no longer selects; tap does). If any
   placement/swap UI here assumes the old drop-selects behavior, it's wrong — build against
   current behavior.

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
17. World + terrain           ← needs 16 (done); enables 18 (Sonnet 5, High)
18. Tactical placement        ← needs 17                    (Sonnet 5, High)
19. Model integration         ← needs 16 for headroom       (Sonnet 5, High)
20. Detail page + imagery     ← imagery already sourced      (Sonnet 5, Medium)
21. Scenario rework           ← content only, after 16       (Sonnet 5, Medium)
```

Passes 17–18 are the critical path now. 19 can run alongside 18 if you want two threads.
20 has no remaining research dependency — the ledger is done.

**Paste-in order:** Pass 17 next. **After each pass:** screenshot-verify per Pass 16's
standard before moving on — a green build is not evidence.
