import type { WorldModel } from "../data/model";
import { DISCLAIMER, SIDE_LABELS } from "../config/ui";
import { useViewState } from "../state/viewState";

export function AboutPanel({ world }: { world: WorldModel }) {
  const view = useViewState();
  if (view.openPanel !== "about") return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="About and disclaimer">
      <div className="modal__scrim" onClick={() => view.setOpenPanel(null)} />
      <div className="modal__body">
        <button className="detail__close" onClick={() => view.setOpenPanel(null)} aria-label="Close">
          ✕
        </button>
        <h2>{DISCLAIMER.headline}</h2>
        {DISCLAIMER.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}

        <h3>Reading the view</h3>
        <p>
          The zero line runs down the middle. {SIDE_LABELS.side_a.short}'s rear recedes to the left,
          {" "}{SIDE_LABELS.side_b.short}'s to the right; moving straight through the middle takes you
          from one side's deep rear to the other's. In the <b>3D view</b>, height is genuine altitude —
          air and space assets sit above the ground plane on a tether down to their true position,
          while ground-level domains (land, logistics, medical, C2) share the surface and separate
          sideways across the strip instead, because stacking logistics <em>above</em> land would
          assert a height difference that isn't real. In the <b>Schematic view</b>, vertical position
          is the domain layer rather than altitude, and the stack steps sideways as it descends so the
          layers read as a cut through the battlefield.
        </p>
        <p>
          Distance bands do not share a linear scale. Nothing legible can put 0–5 km and 150 km+ on
          one linear axis, so each band gets its own screen allocation and the ruler labels real
          kilometres throughout — the tick density changing between bands is the visible cue that the
          axis is compressed.
        </p>

        <h3>Distance bands</h3>
        <p>
          The five bands ship from <code>data/bands.json</code> labelled by distance alone — 0–5 km,
          5–30 km, and so on, deliberately not "Tactical / Operational / Strategic." Real employment
          doesn't respect clean doctrinal boundaries at a fixed range (a HIMARS launch at 25 km isn't
          suddenly a different kind of war than a howitzer at 12 km), so pinning a doctrine word to a
          fixed cutoff would assert more precision than is real. They're editable live from the "Distance
          bands" button in the toolbar — cutoffs drift every few months as the front changes, so that's a
          form now, not a code edit. Every asset's band is computed from its distance against whichever
          bands are current, so moving a cutoff reshuffles the picture immediately. Edits save to this
          browser only (see "What's not built yet" below). The narrower <em>doctrine depth</em> overlay
          on the ruler is separate and fixed as a citation: individually-sourced findings (the FPV
          envelopes, the ~30 km drone-dense corridor, launch team stand-off) drawn on top rather than
          replacing the bands.
        </p>
        {world.lowerSky && (
          <>
            <h3>The finding worth pulling forward</h3>
            <p className="about__quote">{world.lowerSky.finding}</p>
            <p>
              With control of the lower sky, assets deploy{" "}
              {world.lowerSky.with_control.closest_deploy_km}–
              {world.lowerSky.with_control.closest_deploy_km_max ??
                world.lowerSky.with_control.closest_deploy_km}{" "}
              km from the line. {world.lowerSky.with_control.note} Without it, they are pushed back to
              roughly {world.lowerSky.without_control.closest_deploy_km} km.{" "}
              {world.lowerSky.without_control.note} [{world.lowerSky.source_tag}]
            </p>
          </>
        )}

        <h3>Categories</h3>
        <p>
          Every asset belongs to one of 18 categories (UAVs, air defense, armor, EW, naval, strategic
          targets, and so on — see <code>data/groups.json</code>). The "Categories" button in the
          toolbar shows or hides whole categories at once, independent of the domain layers, so a
          briefing can highlight just the air-defense picture or just the logistics chain.
        </p>

        <h3>Sourcing &amp; cost</h3>
        <p>
          Every asset carries its own source list, shown in its detail panel, plus a unit-cost figure
          that is always shown — even when the honest answer is "not publicly disclosed" or "no clean
          unit price exists," which is marked as such rather than omitted. Where an asset was written
          from general knowledge rather than a specific citation, it says so and is flagged as
          unverified rather than presented as fact. Data health lists every one of those flags.
        </p>

        <h3>Key lessons</h3>
        <p>
          The "Key lessons" button opens ten lessons drawn from the same sourced doctrine reference
          every asset's "what changed vs. traditional warfare" field is written against. Each names
          the doctrine section and source tag behind it, and — the part that matters — points at the
          assets on this map that demonstrate it. "Show on map" flies the camera to that set and dims
          everything else, so a claim gets shown on the same objects the rest of the tool is built
          from rather than asserted alongside them.
        </p>

        <h3>How confident is each asset?</h3>
        <p>
          Every asset now carries a verification status next to its Sources, derived from its
          citations rather than hand-written: <b>verified</b> means two or more independent named
          sources, <b>1 source only</b> means exactly one, <b>unverified</b> means it was written
          from the doctrine reference and general knowledge. Independence is enforced strictly —
          multiple links to one outlet count once, and image credits are excluded entirely, because
          a photograph evidences the photo and not the range or the price. Of the 27 assets: 19
          verified, 1 single-source, 7 unverified (the composite nodes — logistics hubs, casevac
          chains, the representative infrastructure nodes). Six otherwise-verified assets carry
          estimated rather than confirmed costs and say so.
        </p>

        <h3>Why this isn't a real map</h3>
        <p>
          A literal satellite-photo map was tried and reverted: real geography cannot put a 0–5 km
          FPV envelope and a 500 km deep-strike target on one legible axis, which is exactly what the
          non-linear distance bands exist to solve, and a photoreal basemap read as a
          battle-management system rather than a teaching tool. The 3D view is a genuine WebGL scene
          — orbitable perspective camera, real elevation geometry, distance fog — over a
          <em>synthetic</em> terrain strip: rolling steppe, a churned scar along the zero line, and
          instanced treelines and craters, all generated, none of it anywhere in particular. Relief is
          deliberately low, because the ground this depicts is open rolling steppe and inventing
          mountains to make a 3D view look dramatic would be its own dishonesty. Distance along the
          axis is band-compressed exactly as in the Schematic view — the 3D view reads the same
          projection, so the two cannot disagree about where anything is. Scope is a representative
          strip a few kilometres wide and the full rear-to-rear depth.
        </p>
        <p>
          Eleven assets carry real low-poly 3D models, authored as geometry in this repository rather
          than downloaded — which also settles the licensing question, since a third-party model
          would have had to be trusted sight-unseen. Everything else is a marker; that split is a
          scope line, tracked in docs/BACKLOG.md rather than left as a silent gap. The Schematic view
          is one click away in the toolbar and still owns the distance ruler, the band editor and the
          dependency-line overlay.
        </p>

        <h3>Equipment photography — sourced, not generated</h3>
        <p>
          12 of 27 assets — the most recognizable named systems on each side — carry a real, licensed
          photograph (Wikimedia Commons, credited in that asset's Sources), shown only in the detail
          panel's Media section — never as the map glyph, which stays icon-only at every zoom level on
          purpose (a 32px marker is too small for a photo to read at). The rest still use the generated
          icon set: mostly abstract nodes (C2 networks, logistics hubs) with no good equipment photo to
          speak of, plus two deliberately-generic "representative infrastructure" placeholders left
          ungrounded on purpose rather than dressed up with a specific real facility's photo.
        </p>

        <h3>Editing text and adding your own media</h3>
        <p>
          Every free-text field (role, employment notes, "what changed," key characteristics) has an
          "edit" control right in its own section of the detail panel — changes save to this browser
          immediately, with a one-click reset back to the shipped text. The Media section's "Upload"
          button accepts pictures and short clips from your device: pictures are saved the same way (up
          to 3 MB each); video is not — a real clip is far past what a browser can persist locally, so
          it plays for the current session only and is clearly marked "not saved" rather than silently
          vanishing on the next visit.
        </p>

        <h3>What's not built yet</h3>
        <ul>
          <li>Video that survives a page reload, and destroyed-infrastructure photography specifically
            — different sourcing problem from equipment stills; see docs/BACKLOG.md.</li>
          <li>The dependency-line overlay on the terrain background is fine at rest but doesn't yet
            route parallel edges apart on a dense hub — hover still isolates them (see BACKLOG #8).</li>
          <li>A shared backend. Storage is now pluggable and a REST adapter ships, but no endpoint is
            configured — so edits still save to this browser only (the toolbar badge says which).
            Use Export/Import to move a working set between devices meanwhile. The endpoint can't be
            created from inside this app: a static site would have to publish its write key.</li>
          <li>Drag-to-reposition an asset directly from the map, rather than the numeric editor.</li>
          <li>Per-asset reactive vignettes beyond the four already wired up — everything else falls
            back to a neutral pulse.</li>
          <li>The remaining catalog systems as full map assets (currently swap-only options for an
            existing slot), the rest of the master brief's category breadth pass, "notable moments"
            beyond the 3 seeded so far, and a weather/conditions toggle.</li>
        </ul>
        <p className="about__foot">Full list, including things decided against for now: docs/BACKLOG.md in the repository.</p>

        <h3>Sides</h3>
        <ul>
          <li>
            <b>{SIDE_LABELS.side_a.short}</b> — {SIDE_LABELS.side_a.note}
          </li>
          <li>
            <b>{SIDE_LABELS.side_b.short}</b> — {SIDE_LABELS.side_b.note}
          </li>
        </ul>
        <p className="about__foot">
          Labels are generic on purpose and live in <code>src/config/ui.ts</code>; the data layer only
          knows <code>side_a</code> / <code>side_b</code>, so renaming them is a config change rather
          than a data migration.
        </p>
      </div>
    </div>
  );
}
