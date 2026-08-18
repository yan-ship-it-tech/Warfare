// Distance-band editor. Bands drift every few months as the front and
// doctrine change — this makes that a form, not a pull request.
//
// Edits are applied live (the scene re-renders against them immediately) and
// persisted to this browser's localStorage. Every asset's band membership is
// *computed* from its distance against whatever bands are current, so moving
// a cutoff here immediately reshuffles which assets read as tactical vs.
// operational — nothing needs to be re-tagged by hand.
import { useState } from "react";
import type { DistanceBand, Echelon } from "../types";
import { DEFAULT_BANDS } from "../data/loader";
import { useOverrides } from "../state/overridesState";
import { useViewState } from "../state/viewState";

const ECHELONS: Echelon[] = ["tactical", "operational", "strategic"];

export function BandsEditorPanel() {
  const view = useViewState();
  const overrides = useOverrides();
  const [confirmReset, setConfirmReset] = useState(false);
  if (view.openPanel !== "bands") return null;

  const bands = (overrides.bands ?? DEFAULT_BANDS)
    .slice()
    .sort((a, b) => a.min_km - b.min_km);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Distance bands">
      <div className="modal__scrim" onClick={() => view.setOpenPanel(null)} />
      <div className="modal__body modal__body--wide">
        <button className="detail__close" onClick={() => view.setOpenPanel(null)} aria-label="Close">
          ✕
        </button>
        <h2>Distance bands</h2>
        <p>
          The coarse echelon structure the map is built on. Every asset's band is computed live from
          its distance against these cutoffs — edit a number here and anything that crosses it moves
          on the map immediately, no per-asset re-tagging needed.
        </p>
        <p className="about__foot">
          Saved to this browser only (no backend yet — see the About panel). Distinct from the sourced
          "doctrine depths" ruler overlay, which stays fixed as a citation regardless of these edits.
        </p>

        <table className="bands-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Echelon</th>
              <th>Min km</th>
              <th>Max km</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <BandRow key={b.id} band={b} canRemove={bands.length > 1} />
            ))}
          </tbody>
        </table>

        <div className="bands-editor__actions">
          <button type="button" className="btn btn--ghost" onClick={overrides.addBand}>
            + Add band
          </button>
          <div className="bands-editor__spacer" />
          {overrides.bandsAreCustom && (
            <button
              type="button"
              className={`btn btn--ghost${confirmReset ? " btn--danger" : ""}`}
              onClick={() => {
                if (confirmReset) {
                  overrides.resetBands();
                  setConfirmReset(false);
                } else {
                  setConfirmReset(true);
                  window.setTimeout(() => setConfirmReset(false), 3000);
                }
              }}
            >
              {confirmReset ? "Click again to confirm reset" : "Reset to shipped defaults"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BandRow({ band, canRemove }: { band: DistanceBand; canRemove: boolean }) {
  const overrides = useOverrides();
  const [label, setLabel] = useState(band.label);

  return (
    <tr>
      <td>
        <input
          type="text"
          className="bands-table__input bands-table__input--label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => overrides.setBand(band.id, { label })}
        />
      </td>
      <td>
        <select
          className="bands-table__input"
          value={band.echelon}
          onChange={(e) => overrides.setBand(band.id, { echelon: e.target.value as Echelon })}
        >
          {ECHELONS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="number"
          className="bands-table__input bands-table__input--num"
          value={band.min_km}
          min={0}
          onChange={(e) => overrides.setBand(band.id, { min_km: Number(e.target.value) })}
        />
      </td>
      <td>
        <input
          type="number"
          className="bands-table__input bands-table__input--num"
          value={band.max_km >= 10_000 ? "" : band.max_km}
          placeholder="open-ended"
          min={0}
          onChange={(e) =>
            overrides.setBand(band.id, {
              max_km: e.target.value === "" ? 100000 : Number(e.target.value),
            })
          }
        />
      </td>
      <td>
        <button
          type="button"
          className="bands-table__remove"
          disabled={!canRemove}
          title={canRemove ? "Remove this band" : "At least one band must remain"}
          onClick={() => overrides.removeBand(band.id)}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
