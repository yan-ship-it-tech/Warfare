// The scrollable oblique battlefield view.
//
// Horizontal scroll moves toward/away from the zero line and straight through
// into the mirrored opposing side. Vertical scroll moves between the domain
// layers stacked at that depth. The ruler sticks to the top of the viewport
// and the domain rail to its left, so both readings stay on screen wherever
// you are in the scene.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorldModel, SceneNode } from "../data/model";
import { nodeSide } from "../data/model";
import {
  buildProjection,
  packMarkerRows,
  placeNodes,
  rulerHeight,
  type PlacedNode,
} from "./projection";
import { Lanes } from "./Lanes";
import { Ruler } from "./Ruler";
import { AssetNode } from "./AssetNode";
import { ConnectionsOverlay } from "./ConnectionsOverlay";
import { useViewState } from "../state/viewState";
import { DOMAIN_ACCENT, VIEW } from "../config/ui";

interface Props {
  world: WorldModel;
  replayNonce: number;
}

export function Scene({ world, replayNonce }: Props) {
  const view = useViewState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  // The domain rail lives outside the scroll container (so it can pin to the
  // left edge) and is kept in sync by hand, coalesced into a frame.
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef(0);

  const proj = useMemo(
    () => buildProjection(world.bands, world.domains),
    [world.bands, world.domains],
  );

  const nodes = useMemo<SceneNode[]>(() => {
    const list: SceneNode[] = world.assets
      .filter((asset) => !view.hiddenGroups.has(asset.group))
      .map((asset) => ({ kind: "asset" as const, id: asset.id, asset }));
    // Pending stubs aren't categorized (they're inferred placeholders, not
    // authored assets), so the category filter doesn't touch them — only the
    // side filter and the pending-targets toggle do.
    if (view.showPending) {
      for (const stub of world.stubs) list.push({ kind: "stub", id: stub.id, stub });
    }
    return list.filter((n) => view.visibleSides.has(nodeSide(n)));
  }, [world.assets, world.stubs, view.showPending, view.visibleSides, view.hiddenGroups]);

  const placed = useMemo(() => placeNodes(nodes, proj), [nodes, proj]);

  const markerRows = useMemo(
    () => packMarkerRows(world.doctrineMarkers, ["side_a", "side_b"], proj),
    [world.doctrineMarkers, proj],
  );
  const rulerH = rulerHeight(markerRows, view.showDoctrineMarkers);

  const positions = useMemo(() => {
    const m = new Map<string, PlacedNode>();
    for (const p of placed) m.set(p.id, p);
    return m;
  }, [placed]);

  /** Everything one hop from the current focus — used to fade the rest out.
   *  Hovering previews the same isolation a click commits to, which matters
   *  a lot once a node has several same-type (same-color) edges: hovering it
   *  is the fast way to see which lines are actually its, versus another
   *  edge that merely passes nearby on the way to a different node. */
  const focusId = view.selectedId ?? view.hoveredId;
  const neighbours = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const c of world.connections) {
      if (!view.connectionTypes.has(c.type)) continue;
      if (c.target_pending && !view.showPending) continue;
      if (c.source_id === focusId) set.add(c.target_id);
      if (c.target_id === focusId) set.add(c.source_id);
    }
    return set;
  }, [focusId, view.connectionTypes, view.showPending, world.connections]);

  // Open on the zero line, and on the land layer rather than the empty space
  // lane at the top — the first screen should show the thing being taught.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || didInitialScroll.current) return;
    didInitialScroll.current = true;
    const midLane = Math.floor(proj.laneCount / 2);
    el.scrollLeft = proj.zeroXAt(midLane) - el.clientWidth / 2;
    // Vertically, open on the centre of gravity of the real assets rather than
    // the top of the stack — with only a few categories built, most lanes are
    // still empty and opening on an empty one reads as a broken app.
    const laneIndices = world.assets.map((a) => proj.laneIndexOf(a.domain));
    const focusLane = laneIndices.length
      ? laneIndices.reduce((a, b) => a + b, 0) / laneIndices.length
      : midLane;
    // The ruler is sticky *and in flow*, so it both offsets the scene's origin
    // and covers the top of the viewport. Those cancel in the scene's own
    // coordinates: the unobscured window is simply
    // [scrollTop, scrollTop + clientHeight - rulerH].
    const focusY = proj.laneY(Math.round(focusLane * 2) / 2);
    el.scrollTop = Math.max(0, focusY - (el.clientHeight - rulerH) / 2);
    setScrollTop(el.scrollTop);
  }, [proj, world.assets, rulerH]);

  // Bring a newly selected node into view without yanking the whole scene.
  // positions are in un-zoomed scene units; the scroll container's actual
  // content is scaled by sceneZoom (see the .scene-zoom-frame wrapper), so
  // every comparison against real scrollLeft/clientWidth pixels needs the
  // same factor applied.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !view.selectedId) return;
    const raw = positions.get(view.selectedId);
    if (!raw) return;
    const zoom = view.sceneZoom;
    const p = { x: raw.x * zoom, y: raw.y * zoom };
    const margin = 220;
    // The detail panel overlays the right edge of the scene, so "visible" stops
    // where the panel starts — otherwise selecting a node can slide it under it.
    const panelW = Math.min(440, window.innerWidth * 0.42);
    const left = el.scrollLeft;
    const right = left + el.clientWidth - panelW;
    const top = el.scrollTop;
    const bottom = el.scrollTop + el.clientHeight - rulerH;
    const nextLeft =
      p.x < left + margin || p.x > right - margin
        ? p.x - (el.clientWidth - panelW) / 2
        : left;
    const nextTop =
      p.y < top + 140 || p.y > bottom - 140
        ? p.y - (el.clientHeight - rulerH) / 2
        : el.scrollTop;
    if (nextLeft !== left || nextTop !== el.scrollTop) {
      el.scrollTo({ left: nextLeft, top: Math.max(0, nextTop), behavior: "smooth" });
    }
  }, [view.selectedId, positions, rulerH, view.sceneZoom]);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrollTop(scrollRef.current?.scrollTop ?? 0);
    });
  }, []);

  useEffect(() => () => window.cancelAnimationFrame(rafRef.current), []);

  const scrollToLane = (laneIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: proj.laneY(laneIndex) - el.clientHeight / 2,
      behavior: "smooth",
    });
  };

  return (
    <div className="scene-viewport">
      <div
        className="scene-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Battlefield cross-section. Scroll horizontally to change distance from the zero line, vertically to change domain layer."
        onScroll={onScroll}
        onClick={(e) => {
          if (e.target === e.currentTarget) view.select(null);
        }}
      >
        <Ruler
          proj={proj}
          visibleSides={view.visibleSides}
          markerRows={markerRows}
          showMarkers={view.showDoctrineMarkers}
          height={rulerH}
        />

        <div
          className="scene-zoom-frame"
          style={{
            width: proj.sceneWidthPx * view.sceneZoom,
            height: proj.sceneHeightPx * view.sceneZoom,
          }}
        >
        <div
          className="scene"
          style={{
            width: proj.sceneWidthPx,
            height: proj.sceneHeightPx,
            transform: `scale(${view.sceneZoom})`,
          }}
        >
          <Lanes domains={world.domains} proj={proj} visibleSides={view.visibleSides} />

          {view.showConnections && (
            <ConnectionsOverlay
              connections={world.connections}
              positions={positions}
              proj={proj}
              visibleTypes={view.connectionTypes}
              showPending={view.showPending}
              selectedId={view.selectedId}
              hoveredId={view.hoveredId}
              hoveredConnectionKey={view.hoveredConnectionKey}
              onHoverConnection={view.hoverConnection}
              onSelectNode={view.select}
            />
          )}

          <div className="nodes">
            {placed.map((p) => (
              <AssetNode
                key={p.id}
                placed={p}
                selected={view.selectedId === p.id}
                hovered={view.hoveredId === p.id}
                faded={Boolean(neighbours) && !neighbours!.has(p.id)}
                replayNonce={replayNonce}
                onSelect={view.select}
                onHover={view.hover}
              />
            ))}
          </div>
        </div>
        </div>
      </div>

      <div className="scene-zoom-controls" role="group" aria-label="Zoom">
        <button type="button" onClick={() => view.setSceneZoom((z) => z - 0.15)} aria-label="Zoom out">
          −
        </button>
        <span>{Math.round(view.sceneZoom * 100)}%</span>
        <button type="button" onClick={() => view.setSceneZoom((z) => z + 0.15)} aria-label="Zoom in">
          +
        </button>
        {view.sceneZoom !== 1 && (
          <button type="button" className="scene-zoom-controls__reset" onClick={() => view.setSceneZoom(1)}>
            Reset
          </button>
        )}
      </div>

      <nav className="domain-rail" style={{ top: rulerH }} aria-label="Domain layers">
        <div className="domain-rail__inner" style={{ transform: `translateY(${-scrollTop}px)` }}>
          {world.domains.map((d, i) => {
            const count = placed.filter(
              (p) => (p.node.kind === "asset" ? p.node.asset.domain : p.node.stub.domain) === d.id,
            ).length;
            return (
              <button
                key={d.id}
                type="button"
                className={`domain-rail__item${count === 0 ? " is-empty" : ""}`}
                style={{
                  top: proj.laneY(i) - VIEW.laneHeightPx / 2,
                  height: VIEW.laneHeightPx,
                  ["--lane-accent" as string]: DOMAIN_ACCENT[d.id] ?? "#7f8794",
                }}
                onClick={() => scrollToLane(i)}
                title={d.description}
              >
                <span className="domain-rail__order">{String(i + 1).padStart(2, "0")}</span>
                <span className="domain-rail__label">{d.label}</span>
                <span className="domain-rail__count">{count || "—"}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
