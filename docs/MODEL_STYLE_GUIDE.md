# 3D model style guide

**Pass 19 update.** Originally a documentation-only audit pass (Pass 12);
this pass is the first to actually act on its own deferred recommendation —
the material-governance fix below was "recommended, not made" at Pass 12 and
is now made — and to add real new geometry (5 UGVs, human figures,
Pass 18's fortification hero models) under the guide rather than just
auditing existing work against it. Sections below are updated in place
rather than appended, so this file states the current target, not a history
of it — see `docs/DECISIONS.md` Pass 12 and Pass 19 for the history.

Written from the best-looking, most internally consistent geometry already
in the scene — the hero tier in `src/three/models.ts` — and used to audit
`scenery.ts`, `props.ts`, and `terrain3d.ts` against it. Where those files
hold to the standard, the audit says so. Where they drift, it says that too,
with the specific evidence, rather than asserting a violation from feel.
This is the spec for any model added going forward, hero tier or scenery.

Everything here inherits the constraint the whole scene is built under —
authored primitives only, nothing sourced or fetched (see `models.ts`'s own
header and `docs/DECISIONS.md`). This guide is about consistency *within*
that constraint, not a reason to relax it.

---

## 1. Proportions & scale

World units are not to-scale. `models.ts` says it directly: *"a to-scale
tank on this compressed axis would be sub-pixel."* A tank hull is drawn
~7 world units long; a small house ~2.6–3.8 units wide; a power-plant
cooling tower ~2.6–3.6 unit radius, 8 tall. Nothing in the scene is drawn to
real-world proportion against anything else — proportion is legibility, not
literalism, same as an icon on a map. What *is* consistent, and must stay
that way: everything reads at a *coherent relative* scale — a house is
smaller than an urban building, a tank is bigger than a wheel, a truck's cab
is smaller than its cargo bed. Check relative proportion against nearby
objects when adding something new, not against a real-world spec sheet.

## 2. Poly budget

Two numbers to hold to, both read directly off the hero tier:

- **Primitive count per model/landmark: roughly 6–25.** The leanest hero
  builder (`loiteringMunition`, `reconUAV`) uses 6 primitives; the busiest
  (`mlrsTruck`) uses ~22. Scenery landmarks land in the same band —
  `buildFuelDepot` ~11, `buildPowerPlant` ~13, a `buildVillage` call ~15–20
  across its houses. A new model well outside this range (a 3-primitive
  placeholder, or a 60-primitive showpiece) is a poly-budget outlier even if
  every individual primitive is cheap.
- **Radial segment counts: 4–14, never smooth.** Every `CylinderGeometry`/
  `ConeGeometry` call in the codebase uses a segment count in that range —
  most cluster at 6–10 (wheels at 8–10, gun barrels at 6–8, a search-radar
  dish at 12, roof cones at 4). Nothing anywhere uses 16+ segments; a
  smooth-looking cylinder would read as a different, higher-fidelity visual
  language than everything around it. This is the single most load-bearing
  rule for the low-poly read — a stray 32-segment cylinder would be visible
  as an inconsistency even from a distance.

Instanced scatter (`props.ts`) is exempt from the per-object primitive-count
range above by design — a tree is deliberately a single tapered cylinder,
because the *count* (hundreds, one draw call) is what's doing the visual
work, not per-object detail. The segment-count ceiling still applies (props
use 5–9 segments).

## 3. Materials

**Pass 19: the shared list moved to its own file, `src/three/palette.ts`,
and grew from 5 to 10 — `HULL, HULL_DARK, METAL, RUBBER, GLASS, SKIN,
FATIGUES, FATIGUES_DARK, WOOD, SANDBAG, CANVAS`** (`HERO_MATERIALS`, still
the name, still exported for the same reason — *"a scene-wide material swap
stays trivial"*). The move out of `models.ts` itself is deliberate: the 5
new UGV builders, the human-figure builder, and Pass 18's fortification hero
geometry all live in `models.ts` too and all need the same shared list, so
it belongs somewhere every consumer can import from equally rather than
being tied to one builder file. Every new hero model still reaches for one
of these first, or adds sparingly to the list — not a private one-off.

**`scenery.ts` gets the equivalent treatment now, not just an audit finding.**
`export const SCENERY_MATERIALS` lists everything that file declares for
itself (structural/landmark colours — concrete, metal, wood-tone variants,
damage tiers — that measurably do NOT overlap with `palette.ts`'s vehicle
materials, see below). `WOOD`/`SANDBAG`/`CANVAS` moved to `palette.ts`
instead, shared by both files, since Pass 18's new dugout/artillery-
position/ammo-point hero geometry and `scenery.ts`'s own decorative
trenches/fighting positions are visibly the same substance and should read
that way. This is the rule the previous version of this file's audit
(below) found broken — now fixed, not just flagged.

Properties, read off every material in the scene without a single
exception:

- **`flatShading: true` on every material, no exceptions.** Checked across
  all four files — zero materials omit it. This is the one rule nothing in
  the scene currently violates; keep it that way.
- **`roughness` 0.5–1, mostly 0.8+.** Nothing reads as glossy plastic.
  Two deliberate exceptions, both narratively motivated, not oversights:
  `GLASS` (`roughness: 0.25`, a windscreen) and the Pass 10 water plane
  (`roughness: 0.18`, needs to read as a reflective surface — see
  `docs/DECISIONS.md` Pass 10 for why it's a separate mesh rather than a
  vertex-coloured dip).
- **`metalness` 0–0.5.** `METAL` (0.45) and `METAL_TANK`/`WRECK_HULL`
  (0.3–0.4) are the highest; everything organic/soil/fabric sits at 0.
- **Colour: desaturated, warm-earth or cool-desaturated-grey, almost
  nothing above ~30% saturation.** Measured across every named colour in
  the scene: hull/wood/dirt/rubble tones cluster at HSL saturation
  0.10–0.30, hue 20–90° (olive through rust-brown); metal/concrete/glass
  cluster at saturation ≤0.10, hue ~200–215° (cool grey-blue). Three
  deliberate accents break this on purpose, and only these three: `GLASS`
  (S=0.61 — a windscreen needs to read as glass), the Pass 10 `EMBER`
  (S=1.00, fully saturated orange — a light source, meant to pop), and the
  water plane (S=0.43 — needs to read as water against a muted ground).
  Anything else pushing saturation up is drifting from the palette, not
  adding an accent.
- **Emissive is reserved, not default.** Only two materials in the whole
  scene use `emissive`: the hero tier's side-identification plate
  (`emissiveIntensity: 0.25` — a quiet cue, not a light) and Pass 10's
  `EMBER` (`emissiveIntensity: 1.5` — meant to visually read as still
  burning). The six-to-one intensity gap between them is intentional:
  emissive intensity should track how much a thing is *supposed* to look
  lit, not be added reflexively for "pop."

## 4. Primitive vocabulary

The hero tier is stricter than the rest of the scene, and this is worth
being explicit about rather than leaving as an implicit pattern: **every one
of the eleven hero models is built from exactly two primitive types, `Box`
and `Cylinder`** (via the `box()`/`cyl()` helpers) — no cones, spheres, tori,
or dodecahedra anywhere in `models.ts`. Scenery and props reach for a wider
vocabulary — `ConeGeometry` (roofs, the obstacle belt), `TorusGeometry` (the
fuel-depot berm), `DodecahedronGeometry` (a rubble chunk — cheap, irregular,
reads as debris without hand-authoring an odd shape), `SphereGeometry` (the
ember glow) — because static terrain dressing has different silhouette
needs than a vehicle does (a roof genuinely wants a cone; a vehicle's
recognisable shape almost never does). **This is a documented, deliberate
split, not scope creep in scenery.ts**: new *vehicle/hero* models should stay
Box+Cylinder only, matching the existing eleven; new *scenery/landmark*
pieces may reach for the wider primitive set scenery.ts already uses.

## 5. Silhouette rules

Every hero model is built around **one or two features chosen specifically
because they're what makes the real system recognisable at marker scale**,
not an attempt at completeness:

- `mainBattleTank` — turret + long barrel overhang past the hull front.
- `himars`/`mlrsTruck` — the angled launch pod/tube pack, tilted off-axis
  rather than flush, which is what reads as "about to fire" vs. "a truck."
- `loiteringMunition` — the file comment names this directly: *"the X-wing
  pairs Lancet-type munitions are recognisable by"* — four flat wing
  panels at two rotations, nothing else about the body is detailed.
- `reconUAV` — high wing + V-tail, the two features that separate a fixed-
  wing recon airframe's silhouette from literally anything else in the
  scene at a glance.
- `patriotLauncher` — the canister rack tilted to launch elevation
  (`rotation.z = 0.72`), not resting flat, because a flat rack reads as
  "trailer," not "SAM launcher."

The rule this generalises to: **pick the one or two geometric features an
real photo silhouette of the thing is instantly recognisable by, model
those with real intent (an actual tilt, an actual overhang), and leave
everything else as the plainest box/cylinder that will hold the shape
together.** Do not spend primitive budget on symmetric, generic detail
(rivets, uniform panel lines) that doesn't discriminate this asset from a
different one in the same category.

## 6. Side identification

Handled in exactly one place, once, not per-model: `buildHeroModel()` adds
one small emissive-tinted plate in the side's accent colour to every hero
model after cloning, rather than each builder function recolouring part of
its own hull. A new hero model needs **zero** side-handling code of its own
— it's automatic. Scenery/landmarks carry no side-colour plate at all, and
that's correct, not a gap: they aren't clickable per-side data assets, they're
scene dressing placed at a `(side, km, z)` for context, and painting a house
in a national colour would misrepresent it as a battlefield asset.

## 7. Checklist for a new model

1. Box + Cylinder only if it's a hero/vehicle model; the wider primitive set
   is fine for scenery/landmarks.
2. Radial segments 4–14 on anything round. Never higher.
3. 6–25 primitives total. If it's creeping past ~25, find the one or two
   silhouette features actually worth keeping and cut the rest.
4. Reach for an existing shared material first. If none fits, add it to a
   **shared, exported** list the way `HERO_MATERIALS` does — don't declare
   a private `const` nobody else can reuse (see the audit finding below for
   what happens when this rule is skipped).
5. `flatShading: true`. Always.
6. Roughness 0.5–1 unless there's a specific, named reason for lower (glass,
   water, something else meant to read as reflective).
7. Colour desaturated (≤~30% saturation) unless it's a deliberate accent —
   and if it is, say so in a comment the way `EMBER` and `GLASS` do.
8. Identify the one or two features a real silhouette is recognisable by;
   model those with intent (a real tilt/overhang/angle); leave the rest
   plain.

---

## Audit of existing models against this guide

### `src/three/models.ts` — the reference set. No deviations found.

This is where the guide was read off, so a clean audit here is expected,
not a coincidence — checked anyway rather than assumed:

- All 11 builders use only `box()`/`cyl()` — confirmed, zero cones/spheres/
  tori anywhere in the file.
- Every material used is one of the 5 in `HERO_MATERIALS` — no inline
  one-off materials in any builder.
- Segment counts on every `cyl()` call: 5, 6, 6, 6, 8, 8, 8, 8, 8, 10, 10,
  12 — all within the 4–14 band, nothing smooth.
- Primitive counts per builder: `loiteringMunition` 6, `reconUAV` 6,
  `towedHowitzer` 6, `himars` 11, `patriotLauncher` 12, `shortRangeAD` 17,
  `mainBattleTank` ~19, `mlrsTruck` ~22 — all inside the 6–25 band.
- `flatShading: true` on all 5 materials, no exceptions.

**No changes recommended here.** This file is the spec, not a subject of it.

### `src/three/scenery.ts` — the Pass 12 deviation, fixed at Pass 19

**Pass 12's finding, re-measured before touching anything (its own
"measured, not eyeballed" standard applied to its own prior numbers):** the
material count had grown from 19 to 27 by Pass 19 — Pass 17 alone added 7
(`CANOPY`, `EARTH_MOUND`, `BRIDGE_DECK`, `BRIDGE_DECK_BROKEN`, `REBAR`,
`PONTOON_MAT`, `SMOKE_MAT`) with no governance check to catch the drift Pass
12 had already warned about. A full RGB-distance sweep across every
material in the scene (same method, wider scope — every file, not just this
one) found three pairs under the ~15-distance "not reliably distinguishable"
line:

| Material A | Material B | Distance* | Fixed how |
|---|---|---|---|
| `scenery.WALL_RUINED` `#332f28` | `scenery.RUBBLE` `#302c26` | 4.7 | `WALL_RUINED = RUBBLE` — literal alias |
| `scenery.SANDBAG` `#8c7f5c` | `scenery.WALL_INTACT` `#8a7a5c` | 5.4 | `WALL_INTACT = SANDBAG` — literal alias, `SANDBAG` moved to `palette.ts` |
| `scenery.WIRE` `#3a3a38` | `scenery.BRIDGE_DECK_BROKEN` `#3d3b35` | 4.4 | `BRIDGE_DECK_BROKEN = WIRE` — literal alias (found this pass; Pass 12 didn't have Pass 17's materials to check) |

*Euclidean distance over 0–255 RGB channels; under ~15 is not reliably
distinguishable on screen at prop scale.

**Fixed as literal object aliases, not just matching hex values** — `const
WALL_RUINED = RUBBLE;` rather than two separately-declared materials that
happen to share a colour — so the pair can never drift apart again by a
future edit to just one of them. `WOOD`, `SANDBAG` and `CANVAS` moved into
`palette.ts` entirely (see §3), and `export const SCENERY_MATERIALS` now
lists everything else this file declares for itself — the governance
mechanism Pass 12 asked for and didn't build.

**What did NOT get merged, disclosed rather than silently left:** the
Pass-17-era cluster (`BRIDGE_DECK_BROKEN`/`PONTOON_MAT`/`EARTH_MOUND`/
`REBAR`/`PIER_WOOD`/`CONCRETE_DARK`/`DIRT_WALL`) all sit within ~16 RGB
units of each other — real, measured drift, but attempting a full
unification alongside this pass's shader/instancing/new-geometry work risked
exactly the "fixed four things while quietly breaking a fifth" failure mode
this repo's verification standard exists to catch. Logged in
`docs/BACKLOG.md` as the next concrete follow-up, with the numbers, not a
vague "revisit materials someday."

**Mild saturation creep, now documented rather than left unflagged:**
`ROOF_INTACT` (S=0.42) and `ROOF_DAMAGED` (S=0.35) sit above the scene's
usual ≤~30% saturation band. Pass 12 found this plausible but undocumented;
confirmed intentional now with a comment at the declaration — a terracotta
roof tile genuinely reads more saturated than bare dirt or concrete, the
same kind of deliberate, narrow accent `GLASS`/`EMBER`/water already are.

**Primitive vocabulary, segment counts, primitive-count budget, and
`flatShading` all still pass**, unchanged from the Pass 12 audit — Cone/
Torus/Dodecahedron/Sphere use is consistent with §4's documented scenery/
hero split, segment counts stay inside 4–14, landmark primitive counts stay
inside 6–25, every material has `flatShading: true`. **New this pass:**
`buildTrenchLines()` and `buildFightingPositions()` (formerly per-segment/
per-position `Mesh` loops, up to ~330 draw calls combined at the high
scenery budget) are now `InstancedMesh`, the same pattern `buildObstacleBelt`
already used and `props.ts`'s scatter already established — not a new
pattern, reused where it had been missed. See `docs/DECISIONS.md` Pass 19
for the measured before/after.

### `src/three/models.ts`'s new geometry (Pass 19) — audited against its own rules

**5 UGVs** (`ugvKurier`, `ugvOmich2`, `ugvUran6`, `ugvUran9`, `ugvVaran`):
Box+Cylinder only, confirmed. Primitive counts 8 (`ugvVaran`) to 16
(`ugvUran6`) — inside 6–25, smaller than the tank/IFV tier on purpose (a UGV
is a fraction of a crewed vehicle's size — §1's relative-scale rule).
Segment counts: 4, 8, 8 — inside 4–14. Each has exactly one silhouette
feature per §5's rule: Kurier's open cargo bed, Omich-2's enclosed box,
Uran-6's flail drum, Uran-9's small turret+barrel, Varan's modular payload
block on a wheeled (not tracked) chassis.

**Human figures** (`humanFigureBase` + 4 variants): the first non-vehicle,
non-scenery geometry in the file, and deliberately the plainest possible —
4 primitives for the base figure (legs/torso/head/helmet, all Box), one
prop added per variant (rifle, radio+table, binoculars+kneel, stretcher).
`humanObservationPost` and `humanCasualtyPoint` land at 5–7 primitives,
under the nominal 6 floor — read as intentional here, not a violation:
§2's own band exists to prevent *padding* a design with generic detail, and
these are already at the minimum a recognisable figure needs. Two new
palette materials (`SKIN`, `FATIGUES`/`FATIGUES_DARK`) rather than reusing
`HULL`-family tones — a person is not a vehicle hull, and the guide's own
§3 colour-family reasoning (desaturated, semantically distinct per
substance) argues for a real distinction here, not a forced reuse.

**Pass 18 fortification hero geometry** (`fortificationDugout`,
`fortificationArtilleryPosition`, `fortificationAmmoPoint`): built under
§4's scenery/hero split rather than the vehicle Box+Cylinder-only rule —
these are positions, not vehicles, the same reasoning that already lets
`scenery.ts` reach for Cone/Torus/Dodecahedron. Primitive counts 9–11,
inside 6–25. Shares `WOOD`/`SANDBAG`/`CANVAS` with `scenery.ts`'s own
decorative trench/fighting-position dressing on purpose, so a real,
clickable dugout marker doesn't look like a different artist's work next to
the unclickable dressing around it.

### `src/three/props.ts` — no deviations found

Four instanced prop types (trees, craters, scrub, wreck husks), each one
material, each `flatShading: true`, roughness 0.85–1 (fully matte,
appropriate for organic/battlefield-debris scatter — no `GLASS`/water-style
exception needed here since nothing in this file is meant to look
reflective). Segment counts: 5 (trees), 9 (craters) — inside the band.
Colour check: all four (`#4a4237`, `#2f2b22`, `#5b5a3e`, `#241f18`) sit
inside the standard low-saturation earth band, no accents, none needed.
**The one cross-file note**: `props.ts`'s tree colour and wreck colour are
each within a few RGB points of a `scenery.ts` material (see the table
above) — the same reuse-discipline gap, not a `props.ts`-specific problem.

### `src/three/terrain3d.ts` — two materials, both correctly flagged as exceptions in their own comments

The ground material (`vertexColors: true, flatShading: true, roughness:
0.96, metalness: 0`) is the most matte surface in the entire scene, which is
correct for open dirt/steppe. The water material (`roughness: 0.18,
metalness: 0.05, transparent: true, opacity: 0.88`) is the one deliberately
glossy surface, and — unlike `scenery.ts`'s roof materials above — its
reasoning is already written down at the point it's declared, which is
exactly what §3's accent rule asks for. **No changes recommended.**

---

## Summary

Pass 12's one real, concrete finding — `scenery.ts` didn't follow the
material-reuse discipline `models.ts` established, with several pairs close
enough to be visually redundant — is fixed as of Pass 19, not just flagged:
three pairs merged into literal aliases, `WOOD`/`SANDBAG`/`CANVAS` unified
into a shared `palette.ts` both files import, and `SCENERY_MATERIALS` now
exists as the governance list Pass 12 asked for. A further, smaller cluster
of Pass-17-era near-duplicates was measured and disclosed rather than
chased in the same pass — logged in `docs/BACKLOG.md` with real numbers.
Proportions, poly budget, segment counts, `flatShading` discipline, and the
accent-colour convention all hold consistently across every file checked,
including the ~19 new hero-tier models this pass added (5 UGVs, a
human-figure base + 4 variants, 3 fortification hero builders) — audited
against this same guide, not exempted from it for being new.
