import { useEffect, useState } from "react";
import type { WorldModel } from "../data/model";
import { SIDE_LABELS } from "../config/ui";
import { useViewState } from "../state/viewState";

const MOBILE_QUERY = "(max-width: 680px)";

/**
 * The one bottom-corner info panel. Used to be two — this component's stats
 * plus a separate `.scene3d__hint` box Scene3D drew at bottom-left with its
 * own renderer disclaimer. On a phone-width viewport two floating corner
 * boxes with no collapse state reliably collided and clipped each other's
 * text. Fixed by merging them (one box, one place) and by collapsing to a
 * small toggle by default on narrow viewports, rather than trying to squeeze
 * both texts into less space.
 */
export function Legend({ world }: { world: WorldModel }) {
  const view = useViewState();
  const pendingEdges = world.connections.filter((c) => c.target_pending).length;

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    setCollapsed(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (collapsed) {
    return (
      <button
        type="button"
        className="legend legend--collapsed"
        onClick={() => setCollapsed(false)}
        aria-label="Show map info"
        aria-expanded={false}
      >
        ⓘ
      </button>
    );
  }

  return (
    <div className="legend">
      <button
        type="button"
        className="legend__close"
        onClick={() => setCollapsed(true)}
        aria-label="Hide map info"
        aria-expanded={true}
      >
        ✕
      </button>
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
          than saying nothing. The terrain disclaimer used to be a second,
          separate floating box (Scene3D's own `.scene3d__hint`) — folded in
          here so there's exactly one bottom-corner panel, not two that can
          collide. */}
      <p className="legend__hint">
        {view.renderMode === "terrain3d"
          ? "Drag to orbit · scroll to zoom · right-drag to pan · click an asset for detail"
          : "Scroll ← → for distance from the zero line · ↑ ↓ between domain layers · click an asset for detail"}
      </p>
      {view.renderMode === "terrain3d" && (
        <p className="legend__hint">
          Synthetic representative terrain — a strip a few km wide, full depth rear-to-rear. Not real
          geography; distance along the axis is band-compressed exactly as in the schematic view.
        </p>
      )}
      <p className="legend__sides">
        {SIDE_LABELS.side_a.short} rear is to the left, {SIDE_LABELS.side_b.short} rear to the right.
      </p>
    </div>
  );
}
