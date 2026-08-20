# Pass 13/14 Diagnostic — findings only, nothing fixed yet

Run against `claude/pass-13-14-diagnostic-6jrl6k` (HEAD `181d29f`) on 2026-08-20.
Diagnostic only — no code changes were made. This file exists so the findings
survive into a fresh session without re-running the investigation.

## 1. Current branch & Pass 13/14 commits

**Checked out:** `claude/pass-13-14-diagnostic-6jrl6k` (HEAD `181d29f`), branched off
`claude/warfare-digital-twin-scaffold-19u7kt` at the same tip.

Recent log:
```
181d29f Commit Pass 13-18 paste-in briefs and Pass 16 model sourcing manifest
39b6c4e Add docs/PLANNING.md — forward-looking brief for Passes 13-18
fc2706e Merge OSM rail/tree-line data pipeline + Pokrovsk extract
...
2a2b093 Pass 11: OSM rail/tree-line fetch pipeline (fetch blocked by egress, reduce stage verified)
6bcc301 Pass 10: terrain destruction gradient, coastal water, mixed biome
2031f0c Nav/IA pass: hamburger drawer, routed pages
b5ebdca Pass 8: split engagement vs. platform domain, real label declutter...
```

**No, it does not contain the work asked about** — and there's a naming collision
worth flagging explicitly:

- `docs/DECISIONS.md` already has sections literally titled **"Pass 13"** and
  **"Pass 14"**, but those refer to something else entirely: the *OSM
  rail/tree-line fetch pipeline* (Pass 13, fetch+reduce only) and *committing
  `pokrovsk.json`* (Pass 14). That work is real and merged.
- `docs/PLANNING.md` (added in commit `39b6c4e`, one commit before HEAD)
  **reuses the same numbers** for a different, not-yet-started scope: Pass 13 =
  "Performance and interaction" (perf overlay, drag gesture discriminator,
  label proximity/decluttering, pan/zoom fixes), Pass 14 = "World and terrain"
  (OSM terrain integration into the 3D scene).
- The repo currently only has the **planning brief** for that second Pass
  13/14 (`docs/CLAUDE_CODE_BRIEFS_PASS13-18.md`, `docs/PLANNING.md`). No
  implementation commits for the perf overlay, drag gesture discriminator,
  label proximity system, or OSM terrain integration exist anywhere in
  history, on any branch.

## 2. Deploy workflow / what's actually published

`.github/workflows/deploy-pages.yml` triggers on push to `main` or
`claude/warfare-digital-twin-scaffold-19u7kt`. There is no `gh-pages` branch —
it deploys via `actions/deploy-pages` (artifact upload), and **no `main`
branch exists in this repo at all** (`origin/main` doesn't resolve).

Actions run history confirms every push to
`claude/warfare-digital-twin-scaffold-19u7kt` has deployed successfully, most
recently:
```
181d29f  claude/warfare-digital-twin-scaffold-19u7kt  completed/success  2026-08-19T20:10:35Z
```
That's the current HEAD — `origin/claude/warfare-digital-twin-scaffold-19u7kt`
is already at `181d29f`, identical to this diagnostic branch. **There is no
stale-branch problem.** The live site is serving exactly what's in this repo
right now — which, per #1, is planning docs only, no Pass 13/14 code.

(Aside: the local checkout's non-`origin/` ref for
`claude/warfare-digital-twin-scaffold-19u7kt` is stale at `2671d0c` — an old
local branch pointer that never got fast-forwarded. Irrelevant to deploy,
since Pages builds off `origin`, but worth a `git fetch` before branching off
it next time.)

## 3. Dev-only FPS/draw-call overlay

**Does not exist.** Searched `src/` for `fps`, `draw-call`, `drawCalls`,
perf-overlay patterns — the only hits are:
- `src/bench/Bench.tsx` — a **pre-existing, unrelated** standalone benchmark
  page (`#bench` hash route), scaffolded in the very first commit (`8f5cdd7`,
  "Scaffold the multi-domain battlefield digital twin"). It's a DOM-vs-WebGL
  sprite fill-rate comparison harness, not a live in-scene readout, and
  predates Pass 13's brief by the entire project history.
- `src/three/props.ts` — just a code comment mentioning "draw call," unrelated.

So it's not "not rendering on the live site" — it was never built. Pass 13
item 1 ("add a dev-only frame-time/draw-call readout") is still an open brief
item.

## 4. `data/osm/pokrovsk.json`

**Exists** — 115,006 lines, committed in `30cca99` ("Add data/osm/pokrovsk.json
from a phone-supplied GeoJSON export").

**Not consumed anywhere.** Searched `src/` for `pokrovsk`, `osm/`, `loadOsm`,
`fetchOsm` — zero matches. Nothing in `src/three/` imports or reads this
file. This matches `docs/DECISIONS.md`'s own framing of Pass 13/14 (OSM
numbering) as "fetch + reduce; integration deferred" — the data pipeline
landed, the terrain-rendering integration (PLANNING.md's Pass 14 item 1)
never started.

## 5. Bottom line

The live GitHub Pages URL **is** serving the current build of
`claude/warfare-digital-twin-scaffold-19u7kt` — deploy is working correctly,
no branch/deploy misconfiguration exists. But that build contains **none** of
the Pass 13/14 work asked about (perf overlay, drag gesture discriminator,
label proximity system, OSM terrain integration into `src/three/`). Only the
forward-looking briefs for that work exist (`docs/PLANNING.md`,
`docs/CLAUDE_CODE_BRIEFS_PASS13-18.md`), added in the two commits immediately
before HEAD.

There's no "one command to fix the branch" — the branch and deploy pipeline
are already correct. What's missing is the implementation itself: Pass 13 and
Pass 14 (per `PLANNING.md`'s numbering) haven't been coded yet. Worth
flagging to whoever runs the next session: the Pass 13/14 label is now
ambiguous between two unrelated efforts in this repo's history —
`DECISIONS.md`'s existing Pass 13/14 sections (OSM pipeline) vs.
`PLANNING.md`'s Pass 13/14 (perf/interaction, terrain integration). That
collision could cause a fresh session to think "Pass 13/14" is already done
by skimming `DECISIONS.md` headers.
