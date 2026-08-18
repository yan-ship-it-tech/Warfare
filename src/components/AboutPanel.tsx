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
          The four echelon bands come from <code>data/bands.json</code> and are the coarse structure.
          The narrower <em>doctrine depth</em> overlay on the ruler is separate: those are
          individually-sourced findings (FPV strike envelope, the ~30 km drone-dense corridor, launch
          team stand-off, and so on) drawn on top rather than replacing the bands. Both are config —
          change the numbers in <code>data/</code>, not in code.
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

        <h3>Sourcing</h3>
        <p>
          Every asset carries its own source list, shown in its detail panel. Where an asset was
          written from general knowledge rather than a specific citation, it says so and is flagged
          as unverified rather than presented as fact. Data health lists every one of those flags.
        </p>

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
