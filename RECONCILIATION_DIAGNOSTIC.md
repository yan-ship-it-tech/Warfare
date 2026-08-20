# Reconciliation diagnostic — Pass 17–19 vs. Pass 20 branch

Diagnostic only. No code was changed. All output below is quoted from real
commands run against `yan-ship-it-tech/Warfare` on 2026-08-20.

**Headline finding, up front: no reconciliation has happened.** The premise
in the task brief — "a separate session has since reconciled the two" — is
not reflected anywhere in the repository. The deploy branch tip is still
exactly the Pass 19 commit (`e3dc40a`), the Pass 20 branch is still sitting
untouched at its own tip (`441196c`), there is no merge commit, no rebase,
no PR, and no new `deploy-pages` run. Details below.

## 1. Current deploy branch state

```
$ git fetch origin claude/warfare-digital-twin-scaffold-19u7kt
 * branch            claude/warfare-digital-twin-scaffold-19u7kt -> FETCH_HEAD

$ git rev-parse origin/claude/warfare-digital-twin-scaffold-19u7kt
e3dc40afe9a146e234e9cb4c37cc363224ebc67d
```

Current HEAD of the deploy branch is **`e3dc40a`** — the literal Pass 19
commit, unchanged since the Pass 19 confirmation.

```
$ git log --oneline -15 origin/claude/warfare-digital-twin-scaffold-19u7kt
e3dc40a Pass 19: 3D model integration (part 2 — geometry, materials, instancing)
cca1191 Pass 19 (WIP): per-instance-opacity shader, marker/ring/fill -> InstancedMesh
4aed067 Pass 18: tactical asset placement
8d0afe0 Pass 17: world and terrain
5b45d6e Add docs/imagery-sourcing-ledger.xlsx — the file Pass 20 depends on
f4c86cd Update PLANNING.md: mark Pass 16 done, carry its findings into 17-21
bd04cba Pass 16: performance and interaction in the 3D view
1681d2c Renumber PLANNING.md passes 13-18 -> 16-21 to end collision with DECISIONS.md
181d29f Commit Pass 13-18 paste-in briefs and Pass 16 model sourcing manifest
39b6c4e Add docs/PLANNING.md — forward-looking brief for Passes 13-18
fc2706e Merge OSM rail/tree-line data pipeline + Pokrovsk extract
411fa2b Merge remote-tracking branch 'origin/claude/warfare-digital-twin-scaffold-19u7kt' into claude/osm-rail-tree-pipeline-fmtc6z
6f7e9ee Widen rail classification: Pokrovsk's rail network is mostly railway=disused
30cca99 Add data/osm/pokrovsk.json from a phone-supplied GeoJSON export
6e52f26 Add plain-language OSM pipeline handoff doc
```

There is **no commit after `e3dc40a`** — no reconciliation/merge commit, no
Pass 20 content, nothing. Passes 16–19 are a straight-line sequence of
direct pushes to this branch, not PR merges (confirmed in §2).

Ancestry check for all four requested commits, run individually:

```
$ git merge-base --is-ancestor bd04cba origin/claude/warfare-digital-twin-scaffold-19u7kt && echo PASS
bd04cba (bd04cba88cada92d1cf8034b5de41da9714080ed): ANCESTOR = PASS   # Pass 16
8d0afe0 (8d0afe0593a62e8c8a64dc39855489d704d85182): ANCESTOR = PASS   # Pass 17
4aed067 (4aed067cec966e664f295a879292540a8d07dfd8): ANCESTOR = PASS   # Pass 18
e3dc40a (e3dc40afe9a146e234e9cb4c37cc363224ebc67d): ANCESTOR = PASS   # Pass 19 (= branch tip itself)
```

All four: **PASS**. (Pass 19's commit *is* the branch tip, so its "ancestor"
check is trivially true — it's not evidence of any additional
reconciliation work beyond what was already confirmed for Pass 19 alone.)

## 2. How the reconciliation actually happened

**It didn't.** There is no merge, no rebase, and no PR touching the Pass 20
branch anywhere in the repository's history or on GitHub.

**Branch-point / operation type.** The reflog for the deploy branch shows a
clean, linear sequence of direct pushes — no merge commits, no rebase
rewrites:

```
$ git reflog show origin/claude/warfare-digital-twin-scaffold-19u7kt
e3dc40a ...@{0}: update by push
4aed067 ...@{1}: update by push
8d0afe0 ...@{2}: update by push
5b45d6e ...@{3}: update by push
f4c86cd ...@{4}: update by push
bd04cba ...@{5}: update by push
181d29f ...@{6}: fetch ...: fast-forward
```

Each of Pass 16 through Pass 19 landed as an "update by push" — i.e.
committed directly onto this branch and pushed, the same pattern this very
diagnostic session's own designated branch (`claude/pass-numbering-performance-ngrgn2`)
was used for (its local reflog shows Pass 18 and Pass 19 built there, then
fast-forwarded into the deploy branch — confirming these were sequential
direct-push passes on the deploy line, not PR merges).

**The Pass 20 branch was never touched.** `claude/detail-page-imagery-symbology-vlnlic`
still sits exactly where it did when the Pass 20 report was written:

```
$ git fetch origin claude/detail-page-imagery-symbology-vlnlic
$ git rev-parse origin/claude/detail-page-imagery-symbology-vlnlic
441196c69990c48f1feb3292ed3faae4cc096542

$ git log --oneline -15 origin/claude/detail-page-imagery-symbology-vlnlic
441196c Pass 20: detail page rework, sourced imagery, MIL-STD-2525 symbology
5b45d6e Add docs/imagery-sourcing-ledger.xlsx — the file Pass 20 depends on
f4c86cd Update PLANNING.md: mark Pass 16 done, carry its findings into 17-21
bd04cba Pass 16: performance and interaction in the 3D view
...
```

Its reflog has exactly one entry — the original fetch, nothing since:

```
$ git reflog show origin/claude/detail-page-imagery-symbology-vlnlic
441196c refs/remotes/origin/claude/detail-page-imagery-symbology-vlnlic@{0}: fetch origin --prune: storing head
```

**Cross-ancestry check (the direct test for "did either branch absorb the
other"):**

```
$ git merge-base --is-ancestor e3dc40a[Pass19] origin/claude/detail-page-imagery-symbology-vlnlic → NO
$ git merge-base --is-ancestor 441196c[Pass20] origin/claude/warfare-digital-twin-scaffold-19u7kt → NO
```

Neither branch contains the other's tip. Their only common ancestor is
`5b45d6e` ("Add docs/imagery-sourcing-ledger.xlsx"), exactly where Pass 20
originally branched off, before Pass 17 (`8d0afe0`) landed on the deploy
line. Confirmed by scanning every remote ref for one that contains both
tips as ancestors — none exists:

```
origin/claude/detail-page-imagery-symbology-vlnlic : has-pass19=no has-pass20=yes
origin/claude/warfare-digital-twin-scaffold-19u7kt  : has-pass19=yes has-pass20=no
(all other remote branches: has-pass19=no has-pass20=no)
```

**No conflicts to report, because no merge/rebase attempt exists in history
to have produced any.**

**PR check** — only one PR exists in the repo's entire history, and it's
unrelated (the Pass 11 OSM pipeline PR, merged 2026-08-19, base
`claude/warfare-digital-twin-scaffold-19u7kt`):

```
$ list_pull_requests(state=all)
#1  "Pass 11: OSM rail/tree-line fetch pipeline..."  merged 2026-08-19T19:26:59Z
    head: claude/osm-rail-tree-pipeline-fmtc6z → base: claude/warfare-digital-twin-scaffold-19u7kt
```

No PR was ever opened for Pass 20, and none for any reconciliation.

**`git range-diff` against the original Pass 20 branch:** not meaningful to
run — the "original" and "current" Pass 20 branch tip are the same ref
(`441196c`, one commit, untouched since it was authored). There is nothing
to diff against; it was never replayed or rebased anywhere.

## 3. Deploy confirmation

```
$ actions_list(list_workflow_runs, deploy-pages.yml)  — most recent run
id: 32363902037
head_branch: claude/warfare-digital-twin-scaffold-19u7kt
head_sha: e3dc40afe9a146e234e9cb4c37cc363224ebc67d
status: completed
conclusion: success
created_at: 2026-08-20T11:27:34Z
updated_at: 2026-08-20T11:28:11Z
```

This is **the same run ID already cited in the Pass 19 confirmation**
(`32363902037`, commit `e3dc40a`, success). All 27 recorded `deploy-pages`
runs target `claude/warfare-digital-twin-scaffold-19u7kt`; scanning the
full list, no run exists against any commit newer than `e3dc40a` — no run
against `441196c` (Pass 20) and no run against any reconciliation commit,
because none was ever pushed.

**The most recent successful run's commit SHA matches the current branch
tip exactly** (`e3dc40a` = `e3dc40a`). What's live is exactly what's on the
branch — but what's on the branch is still only Pass 19. Pass 20 has never
been deployed.

## 4. Feature spot-check

All checked directly against the current checkout, which is HEAD `e3dc40a`
(this session's own designated branch, `claude/pass-numbering-performance-ngrgn2`,
is itself pinned to `e3dc40a` — identical commit to the deploy branch tip).
`npm run build` was re-run clean from this commit first (tsc + vite, 190
modules, no errors) to confirm the checkout is buildable, not just present.

**Pass 17 — present.**
- `src/three/osmTerrain.ts` exists (16,068 bytes).
- Destroyed bridge + pontoon crossing confirmed in `src/three/scenery.ts`:
  `buildDestroyedBridge()` (line 461), `buildPontoonCrossing()` (line 508),
  both instanced into the scene (`scenery.ts:889-894`, comment: "Bridge dead
  centre of the strip (z=0); pontoon offset 14 units along Z").

**Pass 18 — present.**
- `placement_rationale` present on all 103 of 103 asset files in
  `data/assets/*.json` (`grep -l` count matches file count exactly — not
  reverted to 89).
- `src/three/tacticalSiting.ts` exists (10,431 bytes).

**Pass 19 — present.**
- `withInstancedOpacity()` defined in `src/three/Scene3D.tsx:288`, used to
  build `MARKER_INSTANCED_MAT`/`RING_INSTANCED_MAT`/`FILL_INSTANCED_MAT`
  (lines 344/356/362) and referenced again in comments at 1033/1253.
- Draw-call count measured live via the perf HUD (`?perf=1`), headless
  Chromium against a fresh `npm run build` + `npm run preview`, after a
  15s warm-up on swiftshader software rendering:
  ```
  draw calls: 765          (Pass 19 report: ~767 — within run-to-run noise,
  triangles: 147,668         same order of magnitude, not a regression)
  geom / prog: 711 / 12
  assets / titled: 105 / 16
  occl. probes: 56
  ```
  fps was 1–2 and frame time 500–800ms in this headless run — expected for
  CPU/swiftshader software rendering under Playwright, not a real
  regression signal; it's the same measurement method `docs/DECISIONS.md`
  uses throughout, just slow hardware.

**Pass 20 — absent**, exactly as expected given §1/§2:
- No `milsymbol` reference anywhere in `src/` or `package.json`
  (`grep -rli milsymbol` returns nothing).
- No `.image` field usage in `src/components/DetailPanel.tsx`.
- `src/types.ts` still only has the pre-Pass-20 `icon_image` /
  `gallery_images` fields (lines 110-111) — no new `Asset.image` field
  wired from `imagery-sourcing-ledger.xlsx`.
- Did not check the 3-column key-facts grid CSS fix specifically beyond
  this — moot, since the branch containing it was never merged.

## 5. Bottom line

**The live site is Pass 16–19 only, correctly and completely — but it is
not a superset of Pass 20, because Pass 20 was never merged, rebased, or
deployed.** The task brief's premise that "a separate session has since
reconciled the two" does not hold up against the actual repository state:
the deploy branch (`claude/warfare-digital-twin-scaffold-19u7kt`) sits at
the identical commit (`e3dc40a`) and identical successful `deploy-pages` run
(`32363902037`) already confirmed for Pass 19 — nothing has been added to
it since. The Pass 20 branch (`claude/detail-page-imagery-symbology-vlnlic`)
is untouched at its original tip (`441196c`), still based on a point before
Pass 17 landed, with no merge commit, no rebase, no PR, and not even an
attempt visible in any reflog or remote ref. There is nothing uncertain
about this: every check above — branch tips, reflogs, cross-ancestry,
PR list, and the Actions run list — agrees, so `PLANNING.md` and the next
brief should be written on the basis that **Pass 20 still needs to be
merged into the deploy branch from scratch**, not that it already has been.
