# Backlog — things flagged, not yet resolved

Per explicit instruction: anything hit during a build pass that needs a
product decision or is blocked on something outside this session's control
gets listed here rather than silently dropped or silently worked around.

---

## Open — Pass 14 (world and terrain)

### Three side_a naval drones still sit on dry ground
`Sonobot-5` (60 km), `MANTAS T-12` (83 km), `Magura V5` (120 km) are
`domain: "sea"` but the coastal
water rework (`docs/DECISIONS.md` Pass 14 §4) deliberately stopped short of
reaching them: their worldX (≈85–104) sits just inside the 105-unit inlet
threshold chosen specifically to avoid submerging them or their neighbours
regardless of `lateralLayout`'s hash-assigned Z. Real fix needs either the
distance-from-front review Pass 15 already owns ("review every asset's
distance-from-front for doctrinal plausibility... add `placement_rationale`")
or a way to give a specific asset a fixed Z ahead of the layout pass — worth
deciding which when Pass 15 starts, not guessing at now.

### `road`/`river` OSM feature classes fetched but not rendered
`data/osm/pokrovsk.json` has 99 roads and 3 rivers; `scripts/build-osm-inset.mjs`
doesn't carry either into the derived `pokrovsk.inset.json`, and
`osmTerrain.ts` doesn't draw them. The brief's item 1 asked for rail
extrusion + tree instancing specifically — this is a scope trim, not a
missed requirement, but the data is sitting there for whoever wants to
extend the inset next.

### `data/osm/kramatorsk.json` still doesn't exist
Same blocker as every prior pass that touched this: the fetch can't run
inside an agent sandbox (egress proxy 403s Overpass and every mirror). The
phone/GeoJSON-export route that produced `pokrovsk.json` (`docs/OSM_PIPELINE.md`)
would get it. Once fetched, it needs its own `scripts/build-osm-inset.mjs
--aoi=kramatorsk` run and its own inset placement — likely on side_b, to
balance the roster of "real terrain" patches across sides.

### The coastal bridge was verified numerically, not visually
`docs/DECISIONS.md` Pass 14 §5/Verification: the destroyed bridge + pontoon
crossing's geometry was confirmed correct by sampling `terrainHeight()`
along its actual span (collapsed segment lands on genuinely-submerged
ground, deck clears both ground and water everywhere else), after several
screenshot attempts failed to find the exact camera angle for a small
set-piece at this scale. Worth a direct look before Pass 15 sites anything
near it (side_a, world-X ≈ −112, z 42–60).

### Scene3D's bundle grew ~165 KB (gzipped ~56 KB) for the OSM inset
585 KB → 750 KB minified, 152 KB → 208 KB gzipped, from
`data/osm/pokrovsk.inset.json` (~140 KB) plus the new rendering code. Already
trimmed once (the derived-file split in `docs/DECISIONS.md` Pass 14 §1 exists
specifically to keep this number down) — further reduction would mean
compressing the inset data itself (e.g. quantised/delta-coded coordinates)
or deferring the inset's own construction behind a second lazy boundary
inside Scene3D. Not attempted here; flagged rather than left unmeasured.

---

## Open — Pass 13 (performance and interaction)

### The drop hitch is halved, not eliminated
Dropping a dragged asset (or any other placement edit) writes to the overrides
store, which re-runs `loadWorld()` and rebuilds every asset group in the 3D
scene. Pass 13 took that frame from **104 ms to 54 ms** — shared geometry for
the marker/ring/fill, and a per-asset material cache so the first
`renderer.render()` after a rebuild isn't binding ~270 brand-new materials
(profiling: `loadWorld()` 1.2 ms, disposal 1.0 ms, building 91 groups 4.5 ms —
the rest was the render).

What's left is three's own object and render setup for 91 freshly built
groups. Removing it means replacing the rebuild-everything-on-any-override
effect in `Scene3D.tsx` with an **incremental update** — diff the new node set
against `entriesRef.current`, move what moved, add/remove only what changed.
That is a real change to how the scene effect is structured and was
deliberately not smuggled into a performance pass. Worth doing before Pass 15,
which adds swap/duplicate mechanics that will hit this same path far more
often than a drag does.

### Draw calls are halved, and the remaining half is the assets
845 → 426 with the scenery and hero models merged (`src/three/mergeStatic.ts`).
Roughly 280 of what remains is three draws per asset — marker, side ring, side
fill. Collapsing those into per-side `InstancedMesh` would take it to a
handful, but scenario-focus mode modulates **opacity per asset**, and instanced
rendering has no per-instance opacity without either a custom shader or
switching the rings to additive blending. Both change how the Pass 8 side ring
looks, which Pass 13's regression guard explicitly forbids. Deferred with the
reason recorded rather than attempted and reverted. Revisit alongside Pass 16,
which has to think about instancing anyway.

### Frame time was never measured on real hardware
Every number in `docs/DECISIONS.md` Pass 13 comes from Chromium on
SwiftShader — a software rasteriser, no GPU in this sandbox. Draw calls, CPU
ms and React commits transfer; **frame time does not** (it is fill-bound and
sits near 170 ms regardless of what the CPU side does). Someone with a real
device should run `node scripts/perf-probe.mjs` against a deployed build and
record the frame-time column, which is the only column this environment cannot
speak to.

---

## Blocked / open — Pass 11 (OSM rail & tree-line pipeline)

### The Pokrovsk fetch — resolved (Pass 12); Kramatorsk still open
`scripts/fetch-osm-data.mjs` is written and its reduce/projection half is
exercised and deterministic, but no agent session can run the *fetch*: this
environment's egress proxy answers 403 to CONNECT for `overpass-api.de`
and every mirror tried (`kumi.systems`, `private.coffee`, `osm.ch`,
`z.`/`lz4.overpass-api.de`, `api.openstreetmap.org`). Host-allowlist
denial, so it will not resolve by retrying. Pass 12 got the *data* in
anyway, from the user's own phone: overpass-turbo's GeoJSON export (the
one format iOS Safari reliably turns into a real download/paste-able blob,
unlike a raw JSON API response), pasted into chat, saved to a file, and fed
through a new GeoJSON branch in `--raw=`. `data/osm/pokrovsk.json` is
committed. `data/osm/kramatorsk.json` still needs the same treatment — see
`docs/OSM_PIPELINE.md`.

### Pokrovsk rail data — resolved (Pass 13); it's real, it's just `disused`
Turned out not to be missing at all: querying `way["railway"="rail"]` alone
returns one 5 m fragment because almost none of Pokrovsk's rail network is
tagged the active value. A follow-up `way["railway"]` (any value) query
returned 306 ways, 299 of them `railway=disused` — a large former
Soviet-era freight yard, still mapped in full geometric detail, just not
flagged as operating. `classify()` in `scripts/fetch-osm-data.mjs` now
treats `disused`/`abandoned`/`construction`/`narrow_gauge` as `rail_line`
alongside `rail` (excluding `platform` and the explicit `railway=no`, which
are stations, not track); the two exports were merged (1 duplicate way
deduped) and `data/osm/pokrovsk.json` rebuilt: 303 rail features, ~229 km of
alignment (the bbox's "any node inside" rule pulls in a lot of full-length
ways whose real extent is far larger than the 17 km AOI — expected Overpass
behavior, not a bug). Every rail feature keeps its original `railway=*`
value in `tags`, so a renderer that wants to distinguish "still operating"
from "disused yard" can.

### ODbL attribution is owed the moment anything renders
OSM data requires a visible "© OpenStreetMap contributors" credit. The
string ships inside every output file's `source` block, but nothing draws
it yet. Whoever does the integration pass owes it a place on screen —
`AboutPage` and/or a corner credit in the view that draws the lines.

### Real geography vs. the band-compressed X axis — a product decision
The scene's X axis is non-linear distance-from-the-zero-line, not metres
(`src/three/worldMapping.ts`, `docs/DECISIONS.md` Pass 5/6). A 17 km AOI
laid over it at the default bands crosses band boundaries and stretches
non-uniformly, which visibly bends a straight rail line. Three ways out —
metric inset inside one band, lateral-only (Z) use, or a separate
real-geography view — are laid out in `docs/OSM_PIPELINE.md`. This needs
picking *before* extrusion/instancing code is written, and it is a
different question from the renderer diagnostic (3D meshes vs. 2.5D
sprites) the integration prompt is already waiting on.

### Multipolygon forests are not fetched
The brief's queries select ways only, and the script follows that. Large
forests mapped as OSM *relations* will be missing. Worth revisiting once
there is real data to look at and the tree coverage can be judged.

---

## Resolved in Pass 10

### Terrain destruction gradient
`src/three/terrain3d.ts` — a `damageIntensity(x)` function keyed on fixed
world-X thresholds (matching the default projection's 5/20/50 km stops)
drives ground-colour scorch tint and treeline colour/height across four
tiers: total destruction at the line, damaged mid-bands, lighter damage
further out, mostly-intact deep rear. `props.ts`'s wreck-husk field and
`scenery.ts`'s hand-placed ruined villages/wreck markers use the same
gradient so the discrete objects and the ground under them agree.

### Body of water — the Black Sea, and a place for Russia-naval
`buildWater()` in `terrain3d.ts` carves a coastal basin into the side_b
deep rear and draws a shaded water plane over it; `buildPortHarbor()` in
`scenery.ts` sits right at the shoreline. Closes most of the Russia
naval/Black Sea Fleet gap below — see that entry, now moved out of "not
started."

### Mixed biome across the strip
`scenery.ts` gains village clusters at three condition tiers (ruined/
damaged/intact), an urban cluster, and a ruined-infrastructure set-piece,
hand-placed by (side, km, z) the same way the existing power-plant/fuel-
depot/command-post landmarks already were. Rolling steppe and forest belts
were already the existing terrain/props aesthetic; fields are a coarse
vertex-colour patchwork on dry mid/far ground rather than new geometry.

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
are now full map assets with their own placement and narrative. Pass 10
closed the Kilo-class submarine off this list too (now a real asset —
`side_b-naval-kilo-636-3` — see the Russia naval gap entry below). What's
left is systems neither catalog spreadsheet has covered at all: fixed-wing/
rotary air power (Su-35S, Su-34, Ka-52, F-16), Bradley, and man-portable
ATGMs (Javelin, NLAW — overlap with the infantry/small-arms category gap
below). **Correction while writing this pass:** the Ada-class corvette
listed here in an earlier pass is Ukrainian (side_a) — the Turkish-built
`Hetman Ivan Mazepa`, Ukraine's own first corvette — not a Russian system.
Bundling it with the Russia naval gap was wrong; it belongs on this list as
a side_a candidate instead, still not built.
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
- ~~**Russia naval / Black Sea Fleet**~~ — no longer a "not started" gap as
  of Pass 10, which added two real named vessels
  (`side_b-naval-kilo-636-3`, `side_b-naval-admiral-grigorovich`, both
  `verified`) alongside the existing composite node
  (`side_b-naval-fleet-black-sea`). Still thin relative to a real fleet
  order of battle — no surface combatants beyond the one frigate class, no
  corvettes, no landing ships, no coastal defense (Bastion-P) — but the
  category itself is real now, not a placeholder. Kept here, struck rather
  than deleted, so the "this used to be empty" context isn't lost.

### Hero-tier desired but not yet built (7 assets)
The equipment_catalog.xlsx sheet flagged 7 of the 60 Pass 7 imports as
"Hero tier" in its own tracking column: Bayraktar TB2, UJ-26 Beaver (Bober),
FP-1/FP-2, T-90M, S-400, Shahed-136/Geran-2, Kurier. None got a
`HERO_BUILDERS` entry this pass — they shipped as marker+label assets like
everything else in the batch, consistent with item 22's existing scope line
(hero tier is a deliberate subset, not automatic for every new asset). Not
silently dropped: recorded here as the natural next 7 candidates when
extending the hero-model tier, ahead of the item-22 list from Pass 6.

### Dangling gallery image (found Pass 8, not fixed)
`data/assets/side_a-uav-reconnaissance-tactical.json` (Leleka-100) lists
`gallery/leleka-100-launch.jpg` in `gallery_images`. No such file exists —
it has 404'd on every page load since Pass 6 introduced it. Surfaced by
Pass 8's headless smoke pass, which logs failed responses.

Left alone deliberately: Pass 8 was scoped to rendering only, and this is a
content defect. Two possible fixes for whoever picks it up — drop the entry,
or supply the image — but note the repo's standing constraint that binary
assets are never fetched in an agent session (see "Authored geometry only" in
CLAUDE.md and Pass 6 §2), so dropping the entry is the option available
without a human.

Worth a broader sweep at the same time: nothing currently validates that a
`gallery_images` / `icon_image` path actually resolves, so there may be
others. A path-existence check would fit naturally into
`scripts/audit-content.mjs`.
