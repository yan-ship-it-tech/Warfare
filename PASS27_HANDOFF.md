# Pass 27 handoff — scale calibration, distribution fix, artifact diagnosis

Scope: The Line only. Four issues reported from a real device against the
Pass 26 checkpoint (which was confirmed as real progress and **not** reverted).
All four are addressed. Screenshots in `docs/screenshots/pass27/`.

---

## Item 1 — structures read as tiny next to craters

**Finding: confirmed, and the brief's premise was right.** The grey box volumes
come from **`buildUrbanCluster`** (`src/three/scenery.ts`), which serves both
the deep-rear `urban_cluster` landmarks and the `built_up_block` terrain
features at km 6-7. It is a **completely separate code path from
`buildHouse`** — which is exactly why Pass 26's `buildHouse` real-scale fix did
not touch it.

`village_ruined` *does* route through `buildHouse` and was already at real
scale (8-12 m). What made it still look small was the other half of the
comparison: the craters beside it.

Measured before:

| | metres |
|---|---|
| `buildUrbanCluster` footprint | 12-24 m cubes, 9 of them over 300 x 220 m |
| `buildHouse` frontage (Pass 26) | 8-12 m |
| crater **apron** diameter | 12-64 m, **median 35 m** |

So the median crater apron was **1.9x the median building** and **3.5x a
house**. The report was measuring something real.

**Fix — shape and spacing, not inflation.** A cube is the wrong shape for this
ground and 100 m between neighbours is the wrong spacing. What is actually
there is Soviet-era panel housing, so `buildUrbanCluster` now draws:

- 58 % five-storey **panel slabs**, 45-80 m long x 11-15 m deep x 12-18 m tall
- 25 % nine-storey **towers**, 22-34 m x 14-18 m x 24-34 m
- 17 % **low infill** (shops, school, boiler house), 14-24 m
- 12 buildings over 210 x 150 m, laid on **one shared street grid** with a few
  degrees of jitter, instead of 9 over 300 x 220 m each rotated at random

Per-building footprint *area* is close to what it was; the mass is simply
distributed the way a real building is. The long slab is the load-bearing
change — it is the dimension that makes a block read as a block.

**After:** median slab 62 m vs median crater apron 6.8 m — the structure is
**9.1x** the crater. Even the rarest 18 m glide-bomb crater is dwarfed by the
smallest 45 m slab (2.5x).

---

## Item 2 — crater geometry oversized

**Reference used: the 152/155 mm artillery shell**, because that is the
munition this roster overwhelmingly represents. It produces a crater
**roughly 2-4 m across and about a metre deep** in soft ground. Against the
things standing next to it in this scene that is:

- about **half a T-72's 7 m hull length**
- about **a third of a 10 m house frontage**
- a small fraction of a 45-80 m panel block

Pass 26 drew bowls 4-16 m across with aprons at **3-4x the bowl radius** —
which is 6-8x the bowl *diameter*, where a real ejecta/scorch ring is about
**1.5-2.5x the diameter**. That single confusion of radius for diameter is
most of the error.

**Fix.** Craters are now drawn from the real munition mix rather than one
uniform range, which is also what gives the field its variety:

| tier | share | bowl diameter |
|---|---|---|
| shell / mortar / rocket | 86 % | 2-5 m |
| heavy rocket, large calibre | 11 % | 5-9 m |
| glide bomb (FAB-500/1500) | 3 % | 9-18 m |

Apron radius `s x 1.5-2.5`, i.e. a ring 1.5-2.5x the crater diameter. Median
bowl ~3.4 m, median apron ~6.8 m.

**Consequence, stated plainly:** a 3 m crater is 0.2 px at a 15 km framing, so
craters are now correctly invisible past roughly 2 km. That is the honest
outcome of real scale, and it is why the km-range read of churned ground is
carried by the terrain's own ash/burn/scar tint (Pass 26) rather than by
oversized crater geometry. Crater count raised 2,200 -> 3,600 (low tier) since
each is now a fraction of its former size.

---

## Item 3 — thin black diagonal lines: DIAGNOSIS FIRST

**Diagnosed by layer isolation before anything was changed.** Every named
geometry layer in the scene was enumerated (27 of them) and hidden one at a
time at the 15 km framing where the artifact reproduces.

**Hiding `props:shelterbelts` removes every one of the lines. Nothing else
does.** Evidence: `diag-shelterbelts-hidden.png` and
`diag-only-linear-layers.png`.

**Verdict: an intended feature rendering incorrectly, not stray geometry.**
It is Pass 26's windbreak grid. The mechanism, measured off the live instance
buffer:

- a belt is **11-26 m wide (median 17.4 m)**, 3-6.9 m tall, **444 m long**
- at a 15 km orbit that is **1.33 px wide**; at 22 km, **0.90 px**
- its instance colour is an ordinary dark green (linear 0.117/0.162/0.047,
  about `#5e6e3d` in sRGB) — **the colour was never black**

Two things combine. A high-aspect solid below a pixel of width cannot
antialias into anything but a hard stroke. And the face that wins the coverage
fight is a **vertical side**, whose normal is horizontal and which therefore
catches almost nothing from a hemisphere lit from above — so the stroke is
black. Pass 26 also halved the grid pitch, putting 541 of them on screen at
once.

**Fix.** Stop drawing them once they cannot be drawn honestly: below ~2.0 px
of apparent width the belts fade, and by ~1.3 px they are gone. Plus a small
emissive floor (0.11) so the belts that *are* visible read as dark green
hedgerow rather than as silhouette.

The fade window was chosen so **every framing Pass 26 verified stays at full
opacity**:

| orbit | m/px | belt px | opacity |
|---|---|---|---|
| 3.2 km (default) | 3.22 | 5.41 | 1.00 |
| 6 km | 6.04 | 2.88 | 1.00 |
| 8 km | 8.05 | 2.16 | 1.00 |
| 11 km | 11.06 | 1.57 | 0.39 |
| 15 km | 15.09 | 1.15 | **0.00** |
| 22 km | 22.13 | 0.79 | **0.00** |

Nothing is lost: at 15 km a 17 m hedgerow is not something a viewer could
resolve anyway, and the ground's structure there is carried by the terrain's
field-parcel tint, which is the layer that should carry it at km range.

---

## Item 4 — "clustered rather than evenly graded"

**Checked the seeding for clumping first, as the brief asked. There was
none.** Isolating clumping from the intended gradient — mean CV of the z
distribution within constant-x bands, where pure Poisson noise sits near
0.2-0.3:

| | before | after |
|---|---|---|
| z-clumping within constant-x bands | 0.23 | 0.207 |

Both sit at the Poisson floor. The RNG was never the problem.

**The actual cause.** `craterDensityAt` was `damageIntensity^2.6` **plus** an
additive `0.4 x exp(-dx²)` bump for every asset within 720 m. **86 of the
roster's 103 assets sit inside The Line**, so those bumps overlapped and
stacked: the sum clipped at 1.0 across **66 % of the zone**, then fell off a
cliff where the assets ran out. The destruction gradient underneath — which
on its own grades 0.98 -> 0.01 — was completely masked.

Share of craters per 250 m band, zero line -> km 50 edge:

```
BEFORE  9.8  9.9  9.2 11.3 10.5 11.9  8.6 10.4  6.6  2.3  4.0  5.5
AFTER  13.2 13.9 14.0 13.8 11.6  8.8  6.8  6.7  4.7  3.0  2.0  1.5
```

Before is a **flat plateau then a cliff, then a non-monotonic bounce back up**
(2.3 -> 4.0 -> 5.5). That bounce is the "dense pockets with empty ground
around them". After is a smooth monotonic decay.

**Fix — structural, not a retune.** The anchor term is now **max, not sum**
(one asset nearby is enough; ten do not stack) and **multiplicative, not
additive** (it modulates the destruction gradient instead of overwriting it),
with a 0.10 floor so the outer Line zone is lightly cratered rather than bare —
km 40-50 does get struck; it is not a rear area.

Acceptance profile after: 1.00 / 1.00 / 0.55 / 0.19 / 0.10 at x = 100 / 600 /
1500 / 2500 / 2950 m. Saturation **66 % -> 29 %**, largest step between
adjacent 10 m samples 0.010 (smooth).

**Debris got the same treatment.** Pass 26 put *all* debris in tight rings
around ~32 structure sites, so the only ground carrying anything was within
~250 m of a building. 38 % of the budget is now a field component spread
across The Line on the same destruction gradient the craters use.

---

## Verification

Framings: 1.2 / 3.2 / 6 / 8 / 15 / 22 km plus two on the built-up block near
NPRK Moroz / Tactical Command Post. Each described in words before being
cited. `npm run build` passes.

| framing | what is visible | verdict |
|---|---|---|
| block close-up | long panel slabs on a shared street grid, reading as a settlement; craters now small dots that do not compete | **item 1 fixed** |
| 1.2 km | many small crater marks spread evenly across the frame, no dense pockets or bare patches; bridge, river, farm track | **items 2 + 4 fixed** |
| 3.2 km (baseline) | river, zero line, markers/labels, belt grid, tonal ground variation | **no regression** |
| 6 km | belt grid present and softer, markers, river, ground tone varied | **no regression** |
| 8 km | belt grid at full opacity, muted rather than hard black | **no regression** |
| 15 km | **black diagonal lines entirely gone**; clean graded olive ground, faint pale tracks | **item 3 fixed** |
| 22 km | no lines; smooth graded ground, zone seams, ruler | **item 3 fixed** |

Cost: 285 draw calls, 407k triangles at the 8 km framing (Pass 26: 282 / 365k).
`renderMs` is swiftshader and not a hardware prediction; recorded because
CLAUDE.md requires before/after numbers on a rendering change.

---

## Note for the next pass

Craters being correctly invisible past ~2 km means the km-range "this ground
has been fought over" read now rests entirely on the terrain vertex tint. That
is the right layer for it, but it has not been tuned since Pass 26 and it is
now doing more work alone. If the live check says the 6-15 km framings read as
too clean, that tint — not crater size — is the thing to reach for.
