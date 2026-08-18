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
