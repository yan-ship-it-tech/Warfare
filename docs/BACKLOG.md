# Backlog — things flagged, not yet resolved

Per explicit instruction: anything hit during a build pass that needs a
product decision or is blocked on something outside this session's control
gets listed here rather than silently dropped or silently worked around.

---

## Blocked — needs something from outside this session

### 1. Real photos of equipment
This environment cannot download binary images from the open web — the
egress policy blocks image hosts (Wikimedia's upload host came back
policy-denied, not a transient failure) and the page-fetch tool available
here converts pages to article text, not binary image data. There is no
path to a downloaded photograph from inside this session.
**Unblocks if:** you supply image files directly (a batch of equipment
photos, screenshots, whatever you have) — those can be read locally and
embedded with zero network involved, sidestepping the constraint entirely.

### 2. Video of each asset "doing its typical job"
Same blocker as #1, and harder: no video fetch or generation capability
exists in this session at all.
**Unblocks if:** you supply video files directly. Worth scoping file
size/format constraints once real footage exists — a single-file build has
a 16MB ceiling, so video likely means this stops being a single-file
artifact and becomes something that needs real hosting.

### 3. A real photomap with destroyed infrastructure
Same blocker as #1 for the imagery itself. Separately worth flagging: real
destroyed-infrastructure photography is a more sensitive sourcing problem
than equipment photos — provenance (real vs. staged vs. from a different
conflict) matters a lot more, and it sits closer to the line the tool's own
disclaimer draws ("not a live or historical map... no placement here should
be read as intelligence"). Worth a deliberate conversation about sourcing
standards before pulling this in, not just a technical fix.

---

## Scoped but not built — needs a session, not a decision

### 4. Populate "notable moments" across the roster
Schema and UI are built and proven on 3 assets (Magura V5's first USV kill,
Operation Spiderweb, Gepard's 10-drone engagement). Extending it to the rest
of the 27 assets — and to new ones as they're added — is straightforward
but is real per-asset research work, same shape as the original asset
build-out. Natural to do category-by-category like the rest of the content.

### 5. Build out the remaining catalog entries as full map assets
Your two catalogs carry ~53 systems; 14 are currently placed on the map with
full narrative (role/employment/contrast) and are also swap targets for
their `comparison_group`. The other ~39 (T-90M, BMP-3, 2S19 Msta-S, TOS-1A,
Su-35S, Su-34, Ka-52, the Kilo-class submarine, Bradley, Bohdana, IRIS-T,
F-16, Javelin, NLAW, the Ada-class corvette, and more) exist only as swap
*options* for an existing slot's dropdown — they don't have their own
placement or doctrine-level writeup yet. Next natural expansion pass.

---

## Decided against for now, worth revisiting

### 6. True oblique/3D-elevated perspective
Removed this pass because the previous implementation applied the "oblique"
offset to actual node/ruler coordinates, silently breaking the
distance-matches-position guarantee (up to ~400px off at the deepest lane) —
correctness won. A version that gets the diagonal, elevated-viewpoint look
back *without* touching coordinates the ruler and detail panel both have to
agree with is still worth doing: apply a perspective transform to a purely
decorative background layer (terrain art), never to the layer nodes and the
ruler are positioned on. Bigger lift than a quick fix; needs its own pass.

### 7. Reset granularity: placement vs. system swap
"Reset to authored value" in the placement editor currently clears *both* a
distance/range edit and a catalog system-swap together, since both live in
the same per-asset override object. Splitting these into independent resets
is a small, contained fix — just didn't fit in this pass.

### 8. Connection-line fan-out for dense hubs
Hovering a node now isolates its own edges (this pass's fix for "which line
is this"), which resolves most of the legibility complaint. A node with many
same-type edges converging on it (Starlink, a logistics hub) can still look
like a tangle before you hover it. A proper fix would route parallel-ish
edges with a small perpendicular offset so they visually fan out even at
rest — not done, hover is the workaround for now.

### 9. Weather / conditions toggle
Carried over from the first pass at your own request ("interesting for the
future, not now") — mud slowing movement, rain/wind affecting drones, heat
affecting soldiers. Still just an idea, no design work done.

### 10. Flag-accurate side colors
Sides are now named Ukraine/Russia (done this pass), but the accent hues are
still a generic blue/red pairing left over from the "Side A/Side B"
scaffold. Shifting toward Ukraine's actual blue/yellow and something more
specifically Russia-coded than "enemy red" is a small, self-contained visual
change — didn't fit in this pass's priority order.

### 11. Real backend
Distance-band and per-asset placement/swap edits persist to this browser's
`localStorage` only — not shared across devices or people. The natural next
step (swap the local-storage read/write in `src/state/overridesState.tsx`
for real API calls) doesn't require changing anything else in the data flow,
but is a real scoped piece of work, not a config toggle.
