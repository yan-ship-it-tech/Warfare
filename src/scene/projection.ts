// ─────────────────────────────────────────────────────────────────────────
// Battlefield → screen projection.
//
// x: distance from the zero line, mapped piecewise per band. Bands are not on
//    a shared linear scale — 0–5 km and 150 km+ cannot be, and still be legible
//    — so each band gets its own screen allocation and the ruler labels real km
//    throughout, making the compression visible rather than hidden.
// y: domain lane (domains.json vertical_order), plus a sub-row nudge when two
//    assets would otherwise sit on top of each other.
// oblique: each lane down the stack is shifted horizontally by a fixed amount.
//    Applied per lane rather than as a CSS skew on the scene, so icons, text
//    and hit-boxes stay undistorted while the stack still reads as a cut
//    through the battlefield.
// ─────────────────────────────────────────────────────────────────────────
import type { DistanceBand, Domain, DomainLayer, Side } from "../types";
import type { DoctrineMarker, SceneNode } from "../data/model";
import { nodeDistance, nodeDomain, nodeSide } from "../data/model";
import { DOMAIN_ALTITUDE_PX, SIDE_DIRECTION, VIEW } from "../config/ui";
import { resolvePlatformDomain } from "../data/placement";
import { LabelGrid } from "./labelGrid";

export interface BandSpan {
  band: DistanceBand;
  /** Offset from the zero-line gutter edge, in px, at which this band starts/ends. */
  startPx: number;
  endPx: number;
  /** Highest km actually drawn for this band (open-ended bands are capped). */
  displayMaxKm: number;
}

export interface Projection {
  spans: BandSpan[];
  halfWidthPx: number;
  sceneWidthPx: number;
  sceneHeightPx: number;
  centerXPx: number;
  laneCount: number;
  /** km → px offset outward from the zero-line gutter. */
  kmToOffsetPx(km: number): number;
  /** px offset outward from the gutter → km (inverse; used by drag/edit later). */
  offsetPxToKm(offset: number): number;
  /** Absolute scene x for a side + distance, at a given lane. */
  xFor(side: Side, km: number, laneIndex: number): number;
  /** Absolute scene x of the zero line at a given lane. */
  zeroXAt(laneIndex: number): number;
  laneIndexOf(domain: Domain): number;
  laneY(laneIndex: number): number;
  laneOffsetX(laneIndex: number): number;
}

export function buildProjection(bands: DistanceBand[], domains: DomainLayer[]): Projection {
  const ordered = [...bands].sort((a, b) => a.min_km - b.min_km);
  const spans: BandSpan[] = [];
  let cursor = 0;
  for (const band of ordered) {
    const width = VIEW.bandWidthPx[band.id] ?? VIEW.defaultBandWidthPx;
    const openEnded = band.max_km >= 10_000;
    spans.push({
      band,
      startPx: cursor,
      endPx: cursor + width,
      displayMaxKm: openEnded ? VIEW.openEndedDisplayCapKm : band.max_km,
    });
    cursor += width;
  }

  const halfWidthPx = cursor;
  const laneCount = domains.length;
  const obliqueTotal = VIEW.laneObliqueOffsetPx * Math.max(0, laneCount - 1);
  const sceneWidthPx =
    halfWidthPx * 2 + VIEW.zeroGutterPx + obliqueTotal + VIEW.scenePadPx.x * 2;
  const sceneHeightPx =
    laneCount * VIEW.laneHeightPx + VIEW.scenePadPx.top + VIEW.scenePadPx.bottom;

  // Lane 0 sits furthest right; each lane below steps left, so the stack leans.
  const laneOffsetX = (laneIndex: number) =>
    obliqueTotal - laneIndex * VIEW.laneObliqueOffsetPx;

  const centerXPx = VIEW.scenePadPx.x + halfWidthPx + VIEW.zeroGutterPx / 2;

  const kmToOffsetPx = (km: number): number => {
    const clamped = Math.max(0, km);
    for (const s of spans) {
      if (clamped <= s.band.max_km) {
        const lo = s.band.min_km;
        const hi = s.displayMaxKm;
        const t = hi === lo ? 0 : (Math.min(clamped, hi) - lo) / (hi - lo);
        return s.startPx + t * (s.endPx - s.startPx);
      }
    }
    return spans.length ? spans[spans.length - 1].endPx : 0;
  };

  const offsetPxToKm = (offset: number): number => {
    const clamped = Math.max(0, Math.min(offset, halfWidthPx));
    for (const s of spans) {
      if (clamped <= s.endPx) {
        const t = s.endPx === s.startPx ? 0 : (clamped - s.startPx) / (s.endPx - s.startPx);
        return s.band.min_km + t * (s.displayMaxKm - s.band.min_km);
      }
    }
    return spans.length ? spans[spans.length - 1].displayMaxKm : 0;
  };

  const laneIndexById = new Map<Domain, number>();
  domains.forEach((d, i) => laneIndexById.set(d.id, i));

  const laneY = (laneIndex: number) =>
    VIEW.scenePadPx.top + laneIndex * VIEW.laneHeightPx + VIEW.laneHeightPx / 2;

  const zeroXAt = (laneIndex: number) => centerXPx + laneOffsetX(laneIndex);

  const xFor = (side: Side, km: number, laneIndex: number) =>
    zeroXAt(laneIndex) +
    SIDE_DIRECTION[side] * (VIEW.zeroGutterPx / 2 + kmToOffsetPx(km));

  return {
    spans,
    halfWidthPx,
    sceneWidthPx,
    sceneHeightPx,
    centerXPx,
    laneCount,
    kmToOffsetPx,
    offsetPxToKm,
    xFor,
    zeroXAt,
    laneIndexOf: (domain) => laneIndexById.get(domain) ?? 0,
    laneY,
    laneOffsetX,
  };
}

export interface PlacedNode {
  node: SceneNode;
  id: string;
  x: number;
  y: number;
  laneIndex: number;
  subRow: number;
}

/** The purely visual vertical pop AssetNode applies at render time, in px.
 *  Keyed on the platform domain — where the thing physically sits — so a
 *  ground-based SAM in the `air` lane gets none. See src/data/placement.ts. */
function nodeAltitudePx(n: SceneNode): number {
  const platform =
    n.kind === "asset"
      ? resolvePlatformDomain(n.asset)
      : resolvePlatformDomain({ domain: n.stub.domain });
  return DOMAIN_ALTITUDE_PX[platform] ?? 0;
}

/**
 * Positions every node and pushes overlapping ones into sub-rows within their
 * lane, so a dense category stays readable without hand-tuning coordinates in
 * the data. Deterministic: same input order in, same layout out.
 */
export function placeNodes(nodes: SceneNode[], proj: Projection): PlacedNode[] {
  const byLane = new Map<string, SceneNode[]>();
  for (const n of nodes) {
    const key = `${nodeSide(n)}:${nodeDomain(n)}`;
    const list = byLane.get(key);
    if (list) list.push(n);
    else byLane.set(key, [n]);
  }

  const placed: PlacedNode[] = [];
  for (const list of byLane.values()) {
    const sorted = [...list].sort(
      (a, b) => nodeDistance(a) - nodeDistance(b) || a.id.localeCompare(b.id),
    );

    // Pass 1 — assign each node the first sub-row with room for it. The row
    // count is NOT capped here. It used to be clamped to VIEW.maxSubRows, which
    // meant every node past the third collision landed on the same row at the
    // same x — i.e. exactly on top of another node, covering its hit target
    // entirely (Gepard SPAAG was unreachable behind Switchblade 600). Letting
    // the count grow and then fitting the rows to the lane in pass 2 keeps
    // every node individually hoverable however dense the category gets.
    const rows: { node: SceneNode; x: number; subRow: number }[] = [];
    const lastXInRow: number[] = [];
    let maxSubRow = 0;
    for (const n of sorted) {
      const laneIndex = proj.laneIndexOf(nodeDomain(n));
      const x = proj.xFor(nodeSide(n), nodeDistance(n), laneIndex);
      let subRow = 0;
      while (
        lastXInRow[subRow] !== undefined &&
        Math.abs(x - lastXInRow[subRow]) < VIEW.minIconSeparationPx
      ) {
        subRow += 1;
      }
      lastXInRow[subRow] = x;
      if (subRow > maxSubRow) maxSubRow = subRow;
      rows.push({ node: n, x, subRow });
    }

    // Pass 2 — distribute however many rows were needed across the lane's own
    // height, centred on the lane. Spacing shrinks only when demand exceeds
    // what VIEW.subRowOffsetPx would use, so sparse lanes look exactly as they
    // did and only genuinely crowded ones tighten up.
    //
    // The floor has to clear the render-time altitude pop as well. AssetNode
    // draws each node at `y - altitude`, and altitude varies *within* a lane
    // (the air lane holds both airborne UAVs and ground-based SAMs, which is
    // the whole point of the platform/engagement split) — so a row gap of
    // exactly minSubRowSpacingPx can be eaten by a 20px pop and drop an
    // elevated node straight onto the grounded one below it. Widening the gap
    // by the lane's altitude spread keeps the *rendered* separation correct.
    const altitudes = rows.map((r) => nodeAltitudePx(r.node));
    const altitudeSpread = altitudes.length
      ? Math.max(...altitudes) - Math.min(...altitudes)
      : 0;
    const spacing =
      maxSubRow === 0
        ? 0
        : Math.max(
            VIEW.minSubRowSpacingPx + altitudeSpread,
            Math.min(VIEW.subRowOffsetPx, VIEW.laneHeightPx / (maxSubRow + 1)),
          );
    for (const r of rows) {
      const laneIndex = proj.laneIndexOf(nodeDomain(r.node));
      placed.push({
        node: r.node,
        id: r.node.id,
        x: r.x,
        y: proj.laneY(laneIndex) + (r.subRow - maxSubRow / 2) * spacing,
        laneIndex,
        subRow: r.subRow,
      });
    }
  }
  return placed;
}

// ── label declutter (2D) ─────────────────────────────────────────────────
/** Label footprint under a node, in scene units — matches .node__label's
 *  132px width and its two-line-clamped height. */
const NODE_LABEL_W = 132;
const NODE_LABEL_H = 40;
/** Offset from the node's centre to the top of its label box: half the 52px
 *  icon plus the 5px gap .node__label sets. */
const NODE_LABEL_TOP_OFFSET = 31;

/**
 * Decides which 2D labels can be drawn without overlapping, returning the ids
 * whose label must collapse to icon-only (revealed on hover, focus or select).
 *
 * Zoom is deliberately not a parameter. The 2D scene is a single CSS
 * `scale()` — nodes and their labels scale by the same factor — so relative
 * overlap is zoom-invariant and this can be computed once in scene units. That
 * is the opposite of the 3D view, where perspective means the same two assets
 * can be far apart in one frame and on top of each other in the next.
 *
 * Priority is deterministic: real assets before pending stubs, un-bumped rows
 * before nodes the packer had to push into a sub-row, then by id. So the
 * primary row of each lane keeps its labels and the overflow collapses, which
 * is the readable outcome rather than an arbitrary left-to-right race.
 */
export function declutterLabels(placed: PlacedNode[]): Set<string> {
  const ordered = [...placed].sort(
    (a, b) =>
      Number(a.node.kind === "stub") - Number(b.node.kind === "stub") ||
      a.subRow - b.subRow ||
      a.id.localeCompare(b.id),
  );

  const grid = new LabelGrid(64);
  const collapsed = new Set<string>();
  for (const p of ordered) {
    const top = p.y + NODE_LABEL_TOP_OFFSET;
    const box = {
      x1: p.x - NODE_LABEL_W / 2,
      y1: top,
      x2: p.x + NODE_LABEL_W / 2,
      y2: top + NODE_LABEL_H,
    };
    if (grid.collides(box)) collapsed.add(p.id);
    else grid.insert(box);
  }
  return collapsed;
}

// ── ruler geometry ───────────────────────────────────────────────────────
/** Height of the ruler above the doctrine-marker rows: bands, ticks, labels. */
export const RULER_AXIS_H = 71;
export const MARKER_ROW_H = 15;

export interface PackedMarker {
  marker: DoctrineMarker;
  side: Side;
  left: number;
  width: number;
  row: number;
}

/**
 * Doctrine depth spans overlap heavily by nature — the FPV envelope sits
 * inside the drone-dense corridor, close reconnaissance inside both. Pack them
 * into as few rows as will fit without collisions, first-fit by left edge.
 */
export function packMarkerRows(
  markers: DoctrineMarker[],
  sides: Side[],
  proj: Projection,
): PackedMarker[] {
  const LABEL_PAD = 10;
  const out: PackedMarker[] = [];
  for (const side of sides) {
    const rowEnds: number[] = [];
    const spans = markers
      .filter((m) => m.side === "both" || m.side === side)
      .map((m) => {
        const a = proj.xFor(side, m.min_km, 0);
        const b = proj.xFor(side, m.max_km, 0);
        return { marker: m, left: Math.min(a, b), width: Math.abs(b - a) };
      })
      .sort((x, y) => x.left - y.left);
    for (const span of spans) {
      let row = rowEnds.findIndex((end) => span.left >= end);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = span.left + span.width + LABEL_PAD;
      out.push({ ...span, side, row });
    }
  }
  return out;
}

/** Total ruler height for a given set of packed marker rows. */
export function rulerHeight(rows: PackedMarker[], showMarkers: boolean): number {
  if (!showMarkers || rows.length === 0) return RULER_AXIS_H + 10;
  const maxRow = rows.reduce((m, r) => Math.max(m, r.row), 0);
  return RULER_AXIS_H + (maxRow + 1) * MARKER_ROW_H + 8;
}
