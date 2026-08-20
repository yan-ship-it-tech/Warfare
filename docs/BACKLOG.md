# Backlog — things flagged, not yet resolved

Per explicit instruction: anything hit during a build pass that needs a
product decision or is blocked on something outside this session's control
gets listed here rather than silently dropped or silently worked around.

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

### ODbL attribution — resolved (Pass 17)
Read off the loaded file's own `source.attribution`, rendered as a
persistent corner credit in the 3D view (`.scene3d__osm-credit`) and stated
again in `AboutPage.tsx`. Verified visible with the exact attribution text
against a running build, not just present in the source.

### Real geography vs. the band-compressed X axis — resolved (Pass 17), Option 1
Metric inset, per the decision already recorded in `PLANNING.md`'s
do-not-relitigate table: the AOI draws at its own true scale (derived live
from the projection at one anchor point, not the compressed axis) inside
`op_near`, side_a, 17 km — a local patch, not a claim about the whole map.
`src/three/osmTerrain.ts`; anchor/scale derivation and clipping approach in
`docs/DECISIONS.md` Pass 17.

### Multipolygon forests are not fetched
The brief's queries select ways only, and the script follows that. Large
forests mapped as OSM *relations* will be missing. Worth revisiting once
there is real data to look at and the tree coverage can be judged.

---

## Open after Pass 17 (world and terrain)

### Draw calls: 845/865 (Pass 16) → 1140 (Pass 17) → 767 (Pass 19) — resolved
Not from the OSM inset (disciplined by design: 4 draw calls total for the
whole rail/road/river/tree layer). From the destroyed bridge, pontoon
crossing, and ten new `TERRAIN_FEATURES` — each a handful of individually-
authored meshes, the same hand-placed-landmark convention `LANDMARKS`
already used for every village and power plant, just ~40 more of them.
**Pass 19 brought the ceiling down to 767** — the marker/ring/fill
instancing shader (1140→892) plus instancing `buildTrenchLines()`/
`buildFightingPositions()` (892→767) — despite adding ~19 new hero models
(5 UGVs, human figures, Pass 18's fortification geometry) on top. The
individually-authored bridge/pontoon/TERRAIN_FEATURES meshes from this
entry were left as-is (not instanced — they're unique landmarks, not
repeated geometry, so instancing wouldn't apply per Pass 6's own reasoning);
the actual win came from the repeated geometry Pass 16 already flagged.
See `docs/DECISIONS.md` Pass 19 for the full before/after and the
independent cross-check.

### Kramatorsk still needs fetching
`data/osm/kramatorsk.json` doesn't exist yet (same egress block as always —
see the Pass 11 entry above). The Pass 17 integration (`osmTerrain.ts`) is
written against Pokrovsk specifically (one hardcoded anchor/AOI); a second
inset would need at minimum a second anchor point and probably a second
`buildOsmInset()` call parameterized by AOI, not a code change to the
clipping/ribbon-building logic itself.

### `terrain3d.ts`'s river is a second hardcoded fixed-world-X feature
Same convention as the Pass 10 coastal basin and the destruction gradient —
deliberate (`terrainHeight()` has to stay a pure `(x,z)` function; see that
file's header) but worth naming: a future band-editing UI that lets users
reshape the strip more dramatically would need to reconsider whether the
river's world-X placement should track live bands the way `worldXFor`-based
landmarks already do.

---

## Resolved in Pass 18 (tactical asset placement)

### `placement_rationale`, doctrinal review, terrain siting, human/positional layer, roster swap
Full detail in `docs/DECISIONS.md` Pass 18. Summary: all 103 assets (89 shipped + 14 new) carry
a sourced `placement_rationale`; three real distance corrections were found on review (NASAMS,
TOS-1A, Sonobot-5); 14 straight-line-rank duplicates were nudged apart; `src/three/
tacticalSiting.ts` sites terrain-affine categories onto Pass 17's real ground (forest patches,
elevated treelines, built-up blocks, defended landmarks); the `infantry` group is no longer
empty (see the struck entry above); `RosterSwapPicker` gives every asset a same-category swap,
reusing Pass 11's `duplicateAsset()` mechanism rather than rebuilding it.

## Open after Pass 18

### Only one asset sits on real, committed rail geometry
`side_a-logistics-ammo-point-railhead` genuinely sits on a real `data/osm/pokrovsk.json` rail
vertex. Its `side_b` counterpart (`side_b-logistics-ammo-point`) uses the generic built-up-block
terrain-affinity siting instead, honestly, because no committed OSM data exists for that side —
same root cause as the pre-existing `kramatorsk.json` gap above. Once a second AOI/side gets real
OSM data, `tacticalSiting.ts`'s OSM-railhead special case is written narrowly (one hardcoded
asset id) and would need generalizing rather than just duplicating.

### Swap mechanism has no UI-level "reset"/cleanup for accumulated clones
Each roster swap and each Duplicate writes a permanent `customAssets` entry (same store, same
persistence as every other override). Nothing currently offers "remove this clone" from the
detail panel the way placement/text overrides get an independent reset (`docs/BACKLOG.md` #7) —
the Asset Editor page can delete a custom asset, but that's a separate page, not a one-click
action from the clone's own detail panel. Not a data-integrity problem (nothing is silently
lost), just a workflow gap worth closing if swap/duplicate see heavy use in a live session.

### Human/positional layer is illustrative density, not an order of battle
6 new `infantry`-group assets (one squad, one dugout, one OP per side) represent the layer
conceptually, matching this map's existing "representative, not measured" convention for every
composite node — not a claim about how many squads/dugouts/OPs actually exist along the front.
Extending density (more duplicates, more variety — e.g. a distinct MG/ATGM position) is
mechanical from here (the swap/duplicate mechanisms already support it) but wasn't done blindly
in this pass to avoid implying false precision about troop density.

---

## Resolved in Pass 19 (3D model integration)

### Per-instance-opacity shader, marker/ring/fill instancing, material palette governance
Full detail in `docs/DECISIONS.md` Pass 19. Summary: the shader Pass 16 deferred is built
(`src/three/Scene3D.tsx`'s `withInstancedOpacity()`); marker/ring/fill are 3 `InstancedMesh`es
instead of ~309 individual draws; `scenery.ts`'s trench/fighting-position geometry is instanced
too. Draw calls: 1140 → 767. `src/three/palette.ts` (new) is the shared vehicle/hero material
list Pass 12 asked models.ts to keep growing rather than duplicating; `scenery.ts`'s own 3
measurably-redundant material pairs are merged into literal aliases and `SCENERY_MATERIALS`
ships as the governance list. All 5 Russian UGVs, human figures for the 4 Pass-18 personnel
categories, and Pass 18's 3 fortification categories got real authored geometry — 19 new
`HERO_BUILDERS` entries.

## Open after Pass 19

### A second, looser material near-duplicate cluster — measured, not fixed
`BRIDGE_DECK_BROKEN`/`PONTOON_MAT`/`EARTH_MOUND`/`REBAR`/`PIER_WOOD`/`CONCRETE_DARK`/`DIRT_WALL`
(`scenery.ts`) all sit within ~16 RGB units of each other — real, measured drift, mostly
Pass-17-era, found via the same RGB-distance sweep that caught the 3 pairs Pass 19 did fix.
Not attempted in the same pass as the shader/instancing/new-geometry work — the risk of "fixed
four things while quietly breaking a fifth" outweighed finishing the whole cluster in one sitting.
A future pass should re-run the same distance check (`docs/MODEL_STYLE_GUIDE.md` has the method)
before deciding which of these seven, if any, should merge — some of the closeness may be
narratively appropriate (bridge rubble and riverbank mud plausibly *are* similar tones) rather
than genuine redundancy the way the 3 already-merged pairs were.

### Draw-call ceiling for whoever touches `src/three/` next: 767
Real, HUD-measured, independently cross-checked (see `docs/DECISIONS.md` Pass 19). Any future
pass adding meshes to the 3D scene should measure against this the same way Pass 16 established
the discipline in the first place — not "feels about the same."

### 6 of the original 7 catalog-flagged hero-tier candidates still unbuilt
Bayraktar TB2, UJ-26 Beaver (Bober), FP-1/FP-2, T-90M, S-400, Shahed-136/Geran-2 — see the
"Hero-tier desired but not yet built" entry below (Kurier, the 7th, got a builder in Pass 19,
though for an unrelated reason — it was one of the 5 unsourced Russian UGVs).

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
declutter. **Extended in Pass 16** with the measurement that was missing —
see `DECISIONS.md` Pass 16 for the frame-time instrument, the before/after
numbers and the standing draw-call budget.

### 11. Real backend — seam done, endpoint outstanding
`src/state/persistence.ts` makes storage pluggable and ships a real REST
adapter plus export/import. What is *not* done is standing up an endpoint —
see item 21 below, which is now the actual remaining work.

---

## Resolved in Pass 21 (scenario rework)

### Every lesson audited against its own assets' text; five content bugs fixed
Full detail in `docs/DECISIONS.md` Pass 21. The brief's one named bug (`kill-chain-
compression`'s Russian Lancet) plus four more of the same shape, found by checking each
lesson's assets against their own `short_role`/`employment_notes` rather than just the
lesson's title: `pattern-of-life-detection`, `fiber-optic-immunity`, `distributed-kill-
chains`, `deep-rear-is-reachable`. Two lessons that genuinely needed both sides
(`ew-invisible-battlefield`, `drone-attrition-share`) got explicit per-side narration.
Two Pass 18 positional assets (`side_a-c2-position-command-post`, the two `*-medical-
point-forward` assets) swapped in for older, worse-fitting assets. One new connection
added (Switchblade 300 → Leleka-100), mirrored in `connections.json`. Scenario-focus
dimming re-verified against Pass 19's instanced markers — reads correctly.

## Open after Pass 21

### No wired-FPV strike drone asset — `fiber-optic-immunity` uses ground robots instead
`docs/doctrine.md` §5's source for this lesson (`[FPV Tactics Guide]`) is specifically a
Ukrainian catalogue of **Russian FPV** tactics, including a "wired FPV — fiber-optic
control link, immune to RF jamming" pattern. No asset on the map is an aircraft-type FPV
strike drone with a documented fiber-optic control option — `side_b-uav-strike-lancet`
(the asset previously used here) is RF-only per its own characteristics (40–50 km radio
control radius). Pass 21 substituted the two ground robots that *do* document a real
fiber-optic option (`side_a-ground-robots-nrtk-ironclad`, `side_b-ground-robots-kurier`),
with the lesson text honest that these aren't aircraft. Building (or sourcing content for)
a genuine wired-FPV strike-drone asset would close this properly.

### No strategic-rear-band (200+ km) logistics asset — `deep-rear-is-reachable` uses the deepest one that exists (80 km)
Only two logistics-hub assets exist on the whole map: `side_a-logistics-hub-op-deep` (80
km, `op_deep` band) and `side_b-logistics-hub-op-near` (18 km, `op_near` band — inside the
drone-dense corridor, not remotely a "sanctuary"). `connections.json`'s own
`_note_unresolved_ids` already documents that `side_a-logistics-hub-strategic-rear` is a
referenced-but-never-built pending stub. Pass 21 used the 80 km hub for
`deep-rear-is-reachable` as the closest available illustration and said so honestly in
the lesson text, but a real strategic-rear-band logistics asset (200+ km, matching the
band the two power-plant strategic targets already sit in) would be a stronger fit than
any currently-built asset.

---

## Open after Pass 20 (detail page, imagery, symbology)

### MIL-STD-2525 symbology is detail-panel only — the map still uses the old hand-drawn icon set
Pass 20 replaced the "arbitrary" symbol the brief called out — the detail
panel's header badge and hero-image fallback — with a real milsymbol.js SIDC
(`src/symbology/`). `src/icons/registry.tsx`'s `resolveIcon()` is untouched
and still drives every other consumer: both map renderers
(`src/three/`, `src/scene/AssetNode.tsx`) and `AssetLibraryPage`'s list
icons. Extending real symbology to the map itself is a real integration
project, not a follow-on tweak — Pass 16's constraint that the 3D render
loop must never touch React state per frame, and that per-frame DOM writes
are the whole performance budget, means swapping ~89 markers to
server-rendered SVG needs its own scoping (label-grid interaction, draw-call
budget, the Pass 19 instancing work all touch the same surface). Worth
doing once Pass 19's shader/instancing work lands, not before.

### 2 assets still show the no-photo placeholder despite being GREEN in the ledger
`side_b-naval-admiral-grigorovich` (Admiral Grigorovich-class frigate) and
`side_b-uav-kub-1` (ZALA KUB-1) are both marked GREEN in
`imagery-sourcing-ledger.xlsx`, but Pass 20 could not pin either to one
specific still image: Grigorovich's ledger category
(`Category:Admiral_Grigorovich_(ship,_2016)`, 5 files) never surfaced a
specific filename through a direct re-check; Kub-1's only resolved match was
a `.webm` video, not a still. Both fall back to the honest placeholder
treatment rather than a guessed filename. A follow-up pass with a working
`WebFetch`/browse path to `commons.wikimedia.org` (currently policy-blocked
at the host level, not just for binaries — see `docs/DECISIONS.md` Pass 20)
could resolve these directly from the category page instead of via search
snippets.

### `Asset.image`'s license string is often a generic fallback, not a specific tag
Where the ledger's own notes named a license (`CC BY-SA 4.0`, `Public domain
(US DoD)`, ...) it was carried through; where a category was only confirmed
to exist without a per-file license note, `image.license` reads "See Commons
file page for license" rather than a guessed tag — honest, but weaker than
the specific tags roughly half the roster has. Closing this needs reading
each individual file's own license template, which needs the same blocked
`commons.wikimedia.org` fetch path above.

---

## Open after Pass 16 (performance and interaction)

### Draw calls next ceiling — resolved, Pass 19
Pass 16 established the budget: **845 draw calls / 68,992 triangles / 513
geometries** at the default framing (~468 draw calls zoomed in, frustum
culling). Roughly 273 of those were the per-asset marker + side ring + fill
trio. Instancing collapses that to ~3 — but `InstancedMesh` has no
per-instance opacity without a custom shader, and scenario-focus dimming
animates exactly that per asset, so it wasn't a drop-in. Pass 16 took the
free half (3 shared geometries instead of 273 near-duplicate uploads);
**Pass 19 built the shader** (`withInstancedOpacity()`, `Scene3D.tsx`) and
converted the trio to real `InstancedMesh`es, bringing the ceiling (by then
grown to 1140 via Pass 17) down to 892, then to 767 after also instancing
`scenery.ts`'s trench/fighting-position geometry. See `docs/DECISIONS.md`
Pass 19.

### Still no test suite
Pass 16 leans harder on this than any pass so far: `npm run build` passed
green while every label in the 3D view sat at the top-left corner, and again
while labels never rendered at all until the camera was touched. Both were
caught by looking at a screenshot, not by any check. The 23-assertion
Playwright script written for this pass is not committed as a suite — it
lives in the pass, same as every prior smoke pass. `PLANNING.md`'s
cross-cutting section already calls for regression tests on the Pass 8
invariants; add the Pass 16 ones (labels are positioned on first paint;
a drag does not select) at the same time.

### `?perf=1` / the HUD is a diagnostic, not a product surface
The frame-time readout ships enabled in dev and reachable in production via
the nav drawer or `?perf=1`. That is deliberate — a performance budget you
cannot read on the deployed site is not a budget. It has had no design pass
and overlaps the header legend on very narrow viewports (mitigated, not
solved, by a max-width: 620px rule). Decide whether it stays visible to end
users before the tool is briefed to an audience.

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
- ~~**Infantry positions / small arms**~~ — no longer empty as of Pass 18,
  which added 6 real, clickable `infantry`-group assets (dismounted rifle
  squad, fighting position/dugout, observation post — × 2 sides), distinct
  from Pass 7's decorative, unclickable trench/fighting-position scenery.
  Still thin relative to a full order of battle: man-portable ATGMs
  (Javelin, NLAW — see item 5 above) and small arms as their own assets
  don't exist yet. Kept here, struck rather than deleted, per this file's
  own "Russia naval" convention below.
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

### Hero-tier desired but not yet built (6 of the original 7 — Kurier done, Pass 19)
The equipment_catalog.xlsx sheet flagged 7 of the 60 Pass 7 imports as
"Hero tier" in its own tracking column: Bayraktar TB2, UJ-26 Beaver (Bober),
FP-1/FP-2, T-90M, S-400, Shahed-136/Geran-2, Kurier. None got a
`HERO_BUILDERS` entry at the time — they shipped as marker+label assets like
everything else in the batch, consistent with item 22's existing scope line
(hero tier is a deliberate subset, not automatic for every new asset).
**Kurier got one in Pass 19** (`ugvKurier`, `src/three/models.ts`), as one of
the 5 Russian UGVs the 3d-model-sourcing-manifest flagged as unsourceable —
built for that reason, not chosen off this list, but it closes this entry
for Kurier specifically. The other 6 (Bayraktar TB2, UJ-26 Beaver, FP-1/FP-2,
T-90M, S-400, Shahed-136/Geran-2) remain the natural next candidates when
extending the hero-model tier further, ahead of the item-22 list from Pass 6.

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
