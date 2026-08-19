# Backlog — things flagged, not yet resolved

Per explicit instruction: anything hit during a build pass that needs a
product decision or is blocked on something outside this session's control
gets listed here rather than silently dropped or silently worked around.

---

## Resolved this pass

### 1. Real photos of equipment — done for 12 of 27
Was blocked on the wrong assumption: this *session* can't fetch binary
images, but a *deployed page's* `<img src="https://...">` is fetched by the
visitor's own browser, outside this sandbox entirely. Sourced real,
licensed photos (Wikimedia Commons, via `Special:FilePath` stable URLs) for
the 12 most recognizable named systems — see `docs/DECISIONS.md`, Pass 4.
Remaining ~15 assets (abstract nodes, and two deliberately-generic
"representative infrastructure" placeholders) intentionally left without a
forced photo — see item 3 below for why the power-plant nodes specifically
stay as-is.

### 3'. A real photomap — done, with a scope narrower than "destroyed infrastructure"
Real satellite basemap + real elevation terrain shipped this pass (MapLibre
GL, `src/map/MapView.tsx`) — see Pass 4 in `docs/DECISIONS.md`. What did
*not* ship: destroyed-infrastructure imagery specifically. That's a
separate, harder sourcing problem from "a real basemap" — provenance (real
vs. staged vs. a different conflict) matters more there, and it sits closer
to the disclaimer's line ("no placement here should be read as
intelligence"). Still flagged below as its own open item, deliberately not
bundled into the basemap work.

---

## Blocked — needs something from outside this session

### 2. Video of each asset "doing its typical job"
No video fetch or generation capability exists in this session. Unlike
photos, there's no equivalent "the visitor's browser fetches it" trick for
video that this pass exposed — a real `<video src>` pointing at a real
hosted clip would work the same way in principle (worth trying the same
approach used for photos: search for a permissively-licensed clip's stable
URL), but wasn't attempted this pass. Reasonable next step before writing
this off as blocked again.

### 3. Real destroyed-infrastructure photography
See "Resolved this pass" above — the basemap itself is done; this item is
now specifically about sourcing photography of *actual damaged sites* to
attach to specific asset nodes, which is a deliberate sourcing-standards
conversation (provenance, specificity, the disclaimer's own red line), not
a technical blocker anymore.

---

## Scoped but not built — needs a session, not a decision

### 4. Populate "notable moments" across the roster
Schema and UI are built and proven on 3 assets (Magura V5's first USV kill,
Operation Spiderweb, Gepard's 10-drone engagement). Extending it to the rest
of the 27 assets — and to new ones as they're added — is straightforward
but is real per-asset research work, same shape as the original asset
build-out. Natural to do category-by-category like the rest of the content.

### 5'. Connections overlay on the Map view
The dependency-line overlay (supply/data-C2/casevac/...) only renders in
Schematic view. It's the same `world.connections` data and the same
`geoPlacement()` coordinates each endpoint already has — drawing them as a
MapLibre GeoJSON line layer between marker positions is mechanical, just
didn't fit this pass alongside getting the map itself shipped.

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

### 6. True oblique/3D-elevated perspective — resolved via the map view
The schematic Scene still can't get this safely (see the original note
below — it stays fixed for that reason). But the actual want here — a
tilted, elevated, aerial read of the battlefield — now exists for real in
the new Map view (`src/map/MapView.tsx`, Pass 4): a genuine 3D camera
(`pitch`/`bearing`) over real elevation terrain, with its own independent
coordinate system (`src/map/geoPlacement.ts`) that never touches the
schematic Scene's node/ruler math. Original note, kept for context: removed
from the schematic view because the previous implementation applied the
"oblique" offset to actual node/ruler coordinates, silently breaking the
distance-matches-position guarantee (up to ~400px off at the deepest lane)
— correctness won there, and stays won; the 3D read now lives on the map
instead of being smuggled into the schematic one.

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
