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
import { SIDE_DIRECTION, VIEW } from "../config/ui";

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
    // Track the last x used in each sub-row so we only bump when we must.
    const lastXInRow: number[] = [];
    for (const n of sorted) {
      const laneIndex = proj.laneIndexOf(nodeDomain(n));
      const x = proj.xFor(nodeSide(n), nodeDistance(n), laneIndex);
      let subRow = 0;
      while (
        subRow < VIEW.maxSubRows &&
        lastXInRow[subRow] !== undefined &&
        Math.abs(x - lastXInRow[subRow]) < VIEW.minIconSeparationPx
      ) {
        subRow += 1;
      }
      if (subRow >= VIEW.maxSubRows) subRow = VIEW.maxSubRows - 1;
      lastXInRow[subRow] = x;
      placed.push({
        node: n,
        id: n.id,
        x,
        y: proj.laneY(laneIndex) + subRow * VIEW.subRowOffsetPx - (subRow > 0 ? 8 : 0),
        laneIndex,
        subRow,
      });
    }
  }
  return placed;
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
