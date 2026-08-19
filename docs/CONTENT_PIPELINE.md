# Content pipeline — drafting and verification are two passes, not one

Adding assets used to be ad hoc: research a system, write it, ship it, and let
the `sources` array carry whatever turned up along the way. That produced
content of genuinely uneven confidence with no way to tell which was which
from the outside. This is the process that replaces it.

The rule that makes it work: **the pass that drafts a claim is never the pass
that verifies it.** Drafting is optimistic by nature — you are reconstructing
how a system is employed and reaching for numbers to support it. Verification
is adversarial: it asks whether each number would survive somebody checking.
Doing both in one sitting collapses them into "I found a page that agreed
with me," which is the failure mode this splits apart.

---

## Pass 1 — draft a whole category at once

Work in **category batches**, never one-off assets: all air-defence variants,
then all UGVs, then all naval drones. Batching is not just efficiency —
drafting a category together is what surfaces the comparisons that make the
tool useful (why this SAM sits at 30 km and that one at 4 km) and keeps the
`key_facts` labels consistent enough to actually compare across a category.

For each asset in the batch:

1. Copy the skeleton (click any pending stub in the app → "Copy JSON skeleton",
   or start from a sibling in the same category).
2. Fill in placement (`distance_km_from_zero`, `operating_range_km`) against
   `docs/doctrine.md` §2, not against intuition.
3. Write the narrative fields — `short_role`, `characteristics`,
   `employment_notes`, `contrast_vs_traditional`. `contrast_vs_traditional`
   pulls its framing from `docs/doctrine.md` rather than being reinvented.
4. Record every source you actually used as you go, in `sources`. **Do not
   pad this array.** An honest single source is worth more than three links
   that all trace back to the same press release.
5. Set `cost.confidence` honestly: `reported` only for a real published
   transaction or contract figure, `estimated` for a derived range,
   `unknown` when no clean unit price exists.
6. Leave `verification` alone. It is not hand-written — see pass 2.

Do not verify while drafting. Finish the batch.

## Pass 2 — verify the same batch, separately

A later, deliberately separate sitting over the same batch. For each claim
that a reader could check — specifications, ranges, unit cost, employment
patterns — find whether it holds up, and add the sources that show it.

Then run the audit:

```bash
node scripts/audit-content.mjs           # report only
node scripts/audit-content.mjs --write   # stamp `verification` into each file
```

### The bar

| Status | Requirement |
|---|---|
| `verified` | **≥2 independent named sources** |
| `sourced_low_confidence` | exactly 1 named source |
| `unverified` | general knowledge / `doctrine.md` only |

**"Independent" is the load-bearing word**, and the audit script enforces it
rather than trusting a link count:

- Sources are grouped by **registrable host**. Three links to one outlet count
  once. Two outlets both syndicating one wire story are not independent in
  spirit; if you notice that, drop one.
- **Wikimedia Commons links are excluded from the count entirely.** They were
  added in Pass 4 as photo credits. An image credit evidences the photograph,
  not the range or the price, and letting one promote an asset to "verified"
  would be exactly the dishonesty this bar exists to prevent. (This caught a
  real case: the T-72 entry appeared to have two sources and actually had one
  plus a photo credit.)
- **Wikipedia counts but is tracked.** It is a named, independent reference
  work, but it is tertiary. An asset resting *only* on Wikipedia-family
  sources is reported as `[tertiary-only]` and should get a primary or trade
  source before it is treated as settled.
- **Cost is audited separately from specs.** An asset whose specifications
  clear the bar but whose `cost.confidence` is still `estimated` gets an
  explicit note saying so, because in a procurement conversation the cost
  figure is the one most likely to be challenged.

`verification` is derived, never authored. That is deliberate: a hand-written
confidence field drifts away from the citations underneath it, and a stale
"verified" stamp is worse than no stamp.

### What the reader sees

The detail panel shows the status next to **Sources** — `verified · N sources`,
`1 source only`, or `unverified` — plus any audit notes. Nothing is hidden
behind a build script; the confidence of a claim is part of the claim.

---

## Retroactive audit of the 27 shipped assets

Applied as of the date stamped in each file's `verification.last_audit`.
Result:

| Status | Count |
|---|---|
| `verified` (≥2 independent) | 19 |
| `sourced_low_confidence` | 1 |
| `unverified` | 7 |

Two things the audit surfaced that a link count would have missed:

1. **T-72** looked verified and was not — its second "source" was a Wikimedia
   Commons photo credit. It has since been genuinely verified against Army
   Technology and Weaponsystems.net for armament and protection, and is now
   `verified` on the real bar.
2. **Six otherwise well-sourced assets carry estimated costs.** Their specs
   clear the bar; their prices do not. Each now says so in its own panel.

The 7 `unverified` assets are the composite/abstract nodes — logistics hubs,
casevac chains, the two representative power-plant nodes, and the Strelets C2
entry. These were written from `doctrine.md` and general knowledge, which is
legitimate for a representative node standing in for a class of thing rather
than a specific system, but they are flagged rather than quietly passing.
Closing them is tracked in `docs/BACKLOG.md`.

---

## Adding a new category — the checklist

- [ ] Draft the whole category in one sitting (pass 1). No verification yet.
- [ ] Every asset has 3 `key_facts` with labels consistent across the category.
- [ ] `cost.confidence` honestly set on every asset.
- [ ] Separately, later: verification sitting over the same batch (pass 2).
- [ ] `node scripts/audit-content.mjs --write`.
- [ ] Anything still `unverified` is either fixed or added to the backlog —
      never left silent.
