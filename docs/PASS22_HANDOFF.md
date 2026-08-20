# Pass 22 — Key Lessons audit: session handoff

Plain-language summary of Pass 22 (the Key Lessons convergence audit) and the
mid-session correction that followed it. Written to be pasted into a fresh
Claude session (or read by a human) without any of the prior conversation.

Branch: `claude/lessons-audit-convergence-cd1o1n`

---

## TL;DR

1. Pass 22 was asked to audit the 10 lessons in `data/lessons.json` against
   three lessons-learned reference documents (Russian-side, Western-side,
   Ukrainian-side), plus `docs/doctrine.md` for asset-mapping context only.
   **It is a diagnostic pass — no `src/` file, no rendering code, and
   `data/lessons.json` itself were touched.** The full result is
   `LESSON_AUDIT.md` in the repo root.
2. **The Ukrainian document supplied for that first run was wrong** — a
   source catalog (no cross-cutting-lessons section) rather than a finished
   synthesis, something the audit itself caught and flagged correctly at the
   time. The user confirmed this was a mistake on their end and supplied the
   real document afterward.
3. **This session corrected the audit in place** rather than throwing it
   away: `LESSON_AUDIT.md` §0 documents the correction, §1.2 is kept as a
   labelled historical record of the wrong document (real project history,
   not deleted), and every affected finding throughout the report is marked
   `[CORRECTED]` at the point it changed.
4. **The correction made the corpus stronger, not weaker.** Five findings
   moved from two-document to genuine three-document convergence — the
   strongest evidentiary tier this audit uses. One claim had to be walked
   back because it depended entirely on the wrong document. See "What
   changed" below.
5. All three reference documents are now committed to `docs/references/`
   (they previously existed only as session attachments — `LESSON_AUDIT.md`
   §1.1 flagged this as a bookkeeping gap in the first run). `docs/doctrine.md`
   already existed in the repo and needed no action.
6. **Nothing in `data/lessons.json` has changed yet.** Every proposed edit in
   `LESSON_AUDIT.md` §6 is still a proposal awaiting explicit human approval,
   per the original brief's constraint. This is the next decision point —
   see "What's next" below.

---

## 1. What's in the repo now

| File | What it is |
|---|---|
| `LESSON_AUDIT.md` (repo root) | The full audit: corpus statement, per-lesson convergence scoring, missing lessons, lessons-not-to-learn, a proposed 15-lesson final set, and asset-roster implications. ~1,200 lines. §0 at the top documents this session's correction; read it first if you're picking this up fresh. |
| `docs/references/Russian-Side_Lessons_Learned_Reference.md` | Convergence corpus, leg 1. Unchanged since the audit's first run. |
| `docs/references/Western-Side_Lessons_Learned_Reference.md` | Convergence corpus, leg 2. Unchanged since the audit's first run. |
| `docs/references/Ukrainian-Side_Lessons_Learned_Reference.md` | Convergence corpus, leg 3 — **the corrected document**, a genuine synthesis with its own §3.1–§3.7 cross-cutting-lessons structure matching its two companions. This is not the file the audit first scored against. |
| `docs/doctrine.md` (pre-existing) | Unchanged. Not scored for convergence — read only for asset-mapping context, per the original brief. |
| `data/lessons.json` | **Unchanged.** Still the original 10 lessons. Every rewrite/addition/removal in `LESSON_AUDIT.md` §6 is a proposal, not yet applied. |

---

## 2. What changed when the document was corrected

The full detail is `LESSON_AUDIT.md` §0. Short version:

| Finding | Before correction | After correction |
|---|---|---|
| `ew-invisible-battlefield` (lesson 5) | CONVERGENT-2 | **CONVERGENT-3** |
| `fiber-optic-immunity` (lesson 6) | CONVERGENT-2 | **CONVERGENT-3**, and materially strengthened — the real document supplies a concrete ~6-month Russia-to-Ukraine replication timeline for fibre-optic FPV control that the original report didn't have |
| Missing lesson: detectability-not-distance | CONVERGENT-2 | **CONVERGENT-3** — the real document states, in its own words, that its C2-dispersal finding is *"the same conclusion the Western-side document reaches... independently arrived at from a different Ukrainian source line"* |
| Missing lesson: logistics-is-counter-uas | CONVERGENT-2 | **CONVERGENT-3** |
| Missing lesson: counter-uas-integration | CONVERGENT-2 | **CONVERGENT-3** — the real document calls this *"one of the stronger three-document convergences in the whole corpus"* |
| Training-flow-reversal finding (Ukraine exporting expertise into NATO exercises, DELTA, JATEC) | Reported as CONVERGENT-2, Ukrainian-side load-bearing | **Downgraded to Western-only, SINGLE-SOURCE** — the real document contains no mention of JATEC, DELTA, or NATO training exports; that content only ever existed in the wrong document |
| Adaptation-cycle-is-the-capability (Brave1 e-Points / OP 7-162) | CONVERGENT-2, Ukrainian-primary | Unchanged in substance, but every citation was re-sourced to the real document's text; a couple of specific figures (a UAH grant total, "~800 certified manufacturers," "20,000+ drone operators") were dropped because they don't appear in the real document and were never re-asserted |

Net effect: **6 upgrades to the strongest evidentiary tier, 1 walk-back.** Every
citation in the corrected report — 93 quoted passages — was re-verified
programmatically against the actual document text (script + method in
`LESSON_AUDIT.md` §9). Zero unmatched.

---

## 3. What Pass 22 found, independent of the correction

This didn't change between the two runs — it's the audit's core conclusion,
and it's blunt:

- One lesson (`drone-attrition-share`, "drones cause 60–70% of losses") is
  **CONTRADICTED** by the corpus's own methodological caution against exactly
  that kind of unhedged statistic.
- Two lessons rest entirely on sources outside the convergence corpus
  (`deep-rear-is-reachable` wholly; `kill-chain-compression`'s "hours to
  minutes" headline).
- Four lessons carry load-bearing numbers that appear in no reference
  (60–70%, 1–1.5 km/7 km, 2–7 days, ~30 km) — while `attrition-economics`
  shows exactly how to state a similar figure honestly (state it, then state
  its provenance and limits in the same breath).
- Six of the ten lessons declare `connection_types` (dependency-line
  categories shown on click) that don't actually exist among their own
  assets — a data-integrity finding, independent of content, cheap to fix.
- The corpus's single most-repeated finding (drones as connective tissue
  across every warfighting function, not a subtopic under ISR/fires) and its
  clearest self-identified capability gap (counter-UAS as an integration
  problem, not a hardware problem) are **not taught by the platform at all**,
  despite the roster already carrying assets that would demonstrate both.

---

## 4. What's next

**Immediate decision point (this is the thing actually blocking further
work):** `LESSON_AUDIT.md` §6 proposes a **15-lesson final set** — 7 of the
current 10 kept (4 rewritten), 1 recast, 3 merged away, 7 new — plus a
`contested: true` flag mechanism for lessons the corpus itself warns not to
over-read (starting with the platform's own 60–70% claim). This needs an
explicit human decision before anyone edits `data/lessons.json`:

- Approve the proposed set as-is,
- Approve a subset (e.g. just the corrections, defer the new lessons), or
- Send back specific disagreements.

**Once `data/lessons.json` is approved and written**, `LESSON_AUDIT.md` §7
("Asset roster implications") is the direct input to **Pass 24**: it lists
which roster gaps are real (a wired/fibre-optic FPV strike drone, an
interceptor drone, a decoy/EM-signature-management set, a counter-UAS
battle-management node, a strategic-rear logistics hub, a training/adaptation
institution) versus which are pure mapping fixes that need no new asset at
all (five existing UGVs that already demonstrate the `logistics-is-counter-uas`
finding but aren't currently in that lesson's asset list; two existing
observation-post assets that fit `detectability-not-distance` better than the
satellite currently used; three existing artillery pieces that fit
`kill-chain-compression` better than HIMARS).

Per `CLAUDE.md`'s stated reading order (`CLAUDE.md` → `DECISIONS.md` →
`PLANNING.md`), whoever plans the next numbered pass should also fold this
into `docs/PLANNING.md`'s sequencing once the `data/lessons.json` decision is
made — this handoff doc is deliberately *not* a replacement for that, just
the bridge until the decision lands.

---

## 5. One thing worth carrying forward as a working habit

The failure mode this session corrected — a document that *looks* like the
right kind of source (right title, plausible structure) but is actually a
different kind of artifact (a catalog, not a synthesis) — is exactly the
failure mode Pass 22's own brief anticipated and asked the audit to catch.
It did catch it, correctly, on the first pass. The lesson for future passes
isn't "check documents more carefully" (that was already done) — it's that
**when a supplied source turns out to be wrong, correcting in place with every
change explicitly marked beats a silent rewrite.** A reader coming back to
`LESSON_AUDIT.md` cold can see exactly what was wrong, why, and what changed
because of it, without having to diff two versions of a 1,200-line file
themselves.
