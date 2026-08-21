# Pass 24 handoff — contested-flag display, then the spatial contract

Two commits on `claude/lessons-audit-convergence-cd1o1n`, deliberately separate:

| | |
|---|---|
| `a2acf1f` | **Part A** — make Pass 23's convergence audit visible on the Lessons page |
| `fe6eb18` | **Part B** — the spatial contract |

**Dependency check, as asked.** `git fetch origin` run first. `f54052a` (Pass 23) is an
ancestor of the working branch — it was the tip of both `claude/lessons-audit-convergence-cd1o1n`
and `claude/warfare-digital-twin-scaffold-19u7kt` when this pass started. Confirmed with
`git merge-base --is-ancestor f54052a <branch>` → yes for both.

**Spot-check of `data/lessons.json`, as asked.** 15 lessons; 15 carry `corpus_support`,
4 carry `contested: true`, 4 carry `caution`. All present as PASS23_HANDOFF.md claims.

**One correction to the brief's premise:** the brief cites Pass 23 as "deployed via Action
run 32394088495". That run ID is right (head_sha `f54052a`); the *commit message* on
f54052a names 32393829956, which is the run for the commit before it (`30bd665`). Nothing
depends on this, but the two numbers disagree in the repo and now one of them is explained.

---

## Part A — the contested flag, rendered

**Screenshots:** `docs/screenshots/pass24/partA-{before,after}-{collapsed,convergent3,single-source,unsupported,contested}.png`

Confirmed by driving the real preview build in headless Chromium and reading the DOM, not
by inspecting source. Before, the four sampled lessons rendered *no* trace of
`corpus_support`, `contested` or `caution` in their DOM text. After:

| lesson | badge row rendered |
|---|---|
| 09 fibre-optic immunity | `CONVERGENT-3` |
| 13 ammunition standardisation | `SINGLE-SOURCE` |
| 12 deep rear is reachable | `UNSUPPORTED` |
| 11 cost asymmetry (contested) | `CONVERGENT-2` · `part CONTRADICTED` · `CONTESTED`, plus the caution text |

Three decisions worth carrying forward:

- **`corpus_support` stayed prose and the badge parses it.** An enum alongside it was
  rejected: the audit's own finding is that one lesson can hold claims at two confidences
  (lesson 11 is CONVERGENT-2 on the asymmetry and CONTRADICTED on the statistic it used to
  lead with), and an enum forces a choice between them. A second badge is emitted only for
  a *weaker* tier, so "part UNSUPPORTED" reads as the caveat it is.
- **The badge and the caution both sit in the collapsed row.** A reader scanning fifteen
  lessons is exactly who the tier is meant to warn, and a caveat behind an expander is one
  most readers never see. The full prose stays in the expanded body.
- Colour reuses the existing `--ok` / `--warn` / `--err` confidence vocabulary. A five-tier
  key sits above the list, since a bare "CONVERGENT-3" needs explaining once.

---

## Part B — the spatial contract

Full reasoning, including every rejected alternative, is in **`docs/DECISIONS.md` Pass 24**.
Summary:

### The rule

**`src/three/depthAxis.ts`, and one world unit is one metre.** That constant is not
arbitrary: `models.ts` had always authored the hero tier at roughly metre scale (tank hull
7.0 units, road wheel 0.72, rifle 1.5). Declaring the unit a metre made 30 models correct
by construction without rescaling any of them.

```
km ≤ 40  →  u = km · 1000                                 true scale
km > 40  →  u = 40,000 + 1000·L·ln(1 + (km−40)/L)         L = 4.356414 km
```

- **`TRUE_SCALE_DEPTH_KM = 40`** — `doctrine.md` §2 gives 0–5 km as the FPV envelope and
  "the dominant killing zone", 0–10 km close reconnaissance, **~0–30 km the drone-dense
  corridor either side of the line**, and 10–70 km the strike/deep-recon layer that starts
  inside that corridor. 40 puts the whole sourced corridor plus a margin at 1:1 while the
  strike layer *crosses* the boundary rather than being cut by it. 30 would have implied
  something changes at 30, which nothing does; 70 would have spent 140 km of true scale on
  ground the roster barely populates.
- **`FAR_REGISTER_UNITS = 30,000`** — 30 km of screen depth for 4,260 km of real depth.
- **`L` is solved, not chosen** (bisection at module load), so the three editable constants
  can never disagree with the curve.
- **Logarithm, not a power law**: monotonic (ordering can never invert), analytically
  invertible (drag-to-reposition needs it), and slope-matchable at the boundary. Measured
  at the seam: **1000.0000 → 999.7705**. No wall, no mode switch.

Compression: **1× through 40 km, 3.3× at 50, 26× at 150, 107× at 500, 979× at 4,300.**

### Fidelity gradient, horizon, axis lock, altitude

- Detail fades on **the compression itself**, not a parallel distance ramp: terrain octaves,
  scatter density and haze all read `compressionAt()`. Haze is applied **after lighting**
  (`onBeforeCompile`) — hazing the albedo left the plate's far edge as a lighter trapezoid
  against the sky, which is documented with the reasoning.
- Three lateral extents — sector 6 km, dressing 12 km, ground 32 km — plus a
  **camera-centred sky**, so the scene reads as a sector inside a larger landscape. For a
  flat plane the true horizon is at eye level at every altitude, so a camera-centred
  gradient is the *correct* model, not a shortcut.
- **Yaw locked to ±25°**, enforced by OrbitControls itself. **Verified**: forcing the camera
  to azimuth 180° from outside the app reads back **+25.0°**.
- Pass 16's azimuth header was **verified rather than assumed, and a real bug found**: its
  probe points were absolute (±40 km on the axis), which sit behind the camera at close
  framings and project sign-flipped, so zooming into the near register reversed the header.
  Now probed ±400 m either side of the current target.
- **Facing derived** from the lock: side_a rotation 0, side_b π. Before this pass no
  rotation was applied at all, so every Russian model faced its own rear. Verified across
  all 30 hero models.
- Position-by-distance is parametric throughout (`depthUnitsFor(km)`), so Pass 26 can drive
  a lower-sky-control stressor by varying km without touching geometry.

### The six hand-cross-checked positions

The three constants were **re-implemented in a separate Node process** (not imported from
the app) and the screen position recomputed with a **from-scratch look-at basis and
perspective divide** rather than three.js's projection. Camera fixed at the shipped default
framing `(-16000, 40000, 92000) → (0,0,0)`, fov 46, viewport 1440×802.

| asset | km | side | hand world X | renderer world X | Δ | hand screen X | renderer screen X | Δ |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Lancet Loitering Munition | 3 | a | −3000.00 | −3000.00 | 0 | 691.62 | 691.62 | 0 |
| M1A1 Abrams | 3.6 | a | −3600.00 | −3600.00 | 0 | 689.98 | 689.98 | 0 |
| Shahed-136 / Geran-2 | 18.4 | b | 18400.00 | 18400.00 | 0 | 898.38 | 898.38 | 0 |
| AN-196 Lyutyy | 274 | a | −57434.88 | −57434.88 | 0 | 141.63 | 141.63 | −0.0000 |
| UJ-26 Beaver (Bober) | 500 | a | −60340.11 | −60340.11 | 0 | 86.64 | 86.64 | −0.0000 |
| Truck-Launched Deep-Strike FPV Swarm | 4300 | a | −70000.00 | −70000.00 | 0 | −29.53 | −29.53 | −0.0000 |

**Worst absolute discrepancy across all twelve comparisons: 4.0 × 10⁻¹³.** The 4,300 km
asset lands at screen X −29.5 — just off the left edge at that framing, which is honest
rather than hidden.

### Altitude bands — what was flagged

21 airborne assets carry `altitude_band_m`. `basis` is never inferred from the numbers.
All 17 non-`sourced` entries surface as Data Health items (verified in the live app: 17
matching lines).

**`sourced` (3)** — a published figure for that airframe:
Orlan-10 (1,000–1,500 m typical, 5,000 m ceiling) · Bayraktar TB2 (5,500–8,200) ·
Shahed-136 / Geran-2 (60–4,000).

**`estimated` (11)** — class-typical band, labelled as such, not a figure for the airframe:
Leleka-100 · Supercam S350 · Zala Z-16 (800–2,000, fixed-wing tactical recon) ·
Forpost-RU (3,000–6,000) · Orion (4,000–7,000) · Gerbera (60–2,000, Shahed-class airframe) ·
KUB-1 (150–1,000) · Punisher (200–800) · Switchblade 300 (150–500) ·
Switchblade 600 (200–1,200) · Truck-Launched Deep-Strike FPV Swarm (30–200, the brief's
FPV band).

**`unknown` (6)** — searched, no defensible figure, flagged rather than invented:
**Lancet Loitering Munition** (reported to loiter at "medium altitude" and dive at ~70°, no
figure in metres) · **AN-196 Lyutyy** (low-altitude profile reported, no figure) ·
**AQ-400 Scythe** · **FP-1 / FP-2** · **UJ-26 Beaver (Bober)** (reported to *change*
altitude in flight to evade air defence, i.e. it has no single band) · **Zozulia**.

**`symbolic` (1)** — real and unrenderable: the Commercial SAR/Optical ISR constellation.
True LEO is 450–600 km, twelve times the depth of the entire true-scale register; drawn at
a stated symbolic 25 km, with the real figure in the record.

**The brief's ballistic-missile row has no subject in this roster.** The one deep-strike
rocket asset is a launcher, which resolves to a `land` platform and needs no altitude.
Recorded rather than answered with an invented entry.

Far-register altitude is scaled by the local compression, clamped at 8× and 6,000 m, so a
deep-strike UAV stays comparable to a Bayraktar's genuinely true 6.7 km rather than becoming
the tallest thing in frame.

### A real bug this pass exposed

`buildFightingPositions()` allocated its InstancedMesh buffers for the **per-side** budget
and wrote both sides into them, then set `.count` to what it wrote. Three drew past the end
of `instanceMatrix`; out-of-range reads are zero, a zero matrix is degenerate, and the
result was **enormous black triangles across the scene**. Latent since Pass 19 — invisible
at 14/side into a 14 buffer at the old world scale, most of the frame at 52/side across
24 km of frontage. Found by bisecting the scene graph against screenshots, not by reading
the code.

### Rejected and recorded

`logarithmicDepthBuffer: true` was the first answer to the 1 m-to-140 km range problem. It
**dropped the terrain out of the scene entirely at close range while the scenery still
drew** — a precision problem traded for a correctness one. Replaced with a dynamic near/far
derived from the orbit radius plus the depth-free camera-attached sky; far/near never
exceeds ~40,000 and is under 3,000 at the framings that matter, against 420,000 for a fixed
pair.

### Deviations from the repo's own rules, flagged not taken silently

1. **The 2D and 3D views no longer share one km→screen function.** CLAUDE.md's invariant
   said they must; it is updated. What that invariant was protecting survives: both draw
   every asset from `distance_km_from_zero` and label it in true km. A consequence worth
   having — **editing a band no longer moves anything in the 3D scene.**
2. **`MODEL_STYLE_GUIDE.md` §1 said "world units are not to-scale."** Inside the near
   register that is now false, in the direction the guide wanted. §1 is rewritten.
3. **Four large industrial landmarks carry a disclosed 3–5× footprint scale.** They were
   authored as compact icons and read as garden sheds at true scale. Nothing house-sized is
   scaled, and nothing an asset is *sited relative to* is scaled.

### Performance, measured before and after

Headless Chromium on SwiftShader (software rasterisation — wall-clock here is **not** a
hardware prediction), 1440×860, default framing, after a camera nudge and settle.

| | pre-Pass-24 (`a2acf1f`) | Pass 24 (`fe6eb18`) |
|---|---:|---:|
| draw calls | 767 | **588** |
| triangles | 147,680 | 416,518 |
| geometries | 713 | 587 |
| layout ms | 0.21 | 0.23 |
| render ms (JS) | 16.27 | 12.59 |
| frame ms (software) | 453.6 | 656.9 |

Draw calls — the metric Pass 19 optimised, and the one that costs on a GPU — are down 23%.
Triangles rise because the scene covers ~100× more real ground at true scale. The trench
belt was measured at 200k triangles on its own and cut to 66k.

### Screenshots — every visual claim

`docs/screenshots/pass24/`: `partB-fulldepth` (whole axis, both compressed horizons) ·
`partB-transition` (mid-depth, no seam) · `partB-near` (true-scale close view) ·
`partB-airlayer` (Forpost-RU at 4,243 m and Orlan-10 at 1,225 m on real tethers over
grounded assets) · `partB-yaw-neg` / `partB-yaw-pos` (both lock extremes) ·
`partB-hero-side_a` / `partB-hero-side_b` (metre-scale hero geometry, derived facing) ·
`partB-osm-truescale` (the OSM patch, no longer an "inset" — it sits at 17 km, inside the
true-scale register, so its scale and the scene's are the same scale) ·
`partB-mobile-iphone` (the redesigned ruler at 390 px).

Ruler geometry asserted from real rects at 390×844 and 360×740: caption bottom **816**,
band row top **821**, ruler bottom **844** = viewport bottom. No overlap, nothing off-screen.
Pass 16's mobile block had "fixed" the old collision by deleting the caption entirely
below 620 px; that override is removed.

All five routes (`/`, `/health`, `/lessons`, `/about`, `/library`) and the 2D schematic view
(105 nodes) were smoke-tested against the production build with zero page errors.

---

## Deploy — done, and independently re-verified after a container restart

| | |
|---|---|
| Action run ID | **32414230946** |
| head_sha | **`fe6eb18f4dc3f84693e01ccb8d2d1fbac4b4b5e5`** |
| Branch | `claude/warfare-digital-twin-scaffold-19u7kt` |
| Conclusion | **success** |
| Workflow | `.github/workflows/deploy-pages.yml` |

head_sha matches `fe6eb18` — the Part B commit — exactly.

**How it was published.** `workflow_dispatch` on the working branch fails: run
[`32411295957`](https://github.com/yan-ship-it-tech/Warfare/actions/runs/32411295957) on the
same `fe6eb18`, **conclusion failure**, 1 second, no runner assigned, no step executed —
the signature of the `github-pages` environment's deployment-branch policy rejecting a ref
it does not allow. The workflow only auto-deploys on push to
`claude/warfare-digital-twin-scaffold-19u7kt` or `main`. So publishing needed a
fast-forward of the deploy branch: `f54052a` was its tip and is an ancestor of `fe6eb18`,
so `git merge --ff-only fe6eb18` moved it with **no merge commit and nothing rewritten**.
Verified as a clean fast-forward before pushing
(`git merge-base --is-ancestor HEAD fe6eb18` → exit 0). This is the same mechanism Pass
22/23 used.

**As required by the brief, stated plainly: this sandbox cannot load the live
`github.io` URL.** Outbound access is proxied and the deployed site was never fetched from
here. "Deployed" means the Action completed against the right commit — not that the live
site has been looked at. Every visual and numeric claim in this document is measured
against a local `npm run preview` of the same production build.

---

## Post-restart re-verification

The container restarted mid-pass, after both commits were pushed but before the deploy.
Rather than trust this document's own claims across that boundary, the load-bearing ones
were re-checked from scratch:

| Claim | How re-checked | Result |
|---|---|---|
| `f54052a` is an ancestor of the branch | `git merge-base --is-ancestor` | exit 0 |
| `data/lessons.json` carries the three fields | parsed the file | 15 lessons, 15 `corpus_support`, 4 `contested`, 4 `caution` |
| The compression math | **re-implemented from the documented formula in Python**, solved `L` by Newton where the app uses bisection | `L = 4.356414` — identical; half-extent exactly `70000` u; compression 3.30× @50 km, 26.25× @150, 106.59× @500, 978.87× @4300 — all match |
| Monotonicity (ordering can never invert) | 43,000,001-sample sweep over 0–4,300 km | strictly increasing, no inversion |
| C¹ continuity at the 40 km seam | slope either side | 1000.000000 → 999.999770 at ±1e-6 km (the table's 999.7705 is the same curve measured at +0.001 km) |
| The six hand-checked world positions | Python `depthUnitsFor` vs. the table | 274 km → 57434.8834, 500 km → 60340.1122, 4300 km → 70000.0000 — exact to the printed digits |
| Part A actually renders | real browser, read `.support` / `.lessons__caution` from the DOM | **15/15** lessons badge a tier; CONVERGENT-3, SINGLE-SOURCE and UNSUPPORTED all distinct; 4 cautions visible in the collapsed row |
| Mobile ruler no longer cut off | real rects at 390×844 and 360×740 | caption bottom 816, ruler bottom **844 = viewport bottom**; Android bottom **740 = viewport bottom**; no overlap, nothing off-screen |
| Scene renders | production build in headless Chromium | canvas 1440×802, 315 DOM pins, OSM credit present, no page errors |
| `npm run build` | run again post-restart | passes |

Screenshots were re-examined rather than assumed from filenames: `partB-fulldepth`
(continuous terrain, both compressed horizons, ruler reading `1:1` near and `+12`/`+66`/
`+543` far), `partB-near` (terrain to frame edge, no void), `partB-transition` (no seam or
wall at the register boundary), `partB-yaw-pos` (axis still reads left-to-right at the lock
extreme).

**One residual, reported rather than smoothed over:** at the most zoomed-out framing
(`partB-fulldepth`) the ground plate's lateral edges are still discernible against the sky,
because a 32 km-wide plate viewed along 140 km of axis depth genuinely runs out sideways.
The fade softens it but does not hide it. Near and mid framings — the ones a reader
actually uses — show no edge at all. Closing this properly means widening the lateral
extent with the depth, which is a real change to the terrain budget and was not attempted
here.
