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
          {" "}{SIDE_LABELS.side_b.short}'s to the right; scrolling straight through the middle takes you
          from one side's deep rear to the other's. Vertical position is the domain layer, not
          altitude — the stack steps sideways as it goes down so the layers read as a cut through the
          battlefield rather than a flat chart.
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

        <h3>Map view — real satellite imagery and real terrain</h3>
        <p>
          The Map view (default; switch with the "Map / Schematic" toggle in the toolbar) is
          MapLibre GL over Esri World Imagery satellite tiles and AWS's open elevation data, tilted to
          a real 3D camera — not generated art. Asset positions on it come from the same
          <code>distance_km_from_zero</code> every asset already carries, projected from one real
          anchor point near Orikhiv, Zaporizhzhia Oblast — a real place on real terrain, chosen because
          it's typical of most of the front, not because anything is claimed to sit there specifically.
          The real Donbas/Zaporizhzhia front is mostly flat, open steppe, not the dramatic mountains a
          tilted 3D view might suggest — terrain is exaggerated (1.6×) to make that real, subtle relief
          legible, never to invent elevation that isn't there. Same rule as everywhere else in this
          tool: real coordinates, real imagery, illustrative placement — not a measured unit position.
        </p>

        <h3>Equipment photography — sourced, not generated</h3>
        <p>
          12 of 27 assets — the most recognizable named systems on each side — carry a real, licensed
          photograph (Wikimedia Commons, credited in that asset's Sources) as both their map icon and
          detail-panel image, with a graceful fallback to the generated icon set if a photo URL ever
          breaks. The rest still use the generated icon set: mostly abstract nodes (C2 networks,
          logistics hubs) with no good equipment photo to speak of, plus two deliberately-generic
          "representative infrastructure" placeholders left ungrounded on purpose rather than dressed
          up with a specific real facility's photo. See docs/BACKLOG.md for the full picture on video
          and destroyed-infrastructure imagery specifically, which are handled differently.
        </p>

        <h3>What's not built yet</h3>
        <ul>
          <li>Video of each asset in typical use, and destroyed-infrastructure photography
            specifically — different sourcing problem from equipment stills; see docs/BACKLOG.md.</li>
          <li>The dependency-line overlay only renders in Schematic view, not yet on the map.</li>
          <li>A backend — band, placement, and system-swap edits persist to this browser's local storage
            only, not shared across devices or people.</li>
          <li>Drag-to-reposition and full inline editing of asset text/images from the map itself.</li>
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
