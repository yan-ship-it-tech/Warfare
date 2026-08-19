# Backlog — things flagged, not yet resolved

Per explicit instruction: anything hit during a build pass that needs a
product decision or is blocked on something outside this session's control
gets listed here rather than silently dropped or silently worked around.

---

## Resolved this pass (Pass 5)

### 1. Real photos of equipment — done for 12 of 27, kept detail-panel-only
Sourced real, licensed photos (Wikimedia Commons, via `Special:FilePath`
stable URLs) for the 12 most recognizable named systems in Pass 4. Pass 5
moved them off the map entirely — a 32px marker was too small for a photo
to read at, and it fought the "clearly stylized" read the rest of the scene
now aims for — so they live only in the detail panel's Media section.

### 6. A 2.5D cross-section read — done, without the map
The literal geo-map (below) turned out to be the wrong vehicle for "more
3D." What actually shipped: a decorative per-lane background stagger +
brightness falloff (parallax), and a real altitude pop for air/space nodes
(a floating card on a tether down to its true position) — see
`docs/DECISIONS.md` Pass 5 for the mechanism and why it's safe (never
touches the coordinates the ruler and detail panel both read from).

### 12. Scene zoom
A uniform `transform: scale()` control (bottom-right, `viewState.sceneZoom`)
scales the whole scene — icons, terrain, everything — as one unit, with
scrolling staying correct at any zoom level. Answers "things should scale
when I zoom in" now that there's no map tile pyramid to tie zoom to.

### 13. Inline text editing in the detail panel
Role, employment notes, "what changed," and key characteristics each carry
their own "edit" control and independent reset, saved as a new `text`
override alongside placement and system-swap in
`src/state/overridesState.tsx`. Every section is now a bounded card with a
consistent header, which was most of what "looks disorganized" was about —
a flat run of paragraphs with uneven gaps wherever an asset happened to be
missing an optional field.

### 14. Upload your own picture or video
The Media section accepts files from your device. Pictures persist (capped
at 3 MB, re-encoded to a data URL, same override mechanism as everything
else). Video plays for the current session only, clearly labeled "not
saved" — see item 2 below for why, and item 11 for the real fix.

---

## Reverted this pass (Pass 5) — kept here so the reasoning isn't lost

### Literal satellite-photo map (was "resolved" in Pass 4)
Shipped in Pass 4 as MapLibre GL over real Esri imagery + AWS elevation
terrain, with assets projected onto real coordinates. Reverted after direct
user feedback: it read top-down and flat despite an explicit pitch/bearing
request (traced to a `fitBounds()` vs. `easeTo()` race — a findable, fixable
bug), but the bigger problem underneath wasn't a bug — every asset visually
bunched onto one line because real geographic distance (0 to 500+ km) can't
be laid out the way the app's own non-linear distance bands can, and the
photorealistic basemap read as a battle-management system rather than a
teaching tool. `src/map/` and the `maplibre-gl` dependency are gone; see
`docs/DECISIONS.md` Pass 5 for the full call. Real photos and a stylized
"more 3D" read both still shipped this pass, just by a different route
(items 1 and 6 above).

---

## Blocked — needs something from outside this session

### 2. Video that survives a page reload
`localStorage` cannot hold a real video file, so an uploaded clip plays via
`URL.createObjectURL` for the current session only. Unlike photos, there's
no "the visitor's browser fetches a public URL" trick available for a
*user-supplied* clip specifically — that only works for something with a
stable public URL already (a YouTube/Vimeo embed would work today if you
have a link; a file from your own device needs real storage). Real fix is
item 11 (a backend) — worth confirming whether an embed URL covers the
actual need before building that.

### 3. Real destroyed-infrastructure photography
Different, harder sourcing problem from equipment stills — provenance (real
vs. staged vs. a different conflict) matters more, and it sits closer to the
disclaimer's own line ("no placement here should be read as intelligence").
Deliberately not pulled in casually; worth a dedicated conversation about
sourcing standards first.

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

### 15. Domain rail can drift slightly out of sync at non-1 scene zoom
The floating domain-index rail on the left reads its click targets from raw
(unzoomed) `laneY()` values against the *visually* zoomed scroll container's
`scrollTop`. Clicking a rail entry still gets you to the right lane, but the
highlight/alignment can be a few pixels off when zoomed. Doesn't touch
asset placement or the ruler (both correct at any zoom) — cosmetic only,
worth a proper fix (feed `sceneZoom` into the rail's own math) alongside the
next zoom-related pass.

---

## Decided against for now, worth revisiting

### 7. Reset granularity: placement vs. system swap
"Reset to authored value" in the placement editor currently clears *both* a
distance/range edit and a catalog system-swap together, since both live in
the same per-asset override object. Text overrides (new this pass) already
got their own independent reset — worth giving placement/swap the same
split, just didn't fit in this pass.

### 8. Connection-line fan-out for dense hubs
Hovering a node isolates its own edges, which resolves most of the
legibility complaint. A node with many same-type edges converging on it
(Starlink, a logistics hub) can still look like a tangle before you hover
it. A proper fix would route parallel-ish edges with a small perpendicular
offset so they visually fan out even at rest — not done, hover is the
workaround for now.

### 9. Weather / conditions toggle
Carried over from the first pass at your own request ("interesting for the
future, not now") — mud slowing movement, rain/wind affecting drones, heat
affecting soldiers. Still just an idea, no design work done.

### 10. Flag-accurate side colors
Sides are named Ukraine/Russia, but the accent hues are still a generic
blue/red pairing left over from the "Side A/Side B" scaffold. Shifting
toward Ukraine's actual blue/yellow and something more specifically
Russia-coded than "enemy red" is a small, self-contained visual change —
still hasn't fit in any pass's priority order yet.

### 11. Real backend
Distance-band, placement, system-swap, text-edit, and uploaded-media
overrides all persist to this browser's `localStorage` only — not shared
across devices or people, and (for media specifically) capped by what
localStorage can hold at all. The natural next step (swap the local-storage
read/write in `src/state/overridesState.tsx` for real API calls) doesn't
require changing anything else in the data flow, but is a real scoped piece
of work, not a config toggle. This is the one blocker that keeps recurring
across passes (items 2's video-persistence problem is really this item
wearing a different hat) — worth prioritizing if another pass is coming.
