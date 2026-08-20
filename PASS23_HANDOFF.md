# Pass 23 — the approved Key Lessons set, committed

Everything needed to review Pass 23 in one document. Implements `LESSON_AUDIT.md` §6,
approved as written, plus the four bundled items the Pass 23 brief attached to the same
write.

**Branches.** Work committed on `claude/lessons-audit-convergence-cd1o1n` (`e9414d9`),
merged into the deploy branch `claude/warfare-digital-twin-scaffold-19u7kt` (`30bd665`).

**Dependency check, as required.** `git fetch origin` then
`git merge-base --is-ancestor origin/claude/lessons-audit-convergence-cd1o1n HEAD` →
**exit 0**. The Pass 22 branch tip was already HEAD; no merge was needed to start.

**Scope held.** No `src/` file, no rendering code, no 3D model, and no asset added to the
roster. The merge to the deploy branch carries docs and data only — verified with
`git diff --name-only <deploy>..HEAD | grep -E '^(src/|\.github/|package|vite|tsconfig)'`
→ no matches.

---

## 1. Deploy confirmation

| | |
|---|---|
| Action run ID | **32393829956** |
| head_sha | **`30bd665fc325b39d9f226b08879c617b42e10a85`** |
| Branch | `claude/warfare-digital-twin-scaffold-19u7kt` |
| Conclusion | **success** |
| Workflow | `.github/workflows/deploy-pages.yml` (`Deploy to GitHub Pages`) |

head_sha matches the merge commit exactly.

**Known limitation, stated plainly and unchanged since Pass 21: this sandbox cannot load
the live `github.io` URL**, so "deployed" here means the Action completed successfully
against the right commit — not that I have looked at the live site. What I *can* and did
verify visually is the same build served locally (`npm run preview` + headless Chromium),
below.

**Did the merge misfire the Action?** No, and it was checked rather than assumed. The
workflow triggers on `push` to `claude/warfare-digital-twin-scaffold-19u7kt` or `main`, so
this push firing it is the designed behaviour, not a surprise. The run does a normal
`npm ci && npm run build` and uploads `dist` — no path filters to bypass, no matrix, no
conditional steps that data-only changes could skip. `data/lessons.json` is imported by
`src/data/loader.ts` and so is baked into the bundle at build time, which is exactly why a
data-only change *needs* a rebuild to reach the site. `docs/references/*.md` are repo-only:
Vite bundles what is imported plus `public/`, and these are neither, so they add repository
weight but nothing to the deployed artifact.

---

## 2. The lesson set — before and after

**10 lessons → 15.** Every row below is the state after the write.

| # | id | Status | corpus_support | Assets | Declared edges |
|---|---|---|---|---|---|
| 1 | `drone-layer-connective-tissue` | **NEW** | CONVERGENT-3 | 5 | `data_c2` |
| 2 | `detectability-not-distance` | **NEW** (absorbs `pattern-of-life-detection`) | CONVERGENT-3 | 6 | `data_c2` |
| 3 | `lower-sky-control` | KEEP + rewrite | CONVERGENT-2 / figures SINGLE-SOURCE | 6 | `data_c2` |
| 4 | `kill-chain-compression` | KEEP + rewrite, retitled | CONVERGENT-2 / timing UNSUPPORTED | 6 | `data_c2`, `fires_support` |
| 5 | `distributed-kill-chains` | KEEP + rewrite, retitled | CONVERGENT-2 | 5 | `data_c2` |
| 6 | `logistics-is-counter-uas` | **NEW** (absorbs `drone-dense-corridor`) | CONVERGENT-3 | 11 | `supply`, `casevac` |
| 7 | `counter-uas-integration` | **NEW** | CONVERGENT-3 | 6 | `data_c2` |
| 8 | `ew-invisible-battlefield` | KEEP + amend | CONVERGENT-3 | 6 | `data_c2` |
| 9 | `fiber-optic-immunity` | KEEP + rewrite, retitled | CONVERGENT-3 | 4 | — |
| 10 | `attrition-economics` | KEEP (text unchanged) | CONVERGENT-2 | 3 | `supply` |
| 11 | `cost-asymmetry` | **RECAST** from `drone-attrition-share` | CONVERGENT-2 (asymmetry) | 4 | — |
| 12 | `deep-rear-is-reachable` | KEEP + downgrade confidence | **UNSUPPORTED** | 3 | — |
| 13 | `ammunition-standardisation` | **NEW** | **SINGLE-SOURCE** (Western, structurally) | 5 | — |
| 14 | `adaptation-cycle-is-the-capability` | **NEW** | CONVERGENT-2, Ukrainian-primary | 4 | — |
| 15 | `visibility-bias` | **NEW**, contested-category | CONVERGENT-2 | 3 | — |

### What changed per carried lesson

- **#3 `lower-sky-control`** — the 1–1.5 km / 7 km pair is now explicitly attributed to
  Markin's notebook via `doctrine.md`, with the Russian reference's own "illustrative, not
  statistical" instruction quoted against it. The broken demonstration the audit found is
  resolved by *stopping the promise* rather than by swapping assets: the text now says
  outright that Leopard 2 (2.6 km) and T-72 (4.4 km) do not reproduce that spread and are
  not intended to. Asset list unchanged. **Considered and rejected:** adding
  `side_a-ground-robots-krab-m1` (1.5 km) and Pantsir (7 km) as a pair that brackets the
  figures exactly — rejected because a UGV is not the "direct-fire tank position" the
  source describes, and making the numbers appear to check out with the wrong asset class
  is worse than saying they don't.
- **#4 `kill-chain-compression`** — retitled "Reconnaissance and fires fused into one
  function". Leads with the CONVERGENT-2 fusion finding; the unsourced "hours to minutes"
  clock is demoted to a caveated paragraph that names it as corpus-unsupported. HIMARS out;
  M777, Bohdana and Caesar in, plus `side_a-artillery-position-firing`.
- **#5 `distributed-kill-chains`** — retitled to carry the friction half. The
  command-culture material both references insist on (rigid-by-design command culture,
  bypassed chains, units hoarding drones, incentives rewarding video-friendly kills over
  holding ground) is restored. The cross-side incoherence the audit found is fixed: the
  set is now one side's loop end to end.
- **#8 `ew-invisible-battlefield`** — gains the Excalibur GPS-degradation datapoint (with
  M777 as the asset that demonstrates it), Ukrainian §3.4's analog-fallback-as-default
  finding, and the PACE ranking that puts satellite *last* on reliability — read against
  the Starlink terminal already in the lesson. The 5–20 m triangulation figure and the
  "unofficial EW fields" finding are kept but now carry their `[DW]` / `[Combat Exp. RU]`
  attribution inline instead of floating free.
- **#9 `fiber-optic-immunity`** — retitled around the epistemic point. Now leads with
  independent convergence as the *test* for whether an adaptation is structural, and
  carries Ukrainian §3.4's concrete timeline (Russia fields ~Aug 2024 → Ukraine certifies
  ~40 domestic models by Apr 2025, ~6 months). Adds the machine-vision second route. Names
  the range disagreement with Western §3.4's "short-ranged" characterisation rather than
  smoothing it. Asset list unchanged (still the honest ground-robot substitution).
- **#10 `attrition-economics`** — prose untouched, as the audit recommended. Only the
  `maintenance` declaration dropped (§4 below).
- **#12 `deep-rear-is-reachable`** — the 80 km hub is dropped, as the audit recommended;
  the two power plants carry it. Text now states that no reference document mentions this
  operation at all and that the claim rests on `doctrine.md`'s bare `[web]` tag.

### Removed / merged (3)

- `drone-attrition-share` → recast as #11 `cost-asymmetry`. Same four assets, which
  genuinely demonstrate a cost asymmetry; the 60–70% attribution statistic moves into a
  `caution` field and into #15.
- `pattern-of-life-detection` → merged into #2. Its multi-day mechanism survives as one
  detection timescale inside a lesson that also carries the 15-minute emissions timescale
  the corpus actually documents.
- `drone-dense-corridor` → merged into #6. The corridor becomes the setting; the coupling
  becomes the lesson; both forward medical points carry across.

---

## 3. Gepard copy fix — and three more the brief didn't name

**Confirmed done.** `side_a-air-defense-cuas-gepard.contrast_vs_traditional` no longer
asserts the 60–70% figure as fact.

> **Before:** "…With 60–70% of equipment losses on this battlefield now attributed to
> drones rather than artillery or direct fire, a cost-effective gun-based counter-drone
> system matters more than…"
>
> **After:** "…Drones are now widely reported as the leading cause of equipment losses on
> both sides — the often-quoted 60–70% share is directional reporting rather than an
> audited figure, and the lessons-learned corpus this tool is built against explicitly
> cautions against reading well-filmed drone footage as a measurement of systemic
> effectiveness (see the 'Some of what you have learned about this war is selection effect'
> key lesson). What is not in doubt is the direction: against a threat arriving cheaply and
> in quantity, a cost-effective gun-based counter-drone system matters more than…"

**Three more assets carried the same unhedged claim.** The brief named only Gepard; these
were found by `grep -rn "60–70" data/`, not by the brief, and are fixed in the same commit
on the reasoning that a claim the audit found CONTRADICTED should not be left standing
anywhere in asset copy:

| Asset | How it used the figure |
|---|---|
| `side_b-armor-t-62m-refurbished-reserve-stock` | "the clearest illustration of the doctrine.md figure that 60–70% of equipment losses… are now attributed to drones" |
| `side_a-armor-m113-apc` | "where the doctrine.md figure puts 60–70% of equipment losses on drones rather than direct fire" |
| `side_b-air-defense-short-pantsir` | "the mass cheap-drone threat that now accounts for 60–70% of equipment losses" |

All three now state the direction as widely-reported and the precision as unaudited, and
point at the `visibility-bias` lesson. This is the same shape as Pass 21's finding — one
named bug plus several more of identical form found by checking rather than assuming.

**Residual mentions of "60–70%" in `data/` after the fix** (verified by grep) are only:
the four hedged asset sentences above, `cost-asymmetry`'s `caution` field, its
`corpus_support` note, and `visibility-bias`'s worked example. No unhedged assertion
remains.

---

## 4. Connection-type reconciliation

The audit's §2.1 found six lessons declaring a `connection_types` value that no edge
between their own assets carried. **All six are resolved, and none required inventing an
edge** — a better outcome than the brief's "add the edge or drop the type" framing
anticipated, and worth flagging since it means no graph content was fabricated to make a
lesson's chips light up.

| Lesson (before → after) | Declared | Was backed | Resolution | Now backed |
|---|---|---|---|---|
| `kill-chain-compression` | `data_c2`, `fires_support` | `data_c2` only | **Added assets.** `side_a-artillery-position-firing` and `side_a-artillery-2s22-bohdana` already carry a `fires_support` edge between them; naming both in the lesson makes the declared type real. Also the artillery swap §7.2 required anyway. | both ✓ (3 edges) |
| `pattern-of-life-detection` | `data_c2` | none (0 edges) | **Merged away** into `detectability-not-distance`, whose set includes both command posts and both comms terminals — two real `data_c2` edges. | ✓ (2 edges) |
| `ew-invisible-battlefield` | `data_c2` | none (0 edges) | **Added asset.** `side_a-uav-reconnaissance-tactical` brings two real edges (M777→recon, recon→Starlink) and is thematically the drone whose link the jammers attack. | ✓ (2 edges) |
| `distributed-kill-chains` | `data_c2`, `fires_support` | `data_c2` only | **Dropped `fires_support`** — see reasoning below. | `data_c2` ✓ (3 edges) |
| `attrition-economics` | `supply`, `maintenance` | `supply` only | **Dropped `maintenance`** — see reasoning below. | `supply` ✓ (1 edge) |
| `drone-dense-corridor` | `supply`, `casevac` | none (0 edges) | **Merged away** into `logistics-is-counter-uas`, whose set includes both ammo points feeding UGVs (`supply`) and both forward medical points feeding their casevac chains (`casevac`). | both ✓ (4 edges) |

**Why the two drops are drops rather than added edges** — in both cases the declared type
was *conceptually wrong for the lesson*, not merely unbacked, so adding an edge would have
made the data consistent and the teaching worse:

- `distributed-kill-chains` declares that a squad no longer calls for fire from above — it
  finds, decides and strikes itself. `fires_support` is defined in `src/types.ts:34` as
  "calls for fire, target handoff." Declaring it on this lesson contradicts the lesson's
  own thesis. The available edge (`side_b-infantry-dismounted-squad --fires_support→
  side_b-air-defense-tor-m2`) would also have dragged an air-defence system into a
  squad-level ground kill chain to satisfy a chip.
- `attrition-economics` is about consumption. Its one strike asset is a Lancet — a
  loitering munition, expended on use. A `maintenance` edge would assert that it comes back
  for repair, which is false. `supply` alone is the correct and now-backed claim.

**Independent re-verification** (grep/parse of the files on disk, not a read of the diff —
same standard as the audit's own citation check): a script re-derives the edge set from
scratch by walking all 103 `data/assets/*.json` `connections` blocks plus every row in
`data/connections.json`, then checks each lesson's declared types against edges whose
*both* endpoints are in that lesson's own `asset_ids`.

```
lessons with unbacked declared connection types: 0   (was 6 before Pass 23)
all 15 lesson asset_ids resolve to real assets:   yes
orders 1..15 contiguous, ids unique:              yes
```

### Bonus, not requested: `connections.json` drift closed

Not asked for by the brief. Done because the file was being edited anyway and its own
`_comment` mandates sync with the per-asset arrays. Pass 18's positional/human assets
carried **12 connections on their asset files that were never mirrored into
`connections.json`**, which `loadWorld()` flagged as info-level drift on every single load.
Regenerated as the exact union (34 → 46 rows). Flagged here as a deviation from the literal
brief per this repo's standing convention.

Measured effect, before → after, on the Data Health page of a real running build:

| | Before | After |
|---|---|---|
| Total issues | 57 | **45** |
| Errors | 0 | **0** |
| Warnings | 3 (pre-existing "no `sources`" on three assets) | **3** |
| Info | 54 | **42** |
| Connection-drift mentions | 24 | **0** |

---

## 5. The `contested` flag decision — and `corpus_support`

**Checked first, as the brief asked: nothing currently reads or renders either field.**
`grep -rn "contested\|corpus_support" src/` returns no consumer.
`src/pages/LessonsPage.tsx` renders `doctrine_ref`, `source_tag`, `connection_types` and
`asset_ids` only. `src/data/model.ts`'s `Lesson` interface declares neither.

**What was written, since the brief says not to skip the flag:**

- `corpus_support` — a short string on **all 15** lessons. On all fifteen rather than only
  the single-source one, because the distinction is only legible by contrast: labelling
  `ammunition-standardisation` "SINGLE-SOURCE" means nothing unless the neighbouring
  lessons say "CONVERGENT-3." This is what carries brief item 4 — #13 now ships visibly
  as *"SINGLE-SOURCE (Western §3.5) — and structurally so, not by oversight: a
  single-nation producer has no coalition standardisation problem, so this finding cannot
  be convergent by construction"*, and #12 ships visibly as `UNSUPPORTED`.
- `contested: true` + a `caution` string on exactly the four the audit named:
  `lower-sky-control`, `counter-uas-integration`, `cost-asymmetry`, `visibility-bias`.

**Stated plainly, as the brief requires: UI treatment is future work.** Nothing displays
any of this yet. No UI was built for it in this pass, per the brief. Two consequences a
reviewer should know:

1. The fields are inert. A reader of the live Key Lessons page today sees fifteen lessons
   presented at identical visual confidence — the `UNSUPPORTED` one looks exactly like the
   `CONVERGENT-3` ones. The data distinction exists and is committed; the *communication*
   of it does not.
2. **`src/data/model.ts`'s `Lesson` interface was deliberately not extended**, because the
   brief put `src/` out of scope. The build passes anyway — verified empirically, not
   assumed: the loader's `as Lesson[]` cast tolerates extra JSON properties. But a
   TypeScript consumer cannot reach `lesson.corpus_support` until three lines are added to
   that interface. That is the natural first step of the UI work and is logged in
   `docs/BACKLOG.md` under "Open after Pass 23," along with a note that `visibility-bias`
   is a *different kind* of entry (a caution on the whole set, naming `cost-asymmetry` as
   its worked example) and currently renders as merely the last item in a flat list.

---

## 6. Verification

**`npm run build`** — passes, on both the working branch and the merged deploy branch.
Main bundle 815.87 kB → 848.06 kB (the added lesson prose is baked in). No new warnings
beyond the pre-existing chunk-size notice.

**Real app, not just the build** — per `CLAUDE.md`'s standing rule that a green build is
not evidence, driven headless against `npm run preview` (Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, swiftshader):

```
lesson cards rendered:                              15
all 15 titles render in order 01..15:               yes
total resolved asset buttons across all lessons:    77
lessons with zero resolved assets:                  none
page errors / failed requests:                      none
Data Health: 45 issues — 0 error, 3 warning, 42 info
```

77 resolved asset buttons matters specifically: `LessonsPage` resolves `asset_ids` through
`world.assetsById` and silently drops misses, so a typo in an id would show as a missing
button rather than an error. Every one of the 77 ids across the 15 lessons resolves.

**§7.2 mapping fixes — each asserted individually against the committed file:**

| Fix | Result |
|---|---|
| Five UGVs into `logistics-is-counter-uas` (`nprk-mul`, `kurier`, `omich-2`, `nrtk-ratel-s`, `varan`) | all 5 present ✓ |
| Two observation posts into `detectability-not-distance` | both present ✓ |
| …replacing `side_a-space-isr-satellite-commercial` | absent ✓ |
| Three responsive guns into `kill-chain-compression` (M777, Bohdana, Caesar) | all 3 present ✓ |
| …replacing `side_a-artillery-himars-m142` | absent ✓ |
| Counter-UAS hardware into `counter-uas-integration` (Gepard, Bukovel, Stinger, IADS node, Pantsir, Tor-M2) | all 6 present ✓ |
| 80 km hub dropped from `deep-rear-is-reachable` | absent ✓ |

---

## 7. Out-of-scope items — confirmed logged, not built

`LESSON_AUDIT.md` §7.1's roster gaps are **Pass 25's** job (the model-kit pass, renumbered
from the earlier draft). Nothing was built. Two were already in `docs/BACKLOG.md` from Pass
21; the other seven were not, and have been added under "Roster gaps the approved lesson
set needs":

| Gap | Priority | Was already logged? |
|---|---|---|
| Wired / fibre-optic FPV strike drone | Highest | ✓ Pass 21 |
| Strategic-rear logistics hub (200+ km) | Medium | ✓ Pass 21 |
| Interceptor drone (hard-kill counter-UAS) | High | **added** (only glancingly present before, inside an older EW-breadth entry) |
| Decoy / EM-signature-management set | High | **added** |
| Counter-UAS battle-management node | High | **added** |
| Learning / adaptation institution | Medium | **added** |
| Dispersed sustainment task force | Medium | **added** |
| Mixed-standard ammunition point | Low | **added** (flagged as possibly a content-field task, not a new asset) |
| Guided-munition entity (Excalibur/GMLRS) | Low | **added** (flagged as possibly belonging in `data/catalog/`) |

`docs/PLANNING.md` sequencing updated per `PASS22_HANDOFF.md` §4: Passes 22 and 23 recorded
as done with a note on the Pass 22 wrong-document correction, Pass 25 named as next with
its input pointed at `BACKLOG.md`, and the "paste-in order" line updated.

---

## 8. Deviations from the literal brief

Per this repo's standing convention that deviations get flagged rather than silently taken:

1. **Fixed four assets' copy where the brief named one.** Three more assets carried the
   same unhedged 60–70% claim. Fixing only the named one would have left the contradicted
   claim standing in three places.
2. **Regenerated `connections.json`** to close 12 edges of pre-existing Pass 18 drift. Not
   requested; done because the file was open and its own comment mandates sync. Reduces
   Data Health issues 57 → 45 with no change to errors or warnings.
3. **Resolved all six connection-type mismatches without adding any edge**, where the brief
   framed the choice as "add the missing edge or drop the declared type." Four resolved by
   changing which assets a lesson names, two by dropping a conceptually-wrong declaration.
   No edge was invented to make a chip light up.
4. **`corpus_support` written on all 15 lessons**, where brief item 4 only required the
   distinction on `ammunition-standardisation`. A single-source label is only meaningful
   against labelled neighbours.
5. **`src/data/model.ts`'s `Lesson` interface deliberately left unextended**, honouring the
   `src/` scope line. The cost is that the three new fields are unreachable from TypeScript
   until three lines are added; flagged here and in `BACKLOG.md` rather than quietly taken.
