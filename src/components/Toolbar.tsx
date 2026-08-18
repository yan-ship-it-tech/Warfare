import type { WorldModel } from "../data/model";
import type { ConnectionType, Side } from "../types";
import { CONNECTION_STYLE, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { ALL_CONNECTION_TYPES, useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { CategoryFilterMenu } from "./CategoryFilterMenu";

export function Toolbar({ world }: { world: WorldModel }) {
  const view = useViewState();
  const overrides = useOverrides();
  const errors = world.issues.filter((i) => i.severity === "error").length;
  const warnings = world.issues.filter((i) => i.severity === "warning").length;

  const typesInUse = new Set<ConnectionType>(world.connections.map((c) => c.type));
  const hiddenGroupCount = view.hiddenGroups.size;

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__mark" aria-hidden="true" />
        <div>
          <h1>Multi-Domain Battlefield</h1>
          <p>Digital twin — illustrative teaching model</p>
        </div>
      </div>

      <div className="toolbar__group" role="group" aria-label="Sides">
        <span className="toolbar__legend">Sides</span>
        {(["side_a", "side_b"] as Side[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip chip--side${view.visibleSides.has(s) ? " is-on" : ""}`}
            style={{ ["--chip" as string]: SIDE_ACCENT[s].base }}
            onClick={() => view.toggleSide(s)}
            title={SIDE_LABELS[s].note}
          >
            {SIDE_LABELS[s].short}
          </button>
        ))}
      </div>

      <div className="toolbar__group" role="group" aria-label="Categories">
        <span className="toolbar__legend">Show</span>
        <div className="category-menu-anchor">
          <button
            type="button"
            className={`chip chip--panel${view.openPanel === "categories" ? " is-on" : ""}${hiddenGroupCount ? " has-filter" : ""}`}
            onClick={() => view.setOpenPanel(view.openPanel === "categories" ? null : "categories")}
            title="Show or hide whole asset categories (UAVs, air defense, armor, ...)"
          >
            Categories
            {hiddenGroupCount > 0 && <em className="chip__count">{hiddenGroupCount} hidden</em>}
          </button>
          <CategoryFilterMenu world={world} />
        </div>
        <button
          type="button"
          className={`chip chip--panel${view.openPanel === "bands" ? " is-on" : ""}`}
          onClick={() => view.setOpenPanel(view.openPanel === "bands" ? null : "bands")}
          title="Edit the distance-band cutoffs the map is built on"
        >
          Distance bands
          {overrides.bandsAreCustom && <em className="chip__count">edited</em>}
        </button>
      </div>

      <div className="toolbar__group" role="group" aria-label="Overlays">
        <span className="toolbar__legend">Overlays</span>
        <button
          type="button"
          className={`chip${view.showConnections ? " is-on" : ""}`}
          onClick={view.toggleConnections}
          title="Draw dependency lines between related assets"
        >
          Connections
        </button>
        <button
          type="button"
          className={`chip${view.showPending ? " is-on" : ""}`}
          onClick={view.togglePending}
          title="Connections may point at assets that don't exist yet. On: draw a provisional stub node. Off: hide those edges entirely."
        >
          Pending targets
          <em className="chip__count">{world.stubs.length}</em>
        </button>
        <button
          type="button"
          className={`chip${view.showDoctrineMarkers ? " is-on" : ""}`}
          onClick={view.toggleDoctrineMarkers}
          title="Sourced depth findings from doctrine.md §2, overlaid on the ruler"
        >
          Doctrine depths
        </button>
      </div>

      <div className="toolbar__group toolbar__group--types" role="group" aria-label="Connection types">
        <span className="toolbar__legend">Link types</span>
        {ALL_CONNECTION_TYPES.map((t) => {
          const style = CONNECTION_STYLE[t];
          const used = typesInUse.has(t);
          return (
            <button
              key={t}
              type="button"
              className={`chip chip--type${view.connectionTypes.has(t) ? " is-on" : ""}${used ? "" : " is-unused"}`}
              style={{ ["--chip" as string]: style.color }}
              onClick={() => view.toggleConnectionType(t)}
              disabled={!view.showConnections}
              title={used ? style.label : `${style.label} — no edges of this type in the data yet`}
            >
              <i />
              {style.label}
            </button>
          );
        })}
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button
          type="button"
          className={`chip chip--panel${view.openPanel === "health" ? " is-on" : ""}${errors ? " has-error" : ""}`}
          onClick={() => view.setOpenPanel(view.openPanel === "health" ? null : "health")}
        >
          Data health
          <em className="chip__count">
            {errors ? `${errors}!` : warnings ? warnings : world.issues.length}
          </em>
        </button>
        <button
          type="button"
          className={`chip chip--panel${view.openPanel === "about" ? " is-on" : ""}`}
          onClick={() => view.setOpenPanel(view.openPanel === "about" ? null : "about")}
        >
          About / disclaimer
        </button>
      </div>
    </header>
  );
}
