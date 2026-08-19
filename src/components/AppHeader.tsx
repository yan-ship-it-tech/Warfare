// Slim app header: hamburger + brand. This is the whole "control panel"
// replacement — every toggle, filter and page link that used to live here as
// a stacked row of chips now lives in NavDrawer, one tap away. See
// docs/DECISIONS.md Pass 9.
import type { WorldModel } from "../data/model";
import { useViewState } from "../state/viewState";

export function AppHeader({ world }: { world: WorldModel }) {
  const view = useViewState();
  const errors = world.issues.filter((i) => i.severity === "error").length;
  const isOpen = view.openPanel === "nav";

  return (
    <header className="app-header">
      <button
        type="button"
        className={`hamburger${isOpen ? " is-on" : ""}`}
        onClick={() => view.setOpenPanel(isOpen ? null : "nav")}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        aria-controls="nav-drawer"
      >
        <span />
        <span />
        <span />
        {errors > 0 && !isOpen && <em className="hamburger__flag" title={`${errors} data error(s)`} />}
      </button>

      <div className="app-header__brand">
        <span className="toolbar__mark" aria-hidden="true" />
        <div>
          <h1>Multi-Domain Battlefield</h1>
          <p>Digital twin — illustrative teaching model</p>
        </div>
      </div>
    </header>
  );
}
