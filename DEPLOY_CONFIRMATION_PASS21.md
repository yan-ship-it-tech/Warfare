# Deploy confirmation — Pass 21 merged to deploy branch and live

Diagnostic only, written the same way as `RECONCILIATION_DIAGNOSTIC.md`. All output below
is quoted from real commands run against `yan-ship-it-tech/Warfare` on 2026-08-20.

**Headline finding, up front:** Pass 21 is merged into the deploy branch, the
`deploy-pages` Action ran and succeeded against that exact commit, and GitHub's own
deploy step reports the Pages publish itself succeeded. The one thing this session
could **not** do is independently re-fetch the live `github.io` URL from inside this
sandbox to eyeball it — that host is policy-blocked at the network layer, confirmed
three separate ways below, not a transient failure. That's stated plainly in §4 rather
than rounded up to "confirmed live and viewed."

## 1. Dev branch was a clean descendant of deploy — not diverged

```
$ git fetch origin
 * branch            claude/warfare-digital-twin-scaffold-19u7kt -> FETCH_HEAD
 * branch            claude/pass-numbering-performance-ngrgn2 -> FETCH_HEAD

$ git merge-base --is-ancestor origin/claude/warfare-digital-twin-scaffold-19u7kt origin/claude/pass-numbering-performance-ngrgn2
$ echo "exit code: $?"
exit code: 0
```

Pass — the deploy branch tip (`b4b50c3`) is a real ancestor of the dev branch tip
(`f622c3f`). This is exactly what the prior turn's report claimed: the dev branch was
already deploy-plus-new-commits, not diverged, because it had been merged with the
deploy branch (`e36d7ae`) before Pass 21's content work started.

## 2. Merge to deploy — fast-forward, no conflicts

```
$ git checkout -B claude/warfare-digital-twin-scaffold-19u7kt origin/claude/warfare-digital-twin-scaffold-19u7kt
Switched to and reset branch 'claude/warfare-digital-twin-scaffold-19u7kt'

$ git merge origin/claude/pass-numbering-performance-ngrgn2 --no-edit
Updating b4b50c3..f622c3f
Fast-forward
 RECONCILIATION_DIAGNOSTIC.md                | 244 ++++++++++++++++++++++++++++
 data/assets/side_a-uav-switchblade-300.json |   8 +-
 data/connections.json                       |   6 +
 data/lessons.json                           |  41 ++---
 docs/BACKLOG.md                             |  40 +++++
 docs/DECISIONS.md                           | 162 ++++++++++++++++++
 docs/PLANNING.md                            |  54 ++++--
 7 files changed, 516 insertions(+), 39 deletions(-)
 create mode 100644 RECONCILIATION_DIAGNOSTIC.md
```

Fast-forward, exactly as predicted by §1 — no merge commit, no conflicts, nothing to
resolve. Deploy branch tip is now `f622c3f`, identical to the dev branch tip.

```
$ npm run build
✓ 269 modules transformed.
✓ built in 9.34s
```

Clean before pushing.

## 3. Push and the `deploy-pages` Action

```
$ git push -u origin claude/warfare-digital-twin-scaffold-19u7kt
To https://github.com/yan-ship-it-tech/Warfare
   b4b50c3..f622c3f  claude/warfare-digital-twin-scaffold-19u7kt -> claude/warfare-digital-twin-scaffold-19u7kt
```

Workflow run picked up immediately (queried via the GitHub MCP tools, which carry
their own credentials — separate from this sandbox's own egress proxy, see §4):

```
run id:        32374915181
name:          Deploy to GitHub Pages
display_title: "Pass 21: scenario rework (Key Lessons)"
head_branch:   claude/warfare-digital-twin-scaffold-19u7kt
head_sha:      f622c3f78b55a7ee0b470bb1402c39af8bfa48f1
status:        completed
conclusion:    success
created_at:    2026-08-20T13:33:08Z
updated_at:    2026-08-20T13:34:17Z
```

`head_sha` matches the pushed commit exactly. Job steps, in order, all `success`:

```
1. Set up job                         success
2. actions/checkout@v4                success
3. actions/setup-node@v4              success
4. npm ci                             success
5. npm run build                      success   (13:33:45 -> 13:33:59)
6. actions/configure-pages@v5         success
7. actions/upload-pages-artifact@v3   success
8. actions/deploy-pages@v4            success   (13:34:02 -> 13:34:13)
9. Post actions/setup-node@v4         success
10. Post actions/checkout@v4          success
11. Complete job                      success
```

`actions/deploy-pages@v4` — the step that actually publishes to GitHub's Pages
hosting, not just builds an artifact — reports `success`, completing at 13:34:13Z.

## 4. Spot-check on the live site — genuinely blocked, not skipped

Attempted three independent ways to reach `https://yan-ship-it-tech.github.io/Warfare/`
from inside this session, to confirm the kill-chain-compression lesson no longer shows
Lancet and does show the Switchblade 300 -> Leleka-100 connection:

```
$ curl -sS -o /dev/null -w "%{http_code}\n" https://yan-ship-it-tech.github.io/Warfare/
curl: (56) CONNECT tunnel failed, response 403

$ curl -sS -x "$HTTPS_PROXY" -o /dev/null -w "%{http_code}\n" https://yan-ship-it-tech.github.io/Warfare/
curl: (56) CONNECT tunnel failed, response 403
```

The session's own egress-proxy status endpoint confirms this is a policy denial, not a
flaky host:

```
$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
"recentRelayFailures": [
  {"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial or upstream failure)","host":"yan-ship-it-tech.github.io:443"},
  {"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial or upstream failure)","host":"yan-ship-it-tech.github.io:443"},
  {"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial or upstream failure)","host":"yan-ship-it-tech.github.io:443"}
]
```

Third attempt via the `WebFetch` tool (a different fetch path than this sandbox's local
proxy) hit the same wall:

```
WebFetch(https://yan-ship-it-tech.github.io/Warfare/)
-> {"error_type":"EGRESS_BLOCKED","domain":"yan-ship-it-tech.github.io",
    "message":"Access to yan-ship-it-tech.github.io is blocked by the network egress proxy."}
```

This is the same class of environment limitation `docs/DECISIONS.md` has documented
since Pass 3–4 (binary/arbitrary-host fetches denied by this session's egress policy) —
not something to route around, and not evidence of anything wrong with the deploy
itself. It means this session cannot personally load the rendered page and look at it.

**What's confirmed instead, as the closest honest substitute:**
- The commit GitHub Pages actually deployed (`f622c3f`) is the literal commit this
  session pushed, built, and had already screenshot-verified locally (headless
  Chromium against `npm run preview`, four scenarios, before the merge in §2) — the
  merge from §2 was a pure fast-forward that changed no file content, so the locally
  verified tree and the deployed tree are byte-identical for `data/lessons.json`,
  `data/connections.json`, and `data/assets/side_a-uav-switchblade-300.json`.
- `git show f622c3f:data/lessons.json | grep -c "side_b-uav-strike-lancet"` against the
  `kill-chain-compression` entry specifically (not the file overall — Lancet still
  appears deliberately in three *other* lessons) confirms the asset list for that one
  lesson is `["side_a-uav-reconnaissance-tactical", "side_a-artillery-himars-m142",
  "side_a-artillery-m777", "side_a-uav-switchblade-300"]` — no Lancet, Switchblade
  present — which is what was screenshotted running locally against this same commit.
- The Action's own `npm run build` step (identical command to the one this session ran
  locally) succeeded against this exact commit, and `actions/deploy-pages@v4` reports
  the publish itself succeeded.

What is **not** independently confirmed: this session did not load the public URL in a
browser and see it render. That would need either a network-policy exception for
`github.io` or a human checking the link directly.

## 5. Plain statement

**The full push (Passes 16–21) is confirmed merged to a single commit on the deploy
branch and confirmed built + published by GitHub Actions.** It is not personally
verified rendering correctly in a live browser from inside this session — that check is
network-blocked, not skipped by choice.

- **Live commit SHA:** `f622c3f78b55a7ee0b470bb1402c39af8bfa48f1`
- **Deploy branch:** `claude/warfare-digital-twin-scaffold-19u7kt` (pushed, matches origin)
- **Deploy run:** `32374915181` — `success`, completed `2026-08-20T13:34:17Z`
- **Live URL (not independently loaded this session):** https://yan-ship-it-tech.github.io/Warfare/

If a human check of that URL is wanted, that's the one remaining step — same category
of "this session can't reach that host" limitation documented elsewhere in this repo
for image hosts and the Overpass API, not specific to this deploy.
