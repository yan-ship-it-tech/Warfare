// ─────────────────────────────────────────────────────────────────────────
// Dependency overlay.
//
// Edges come from the loader's merged view of the per-asset `connections`
// arrays and connections.json. Each type gets its own stroke treatment and an
// arrowhead showing direction (source depends on target).
//
// Pending targets: connections.json documents that an edge may legitimately
// point at an asset that does not exist yet, and that the UI should either
// draw a stub node or hide the line — never error. Both are implemented. With
// "Pending targets" on, the edge runs to a provisional stub node and is drawn
// with a faded, finer stroke so it never reads as an authored placement; with
// it off, the edge and its stub disappear entirely.
// ─────────────────────────────────────────────────────────────────────────
import { Fragment, useMemo } from "react";
import type { ConnectionType } from "../types";
import type { ResolvedConnection } from "../data/model";
import type { PlacedNode, Projection } from "./projection";
import { CONNECTION_STYLE } from "../config/ui";

interface Props {
  connections: ResolvedConnection[];
  positions: Map<string, PlacedNode>;
  proj: Projection;
  visibleTypes: Set<ConnectionType>;
  showPending: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  hoveredConnectionKey: string | null;
  onHoverConnection: (key: string | null) => void;
  onSelectNode: (id: string) => void;
}

interface Routed {
  conn: ResolvedConnection;
  d: string;
  mid: { x: number; y: number };
  emphasis: "normal" | "focus" | "muted";
}

function route(sx: number, sy: number, tx: number, ty: number): { d: string; mid: { x: number; y: number } } {
  const dx = tx - sx;
  const dy = ty - sy;
  if (Math.abs(dy) < 6) {
    // Same lane — lift the curve clear of the icon row it would otherwise cross.
    const lift = -54;
    return {
      d: `M ${sx} ${sy} C ${sx + dx * 0.25} ${sy + lift}, ${sx + dx * 0.75} ${sy + lift}, ${tx} ${ty}`,
      mid: { x: sx + dx / 2, y: sy + lift * 0.75 },
    };
  }
  return {
    d: `M ${sx} ${sy} C ${sx + dx * 0.5} ${sy}, ${sx + dx * 0.5} ${ty}, ${tx} ${ty}`,
    mid: { x: sx + dx * 0.5, y: sy + dy * 0.5 },
  };
}

export function ConnectionsOverlay({
  connections,
  positions,
  proj,
  visibleTypes,
  showPending,
  selectedId,
  hoveredId,
  hoveredConnectionKey,
  onHoverConnection,
  onSelectNode,
}: Props) {
  const focusId = selectedId ?? hoveredId;

  const routed = useMemo<Routed[]>(() => {
    const out: Routed[] = [];
    for (const conn of connections) {
      if (!visibleTypes.has(conn.type)) continue;
      if (conn.target_pending && !showPending) continue;
      const s = positions.get(conn.source_id);
      const t = positions.get(conn.target_id);
      if (!s || !t) continue; // side filtered out, or stub suppressed
      const { d, mid } = route(s.x, s.y, t.x, t.y);
      const touches = focusId === conn.source_id || focusId === conn.target_id;
      out.push({
        conn,
        d,
        mid,
        emphasis: !focusId ? "normal" : touches ? "focus" : "muted",
      });
    }
    // Focused edges last so they paint on top.
    return out.sort((a, b) => Number(a.emphasis === "focus") - Number(b.emphasis === "focus"));
  }, [connections, positions, visibleTypes, showPending, focusId]);

  const hovered = routed.find((r) => r.conn.key === hoveredConnectionKey);

  return (
    <>
      <svg
        className="connections"
        width={proj.sceneWidthPx}
        height={proj.sceneHeightPx}
        aria-hidden="true"
      >
        <defs>
          {Object.entries(CONNECTION_STYLE).map(([type, style]) => (
            <marker
              key={type}
              id={`arrow-${type}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill={style.color} />
            </marker>
          ))}
        </defs>

        {routed.map(({ conn, d, emphasis }) => {
          const style = CONNECTION_STYLE[conn.type] ?? CONNECTION_STYLE.supply;
          const pending = conn.target_pending;
          const isHovered = conn.key === hoveredConnectionKey;
          const opacity =
            emphasis === "muted" ? 0.1 : emphasis === "focus" ? 0.95 : pending ? 0.32 : 0.55;
          return (
            <Fragment key={conn.key}>
              {/* Wide invisible stroke: the actual hover/click target. */}
              <path
                className="connections__hit"
                d={d}
                stroke="transparent"
                strokeWidth={14}
                fill="none"
                onMouseEnter={() => onHoverConnection(conn.key)}
                onMouseLeave={() => onHoverConnection(null)}
                onClick={() => onSelectNode(conn.source_id)}
              />
              <path
                d={d}
                fill="none"
                stroke={style.color}
                strokeWidth={(isHovered || emphasis === "focus" ? style.width + 0.8 : style.width) * (pending ? 0.8 : 1)}
                strokeDasharray={pending ? "3 5" : style.dash}
                strokeLinecap="round"
                opacity={isHovered ? 1 : opacity}
                markerEnd={`url(#arrow-${conn.type})`}
              />
            </Fragment>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="connection-tip"
          style={{ left: hovered.mid.x, top: hovered.mid.y }}
          role="tooltip"
        >
          <span
            className="connection-tip__type"
            style={{ color: CONNECTION_STYLE[hovered.conn.type]?.color }}
          >
            {CONNECTION_STYLE[hovered.conn.type]?.label ?? hovered.conn.type}
          </span>
          <span className="connection-tip__body">{hovered.conn.description || "No description on this edge."}</span>
          <span className="connection-tip__ends">
            {hovered.conn.source_id} → {hovered.conn.target_id}
            {hovered.conn.target_pending ? " (pending)" : ""}
          </span>
          {hovered.conn.origin !== "both" && (
            <span className="connection-tip__origin">
              Declared only in {hovered.conn.origin === "asset" ? "the asset file" : "connections.json"}
            </span>
          )}
        </div>
      )}
    </>
  );
}
