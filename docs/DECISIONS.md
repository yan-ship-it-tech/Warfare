# Build decisions — steps 1–4 (+5)

Written against the master prompt's build sequence. Covers what was decided,
why, and what was deliberately left for later.

---

## 1. Stack

**React 18 + TypeScript + Vite. No UI framework, no state library, no CSS
framework.**

Vite because the data layer is a directory of JSON files and
`import.meta.glob` turns "add an asset" into "add a file" with no registry to
update and no build step to remember. React because the detail panel, the
overlays and the eventual edit mode are ordinary component state, and because
step 7 (drag-to-reposition, inline editing) will want a real component tree.
TypeScript because `types.ts` shipped with the scaffold is the contract and the
compiler should enforce it.

What was *not* added, on purpose: no Redux/Zustand (one context, two dozen
lines — see `src/state/viewState.tsx`), no Tailwind (the visual system is
small, specific and easier to keep coherent in one stylesheet than in utility
soup), no router (one view plus a `#bench` escape hatch).

## 2. Rendering: layered DOM, not WebGL

Both were built and measured. `#bench` runs them head-to-head in the browser:
the same N sprites, every one repositioned every frame, sampled for 4s after a
warmup. That workload is deliberately pessimistic — in the real scene the nodes
are static and only the container scrolls.

Measured in this container (headless Chromium, **software rasterisation via
SwiftShader — no GPU**, so both figures are floors rather than representative
of a real machine):

| Sprites | Layered DOM/CSS | WebGL2 instanced |
|---|---|---|
| 300 | 60.0 fps (p95 16.8 ms) | 59.3 fps (p95 16.8 ms) |
| 1000 | 33.5 fps (p95 50.0 ms) | 31.6 fps (p95 33.4 ms) |

**At the workload this tool will actually see — the master prompt's 100+ icons,
here pushed to 300 and animated every frame — both renderers sit at the display
refresh rate.** WebGL's advantage only starts to appear around 1000 moving
sprites, and even there it is a fraction of a frame on a software rasteriser.
Performance does not decide this question, so the rest of the bill does:

- Text. Every node carries a name and a distance readout, and the ruler is
  dense with labels. In DOM that is free and subpixel-crisp at any zoom; over a
  canvas it is a font atlas and a layout engine.
- Hit-testing, focus, keyboard and screen-reader semantics. Each node is a
  `<button>`, so tab order, focus rings, `aria-pressed` and hover tooltips come
  from the platform. Over a canvas all of that is rebuilt by hand, badly.
- The detail panel, toolbar and modals are DOM regardless. A canvas scene means
  maintaining two rendering models and a coordinate bridge between them.
- Edit mode (step 7) is drag-and-drop on discrete objects — squarely DOM's
  strength.

The oblique view is achieved with a **discrete per-lane horizontal offset**
rather than a CSS skew or 3D transform on the scene. Each domain lane steps
sideways as the stack descends, which reads as a cut through the battlefield,
while every icon, label and hit-box stays axis-aligned and undistorted. A skew
would have forced a counter-transform on every child and blurred text for no
gain.

If a future pass needs thousands of simultaneously animating elements, the
projection layer (`src/scene/projection.ts`) is pure math with no DOM
dependency — a canvas renderer could be dropped in behind it without touching
the data layer. That is the exit, and it is not needed yet.

## 3. Data layer — used exactly as delivered

`src/types.ts` is the scaffold's file, unmodified. `data/` is the scaffold's
data, unmodified. Everything the loader needs on top of that lives in
`src/data/model.ts` as separate types, so the schema stays the schema.

One additive file: `data/doctrine_markers.json` (see §5). It does not touch the
asset shape.

The loader (`src/data/loader.ts`):

- globs `data/assets/*.json` — a new asset is a new file, no registry, no code
  change;
- validates every record against the schema at runtime and collects complaints
  rather than throwing (`src/data/validate.ts`). An asset that can still be
  positioned is positioned; one that cannot is dropped with an explanation;
- merges the per-asset `connections` arrays with the flat `connections.json`,
  deduplicating by `source→target:type` and **reporting the drift** between
  them in either direction, since the scaffold README asks that the two be kept
  in sync by hand;
- synthesises **pending stubs** for unresolved targets (see §4).

Everything it flags shows up in the **Data health** panel, which is a working
checklist rather than an error screen. Current state: 0 errors, 0 warnings,
12 info — the T-72's deliberately blank source URL, three edges that exist on
an asset but not in `connections.json`, one echelon/band mismatch on the M777,
and seven not-yet-built connection targets.

## 4. Pending targets

`connections.json` documents that an edge may point at an asset that does not
exist yet, and that the loader should render a stub *or* hide the line — never
error. **Both are implemented**, switchable from the toolbar:

- **Pending targets on** (default) — the target becomes a provisional node,
  drawn dashed and desaturated, with its edge in a finer, faded stroke so it
  never reads as an authored placement. Its position is inferred from the id
  slug: side from the `side_a`/`side_b` prefix, domain from the first
  recognised token (so `c2-integrated-air-defense-network` is a C2 node, not an
  air one — the first token is the subject, the rest are qualifiers), band from
  an explicit `tactical`/`op-near`/`op-deep`/`strategic` token, otherwise
  borrowed from the referencing asset. Clicking one opens a panel explaining
  which fields were inferred and offering a **copy-ready JSON skeleton** to
  save as `data/assets/<id>.json`.
- **Pending targets off** — stubs and their edges disappear entirely. With the
  current four assets that hides all nine edges, because none of the four
  connect to each other; that is a fact about the data, not a bug.

## 5. Open items — decided

**Icon art style → uniform illustrated set, not photographs.**
Photos are inconsistent in crop, lighting and licensing across sources, and
they are unreadable at the ~44 px the default zoom needs. A mixed photo set
reads as a scraped deck rather than a built tool. The map therefore uses one
line/silhouette set (`src/icons/registry.tsx`), resolved by `category` first,
then by keyword, then by `domain`, so a brand-new category still gets a
sensible symbol. **The schema is untouched** — every asset keeps its
`icon_image` path, and the node tries that image first, falling back to the
symbol when the file is absent. Dropping real art into `public/icons/` later
upgrades the map with no code or data change. Photographs still belong in the
detail-panel gallery, where size and context make them useful.

**Distance-band cutoffs → keep `bands.json` as delivered, and overlay the
sourced depths separately.**
The four bands are the coarse echelon structure and match the master prompt's
proposal; re-cutting them to any single sourced figure would make them worse,
because the sourced figures disagree with each other by design (an FPV envelope
and a deep-strike layer are not the same kind of measurement). So
`data/doctrine_markers.json` carries doctrine.md §2's findings — FPV strike
envelope 0–10 km, close reconnaissance 1–5 km, forward CP 2–5 km, the ~30 km
drone-dense corridor, FPV launch teams 8–10 km, deep strike 10–150 km,
offensive staging up to 30 km — each with its source tag and note, drawn as a
toggleable band under the ruler and packed into non-overlapping rows. Both
layers are config; neither is hardcoded.

The same file carries doctrine.md's sharpest finding — that local control of
the lower sky, not doctrine, sets how close assets can sit (1–1.5 km with it,
~7 km without) — as structured data with the numbers ready. It is quoted in the
About panel. Wiring it to an interactive toggle that physically shifts asset
positions is a genuinely good idea and is listed below rather than half-built.

**Side labels → generic "Side A" / "Side B".**
Data only ever knows `side_a` / `side_b`; the labels live in
`src/config/ui.ts`. Renaming is a config change, not a data migration. Each
side's chip carries a tooltip naming which representative equipment set it
stands for.

## 6. Deliberately not built yet

Per the instruction to prove the mechanics on the four existing assets first:

- **Step 3, the breadth pass.** No placeholder assets were invented for the
  remaining ~20 categories. The seven pending stubs are the only non-authored
  nodes, and they exist because the scaffold's own connections point at them.
- **Step 6, reactive vignettes.** The registry seam exists
  (`src/scene/vignettes.ts`): each `animation_id` maps to a short stylised loop
  — launch, ballistic arc, terminal dive, bound-and-fire — with a neutral pulse
  fallback for unknown ids, replayable from the detail panel. These are
  schematic tracers, not the per-asset vignettes step 6 calls for.
- **Step 7, edit mode and persistence.** Nothing writes yet. The projection
  exposes `offsetPxToKm` specifically so drag-to-reposition can convert a drop
  x back into a distance, and view state is already separate from data state so
  an editing store can be added without unpicking selection and filters.
- **The lower-sky toggle** described above.
- **Sea and space lanes** render as empty lanes. They are in `domains.json`, so
  they exist in the stack and the rail marks them empty rather than hiding them.

---

# Pass 2 — schema evolution, editable bands/categories, 27 assets, visual pass

Written against a follow-up request: comparable per-asset facts (cost above
all), editable distance bands and per-asset placement, category show/hide,
an expanded battlefield (deep-strategic depth, strategic infrastructure),
more assets, and a visual push toward realism — plus getting a live link in
front of a non-technical reviewer.

## Schema evolution

Pass 1 held `types.ts` as the scaffold's contract, untouched. This pass
extends it deliberately: `group` (the category taxonomy), `cost`
(`unit_cost_usd` + a display string + a confidence tier — always rendered,
never silently blank), `key_facts` (exactly three, per-asset-type facts),
and `operating_range_km` (typical employment envelope, distinct from the
single representative `distance_km_from_zero`). All additive — nothing
existing changed shape, so the change is backward compatible in spirit even
though the four original assets were updated to carry the new fields.

## Editable bands and per-asset placement — why local storage, not a backend

The master prompt's own phasing says "start with local JSON/DB-backed
storage; don't over-engineer backend on day one." Bands and per-asset
placement edits go into `localStorage`, layered on top of the shipped
`data/*.json` at load time, rather than mutating files on disk from the
browser (which a static build can't do at all) or standing up a database
this pass didn't ask for. Concretely:

- `src/state/overridesState.tsx` holds `bands: DistanceBand[] | null`
  (null = "use shipped defaults") and `assetOverrides: Record<id, {...}>`,
  both persisted and both feeding back into `loadWorld(bands, overrides)`.
- Band membership was already computed from distance rather than trusted
  from the stored `band_id` (pass 1's `resolveBand`) — so editing a cutoff,
  or editing an asset's distance, needs no additional "retag" step. The
  placement editor and the bands table are both thin UI over that one
  function.

This means edits don't sync across devices or survive a data reset — worth
knowing before treating one as durable. The natural extension is swapping
the localStorage read/write in `overridesState.tsx` for real API calls; nothing
else in the data flow needs to change shape to support that later.

## Categories vs. domains

`domain` (land/air/sea/...) decides vertical position and was already load-
bearing for the scene geometry. `group` (`data/groups.json`) is a second,
independent, purely presentational taxonomy — 18 categories matching the
master brief's asset list — used only by the show/hide filter. Keeping them
separate means "hide everything except air defense" doesn't require moving
anything on the map, and a category with zero current assets still shows up
(count 0) as a preview of what's coming, same pattern as the domain rail.

## Content: 27 assets, every pending stub resolved

All seven stubs left dangling in pass 1 are now real assets (both sides'
tactical recon UAV, both logistics hubs, the air-defense C2 network, both
medical casevac chains). Sixteen new assets were added spanning HIMARS,
Leopard 2, Gepard, Stinger, Starlink, Bukovel-AD, a naval USV (Magura V5), a
commercial ISR satellite, and a deep-strike entry modeling Ukraine's
Operation Spiderweb on one side; Pantsir-S1, Grad, R-330Zh Zhitel, a
squad-level fire-control terminal, the Black Sea Fleet's forced relocation,
and strategic infrastructure on the other. Every one carries real sourced
figures (cost included) rather than invented placeholders, with confidence
flagged honestly where reporting is thin (several — the T-72's price, the
IADS network's program cost — are marked `unknown`/`estimated` on purpose).

**The Spiderweb entry is worth calling out specifically**, since it's the
clearest illustration of "the battlefield should be much expanded": it's
placed at 4,300 km — the confirmed distance to the Belaya airbase strike —
inside a new fifth band, Deep Strategic / Cross-Border (500+ km). Its own
employment notes are explicit that the placement represents *reach achieved
by truck smuggling*, not a drone flying that distance, specifically so the
map doesn't imply something false about the mechanism.

**A direction bug worth flagging for future edits**: several "provider"
assets (both logistics hubs, the C2 network, Starlink, both medical chains,
both recon UAVs) were first written declaring edges back at their own
consumers, duplicating the edge each consumer already declares toward the
provider. That drew confusing doubled arrows between the same two nodes.
Fixed by one consistent rule, worth keeping for every asset added from here:
**the dependent declares the edge; the provider does not mirror it back.**
A small script (not checked in — run inline during this pass) diffed every
asset's connections for exact and reverse-direction duplicates before
`connections.json` was regenerated from the per-asset files; worth re-running
by hand on any future large content pass.

## Visual pass — what's real, what's generated, and why

The request was for photorealistic imagery — real equipment photos and a
real terrain background, sourced from open-source 3D models or photography.
That was attempted and hit a hard constraint: **this environment cannot
fetch binary images from the open web.** The egress proxy denies the image
hosts tried (`upload.wikimedia.org` came back policy-blocked, not a
transient failure), and the page-fetching tool available here converts pages
to article text rather than returning binary assets — there is no path to a
downloaded photograph from inside this session. That's a environment
limitation, not a judgment call, and re-tried approaches were the right
response only up to the point of confirming the policy denial; routing
around a policy block is explicitly out of bounds regardless.

Given that, this pass pushed the **generated** visual system as far as it
reasonably goes rather than settling for the flat lanes from pass 1:

- `src/scene/terrain.ts` generates a distinct procedural ground texture per
  domain — SVG `feTurbulence` noise colorized per-domain, with an overlay
  pattern that reads as a material rather than a flat tint: diagonal
  furrow lines for land, a wave pattern for sea, a starfield for space, a
  circuit trace for EW/C2, a rail-yard hatch for logistics. Each side gets a
  different noise seed so the two halves don't look like a mirrored decal.
  This is drawn as a flat background image, not a 3D-transformed plane —
  keeping the earlier decision that interactive content (icons, text, hit
  targets) stays undistorted intact; the furrow/wave lines are angled
  instead, which reads as "looking across this at an angle" without
  actually tilting anything a screen reader or a pointer has to deal with.
- Nodes moved from flat chips to a more dimensional "object on a surface"
  treatment: a top-lit gradient, an inset shadow suggesting a lit edge, and
  a soft contact-shadow ellipse under each node — the standard cheap trick
  for reading as a physical marker sitting on terrain rather than a UI
  badge floating over it.

**The honest upgrade path from here** is supplying real reference images —
equipment photos, a terrain/satellite texture — directly as files. Those can
be read locally and embedded with no network fetch involved, which sidesteps
the constraint entirely. Absent that, the icon set stays the uniform
illustrated style from pass 1, now on generated terrain instead of flat
color. Full 3D model rendering (glTF assets, a WebGL lighting rig) is a
larger subsystem than either pass has built and would need its own scoping
if it's still wanted once real imagery is available to work from.

## Deployment

Published as a Claude Artifact — the Vite build's JS/CSS is inlined into a
single self-contained HTML file (data URIs for the fonts already inline,
no external requests) and pushed through the Artifact tool, which gives a
stable URL that redeploys in place on every future publish call rather than
minting a new one. This is separate from the git branch, which stays the
source of truth for the code; the artifact is a build output; there is no
back-guessing meant to be applied to it directly.

---

# Pass 3 — access, real bugs, catalog-driven system swap, sourcing sanity check

Direct response to a review pass: the published Artifact link wasn't
reachable, several concrete bugs were reported, and two equipment catalogs
were supplied as ground truth for sanity-checking data and enabling a
"swap this slot to a different real system" feature.

## Access
Sent the built single-file HTML directly (no link/login required) as an
immediate unblock, and added `.github/workflows/deploy-pages.yml` for a real
public URL independent of Claude account access — needs a one-time manual
step (repo Settings → Pages → Source → "GitHub Actions") since this session
has no API path to flip that toggle itself; auto-deploys on every push after
that.

## Real bugs fixed
- **Oblique offset was breaking coordinates, not just decorating them.**
  `laneObliqueOffsetPx` shifted actual node/ruler x-positions per lane
  (previously 58px/lane, up to ~400px drift at the bottom lane) while the
  ruler was only ever computed for the top lane — so a node's true distance
  silently stopped matching its on-screen position, and each lane drew its
  own offset zero-line segment (reading as a doubled zero line). Set to 0:
  every lane now shares one horizontal mapping, so the ruler is correct for
  every lane and there is exactly one zero line. The real oblique/elevated
  view this was standing in for is backlog item #6 — done properly (via a
  decorative-layer transform, never on coordinates the ruler depends on),
  not as a coordinate hack.
- **Doubled "0" tick labels** — each side's axis independently labelled its
  own zero at the exact pixel the single "ZERO LINE" marker already covers.
  Ticks now skip km=0; the one marker is unambiguous.
- **Connection "duplicates" investigated and found to be a legibility
  problem, not a data bug** — audited the actual edges programmatically:
  no duplicate Starlink→Leleka or Starlink→Leopard edge exists. What's real
  is that several distinct data_c2 edges render in the same color and can
  converge on one hub node, making them hard to tell apart at a glance.
  Fixed by extending the existing select-to-isolate fading to fire on hover
  too, so previewing a node's own edges doesn't require committing to a
  click. A proper curve-fan-out for edges that share an endpoint is backlog
  item #8.
- **FPV range was dated.** doctrine.md's "0–10 km, no relay" figure is a
  real citation but describes radio-link FPVs specifically; fiber-optic
  FPVs (2025–2026 reporting) run a practical ~20 km with fielded systems
  already reaching 50 km and a claimed 65 km test spool. Kept the original
  citation, relabeled it "radio FPV," and added a second sourced marker for
  the fiber-optic envelope rather than silently overwriting a real citation
  with a different technology's numbers.

## Sides renamed to Ukraine / Russia
Config-only change (`src/config/ui.ts`), exactly as designed in pass 1 —
the data layer only ever knew `side_a`/`side_b`. Disclaimer copy adjusted to
match: named systems are real, currently-fielded equipment reported in this
specific war, not generic stand-ins, while placement stays representative
rather than a measured position.

## Band labels dropped "Tactical / Operational / Strategic"
Direct response to "these things sometimes blur, so fixed ranges don't make
sense there." Default band labels are now distance-only (`0–5 km`, `5–30
km`, ...); `echelon` stays as internal metadata (still used for the
info-level mismatch flag in Data health) but is no longer asserted as part
of the primary label. Bands stay user-editable from pass 2.

## Catalog-driven system swap
`data/catalog/{russian,ukrainian}_military_equipment.json` are the supplied
files, verbatim. `src/data/catalog.ts` indexes them by `comparison_group`
and exposes `resolveAssetDisplay(asset, catalogEquipmentId)`: an asset
tagged with a `comparison_group` (14 of 27 currently) gets a "Show this slot
as" picker in its detail panel listing every same-side, same-role catalog
entry. Picking one swaps the displayed name/category/manufacturer/cost/key
facts (read straight from the catalog) and the map node's own label — but
deliberately *not* the role narrative (short_role/employment_notes/
contrast_vs_traditional), position, or connections, which stay the
authored asset's own and are shown under a clear "written for the default
system" banner. The swap is a local override, same mechanism as placement
edits (`src/state/overridesState.tsx`), and composes with it independently
apart from a shared "reset" button — see backlog item #7.

## Cost figures reconciled against the catalogs
Cross-checked every asset with a catalog counterpart. Most of this build's
own estimates were already within the catalog's range; three were real
misses and got corrected: T-72 and Orlan-10 had no cost figure at all
(now $2.0–2.5M and $87–120K respectively, from the catalog); BM-21 Grad's
estimate was too low ($310–390K → $500K–1M, matching the catalog). Patriot,
M777, Leopard 2, HIMARS, Gepard, Lancet and Magura V5 were already
consistent and left as authored.

---

# Pass 4 — real geography and real imagery

## Why the "photorealism is blocked" conclusion from earlier passes was wrong
Every earlier pass correctly found that *this session* cannot download a
binary image or map tile — the egress proxy policy-denies image hosts, and
the web-fetch tool available here returns article text, not bytes. What
changed is recognizing that constraint only applies to what *this session*
fetches into its own build environment. Once the app is deployed (GitHub
Pages), an `<img src="https://...">` or a map tile URL is fetched by the
*visitor's own browser*, entirely outside this session's network path. That
reopens both real photography and a real map, with zero binary transfer
through this sandbox — the build only ever ships text (URLs) referencing
public, keyless image/tile hosts.

## Map engine: MapLibre GL JS over Cesium
Both were viable. MapLibre won on fit for what was actually asked for — a
tilted aerial/oblique read of a relatively small, mostly flat sector — not a
full orbiting 3D globe. It's lighter, has no ion-account/token dependency
for usable assets, integrates its `pitch`/`bearing` camera controls to match
the reference images directly, and its HTML `Marker` API let the existing
node/detail-panel styling carry over rather than being rebuilt in a 3D
scene graph. Cesium stays a legitimate future option if the ask becomes "a
real spinning-globe view of the whole war," which this wasn't.

## Basemap and terrain: keyless, public, real
- **Satellite/aerial basemap:** Esri World Imagery REST tile service
  (`server.arcgisonline.com/.../World_Imagery/...`) — public, no API key.
- **Terrain:** AWS's public "Terrain Tiles" open dataset,
  Terrarium-encoded `raster-dem`, served straight from
  `s3.amazonaws.com/elevation-tiles-prod` — public, no API key.

Both are real data, not generated — MapLibre's `hillshade` layer and
`terrain` (3D displacement) render actual elevation. Honesty note carried
into the app itself (About panel and an on-map notice): the real
Donbas/Zaporizhzhia front is flat rolling steppe, not the dramatic mountains
in the reference mockup images. Terrain exaggeration (1.6×) is used to make
the real, subtle relief — river valleys, ravines — legible, not to fabricate
elevation that isn't there.

## Asset placement on the real map: `src/map/geoPlacement.ts`
No schema change. The existing `distance_km_from_zero` + `side` + `domain`
fields are reused as inputs to a pure destination-point projection (real
spherical-earth bearing/distance formula) from one real anchor point — a
spot on the contact line near Orikhiv, Zaporizhzhia Oblast, picked because
it's on open, well-documented, typical-of-most-of-the-front terrain. Ukraine
projects west/northwest along the bearing, Russia east/southeast. A small
id-stable lateral jitter (keyed off `domain`, ±1.5 km) keeps same-distance
markers from stacking exactly on top of one another. Same honesty rule as
the schematic view, restated on the map itself: real coordinates, real
terrain, illustrative placement — not a measured unit position. This also
retires backlog item #6 (the old "true oblique perspective" ask) — the map
view *is* a real, camera-tilted 3D read now, without touching the
schematic view's coordinate guarantees.

## Real equipment photography: sourced, not supplied
The user declined to supply images/video directly ("I don't want to start
putting in manually pictures... what do we need to do to enable you?"). Per
the constraint above, the fix was searching the open web for filenames
(text — a search result, not a downloaded image) and constructing a stable
`https://commons.wikimedia.org/wiki/Special:FilePath/<file>` URL, which
Commons resolves to the current image regardless of its underlying storage
path. 12 of 27 assets — the most recognizable named systems on each side —
now carry a real, licensed photograph as both their map icon and their
detail-panel gallery image, with a Commons attribution entry added to
`sources`. The remaining 15 (mostly abstract nodes — C2 networks, logistics
hubs, EW systems with no good public photo, the two deliberately-generic
"representative infrastructure" power-plant nodes) were left as generated
icons rather than force a photo that would either not exist cleanly or
misrepresent a "representative" placeholder as a specific real facility —
same sourcing-caution reasoning as backlog item #3. Every image tile
already had a broken-image fallback (`GalleryTile`/`AssetNode`'s
`onerror`) from earlier passes, so a bad or renamed Commons file degrades
gracefully instead of breaking the app.

## View toggle: Map is now the default
`viewState.mode` (`"map" | "schematic"`) switches `App.tsx` between
`MapView` and the original `Scene`. Map defaults on, since it's the more
immersive, less "tech-pitch-deck" read the user asked for; Schematic stays
one click away as the teaching view with the ruler and domain lanes, which
the real map's geography can't replace (bands compress distance
nonlinearly on purpose — a real map can't do that and stay geographically
honest at the same time).

---

# Pass 5 — reverting the literal map, going 2.5D-illustrated instead

Direct user reaction to Pass 4, with reference images: the satellite map read
top-down and flat rather than 3D; every asset visually bunched onto one line
because real geographic distance (0 to 500+ km) can't be laid out on a screen
the way the non-linear distance bands can; the photorealistic basemap looked
like a battle-management system, not a teaching tool; equipment photos as
32px map markers didn't scale with zoom and were the wrong place for them
anyway; and the detail panel needed to be editable in place, with real
picture/video upload.

## The literal geo-map was the wrong paradigm, not a buggy implementation
Diagnosed the "everything lines up in one line" complaint precisely before
touching code: `geoPlacement.ts` scattered assets across real geographic
distance (up to ~500 km either side of the anchor), then `MapView.tsx`
called `fitBounds()` to frame them all — at that zoom, the ±1.5 km domain
jitter meant to spread same-distance markers apart was a rounding error, so
every node landed on what was visually one line along the bearing. The pitch
being flat despite an explicit `easeTo({pitch: 58, ...})` had a similarly
findable cause (MapLibre's `fitBounds()` resets pitch to 0 unless explicitly
told not to, and it was racing the easeTo animation) — but fixing that bug
wouldn't have fixed the deeper problem: real geography and the non-linear
distance-band compression this tool's whole teaching model depends on are
fundamentally in tension. You cannot put a real 0.6 km FPV envelope and a
real 500 km deep-strike target on the same real map and have both be legible
at once — that tension is exactly what `data/bands.json`'s non-linear screen
allocation was built to solve in the very first pass, and a literal map
throws that solution away. So: reverted, not patched. `src/map/` (MapView,
geoPlacement) and the `maplibre-gl` dependency are removed entirely, along
with the Map/Schematic view toggle — there is one view again.

## The reskin: real distance-band math, illustrated ground plane, real 2.5D pop
What shipped instead keeps everything Pass 1–4 already proved correct
(`projection.ts`'s per-band screen allocation, the ruler, the connection
overlay) and changes only how it's *drawn*:
- **Terrain (`src/scene/terrain.ts`)**: generated contour-ring + directional
  hillshade texture — a topographic-illustration style, closer to an
  editorial explainer graphic than either the earlier tech-deck palette or a
  photo. Still 100% procedural; the point is that it now reads as
  *deliberately* stylized rather than either extreme.
- **2.5D cross-section read, kept safely decorative**: `Lanes.tsx` gives each
  domain lane's *background* a small per-lane stagger (`laneVisualSkewPx`,
  new, decorative-only) plus a brightness/saturation falloff — the classic
  side-scroller parallax trick. Critically this constant is read only inside
  `Lanes.tsx`; `projection.ts`'s `xFor`/`zeroXAt` (what nodes and the ruler
  actually use) never see it. This is the safe version of the thing that
  broke distance-matches-position back in Pass 3 (`laneObliqueOffsetPx`,
  still 0): the ground plane tilts, the coordinates that have to agree with
  each other never move.
- **Per-node altitude pop (`AssetNode.tsx`, `DOMAIN_ALTITUDE_PX`)**: air and
  space nodes render their card translated up, with a tether line down to a
  small ground-shadow at their real position — a literal answer to "show
  UAVs and infantry at different height." The button's hit target moves with
  the card (a small, intentional trade-off); nothing else about placement
  changes.
- **Equipment photos taken off the map entirely.** `AssetNode.tsx` no longer
  renders `icon_image` at any size — every map marker is the generated icon
  set, unconditionally. Photos are detail-panel-only now, which is also
  where "scale with zoom" stops being a problem: there's no photo on the map
  to fail to scale.
- **Scene zoom (`viewState.sceneZoom`)**: a uniform `transform: scale()` on
  the whole scene content (icons, terrain, everything together), with a
  matching scroll-frame booking so scrolling stays correct at any zoom level
  — this is the literal, delivered answer to "things should scale when I
  zoom in," generalized to the whole scene rather than tied to map tiles
  that no longer exist.

## Detail panel: inline editing and media upload
Extended the existing override mechanism (`src/state/overridesState.tsx` —
the same one placement edits and catalog swaps already used) with two new
pieces, kept deliberately separate from each other and from placement so
resets stay independent (docs/BACKLOG.md #7's ask, now partly done):
- `AssetOverride.text`: free-text edits to `short_role`, `employment_notes`,
  `contrast_vs_traditional`, `characteristics` — every one of them gets an
  inline "edit" control right in its own section, a plain `<textarea>`, and
  an independent "reset to authored text."
- `AssetOverride.customMedia`: user-uploaded pictures and video, added from
  the new Media section. Pictures are read via `FileReader` into a
  size-capped (3 MB) base64 data URL and persist exactly like every other
  override. Video is different on purpose: `localStorage` cannot hold a real
  video file, so it plays through this session via `URL.createObjectURL`
  and carries a visible "not saved — lost on refresh" badge rather than
  quietly disappearing without explanation. A real backend (BACKLOG #11)
  is what actually fixes this, not a bigger localStorage budget.
- The detail panel's sections also got a visual pass (each is now a bounded
  card with a consistent header) directly answering "looks disorganized" —
  the earlier layout was a flat run of paragraphs with uneven gaps wherever
  an asset happened to be missing an optional field.

---

# Pass 6 — WebGL rendering, hero models, content pipeline, lessons, persistence

Six-part brief. Working through it surfaced three places where the framing
collided with something learned building Passes 1, 4 and 5 — those are called
out inline rather than quietly worked around.

## 1. Rendering: this redirects Pass 1's call, and does not touch Pass 5's

Two earlier decisions are in scope here and they deserve different treatment.

**Pass 5's finding stands, unmodified.** Real/satellite geography cannot put a
0–5 km FPV envelope and a 500 km deep-strike target on one legible axis. That
was correct and it is still correct. The non-linear per-band screen allocation
in `src/scene/projection.ts` is untouched by this pass — `src/three/worldMapping.ts`
consumes `Projection.xFor()` and converts px to world units, and does not
recompute distance in any form. The 3D view and the schematic view therefore
cannot disagree about where anything is, by construction rather than by
discipline.

**Pass 1's "layered DOM, not WebGL" is redirected, not reversed.** That
decision was correct for the question it asked and wrong to keep applying to
the question now being asked. The benchmark measured *2D sprite throughput* —
N quads moving every frame — and found DOM and WebGL tied at the workload this
tool sees, so the tie-break went to text crispness, hit-testing, focus order
and aria semantics. All of that reasoning survives. What changed is the
requirement: a perspective camera over displaced terrain with per-asset
geometry and distance fog is not a faster way to draw sprites, it is a
category DOM cannot express at all. There was no benchmark result to overturn
because there was no benchmark for this.

So the resolution is a **hybrid, and the hybrid is the point rather than a
compromise**: WebGL draws the ground, the models, the fog and the camera; every
label and hit target stays a real DOM `<button>` positioned by projecting its
world anchor to screen each frame. That keeps all four things Pass 1 chose DOM
for. `#bench` is left in place — its numbers are still the honest answer to the
2D question, and deleting it would erase the reasoning.

**Both views are kept.** Pass 5 removed a view outright and the immediate
feedback was "I can't see the map anymore." Not repeating that: 3D terrain
leads, Schematic is one toolbar click away, and it keeps the things the 3D view
genuinely does not have — the distance ruler, the band editor's live feedback,
and the dependency-line overlay.

### The synthetic terrain
`src/three/terrain3d.ts` generates a deterministic value-noise heightfield:
rolling steppe relief, a shallow draw across the strip, and a churned scar
concentrated on the zero line whose crater density falls off either side. That
scar is doing explanatory work, not decoration — it is the visual answer to
"why is everything pushed back from the line." Amplitude is deliberately low.
Inventing mountains to make a 3D view look dramatic would be the same
dishonesty the Pass 4 terrain-exaggeration note called out.

Scope is a representative strip, per the brief: a few km wide on Z, the full
rear-to-rear depth on X. Depth cues are `THREE.Fog` (150–640 world units)
plus the low sun angle and flat shading.

### The axis mapping, and what Z is for
- **X** — band-compressed distance, straight from `Projection.xFor()`.
- **Y** — altitude. This is the thing the 2D view could never express: air and
  space sit genuinely above the ground plane rather than in a lane below it.
- **Z** — lateral position across the strip. Ground-level domains (land,
  logistics, medical, C2) share Y = 0 and separate on Z, because stacking
  logistics *above* land would assert a height difference that isn't real. Z
  carries no distance claim and says so in the file.

## 2. Hero models are authored, not sourced — and that was forced, then preferred

Eleven assets across both sides get real geometry (two MBTs, HIMARS, M777,
BM-21, Patriot, two short-range AD, a loitering munition, two recon UAVs).
Everything else stays a marker.

**Licensing, as asked — checked rather than assumed.** The brief said to check
and document licensing on anything sourced. Doing that honestly ruled sourcing
out: this environment cannot fetch binary files (the egress proxy denies them,
established in Passes 3–4 and unchanged), so any third-party `.glb` would be a
URL referenced sight-unseen under a licence I could not open and read. That is
precisely the "assumed-clear" case the brief warned against. Procedural
geometry removes the question — the licence is the repo's own, and what shipped
is verifiably what is in `src/three/models.ts`. It also lands the aesthetic the
brief asked for directly: deliberately stylized low-poly *is* primitives.

Models are cached per builder and cloned, so eleven hero assets cost seven
geometry builds. Scale is deliberately oversized relative to true scale — a
to-scale tank on this compressed axis would be sub-pixel; same convention as an
icon on a map.

## 3. Content pipeline — and an integrity catch it immediately paid for

Full process in `docs/CONTENT_PIPELINE.md`. Draft a whole category in one
sitting; verify the same batch in a separate, later sitting; `verified` needs
two **independent** named sources, one source is `sourced_low_confidence`,
general knowledge stays `unverified`.

The `verification` block on each asset is **derived, never authored** —
`node scripts/audit-content.mjs --write` computes it from `sources`. A
hand-written confidence field drifts from the citations underneath it, and a
stale "verified" stamp is worse than none.

"Independent" is where this is stricter than a link count, and it caught a real
problem on the first run: **Wikimedia Commons links are excluded entirely.**
Pass 4 added those as photo credits. Counting an image credit as evidence for a
range or a unit price would have promoted assets to "verified" on the strength
of a photograph — and it had already done so silently: **T-72 appeared to have
two independent sources and actually had one plus a photo credit.** It has since
been genuinely verified (Army Technology, Weaponsystems.net) and is now
`verified` on the real bar. Wikipedia counts but is tracked separately, so an
asset resting only on tertiary references is reported rather than passing
quietly. Cost is audited separately from specs, because in a procurement
conversation the price is the figure most likely to be challenged.

Retroactive audit of all 27 shipped assets: **19 verified, 1 low-confidence,
7 unverified.** The 7 are the composite nodes (logistics hubs, casevac chains,
the two representative power-plant nodes, Strelets) — legitimate for a node
standing in for a class of thing rather than a specific system, but flagged in
the panel rather than passing silently. Six otherwise-verified assets carry
estimated costs and now say so.

## 4. Key Lessons — seeded from doctrine.md, and pointed at the map

`data/lessons.json`, ten lessons, each carrying the `doctrine_ref` section and
`source_tag` it came from, so a lesson is exactly as traceable as an asset.
Nothing was written fresh; this is `docs/doctrine.md`'s existing sourced
findings restructured.

The part that matters is that a lesson is a **pointer at the map, not a
paragraph**. Each names real `asset_ids`; "Show on map" switches to the 3D
view, eases the camera to frame that set, and dims everything else. Verified
end-to-end: the lower-sky lesson frames its 6 assets and dims the other 23.
Adding a lesson is adding a JSON entry — same contract as assets.

## 5. Persistence — where the brief's framing hits a wall, and what shipped

**The conflict, stated plainly.** The brief asked for a hosted JSON store,
lowest-friction, over-engineering discouraged. This app is a static site on
GitHub Pages: there is no server of ours in the request path, so any
credential such a store needs would ship *inside the client bundle* — readable
in devtools and committed to a public repo. A write-capable key published that
way is not a shortcut; it is an invitation to wipe the shared state. Shipping
that quietly and calling it "persistence" would have been the wrong call, so
this pass built the seam and the safe path instead of hardcoding a key.

What shipped in `src/state/persistence.ts`:
- **The adapter seam.** `overridesState` is now storage-agnostic. This is what
  backlog #11 actually asked for — going remote is a config change, not a
  refactor.
- **A real REST adapter**, configured from `VITE_SYNC_URL` / `VITE_SYNC_TOKEN`
  at build time rather than a literal in source. Contract is two calls
  (`GET`/`PUT` one JSON document), small enough for a ~20-line worker. It
  saves locally *first* and treats the remote write as a bonus, so a network
  failure degrades to the old behaviour instead of losing an edit.
- **Export / import**, which is the genuinely zero-backend way to move a
  working set between devices today, with no key to leak.
- **An honest storage badge in the toolbar.** "Saved" means two different
  things depending on build config, and a demo where one person's edits
  silently fail to reach anyone else is exactly what that label prevents.

Hydration guards against a real bug: state does not write back until the
initial load lands, or an empty first render would immediately overwrite a
populated remote store.

**Still open, and it needs a decision, not code:** whose endpoint. A Cloudflare
Worker with a KV namespace fronting `VITE_SYNC_URL` is ~20 lines and free at
this scale; that is the recommendation. It needs an account, so it is yours to
create, not mine to invent.

## 6. Performance — done alongside, not after

- **Instancing** for scatter props — trees, craters, scrub are one
  `InstancedMesh` each: three draw calls for ~1,900 objects. This is where
  instancing genuinely earns its place; the eleven hero models are unique
  objects and would gain nothing from it.
- **LOD** on every hero model: full geometry near, a box proxy from 165 units,
  nothing from 420.
- **Device-aware prop budget** — halved on ≤4 cores or narrow viewports,
  rather than one fixed number that is either wasteful on a laptop or
  unusable on a phone.
- **Lazy loading**: three.js and the whole 3D module are a `React.lazy` import.
  Measured — main bundle 400 kB, `Scene3D` chunk 561 kB loaded only on demand.
  A device that falls back to Schematic never downloads a 3D engine it will
  not run.
- **Label decluttering**, added after the first render showed the tactical band
  collapsing into an unreadable stack of overlapping labels. Nearest-first
  screen-space collision test; losers collapse to a dot that expands on hover
  or focus rather than being removed, so they stay hoverable, tabbable and
  screen-reader reachable — otherwise the declutter would have given away the
  accessibility argument this hybrid exists to keep.

## Where the brief and prior passes disagreed

1. **"Move from 2.5D to 3D"** read as replace. Kept both instead — Pass 5's
   removal of a view produced immediate "I can't see the map anymore" feedback,
   and the schematic view still owns the ruler, the band editor and the
   dependency overlay.
2. **"Check and document licensing on anything sourced"** turned out to rule
   out sourcing altogether here, because the binary-fetch block means any
   licence would be assumed rather than read. Authored geometry instead.
3. **"Even a simple hosted JSON store"** is not safely reachable from a static
   public-repo deployment without publishing a write key. Built the seam, the
   REST adapter, export/import, and a recommendation — not a committed secret.

# Pass 7 — usability bugs first, sync worker, terrain scenery, 72-asset content drop, live asset editor

Eight-item brief, explicitly prioritized: three usability bugs (grounding, pan
sensitivity, mobile overlap) before the other five, "because a broken pan
gesture or a floating tank undermines a demo faster than missing categories
do." Worked in that order. Two places this collided with something learned
building earlier passes are called out inline rather than worked around
quietly — the grounding-bug fix's threshold choice, and the sync worker's
one remaining manual step — plus a full list at the end, as asked.

## 1. Three usability bugs

### Grounding bug — land/sea assets floating on a tether

Root cause, found in `src/three/Scene3D.tsx`: `marker.position.y = 7.5` (and
the tether line down to the ground) was applied to **every** asset,
unconditionally. Correct for something that is genuinely airborne; wrong for
a tank, which sat on the ground and then had its marker lifted 7.5 units
above its own footprint with a tether drawn down to a point directly below
it — visually indistinguishable from a floating vehicle.

Fix: gate the elevated treatment on `DOMAIN_ALTITUDE[domain] > 2`
(`ELEVATED_ALTITUDE_THRESHOLD`), not on `domain === "air" || domain ===
"space"` as the brief's own wording suggested. **This is a deliberate
deviation, flagged as asked.** `DOMAIN_ALTITUDE` (`worldMapping.ts`) also
carries `cyber_ew: 11` and `c2_comms: 4` — Pass 6's "EW/C2 sit on a mast, not
the ground" design intent, present since the 3D view shipped. A literal
air/space-only check would have re-grounded those two domains as a side
effect of fixing tanks, deleting a piece of Pass 6's reasoning that the
grounding bug never actually touched. Threshold-on-altitude achieves exactly
what was asked (land/sea/logistics/medical assets stop floating) without
that collateral loss. Verified with headless before/after screenshots: a
tank sits flush on the terrain with no tether; Patriot and a UAV keep theirs.

### Pan sensitivity

`OrbitControls.rotateSpeed/panSpeed/zoomSpeed` were at library defaults,
tuned for a much smaller scene — a small drag produced a large, unpredictable
jump. Retuned (`rotateSpeed: 0.55`, `panSpeed: 0.4`, `zoomSpeed: 0.7`) and the
camera **target** is now clamped to the terrain strip's bounds every frame
(`panBoundXRef`, computed from the strip's actual half-width plus margin, and
a fixed Z bound around `STRIP_HALF_Z`) — so panning can no longer fly the
camera target off the generated terrain into empty space, which was the
other half of "pan feels broken" even after the speed fix alone.

### Mobile overlap — the bottom info panel over the canvas

This was two independently-floating bottom-corner boxes with no collapse
state: `Legend`'s stats panel, and a separate `.scene3d__hint` div Scene3D
drew itself with the 3D-specific renderer disclaimer. Neither knew about the
other, and at phone width they reliably overlapped and clipped each other's
text — the bug was structural (two unrelated floating elements), not a
z-index or sizing tweak away from fixed. Fixed by merging: `Scene3D.tsx` no
longer renders its own hint box at all; its text moved into `Legend.tsx`,
which now defaults to a collapsed `ⓘ` toggle under 680px
(`window.matchMedia`) and has its own explicit close button. One box, one
place, on every viewport.

## 2. Sync worker — real code, one step outside this session's reach

Pass 6 left this as backlog item 21: the adapter and REST client existed,
but no endpoint. This pass wrote the endpoint for real — `worker/src/index.ts`
(Cloudflare Worker: GET/PUT one JSON document against a KV namespace, CORS,
an optional bearer-token gate via `SYNC_WRITE_TOKEN`, a 2 MB body cap) and
`worker/wrangler.toml`, matching the contract already documented at the
bottom of `src/state/persistence.ts` — the Worker was written to match that
contract, not the other way around. `npx tsc --noEmit` and `npx wrangler
deploy --dry-run` both pass clean. The CI workflow
(`.github/workflows/deploy-pages.yml`) already passes `VITE_SYNC_URL` /
`VITE_SYNC_TOKEN` through from repo secrets to the build step.

**What this pass could not do, and why, restated because it recurs every
pass that touches this:** actually run `wrangler deploy` against a real
Cloudflare account, or `wrangler secret put` a real token. This session has
no Cloudflare credentials and cannot create an account on your behalf — the
same constraint Pass 6 already hit for backend hosting generally. The gap
left is now genuinely just "one human, one `wrangler deploy`, two repo
secrets" (walkthrough: `docs/DEPLOY_SYNC_WORKER.md`) rather than "design and
write a worker" — a materially smaller remaining step than it was at the
start of this pass, but still not zero. Until it's deployed, the toolbar
badge correctly keeps reading "This browser only."

## 3. Terrain scenery — dressing the strip as a place, not empty ground with icons

`src/three/scenery.ts`: trench lines, a concertina-wire/tank-obstacle belt
(`InstancedMesh`, matching the Pass 6 performance convention for repeated
geometry), a power plant, a fuel depot, a command post, and generic fighting
positions — six hand-placed landmark specs plus procedural belts. All
authored geometry, same rule as the Pass 6 hero-model tier and for the same
reason: this environment cannot fetch binary assets, so a sourced model would
be a licence assumed rather than read. Decorative only — none of these are
clickable data assets, and none of them compete with the real, data-driven
markers for hit-testing. `SCENERY_BUDGET` follows the existing device-aware
low/high split from Pass 6's performance pass rather than adding a second,
unrelated budget system. Verified visually: power plant, fuel depot, command
post, trench lines and the obstacle belt all render in headless screenshots
across the strip.

## 4. Content: 72 catalog rows → 60 new assets, and two more self-caught integrity bugs

Ran `equipment_catalog.xlsx` through the *existing* two-pass pipeline exactly
as instructed — draft, then a separate verification pass, then
`audit-content.mjs --write` — rather than trusting the sheet's own
verification tags. That instruction paid for itself twice before the batch
ever reached the audit script:

- **Cost-parser bug.** The first-draft regex extracting `cost.unit_cost_usd`
  from prose was unanchored and matched any bare number nearby, not one
  actually preceded by `$`. Challenger 2 came out as literally `$5` instead
  of the correct ~$6.5M average; T-80BVM came out as `$80`, pulled from "T-80"
  in unrelated text that had no dollar sign anywhere in it. Fixed by
  requiring a literal `$` anchor and averaging ranges properly; one asset
  (NASAMS) still needed a manual correction afterward because the regex,
  even fixed, grabbed the interceptor-round price instead of the
  battery-system price the row was actually describing.
- **Key-facts label/value mismatch.** The first design picked a fixed label
  template per category and filled it by keyword search with a positional
  fallback. Labels processed early could steal a bit of text via that
  fallback before a later label's own keyword search reached it, producing
  pairs like "Signature" labelling a sentence about running time, or "Crew"
  labelling armor-composition text meant for "Protection." Rebuilt as
  `infer_label(bit)`: the label is derived from each value's own content, so
  label and value agree by construction, with a generic "Spec" fallback
  when nothing matches — rather than trying to patch the ordering bug.

Both were caught and fixed before the batch shipped, by re-reading generated
output against the source rows rather than trusting the generation script's
own output — the same standard the brief asked be applied to the sheet's
verification tags, turned on this pass's own tooling instead. One naming
collision was also caught the same way: a web search for the Russian "Varan"
UGV returned an unrelated UK-built product of the same name; re-reading the
catalog's own characteristics text (tracked chassis, Kornet ATGM) and finding
Varan and Kurier share a real Militarnyi.com source article settled it.

Sources were then researched for real — 57 of 60 assets got 1–2 real
citations each (`scripts/fill-sources.py`); 3 systems (`side_a-naval-sonobot-5`,
`side_a-ground-robots-nprk-mul`, `side_a-ground-robots-krab-m1`) are cited
only in a PDF report with no public URL and were left honestly unsourced
rather than padded with a weak substitute. `contrast_vs_traditional` was
written for all 60 grounded in `docs/doctrine.md` mechanisms (the
minutes-scale kill chain, control of the lower sky, cost-asymmetry
inversions, distributed kill chains) per `CONTENT_PIPELINE.md`'s own
convention, rather than invented per-asset.

`node scripts/audit-content.mjs --write` against all 87 assets (27 shipped +
60 new): **64 verified, 13 sourced_low_confidence, 10 unverified** — the 10
being the 7 pre-existing composite nodes from Pass 6 plus exactly the 3
PDF-only systems named above. `npx tsc --noEmit`, `npm run build`, and the
in-app Data Health panel all came back clean (0 errors; only the 3 expected
unsourced-asset warnings). The "adding from a source URL" workflow the
README documents stays intact and was exercised, not just preserved:
`import-catalog.py` → `fill-sources.py` → `audit-content.mjs --write` is
the repeatable path for the next ad hoc drop, and every step ran against
real files with real output this pass, not just a plan for one.

12 deduplication decisions were made against the 27 already-shipped assets
(rows the sheet listed that this map already had, under a different label);
one fuzzy match was initially wrong (the Varan case above, same root cause
as the naming collision, caught the same way) and corrected by hand rather
than shipped silently. `git diff --stat` confirms no pre-existing curated
asset file was touched by this batch.

## 5. Asset editor — a live page, not a bigger JSON skeleton

New "Asset editor" page (`src/components/AssetEditorPanel.tsx`, toolbar
button next to Data health): build a brand-new asset from scratch — category,
side, placement, every schema field a shipped asset has — without a code
change or a spreadsheet round-trip, and see it on the map immediately.
Distinct from the per-field "edit" controls already in `DetailPanel.tsx`,
which only ever patch a *shipped* asset's text, placement or media; this
creates an entirely new `Asset` record.

**How it's live without a backend.** It writes into the exact same
overrides store as everything else (`overridesState.tsx` → the storage
adapter in `persistence.ts`): a new `customAssets: Record<string, Asset>`
field alongside `bands` and `assetOverrides` in `StoreShape`, persisted to
this browser's `localStorage` (or the shared sync store, once §2's Worker is
deployed) on the same debounced save. `loadWorld()` takes a third parameter
and merges `customAssets` in after the shipped `data/assets/*.json` files,
running each one through the identical `validateAsset()` every shipped asset
gets — so a locally-added asset shows up in the Data Health panel exactly
like a shipped one, including a duplicate-id check against the real roster,
and not as some separate, unvalidated shadow list.

**Two honest scope lines, stated in the page itself rather than faked:**

- **No separate icon upload.** Not a missing feature — `icon_image` was
  already not read for the map glyph by anything, for *any* asset, since
  Pass 5 (`src/icons/registry.tsx`'s own header comment says so). Every
  marker's icon is chosen from `group` → `category` → `domain`, in that
  order, which the form already requires. Building an icon-upload control
  that the map would then ignore would have been the dishonest option here.
- **No custom 3D hero model.** `HERO_BUILDERS` (`src/three/models.ts`) is
  procedural TypeScript geometry compiled into the bundle at build time —
  there is no live-page mechanism that could inject a new builder function
  into a running static site. A custom asset gets the same marker + label
  every non-hero shipped asset gets, which is 16 of the 27 originally-shipped
  assets already (`docs/BACKLOG.md` #22) — a pre-existing scope line this
  feature inherits rather than one it introduces.

A "Copy JSON" action bridges back to the file-based pipeline deliberately:
`scripts/audit-content.mjs` only reads real files under `data/assets/`, so
it cannot see a browser-only custom asset at all. Copying the built `Asset`
object into a real `data/assets/<id>.json` file is how a locally-added asset
graduates to a real, sourced, auditable one — the same "paste this into a
file" bridge `DetailPanel.tsx`'s pending-stub view already offers, extended
to a full guided form instead of a hand-filled skeleton. Verified end to
end with headless Playwright: created a UAV asset (auto-generated id,
group-driven icon, elevated tether correctly applied for its space-tier
domain), created a ground-robot asset (correctly grounded, no tether — the
§1 fix applies identically to a live-added asset), edited it, confirmed the
edit persisted to `localStorage` and rendered on the map and in Data Health,
and confirmed "Copy JSON" produces valid, re-parseable `Asset` JSON.

## 6. Backlog honesty — category gaps recorded, not guessed

`docs/BACKLOG.md` gets a new "Category gaps — not started, no source yet"
section: Space, C2/comms, medical/casevac, engineering/fortification
(distinct from §3's decorative terrain props — this is the asset-level
gap), infantry positions/small arms, EW as its own asset category, and
Russia naval/Black Sea Fleet, matching the Category Tracker sheet's own
"not started" convention rather than filled with placeholder guesses. One
self-correction happened while writing that list: the first draft claimed
EW had no dedicated category structurally, which turned out to be false —
`ew` is already a real, separate group in `data/groups.json`, just thin (2
assets). Caught before shipping and rewritten to state the real gap (breadth,
not structure); the infantry bullet was checked the same way and confirmed
accurate (`infantry` is a real group with genuinely zero assets using it).
Also recorded: the 7 systems the catalog's own tracking column flagged
"Hero tier" that didn't get a `HERO_BUILDERS` entry this pass (Bayraktar TB2,
UJ-26 Beaver/Bober, FP-1/FP-2, T-90M, S-400, Shahed-136/Geran-2, Kurier) —
next-candidates for item 22, not a silently dropped ask.

## Where the brief and prior passes disagreed

1. **Grounding-bug fix scope.** Asked for effectively `domain === "air" ||
   domain === "space"`; shipped `DOMAIN_ALTITUDE[domain] > 2` instead, to
   avoid quietly deleting Pass 6's EW/C2 "mast height" tether as a side
   effect of a fix aimed at tanks. See §1.
2. **"Build the Cloudflare Worker"** is done as far as code and a dry run go;
   the actual `wrangler deploy` / `wrangler secret put` against a real
   account needs a human with Cloudflare credentials this session doesn't
   have — the same class of constraint Pass 6 already flagged for backend
   hosting generally, re-confirmed rather than newly discovered. See §2.
3. **"Don't take the sheet's verification tags on faith"** was aimed at the
   spreadsheet, and held there — but the same standard, applied to this
   pass's own generation scripts, is what caught the cost-parser and
   key-facts bugs in §4 before they shipped. Worth naming as a general
   lesson: the instruction generalizes to "verify what a script produced,"
   not just "verify what a spreadsheet claimed."

---

# Pass 8 — rendering foundation: the domain conflation, declutter, spread, side cue, screen-space labels

Scope was explicitly rendering-only: no terrain, no water, no new pages, no
asset library. Five items, all five landed. The first one turned out to be
the root cause of a bug Pass 7 believed it had already fixed, and the same
mis-keyed field was quietly wrong in the 2D view too.

## 1. Engagement domain vs. platform domain — the conflation, confirmed

**The hypothesis in the brief was right, and understated the blast radius.**

`Asset.domain` was doing two incompatible jobs. As a *teaching taxonomy* it
answers "which domain does this thing fight in?", and by that measure every
SAM battery in the dataset is correctly `air` — a Patriot is an air-domain
weapon. But both renderers were also using it as a *physical* fact to derive
an altitude from, and by that measure it is simply false: the launcher is a
trailer on the ground.

Pass 7 gated the elevated-marker tether on `DOMAIN_ALTITUDE[domain] > 2`
(§Pass 7.1). That was the right *shape* of fix and it is why tanks and ships
stopped floating — their engagement domain happens to coincide with their
platform. It could never have reached anything where the two differ, which
is exactly the set that was still floating.

Audited the whole roster, not just the air-defence category as asked.
**16 of 87 assets** were mis-placed:

| Engagement domain | Platform | n | Assets |
|---|---|---|---|
| `air` | `land` | 11 | Patriot, NASAMS, IRIS-T SLM, Gepard SPAAG, FIM-92 Stinger, S-300 / Buk-M1, S-300, S-400, Buk-M3, Pantsir-S1, Tor-M2 |
| `c2_comms` | `land` | 3 | Starlink Terminal, Integrated Air Defense C2 Network, Strelets Reconnaissance-Fire Terminal |
| `cyber_ew` | `land` | 2 | Bukovel-AD, R-330Zh Zhitel |

The C2 and EW rows are worth calling out, because Pass 7 explicitly declined
to re-ground them: its "EW/C2 sit on a mast, not the ground" reasoning was
recorded as a deliberate deviation to *preserve*. With the platform/engagement
split available, that call can be read properly. The design intent was never
wrong — an airborne relay or an orbital node genuinely belongs above the deck
— but the two EW systems and three C2 nodes actually in the dataset are a
truck, a truck, a ground terminal, a command post and a soldier-carried
terminal. `DOMAIN_ALTITUDE` keeps its `cyber_ew: 11` / `c2_comms: 4` tiers for
the airborne members of those domains that a later pass may add; the ground
members now resolve to a `land` platform and sit at grade. **Pass 7's intent is
kept; only its proxy for "is this thing off the ground" is replaced.**

**The fix — split the field, don't redefine it.** `Asset.platform_domain?:
Domain` is new and optional. `domain` is untouched and still drives lanes,
legend colour and the show/hide filters, so nothing about the taxonomy or the
UI's grouping moves.

Resolution order (`src/data/placement.ts`, `resolvePlatformDomain`):

1. explicit `platform_domain` if set;
2. else inferred from `category` by prefix (`air-defense-`, `cuas-`, `ew-`,
   `c2-`, `satcom-` → `land`; `uav-` → `air`; `naval-` → `sea`; `space-` →
   `space`);
3. else fall back to `domain`.

Both belt and braces on purpose. The 16 affected assets carry the field
explicitly in their JSON, so the dataset is self-describing and an editor can
override it. The category inference exists so that a *new* asset file that
omits it — including anything built in the in-app Asset Editor — still places
correctly instead of silently floating, which is the failure this whole
module exists to prevent. Prefix matching rather than exact, so a later
`air-defense-very-long-range` inherits the right answer for free.

`validateAsset()` gained an `info` issue when an asset has no
`platform_domain` and the inference disagrees with its `domain` — the
conflation stays visible in Data Health rather than only in code. Warning-
level at most, never an error, per the repo's degrade-don't-break rule.

**The 2D view had the identical bug.** `AssetNode.tsx` keyed its
`DOMAIN_ALTITUDE_PX` pop (and ground tether) off the same field, so every
Patriot and jammer floated 20px above its own shadow in the schematic view
too. Fixed through the same resolver. The two views could not have been left
disagreeing about whether a thing is on the ground.

## 2. Label declutter that survives the roster growing

Both renderers had a non-answer to the same problem.

The 3D view compared each candidate label against **every** label already
placed — a quadratic scan, fine at 20 assets. The 2D view had no label
declutter at all: it relied on `placeNodes()` bumping collisions into at most
`VIEW.maxSubRows = 3` sub-rows, and simply overprinted once that ran out.
Measured on the pre-change build: **81 overlapping label pairs** in the 2D
view.

Shipped:

- **One shared collision index** (`src/scene/labelGrid.ts`), a uniform hash
  grid used by both views. Each test is now proportional to local crowding
  rather than to total asset count.
- **3D: three tiers by camera distance** — titled, dot, not drawn — with a
  titled-label budget that scales with viewport area
  (`LABEL_BUDGET_PER_MPX`), and priority ordering so selection, hover and a
  lesson's focus set can never lose a collision to an arbitrary neighbour.
  Dots reserve their own small footprint so the far field can't clump.
- **Tiers are relative to the orbit radius, not absolute.** First
  implementation used fixed world-unit thresholds and broke at the end of the
  zoom range: with a 700-unit cutoff against `OrbitControls.maxDistance = 900`,
  pulling all the way back put every asset past the cutoff and the scene lost
  its labels entirely instead of thinning. Scaling with the current framing
  means "far" always means far *for this shot*.
- **2D: a layout-time pass** (`declutterLabels`). Zoom is deliberately not an
  input — the 2D scene is a single CSS `scale()`, so relative overlap is
  zoom-invariant and this is computed once in scene units. That is the
  opposite of the 3D case, where perspective means the same two assets can be
  far apart in one frame and stacked in the next.
- **Tap-to-reveal.** A decluttered label collapses to a dot (3D) or icon-only
  (2D) rather than vanishing: still a real `<button>`, still tabbable, still
  fully described by `aria-label`. Hover reveals on pointer devices; touch has
  no hover, so a tap selects, and a selected label is never collapsed.

Measured after: **0 overlapping label pairs** in both views, at default
framing, tilted to the horizon, and zoomed out.

## 3. Spread — and a hit-target bug the spread work exposed

**3D.** The old rule was `STRIP_Z[domain] + subRow * 8.5 + jitter`. Two
compounding problems: the domain lanes it keyed off are ~2 units apart for the
common cases (`land: 0`, `air: 2`), and `subRow` came from the 2D packer,
capped at 3. So 42 land assets competed for a Z band barely 30 units wide
inside a strip 124 wide, and the edges sat empty.

`lateralLayout()` now distributes each `(side, band)` cohort across the full
breadth. Sorting by platform domain keeps sea at one end and logistics at the
other; sorting by km *within* a domain means the assets most likely to collide
in X are pushed furthest apart in Z. Jitter is a fraction of the cohort's own
slot pitch rather than a fixed magnitude — the first version used ±2.5 units
against a ~5.4-unit pitch and could close a neighbouring pair to almost
nothing.

Per-cohort spreading says nothing about assets *across* a band boundary, which
sit a couple of units apart in X and drew Z from unrelated layouts. A short
relaxation pass fixes that directly rather than leaving it to luck. **It moves
Z only.** X encodes the asset's real distance from the zero line and is the one
number this view promises is true — the ruler, the schematic and the detail
panel all have to agree with it. That guarantee is the same one
`VIEW.laneObliqueOffsetPx` was reverted to zero to protect in Pass 5, and it is
not spent on layout convenience.

Measured: closest same-side pair went from 1.39 world units (overlapping) to
3.60; every band cohort now spans >100 units of a 124-unit strip.

**2D, and this is the part that wasn't asked for.** Verifying the 2D declutter
surfaced a genuine defect: `placeNodes()` clamped overflow with
`if (subRow >= maxSubRows) subRow = maxSubRows - 1`, so every node past the
third collision landed on the *same* row at the *same* x — stacked exactly on
top of another node and covering its hit target completely. Gepard SPAAG was
literally unclickable behind Switchblade 600; **30 of 89 nodes had a buried
centre** on the pre-change build. Three changes:

- Sub-rows are no longer capped; the row count grows to demand and pass 2 fits
  the rows to the lane height. `VIEW.maxSubRows` is kept as a commented
  tombstone so a later pass doesn't reintroduce it as an obvious-looking
  safeguard.
- `VIEW.minIconSeparationPx` dropped 132 → 64. It was set to the *label*
  width, so the packer demanded a fresh sub-row for every pair within 132px
  and produced a dozen-plus rows crammed into a 176px lane. Labels have their
  own declutter now; this only has to keep the 52px glyphs apart.
- Sub-row spacing is floored at `minSubRowSpacingPx` **plus the lane's altitude
  spread**. The render-time pop varies within a lane — the air lane holds both
  airborne UAVs and ground-based SAMs, which is precisely what §1 made
  possible — so a bare 30px row gap was being eaten by a 20px pop and dropping
  an elevated node onto the grounded one below it. This was the last 8 buried
  nodes.

Measured after: **0 buried icons**, densest lane spans 150px inside its 176px
lane, so nothing spills.

## 4. Side identification

The persistent cue was a filled pad at `opacity: 0.16`, which at any real
camera distance washed out against terrain of similar value — not something
you could read before the label. Replaced with a hard-edged ring in the side
colour plus a dim fill: the ring survives distance and shallow angles because
it is the *shape* carrying the signal, not the tint, and the fill keeps the
footprint readable when the ring is near edge-on. The ring brightens on hover
and selection rather than being replaced, so the cue is continuous.

Carried onto the DOM labels too — a side-colour bar down the leading edge of
every pin, and the collapsed dot takes the side colour as its fill with the
domain colour as its rim. So even a fully thinned-out far field still answers
"whose is that?" without being read.

Ring radius was set to 2.9/2.15 units rather than the 4.0 first tried: at the
densest cohort's ~5.4-unit pitch, r=4 rings overlapped their neighbours.

## 5. Floating nametags in tilted views

Root cause: the label anchor was a **world** point, `pos.y + markerY + 3`.
Projecting a point 3 units above the marker and drawing the label there means
the on-screen gap between icon and label is whatever perspective makes it —
it collapses toward zero as the camera tilts toward the horizon and grows
without bound as it looks down. The CSS leader was a fixed 6px stub, so at
most camera angles it pointed at empty ground rather than at the icon.

Fix: the anchor is now the **marker's own** world position, and the entire
lift is applied in screen space as a constant `LABEL_LIFT_PX = 28`. The leader
line's height is driven by the same constant via a CSS custom property, so
the stub always lands exactly on the icon by construction rather than by
tuning. A dot centres *on* the marker; a titled label hangs its bottom edge
one lift above it.

Also added, as the brief asked:

- **Occlusion.** A cheap ridge probe marches the camera→marker segment against
  `terrainHeight()`. Six samples is not a depth buffer, but it catches the case
  that actually misleads — an asset in dead ground behind a rise, labelled as
  if it were in front of it. Such a label degrades to a dot rather than
  disappearing; only grounded assets are probed, since elevated ones can't be
  hidden by terrain.
- **Fade by distance**, applied to dots so the far field recedes.
- **Off-screen culling** against the label's own box rather than the marker
  point, so a pin whose title would land entirely outside the viewport is
  never built.

## Verification

No test suite exists, so this pass used two harnesses, per the pattern the
repo already relies on:

1. A **node harness over the real modules and the real asset JSON** — no
   reimplementation of the logic under test — asserting: every ground-based
   system resolves to a non-elevated platform; UAVs and satellites stay
   elevated; every grounded asset's Y sits on the terrain surface; cohorts
   span the strip; no two same-side assets are closer than 2.5 world units.
2. A **headless Playwright pass** (Chromium + swiftshader) measuring label
   overlaps, buried hit targets, tier counts and reveal-on-hover across
   default, tilted, zoomed-out and zoomed-in framings, in both views, with a
   before/after comparison against a `git worktree` build of HEAD.

Two things the harness got wrong before the app did, recorded so the next
session doesn't re-chase them:

- **`page.mouse.wheel` with a negative delta is not delivered** under this
  headless config, which made zoom-in look permanently broken in both the new
  build *and* HEAD. Dispatching real `WheelEvent`s at the canvas works
  correctly in both directions. There was no zoom bug.
- **A stale `vite preview` on the comparison port** silently served the new
  bundle as if it were HEAD, producing a "before" measurement identical to the
  "after". Always confirm the served bundle hash when diffing builds.

## Where the brief and prior passes disagreed

1. **"Split the field or gate the tether check on the correct one"** — did
   both, and neither exactly as a minimal reading would. Added
   `platform_domain` *and* a category-prefix inference, because writing the
   field into 16 files fixes today's roster while only the inference protects
   the next asset someone adds through the editor.
2. **Pass 7's EW/C2 "mast height" deviation is partly reversed.** It was
   recorded as a deliberate call to preserve, and §1 explains why the reversal
   keeps its intent rather than discarding it — the tiers remain in
   `DOMAIN_ALTITUDE`; only the five ground-mounted assets stop using them.
   Flagged rather than done quietly, since the earlier pass argued for it
   explicitly.
3. **Item 2 was not scoped to a view, so it was done for both.** The 2D view
   is where the label overlap was actually worst (81 pairs), and fixing only
   the 3D view would have left the schematic view unreadable at 87 assets.
4. **Two 2D fixes were not asked for**: uncapping sub-rows and retuning
   `minIconSeparationPx`. Both were required to make item 2's 2D half
   meaningful — decluttering labels on nodes whose icons are stacked on top of
   each other fixes nothing — and both fixed a real "this node cannot be
   clicked" defect. Called out here rather than folded in silently.
5. **Not fixed, deliberately:** `data/assets/side_a-uav-reconnaissance-
   tactical.json` references `gallery/leleka-100-launch.jpg`, which does not
   exist and 404s. Dangling since Pass 6. It is a content defect, and this
   pass was scoped to rendering. Logged in BACKLOG.md instead.

# Pass 9 — navigation & IA: hamburger drawer, routed pages

The brief: replace the stacked-button toolbar with a hamburger drawer; turn
Data health, Key lessons and About/disclaimer from modals into real routed
pages with the same content; structure routing so a page type is cheap to
add, since an asset library page is coming later; no visual/terrain content
changes.

## 1. Routing is hash-based, not pushState

`vite.config.ts` serves this app from GitHub Pages as a project site at
`/Warfare/` with no server-side rewrite — a direct load of a pushState URL
like `/Warfare/health` 404s before React ever runs, since there's no
`404.html` SPA-fallback trick in this repo. `main.tsx` already carved out
`#bench` as a hash-based escape hatch for the render-bench harness, on
exactly this constraint. `src/state/router.tsx` extends the same mechanism
rather than introducing pushState (which would need the 404 workaround) or a
router dependency (nothing in this app needed one before, and the whole
router is ~50 lines): `#/health`, `#/lessons`, `#/about` are real,
bookmarkable, back-button-aware URLs that survive a hard reload — verified
with a Playwright pass that reloads mid-route. `#bench`'s own hard-reload
behavior had to be narrowed first: `main.tsx` reloaded the page on *every*
`hashchange` before this pass, which would have blown away app state on
every drawer navigation. It now reloads only when bench mode is entered or
left; in-app route changes are handled by `RouterProvider` without a reload.

## 2. Page registry, not a switch statement

`src/pages/registry.tsx` is the one place that knows what pages exist — path,
title, nav label, an optional live badge computed from `WorldModel` (issue
counts, lesson counts), and the component. `NavDrawer` renders its nav list
by mapping `PAGES`; `App.tsx` resolves the current route with `findPage()`.
Adding the asset library page mentioned as coming later is meant to cost one
entry in this array plus the page component — no changes to the router, the
drawer, or the app shell.

## 3. What counts as a "page" vs. what stays a panel

Only About, Data health and Key lessons were named — Categories, Distance
bands and Asset editor stay `PanelId`-gated floating panels/popovers, not
routes. They're live-editing surfaces meant to float over the map you're
editing (Categories in particular is deliberately a popover rather than a
modal, per its own file header, so filtering feels like adjusting a live
view rather than leaving it), where About/Data health/Lessons are read-only
reference content with no reason to stay anchored to the map underneath.
Treating all six identically would have been a more literal reading of "the
control panel" but would have broken that distinction for no asked-for
reason — flagged here rather than done quietly.

## 4. Drawer open/close semantics

`PanelId` gained `"nav"` for the drawer and lost `"about"`/`"health"`/
`"lessons"` (now router-owned, not panel-owned). Because `openPanel` is a
single-slot gate, opening Categories/Distance bands/Asset editor from inside
the drawer closes the drawer for free — no extra wiring needed. Toggle-only
controls (view mode, sides, overlays, link types) don't touch `openPanel` at
all, so flipping several of them in a row leaves the drawer open, which is
the expected way to use a filter panel. Page-nav links close the drawer
explicitly on click, since navigating replaces what the drawer was floating
over.

## 5. Content diff is chrome-only

Each page component (`src/pages/{About,DataHealth,Lessons}Page.tsx`) is the
former modal's body verbatim, minus the `.modal`/`.modal__scrim`/close-button
wrapper (now `PageShell`) and minus the `openPanel` gate (now the router).
The three `setOpenPanel(null)`-on-action calls (jump to an asset from a
health issue, "show on map" from a lesson) became `navigate("/")` — same
effect, closing the overlay and returning to the map, just phrased as
routing home instead of dismissing a panel. Typography (`.modal__body h2/h3/
p/ul/li`) is shared with `.page__inner` via extended selectors rather than
duplicated, so the two chromes can't visually drift apart by accident.

## Where the brief and prior passes disagreed

1. **A small addition beyond the literal ask:** the hamburger button carries
   a small red dot when there's a data error, so the "something needs
   attention" signal the old toolbar gave for free (the Data health chip's
   `has-error` state, visible at a glance) doesn't silently disappear behind
   a closed drawer.
2. **`document.title` now changes per route** (`"Data health — Multi-Domain
   Battlefield"`, etc.). Not asked for, but it's what makes a route feel like
   a real page rather than a modal with a new address, and it's a few lines.
3. **Not done:** Escape does not navigate a routed page back to "/" — it only
   closes panels/drawer and clears selection, unchanged from before. Pages
   close via their own ✕ or the browser back button (hash history), which
   already exist; adding a second close path for pages only felt like scope
   creep on a pass explicitly scoped to structure, not new interaction
   surface.

## Verification

`npm run typecheck` and `npm run build` clean. A headless Playwright pass
(Chromium + swiftshader, per the repo's usual harness) against
`npm run preview` confirmed: the old `.toolbar` is gone; the drawer opens
and lists all three pages plus their live badges; navigating to each page
sets the corresponding `#/...` hash, renders `.page`, and closes the drawer;
a hard reload on `#/health` reproduces the same page (the whole point of
choosing hash routing over pushState here); closing a page returns to `#`
empty-hash and the map; a toggle click (3D → Schematic) inside the drawer
leaves the drawer open; and `#bench` still loads the render-bench harness
untouched.

# Pass 10 — world-building: destruction gradient, coastal water, mixed biome

Brief: build on Pass 8's rendering-foundation fixes without reintroducing the
label/spread/anchoring regressions that pass closed out. Three asks — (1) a
distance-band terrain destruction gradient (0–5 km total destruction, 5–20 km
damaged forest/mixed structures, 20–50 km lighter damage, 50 km+ mostly
intact); (2) a body of water, explicitly framed as also giving the Russia
naval/Black Sea Fleet backlog gap somewhere to exist; (3) expand the terrain
to read as a mixed-biome representative strip — urban clusters, villages,
steppe, fields, forest belts — while keeping the composite/illustrative
framing the About page already commits to. Log the generation approach here.

Nothing in `src/scene/`, `src/scene/labelGrid.ts`, `src/data/placement.ts`,
or `worldMapping.ts`'s `lateralLayout`/`worldPlacement` was touched. The
changes are additive geometry/colour in `terrain3d.ts`, `props.ts` and
`scenery.ts`, plus one new parameter threaded through an existing call
(`buildScenery(proj, budget, halfWidthX)`) — Scene3D.tsx's asset-placement
effect, where Pass 8's fixes live, is unchanged.

## 1. The destruction gradient is a fixed world-X threshold, not a live one

`damageIntensity(x)` in `terrain3d.ts` returns 1 at the zero line, tapering
through the brief's tiers to a small residual (0.02) past 50 km-equivalent —
never quite zero, so a rare "destroyed key infrastructure" placement out in
the intact zone still has somewhere to belong. The stop values (39, 61, 82
world units) are `worldXFor("side_b", 5|20|50, proj)` computed once against
the *shipped* `bands.json`/`domains.json` projection, not read from the live
`Projection` this module would need to accept as a parameter to track a band
edit in real time:

```
5 km  -> 38.83 world units
20 km -> 60.83 world units
50 km -> 81.89 world units      (side_a mirrors exactly, confirmed numerically)
```

This is the same convention the existing zero-line scar term already used
(a fixed radius, not derived from `proj`), for the same reason: `terrainHeight(x, z)`
is a pure `(x, z) -> number` function that props.ts, scenery.ts, and
Scene3D.tsx's pads/tethers/trenches all call directly, with no `Projection`
in scope at most of those call sites. Giving it one would mean either
threading `proj` through every caller (a much larger, riskier diff than this
pass's scope) or accepting that ground height could silently disagree with
itself mid-session as someone drags a band slider. Fixed thresholds keep the
one property every other module's anchoring depends on: same `(x, z)` in,
same height out, always. **This is a flagged deviation from a literal
reading of the brief** — if bands.json's tactical cutoff is edited from 5 km
to 8 km in the live band editor, the ground scorch tint doesn't move to
match. It reads the km stops the brief specified, but against the default
bands, the same way the "doctrine depths" ruler overlay already reads
`docs/doctrine.md`'s findings as a fixed citation regardless of live band
edits (see the About page's own copy on that point).

The gradient drives three things, layered in `buildTerrain`'s per-vertex
colour pass: a scorch tint blended over the existing scar/side/elevation
tints; a field-patchwork tint on dry ground where `dmg < 0.5`; and, in
`props.ts`, per-instance treeline colour and height via
`InstancedMesh.setColorAt` (bare/scorched near the line, green canopy tint
further out, shorter trunks in the damaged bands) — one extra buffer, not an
extra draw call, so the tree budget's cost stays what Pass 6 tuned it to.

## 2. Coastal basin + water plane

`buildWater()` sits next to `terrainHeight()` in `terrain3d.ts` rather than
in `scenery.ts`, because it shares the same fixed-world-X convention and the
same `coastalDepression()` term that carves the basin `terrainHeight()`
draws. Two constants had to be picked with a real margin, worked out
numerically rather than guessed:

- `side_b-strategic-target-power-plant` (250 km, x≈122.40) — a shipped,
  sourced asset — had to stay dry. `COAST_X0 = 126` gives it a ~3.6-unit
  buffer before the depression even starts ramping.
- The two new Black Sea Fleet vessels this pass adds (§4 below, 440/480 km,
  x≈138.7/142.1) had to land in full-depth water. `COAST_X1 = 140` reaches
  full basin depth (9 units) right around where the closer of the two sits,
  and the further one is comfortably past it.

The water itself is a **separate mesh**, not just the terrain's own vertex
colour painted dark in the depression. A flat-shaded matte plane at the same
roughness as the ground read as a dark wet-looking dip, not water; a second
plane with lower roughness (0.18) and a little transparency, sitting a fixed
`WATER_LEVEL_Y` above the carved basin floor, is what actually reads as a
surface rather than a hole. Its far edge sizes to `halfWidthX` (the same
value `buildTerrain` already receives) so it always reaches exactly as far
as whatever terrain extent got generated; its near edge (the shoreline) is
fixed, for the same live-band-edit reason as §1 — one more place this pass
consistently didn't thread `proj` where it didn't have to. A low-frequency
noise wobble on the shoreline's X keeps it from reading as a ruler-straight
cliff edge.

`buildPortHarbor()` (§3) sits right at the shoreline, at 262 km — inland of
`COAST_X0` — giving the coast a specific "this is a base," not just an edge
where the ground stops.

## 3. Mixed biome — hand-placed landmarks, same convention as the existing set

Villages (`buildVillage`, three condition tiers sharing one `buildHouse`
composer rather than three separate builders — only the material/roof-
completeness choice differs), an urban cluster, a ruined-infrastructure
set-piece, and hand-placed wreck markers all extend `LANDMARK_BUILDERS` /
`LANDMARKS` — the exact mechanism the three Pass 6 landmarks
(power_plant/fuel_depot/command_post) already used. Placement is hand-picked
`(side, km, z)` per entry, following the destruction gradient: ruined
villages at 3–3.5 km, damaged at 9–11 km, intact at 28–33 km and again at
140–180 km, an urban cluster per side past 130 km, one ruined-infrastructure
piece per side as the brief's "occasional destroyed key infrastructure" in
the otherwise-intact deep rear.

Wrecks are split deliberately across two mechanisms rather than one. The
*field* of them near the line — what makes 0–10 km read as strewn with
burnt vehicles rather than a couple of set-pieces — is
`props.ts`'s `buildWreckHusks()`, instanced like the existing crater/scrub
props (one draw call, Gaussian-clustered on the line same as craters). The
handful of *specific* "still burning" wrecks (`scenery.ts`'s
`buildWreckMarker`) are hand-placed `Group`s instead, because they carry an
emissive ember accent an `InstancedMesh`'s one shared material can't give
per-instance without a custom shader — nothing in this codebase uses one
(checked before writing this), and adding the first would have been a much
bigger architectural addition than three burning-wreck landmarks justify.
**Scope interpretation, flagged:** "burning wrecks" reads here as a
scorched hull plus a small emissive glow, not a particle/flame system —
consistent with the low-poly flat-shaded language everything else in this
scene already speaks, not a corner cut for time.

Rolling steppe and forest belts were already this scene's baseline aesthetic
(Pass 6's terrain header literally says "rolling steppe"; Pass 7 established
forest belting in `props.ts`'s `buildTrees`) — §1's colour/height changes
extend that existing belt rather than replacing it. "Fields" are a coarse
vertex-colour patchwork on dry mid/far ground (`COLOR_FIELD_DRY`/
`COLOR_FIELD_GREEN`, cell-noise checkering) rather than new furrow geometry
— matching the vertex-coloured-facet visual language the whole terrain
already commits to instead of introducing a second art style for one biome.

## 4. Two new named Russia-naval assets, and a correction found while writing this

Item 2's water body was explicitly framed as "gives us a place to build out
the Russia-naval category" — read as license to add real assets, not just
terrain. Two, hand-authored rather than run through the batch
`import-catalog.py` pipeline (worth two files, not worth spinning up a
spreadsheet round-trip for): `side_b-naval-kilo-636-3` (Improved Kilo-class,
Project 636.3, Black Sea Fleet's 4th Independent Submarine Brigade) and
`side_b-naval-admiral-grigorovich` (Project 11356R, the fleet's primary
surface Kalibr launch platform). Both real-researched — USNI Proceedings,
Naval News, GlobalSecurity.org, naval-technology.com, globalmilitary.net,
and FPRI's Black Sea Fleet analysis, which is also where the Sevastopol ->
Novorossiysk relocation detail in both assets' `employment_notes` comes
from. `node scripts/audit-content.mjs --write` (the actual, mechanical
verification step, not self-graded) stamped both `verified` — 3 and 4
independent sources respectively. Total roster: 89 assets, 66 verified, 13
low-confidence, 10 unverified (unchanged from Pass 7 — the two new assets
added zero new Data Health issues).

**Compressed pipeline, flagged:** `docs/CONTENT_PIPELINE.md` calls for
drafting a whole category in one sitting and verifying it in a separate,
later one. Two assets, hand-authored with real citations gathered before
writing rather than invented and checked after, is a smaller-scale version
of that same discipline rather than the full two-sitting batch process —
worth naming as a compression, not a departure, since the audit script still
ran as a genuinely separate, mechanical check rather than my own judgment
grading my own work.

Found while updating `docs/BACKLOG.md` for this: the Ada-class corvette
listed there since an earlier pass as a Russia-naval candidate is actually
Ukrainian — the Turkish-built `Hetman Ivan Mazepa`, Ukraine's first corvette
(confirmed via Naval News, Defense Express, naval-technology.com). Bundling
it with the Russia naval gap was a real, pre-existing inaccuracy, not
something this pass introduced — corrected in place in `BACKLOG.md` (struck
through, not deleted, so the correction itself stays visible) rather than
silently fixed.

## Where the brief and prior passes disagreed

1. **Fixed world-X thresholds, not live-`Projection`-driven ones**, for both
   the destruction gradient and the coastline. Covered in §1/§2 — the brief
   describes both in km; this reads those km against the *default* bands
   only, for the same reason the existing scar term already worked that way.
2. **"Burning wrecks" implemented as scorched-hull-plus-ember-glow, not a
   literal fire/particle effect.** Covered in §3 — a scope interpretation
   consistent with the existing visual language, not a corner cut.
3. **Item 2 read as license to add real Russia-naval data assets, not just
   terrain.** The brief's own wording ("gives us a place to build out the
   category") reads as an invitation rather than an instruction to stop at
   geometry — flagged in case that reading over-reached.

## Verification

`npx tsc --noEmit` and `npm run build` clean throughout (checked after each
file, not just at the end). `node scripts/audit-content.mjs --write`: 89
assets, 66 verified / 13 low-confidence / 10 unverified, both new naval
assets `verified`. Headless Playwright pass (Chromium + swiftshader) against
`npm run preview`: default view screenshot, then zoomed-out and panned-right
passes reaching the side_b deep rear — the water plane renders with a
visible shallow-to-deep gradient, the urban cluster and a village sit near
the shoreline, `side_b-strategic-target-power-plant` (250 km) reads dry with
a visible margin before the water starts, and both new vessels' DOM labels
are present and clickable after panning that far out. Data Health: 0 errors,
37 total issues (identical count to before this pass — the two new assets
and the terrain/scenery changes introduced no new warnings). Right-drag pan
in headless Chromium needed a mouse-down point clear of any label overlay to
register at all — a test-harness quirk, not an app behaviour change; noted
here in case a future pass's headless verification hits the same thing.

---

# Pass 11 — interactivity: scenario focus mode, drag-to-reposition, asset library

Three-item brief: fix "show on the battlefield" and turn it into a real
scenario-focus mode; make assets draggable (ground pinned to terrain, air
pinned to its elevation band) with non-mutating duplication for swarm/
scenario building; a new asset library page. Explicitly told to stop and
flag rather than ship a half-working version if the highlight/blur logic got
complicated — it didn't, but two other things in this pass did get
genuinely complicated before landing, and both are called out below because
they were caught by testing the actual gesture, not by reading the code.

## 1. Scenario focus mode — what was actually broken

**Diagnosis first, since "broken" needed to be pinned down before fixing
it.** The mechanism existed (`ViewState.focusRequest`, wired from the
Lessons page since Pass 6) and partially worked: the camera flew to the
lesson's assets and their DOM labels dimmed. Three real defects, not one:

- **No way out.** `clearFocus()` was written and exported and never called
  from anywhere. Once a lesson dimmed the map, that state was permanent for
  the rest of the session short of firing another focus request.
- **Selecting anything outside the focus set looked broken.** `is-dimmed`
  didn't check selection/hover, so clicking a dimmed asset to compare it
  against the highlighted lesson opened its detail panel while the asset
  itself sat at 18% opacity — a selected thing rendered as barely visible is
  exactly the "half-working" outcome the brief warned about.
- **Only the DOM labels dimmed.** The WebGL markers (the octahedron icons
  actually sitting on the terrain) stayed at full brightness regardless of
  focus, and the Schematic (2D) view had zero awareness of `focusRequest` at
  all — switching views mid-lesson silently dropped the whole effect.

**What shipped**, all reusing the existing `focusRequest` mechanism rather
than adding a second one:

- `FocusRequest` gained an optional `label` (lesson title / asset name),
  surfaced in a new `ScenarioFocusBanner` — the entry AND the one deliberate
  exit besides Escape. Every place that calls `focusAssets()` (Lessons, the
  Asset editor's "view on map", the new library page) now passes a label.
- Real exits: the banner's own button, and Escape (a new tier between
  "close a panel" and "deselect" — see App.tsx). Deliberately **not** added
  to a background click in either view — that gesture already means
  "deselect," and overloading it to also silently drop scenario focus felt
  like the wrong kind of surprise mid-demo. Flagged as a scope choice, not
  an oversight.
- Dimming now excludes anything selected or hovered, in both the label class
  computation and the 3D marker material pass — the exact bug above.
- **3D markers dim/desaturate now, not just labels.** The octahedron marker,
  its side ring and its fill all blend toward a flat grey and drop opacity
  when outside the focus set, computed in the same per-frame loop that
  already set selection/hover emphasis (`Scene3D.tsx`). Hero models (11
  assets with real geometry, Pass 6) are deliberately **not** touched — their
  materials are cached and cloned per `models.ts`'s own comment ("Models are
  cached per builder and cloned"), and mutating a clone's material without
  first checking whether that mutation reaches back to the shared cache was
  a real risk not worth taking for a cosmetic dim. Flagged rather than
  silently scoped out: a focused/dimmed hero model still gets the marker+
  ring treatment every asset gets, just not a dimmed model on top of it.
- **2D view now participates.** `Scene.tsx` computes a `scenarioFocusSet`
  from `focusRequest` and, when active, it takes over `AssetNode`'s fade
  treatment entirely (a new `is-focus-dimmed`/`is-focused` pair, blurred via
  real CSS `filter: blur()` — cheap and exact for DOM, unlike the WebGL
  layer) rather than combining with the pre-existing hover/select-neighbour
  fade (`is-faded`), so the two mechanisms can't disagree about what's
  dimmed. `ConnectionsOverlay` got the same override: with a scenario focus
  active, an edge is "in focus" only when BOTH ends are in the named set —
  literally the dependency line the lesson is about — rather than the
  ordinary single-node hover/select emphasis.
- **"Blur," read honestly.** A real screen-space blur needs a post-
  processing pass (`EffectComposer` or similar) that doesn't exist in this
  renderer and wasn't worth adding for a dim effect. The DOM layers (2D
  nodes, 3D labels) get genuine `filter: blur()` since that's free there;
  the WebGL markers get desaturate+dim instead. Documented in both places
  rather than silently substituting one for the other and calling it done.

## 2. Drag-to-reposition — two real bugs caught only by testing the gesture

**The feature is 3D-only, flagged deliberately.** "The battlefield" in this
codebase's own language is the 3D view (`Scene3D.tsx`'s file header literally
opens "The WebGL battlefield"); the Schematic view's vertical axis is a
domain lane plus auto-packed sub-row, not a free coordinate anything could
drag to. The Schematic view already supports repositioning along the one
axis it does own — `distance_km_from_zero`, editable from the detail panel
since Pass 2 — and a drag there would just be a mouse-driven version of that
same field. Building a second, different lateral concept for 2D to make
"draggable" literal everywhere felt like solving a problem nobody has; not
done, flagged here rather than silently scoped down.

**Mechanics.** `AssetOverride` gains `lateral_offset_world?: number` — a
3D-only layout preference, deliberately kept out of the `Asset` schema
(`types.ts`) since it's not sourced data, the same reasoning that already
keeps `platform_domain` inference separate from authored fields.
`worldMapping.ts` gains `worldXToKm()`, the literal inverse Pass 1 predicted
("`offsetPxToKm` specifically so drag-to-reposition can convert a drop x
back into a distance") — implemented as a bounded binary search rather than
inverting `Projection.xFor()`'s algebra by hand, since that algebra folds in
the lane-oblique term and the zero-gutter and reproducing it by hand would
have to stay in lockstep with `projection.ts` forever. `lateralLayout()`
now takes a manually-placed asset OUT of the auto-spread/relaxation pass
entirely rather than feeding it in and nudging the result — the relaxation
pass exists to keep *auto*-placed assets from colliding, and running a
user-dropped one through it would silently move it again right after the
user let go. During the drag, every live update goes through the exact
same `worldPlacement()` every asset is placed with on load — that's the
entire mechanism behind "ground stays pinned to terrain height, air stays
in its band": only km (via `worldXToKm`) and z move; Y is whatever
`worldPlacement()` says it should be at the new point, same as day one.

**Bug 1 — hit-testing off the wrong surface.** First implementation
raycasted the WebGL marker meshes from a `pointerdown` on the canvas,
capture-phase on the mount div so it could beat `OrbitControls`' own
listener to `controls.enabled = false`. It typechecked, built, and was
*wrong*: the DOM pin (name + km label) sits `LABEL_LIFT_PX` plus its own
height above the marker's actual screen point — grabbing the visible,
obviously-clickable label almost always raycasts past the small octahedron
sitting well below it. Caught only by actually dragging a pin in a headless
run and finding the distance hadn't moved. Rebuilt around the pin itself:
`onPointerDown` on the `.pin3d` button, which also turns out simpler — the
pin lives in a sibling overlay div, never inside `renderer.domElement`, so
`OrbitControls` never sees the gesture at all and there's no priority race
to win in the first place.

**Bug 2 — a stable-looking callback that wasn't.** The pin-based rewrite
still failed silently: `pointerdown` fired, nothing else did. Root cause was
a `useCallback` dependency array holding the entire `view` object (`[...,
overrides.setAssetOverride, view]`) so it would have `view.select` for the
post-drop confirmation. `view` gets a new identity on essentially every
hover, and an unrelated cleanup effect keyed on that same callback's
identity was tearing down the `pointerup`/`pointermove` window listeners the
instant a hover fired mid-drag — which a real drag gesture does constantly,
crossing other pins on the way. The fix is one word: depend on `view.select`
(a stable `useState` setter) instead of `view`. Verified by an actual
Playwright drag before and after: 0% success, then a real distance change
persisted to the override store, both confirmed by reading `localStorage`
directly rather than trusting the UI alone. Neither bug would have been
caught by a code read — both needed the gesture actually run.

## 3. Duplicate — reuses the Asset editor's own store, not a new one

`DetailPanel.tsx` gained a "⧉ Duplicate" button. It writes into
`overrides.customAssets` — the exact mechanism `AssetEditorPanel` already
uses for brand-new assets (Pass 7) — so a duplicate is a real, independent
`Asset` record from the moment it's created: draggable, editable, deletable,
and it never touches the `data/assets/*.json` file it was copied from. Text
fields bake in whatever local edits the original currently shows (its
effective role/characteristics/employment/contrast, not necessarily the
shipped file's own) since the clone is meant to drift independently from
here on. `connections` copy verbatim — a duplicated Lancet keeps the same
Starlink/ISR dependency edges the original declares, which is the correct
read of "swarm/scenario building": five of the same asset should share the
same real dependency, not five orphans. New id/name collision handling
walks `-copy`, `-copy-2`, ... against both the shipped roster and existing
custom assets.

## 4. Asset library page

`src/pages/AssetLibraryPage.tsx`, registered in `pages/registry.tsx` per
that file's own note that this page was coming ("costs one entry here plus
the component itself" — it did). Filters by side and by category (the
`data/groups.json` taxonomy, same chips `CategoryFilterMenu` already uses)
plus a name/category text search, added beyond the literal ask because at
90 assets "browse by category and side" alone still leaves a long list —
flagged as a small addition, not a silent scope change. Selecting a row
expands it in place (same interaction language as the Lessons page's own
list) to show its role and three actions:

- **View detail** — `view.select()` + navigate home, same pattern
  `DataHealthPage` already uses to jump from an issue to its asset.
- **Show on battlefield** — calls `focusAssets([id], name)`, i.e. scenario
  focus mode from §1 applied to a single asset. Free reuse: the library
  page didn't need its own spotlight mechanism, item 1's already is one.
- **Edit** — branches on what kind of asset it is rather than pretending
  there's one editing surface for both. A custom asset (built in, or
  duplicated via, the Asset editor) opens that form directly in edit mode,
  via a new one-shot `ViewState.editorTarget`/`requestEditAsset()` — the
  same consume-once pattern `focusRequest`'s nonce already established. A
  shipped asset opens the detail panel instead, which is genuinely where its
  inline edit controls live (`AssetEditorPanel.tsx`'s own file header is
  explicit that its form can't touch a shipped asset's fields — extending it
  to do so was out of scope for this pass and would cut against that
  file's own stated design).

## Where the brief and prior passes disagreed

1. **Drag-to-reposition scoped to the 3D view only.** See §2 — the brief's
   wording ("make assets draggable on the battlefield") reads naturally as
   the 3D view in this codebase's own vocabulary, and the 2D view's vertical
   axis has no free coordinate to drag along without inventing one.
2. **"Blur" is real CSS blur on the DOM layers (2D nodes, 3D labels) and
   desaturate+dim on the WebGL markers**, not a literal blur everywhere —
   see §1. A post-processing pass for the 3D canvas was judged not worth
   adding for a dim effect.
3. **Hero models don't participate in scenario-focus dimming.** See §1 —
   their materials are cached/cloned per `models.ts`, and mutating a clone
   without checking whether the cache is shared was a risk not worth taking.
4. **Background click does not clear scenario focus**, only the banner and
   Escape do. See §1 — overloading the existing "click empty space to
   deselect" gesture felt like the wrong kind of surprise mid-demo.
5. **Asset library's search box** wasn't asked for; added because the ask
   ("browse by category and side") still leaves 90 assets to scroll without
   one.

## Verification

`npx tsc --noEmit` and `npm run build` clean throughout. No test suite
exists, so this pass leaned harder than most on the headless Playwright
harness precisely because §2's two bugs were both invisible from reading the
code — both were only found by actually running the gesture:

- Scenario focus: triggered from the Lessons page, confirmed the banner
  text/count, confirmed dimmed-pin and focused-pin counts, confirmed a
  dimmed pin becomes fully visible on selection (the bug this pass fixed),
  confirmed the banner and all dimming clear on both its own Exit button and
  Escape, and confirmed the identical spotlight mechanism fires correctly
  from the library page's "Show on battlefield" for a single asset.
- Drag: selected an asset, read its distance from the detail panel,
  performed an actual multi-step `mouse.move`/`down`/`move`/`up` sequence
  on its pin, and confirmed both the on-screen distance AND the raw
  `localStorage` override record changed to match — not just that the UI
  looked different. Also confirmed a plain click (no movement) still
  selects normally and writes no override, so the drag threshold isn't
  accidentally eating ordinary clicks.
- Duplicate: selected a shipped asset, clicked Duplicate, confirmed a new
  `(copy)`-suffixed asset was selected and it persisted in
  `overrides.customAssets` across a reload.
- Library: filtered by side and by category, expanded a row, and exercised
  all three actions from it.

# Pass 12 — model style guide (documentation/consistency, no feature work)

Brief: write a short model style guide alongside this file, based on the
best-looking assets already in the scene, use it to audit the existing 3D
models, flag deviations — no new features. `docs/MODEL_STYLE_GUIDE.md`.

The reference set is the 11-asset hero tier in `src/three/models.ts` —
chosen because it's the one file with an explicit, self-enforced
consistency rule already (`export const HERO_MATERIALS = [...]`, five
shared materials, box+cylinder-only primitives), not a subjective pick.
Every number in the guide (poly-budget range, segment-count ceiling,
roughness/metalness bands, saturation band) was measured off the actual
source — grepped geometry constructors and material declarations across
`models.ts`, `scenery.ts`, `props.ts`, `terrain3d.ts`, then computed HSL
saturation and pairwise RGB distance in Python — not asserted from general
low-poly-aesthetic knowledge. Worth being explicit that this was measured,
not eyeballed, since a style guide's numbers are only as good as their
source.

One real, fixable inconsistency came out of it: `scenery.ts` declares 19
one-off materials with no shared/exported list the way `models.ts` does,
and at least four pairs are close enough in RGB distance (2.2–13.0 out of a
441-max scale) to be visually redundant — `PIER_WOOD` vs. a `props.ts` tree
colour, `WALL_RUINED` vs. `RUBBLE` in the same file, `SANDBAG` vs.
`WALL_INTACT` in the same file, `CONCRETE_DARK` vs. `PIER_WOOD` in the same
file. Everything else audited clean: `flatShading: true` has zero
exceptions across all four files; primitive vocabulary (box+cylinder-only
for hero models, a wider set for scenery) is a documented split, not scope
creep; segment counts (4–14) and primitive counts (6–25) hold across every
file, hero and scenery alike; the three deliberate saturation/roughness
accents (`GLASS`, `EMBER`, the Pass 10 water plane) are each already
commented as intentional at the point they're declared. `ROOF_INTACT`/
`ROOF_DAMAGED` sit a little hot on saturation relative to everything else
and aren't marked as an accent — flagged as a smaller, arguable case rather
than a clear violation.

**Not fixed in this pass, on purpose**: the material-consolidation and
`SCENERY_MATERIALS`-export follow-up the audit recommends is left as a
recommendation, not applied. The brief was documentation and audit — making
that specific code change would have been the "no new features" instruction
undercut by exactly the kind of drive-by edit this pass exists to name
instead of quietly making.

## Where the brief and prior passes disagreed

Nothing to flag — this pass didn't touch runtime code at all
(`git status` after: two new/changed files, both docs). The one judgment
call worth naming: the brief said "flag which ones deviate" in the plural,
and the honest finding is that three of four files (`models.ts`, `props.ts`,
`terrain3d.ts`) don't deviate at all — reported that plainly rather than
manufacturing findings to make the audit look more thorough than the
codebase actually warranted.

---

# Pass 13 — OSM rail & tree-line pipeline (fetch + reduce; integration deferred)

Brief: an out-of-band spec for pulling real OpenStreetMap line features — rail
lines, windbreak tree rows, roads, rivers — for two Donetsk Oblast AOIs
(Pokrovsk first, Kramatorsk later), reducing them to an ordered point list per
feature, projecting to local X/Z, and committing the result as a static JSON
asset. The brief explicitly scopes this pass to the fetch step only: the
integration (extrusion / tree instancing / SVG paths) is "blocked on the
diagnostic" — i.e. on knowing whether the renderer is real 3D or 2.5D sprites —
and is to be prompted separately. Nothing in `src/` is touched by this pass.

## 1. The fetch is blocked at the egress proxy, and the file is absent, not faked

`https://overpass-api.de/api/interpreter` answers `403 Forbidden` to CONNECT
through this environment's proxy, as do `overpass.kumi.systems`,
`overpass.private.coffee`, `overpass.osm.ch`, `z.overpass-api.de`,
`lz4.overpass-api.de` and `api.openstreetmap.org`. The proxy's status endpoint
classifies it as `connect_rejected — gateway answered 403 to CONNECT (policy
denial …)`, and `/root/.ccr/README.md` is explicit that policy denials are
reported rather than routed around. Six hosts was enough to establish it is an
allowlist rather than one mirror having a bad day; testing further would have
been probing the policy, not diagnosing a fault.

The deliverable named in the brief — `osm-terrain-data.json` committed to the
repo — therefore does not exist at the end of this pass, and the alternative
was never on the table: hand-writing plausible coordinates for a real town and
committing them under `source.api: "Overpass API"` would produce a file
indistinguishable from real OSM data while being invented. Same reasoning the
repo already applies to `verification` being derived rather than asserted, and
to "not publicly disclosed" being a valid cost value.

What ships instead is the whole pipeline with a network-free path through it,
so the missing step is a one-minute human action rather than a re-do:
`--print-query` emits the exact Overpass QL for overpass-turbo.eu, and
`--raw=<file>` runs the entire reduce/project/write stage against a saved
response. `docs/OSM_PIPELINE.md` documents both routes.

## 2. Two stages in one file, and only the first one needs the network

`fetch` retrieves and saves; `reduce` classifies → simplifies → projects →
writes. Keeping `reduce` pure and separately invocable pays off beyond this
sandbox: re-projecting or re-simplifying committed data must not mean hitting a
rate-limited volunteer service again.

The fetch stage retries 2/4/8/16 s across three mirrors, but treats 400 and 403
as answers rather than glitches and fails immediately on them — the same
distinction the harness's own git-retry guidance draws.

## 3. Projection: metric, and deliberately not "scene units"

Equirectangular about the AOI centre, WGS84 metre-per-degree series evaluated
once at the origin latitude, output in km with +X east and +Z south (north is
−Z, so a top-down camera reads north-up). Over a 17 km box the linearisation
error is far below the 5 m simplification tolerance.

The brief says "project to local X/Z **scene** coordinates". This emits metric
km instead, and that is the one substantive deviation in the pass. The scene's
X axis is band-compressed distance from the zero line (Pass 5/6) — non-linear
by design, so that a 0–5 km FPV envelope and a 500 km strike target fit one
legible axis. Feeding real geography through it stretches 17 km of ground
across band boundaries at different rates, which bends a straight rail line
visibly. Emitting metric km makes the pipeline's output honest and leaves the
three real resolutions (metric inset in one band / lateral-Z only / a separate
real-geography view) open for the integration prompt to choose between. They
all consume the same metric frame, so nothing is lost by not choosing here.
Flagged in `docs/BACKLOG.md` as a product decision, not a code detail.

## 4. Douglas–Peucker at 5 m, on the projected points

OSM rail ways carry survey-grade vertex density that no view at this scale can
resolve. The tolerance is applied to the metric points so it means metres in
both axes rather than degrees meaning different things along lat and lon;
endpoints are always kept, so a line never shortens. `--tolerance=0` disables
it, and `length_km` is measured on the full vertex list before simplification —
the length is a fact about the feature, not about how coarsely it is stored.

## 5. `type` follows the brief; `closed` + `tags` carry what it flattens

The brief folds `natural=tree_row`, `landuse=forest` and `natural=wood` into
one `tree_row` type, so that is the type they carry. But a windbreak is a line
to instance trees *along* and a wood is a polygon to *fill*, so every feature
also keeps a `closed` flag and its raw tags. Kept the brief's schema, added
what a renderer will otherwise have to guess — flagged rather than quietly
re-designed.

Also on schema: `counts.skipped` reports every element that did not become a
feature by reason (`no_geometry`, `unclassified`, `not_requested`,
`degenerate`), and output is sorted by `(type, osm_id)` with all numbers
rounded, so a re-run is byte-identical and git shows a real data change or
nothing at all. The "degrade visibly, never silently" philosophy from
`validateAsset()` applied to a data script.

## 6. ODbL — the one place fetching data does carry an obligation

OSM is ODbL 1.0: rendering these features requires a visible "© OpenStreetMap
contributors" credit. The attribution string is written into every output
file's `source` block so it travels with the data rather than living only in a
doc, but nothing renders it yet — that lands on the integration pass and is in
the backlog.

This is not a breach of CLAUDE.md's "authored geometry only, never fetched
binary assets" rule. That rule exists because a fetched model or icon carries a
license nobody in the session can actually read (Pass 4/5). Coordinates from a
named source under a known, attributed, share-alike license are the case the
rule was drawn around — the credit is the price, and it is not optional.

## Where the brief and prior passes disagreed

1. **Metric km, not scene units** (§3). The brief's step 3 asks for scene
   coordinates; the scene's X axis is not geographic, so honest scene
   coordinates for real geography do not currently exist. Biggest deviation in
   the pass and the reason the integration prompt now has a second question to
   answer alongside the renderer diagnostic.
2. **`timeout:180` and one merged query, not four at `timeout:25`.** Four
   classes over a 17 km box regularly exceeds 25 s on a busy mirror, and one
   query is a third of the load on a volunteer-run service.
3. **Output at `data/osm/<aoi>.json`, not a single `osm-terrain-data.json`.**
   The brief names one file, then immediately describes running the same
   script against a second AOI — one file per AOI is what that implies, and it
   keeps Pokrovsk and Kramatorsk from overwriting each other.
4. **The committed data file is missing** (§1). Not a judgment call — the fetch
   is blocked — but it is the brief's actual deliverable, so it is named here
   rather than buried in a doc.

## Verification

No `src/` changes, but `npm run build` and `npx tsc --noEmit` were run anyway
and are clean. The reduce stage was exercised against a hand-built Overpass
fixture covering every branch: a collinear rail way (3 → 2 vertices), a rail
way with a ~1.1 m kink (simplified away at 5 m, retained at `--tolerance=0`), a
closed `landuse=forest` ring (`closed: true`), a river with a `null` geometry
entry (dropped, line stays contiguous), a `highway=secondary` way, an untagged
building way (`unclassified`), a single-vertex way (`degenerate`) and a bare
node (`no_geometry`) — all six expected features out, all three skip buckets
non-zero. Projection checked by hand against the constants: 0.01° of longitude
at 48.2828° N came back as 0.742 km east and 0.01° of latitude as 1.112 km,
matching the WGS84 series to the millimetre. Re-running on the same input
produced a byte-identical file (`cmp` clean). The live fetch path was run twice
and failed as described in §1; `--features=` filtering, `--tolerance=` bounds,
unknown-AOI and unknown-feature-class errors all exercised. The fixture lives
in the session scratchpad rather than the repo — there is no test harness here
to run it from, and a committed fixture nothing executes is a file that rots.

---

# Pass 14 — `data/osm/pokrovsk.json` committed, from a phone

Pass 13 built the pipeline and documented, correctly, that the fetch stage
cannot run inside this sandbox's egress proxy. This pass closes that out —
not by getting the sandbox online, but because the user came back on an
iPhone asking for the easiest way to get the data themselves, and "easiest"
kept narrowing until it worked.

## 1. The route that actually worked: GeoJSON export, pasted into chat

Overpass-turbo's *Export → download as raw OSM data* is what
`docs/OSM_PIPELINE.md` pointed to, but it's an API response with no real
filename — iOS Safari mostly won't save it, which is exactly what the user
hit ("i somehow cannot manage to save the json from my iphone"). The fix
wasn't a workaround in this repo, it was a different export format:
*Export → GeoJSON* is a real blob download that iOS handles through the
normal Save-to-Files flow, and failing that, its content pastes cleanly into
chat as plain text — which is what happened. The user pasted a complete
~2.6 MB `FeatureCollection` (1113 features) straight into the conversation.

That export uses `[lon, lat]` coordinate pairs inside `Polygon`/`LineString`
geometries, not the `{lat, lon}` objects Overpass's native JSON puts in
`elements[].geometry`. `--raw=` only understood the latter. Rather than
hand-convert the pasted data once, `scripts/fetch-osm-data.mjs` gained a
small normalization step: `--raw=` now sniffs `"type": "FeatureCollection"`
and runs a `geojsonToElements()` converter (Polygon outer ring / LineString
coordinates → a synthetic `way` element with `{lat, lon}` geometry) before
handing off to the same `classify` → `simplify` → `project` path native
Overpass JSON already went through. Both input shapes now produce the same
output for the same underlying data — this isn't a parallel code path, it's
one extra normalization step ahead of the existing one.

## 2. What came out of it

`data/osm/pokrovsk.json` is committed: 1113 features, nothing skipped
(`counts.skipped` all zero) — `tree_row: 1010` (900 forest/wood polygons plus
110 windbreak lines — Pass 13's "multipolygon forests aren't fetched" worry
turned out not to bite; the ways-only query still caught a dense forest
pattern), `road: 99`, `river: 3`, `rail_line: 1`. 29,269 raw vertices
simplified to 10,544 at the default 5 m tolerance (-64%).

**Flagged, not fixed:** `rail_line` is one way, two points, 5 m long. For an
AOI whose own note says "dense rail junction... rail yards," that is
obviously not the real rail network — it's a fragment. Every other class
looks properly populated (99 roads, 3 rivers, 900+ tree/forest polygons), so
this isn't the bbox or the format conversion; it looks like the
overpass-turbo view that produced the export either wasn't panned over the
rail yard when Export ran, or the query it ran had dropped the
`railway=rail` selector. The right fix is a follow-up export focused on
rail, from the user, when they're back at it — not inventing rail geometry
to fill the gap, which is the exact fabrication Pass 13 already refused to
do for the whole AOI. Logged in `docs/BACKLOG.md` rather than silently
shipped as if it were complete.

## 3. What this pass did not touch

No `src/` changes — this is still purely the data-acquisition half. Both
open decisions from Pass 13's §7 (real geography vs. the band-compressed X
axis; 3D meshes vs. 2.5D sprites) are exactly as open as they were; nothing
about having real Pokrovsk data in hand resolves either. `data/osm/kramatorsk.json`
still doesn't exist — same phone-export route would get it, not attempted
this pass since the user only supplied Pokrovsk data.

## Where the brief and prior passes disagreed

Nothing new disagreed with the brief. The GeoJSON branch is an *addition* to
the `--raw=` contract (a second accepted input shape), not a change to
`docs/OSM_PIPELINE.md`'s stated output schema or existing behavior — same
`data/osm/<aoi>.json` shape either way, verified byte-for-byte identical
field-by-field against what native Overpass JSON would have produced for the
same underlying elements.

## Verification

`npm run build` clean. Ran `node scripts/fetch-osm-data.mjs --aoi=pokrovsk
--raw=<pasted GeoJSON>` end to end: all 1113 input features classified and
reduced, zero skipped in every bucket (`no_geometry`, `unclassified`,
`not_requested`, `degenerate`), output file inspected feature-by-feature for
the `rail_line` entry (confirmed genuinely 2 points, not a truncation bug in
the converter) and spot-checked several `tree_row`/`road` entries for
plausible `xz` values relative to the AOI centre. Re-ran the reduce a second
time on the same input; output byte-identical (`cmp` clean), confirming the
new GeoJSON branch didn't break the pipeline's existing determinism
guarantee.

---

# Pass 15 — the "thin rail" gap from Pass 14 was a tag-value assumption, not missing data

Pass 14 flagged Pokrovsk's `rail_line` layer (one 5 m fragment) as a real
data gap and asked the user to re-export focused on rail. They did, from a
link built for exactly that: `way["railway"]` (any value, no `="rail"`
restriction) over the same bbox, run in overpass-turbo on their phone,
exported as GeoJSON and pasted in — the same route Pass 14 established.

## 1. It wasn't missing — it's `disused`

The wider query returned 306 ways. 299 are `railway=disused`, 3 are
`abandoned`, 1 `platform`, 1 `no`, and the original 1 `rail`. This is a real
Soviet-era freight yard — sidings, spurs, crossovers, a `service=yard`
throat with dozens of parallel tracks around the historic Pokrovsk
junction — mapped in full geometric detail but tagged as no longer
operating rather than as `railway=rail`. `classify()`'s brief-literal
`railway="rail"` selector was doing exactly what it was told; the AOI just
doesn't match that assumption. Widened `RAIL_TRACK_VALUES` to
`{rail, disused, abandoned, construction, narrow_gauge}` — physical track
geometry regardless of current operating status — and explicitly excluded
`platform`/`no` (station infrastructure, not track; both showed up as
separate `LineString` ways in the export and would have been wrongly
folded in under a bare `tags.railway` truthiness check).

## 2. Merge, not replace

The two GeoJSON exports overlap by exactly one way (the original
`osm_1085918173` fragment, present in both). Merged by feature id before
reducing — 1113 + 306 → 1418 unique input features, 1415 after the 3
platform/no exclusions — rather than discarding Pass 14's tree/road/river
data and re-fetching everything. `data/osm/pokrovsk.json` now carries
`rail_line: 303` (up from 1), everything else unchanged: `tree_row: 1010`,
`road: 99`, `river: 3`.

**Flagged:** total rail length sums to ~229 km, which sounds absurd for a
17 km AOI. It isn't a bug — Overpass's bbox filter on ways includes the
*full* geometry of any way with at least one node inside the box, and
several of these disused main-line ways run for tens of kilometres beyond
Pokrovsk in both directions (this is the same bbox-overshoot behavior noted
for the tree/road data back in the original pipeline design, just more
visible here because rail ways happen to be long). Nothing to fix — a
renderer consuming this file already has to decide what to do with
geometry that extends past the AOI's nominal 17 km box, same as any other
layer.

## Where the brief and prior passes disagreed

Pass 14 treated the thin rail layer as data to *flag*, and it was right to —
at that point there was no way to tell "genuinely sparse" from "wrong tag
value" without more data. This pass had that data and could tell the
difference. Nothing about Pass 14's `--raw=` GeoJSON support needed to
change; `classify()` was the only thing that was actually wrong for this
AOI, and it's a one-line widening, not a redesign.

## Verification

`npm run build` clean. Re-ran the merged reduce; `counts.skipped.unclassified`
is exactly 3 (the `platform`/`no` features, confirmed by id against the raw
export — not the 299 `disused` ways silently vanishing into the same
bucket). Spot-checked rail feature count (303), summed `length_km` across
all rail features (~229 km, explained above), and range-checked `xz` values
for the rail layer against the tree/road layers already in the file to
confirm the merge didn't disturb the existing projection.

---

# Pass 16 — performance and interaction (the 3D view)

Two jobs, in order: settle a pass-numbering collision that had already cost
one session, then do the work PLANNING.md calls "BLOCKING — do first."

## 0. The numbering collision (committed separately, before any code)

`docs/DECISIONS.md` already had completed Passes 13, 14 and 15 (OSM
fetch/reduce, the Pokrovsk extract, the `disused` tag-value fix).
`docs/PLANNING.md` independently numbered its forward brief 13–18. So "Pass
13" named two unrelated things, and a session reading the planning doc
concluded the work was already logged as done and skipped it.

Resolved by renumbering the *planning* side to continue after the highest
pass actually logged here (15): 13→16, 14→17, 15→18, 16→19, 17→20, 18→21.
`docs/CLAUDE_CODE_BRIEFS_PASS13-18.md` → `..._PASS16-21.md`, every
cross-reference in `PLANNING.md`, the briefs and `CLAUDE.md` updated, and a
short "numbering note" left in `PLANNING.md` so it isn't re-litigated.
References to *older* passes (5, 7, 8, 11, 12) and to this file's own Pass
13 were deliberately left alone. Rename only, no behaviour change — its own
commit, so the implementation diff below reads clean.

## 1. Instrument first — `src/three/perfMonitor.ts` + `PerfOverlay`

"Sluggish" had to become a number. `PerfMonitor` samples every frame into
preallocated ring buffers (no allocation in the hot path) and reports mean
frame time, p95, worst, a hitch count (>33.4 ms), the time inside the label
layout and inside `renderer.render()` separately, `renderer.info`'s draw
calls / triangles / geometries, and scene counters — asset count, titled
labels, occlusion probes, and the share of frames where the layout pass was
skipped. `PerfOverlay` polls it 4×/second; it never re-renders per frame,
so the instrument is not part of the load it measures.

On by default in `npm run dev`; in a production build it is the
"Performance HUD" switch in the nav drawer or `?perf=1` on the URL. A query
param, not a hash flag — the hash belongs to the in-app router and `#perf`
would parse as a route.

### The baseline, measured

Frame *rate* in an agent sandbox is worthless as a signal: there is no GPU,
Chromium rasterizes through SwiftShader, and the result (~3 fps) is
identical before and after any change this pass made. So the before/after
was measured GPU-independently, via CDP's `Performance` domain, over an
identical scripted 90-step pan on the same machine, comparing a build of
the pre-pass commit against this one:

| | before | after | |
|---|---|---|---|
| style + layout, per frame | **11.07 ms** | **1.67 ms** | −85% |
| style recalc time, total | 5.59 s | 0.69 s | −88% |
| script time, per frame | 14.91 ms | 12.99 ms | −13% |
| JS heap after the pan | 33.3 MB | 14.0 MB | −58% |
| DOM nodes | 4083 | 1050 | −74% |
| forced layout passes | 519 | 456 | −12% |

The 85% cut in style+layout is the stutter. The heap figure is the
allocation fix showing up independently — same scene, same pan, less than
half the garbage. Script time per frame is now almost entirely
`renderer.render()`; the label pass itself measures 0.1–0.8 ms, reported
live in the HUD as `layout`.

*(An earlier version of this table read −89% / 1.13 ms. That measurement was
taken on a build where the labels were not actually being positioned — see
Verification below — so the DOM writes it was crediting as "cheap" were
writes that never happened. The numbers above are from the shipped build,
re-measured after that bug was fixed.)*

In-app, on the deployed build: **845 draw calls, 68,992 triangles, 513
geometries** at the default framing, dropping to ~468 draw calls when the
camera is in close (frustum culling). That draw-call number is the standing
budget from here on, and it is the next real ceiling — see §9.

## 2. What was actually making it stutter

Four causes, all in `Scene3D.tsx`'s render loop, all now fixed:

1. **The whole label set was React state, rewritten every frame.** The loop
   built an array of ~90 label objects and called `setLabels(next)` at
   60 Hz, so React reconciled ~90 `<button>`s, with fresh inline style
   objects and className strings, every frame. That is the 10.75 ms.
   Labels are now a *roster* — React mounts one node per asset when the
   asset set changes, and never again. Position, z-order and tier are
   written straight to the DOM node by the loop, and only the properties
   that actually changed (a per-pin cache of the last written values makes
   that check free).
2. **Steady per-frame garbage.** A new measurement array, a new sorted
   array, a new `LabelGrid` (a Map plus an array per occupied cell), and a
   label object per visible asset — every frame. This never showed up as a
   slow *average*; it showed up as periodic GC pauses, which is what
   "smooth, then it freezes" is. All of it is now preallocated and reused:
   a pooled measurement array sorted in place, and `LabelGrid.clear()`
   (new) instead of a fresh index.
3. **The layout ran on every frame whether or not anything had moved.** It
   now runs only when the camera moved, the viewport resized, the asset set
   rebuilt, or selection / hover / scenario-focus / pointer position
   changed. On a still camera **~90–96% of frames skip it entirely**. The
   HUD reports this share, so a future regression is visible rather than
   inferred.
4. **Terrain occlusion was probed for every asset, every frame.**
   `occludedByTerrain()` costs 6 `terrainHeight()` calls, and
   `terrainHeight()` is three octaves of value noise plus several exp/pow
   terms — roughly 500 of them per frame. It is now probed *last*, only for
   a candidate that has already won proximity, budget and collision, and
   capped at 28 probes per layout (an asset rejected for being behind a
   ridge doesn't consume label budget, so it stays a candidate and would
   otherwise be re-probed forever). Idle: 13 probes.

One thing named in the brief turned out not to be a cause: nothing
raycasts per frame here. Raycasting happens on click only. The per-frame
occlusion probing above was the equivalent cost and is what got fixed.

**Also cut:** every asset was building its own octahedron, ring and disc —
273 `BufferGeometry` uploads describing 3 distinct shapes, rebuilt from
scratch on every filter toggle or band edit. They are identical by
construction, so they are now module-level singletons (3 total), marked
`userData.shared` so the disposal traverse skips them. Materials stay
per-asset: the loop animates colour and opacity per asset, which a shared
material could not express.

## 3. Two-finger pan on mobile

Pass 7 damped `OrbitControls.panSpeed` to 0.4 because the default gain sent
a small mouse drag across a large fraction of the strip. That is right for
a mouse and badly wrong for a thumb: a two-finger touch pan has a fraction
of a mouse drag's travel. Rather than fight Pass 7's damping by raising it
for everyone, the gain is now chosen per input device at the moment the
gesture starts — `pointerdown` on the canvas sets `panSpeed` from
`e.pointerType`: 0.4 for mouse (unchanged), 1.7 for touch.

## 4. Tap vs. drag — a real discriminator

The old handler had a bare 4 px movement check, no notion of time, no
pointer capture, and it **selected the asset on drop**. So a drag ended
with the detail panel open over the map, and — because selection also fires
`flyTo()` — the camera lurching away from the position you had just chosen.
A release outside the pin landed on the canvas as a deselecting click.

Now: a gesture is a **tap** only if it crosses *neither* threshold — it
stayed inside 6 px **and** was released within 500 ms. Crossing the
movement threshold commits it to a drag, irreversibly. Crossing only the
time threshold makes it neither, so a finger resting on a pin and lifting
off no longer opens anything. The pin takes pointer capture, so the gesture
stays bound to it even as the asset moves out from under the pointer.

The synthetic click the browser fires on every release is swallowed for
350 ms after a gesture resolves — on the pin *and* on the canvas. That
click was what actually opened the panel at the end of a drag. Keyboard
clicks (`e.detail === 0`) are exempt and still select.

**A drop no longer selects.** Confirmation is a transient line naming the
asset and its new distance (`Krab-M1 → 12.4 km`), which says the same thing
without covering the map you are arranging. The placement still commits to
the same overrides store as before.

## 5. Labels: proximity, not everything

A title is now earned, in this order: selection and hover always; a
scenario-focus member next; then whatever is nearest the **pointer** — or
the framing's centre of interest when the pointer is off-canvas — up to a
viewport-scaled cap (14/megapixel, clamped 6–26; 14 titled on a 1440×900
desktop, 6 on a 390px phone). `src/scene/labelGrid.ts` is reused for
collision exactly as Pass 8 built it, not replaced.

Already-titled labels get hysteresis — ranked as if 70 px nearer, and
allowed 18% beyond the proximity radius — because without it a small
pointer drift shuffles the set around the budget boundary every few frames,
which reads as flicker rather than as decluttering.

Smoothing came from **removing** a transition, not adding one: `.pin3d` had
`transition: transform 60ms linear`, so every per-frame transform write was
animated over 60 ms and the labels visibly swam behind their markers during
a pan, then snapped into place when it stopped. The lag was the CSS. Only
opacity transitions now (180 ms) — the one property that changes at human
speed.

## 6. The jumping blue/red dots are gone

They were the `is-collapsed` label tier: every far-field asset rendered as a
small side-coloured dot in the DOM layer. Confirmed what they encoded before
removing them — side, via a blue/red fill — and the Pass 8 ground ring under
every marker already carries exactly that, in the scene itself, where it
cannot lag. The dots lagged because their position came from React state
applied a frame after the canvas had drawn. So: a laggy duplicate of a cue
that was already there and already correct. A label is now titled or not
drawn; the marker, ring and fill are untouched.

Decluttered pins stay **mounted and in the tab order** (`opacity: 0`, not
`display: none`), and focusing one reveals it. This layer exists to be the
keyboard-reachable representation of the scene — dropping 77 assets out of
the tab order to save paint cost would have traded a real accessibility
property for a cheap one.

## 7. Detail-panel z-order

`.scene3d__labels` had no stacking context, so pins raising themselves to
`z-index: 2000+` (so a hovered label always beats its neighbours) were
competing against the detail panel's `z-index: 50` **in the root stacking
context** — and won. One line: `isolation: isolate` plus a `z-index` on the
label layer. Pins still order correctly among themselves; the whole layer is
now a single box below the panel.

## 8. Orientation follows the camera

Two places asserted "side_a rear is to the left" as a constant: the 3D
header legend and the `Legend` panel's closing sentence. Both stopped being
true the moment the user orbited past 90°. The loop now probes both rears
through the same projection the scene draws through and publishes the
result as `ViewState.axisFlipped`; both readouts consume it, so they cannot
disagree with the picture or with each other. Only fires on an actual flip
(a handful of React renders per session), and resets on unmount — the
schematic view's axis genuinely cannot rotate.

## 9. A ruler that shows the compression instead of hiding it

The brief was explicit that a linear ruler here would lie. Each band gets a
segment positioned per frame from the projected screen-X of its *real*
world edges, so equal km spans occupy visibly unequal screen width, plus a
per-band "km per 100 px" readout stating the same fact numerically. At the
default framing that reads 2.2 / 7.2 / 22 / 50 / 267 km per 100 px across
the five bands — two orders of magnitude, which is the point.

Foreshortening is handled rather than ignored: orbit until the axis points
at the camera and every band edge lands on the same pixel, and the ruler
fades out instead of printing nonsense. A band too narrow for its text keeps
its edge tick and drops the label. The band structure is also stated in a
screen-reader-only paragraph, since the compression is a fact about the
data, not only about the picture.

## Where the brief and prior passes disagreed

- **Draw calls are left for Pass 19, deliberately.** 845 draw calls is the
  next real ceiling, and roughly 273 of them are the per-asset marker /
  ring / fill trio. Instancing would collapse those to ~3 — but per-instance
  opacity is not expressible with `InstancedMesh` without a custom shader,
  and scenario-focus dimming animates exactly that per asset. PLANNING.md
  gives instancing to Pass 19 ("instancing is mandatory") together with the
  material-palette work it depends on. Doing it here would have meant
  reworking Pass 8's side-ring behaviour on the way past. Baseline recorded
  above instead; sharing the geometry (§2) took the free part of the win now.
- **A drop no longer selects the dropped asset.** Pass 11 made selection the
  drop's confirmation deliberately. This pass reverses that, because the
  brief names "drags ... open the detail panel instead" as the bug, and
  selection also triggers `flyTo()` — so the confirmation was moving the
  camera away from the placement being confirmed. The transient drop note
  replaces it.
- **The time half of the tap test is a real behaviour change.** Taken
  literally ("tap only fires if neither exceeded"), a long stationary press
  now selects nothing. The threshold is set at 500 ms — well clear of a
  deliberate mouse click at 80–150 ms — so ordinary clicking is untouched,
  but it is a change, not just a bug fix.
- **`Legend.tsx` was fixed even though item 8 says "the header".** It
  carried the same hardcoded orientation sentence. Fixing one and leaving
  the other would have left the app contradicting itself on screen.
- **The 2D view was not touched**, per PLANNING.md's scope decision for this
  whole push. `labelGrid.ts` gained a `clear()` method, which the 2D view
  does not call — additive, no behaviour change there.

## Verification

`npm run build` clean. Beyond that — and this pass is the reason to say it
plainly — **a green build proved nothing here.** A 23-check headless
Playwright pass against `npm run preview` (Chromium with
`--use-gl=swiftshader`) drives the real app and asserts each fix visibly
takes effect: the HUD renders with a live non-zero frame rate and a
draw-call count; the layout skips on an idle camera; a real multi-step drag
does **not** open the detail panel and *does* persist a placement override;
a tap still opens it; nothing draws over the open panel (sampled with
`elementFromPoint` across the panel's face); the legend swaps after a 180°
orbit and the Legend panel agrees; the ruler draws with differing per-band
scales; no dot-tier nodes exist.

Two bugs got through every class-name and count assertion and were caught
only by *looking at the screenshot*:

1. Every label sat at the layer's top-left corner. `applyPin` skipped the
   first transform write because a freshly mounted pin starts at `x = NaN`
   and `Math.abs(NaN - x) > 0.25` is **false**. Negating the "close enough"
   test instead makes the NaN case fall through to a write.
2. Labels did not appear at all until the camera was touched. React commits
   the pin nodes *after* the layout pass that would have positioned them, so
   the first layout wrote into an empty map — and the new idle-skip then
   correctly concluded nothing had changed and never ran again. Attaching a
   node now bumps the layout-dirty counter.

Both are now covered by assertions on real `getBoundingClientRect()`
geometry, including one that runs on first paint with no pointer
interaction at all. Screenshots checked at 1440×900 and at 390×780.

---

# Pass 20 — detail page, imagery, symbology

Run out of `PLANNING.md`'s suggested order (17/18/19 — world/terrain, tactical
placement, model integration — have not landed yet). `PLANNING.md` itself
flags Pass 20 as having "no remaining research dependency," and this pass's
own brief explicitly named it as the next one to run, so it proceeded rather
than blocking on unrelated 3D-view work. Nothing here touches `src/three/`.

`docs/imagery-sourcing-ledger.xlsx` was confirmed present before anything
else, per the brief's stop-first instruction — 89 rows, `Imagery Sourcing` +
`Summary` sheets, matching the numbers the brief quoted (65 GREEN, 13 RED, 8
CONCEPTUAL, 2 CONCEPTUAL-SENSITIVE, 1 AMBER).

## 1. Wiring imagery from the ledger

**The real constraint, re-confirmed rather than assumed.** CLAUDE.md already
says this environment's egress proxy blocks binary fetches; this pass found
that it now also blocks `commons.wikimedia.org` at the `WebFetch`/`curl`
level entirely (`gateway answered 403 to CONNECT`) — not just image bytes,
page *text* too. `WebSearch` is a separate path (a search index, not a fetch
to the host) and still works, which matches exactly how Pass 4 originally
solved this: a search result naming a real filename is text, not a binary
transfer, and the URL built from it is only ever resolved by the *visitor's*
browser once deployed, never by this session. That's the mechanism this pass
used throughout — nothing new, just re-verified against the current proxy
state before relying on it.

**What "wire up imagery" actually required, beyond copying the ledger's own
columns.** The ledger records confirmed *categories* for most GREEN rows
(`Category:T-80BVM`, `Category:2S19_Msta-S_in_Russian_service`, ...), not
individual files — a category isn't a renderable image, so the app needs one
specific file per asset. Resolving 50 categories to a specific filename via
one targeted `WebSearch` each (never inventing a name — only a filename that
literally appeared in a search result) is a continuation of the ledger's own
already-verified sourcing, not the "bulk-scrape image search for anything not
already in the ledger" the brief warned against: every category resolved
against was already a real, ledger-confirmed source for that asset. This was
fanned out to 5 parallel agents (10 categories each, Haiku — cheap, bounded,
mechanical lookups) plus one for the AMBER row's DVIDS check the brief
specifically asked for. 48/50 resolved; the other 2 fall back to the
placeholder treatment rather than guess (see below).

**Spot-checked, not blindly trusted.** Per this repo's own standard (Pass
7's self-caught generation bugs, `CONTENT_PIPELINE.md`'s two-pass rule), a
sample of the agents' resolutions were re-verified directly: MANTAS T-12's
AMBER→GREEN upgrade (`File:MANTAS_T12.png` — real), the Shahed-136/Geran-2
DIA drawing, the Punisher drone file, and the Varan UGV file all checked out
exactly as reported. One did not: the agent-found 2S19 Msta-S file was
titled *"Ukrainian* 2S19 Msta-S..." for a *side_b* (Russia) asset — plausible
(2S19 is Soviet-legacy and fielded by both sides; Commons does credit
captured-equipment photos this way) but a real risk of implying the wrong
side, so it was swapped by hand for an unambiguous file
(`File:2S19_Msta-S_(28051832178).jpg`) found via the same re-check. One
resolved match (`side_b-uav-kub-1`) was a `.webm` video, not a still image —
discarded rather than treated as a photo, since the detail page's hero slot
is a picture. `side_b-naval-admiral-grigorovich` (GREEN in the ledger, at the
category level) could not be pinned to one specific file even after a direct
re-check — left as a placeholder rather than guessed. **64 of 66
GREEN/AMBER-upgraded assets ended up with a real, checked photo; 2 fall back
honestly.**

**License/attribution tracking.** `Asset.image` (new, optional field —
additive, see `types.ts`'s doc comment) carries `url` (a stable
`Special:FilePath` resolution — same mechanism and same "the visitor's
browser fetches it, this session never does" reasoning as Pass 4's original
real-photo decision), `source_url` (the Commons file page itself, for full
license/author detail this app doesn't try to duplicate), `license` (parsed
from the ledger's own notes where stated — e.g. "CC BY-SA 4.0", "Public
domain (US DoD)" — else an honest "See Commons file page for license"
rather than a guessed tag), and `kind` (`photo` / `conceptual` /
`placeholder`, decided from the ledger's own status column). This is the
same "always show sourcing, including its absence" standard `sources`
already gets — `validate.ts` now flags a `kind: "photo"` entry missing a
url or license the same info/warning way a missing citation already does.

**The 13 RED, 8 CONCEPTUAL, 2 CONCEPTUAL-SENSITIVE rows** — per the ledger's
own categorization, none of which named a specific source to import. The
brief's "do not invent placeholder image data to fill the gap" is read
strictly: no new photo search was run for these (the ledger not naming a
source for them is itself the research finding, not a gap to fill in this
pass), and no synthetic "photo" was fabricated. Instead every one of them
falls back to the same treatment — this asset's own MIL-STD-2525 symbol
(§3) shown large, with a caption stating plainly why there's no photo
("no open-licensed photograph found," "represents a category, not a single
system," or, for the 2 sensitive rows, "deliberately left without imagery
rather than risk a graphic or misleading representative photo" — the safer
of the ledger's own two sanctioned options for those, since no non-graphic
image had already been sourced for them either). One migration script
(`apply_images.mjs`, run once, not checked in) wrote all 89 records in one
pass so every asset's treatment is traceable to the same logic rather than
89 hand edits.

## 2. Detail page rework

**Picture directly under the asset name.** New `HeroImage` component,
inserted right after the header block (name/eyebrow/category), before the
key-facts grid — literally the first thing under the name. Renders the
sourced photo with its license and a link to the Commons file page when
`asset.image.kind === "photo"` and the `<img>` doesn't 404; falls back to
the enlarged MIL-STD-2525 symbol + explanatory caption otherwise, including
when a previously-good Commons URL breaks (files do get renamed/deleted)
— the same graceful-degradation contract `GalleryTile` already had for the
gallery, extended to the new hero slot.

**The persistently empty key-characteristics field — root cause found, not
guessed at.** Screenshotting the *live* app before touching anything (per
`PLANNING.md`'s own standing instruction: a code read is not evidence)
showed the bug immediately: the "key facts" tile row
(`.key-facts`, cost tile + 3 per-asset facts) is a 2-column CSS grid. The
cost tile spans both columns via `grid-column: 1 / -1`; the 3 fact tiles
then fill row 2 col 1, row 2 col 2, row 3 col 1 — leaving row 3 col 2
**structurally, permanently empty**, on *every* asset, because 3 doesn't
divide evenly into 2. Every one of the 89 shipped assets carries exactly 3
`key_facts` (checked directly, not assumed) — the schema's own "exactly 3
... for cross-asset comparability" convention — so this wasn't a data
problem or a per-asset content gap at all, just a grid arithmetic mismatch
against a convention the CSS predated. Fix: `.key-facts` is now a 3-column
grid, so 3 facts fill the row exactly. One line, screenshot-confirmed on
both the Hero and Icon-tier test assets (§4) — no dangling cell in either.
(The *bulleted* "Key characteristics" list below it — a different section,
same name-ish — was never actually empty; every asset has real bullets
there. The brief's wording pointed at the visual symptom, which turned out
to live in the tile grid above it, not the list.)

**"What changed vs. traditional warfare" is untouched** — same component,
same position in the flow, same content — per the brief's explicit "keep
as-is." The only reordering this pass made was inserting the picture at the
top; everything from the key-facts grid down kept its existing order.

## 3. NATO/APP-6 (MIL-STD-2525) symbology via milsymbol.js

Replaces the hand-drawn glyph (`src/icons/registry.tsx`'s `resolveIcon()`)
**in the detail panel only** — both the small header badge and the enlarged
hero-image fallback. `resolveIcon()` itself is untouched and still drives
every other consumer (the 3D/2D map markers, `AssetLibraryPage`'s list
icons) — see "where the brief and prior passes disagreed" below for why
that boundary was drawn where it was.

`src/symbology/sidc.ts` builds a real 15-character MIL-STD-2525C SIDC per
asset: scheme + affiliation (`Friend`/`Hostile`, from `side` — config-layer
only, same pattern `SIDE_ACCENT` already uses, the data layer still only
ever knows `side_a`/`side_b`) + battle dimension + status (`Present`,
always — every asset here is a real fielded system) + a 6-character
function ID. Every function ID is copied verbatim from milsymbol's own
2525C ground/air/sea/subsurface/space/installation tables
(`node_modules/milsymbol/src/lettersidc/sidc/*.js`) — resolved per
`category` first (precise: SAM range tier, tank vs. IFV vs. APC, frigate vs.
submarine vs. USV, ...), falling back to `group` then `domain`, mirroring
`resolveIcon()`'s own fallback chain. Where 2525C genuinely has no matching
symbol — it predates common unmanned-ground-vehicle categorization — the
closest real functional equivalent is used and called out inline in the
code (a mine-clearing UGV gets "Mine clearing equipment," a logistics UGV
gets "Utility vehicle"), never an invented code.

`src/symbology/MilSymbol.tsx` renders the SIDC via milsymbol's `asSVG()`.
`milsymbol.js` is MIT-licensed as the brief specified — verified directly
(`npm view milsymbol license` → `MIT`), not assumed.

## Where the brief and prior passes disagreed

- **The symbol swap is scoped to the detail panel, not "everywhere the old
  icon set appears."** The brief named one thing: "the top-left symbol" on
  the detail page. `AssetLibraryPage`'s list icons and both map renderers
  (`src/scene/AssetNode.tsx`, `src/three/`) still use `resolveIcon()`.
  Extending the swap to the map markers is a materially bigger job — Pass
  16's explicit warning that the 3D render loop must never touch React
  state per frame, and that per-frame DOM writes are the entire performance
  budget, makes swapping ~89 WebGL/DOM markers to server-rendered SVG a
  real integration project, not a drop-in — and it's out of scope for a
  Medium-effort pass that didn't ask for it. Left for a future pass;
  logged in `docs/BACKLOG.md`.
- **milsymbol is lazy-loaded, not statically imported.** Not asked for
  explicitly, but this repo has an established, explicit performance
  discipline (`CLAUDE.md`, `docs/DECISIONS.md` Pass 16) that would flag a
  silent +787 kB to the main bundle. milsymbol's `package.json` `exports`
  field only exposes the bare specifier (no documented way to import just
  the 2525C table and skip 2525B/APP-6B/APP-6D/2525D), so the whole library
  loads regardless of which standard's codes actually get used. Fix is the
  exact pattern Pass 6 already established for the 3D engine:
  `React.lazy()` + `Suspense`, so the cost lands only on a visitor who
  opens a detail panel, never on first paint. Main bundle: 649 kB → 654 kB
  (+5 kB, the new `sidc.ts`/`types.ts` additions); milsymbol is its own
  781 kB chunk (175 kB gzipped), fetched once, on demand.
- **The SIDC's echelon/size modifier is deliberately left blank.** MIL-STD-
  2525's echelon slot (squad/platoon/company/.../army) is a real
  organizational-size field. `Asset.echelon` in this schema means something
  different — how far back in the battlespace an asset sits
  (tactical/operational/strategic), a distance classification predating
  this pass by several. Filling the SIDC's echelon slot from that field
  would have been a *wrong* claim wearing "correct symbology" as a costume
  — exactly the kind of mistake replacing the arbitrary icon was supposed
  to fix. Left blank rather than guessed; documented inline in `sidc.ts`.

## Verification

`npm run typecheck` and `npm run build` clean throughout — and, per Pass
16's standing rule, treated as necessary, not sufficient. Headless
Playwright (`--use-gl=swiftshader`, against `npm run preview`) drove the
real app for every claim above:

- **Hero-tier asset (Leopard 2A6)** and **Icon-tier asset (IRIS-T SLM)**
  screenshotted before and after. Before: `.key-facts` shows a visible
  empty 4th cell on both; the header icon is the old hand-drawn tank/SAM
  glyph. After: the key-facts grid fills exactly (verified by reading each
  tile's actual text, not just counting elements); the header shows a real,
  distinct MIL-STD-2525 symbol per asset (a tank glyph for the Leopard, a
  SAM-launcher glyph for the IRIS-T); the hero-image slot renders under the
  name.
- **The positive photo-render path was verified for real, not assumed.**
  This sandbox can't reach `commons.wikimedia.org` (confirmed above), so a
  live photo can't load here even though it will on the deployed site —
  `page.route()` intercepted the `Special:FilePath` request and fulfilled
  it with a local test image, proving the actual rendering path (full-width
  photo, license + Commons-link caption) rather than trusting the code by
  inspection.
- **The graceful-fallback path was also verified for real, un-intercepted**
  — with the network genuinely unreachable, both test assets correctly
  showed the enlarged symbol + "the sourced photo could not be loaded"
  caption, confirming `onError` actually fires rather than assuming it
  would.
- **A CONCEPTUAL-SENSITIVE asset** (`side_a-medical-casevac-chain`) and a
  **RED asset** (`side_a-uav-fp-1-fp-2`) were also opened and screenshotted,
  each showing its own distinct, correct caption — confirming the fallback
  branches are wired to the right ledger status, not just that *a*
  fallback fires.
- **Data Health** re-checked after the `validate.ts` addition: 0 errors, 3
  warnings, 34 info — identical counts to before this pass except for the
  new `image`-completeness checks, which raised nothing (every one of the
  89 migrated records is complete), confirming the migration script didn't
  silently ship a half-filled record.
- No new console/page errors beyond the expected, already-understood
  `commons.wikimedia.org` network failures in this sandbox.
