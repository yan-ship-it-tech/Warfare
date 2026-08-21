# Pass 24 remediation — marker/geometry conflict fixed, documentation corrected

**Status: report for human review. Nothing deployed. The deploy branch
(`claude/warfare-digital-twin-scaffold-19u7kt`) was not touched — it still points at
`1d41985`, the revert to Pass 23, per the last incident's remediation. Everything below
lives only on `claude/lessons-audit-convergence-cd1o1n`, uncommitted in the working tree,
awaiting a separate go-ahead before any push or merge.**

`npm run build` passes on the final state below (confirmed twice — once after the code
fix, again after the documentation fix).

---

## 1. The bug and the fix

**Root cause, confirmed from the code, unchanged from the prior incident report:**
`MARKER_TARGET_PX` (`src/three/Scene3D.tsx`) held every asset's marker/ring/fill trio to
a constant *screen* size, applied uniformly across the whole depth axis. Pass 24 made
hero models true *world* scale inside `TRUE_SCALE_DEPTH_KM` (1 unit = 1 metre) without
changing this. At the shipped default framing that put a ~1.5 km marker next to a 7.7 m
Leopard 2A6 — the model invisible inside a symbol roughly 200× its own size — and packed
73–84 near-register assets' oversized rings into an overlapping mass at the zero line.

**The fix, in `src/three/Scene3D.tsx` (full diff: 68 lines, one file):**

- A new constant, `NEAR_REGISTER_MARKER_SCALE = 1` — a **world**-scale, not screen-scale,
  size for the marker/ring/fill trio.
- `Entry` gains a `km` field (the asset's true distance from the zero line), populated
  where entries are built.
- In `layout()`, the scale computation now branches on `entry.km`:
  - **`km ≤ TRUE_SCALE_DEPTH_KM` (near register, 0–40 km):** the trio renders at
    `NEAR_REGISTER_MARKER_SCALE` — its own raw geometry size (marker radius 1.5 m, ring
    outer radius 2.9 m), with only the pre-existing selection/hover emphasis multiplier
    on top. This is a genuine **constant world size**, exactly what "true scale" means:
    it shrinks with camera distance the same way the hero model beside it does, and reads
    as a small anchor/click-target rather than a second, competing symbol.
  - **`km > TRUE_SCALE_DEPTH_KM` (far register):** completely unchanged — the original
    screen-constant formula, because real geometry genuinely would be sub-pixel out there
    and the brief's own fix direction says to keep marker symbology.
- No other file touched for the fix itself. `hasHeroModel()`/`buildHeroModel()`,
  `modelScaleFor()`, altitude handling, facing derivation — all untouched, all already
  correct per Pass 24's original work.

This uses the existing register boundary, not a new threshold, per the brief's fix
direction.

---

## 2. Screenshot evidence — described first, then shown

Per the stricter standard for this pass: each description below was written by looking
at the actual image before it is offered as evidence of anything.

### 2.1 The exact frame that failed last time, reproduced on the fixed code

`v-hero-side_a.png` — Camera flown to the nearest side_a hero-model position using the
same method the original Pass 24 verification used (`window.__warfareScene`, fly-to,
screenshot). **What is actually in the image:** a label reading "Fighting Position / ...
1.2 km," a white triangular marker, and a dark-blue oval ring/fill pad at the base — no
tank silhouette. This is **not** a repeat of the bug: `side_a-infantry-position-dugout`
is a fortification hero model (Pass 18/19), and the nearest-LOD probe found *it*, not a
vehicle, because it happens to sit at the position closest to zero along the axis. The
model is a low, ground-hugging trench/mound shape, and at this specific close, steep
camera angle the marker and ring — while now correctly sized at world-scale 1 rather than
1.5 km — still sit level with or above the model's own low profile and read as the
dominant shape. `v-hero-side_b.png` shows the same asset class on the other side (red
ring instead of blue): a plank/beam shape and low mound geometry are visible peeking out
beneath the ring, again partially competing with rather than clearly dominated by it.

**Assessment: this is the one hero-model class (ground-hugging fortifications) where the
fix is a real improvement — no longer 1.5 km, now ~5.8 m — but not a full resolution,
because the model itself is low and small enough that a ~5.8 m ring is still a comparably
large object next to it.** Flagged honestly rather than presented as fixed.

### 2.2 The primary named-broken asset: Leopard 2A6

`final-leopard.png` — Camera flown to `side_a-armor-leopard2`'s exact anchor at a
consistent 24-world-unit (24 m) distance, on the final build (code fix + documentation
fix both applied). **What is actually in the image:** a clearly recognizable tank
silhouette — boxy hull, angled turret, a barrel/gun extending to the right, visible
tracks/roadwheel detail — occupying roughly 300×200 px of the frame. A small white
triangular marker sits at the turret, roughly 90×70 px, comparable in size to a hatch or
antenna, not dominating the hull. A blue ring sits at the tank's base, roughly matching
the hull's own footprint rather than dwarfing it. **This is the asset the human
specifically named as broken, and it is fixed**: the model is now the dominant visual
element and the marker/ring read as a small anchor, exactly the brief's fix direction.

### 2.3 A small, elevated hero model: Lancet loitering munition

`lancet24.png` — Same method, `side_b-uav-strike-lancet`, same 24 m distance for a fair
comparison against the Leopard shot. **What is actually in the image:** a white diamond
marker roughly 165×165 px, with dark angular wing/fin shapes and a small red section
visible peeking out from behind its four corners — real model geometry is present and
partially visible, not absent. But the marker is comparable in size to or larger than the
visible model, because this asset is `elevated` (airborne), which means the marker sits
directly at the model's own position rather than floating above it on a small vertical
offset the way a grounded vehicle's marker does. **Assessment: improved from total
occlusion (which is what a 1.5 km marker would have done) to partial competition — real
geometry is visible, but the marker is not clearly subordinate to it the way the tank
case is.** This is the second honest imperfection, distinct from 2.1's (this one is about
small *airborne* models; 2.1 is about small *ground-hugging* models).

### 2.4 Generic-symbol assets — working as designed, not a regression

`ratel24.png` (`side_a-ground-robots-nrtk-ratel-s`) and `stinger24.png`
(`side_a-air-defense-short-stinger`), both at consistent 24 m/10 m distances. **What is
actually in both images:** a marker and ring only, no vehicle geometry, proportioned
similarly to the Leopard shot's marker/ring (not the old ~1.5 km version). Confirmed by
reading `src/three/models.ts`: **neither asset has an entry in `HERO_BUILDERS`** — only
30 of 103 roster assets do. These were never going to show real geometry in this pass
(`src/three/Scene3D.tsx`'s `hasHeroModel()` returns false for both), and Pass 24's own
scope boundary (B3) is explicit that generic-symbol assets should keep rendering as
"correctly placed, oriented, and scaled generic symbols" — which this now is. **The human
report named these two among "assets that should show actual geometry instead of a
generic marker," which conflates two different things: Leopard/Lancet are hero-modelled
assets that regressed to generic markers (real Pass 24 bug, now fixed above); Ratel-S and
Stinger have never had hero geometry at all (not a Pass 24 regression, not this pass's or
Pass 24's job — new models are explicitly Pass 25's, per B3: "No new 3D models").** Worth
stating plainly so this distinction isn't lost.

### 2.5 The default framing — the view that was reported "badly broken"

`final-default.png` — The exact default camera framing (the one used for verification
throughout Pass 24 and reproduced from the incident report), on the final build.
**What is actually in the image:** visible terrain, five labelled assets (Bayraktar TB2,
IRIS-T SLM, M1A1 Abrams, TOS-1A, Shahed-136/Gera...) with small, distinct marker/ring
pairs at each, a cluster of small marker shapes near the left edge (a far-register group,
each individually distinguishable, not fused into one shape), and small dot/marker shapes
near the right edge similarly distinguishable. **No overlapping white/red/blue mass is
present anywhere in this frame.** This is the direct visual rebuttal of the original
symptom 3 report at the exact framing it was reported from.

### 2.6 Far-register overlap — checked and reported honestly, not claimed clean

The brief's fix direction requires checking whether far-register ring overlap (now only
19 of 103 assets, since 84 moved to near-register true-scale rendering) is still visually
excessive, and reporting either way. It is **not clean**, and here is the honest picture:

`crop-far-right.png` — An enlarged crop of the Russia-rear cluster from the default
framing (`final-default.png`'s right edge, at 4× zoom). **What is actually in the image:**
five white triangular markers and their red side-rings. Two markers on the left visibly
touch, their rings overlapping into a figure-eight shape. Three more markers cluster near
the horizon, close together but each individually distinguishable. One grey marker
(a pending-target stub) sits with its own separate ring. **This is real, visible overlap**
— the S-400/S-300/IADS-network cluster (42, 46, 60 km) is genuinely close enough in
compressed world-space that their fixed-size rings touch at this zoom level.

`crop-far-left.png` — The same treatment for the Ukraine-rear deep-strike UAV cluster
(AN-196, AQ-400, UJ-26, Zozulia, the truck-launched swarm entry). **What is actually in
the image:** five to six small white diamond markers with thin tether lines, two pairs
touching corners, the rest cleanly separated. Legible — a viewer can count and distinguish
each marker — but visibly crowded.

`far-tight-cluster2.png` — A closer inspection specifically targeting the tightest
numeric cluster this pass computed by hand (AN-196 at 274 km, the ISR satellite at
300 km, and FP-1/FP-2 at 308 km — only ~130 world units apart at the default framing's
distance, versus a ~2.9–3 km ring diameter there). **What is actually in the image:** at
this closer, cluster-centred framing, two of the three markers are visible as small,
clearly separated diamond shapes roughly 160 px apart, each with its own tether line
running down to the ground — not touching, not overlapping. Closing the camera in on a
region resolves what looks crowded at maximum zoom-out, because the screen-constant
formula's `dist` term shrinks with camera proximity to that specific cluster.

**Honest conclusion: far-register overlap is reduced (from "73–84 assets across the
entire near register" to "19 assets, with localised touching in two or three regional
clusters at the single most zoomed-out framing") but not eliminated.** It does not read
as "badly broken" the way the pre-fix screenshots did — nothing fuses into an
undifferentiated mass, every marker remains individually clickable and distinguishable —
but a user parked at maximum zoom-out over a dense cluster will see touching rings. Per
the brief's own scope line, full label decluttering is Pass 26's job; this finding is
reported rather than further engineered against in this pass, and is logged in
`docs/BACKLOG.md` accordingly (see §5).

### 2.7 Pass 17 dressing-system reconciliation

`built-up-block.png` — Camera flown to `scenery.ts`'s `block-a-1` `TERRAIN_FEATURES`
entry (`side_a`, km 7). **What is actually in the image:** a cluster of five to six
grey/blue-grey rectangular box shapes of varying heights, clearly geometric building-like
forms, plus an unrelated labelled asset (VAB APC) and a thin brown slab shape at the
right edge (an unrelated landmark). **This confirms the dressing system is real, present,
and rendering correctly today** — it is `src/three/scenery.ts`'s hand-authored
`built_up_block` feature (part of `TERRAIN_FEATURES`, exported and consumed since Pass
18), confirmed still imported and called in the current `Scene3D.tsx`
(`buildScenery(...)`, line 1411 — unchanged by Pass 24's terrain rewrite, which touched
`terrain3d.ts`/`worldMapping.ts`, not `scenery.ts`). **It is not a regression and it is
not OSM data** — see §3 for why several `DECISIONS.md` entries called it "OSM" and why
that was wrong even when first written.

### 2.8 Documentation fix confirmation

`about-page-fixed.png` — The About page rendered on the fixed build, with a programmatic
check (not just a look): the old sentence ("the buildings and rivers from the
OpenStreetMap patch") is confirmed absent from the rendered DOM text, and the correction
sentence ("carries no building footprints") is confirmed present. Zero page errors.

---

## 3. Documentation debt — every claim checked, three real corrections made

**Method:** grepped every `.md` file under `docs/`, this pass's own prior handoff, every
`src/three/*.ts` file Pass 24 touched, and the live-rendered UI copy (not just source —
the About page's actual DOM text) for "OSM" co-occurring with "building." Confirmed via
`data/osm/pokrovsk.json`'s own feature-kind tally that the extract carries
**`tree_row: 1010, rail_line: 303, road: 99, river: 3` — zero building features.**

### 3.1 Real, user-facing overclaim — fixed

`src/pages/AboutPage.tsx`, "Two scales, and where the boundary is" section. **Before:**
"...so inside that near band the terrain, **the buildings and rivers** from the
OpenStreetMap patch below, the size of a tank and the altitude of a drone are all
physically correct against each other." **After:** "...so inside that near band the
terrain, **the rail lines, tree rows and roads** from the OpenStreetMap patch below (it
carries no building footprints — see 'One real patch inside the synthetic terrain' below
for exactly what it does), the size of a tank..." — and the later "squashed 1:1
buildings at 200 km" is now "squashed 1:1 geometry at 200 km," since the specific claim
no longer applies to what's actually there. This is the most important fix in this
section: it was live, user-facing text (once redeployed), not just an internal note. The
page immediately below this paragraph ("One real patch inside the synthetic terrain")
was already accurate — it already said "rail lines, tree rows and roads" — so only this
one paragraph had drifted from it.

### 3.2 `docs/DECISIONS.md` — three historical misattributions, corrected in place, not erased

Three places (Pass 17's own verification section, and two later passes' verification
sections that repeated the phrase) call a screenshot's grey-box cluster an "OSM building
cluster." All three are corrected with an inline **`[Pass 24 remediation correction]`**
note directly after the original text — following this repo's own convention (see
`LESSON_AUDIT.md` §0 from the prior pass) of annotating history rather than silently
rewriting it. Notably, **Pass 18's own entry, two lines below the first occurrence,
already half-flags this**: "`TERRAIN_FEATURES` in `src/three/scenery.ts` — not
`osmTerrain.ts`, a brief imprecision worth flagging" — so this was a known loose thread,
never fully run down until now. Each correction states plainly: the tree half of what was
screenshotted is real OSM `tree_row` geometry; the building half is `scenery.ts`'s
separate, hand-authored `built_up_block` dressing.

### 3.3 Checked, found clean, no change needed

- **`docs/MODEL_STYLE_GUIDE.md`** — zero mentions of "OSM" at all (`grep -i osm` returns
  nothing). Not applicable; this file is about hand-authored geometry proportions.
- **`docs/doctrine.md`** — zero mentions of "OSM" at all. Not applicable; this file is
  the warfare-doctrine narrative spine, unrelated to the terrain pipeline.
- **`PASS24_HANDOFF.md` (this pass's own prior handoff)** — checked specifically for the
  "buildings/rivers/roads" framing the original Pass 24 brief used. It does **not**
  appear anywhere in the committed handoff: the file never lists OSM content at all
  (its one OSM mention, "the OSM patch, no longer an 'inset'", makes no content claim).
  The overclaim lived in the original task instructions' own prose and in
  conversational chat replies — neither a committed repo artifact — not in this file.
  Confirmed rather than assumed clean: `grep -in "structure\|osm" PASS24_HANDOFF.md`
  and `grep -in building PASS24_HANDOFF.md` were both run; only the harmless mention
  above matched.
- **`src/three/depthAxis.ts`** (the module whose header actually defines the near/far
  register rule) — its own comments say "terrain and OSM geometry are 1:1," carefully
  *not* claiming buildings. No change needed; it was already accurate.
- **`src/three/terrain3d.ts`, `osmTerrain.ts`, `worldMapping.ts`** — grepped for
  "building"; the only hit is "terrain-**building** effect" (a verb, unrelated). No
  claims to correct.

---

## 4. Pass 17 dressing-system question — answered directly, not assumed

**The question asked:** is the grey-box structure visible in Pass 17's own screenshots a
separate dressing system independent of the (nonexistent) OSM building tag, or did it
regress?

**Answer: it is a separate system, and it has not regressed.** Confirmed three ways, not
asserted:

1. **Source confirms it's a distinct, hand-authored system.** `src/three/scenery.ts`
   defines `TERRAIN_FEATURES` (exported), including `built_up_block`-kind entries
   (`block-a-1`, `block-b-1`, at km 7/6 either side) — nothing to do with
   `data/osm/pokrovsk.json` or `osmTerrain.ts`.
2. **It's still wired up today.** `grep -n "buildScenery" src/three/Scene3D.tsx` finds it
   imported and called (`buildScenery(SCENERY_BUDGET[...], halfX)`, line 1411) in the
   current file — Pass 24's terrain rewrite touched `terrain3d.ts` and
   `worldMapping.ts` (652 and 298 changed lines respectively, per the earlier merge's own
   diff stat) but never touched `scenery.ts`.
3. **It's still visually rendering.** `built-up-block.png` (§2.7) shows it live in the
   running, fixed build.

---

## 5. Backlog entries added

`docs/BACKLOG.md` gets a new "Open after Pass 24 remediation" section, two entries:

1. The far-register overlap finding from §2.6 above, with the numbers (19 assets,
   ~2.9–3.6 km ring diameter at the default framing's distance, ~130 world-unit minimum
   gap between the tightest same-side cluster), explicitly pointed at Pass 26's
   label-decluttering scope.
2. The two remaining "anchor competes with a small/low hero model" imperfections from
   §2.1 and §2.3, named by asset id, with a concrete suggestion (scale the near-register
   anchor down specifically where a hero model is present) for whoever picks this up
   next — without committing this pass to that direction.

---

## 6. What was deliberately not done

- No per-asset-class marker tuning (e.g., a smaller scale specifically for small/airborne
  models). The two remaining imperfections in §2.1/§2.3 are real, but chasing them further
  starts to look like per-category special-casing the brief didn't ask for and risks
  scope creep into Pass 25/26 territory (new models, label decluttering). Reported
  honestly instead of silently patched further or silently ignored.
- No touch to `data/lessons.json`, Part A's rendering code, or any file outside
  `src/three/Scene3D.tsx`, `src/pages/AboutPage.tsx`, and `docs/DECISIONS.md`.
- No deploy branch action of any kind — confirmed by `git status` on
  `claude/warfare-digital-twin-scaffold-19u7kt` showing no local changes, and this
  session never checked that branch out during this pass.
