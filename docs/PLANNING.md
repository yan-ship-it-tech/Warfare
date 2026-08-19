# PLANNING — Next major push (Passes 13–18)

Forward-looking brief. Companion to `docs/DECISIONS.md` (why past choices were made)
and `docs/BACKLOG.md` (known gaps). This file holds what's coming next.

**Convention:** raw feedback gets captured wherever convenient (phone notes, etc.),
then transcribed here as a numbered brief before each Claude Code pass. Each pass
gets its own section. Sessions read `CLAUDE.md` → `DECISIONS.md` → this file.

**Per-pass paste-in briefs:** `docs/CLAUDE_CODE_BRIEFS_PASS13-18.md` holds the
self-contained brief text for each of Passes 13–18 below, one section per pass, meant
to be pasted into a fresh Claude Code session at the start of that pass. It compresses
out the background this file carries — read the relevant pass section here first. Pass
16's source data (`docs/3d-model-sourcing-manifest.xlsx`) is committed alongside it so
that pass has something to work from without anything needing to be pasted in.

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

---

## Pass 13 — Performance and interaction (BLOCKING — do first)

Nothing else in this push should start until this lands. The app currently
stutters and freezes; every later pass adds load on top of that.

1. **Instrument before optimizing.** Add a dev-only frame-time / draw-call readout.
   "Sluggish" must become a number before and after, or there's no way to know if
   a fix worked. Record baseline in `DECISIONS.md`.
2. **Fix pan/zoom stutter and freezing.** Investigate: per-frame allocations in the
   render loop, label DOM thrash, raycasting every frame, unthrottled pointer handlers.
3. **Two-finger horizontal pan is far too slow on mobile.** Retune; make sure it's
   consistent with the pan-sensitivity damping added in Pass 7 rather than fighting it.
4. **Drag-and-drop is clumsy** — drags frequently fail or open the detail panel instead.
   Needs a proper gesture discriminator (movement threshold + time threshold before a
   drag commits; tap only fires if neither exceeded). Note Pass 11 already hit two real
   bugs here that only surfaced under an actual Playwright drag — test the same way.
5. **Labels: don't render all of them all the time.** Show on hover/selection/proximity,
   cap the visible count, and smooth the transitions. Reuse `src/scene/labelGrid.ts`
   rather than inventing a second system — Pass 8 built that deliberately.
6. **Kill the jumping blue/red dots.** These lag behind their asset during pan/zoom and
   then snap back. User considers them unnecessary — remove them (confirm what they were
   for first; if they encode side, the side-ID ring from Pass 8 already covers it).
7. **Detail panel z-order:** selected asset's marker currently draws through the open panel.
8. **Orientation bug:** rotating the map 180° still labels Ukraine left / Russia right in
   the header. The header labels must follow camera azimuth.
9. **Restore a distance scale/ruler.** Users can't currently gauge that the X axis is
   non-linear. This is important — the band compression is a *feature*, but only if it's
   legible. Consider a banded ruler that visibly shows the compression rather than a
   linear one that lies.

**Regression guard:** do not undo Pass 8 (label collision, lateral spreading, platform_domain
grounding, side rings). Verify with `git diff --stat` before committing.

---

## Pass 14 — World and terrain

Depends on: Pass 13. Enables: Pass 15 (assets need terrain features to be placed *into*).

1. **Integrate `data/osm/pokrovsk.json`** per the metric-inset decision above. Extrude rail
   lines along their `xz` lists; instance tree props along `tree_row` features, respecting
   the `closed` flag (closed ring = wood to fill, open line = windbreak to follow).
   Read `docs/OSM_PIPELINE.md` first.
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
   infantry, and a visible hard seam/border artifact.
   - Remove the visible seam — it reads as a rendering bug.
   - Add contested-zone dressing: craters, burnt vehicle hulks, smoke, damaged treelines.
   - Terrain features that later passes can place assets into: forest patches (artillery
     cover), elevated treelines (drone positions), built-up blocks.

---

## Pass 15 — Tactical asset placement

Depends on: Pass 14. This is the pass that most directly serves "capture the experience
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
   This requires Pass 14's terrain features to exist first.
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

---

## Pass 16 — 3D model integration

Depends on: Pass 13 (perf headroom). Source data: `docs/3d-model-sourcing-manifest.xlsx`
(72 assets — 47 sourced free, 8 need license verification, 17 have no free source).

1. **License filter first.** Reject game-ripped models outright (real legal exposure for a
   public briefing tool). Log CC-BY attribution obligations. Check NoAI tags.
2. **Normalization pipeline, applied to every model:**
   - decimate to a shared triangle budget (suggest ~2–8k for hero units, <500 for
     background/instanced units — measure against the Pass 13 baseline)
   - retexture/recolor to a shared palette so 40 artists' work reads as one family
   - convert to glTF/GLB with Draco compression
   - generate LODs; swap to silhouette/billboard when zoomed out
3. **Revise `MODEL_STYLE_GUIDE.md`** to define the new target (detailed silhouette,
   shared materials) rather than the current box+cylinder rule. Pass 12's audit method
   — measure, don't eyeball — should be reused.
4. **Instancing is mandatory** for anything repeated (trees, dragon's teeth, infantry,
   duplicated FPV teams).
5. **Hide unmodeled assets whose category is otherwise represented**, still reachable via
   the swap mechanism from Pass 15.
   - **Watch out:** all five Russian UGVs have no free source model. Hiding them all
     leaves that category unrepresented on the Russian side. At least one needs a paid
     purchase or a custom low-poly model.
6. **Still-missing fortification geometry:** trenches, dragon's teeth, sandbag positions.
   These are procedural (spline + instancing), not sourced — highest realism-per-effort
   item on the whole list, and they define what a Ukrainian front line looks like.

---

## Pass 17 — Detail page, imagery, symbology

1. **Imagery — every asset needs 1–2 pictures.** This is a research workstream, not a code
   one, and it can start in parallel with earlier passes.
   - **Licensing is the hard part.** Most military photography is copyrighted. Safe sources:
     Wikimedia Commons (check per-file license), Ukrainian MoD releases (often CC BY 4.0),
     US DoD imagery (public domain). Track license + attribution per image the same way
     asset citations are tracked.
   - Do **not** bulk-scrape image search results — that's the one shortcut that would
     undermine the project's sourcing standard.
2. **Rework detail page layout.** Goal per user: understand *how it looks*, *key data*,
   *how and where it's used in this war*, and *how its role changed*.
   - Picture directly under the asset name.
   - Fix the persistently empty field in the key-characteristics table.
   - Keep "what changed vs traditional warfare" — user explicitly likes it as-is.
3. **Replace the top-left symbol.** Currently reads as arbitrary. Switch to proper
   **NATO/APP-6 (MIL-STD-2525) symbology** — `milsymbol.js` is MIT-licensed and does this
   well. Bonus: correct symbology is itself a teaching feature for this audience.

---

## Pass 18 — Scenario rework (Key Lessons)

Scenarios currently pull in assets that don't serve the lesson. Example given: "The kill
chain collapsed from hours to minutes" includes a Leleka, HIMARS, a howitzer (all Ukrainian)
*and* a Russian Lancet — the Lancet doesn't illustrate that lesson and muddies it.

1. Audit all scenarios; each should name a lesson and show only the assets that
   demonstrate it.
2. Where a scenario genuinely needs both sides (e.g. counter-battery, EW duel), make the
   opposing asset's role explicit in the narration rather than leaving it as an unexplained
   extra marker.
3. Scenario focus mode itself works (fixed in Pass 11) — this is a *content* pass, not a
   mechanism pass.

---

## Cross-cutting gaps worth fixing

- **No test suite exists.** Every pass so far validated via `npm run build` + a Playwright
  smoke pass. With the surface area growing this fast, at minimum add regression tests for
  the Pass 8 invariants (grounding, label collision, lateral spread) — those are the things
  repeatedly at risk.
- **No performance budget.** Pass 13 establishes the measurement; it should become a
  standing check in every later pass, not a one-off.
- **Cloudflare Worker still undeployed** (code exists since Pass 7, needs a human with an
  account). Blocks shared editing. Decide whether it matters for this push or stays parked.
- **`scenery.ts` material cleanup** — 19 ungoverned one-off materials flagged in Pass 12,
  left as a recommendation. Fold into Pass 16's material-palette work rather than doing
  it separately.

---

## Suggested sequencing

```
13. Perf + interaction        ← blocking, do first
14. World + terrain           ← needs 13; enables 15
15. Tactical placement        ← needs 14
16. Model integration         ← needs 13 for headroom
17. Detail page + imagery     ← imagery research can start in parallel any time
18. Scenario rework           ← content only, can slot anywhere after 13
```

Passes 13–15 are the critical path. 16 can run alongside 15 if you want two threads.
17's research half has no dependencies at all — start collecting licensed imagery now.
