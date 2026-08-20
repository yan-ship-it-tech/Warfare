# Pass 22 — Key Lessons audit against the lessons-learned references

**Diagnostic pass. No application code, `src/` file, or rendering behaviour was changed.
`data/lessons.json` was not edited — every change below is a proposal awaiting approval.**

Branch: `claude/lessons-audit-convergence-cd1o1n`.
Prior-pass ancestry check, as required by §0 of the brief:

```
git merge-base --is-ancestor f622c3f origin/claude/warfare-digital-twin-scaffold-19u7kt   # exit 0
git merge-base --is-ancestor f622c3f HEAD                                                 # exit 0
```

**Exit code 0 in both cases.** The working branch contains Pass 21
(`f622c3f78b55a7ee0b470bb1402c39af8bfa48f1`) and every pass before it. Local `HEAD` is
`404230f` ("Deploy confirmation: Pass 21 merged to deploy branch, live"), one commit ahead of
Pass 21 and descended from it.

---

## 0. Correction — the Ukrainian reference was replaced after this report first shipped

**This report originally scored the corpus against a wrong document.** The Ukrainian-side input
first supplied was, on inspection, a source catalog rather than a finished synthesis (original
§1.2, preserved below in §1.2 for the record) — no cross-cutting-lessons section, structured around
*what Ukrainian material exists* rather than *what it says*. The user has since confirmed this was
a mistake on their end and supplied the correct file: a genuine synthesis, same method and the same
§3.1–§3.7 cross-cutting-lessons structure as its Russian and Western companions, explicitly written
as a third pass specifically to fix the first draft's catalog problem (its own §1: *"It replaces two
earlier passes: a first draft that was a source catalog rather than a synthesis, and a second draft
that synthesized but organized itself around Ukraine's institutional process for learning rather
than around what Ukraine actually learned about fighting."*).

**This changes real conclusions, not just sourcing hygiene.** Re-running the convergence check
against the corrected three-document corpus:

| Finding | Was | Now | Why |
|---|---|---|---|
| `ew-invisible-battlefield` (lesson 5) | CONVERGENT-2, `UKRAINIAN-SIDE PARTIAL` | **CONVERGENT-3** | Ukrainian §3.4's EW-arms-race findings and §3.2's PACE/analog-fallback design baseline are independent, substantive matches — see §3.5 below |
| `fiber-optic-immunity` (lesson 6) | CONVERGENT-2, `UKRAINIAN-SIDE UNVERIFIED` | **CONVERGENT-3**, and materially strengthened | Ukrainian §3.4 supplies the piece the lesson was missing — a concrete ~6-month replication timeline and Ukraine's own domestic fiber-optic certification program — see §3.6 below |
| Missing lesson 4.2, detectability-not-distance | CONVERGENT-2 | **CONVERGENT-3** | Ukrainian §3.2 states, in its own words, that its C2-dispersal finding is *"the same conclusion the Western-side document reaches... independently arrived at from a different Ukrainian source line"* — a document naming its own convergence with a companion is about as strong as evidence gets |
| Missing lesson 4.4, logistics-is-counter-uas | CONVERGENT-2 | **CONVERGENT-3** | Ukrainian §3.3 explicitly parallels Russian §3.3's finding, and Western §3.3 already independently matched it |
| Missing lesson 4.6, counter-uas-integration | CONVERGENT-2 | **CONVERGENT-3** | Ukrainian §3.5 calls this itself *"one of the stronger three-document convergences in the whole corpus"* and Russian §4 independently names the same gap |
| §4.9(a), training-flow reversal (JATEC / DELTA-into-NATO) | Reported as CONVERGENT-2, Ukrainian-side load-bearing | **Downgraded to Western-only, SINGLE-SOURCE** | The genuine Ukrainian synthesis contains no mention of JATEC, DELTA, or training exported into NATO exercises — that content came from the wrong document and does not survive the correction |
| §4.9(b), adaptation-cycle-is-the-capability | CONVERGENT-2, Ukrainian-primary | **Unchanged, better sourced** | The real document's §3.6 makes the same point more precisely, with its own explicit caveat about self-reported figures |

The net effect: **the corpus is stronger, not weaker, than the original report assumed** — five
findings move to genuine three-document convergence, the strongest evidentiary category this audit
uses. One claim (§4.9a) had to be walked back because it depended entirely on the wrong document. No
other section's substance changed; §1.1's roster-count and `docs/references/` findings still hold,
and every lesson not listed above (`kill-chain-compression`, `drone-attrition-share`,
`lower-sky-control`, `pattern-of-life-detection`, `distributed-kill-chains`,
`deep-rear-is-reachable`, `attrition-economics`, `drone-dense-corridor`, and missing-lesson
candidates 4.1, 4.3, 4.7, 4.8) was re-checked against the real Ukrainian document and its verdict
did not move.

The corrected updates are made in place throughout the sections below, each marked
**`[CORRECTED]`** at the point of change. §1.2 is left as originally written, retitled to make clear
it now describes a **superseded** document — the wrong-document finding is real project history
(it is exactly the failure mode the brief's own §2 anticipated and asked this audit to catch), and
erasing it would hide that the substitution happened and why.

---

## 1. Corpus statement

### 1.1 Where the documents actually were

The brief says four documents "are being placed in the repo" in `docs/references/`. At the time
this audit was first run, **that directory did not exist on the branch.** All four arrived as
session attachments instead. **`[CORRECTED]`** — `docs/references/` has since been created and now
holds the three lessons-learned references (Russian, Western, and the corrected Ukrainian
document); `docs/doctrine.md` already existed in the repo and needed no action. Filenames as
committed:

| Committed filename | Role in this audit |
|---|---|
| `docs/references/Russian-Side_Lessons_Learned_Reference.md` | Convergence corpus, leg 1 |
| `docs/references/Western-Side_Lessons_Learned_Reference.md` | Convergence corpus, leg 2 |
| `docs/references/Ukrainian-Side_Lessons_Learned_Reference.md` | Convergence corpus, leg 3 — genuine synthesis as of the §0 correction; **see §1.2** for the superseded first attempt |
| `docs/doctrine.md` (pre-existing) | **Not** scored. Read for asset-mapping context per brief §2. |

Citations below use `Russian §x.y`, `Western §x.y`, `Ukrainian §x`. Every one is accompanied by
the quoted sentence it rests on, per brief §7.

### 1.2 [SUPERSEDED — see §0] The first Ukrainian document supplied was a source catalog, not a finished synthesis

**This subsection describes the document that was replaced. It no longer describes the corpus this
audit scores against — see §0 for the correction and its effects.** Left in place because it is
real project history: this is exactly the "catalog masquerading as synthesis" failure mode brief §2
asked this audit to catch, and this audit did catch it correctly at the time. It was superseded by
user correction, not by a flaw in the check.

The first Ukrainian document supplied was *titled* "Ukrainian-Side Lessons-Learned Reference" and
was not named `Ukrainian_Side_Source_Catalog.md`, so it did not trip the brief's filename test. But
the brief's test was on substance ("a *sourcing catalog* mapping what primary Ukrainian material
exists, not a finished synthesis"), and on substance **that document was a sourcing catalog.** The
evidence, as found at the time:

- **It had no cross-cutting-lessons section at all.** The Russian document's §3 is
  "Cross-cutting lessons" (3.1–3.6); the Western document's §3 is "Cross-cutting lessons"
  (3.1–3.7). That Ukrainian document's sections were: §1 "The anchor find: Ukraine's own doctrine on
  how it captures lessons", §2 journals, §3 field manuals, §4 defense-tech ecosystem, §5 think
  tanks, §6 senior officers, §7 how it fits with existing material, §8 translation notes. There was
  no equivalent §3 to score against.
- **It said so itself.** Its §0: *"This document tries to do for Ukraine what the Russian-side
  document did for Russia: **prioritize documents Ukraine produces about itself** — General Staff
  doctrine, service academy journals, unit-facing manuals, state defense-tech institutions,
  Ukrainian think tanks, and on-the-record senior officers — over Western analysts' summaries of
  Ukrainian practice."* That is a description of source selection, not of findings.
- Its §7 positioned itself explicitly as one level up from content: *"This document doesn't attempt
  to close that list — it operates one level up, at the institutional/doctrinal/ecosystem level."*
- Its own §0 recorded that it was written **without** the other two references in hand: *"you
  mentioned attaching both existing references, but nothing came through on my end this time... I
  haven't been able to check this new document against either existing file line-by-line."* So it
  was never cross-checked against the corpus it was supposed to be the third leg of.

The real document that replaced it says the same thing about its own predecessor, from the
publisher's side: its own §1 describes replacing *"a first draft that was a source catalog rather
than a synthesis, and a second draft that synthesized but organized itself around Ukraine's
institutional process for learning rather than around what Ukraine actually learned about
fighting."* The catalog audited here was that first draft.

### 1.3 Known limitations carried forward from the sources themselves

Per brief §2, three self-declared gaps in the inputs, stated here rather than buried:

1. **`doctrine.md` is light on Russian soldier-level material.** Its own closing note: *"the
   'Recommendations for Participants of the SMO' booklet (Russian side, soldier-level
   survival/tactics guide) — its text layer is unreadable (Type 3 font, no character mapping) and
   needs OCR... it's currently light on direct Russian-side soldier-level material compared to the
   operational/report-level detail above."*
2. **The Ukrainian corpus's clearest hole is a unit-published TTP compendium.** Ukrainian §3:
   *"a genuine wartime, brigade-published TTP compendium equivalent in kind to the TDF command-post
   manual CALL translated for the Western-side document... did not surface in this pass. This is the
   clearest gap against your brief."* So the Ukrainian leg is missing exactly the practitioner tier
   that gives the Russian leg its weight.
3. **The Russian document's own source table is internally inconsistent.** Its subtitle says
   *"Synthesized from six primary sources"* but its §2 table lists seven rows (#7, *How Russia
   Fights*, is a U.S. Army product). Not a substantive problem — the document flags #7's status
   openly (*"Source 7 is the odd one out — a U.S. Army analytical product, not Russian-authored"*)
   — but it means citations to "Russian §3.x" backed only by source 7 are Western-authored evidence
   sitting inside the Russian-side document. Flagged inline where it matters.

### 1.4 Roster count correction

Brief §5.7 refers to "the 107-asset roster." The actual count is **103**:
`ls data/assets/*.json | wc -l` → `103`, matching `docs/BACKLOG.md`'s own Pass 18 entry ("all 103
assets (89 shipped + 14 new)"). §7 below is written against 103.

---

## 2. Per-lesson findings table

Convergence scores are stated for the lesson **as written**. Where a lesson bundles a
well-supported mechanism with an unsupported number, both are scored — collapsing them to one
label would hide the finding.

**`[CORRECTED]`** — the `UKRAINIAN-SIDE` flag in every row below now reflects a check against the
real, corrected Ukrainian document (§0), not the superseded catalog. Two rows (5, 6) moved to
`CONVERGENT-3`; the rest were re-checked and kept their original score — the flag wording changes
from "UNVERIFIED" (couldn't be checked) to "no match found" (was checked, nothing there) where that
is the honest state.

| # | ID | Current title | Convergence | Key citations | Wording verdict | Asset-mapping verdict |
|---|---|---|---|---|---|---|
| 1 | `kill-chain-compression` | The kill chain collapsed from hours to minutes | **Mechanism: CONVERGENT-2** / **Headline timing figure: UNSUPPORTED** · Ukrainian §3.1 checked, no timing/fusion match | Russian §3.1; Western §3.1, §3.7 | **Overstates** — the corpus supports fusion, not the clock | **Weak** — HIMARS is the wrong artillery; declares a `fires_support` edge that does not exist |
| 2 | `drone-attrition-share` | Drones cause 60–70% of equipment losses | **CONTRADICTED** · Ukrainian document checked, no match | Western §3.6, §2 reading notes; Russian §2 reading notes | **Distorts** — states as flat fact the exact claim class the corpus warns against | **Illustrative only** — a cost-tile pair cannot demonstrate an attribution statistic |
| 3 | `lower-sky-control` | Control of the lower sky sets how close you can stand | **Principle: CONVERGENT-2** / **the 1–1.5 km vs 7 km figures: SINGLE-SOURCE** · `UKRAINIAN-SIDE PARTIAL` | Western §3.2; Ukrainian §2 (Zaluzhnyi, source 7) | **Overstates confidence** in unreplicated numbers | **Broken demonstration** — neither tank sits at either quoted depth |
| 4 | `pattern-of-life-detection` | Detection is a multi-day pattern, not an event | **Multi-day mechanism: UNSUPPORTED** / **defensive consequence: CONVERGENT-2** · Ukrainian §3.2 checked — supports the *replacement* lesson (§4.2), not this one as worded | Western §3.2; Russian §4 (soldiers) | **Understates** — omits the corpus's sharper, minutes-scale emissions finding | **Weak** — satellite is the wrong mechanism; zero internal edges despite declaring `data_c2` |
| 5 | `ew-invisible-battlefield` | EW is the invisible battlefield everything else depends on | **`[CORRECTED]` CONVERGENT-3** (was CONVERGENT-2) | Russian §3.4, §3.5; Western §3.4; Ukrainian §3.2, §3.4 | **Mostly sound**; one unreplicated number (5–20 m) | **Incomplete** — the corpus's sharpest EW datapoint (guided artillery degradation) has no asset here; zero internal edges |
| 6 | `fiber-optic-immunity` | Fibre-optic control links took jamming off the table | **`[CORRECTED]` CONVERGENT-3** (was CONVERGENT-2), and now the best-evidenced lesson in the set | Russian §3.4; Western §3.4; Ukrainian §3.4 | **Misses the actual finding** — the refs say the *convergence itself, and its speed,* is the signal; the lesson says it's a trade-off | **Known gap, honestly flagged** (Pass 21); one range tension to resolve |
| 7 | `distributed-kill-chains` | Kill chains pushed down to squad level | **CONVERGENT-2** · `UKRAINIAN-SIDE PARTIAL` | Russian §3.2; Western §4 (soldiers); Ukrainian §2 (Syrskyi, source 8) | **Overstates** — drops the friction half both refs insist on | **Incoherent** — mixes two sides' assets into one kill chain; declared `fires_support` edge absent |
| 8 | `deep-rear-is-reachable` | The deep rear stopped being a sanctuary | **UNSUPPORTED** · Ukrainian document checked, no match | none in corpus | **Sound in itself**, but rests on `doctrine.md`'s weakest tag (bare `[web]`) | **Known gap, honestly flagged** (Pass 21) — 80 km hub standing in for 200+ km |
| 9 | `attrition-economics` | Consumption rates, not inventories, decide sustainment | **CONVERGENT-2** · **Ukrainian leg genuinely load-bearing** | Russian §4 (policymakers); Ukrainian §3.6 | **Clean — best-worded lesson in the set** | **Mostly sound**; declares a `maintenance` edge that does not exist |
| 10 | `drone-dense-corridor` | A ~30 km drone-dense corridor either side of the line | **Consequence: CONVERGENT-2** / **the 30 km figure: UNSUPPORTED** · Ukrainian §3.3 checked — supports the *merge target* (§4.4), not the literal 30 km figure | Russian §3.3; Western §3.2 | **Sound on consequence**, unreplicated on the number | **Clearest miss in the audit** — the corpus's named adaptation (UGV resupply/casevac) is absent though 5 such assets exist |

### 2.1 A structural finding that cuts across the table: half the lessons promise edges the map cannot draw

Independently of content, I checked each lesson's declared `connection_types` against the edges
that actually exist **between that lesson's own assets** (union of per-asset `connections` blocks
and `data/connections.json`):

| Lesson | Declares | Edges actually present among its assets |
|---|---|---|
| `kill-chain-compression` | `data_c2`, `fires_support` | `data_c2` only (6 edges) — **no `fires_support`** |
| `pattern-of-life-detection` | `data_c2` | **none (0 edges)** |
| `ew-invisible-battlefield` | `data_c2` | **none (0 edges)** |
| `distributed-kill-chains` | `data_c2`, `fires_support` | `data_c2` only (2 edges) — **no `fires_support`** |
| `attrition-economics` | `supply`, `maintenance` | `supply` only (2 edges) — **no `maintenance`** |
| `drone-dense-corridor` | `supply`, `casevac` | **none (0 edges)** |

`fires_support` is a real type (`src/types.ts:34`) but exists on only four assets in the entire
roster — the two `artillery-position-firing` assets and the two `infantry-dismounted-squad`
assets — **none of which appears in either lesson that declares it.** Six of ten lessons declare at
least one connection type with no backing edge. This is a data-integrity finding, cheap to fix, and
independent of whether the lessons themselves are right.

---

## 3. Detailed notes per lesson

### 3.1 `kill-chain-compression` — mechanism CONVERGENT-2, headline number UNSUPPORTED

**What the corpus supports.** The *fusion* of reconnaissance and fires is squarely convergent.

- Russian §3.1: *"The Troika Compendium (source 7) independently confirms this from the U.S. Army
  side: Russian 'Fires' and 'Intelligence' functions have become inseparable from UAV
  reconnaissance-strike integration, to the point that the traditional warfighting-function
  boundaries in U.S. doctrine don't map cleanly onto how Russian units now operate."*
  *(Caveat per §1.3: this particular sentence rests on the U.S. Army source inside the Russian
  document, not on Russian-authored material.)*
- Western §3.7: *"precision-guided fires, reduced importance of force mass, asymmetric/cyber
  methods, information technology as a decisive factor, and robotic systems are treated as a single
  interconnected shift rather than separate domain stories."*

**What the corpus does not support: the clock.** No sentence in any of the three references states
a kill-chain timing figure — not "hours to minutes," not "under a minute," not "30+ minutes."
Every timing claim in this lesson traces to `doctrine.md` §1, which is explicitly excluded from
convergence scoring by brief §2. Side by side:

> **`lessons.json`:** "Find, decide and strike used to take hours through a chain of people. It is
> now routinely single-digit minutes."

> **Corpus:** *(no counterpart sentence in Russian, Western, or Ukrainian.)*

The lesson's headline — the part a reader remembers — is the part with no corpus support.

**Wording verdict: overstates.** The word "routinely" is doing unearned work. The lesson's own
closing caveat is good and should be kept, but it currently reads as a footnote to a confident
headline rather than as a constraint on it.

**Asset-mapping verdict: weak, for two separate reasons.**

1. **HIMARS is the wrong artillery for this claim.** The lesson text says "artillery responds in
   under a minute once a firing solution exists." HIMARS (`side_a-artillery-himars-m142`, 25 km,
   category `artillery-rocket-deep-strike`) is an interdiction system against pre-planned
   high-value targets with its own targeting chain — it is not the responsive call-for-fire
   system the sentence describes. `side_a-artillery-m777` (12 km) already in the lesson is the
   right one; `side_a-artillery-2s22-bohdana` (13.6 km) or `side_a-artillery-caesar-155mm-self-
   propelled-gun` (14.4 km) would be better still, being shoot-and-scoot systems whose whole
   design premise is response time.
2. **The declared `fires_support` edge does not exist** (§2.1). The one asset class that carries
   `fires_support` edges — `side_a-artillery-position-firing` (8 km) — is not in the lesson,
   despite being the literal firing position the recon drone is cueing.

---

### 3.2 `drone-attrition-share` — CONTRADICTED

This is the audit's sharpest negative finding, and I want to be unambiguous about it: **the corpus
does not merely fail to support this lesson, it contains an explicit methodological warning
against exactly this class of claim, and the lesson is a textbook instance of what the warning
describes.**

- Western §3.6: *"The Australian Army Research Centre's explicit 'visibility bias' warning — that
  viral, well-filmed drone strikes generate outsized claims of systemic effectiveness relative to
  the much larger number of undocumented failures — is a training-design lesson in its own right:
  curricula built primarily from social-media footage will be skewed toward exceptional cases."*
- Western §2 reading notes: *"Source 8 is included specifically for its self-critical methodology:
  the AARC project explicitly warns that dramatic, well-filmed drone engagements get generalized
  into claims of systemic effectiveness ('visibility bias'), a caution worth applying to all
  sources in this corpus, including this one."*
- Russian §2 reading notes: *"Sources 1–2 and 6 are practitioner testimony — rich in detail but
  reflect individual experience and morale-building intent; treat specific numbers as illustrative,
  not statistical."*

A single hard percentage for "share of equipment losses attributed to drones" across a
1,200 km front, on both sides, over four years, is precisely a claim of systemic effectiveness. Its
denominator — total equipment losses, including undocumented ones — is the quantity the AARC says
is systematically under-observed. The figure may well be directionally right; the corpus's position
is that a number of this shape cannot be known to the precision the lesson asserts.

**Wording verdict: distorts.** Compare:

> **`lessons.json` title:** "Drones cause 60–70% of equipment losses"
> **`lessons.json` summary:** "Not artillery, not direct fire."

> **Western §3.6:** *"viral, well-filmed drone strikes generate outsized claims of systemic
> effectiveness relative to the much larger number of undocumented failures."*

The lesson carries no hedge of any kind. Note that `side_a-air-defense-cuas-gepard`'s own
`contrast_vs_traditional` field repeats the same unhedged figure ("With 60–70% of equipment losses
on this battlefield now attributed to drones..."), so the claim is load-bearing in asset copy too,
not only in the lesson.

**Asset-mapping verdict: illustrative only, and the lesson already knows it.** Its own text says
"it's a cost-tile comparison, not a battle report," which is honest. But that honesty concedes the
point: no arrangement of four assets can demonstrate an attribution statistic. The assets
demonstrate a *cost asymmetry* — which is a real, separate, defensible lesson. The statistic is
riding on assets that illustrate something else.

**Recommendation (see §5 and §6):** do not delete the content. Recast it as a cost-asymmetry lesson
(which the assets genuinely demonstrate) and move the 60–70% figure into a contested/
lessons-not-to-learn treatment as the platform's own worked example of visibility bias. Using its
own lesson as the example is more credible than borrowing someone else's.

---

### 3.3 `lower-sky-control` — principle CONVERGENT-2, numbers SINGLE-SOURCE

**Supported principle.** That classical distance-based safety has stopped governing disposition is
convergent:

- Western §3.2: *"The consistent through-line across this and the RUSI series is that
  **detectability, not distance, is now the primary determinant of survivability** for command and
  control nodes."*
- **`[CORRECTED]`** Ukrainian §2 (source corpus table), on Zaluzhnyi's Nov 2023 essay:
  *"Air/EW/reserves/minefield levers (2023)."* Thinner than the withdrawn citation to the superseded
  document (§0), but it is the real document's own summary of the same essay and corroborates the
  same substance — air power and EW named as governing levers for breaking positional deadlock,
  alongside reserves and minefield-breaching. Still marked `UKRAINIAN-SIDE PARTIAL`: a source-table
  paraphrase, not a worked argument the way Western §3.2 is.

**Unsupported numbers.** The 1–1.5 km / ~7 km pair appears in no reference. It traces to
`doctrine.md` §2 (`[Combat Exp. RU, Report context ~line 4290]`) — i.e., to Markin's notebook,
which *is* source 1 of the Russian corpus, but the Russian-side reference document itself does not
carry this finding anywhere in §3. Per Russian §2's own instruction, Markin's numbers should be
treated as *"illustrative, not statistical."* The lesson calls them "the single sharpest finding in
the reference material" and quotes them as bare fact.

**A genuine tension worth surfacing rather than smoothing.** Western §3.2's framing and this
lesson's framing point in different directions on *what to do about it*: Western says survivability
is bought with emissions discipline, camouflage and deception; this lesson says depth is set by who
holds the lower sky. Both can be true, but the platform currently teaches only the second, which is
the one the corpus supports *less*. That asymmetry is the argument for the new lesson proposed in
§4.2.

**Asset-mapping verdict: the demonstration is broken.** The lesson says a tank should read the
depth consequence directly — "1–1.5 km from the line" versus "roughly 7 km." Actual placements:

| Asset | `distance_km_from_zero` |
|---|---|
| `side_a-armor-leopard2` | 2.6 |
| `side_b-armor-t72` | 4.4 |

Neither sits at either quoted depth, and the 1.8 km gap between them does not read as the
difference between holding and not holding the lower sky. A reader clicking this lesson sees two
tanks at broadly similar depth while the text asserts a 5× difference. Either the lesson should
stop promising a readable depth contrast, or the pair should be reconsidered against assets whose
placements actually bracket the claim (`side_a-ground-robots-krab-m1` at 1.5 km and
`side_b-air-defense-short-pantsir` at 7 km happen to bracket it exactly, though neither is a tank).
The Gepard/Pantsir pairing for the contest itself is sound.

---

### 3.4 `pattern-of-life-detection` — mechanism UNSUPPORTED, consequence CONVERGENT-2

**The multi-day mechanism is not in the corpus.** No reference describes following a returning
drone home, the carousel pattern, antenna-strike prioritisation, or a 2–7 day mapping timeline.
All of it traces to `doctrine.md` §3 (`[Combat Exp. RU, Appendix 9]`).

**The corpus's own detection finding is different, sharper, and faster — and the lesson omits it.**

- Western §3.2: *"Radio and Wi-Fi discipline is treated as a survival skill in its own right —
  high-power transmissions are understood to draw fire within roughly 15 minutes — and deception
  (decoy antennas, simulated vehicle parks, staged signs of habitation) is used deliberately to
  force the enemy to expend precision munitions on false positions."*

Fifteen minutes from emission to fire is a *different threat model* from a 2–7 day visual
pattern-of-life build-up, and it is the one with corpus support. The defensive consequence the
lesson does teach is convergent:

- Russian §4 (soldiers): *"Camouflage, movement, and light discipline (Ch. 1–4, Move, Shoot, Chat;
  countermeasures section, source 3) are now survival-critical skills, not secondary ones —
  multiple sources put drone detection ahead of small-arms proficiency in casualty-avoidance
  value."*

**Wording verdict: understates.** By teaching only the days-scale mechanism, the lesson leaves a
reader with the impression that they have days of margin. The corpus says a high-power transmission
buys about fifteen minutes.

**Asset-mapping verdict: weak.**
- `side_a-space-isr-satellite-commercial` (300 km, `space-isr`) is the wrong mechanism. Overhead
  revisit imagery is not "follow the drone home"; including it conflates two unrelated detection
  chains, and its 300 km placement means clicking the lesson flies the camera across the whole map
  for an asset that does not illustrate the stated method.
- The assets that *do* illustrate ground pattern-of-life observation are absent:
  `side_a-infantry-position-observation` (4 km) and `side_b-infantry-position-observation`
  (4.5 km) are literally the persistent-ground-observation layer.
- The emissions half of the corpus's finding has no representation here at all, though
  `side_b-ew-jammer-zhitel` (`ew-jamming`, 15 km) is an RF direction-finding asset.
- Zero internal edges despite declaring `data_c2` (§2.1).

---

### 3.5 `ew-invisible-battlefield` — **`[CORRECTED]`** CONVERGENT-3 (was CONVERGENT-2)

The best-supported of the currently-shipped lessons after `fiber-optic-immunity` — and, following
the §0 correction, a genuine three-document convergence rather than two-plus-a-thin-Zaluzhnyi-line.

- Russian §3.4: *"Fiber-optic-controlled FPV drones (immune to RF jamming) appear independently in
  the FPV tactics guide (source 3), the MADI curriculum (source 5, listed as a 'promising area'),
  and Markin's reports."*
- Russian §3.5: *"Move, Shoot, Chat and the National Guard manual both note that units often
  possess electronic countermeasure equipment without the trained personnel to maintain or employ
  it correctly, which the National Guard manual solves institutionally by designating non-staff
  UAV-countermeasure crews with dedicated training time."*
- Western §3.4: *"the NATO curriculum guide documents a concrete cost of unresolved GPS-denial:
  Excalibur 155mm GPS-guided rounds have suffered accuracy degradation from Russian EW jamming,
  forcing reliance on non-GPS-guided fires or renewed emphasis on jam-resistant guidance in
  follow-on procurement."*
- **`[CORRECTED]`** Ukrainian §3.4, from the real document: *"Underneath both approaches, the AFU
  UAV-crew manual (source 2) treats analog/mechanical fallback — dual GPS/GLONASS cross-checking,
  mandatory compass/sun/star navigation skill, a scripted lost-signal algorithm — as the **default**
  design baseline, not a contingency: Ukrainian doctrine assumes the primary electromagnetic system
  will be denied."* This is independent, substantive, and stronger than the Western Excalibur
  datapoint in one respect: it's not a single degraded munition, it's a design philosophy assuming
  EW denial as the normal case.
- **`[CORRECTED]`** Ukrainian §3.2 adds the PACE-discipline half: *"PACE comms planning explicitly
  ranks assets by reliability under contact rather than theoretical bandwidth — tactical radio →
  relay → satellite directional → satellite omnidirectional, with the highest-bandwidth option
  ranked last on purpose."* Directly relevant to this lesson's Starlink/Strelets pairing — the
  highest-bandwidth option in that pairing (satellite) is exactly the one Ukrainian doctrine ranks
  last for reliability under EW contact, a tension the lesson currently doesn't surface.

The original citation to "Ukrainian §6: Zaluzhnyi's five requirements include 'EW capacity'" came
from the wrong document and is withdrawn — the real document's Zaluzhnyi citation (its §2, source 7)
doesn't repeat that line-item list. The two Ukrainian citations above replace it and are stronger.

**Wording verdict: mostly sound, one unreplicated number.** "Passive RF triangulation (5–20 m
accuracy)" appears in no reference; it traces to `doctrine.md` §4 `[DW]`. It should carry its
source or be dropped — it is a precision claim about a capability, which is the kind of number that
should not float free.

The "unofficial EW fields" observation (units buying their own jammers and degrading friendly
drones) is `SINGLE-SOURCE` — `doctrine.md` §4 `[Combat Exp. RU]`, not carried in the Russian-side
reference. But it is *adjacent* to a supported finding (Russian §3.5's EW-literacy gap), so it
should be kept with attribution rather than removed.

**Asset-mapping verdict: incomplete in a specific, fixable way.** The corpus's single most
concrete EW datapoint is guided-artillery degradation, and this lesson contains no artillery.
`side_a-artillery-m777` (the Excalibur-firing platform) and `side_a-artillery-himars-m142`
(GPS-guided GMLRS) are both on the map. Adding one would let the lesson demonstrate the corpus's
best-evidenced EW consequence instead of asserting it. Zero internal edges despite declaring
`data_c2` (§2.1) — notable here because the Starlink/Strelets pairing is *specifically* about
dependency links, which is what a `data_c2` edge would draw.

---

### 3.6 `fiber-optic-immunity` — **`[CORRECTED]`** CONVERGENT-3 (was CONVERGENT-2), and the clearest case of a lesson missing its own point

All three references now carry this independently, and the Western and Russian documents both flag
the independence itself as the finding — a claim the corrected Ukrainian document turns out to make
*true* rather than merely *asserted*, by supplying the actual Ukrainian-side half of the story:

- Russian §3.4: *"This is a case where a single technical fix (a physical control line instead of
  radio) has forced a doctrinal response across multiple institutions simultaneously — **a useful
  marker of which adaptations are structural versus which are still improvised.**"*
- Western §3.4: *"fiber-optic-controlled FPV drones (immune to RF jamming but short-ranged) appear
  independently as an adaptation across Western, Ukrainian, and Russian sources, **which is a
  strong signal that this is a structural response to the EW environment rather than a one-sided
  innovation.**"*
- **`[CORRECTED]`** Ukrainian §3.4, from the real document, is the strongest single citation this
  audit has found for the "independent convergence" claim, because it supplies what the other two
  documents could only assert about Ukraine from outside: *"Russia fielded fiber-optic-controlled
  FPV drones first, in the Kursk region from around August 2024, specifically to defeat Ukrainian RF
  jamming. Ukraine's own Ministry of Defence began certifying domestic fiber-optic models within
  months — Brave1 ran its first fiber-optic test flights in late March 2025, and the Ministry had
  certified roughly 40 models by that April."* And its own stated implication: *"a single technical
  fix, adopted by one side under pressure, was replicated by the other side inside about six
  months, which is a useful marker for how fast a genuinely effective adaptation propagates across
  a contested front, regardless of who invents it."*
- **`[CORRECTED]`** The real document also documents a second Ukrainian EW-immunity approach the
  lesson doesn't currently mention at all: *"Ukraine has also been pursuing a second, distinct route
  to the same jamming-immunity goal — FPV drones guided by onboard machine vision rather than a
  physical tether — described in industry reporting as immature but active, alongside fiber optic
  rather than as a replacement for it."*

This upgrades the lesson from "two documents independently observe the same adaptation" to "all
three, one of them supplying the concrete replication timeline the other two only gestured at."
**~6 months from first Russian fielding to ~40 Ukrainian-certified models is now the single most
citable number in this lesson** — better sourced than anything else currently in it, and it should
replace or sit alongside the current capability-tradeoff framing.

**Wording verdict: misses the actual finding.** Side by side:

> **`lessons.json` summary:** "A spool of glass defeats the entire soft-kill EW layer, at the cost
> of manoeuvre."

> **Western §3.4:** *"...appear independently as an adaptation across Western, Ukrainian, and
> Russian sources, which is a strong signal that this is a structural response..."*

The lesson teaches a capability trade-off. The corpus teaches an epistemic method: *when both
sides independently reach the same fix, that is how you know the adaptation is structural rather
than fashionable.* That method is more valuable than the trade-off — it is a transferable tool a
reader can apply to the next adaptation — and it is currently absent from the platform entirely.

**One range tension to resolve, in the platform's favour.** Western §3.4 characterises fibre-optic
FPVs as *"short-ranged."* The lesson says the ruler carries "a radio-FPV envelope and a wider
fibre-optic one," and `data/doctrine_markers.json` backs that: `fpv-strike-envelope` 0–10 km versus
`fiber-fpv-envelope` 0–20 km, whose note reads *"Jam-proof tethered FPVs now field at ~20 km as a
practical working range on both sides (cable strength is the limit, not signal). Extended coils are
already fielded well beyond that — reported up to 50 km."* The marker is sourced to 2025–2026
reporting and is the later-vintage claim; the Western reference's "short-ranged" reads as a snapshot
the platform's own data supersedes. **The platform is probably right and the reference dated** — but
the lesson should not silently contradict a cited source. Name the disagreement.

**Asset-mapping verdict: known gap, honestly flagged.** Pass 21 already logged this
(`docs/BACKLOG.md`, "No wired-FPV strike drone asset"). Confirmed: grepping all 103 assets for
`fiber|fibre` returns exactly four files — `side_b-ground-robots-kurier`,
`side_a-ground-robots-nrtk-ironclad`, `side_a-c2-comms-starlink`,
`side_a-uav-reconnaissance-tactical` — and none is an FPV strike aircraft. The current substitution
is the best available and the lesson text says so. **This is the roster's single highest-value
content gap** (§7), because it is the only gap blocking the corpus's best-supported lesson.
**`[CORRECTED]`** — the real document's machine-vision-guided FPV finding (above) is a second,
independent reason a genuine FPV strike-drone asset would strengthen this lesson: a wired-FPV build
could carry both approaches (tether vs. onboard vision) as documented alternatives rather than
treating fibre-optic as the only fix.

---

### 3.7 `distributed-kill-chains` — CONVERGENT-2, but teaches only the optimistic half

**Well supported.**

- Russian §3.2: *"units are being forced into smaller teams, faster low-level decision-making, and
  more flexible logistics because massed formations are now visible and targetable almost
  immediately. Source 1/2 (Markin) corroborates from the ground level — assault groups have shrunk
  to 3–5 personnel, and 'strongpoints' have become dispersed two-man positions."*
- Western §4 (soldiers): *"most 2023 counteroffensive fighting occurred at brigade, battalion, and
  even company level rather than the division/corps level earlier doctrine assumed — small-unit
  leaders should expect to carry more independent decision authority than legacy training pipelines
  assume."*
- **`[CORRECTED]`** Ukrainian §3.7, on the Assault Troops branch: *"a distinct Assault Troops branch
  (created, per Syrskyi's own account, specifically because Assault Troops' rapid-response
  no-fixed-line role didn't fit inside Air Assault Troops' fixed-defense-line doctrine)."*
  Organizational rather than a direct statement about kill-chain authority, and thinner than the
  withdrawn citation to the superseded document — a new branch built for rapid, no-fixed-line
  response is adjacent evidence for decentralised authority, not a direct match. Still marked
  `UKRAINIAN-SIDE PARTIAL`.

**Wording verdict: overstates — this is the audit's second-largest wording finding.** Both
references pair the decentralisation finding with an insistence that it is *not going well*, and
the lesson drops that half entirely:

> **`lessons.json`:** "The authority to complete a kill chain has moved down rather than
> concentrating at higher HQ."

> **Russian §3.2:** *"Where the sources disagree is on how well this decentralization is actually
> working. Source 7 flags that Russian command culture is still 'highly centralized and rigid' by
> design (a matter of doctrine, not adaptation failure), creating friction with the small-unit
> independence that survival now requires. Markin's interviewees complain about the same tension
> from inside: bypassed chains of command, units hoarding drones instead of pooling reconnaissance,
> and incentive structures that reward video-friendly kills over units actually holding ground."*

> **Russian §3.2 implication:** *"the technology has changed faster than the command culture built
> to employ it. Training that teaches drone tactics without addressing delegation of authority to
> the team level is solving half the problem."*

The reference says teaching this without the friction is "solving half the problem." The lesson
currently teaches half the problem. The "units hoarding drones instead of pooling reconnaissance"
detail is particularly valuable and particularly absent — it is a counter-intuitive organisational
failure mode that a reader would not derive from the technology.

**Asset-mapping verdict: incoherent.** The asset set is
`side_a-uav-reconnaissance-tactical` (UA Leleka-100) → `side_b-uav-strike-lancet` (RU Lancet) →
`side_a-c2-position-command-post` (UA) → `side_b-c2-comms-strelets` (RU). **A squad-level kill
chain is by definition one side's loop**; this one crosses sides twice. A reader following the
arrows sees a Ukrainian drone cueing a Russian loitering munition. Pass 21 fixed the *inverse*
problem here (swapping the deep-rear IADS node for a tactical CP) and improved the lesson, but the
cross-side incoherence survived. Two coherent alternatives, both fully available in the roster:

- **side_a:** `side_a-infantry-dismounted-squad` (1.5 km — and it is one of only four assets that
  carries a real `fires_support` edge) + `side_a-uav-reconnaissance-tactical` +
  `side_a-uav-switchblade-300` + `side_a-c2-position-command-post`.
- **side_b:** `side_b-infantry-dismounted-squad` (1.6 km, also `fires_support`-connected) +
  `side_b-uav-reconnaissance-tactical` + `side_b-uav-strike-lancet` + `side_b-c2-comms-strelets`.

The side_b set is the better fit for the friction half, since Russian §3.2's command-culture
critique is specifically about Russian command culture. Showing both sides would let the lesson
carry the "decentralising unevenly" point structurally rather than only in prose.

---

### 3.8 `deep-rear-is-reachable` — UNSUPPORTED

**No support anywhere in the corpus.** None of the three references mentions Operation Spiderweb,
truck-smuggled FPV launch, or strategic-depth strike by short-range systems. The Western document
covers the industrial base (§3.5) and command-post depth (§3.2) but never the strategic rear as a
target set. The Russian document does not raise it. **`[CORRECTED]`** The Ukrainian document's
nearest adjacent content is its §3.7, on Zaluzhnyi's April 2025 essay: *"his description of naval
drones displacing surface-fleet functions"* — which is about displacement of platform classes, not
about depth ceasing to protect.

The lesson rests entirely on `doctrine.md` §2's bare `[web]` tag — the weakest sourcing tag in that
file, with no named outlet, unlike `[web: Small Wars Journal]` or `[web: US Army TDF lessons]`
elsewhere in the same document.

**I am not saying the lesson is wrong.** The 4,300 km figure and the operation are widely reported
and the platform's own `side_a-uav-strike-deep-crossborder` asset carries the framing in detail.
I am saying that **the audit's job is corpus support, and there is none**, and that a headline
lesson resting on an unnamed web citation should not present with the same confidence as
`fiber-optic-immunity`, which two independent institutional syntheses corroborate. If this lesson
is kept — and §6 recommends keeping it — it should say what it rests on.

**Wording verdict: internally sound.** The prose is careful and its self-caveat about the 80 km hub
is exactly the standard this repo asks for. The problem is provenance, not phrasing.

**Asset-mapping verdict: known gap, honestly flagged.** Pass 21 logged it. Confirmed: only two
`logistics-hub` assets exist on the entire map (`side_a-logistics-hub-op-deep` at 80 km,
`side_b-logistics-hub-op-near` at 18 km), and `data/connections.json`'s own `_note_unresolved_ids`
records `side_a-logistics-hub-strategic-rear` as a referenced-but-never-built stub. The two power
plants (220 km / 250 km) are the strongest assets in this lesson and carry it adequately on their
own; the 80 km hub adds a caveat the lesson then has to spend three lines explaining. Dropping it
until the strategic-rear hub exists would make the lesson *stronger*, not weaker.

---

### 3.9 `attrition-economics` — CONVERGENT-2, and the model for how the others should be written

**Supported.**

- Russian §4 (policymakers): *"Production-scale figures across sources (e.g., tens of thousands of
  FPV units per month cited in industry reporting around this corpus) indicate that procurement and
  industrial-base questions are now inseparable from tactical questions — a battlefield technology
  with a consumer-electronics supply chain changes acquisition timelines in ways traditional
  defense procurement cycles aren't built for."*
- **`[CORRECTED]`** Ukrainian §3.6 — **and this is one of the places the Ukrainian document is
  genuinely load-bearing**: *"Brave1's e-Points/marketplace system (source 4) converts battlefield
  performance directly into equipment allocation within weeks: units earn points for verified kills
  and re-spend them on whichever certified system is currently working, and manufacturers see
  unit-level performance data directly. This is functionally a lessons-learned process that skips
  the written report entirely and acts on the data."* (The previous version of this citation
  included a figure — "~800 certified manufacturers" — that does not appear in the corrected
  document; dropped rather than re-asserted.)

**Wording verdict: clean. The best-worded lesson in the set, and the only one with no finding
against its prose.** It states its figures and then immediately states their provenance and limit:
"Illustrative unit economics (a Lithuanian projection grounded in Ukrainian usage rates, not
Ukrainian actuals)." That is exactly the treatment `drone-attrition-share`'s 60–70%,
`lower-sky-control`'s 1–1.5 km/7 km, `pattern-of-life-detection`'s 2–7 days, and
`drone-dense-corridor`'s 30 km all need and none currently has. **If one sentence from this audit
survives into the rewrite brief, it should be: apply lesson 9's sourcing discipline to lessons 2,
3, 4 and 10.**

**Asset-mapping verdict: mostly sound.** The Lancet→`side_b-logistics-hub-op-near` supply chain is
real and is the point. One defect: the lesson declares a `maintenance` connection type and no
`maintenance` edge exists among its three assets (§2.1) — either add the edge or drop the
declaration.

---

### 3.10 `drone-dense-corridor` — consequence CONVERGENT-2, number UNSUPPORTED, and the audit's clearest asset-mapping miss

**The consequence is strongly supported.**

- Russian §3.3, in full, because it is the single most important sentence for this lesson:
  *"Source 7's 'Sustainment' chapter and Markin's reports independently describe the same shift:
  robotic ground platforms and 'heavy' drones are increasingly used for resupply and casualty
  evacuation specifically **because** manned logistics runs are now one of the highest-casualty
  activities on the battlefield. This is a genuinely new coupling — logistics risk is now largely a
  subset of counter-UAV risk, not a separate problem."*
- Western §3.2 corroborates the depth structure the lesson describes: *"Ukrainian doctrine places
  battalion command posts roughly 2–5 km from the front line (combat trains command posts further
  back, around 10 km)."*

**The 30 km figure is unsupported.** It appears in no reference; `doctrine.md` §2 tags it bare
`[web]`, and `data/doctrine_markers.json`'s `drone-dense-corridor` marker carries the same bare
`web` tag. It is the load-bearing number in the lesson's own title.

**Asset-mapping verdict: the clearest miss in this audit.** Russian §3.3's named adaptation —
the thing the sources actually say units *did* about this problem — is **robotic ground platforms
for resupply and casualty evacuation.** The lesson does not contain a single one, despite the
roster carrying five directly relevant assets:

| Asset | Category | km |
|---|---|---|
| `side_a-ground-robots-nprk-mul` | `ground-robot-logistics` | 3 |
| `side_b-ground-robots-kurier` | `ground-robot-logistics` | 2.6 |
| `side_b-ground-robots-omich-2` | `ground-robot-logistics` | 3.4 |
| `side_a-ground-robots-nrtk-ratel-s` | `ground-robot-multipurpose` | 3 |
| `side_b-ground-robots-varan` | `ground-robot-multipurpose` | 3 |

The lesson correctly identifies the problem (living inside the corridor is lethal for logistics and
casevac) and correctly picks the medical points to show the cost — and then omits the response the
corpus specifically documents. This is not a roster gap; it is a mapping gap, and it is free to fix.

Zero internal edges despite declaring `supply` and `casevac` (§2.1). Adding a UGV would likely fix
that too, since the `casevac` edges that exist run through the medical chain.

---

## 4. Missing lessons

Working in the opposite direction, per brief §4. I verified each of the brief's eight candidates
against the documents rather than accepting them; **two did not hold up as convergent** and are
reported as such below.

### 4.1 Drones are connective tissue across every warfighting function, not a subtopic — **CONVERGENT-3**

The only finding in this audit that honestly reaches three legs, and the most important thing the
platform does not teach.

- Russian §3.1: *"Every source, regardless of audience or authorship, treats UAV presence as the
  dominant fact of the battlefield rather than one input among many."* And its implication:
  *"any platform or curriculum still treating 'drones' as a subtopic under ISR or fires is
  organized around a battlefield that no longer exists. The sources converge on drones as
  connective tissue across every warfighting function."*
- Russian §3.6: *"Cheap UAVs now perform reconnaissance, precision strike, electronic warfare (via
  detection/jamming payloads), logistics, information/psychological operations (loudspeaker and
  leafleting drones), and even air-to-air intercept roles — one platform type crossing five
  traditional domain lines."*
- Western §3.7: *"this is worth noting because it means multi-domain integration is not a
  future-force aspiration in the current literature but a description of how both sides are already
  fighting."*
- **`[CORRECTED]`** Ukrainian §3.1, from the real document: *"Institutionally, Ukraine registered
  this by standing up the Unmanned Systems Forces as an independent branch in February 2024 and an
  Unmanned Air Defense Forces element inside the Air Force. But Ukraine's own peer-reviewed
  technical journals (source 5) were still publishing foundational-level papers on swarm-UAV C2
  effectiveness and Class-1 UAS tactical employment as recently as 2024–2026 — the doctrine and the
  science are still being written after units had already been fighting this way for two-plus
  years."* A state reorganising its order of battle around the drone layer, while its own academic
  literature is still catching up — the structural form of the same finding, and the real document
  states outright that the parallel to the other two references is deliberate: *"The same lag the
  Western-side document names for NATO (its 3.1) shows up inside Ukraine's own institutions, just
  running faster."* This is a real third leg, not a stretch — and better evidence than the withdrawn
  citation, because the document explicitly cross-references its own companions rather than being
  read as parallel from outside.

**Worth stating plainly: the Russian document's implication reads as a direct critique of this
platform's own information architecture.** The roster files drones as `uav-reconnaissance`,
`uav-strike`, `uav-strike-deep` — categories that sit alongside `artillery` and `armor` as peers,
i.e. exactly the "subtopic" organisation §3.1 says is obsolete. I am not recommending a taxonomy
change (out of scope, and the taxonomy has other jobs). I am recommending the platform **say this
out loud in a lesson**, which is cheap, honest, and turns the tension into teaching.

**Proposed statement** (my drafting, not a source quotation):

> Drones are not a category on this map — they are the layer every other category now runs through. One cheap airframe type does reconnaissance, precision strike, electronic warfare, resupply, casualty evacuation, psychological operations and air-to-air intercept. Every institutional source in this corpus, on every side, has stopped treating 'drone' as a subtopic under ISR or fires; two of them have reorganised their force structure around it. If you learn one thing from this map, learn that the drone layer is the connective tissue, and that the categories in the filter menu — including this map's own — are a legacy of a battlefield that no longer exists.

### 4.2 Detectability, not distance, determines survivability — **`[CORRECTED]` CONVERGENT-3** (was CONVERGENT-2)

- Western §3.2: *"The consistent through-line across this and the RUSI series is that
  **detectability, not distance, is now the primary determinant of survivability** for command and
  control nodes."* With the mechanism: *"prioritizes basements and underground positions
  specifically because they mask electromagnetic emissions as well as providing overhead
  protection, and treats visible administrative or civil-defense buildings as pre-plotted targets to
  be actively avoided... high-power transmissions are understood to draw fire within roughly 15
  minutes... deception (decoy antennas, simulated vehicle parks, staged signs of habitation) is used
  deliberately to force the enemy to expend precision munitions on false positions."*
- Russian §3.2: *"massed formations are now visible and targetable almost immediately."*
- **`[CORRECTED]`** Ukrainian §3.2, from the real document, is the strongest single citation in this
  entire audit for a claimed cross-document convergence, because the document names the convergence
  itself rather than leaving it for a reader to infer: *"a small HQ or a single UAV crew's C2 setup
  that works at small scale breaks down as scope grows. The AFU's UAV C2 software addresses this by
  splitting commander, operator, and administrator functions across separate workstations feeding a
  shared field server, rather than concentrating everything on one operator. PACE comms planning
  explicitly ranks assets by reliability under contact rather than theoretical bandwidth — tactical
  radio → relay → satellite directional → satellite omnidirectional, with the highest-bandwidth
  option ranked last on purpose... **This is the same conclusion the Western-side document reaches
  from the CALL/TDF manual (its 3.2, 'detectability, not distance'): independently arrived at from a
  different Ukrainian source line.**"* A document stating its own independent convergence with a
  named section of a companion document — this is the corrected document's own explicit
  cross-checking against its companions (its §0 says it applies "the same method as its companion
  volumes" and is built around "the same topic spine... so the three documents read as one
  comparable set") — is close to the strongest form of evidence this audit's method can produce.

**This lesson matters disproportionately for this platform specifically, because the platform's
entire X axis is distance.** A tool that renders the war as a depth ruler owes its users the
finding that depth is no longer the governing variable. Right now the map's organising metaphor is
unqualified by the corpus's most direct challenge to it. Adding this is the single highest-value
*intellectual* addition in this audit (4.1 is the highest-value factual one).

It also absorbs `pattern-of-life-detection` cleanly (§3.4): that lesson's multi-day mechanism
becomes one detection timescale inside a lesson that also carries the 15-minute emissions timescale
the corpus actually documents.

**Proposed statement** (my drafting, not a source quotation):

> This map is a distance ruler, and the strongest finding in the reference corpus is that distance is no longer what keeps you alive. Command posts survive on emissions discipline, terrain masking and deception, not on standoff: a high-power transmission draws fire in about fifteen minutes regardless of how far back it is sent from, and a visible administrative building is a pre-plotted target at any depth. Read every distance on this map as a starting condition, not as protection.

### 4.3 Command and sustainment are decentralising under the same pressure — and command culture is the friction — **CONVERGENT-2**

- Russian §3.2 (quoted in full at §3.7 above), including: *"the technology has changed faster than
  the command culture built to employ it."*
- Western §3.3: *"The 2026 US Army sustainment-doctrine source describes a shift toward smaller,
  dispersed logistics task forces that trade some efficiency for survivability against UAS,
  long-range fires, and EW — directly paralleling CSIS's 'disaggregate to survive, reaggregate when
  necessary' framing and, independently, Markin's ground-level observations on the Russian side."*
- **`[CORRECTED]`** Ukrainian §3.3, from the real document, is a direct, explicit match rather than
  adjacent evidence: *"units systematically underestimate the time needed to reset between missions
  — refuel, rearm, re-establish comms — and the documented fix is pre-staging fuel, ammunition, and
  comms equipment at the home base rather than simply 'planning tighter.' This parallels the
  Russian-side document's finding (its 3.3) that robotic ground platforms and resupply drones are
  absorbing logistics risk specifically because manned logistics runs are now among the
  highest-casualty activities — the same structural pressure, addressed on the Ukrainian side
  through pre-staging discipline rather than robotic substitution as the first-line fix."* This
  upgrades the citation from "adjacent" to a document explicitly naming its own parallel with the
  Russian side — closer to `CONVERGENT-3` for the sustainment half of this finding specifically than
  the original `CONVERGENT-2` label captured; command-culture friction (Russian §3.2) remains the
  half without a Ukrainian-side match.

The "disaggregate to survive, reaggregate when necessary" formulation is portable, memorable, and
absent from the platform. **Recommendation: do not add this as a standalone lesson — fold it into
`distributed-kill-chains` as the missing friction half (§3.7) and into the new sustainment lesson at
4.4.** Adding a third lesson about decentralisation would fragment one finding across three cards.

### 4.4 Logistics risk has become a subset of counter-UAS risk — **`[CORRECTED]` CONVERGENT-3** (was CONVERGENT-2)

- Russian §3.3: *"logistics risk is now largely a subset of counter-UAV risk, not a separate
  problem."* (full quote at §3.10)
- Western §3.3: *"smaller, dispersed logistics task forces that trade some efficiency for
  survivability against UAS, long-range fires, and EW."* Plus its distinct complication: *"a unit
  fielding several NATO-standard and legacy Soviet-standard platforms cannot be treated as fungible
  with a unit fielding only one type — a planning factor with direct implications for any coalition
  force generation."*
- **`[CORRECTED]`** Ukrainian §3.3 (quoted in full at §4.3 above) explicitly parallels Russian §3.3
  by name, and independently matches Western §3.3's dispersal finding via its own pre-staging fix.
  Three references, three independent statements of the same structural coupling — genuine
  `CONVERGENT-3`.

This is currently gestured at inside `drone-dense-corridor` but never stated as the finding it is.
**Recommendation: promote it to a lesson in its own right and merge `drone-dense-corridor` into
it**, carrying the medical points across and adding the UGVs the corpus names (§3.10). The corridor
becomes the setting; the coupling becomes the lesson.

**Proposed statement** (my drafting, not a source quotation):

> Resupply and casualty evacuation are no longer logistics problems with a threat overlay — they are counter-drone problems. Manned logistics runs are now among the highest-casualty activities on the battlefield, and both sides responded the same way: push the run onto an unmanned ground platform, disperse the hubs, and accept the efficiency loss. Sustainment decentralised for exactly the reason command did.

### 4.5 Fibre-optic convergence — **covered, but framed wrong**

Not a missing lesson; a rewrite of `fiber-optic-immunity` (§3.6). The missing *content* is the
epistemic point — independent convergence as the test for whether an adaptation is structural.

### 4.6 Counter-UAS is an integration and accountability problem, not a hardware problem — **`[CORRECTED]` CONVERGENT-3** (was CONVERGENT-2), and now the strongest three-way convergence in the whole corpus by the corpus's own account

- Western §3.1: *"CEPA identifies limited interoperability between allied C-UAS systems, incomplete
  capability coverage across the threat spectrum, weak platform survivability, and gaps in personnel
  training and intelligence-processing capacity as the specific, named shortfalls."* And, crucially:
  *"a related West Point Modern War Institute analysis of Ukraine's own counter-drone effort finds
  it lacks a single point of mission accountability and is fragmented across services, a genuinely
  new organizational problem rather than a solved one being exported wholesale."*
- Western §4 (instructors): *"The C-UAS integration gap (3.1), not a hardware gap, is the most
  actionable, multiply-corroborated curriculum fix identified across sources — training that assumes
  systems will be fielded individually rather than as a networked detect-track-defeat chain is
  solving the wrong problem."*
- Western §3.1 implication: *"the sources describe the problem as one of training and
  interoperability more than inventory."*
- Russian §4 (defense companies): *"Counter-UAV remains fragmented and under-resourced at the unit
  level relative to the offensive drone ecosystem across every source — the clearest capability gap,
  and the one most consistently self-reported by the practitioner sources."*
- Russian §3.5 adds the organisational template: *"the National Guard manual solves institutionally
  by designating non-staff UAV-countermeasure crews with dedicated training time."*
- **`[CORRECTED]`** Ukrainian §3.5, from the real document, closes the loop and says so in its own
  words: *"Ukrainian peer-reviewed military-technical journals (source 5) are still treating
  swarm-UAV C2 effectiveness and coordinated counter-drone response as open research questions
  rather than settled doctrine. This matches the Western-side document's finding (its 3.1, citing a
  Modern War Institute analysis) that Ukraine's own counter-drone effort 'lacks a single point of
  mission accountability and is fragmented across services.' An independent Western institutional
  read and Ukraine's own academic press arrive at the same gap from two different directions —
  **this is one of the stronger three-document convergences in the whole corpus, because none of the
  three sources involved were checking the others' work.**"*

**All three references independently name counter-UAS integration as the clearest capability gap,
one of them explicitly flagging it as one of the corpus's strongest convergences, and the Western
document separately calls it the single most actionable curriculum fix in its corpus. The platform
has no lesson about it at all** — despite carrying Gepard, Bukovel, Pantsir, Tor-M2, Stinger and the
integrated air-defence network. This is the largest gap between "assets the map already has" and
"lessons the map teaches," and, following the correction, the best-evidenced missing lesson in this
entire report.

**Proposed statement** (my drafting, not a source quotation):

> Counter-drone is the clearest capability gap in every source in this corpus, on every side — and none of them describes it as a shortage of equipment. The failure is integration: systems fielded individually instead of as a networked detect-track-defeat chain, equipment held by units without the trained crews to run it, and — in Ukraine's own case — no single point of mission accountability, fragmented across services. Every asset on this map with a counter-drone role is only as good as the chain it is or isn't part of.

### 4.7 The holding-ground vs. assaulting training imbalance — **SINGLE-SOURCE, contrary to the brief's framing**

The brief lists this among findings "that appear to be strongly convergent." **It is not.** It
appears in the Russian document only:

- Russian §3.5: *"Holding vs. assaulting. Markin's interviewees report heavy assault training but
  thin training in digging in and holding ground — and link this directly to losses in the 'holding'
  phase."*
- Russian §4 (soldiers): *"The 'holding ground' training gap above is a personal risk factor worth
  flagging in any curriculum aimed at this audience."*

The Western document's training section (§3.6) is about *NATO's own* gaps — role reversal in
training flow, CALL's staffing, visibility bias — and contains nothing about holding versus
assaulting. **`[CORRECTED]`** The corrected Ukrainian document's nearest content is its §3.7 note
that Syrskyi created Assault Troops as a distinct branch specifically for a "rapid-response
no-fixed-line role," which is adjacent at best and, if anything, points toward assaulting/manoeuvre
being the emphasis rather than confirming a holding-ground training gap.

It is also, per Russian §2's own reliability note, sourced to practitioner testimony with
*"morale-building intent"* — one of the two source classes that document says to treat as
illustrative.

**Recommendation: do not add as a standalone lesson.** It is a real, useful observation with one
document behind it. If it is wanted, it belongs as a supporting detail inside a training-gap lesson,
explicitly labelled Russian-side-only. Reporting it as convergent when it is not would be exactly
the failure mode this pass exists to prevent.

### 4.8 Standardisation, not volume, is the binding constraint on ammunition — **SINGLE-SOURCE (and structurally so)**

- Western §3.5: *"a separate, less-publicized finding from the Modern War Institute is that even
  matched caliber production does not guarantee usable ammunition across a coalition: fuze,
  propellant, and shell-body standards vary enough between NATO producers that STANAG-level
  standardization, not just factory throughput, is the binding constraint on ammunition
  interoperability in a multi-national force."*
- Western §4 (policymakers): *"The standardization gap (3.5) — not raw production volume — is the
  more actionable near-term acquisition lever."*
- Western §3.5 also supplies the numbers: *"Pre-war combined NATO 155mm production was roughly
  300,000 rounds/year; by 2026 combined EU/UK/Ukrainian output is reported in the 1.2–3 million/year
  range depending on source and how 'capacity' versus 'actual output' is counted, with a US Army
  Inspector General report (July 2026) noting the US portion of that scale-up has fallen short of
  its own targets."*
- Russian: nothing, and **this is structural rather than an oversight** — a single-nation
  producer has no coalition standardisation problem, so this finding cannot be convergent by
  construction.
- **`[CORRECTED]`** Ukrainian §3.6 documents a different model, not the same kind of standardisation
  problem: *"Brave1's e-Points/marketplace system... converts battlefield performance directly into
  equipment allocation within weeks: units earn points for verified kills and re-spend them on
  whichever certified system is currently working."* This is a domestic single-nation procurement
  loop rather than a multi-national interoperability problem — the two withdrawn figures ("~800
  certified manufacturers," Fedorov's "~95% domestic-origin" claim) came from the superseded
  document and are dropped; the real document's own figures (400+ units with direct Brave1 ordering
  access, 500+ grants issued) carry the point just as well and come with the document's own audit
  caveat: *"the specific figures... are self-reported by Brave1 and the ministries involved, not
  independently audited — the mechanism is the well-supported claim here, not the precise
  numbers."*

**Recommendation: include it anyway, explicitly labelled as a Western-coalition-specific
finding.** It is the corpus's clearest policy-actionable lesson and the platform has a
policymaker audience. But it should be presented as "one document, and here is why only one
document could have it," not padded into false convergence. The honest note that Ukraine's
domestic ecosystem is the counter-case makes it a better lesson, not a weaker one.

### 4.9 Additional convergent findings not in the brief's list

**`[CORRECTED]`** Both (a) and (b) below were originally sourced substantially to the superseded
Ukrainian document. (a)'s Ukrainian support does not survive the correction and the finding is
downgraded. (b)'s core claim does survive — the real document makes the same point, independently —
but every quote supporting it has been replaced with real text, and one figure (a Brave1 grant total
in UAH) is dropped because it does not appear in the corrected document.

**(a) The training and knowledge flow reversed — `[CORRECTED]` downgraded to SINGLE-SOURCE
(Western only).**
- Western §3.6: *"As of 2026, Ukraine has scaled back its reliance on NATO-hosted basic training and
  is instead exporting drone-warfare, C-UAS, and EW expertise into NATO's own exercises — Ukraine's
  DELTA battlefield-management system has been incorporated into NATO training events. Several
  sources treat this as evidence that battlefield-tested tactical knowledge is now flowing in the
  opposite direction from the traditional pattern."*
- The corrected Ukrainian document contains no mention of DELTA, JATEC, or Ukrainian expertise being
  exported into NATO training events — a direct search of its text for each term returns nothing.
  The "Test in Ukraine" and "JATEC" citations that previously supported this finding came from the
  superseded document and do not carry over. This finding drops out of the "additional convergent
  findings" category entirely: it is real (Western §3.6 states it plainly) but it is not convergent,
  and should not be represented as such. **Recommendation: still worth a mention inside a training
  lesson, explicitly labelled Western-only, the same treatment §4.8 gives the ammunition-
  standardisation finding.**

**(b) The adaptation cycle is itself the capability — CONVERGENT-2, Ukrainian-primary. Core claim
unchanged by the correction; every citation replaced with real text.**
- **`[CORRECTED]`** Ukrainian §3.6: *"Brave1's e-Points/marketplace system (source 4) converts
  battlefield performance directly into equipment allocation within weeks: units earn points for
  verified kills and re-spend them on whichever certified system is currently working, and
  manufacturers see unit-level performance data directly. This is functionally a lessons-learned
  process that skips the written report entirely and acts on the data."* With the document's own
  caveat, which should travel with the claim: *"the specific figures (400+ units with direct
  ordering access, 500+ grants issued) are self-reported by Brave1 and the ministries involved, not
  independently audited — the mechanism is the well-supported claim here, not the precise numbers."*
  (The previous version of this citation included a "~UAH 2 billion" grant-value figure; it does not
  appear in the corrected document and is dropped rather than re-asserted.)
- **`[CORRECTED]`** Ukrainian §4 (instructors' implications), on OP 7-162: *"OP 7-162's
  structured-AAR requirement (source 6) is worth noting for methodology: it standardizes an
  after-action format both source 1 and source 2 were already using independently before the
  doctrine existed, which is itself a teaching point about how fast bottom-up practice can outpace
  top-down doctrine."* This replaces the previous "identified lesson / implemented lesson" citation,
  which does not appear anywhere in the corrected document's text.
- **`[CORRECTED]`** Ukrainian §3.7, on Zaluzhnyi's April 2025 essay: *"Zaluzhnyi's argument (source
  7, Apr 2025) that doctrine needs continuous revision rather than periodic replacement, and his
  description of naval drones displacing surface-fleet functions, both describe the same pattern."*
  This is a closer, better-supported match than the withdrawn "compressed innovation cycle" phrase
  and comes from the document's own §3.7 rather than a source-table paraphrase.
- Russian §4 (policymakers), unchanged: *"a battlefield technology with a consumer-electronics
  supply chain changes acquisition timelines in ways traditional defense procurement cycles aren't
  built for."*

**Strong recommendation to add, and the recommendation strengthens after the correction rather than
weakening.** This is the one lesson where the Ukrainian document is the genuine *primary* source
rather than a flag on a missing check — and now that the document is a real synthesis rather than a
catalog, that primacy is earned rather than assumed. It is directly self-referential for a
*learning platform*, which makes it the natural closing lesson.

---

## 5. Lessons not to learn

### 5.1 Recommendation: yes — but as a flag on existing lessons, not a parallel list

**Recommendation: add a `contested` treatment to the lesson schema — a boolean plus a short
`caution` string — rather than creating a separate category of "anti-lessons."**

Reasoning, and the case against the alternative:

- A separate list of contested findings is a list nobody clicks. The AARC's warning is only useful
  *at the moment a reader is looking at the claim it qualifies* — visibility bias is worth knowing
  while reading "drones cause 60–70% of losses," not in a footnotes page.
- The corpus itself models this. Neither reference quarantines its cautions; Western §2 puts its
  visibility-bias note **inside the source-corpus reading notes**, and Russian §2 puts *"treat
  specific numbers as illustrative, not statistical"* in the same place. The cautions live next to
  the evidence they qualify.
- It is cheap: `data/lessons.json` already carries free-form `detail` and `source_tag`; a
  `contested`/`caution` pair is additive and needs no renderer change to be useful (though a visual
  treatment would help).
- It matches this repo's existing standard. `verification` is already a first-class, honestly-derived
  per-asset field, and `docs/CONTENT_PIPELINE.md` already institutionalises the idea that confidence
  is shown, not omitted. A `contested` flag is the lesson-layer version of a mechanism the asset
  layer already has.

**One exception where a standalone lesson is warranted:** visibility bias itself. It is not a
caution *about* a lesson; it is a lesson about how to read every other lesson, including this
platform's own. It should be a card.

### 5.2 Candidates

| Candidate | Corpus basis | Treatment |
|---|---|---|
| **Visibility bias** — viral footage generates claims of systemic effectiveness the undocumented failure rate does not support | Western §3.6, §2 reading notes | **Standalone lesson** (see §6, #14) |
| The platform's own lesson 2 headline (drones as cause of 60–70% of equipment losses) | Western §3.6 applied to `drone-attrition-share` | **`contested: true` on the recast cost-asymmetry lesson**, naming itself as the worked example |
| Treating Ukraine's counter-drone model as solved and copyable | Western §3.1: *"this gap is not fully closed even on the Ukrainian side... a genuinely new organizational problem rather than a solved one being exported wholesale."* | **`contested: true`** on the new counter-UAS lesson (§4.6) |
| **Practitioner-testimony numbers read as statistics** — the 7,200/month, 1–1.5 km/7 km, 2–7 days figures | Russian §2: *"treat specific numbers as illustrative, not statistical"*; also *"morale-building intent"* | **`contested: true`** on `lower-sky-control`; already handled correctly in `attrition-economics` |
| Treating force mass as obsolete | Western §3.7 lists *"reduced importance of force mass"* as a curriculum lesson — but the Ukrainian document's own source-table paraphrase of Zaluzhnyi's essay (`[CORRECTED]` Ukrainian §2: *"Air/EW/reserves/minefield levers (2023)"*) names reserve generation and minefield-breaching as unsolved requirements, i.e. the breakthrough problem is open, not that mass stopped mattering | **`contested: true`** wherever the platform implies it; **weaker candidate than the others** — I am inferring the tension from two documents rather than quoting a source that states it, and it should not be presented as a corpus finding |

The self-implicating candidate (the platform's own 60–70% claim) is the one I would push hardest
for. A tool that flags its own most-quotable number as the example of the bias it warns about earns
a reader's trust in a way that flagging someone else's claim does not.

---

## 6. Proposed final lesson set — **15 lessons** (from 10)

Seven of the current ten are carried (four with rewrites), one is recast, three are removed or merged, seven are new.
Ordering is pedagogical: the two framing lessons first, mechanism in the middle, institutional last.

| # | ID | Title | Status | Score | One-line rationale |
|---|---|---|---|---|---|
| 1 | `drone-layer-connective-tissue` | Drones are the connective tissue, not a category | **NEW** | CONVERGENT-3 | The one finding named as its own three-leg convergence and the one the platform's own taxonomy contradicts (§4.1) |
| 2 | `detectability-not-distance` | Detectability, not distance, decides survivability | **NEW** (absorbs `pattern-of-life-detection`) | **`[CORRECTED]` CONVERGENT-3** | Ukrainian §3.2 names its own independent convergence with Western §3.2 — the corpus's most direct challenge to this map's organising metaphor (§4.2) |
| 3 | `lower-sky-control` | Control of the lower sky sets how close you can stand | **KEEP + rewrite** | CONVERGENT-2 / numbers SINGLE-SOURCE | Attribute the 1–1.5 km/7 km figures to Markin; fix or drop the broken tank contrast (§3.3) |
| 4 | `kill-chain-compression` | Reconnaissance and fires fused into one function | **KEEP + rewrite** | CONVERGENT-2 / timing UNSUPPORTED | Lead with the supported fusion finding; demote the unsourced clock to a caveated illustration; swap HIMARS for a responsive gun (§3.1) |
| 5 | `distributed-kill-chains` | Kill chains pushed to squad level — and command culture hasn't followed | **KEEP + rewrite** | CONVERGENT-2 | Restore the friction half both references insist on; make the asset set one side's loop (§3.7, §4.3) |
| 6 | `logistics-is-counter-uas` | Logistics risk became a subset of counter-drone risk | **NEW** (absorbs `drone-dense-corridor`) | **`[CORRECTED]` CONVERGENT-3** | Ukrainian §3.3 explicitly names its own parallel to Russian §3.3; brings in the UGVs the corpus names (§3.10, §4.4) |
| 7 | `counter-uas-integration` | Counter-drone is an integration problem, not a hardware problem | **NEW** | **`[CORRECTED]` CONVERGENT-3** | Ukrainian §3.5 calls this "one of the stronger three-document convergences in the whole corpus"; six relevant assets already on the map, zero lessons (§4.6) |
| 8 | `ew-invisible-battlefield` | EW is the invisible battlefield everything else depends on | **KEEP + amend** | **`[CORRECTED]` CONVERGENT-3** | Add the Excalibur/GPS-degradation datapoint, an artillery asset, and Ukrainian §3.4's analog-fallback-as-baseline finding; source or drop the 5–20 m figure (§3.5) |
| 9 | `fiber-optic-immunity` | Fibre-optic links: when both sides reach the same fix, the adaptation is structural | **KEEP + rewrite** | **`[CORRECTED]` CONVERGENT-3**, best-evidenced lesson in the set | The convergence and its ~6-month replication speed is the finding, not the trade-off; Ukrainian §3.4 supplies the timeline (§3.6) |
| 10 | `attrition-economics` | Consumption rates, not inventories, decide sustainment | **KEEP unchanged** | CONVERGENT-2 | No finding against it; add the missing `maintenance` edge or drop the declaration (§3.9) |
| 11 | `cost-asymmetry` | The cheapest system destroys the most expensive | **RECAST** from `drone-attrition-share` | CONVERGENT-2 (asymmetry) | Keeps what the assets actually demonstrate; the 60–70% statistic moves to a `contested` caution (§3.2) |
| 12 | `deep-rear-is-reachable` | The deep rear stopped being a sanctuary | **KEEP + downgrade confidence** | UNSUPPORTED in corpus | True and well-written but corpus-unsupported and resting on a bare `[web]` tag — must say so; drop the 80 km hub (§3.8) |
| 13 | `ammunition-standardisation` | Standardisation, not volume, is the coalition ammunition constraint | **NEW** | SINGLE-SOURCE (structurally) | The corpus's clearest policy lesson; label it Western-specific and note Ukraine's domestic model as the counter-case (§4.8) |
| 14 | `adaptation-cycle-is-the-capability` | The speed of the learning loop is itself the capability | **NEW** | CONVERGENT-2, Ukrainian-primary | The one lesson where the Ukrainian document leads; the honest structural answer to §1.2's corpus imbalance (§4.9b) |
| 15 | `visibility-bias` | Some of what you have learned about this war is selection effect | **NEW, contested-category** | CONVERGENT-2 | A lesson about how to read the other lessons, including this platform's (§5) |

**Count: 15 lessons** (from 10), of which one — `visibility-bias` — is the standalone contested
lesson described in §5.1. In addition, `contested: true` flags go on three others
(`cost-asymmetry`, `counter-uas-integration`, `lower-sky-control`), and on a fourth if the weaker
mass-obsolescence candidate in §5.2 is pursued.

**Removed / merged (3):**
- `drone-attrition-share` → recast as #11 `cost-asymmetry`; its statistic becomes a `contested`
  caution. Nothing is lost; the unsupportable part stops being the headline.
- `pattern-of-life-detection` → merged into #2 `detectability-not-distance`. Its multi-day mechanism
  survives as one detection timescale alongside the 15-minute emissions timescale the corpus
  documents and the current lesson omits.
- `drone-dense-corridor` → merged into #6 `logistics-is-counter-uas`. The corridor becomes the
  setting; the coupling becomes the lesson; the medical points carry across.

**Deliberately not added:** the holding-vs-assaulting training imbalance (§4.7) — brief-listed as
convergent, verified as `SINGLE-SOURCE`. It belongs as a supporting detail, labelled Russian-side,
not as a lesson.

**Cross-cutting fix, independent of any of the above:** reconcile every lesson's
`connection_types` with the edges that actually exist among its assets, or add the missing edges to
`data/connections.json` (§2.1). Six of ten current lessons fail this today.

---

## 7. Asset roster implications (feeds Pass 24)

Against the actual 103-asset roster (not 107 — §1.4). Split into genuine roster gaps and mapping
fixes that need no new assets, because conflating them would inflate Pass 24's scope.

### 7.1 Genuine roster gaps — assets the proposed set needs and the roster does not have

| Need | For lesson | Evidence | Priority |
|---|---|---|---|
| **Wired / fibre-optic FPV strike drone** (ideally both sides) | #9 | Grep of all 103 assets for `fiber\|fibre` returns 4 files, none an FPV strike aircraft. Blocks the corpus's best-supported lesson. Already logged by Pass 21. | **Highest** |
| **Interceptor drone** (hard-kill counter-UAS) | #7 | Western §4: NATO's 2026 cycle is *"explicitly structured around live interoperability testing of interceptor-drone and C2 fusion systems."* `doctrine.md` §4 names *"hard-kill (interceptor drones, directed energy)."* **No interceptor-drone asset exists in the roster.** | **High** |
| **Decoy / EM-signature-management set** (decoy antennas, simulated vehicle park) | #2, #8 | Western §3.2 names them as doctrine; Western §4 (defense companies) calls decoys/low-signature comms/mesh relays *"a persistent, source-corroborated capability gap at the unit level."* No decoy asset on the map. The corpus explicitly names this as an unmet need — an unusually well-warranted addition. | **High** |
| **Counter-UAS battle-management / detect-track-defeat node** | #7 | Only `side_a-c2-integrated-air-defense-network` (60 km) approximates it, it is air-defence rather than C-UAS-specific, and **side_b has no `c2-battle-management` asset at all.** Western §4: training that assumes systems are fielded individually *"rather than as a networked detect-track-defeat chain is solving the wrong problem"* — the chain needs a node to be visible. | **High** |
| **Strategic-rear logistics hub (200+ km)** | #12 | Only two `logistics-hub` assets exist (80 km, 18 km). `data/connections.json`'s `_note_unresolved_ids` already records `side_a-logistics-hub-strategic-rear` as a referenced-but-unbuilt stub. Logged by Pass 21. | Medium |
| **Learning/adaptation institution** — a drone school, Brave1-style acceleration node, or unit training centre | #14 | `side_b-training-center-op-deep` is likewise a referenced-but-unbuilt stub in `connections.json`. `[CORRECTED]` the specific "20,000+ drone operators" figure previously cited here came from the superseded document and does not appear in the corrected one; the underlying need still stands on the corrected document's own terms — Ukrainian §3.6's e-Points/marketplace loop and §3.1's Unmanned Systems Forces stand-up are both institutional feedback/training mechanisms with nothing on the map representing them. | Medium |
| **Dispersed sustainment task force** (as distinct from a static hub) | #6 | Western §3.3's named unit of analysis: *"smaller, dispersed logistics task forces that trade some efficiency for survivability."* The map has hubs only — a point, not a dispersed formation. | Medium |
| **Mixed-standard ammunition point** | #13 | Western §3.5's fuze/propellant/shell-body divergence. `side_a-logistics-ammo-point-railhead` could carry it in content fields rather than needing a new asset — **flag as a content-field task first, escalate to a new asset only if the field treatment reads thin.** | Low |
| **Guided-munition entity** (Excalibur / GMLRS as a distinguishable item) | #8 | The corpus's sharpest EW datapoint is about a *round*, not a launcher, and the roster models launchers. The `data/catalog/` swap layer may be the right home rather than a map asset. | Low |

### 7.2 Not roster gaps — mapping fixes that are free today

Listing these separately so Pass 24 does not build assets it already has:

- **UGV resupply/casevac for #6** — five relevant assets already exist (`side_a-ground-robots-nprk-mul`,
  `side_b-ground-robots-kurier`, `side_b-ground-robots-omich-2`, `side_a-ground-robots-nrtk-ratel-s`,
  `side_b-ground-robots-varan`). Pure mapping omission (§3.10).
- **Ground observation posts for #2** — `side_a-infantry-position-observation` (4 km) and
  `side_b-infantry-position-observation` (4.5 km) exist and fit better than the 300 km satellite
  currently used (§3.4).
- **Responsive artillery for #4** — `side_a-artillery-m777`, `side_a-artillery-2s22-bohdana`,
  `side_a-artillery-caesar-155mm-self-propelled-gun` all exist; HIMARS is the wrong choice, not a
  missing one (§3.1).
- **`fires_support`-connected assets for #4 and #5** — the two `artillery-position-firing` and two
  `infantry-dismounted-squad` assets are the only four carrying that edge type, and none appears in
  either lesson that declares it (§2.1).
- **Counter-UAS hardware for #7** — Gepard, Bukovel, Pantsir, Tor-M2, Stinger and the IADS node are
  all on the map. #7 is the largest "assets present, lesson absent" gap in the roster.

### 7.3 One documentation debt

`docs/references/` does not exist (§1.1). The three references and `doctrine.md` should be committed
there so a later pass can re-derive these citations without the attachments. This audit's citations
are reproducible only against the attached files as received.

---

## 8. Summary of the honest answer to the question this pass asked

**Are the 10 lessons the right 10, stated the way the sources support?**

No, on both counts, and not marginally.

- **One lesson is contradicted by its own corpus** (`drone-attrition-share`) — it states as flat
  fact the precise claim class the Western document's methodological caution exists to warn against.
- **Two more rest entirely on sources outside the convergence corpus** (`deep-rear-is-reachable`
  wholly; `kill-chain-compression`'s headline timing figure), one of them on `doctrine.md`'s weakest
  citation tag.
- **Four carry load-bearing numbers that appear in no reference** — 60–70%, 1–1.5 km/7 km, 2–7 days,
  ~30 km — while `attrition-economics` shows exactly how to state such a figure honestly.
- **Two teach only the optimistic half of a two-sided finding** (`distributed-kill-chains` drops the
  command-culture friction; `fiber-optic-immunity` reports the trade-off but not the convergence
  that is the actual finding).
- **Six of ten declare connection types that do not exist among their own assets.**
- **The corpus's single most emphasised finding — drones as connective tissue across every
  warfighting function — is not taught at all**, and the platform's own category taxonomy is an
  instance of what that finding says is obsolete.
- **The corpus's clearest self-identified capability gap — counter-UAS integration — is not taught
  at all**, despite six relevant assets already on the map, and is now, following the §0 correction,
  the single best-evidenced missing lesson in this report (`CONVERGENT-3`, self-declared by the
  Ukrainian document as one of the corpus's strongest convergences).

**`[CORRECTED]`** The audit originally ran against a two-and-a-half-document corpus, because the
first Ukrainian document supplied was a source catalog rather than a synthesis (§1.2, preserved for
the record). That has been corrected: the corpus is now genuinely three documents, and five findings
that were `CONVERGENT-2` in the original report — `ew-invisible-battlefield`,
`fiber-optic-immunity`, and missing lessons 4.2 (`detectability-not-distance`), 4.4
(`logistics-is-counter-uas`), and 4.6 (`counter-uas-integration`) — are genuine `CONVERGENT-3`. One
claim (the training-flow-reversal finding at §4.9a) had to be walked back because it depended
entirely on the wrong document. See §0 for the full before/after.

Three things are genuinely in good shape and should not be touched in the rewrite:
`attrition-economics`'s sourcing discipline, `fiber-optic-immunity`'s underlying convergence (now
the *most* strongly evidenced claim in the set, not merely the strongest of two), and Pass 21's
practice of stating asset-mapping compromises in the lesson text rather than hiding them — both of
the gaps it flagged were confirmed here, and both flags were accurate.

---

## 9. Verification record

Per brief §7, the claim this pass makes is that its citations are real. The check performed, **now
re-run after the §0 correction:**

- Every italic-quoted passage in this report was extracted programmatically and matched, after
  whitespace/quote-character/dash normalisation only, against the full text of the corrected input
  documents (`docs/references/Russian-Side_Lessons_Learned_Reference.md`,
  `docs/references/Western-Side_Lessons_Learned_Reference.md`,
  `docs/references/Ukrainian-Side_Lessons_Learned_Reference.md`, `docs/doctrine.md`) plus the other
  repo files cited (`data/doctrine_markers.json`, `docs/BACKLOG.md`).
- **93 quoted passages, 93 verified verbatim, 0 unmatched.** By source: Western 32, Russian 29,
  Ukrainian 25, `doctrine.md` 2, `doctrine_markers.json` 1, and 4 quotes in §1.2 that verify only
  against the *superseded* Ukrainian document (kept as a session upload, not committed to the repo)
  — expected, since §1.2 is a historical record of the document that was replaced. Every one of
  those 4 is explicitly labelled as describing the superseded document at the point it appears.
- Six citations that appeared in the pre-correction version of this report did not survive: they
  depended on quotes that exist only in the superseded document and have no counterpart in the real
  one (the JATEC/DELTA/Test-in-Ukraine training-reversal claims, the "~800 certified manufacturers"
  and Fedorov 95%-domestic figures, a UAH-denominated Brave1 grant total, and the "20,000+ drone
  operators" figure). Each is called out at the point it was removed, with the correction noted
  rather than silently dropped.
- Text I authored — the proposed lesson statements in §4 and the candidate labels in §5.2 —
  is deliberately *not* in quotation form, so it cannot be mistaken for a citation. Where §4 gives
  a proposed statement it is marked "my drafting, not a source quotation."

Non-citation factual claims, and how each was checked:

| Claim | Check |
|---|---|
| Branch contains Pass 21 | `git merge-base --is-ancestor f622c3f` against both `origin/claude/warfare-digital-twin-scaffold-19u7kt` and `HEAD` — exit 0 both |
| Roster is 103 assets, not 107 | `ls data/assets/*.json \| wc -l` → 103; corroborated by `docs/BACKLOG.md`'s own Pass 18 entry |
| Six of ten lessons declare unbacked connection types | Every lesson's `connection_types` compared against the union of per-asset `connections` blocks and `data/connections.json`, filtered to edges whose **both** endpoints are in that lesson's `asset_ids` |
| `fires_support` exists on only four assets | `grep -rn "fires_support" data/` → the two `artillery-position-firing` and two `infantry-dismounted-squad` files only |
| No fibre-optic FPV strike aircraft in the roster | `grep -ril "fiber\|fibre" data/assets/` → 4 files, none an FPV strike aircraft |
| No interceptor-drone asset | Full category/name listing of all 103 assets reviewed; no interceptor or hard-kill counter-UAS drone present |
| Asset distances quoted in §3.3 and §3.10 | Read directly from each asset's `distance_km_from_zero` field |
| `docs/references/` absent (at first run), now populated | `ls docs/references/` → `No such file or directory` (first run); `ls docs/references/` → 3 files (after §0 correction) |
| Real Ukrainian document has §3.1–§3.7 cross-cutting-lessons, matching Russian/Western structure | `grep -n "^### 3\." docs/references/Ukrainian-Side_Lessons_Learned_Reference.md` → 7 matches |
| Withdrawn figures ("~800 certified manufacturers," Fedorov 95%, UAH grant total, JATEC, DELTA, Test in Ukraine, "20,000+ operators") absent from the real document | `grep -in` for each term against `docs/references/Ukrainian-Side_Lessons_Learned_Reference.md` → no matches for any |

**Nothing was built, deployed, or rendered in this pass, and no visual claim is made.**
`data/lessons.json`, `src/`, and all rendering code are unmodified — `git status` shows
`LESSON_AUDIT.md` as the only change.
