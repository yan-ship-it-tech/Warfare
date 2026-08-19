// Visible affordance for "scenario focus mode" (src/state/viewState.tsx's
// FocusRequest). Without this, a lesson's "Show on battlefield" dimmed the
// rest of the roster with no way back short of re-triggering another focus
// request — the actual bug behind "this is currently broken": entering the
// mode was one click, leaving it wasn't a click at all. Shown in both
// renderers (it lives above the view switch in App.tsx) since the dim/blur
// treatment now applies to both, not just the 3D view.
import type { ViewState } from "../state/viewState";

export function ScenarioFocusBanner({ view }: { view: ViewState }) {
  const focus = view.focusRequest;
  if (!focus || focus.assetIds.length === 0) return null;

  return (
    <div className="focus-banner" role="status">
      <span className="focus-banner__dot" aria-hidden="true" />
      <span className="focus-banner__text">
        <b>Scenario focus{focus.label ? `: ${focus.label}` : ""}</b>
        <span> — {focus.assetIds.length} asset{focus.assetIds.length === 1 ? "" : "s"} highlighted, rest dimmed</span>
      </span>
      <button type="button" className="focus-banner__exit" onClick={view.clearFocus}>
        Exit focus ✕
      </button>
    </div>
  );
}
