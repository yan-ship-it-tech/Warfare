// The hamburger drawer. Replaces the old always-visible row of toolbar chip
// groups (Pass 9) — same controls, same behaviour, just tucked behind a
// menu instead of stacked across the header. Toggle groups (view mode,
// sides, overlays, link types) leave the drawer open, since adjusting
// several in a row is the normal way to use them; anything that opens
// another panel (Categories, Distance bands, Asset editor) or navigates to
// a routed page closes it, since those replace what the drawer was showing
// over.
import type { WorldModel } from "../data/model";
import type { ConnectionType, Side } from "../types";
import { CONNECTION_STYLE, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { ALL_CONNECTION_TYPES, useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { useRouter } from "../state/router";
import { CategoryFilterMenu } from "./CategoryFilterMenu";
import { SyncControls } from "./SyncControls";
import { PAGES, renderBadge } from "../pages/registry";

export function NavDrawer({ world }: { world: WorldModel }) {
  const view = useViewState();
  const overrides = useOverrides();
  const router = useRouter();
  const open = view.openPanel === "nav";

  if (!open) return null;

  const close = () => view.setOpenPanel(null);
  const typesInUse = new Set<ConnectionType>(world.connections.map((c) => c.type));
  const hiddenGroupCount = view.hiddenGroups.size;

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="drawer__scrim" onClick={close} />
      <nav className="drawer__panel" id="nav-drawer">
        <button className="detail__close" onClick={close} aria-label="Close menu">
          ✕
        </button>

        <div className="drawer__section" role="group" aria-label="Pages">
          <span className="toolbar__legend">Pages</span>
          <div className="drawer__nav">
            {PAGES.map((p) => (
              <button
                key={p.path}
                type="button"
                className={`drawer__nav-item${router.path === p.path ? " is-on" : ""}`}
                onClick={() => {
                  router.navigate(p.path);
                  close();
                }}
                title={p.navHint}
              >
                {p.navLabel}
                {renderBadge(p, world)}
              </button>
            ))}
            <button
              type="button"
              className={`drawer__nav-item${view.openPanel === "editor" ? " is-on" : ""}`}
              onClick={() => view.setOpenPanel("editor")}
              title="Add a brand-new asset from scratch, or edit/remove one you already added — no code change or spreadsheet needed"
            >
              Asset editor
              {Object.keys(overrides.customAssets).length > 0 && (
                <em className="chip__count">{Object.keys(overrides.customAssets).length}</em>
              )}
            </button>
          </div>
        </div>

        <div className="drawer__section" role="group" aria-label="View">
          <span className="toolbar__legend">View</span>
          <div className="toolbar__group">
            <button
              type="button"
              className={`chip${view.renderMode === "terrain3d" ? " is-on" : ""}`}
              onClick={() => view.setRenderMode("terrain3d")}
              title="3D terrain — synthetic stylized cross-section, orbitable camera"
            >
              3D terrain
            </button>
            <button
              type="button"
              className={`chip${view.renderMode === "schematic" ? " is-on" : ""}`}
              onClick={() => view.setRenderMode("schematic")}
              title="Schematic cross-section — the flat teaching view with the distance ruler and dependency overlay"
            >
              Schematic
            </button>
          </div>
        </div>

        <div className="drawer__section" role="group" aria-label="Sides">
          <span className="toolbar__legend">Sides</span>
          <div className="toolbar__group">
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
        </div>

        <div className="drawer__section" role="group" aria-label="Categories">
          <span className="toolbar__legend">Show</span>
          <div className="toolbar__group">
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
        </div>

        <div className="drawer__section" role="group" aria-label="Overlays">
          <span className="toolbar__legend">Overlays</span>
          <div className="toolbar__group">
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
            <button
              type="button"
              className={`chip${view.showPerfHud ? " is-on" : ""}`}
              onClick={view.togglePerfHud}
              title="Frame time, draw calls and label counts for the 3D view. Also reachable as ?perf=1 on the URL."
              data-testid="perf-hud-toggle"
            >
              Performance HUD
            </button>
          </div>
        </div>

        <div className="drawer__section" role="group" aria-label="Connection types">
          <span className="toolbar__legend">Link types</span>
          <div className="toolbar__group">
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
        </div>

        <div className="drawer__section">
          <SyncControls />
        </div>
      </nav>
    </div>
  );
}
