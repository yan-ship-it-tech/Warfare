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

        <h3>Imagery — a real constraint, not a style choice</h3>
        <p>
          This build cannot fetch photographs, satellite imagery, or 3D model renders from the open
          web — the environment it runs in blocks image hosts, and the page-fetching tool available
          to it returns article text, not binary image data. Every icon and every ground texture on
          this map is generated (SVG shapes, procedural noise), not sourced. That's a real limitation,
          not a design preference: real reference photos supplied directly can be embedded, and would
          be a meaningful upgrade over the generated set.
        </p>

        <h3>What's not built yet</h3>
        <ul>
          <li>Real photos, video, or a photorealistic map background — this environment can't fetch
            binary images from the open web. Unblocks if reference files are supplied directly.</li>
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
