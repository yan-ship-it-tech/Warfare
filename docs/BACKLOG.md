# Backlog — things flagged, not yet resolved

Per explicit instruction: anything hit during a build pass that needs a
product decision or is blocked on something outside this session's control
gets listed here rather than silently dropped or silently worked around.

---

## Resolved in Pass 7

### Grounding bug — land/sea assets floating on a tether
`marker.position.y = 7.5` (plus the tether line down to the ground) was
applied to every asset regardless of domain — correct for air/space, wrong
for a tank. Fixed by gating the elevated treatment on `DOMAIN_ALTITUDE[domain]
> 2` in `src/three/Scene3D.tsx`, which also preserves the `cyber_ew` /
`c2_comms` "mast-height emitter" tether from Pass 6 rather than narrowing it
to literally `air`/`space` as asked — see `docs/DECISIONS.md` Pass 7 for why.

### Pan sensitivity
OrbitControls tuned (`rotateSpeed`/`panSpeed`/`zoomSpeed`) and camera-target
panning clamped to the terrain strip's bounds, so a small drag produces small
movement and panning can't fly the camera off the generated terrain.

### Mobile overlap — bottom info panel over the canvas
The bottom-left stats panel and the 3D view's separate renderer-disclaimer
box were two independently-floating elements with no collapse state; on a
phone-width viewport they reliably collided. Merged into one `Legend`
component that collapses to a small `ⓘ` toggle by default under 680px.

### Sync worker — code written, not deployed
`worker/` (Cloudflare Worker + KV), dry-run verified. Still needs a human
with a Cloudflare account to actually deploy — see updated item 21 below,
which this doesn't close, just substantially de-risks.

### Terrain scenery
`src/three/scenery.ts` — trench lines, a concertina-wire/tank-obstacle belt,
a power plant, a fuel depot, a command post, and generic fighting positions,
matching the authored-geometry convention from Pass 6's hero-model tier
rather than sourced assets. Decorative only, not clickable.

### Content: 60 new assets from `equipment_catalog.xlsx`
Substantially closes old item 5 below (most of that list — T-90M, BMP-3,
2S19 Msta-S, TOS-1A, Bohdana, IRIS-T and more — are now full map assets, not
swap-only options). See `docs/DECISIONS.md` Pass 7 for the two self-caught
generation bugs and the verification numbers.

### Asset editor page
`src/components/AssetEditorPanel.tsx` — a new "Asset editor" page (toolbar
button, next to Data health) for building a brand-new asset from scratch —
category, side, placement, every schema field a shipped asset has — without
a code change or a spreadsheet round-trip. Saves into the same overrides
store as every other edit (`overridesState.tsx` → `persistence.ts`), so it's
exactly as durable/shared as a distance-band edit, and `loadWorld()` merges
it in and runs it through the same `validateAsset()` every shipped asset
gets, so it shows up in Data health identically. Two honest scope lines,
both stated in the page itself rather than faked: no separate icon upload
(the map icon was already chosen from Group/Category/Domain for every asset,
custom or not — Pass 5 decision, `src/icons/registry.tsx`), and no custom 3D
hero model (procedural TypeScript geometry compiled at build time, not
something a live page can inject — same scope line item 22 already draws
for 16 of the 27 originally-shipped assets). A "Copy JSON" button bridges
back to the existing file-based pipeline: paste the output into a real
`data/assets/*.json` file to make it auditable by
`scripts/audit-content.mjs`, which cannot see a browser-only asset directly.

---

## Resolved in Pass 6

### 16. Genuine 3D rendering
`src/three/` — WebGL scene, perspective camera, synthetic stylized terrain
strip, distance fog. Hybrid: WebGL draws the world, DOM `<button>`s stay the
labels and hit targets. Both views kept (3D leads, Schematic one click away).
See `docs/DECISIONS.md` Pass 6 §1.

### 17. 3D models for a hero tier
Eleven assets across both sides get real geometry, authored procedurally in
`src/three/models.ts` rather than sourced — see the upgrade path below for
the rest, and Pass 6 §2 for why authored beat sourced here.

### 18. Two-pass content pipeline
`docs/CONTENT_PIPELINE.md` + `scripts/audit-content.mjs`. Applied
retroactively to all 27 shipped assets: 19 verified, 1 low-confidence,
7 unverified — every one of them now says which it is, in its own panel.

### 19. Key Lessons page
`data/lessons.json`, 10 lessons seeded from `docs/doctrine.md`, each linked
to the assets that demonstrate it and able to fly the 3D camera to them.

### 20. Performance pass
Instanced scatter props (3 draw calls for ~1,900 objects), LOD on hero
models, device-aware prop budget, `React.lazy` on the whole 3D module
(main bundle 400 kB / 3D chunk 561 kB on demand), screen-space label
declutter.

### 11. Real backend — seam done, endpoint outstanding
`src/state/persistence.ts` makes storage pluggable and ships a real REST
adapter plus export/import. What is *not* done is standing up an endpoint —
see item 21 below, which is now the actual remaining work.

---

## Resolved in Pass 5

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

## Needs a decision from you, not code

### 21. Stand up a sync endpoint (the real remaining half of #11)
The adapter, the REST client, export/import and the storage badge all ship.
**Pass 7 wrote the actual Worker** (`worker/src/index.ts` — GET/PUT over KV,
CORS, an optional bearer-token gate, a body-size cap) and the deploy config
(`worker/wrangler.toml`), with a full walkthrough in
`docs/DEPLOY_SYNC_WORKER.md`. `npx tsc --noEmit` and `npx wrangler deploy
--dry-run` both pass. What's still missing is a URL: this session cannot
create a Cloudflare account or run the real `wrangler deploy` /
`wrangler secret put` against one, and the CI workflow already reads
`VITE_SYNC_URL` / `VITE_SYNC_TOKEN` from repo secrets, so once you deploy and
set those two secrets, the next push picks it up with no other change.
Until then the badge in the toolbar honestly reads "This browser only", and
Export/Import moves a working set between devices with no key involved.

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

### 22. Extend the hero-model tier beyond 11 assets
Eleven assets have real geometry; the other 16 (plus every future one) use
the marker + label treatment. That split is a deliberate scope line, not a
gap that was overlooked — the hero tier was chosen as what actually gets
clicked in a live demo. Extending it is mechanical: add a builder function
to `HERO_BUILDERS` in `src/three/models.ts` keyed by asset id, and the LOD,
instancing and selection wiring pick it up with no other change. Natural
candidates next: Starlink terminal, the Magura V5 USV, a logistics truck,
a casevac vehicle.

### 23. Close the 7 unverified assets
The composite nodes (logistics hubs, casevac chains, both power-plant
nodes, Strelets) are `unverified` — written from doctrine.md and general
knowledge. Legitimate for a node standing in for a class of thing rather
than a named system, but each should either earn two independent sources
or be explicitly re-labelled as a composite in its own copy. Follow
`docs/CONTENT_PIPELINE.md` pass 2. Also: six otherwise-verified assets
carry `estimated` costs and are flagged as such — cost verification is the
narrower, harder half.

### 5. Build out the remaining catalog entries as full map assets
Mostly closed by Pass 7's 60-asset import — T-90M, BMP-3, 2S19 Msta-S,
TOS-1A, Bohdana, IRIS-T and the rest of the original ~39 swap-only options
are now full map assets with their own placement and narrative. What's left
is systems neither catalog spreadsheet has covered at all: fixed-wing/rotary
air power (Su-35S, Su-34, Ka-52, F-16), a submarine and a surface combatant
(Kilo-class, Ada-class corvette — partial overlap with the Russia
naval/Black Sea Fleet category gap below), Bradley, and man-portable ATGMs
(Javelin, NLAW — overlap with the infantry/small-arms category gap below).
No source document for any of these yet, so no guessed placements — same
"not started" honesty as the category-gap list.

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

---

## Category gaps — not started, no source yet

Per your explicit instruction: listed plainly rather than filled with
guesses, matching the Category Tracker sheet's own honesty convention. Every
one of these is a real category in `data/groups.json`'s conceptual space (or
an obvious candidate for a new one) with **zero assets and no source
document behind it yet** — not deprioritized, not decided against, just not
started.

- **Space** — no space-domain assets exist despite `domain: "space"` being a
  real value in the schema (see `side_a-space-isr-satellite-commercial`,
  which is ISR, not a dedicated space-domain platform). Recon/comms
  satellites beyond the one commercial-ISR node, GPS-denial context, ASAT —
  nothing sourced.
- **C2 / comms** — two assets exist (Starlink terminal, the Ukrainian
  Integrated Air Defense C2 Network node, plus Russia's Strelets terminal),
  but the category is thin relative to how much of `docs/doctrine.md` §6
  (force structure, distributed kill chains) actually depends on C2/comms
  specifically.
- **Medical / casevac** — one composite node per side (`*-medical-casevac-chain`,
  both `unverified` — see item 23), no named systems (specific casevac
  vehicles, evac drone variants) at all.
- **Engineering / fortification (asset-level)** — distinct from Pass 7's
  terrain *scenery* (item 5 above, decorative, not clickable). This is the
  gap in the asset roster itself: no engineering vehicles (mine-clearing
  vehicles beyond Uran-6, bridging equipment, dozers) as their own
  data-carrying, clickable assets.
- **Infantry positions / small arms** — `infantry` is a real group in
  `data/groups.json` but **zero assets use it** — genuinely empty, not just
  thin. Fighting positions as data (distinct from Pass 7's decorative
  scenery version, which is deliberately not clickable), man-portable ATGMs
  (Javelin, NLAW — see item 5 above), small arms: none of it exists yet.
- **EW as its own asset category** — correction while writing this: `ew` is
  already a real, structurally distinct group in `data/groups.json` (not
  folded into anything else), so this gap isn't structural. It's breadth:
  `docs/doctrine.md` §4 treats EW as a load-bearing layer everything else
  depends on, and only two assets carry the `ew` group
  (`side_a-ew-jammer-bukovel`, `side_b-ew-jammer-zhitel`) against that much
  narrative weight — passive RF triangulation, the "unofficial EW fields"
  finding, hard-kill interceptor layers — none of it represented as its
  own asset yet.
- **Russia naval / Black Sea Fleet** — one composite node
  (`side_b-naval-fleet-black-sea`, `verified`, 2 sources) stands in for the
  entire Russian naval presence, next to two named Ukrainian USVs (Magura,
  MANTAS, Sonobot) plus Pass 7's new Ukrainian naval assets. No named
  Russian vessels (the Kilo-class submarine and Ada-class corvette from item
  5 above would start this) at all.

### Hero-tier desired but not yet built (7 assets)
The equipment_catalog.xlsx sheet flagged 7 of the 60 Pass 7 imports as
"Hero tier" in its own tracking column: Bayraktar TB2, UJ-26 Beaver (Bober),
FP-1/FP-2, T-90M, S-400, Shahed-136/Geran-2, Kurier. None got a
`HERO_BUILDERS` entry this pass — they shipped as marker+label assets like
everything else in the batch, consistent with item 22's existing scope line
(hero tier is a deliberate subset, not automatic for every new asset). Not
silently dropped: recorded here as the natural next 7 candidates when
extending the hero-model tier, ahead of the item-22 list from Pass 6.
