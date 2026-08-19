import type { WorldModel } from "../data/model";
import { SIDE_LABELS } from "../config/ui";
import { useViewState } from "../state/viewState";

export function Legend({ world }: { world: WorldModel }) {
  const view = useViewState();
  const pendingEdges = world.connections.filter((c) => c.target_pending).length;

  return (
    <div className="legend">
      <p>
        <b>{world.assets.length}</b> assets
        <span className="dot">·</span>
        <b>{world.connections.length}</b> links
        {view.showPending && pendingEdges > 0 && (
          <>
            <span className="dot">·</span>
            <b>{pendingEdges}</b> to pending targets
          </>
        )}
      </p>
      {/* The navigation hint is per-renderer — the 3D view has no scroll axes,
          and telling someone to scroll left-right in an orbit camera is worse
          than saying nothing. */}
      <p className="legend__hint">
        {view.renderMode === "terrain3d"
          ? "Drag to orbit · scroll to zoom · click an asset for detail"
          : "Scroll ← → for distance from the zero line · ↑ ↓ between domain layers · click an asset for detail"}
      </p>
      <p className="legend__sides">
        {SIDE_LABELS.side_a.short} rear is to the left, {SIDE_LABELS.side_b.short} rear to the right.
      </p>
    </div>
  );
}
