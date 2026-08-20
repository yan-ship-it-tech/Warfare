// ─────────────────────────────────────────────────────────────────────────
// Shared label-collision index.
//
// Both renderers have the same problem at 87 assets — more labels than there
// is room to draw — and they had two different non-answers to it: the 3D view
// compared every candidate against every label already placed, and the 2D view
// relied on placeNodes() bumping collisions into at most VIEW.maxSubRows rows
// and simply overlapped once that ran out.
//
// One index serves both. Bucketing boxes by cell makes each test proportional
// to local crowding rather than to the total asset count, which is what has to
// hold as the roster grows.
// ─────────────────────────────────────────────────────────────────────────

export interface LabelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export class LabelGrid {
  private readonly cell: number;
  private readonly buckets = new Map<number, LabelBox[]>();

  constructor(cell = 48) {
    this.cell = cell;
  }

  private key(cx: number, cy: number): number {
    return cx * 73856093 + cy * 19349663;
  }

  /** True if the box overlaps anything already inserted. */
  collides(box: LabelBox): boolean {
    const cx0 = Math.floor(box.x1 / this.cell);
    const cx1 = Math.floor(box.x2 / this.cell);
    const cy0 = Math.floor(box.y1 / this.cell);
    const cy1 = Math.floor(box.y2 / this.cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const b of bucket) {
          if (box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1) return true;
        }
      }
    }
    return false;
  }

  /** Empties the index for reuse on the next frame.
   *
   *  Pass 16: the 3D render loop used to construct a fresh LabelGrid every
   *  frame, which meant a new Map plus one array per occupied cell 60 times a
   *  second — steady garbage that showed up as periodic GC hitches in the
   *  frame-time trace rather than as a slow average. Keeping the buckets and
   *  clearing them costs nothing and allocates nothing. */
  clear(): void {
    for (const bucket of this.buckets.values()) bucket.length = 0;
  }

  insert(box: LabelBox): void {
    const cx0 = Math.floor(box.x1 / this.cell);
    const cx1 = Math.floor(box.x2 / this.cell);
    const cy0 = Math.floor(box.y1 / this.cell);
    const cy1 = Math.floor(box.y2 / this.cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = this.key(cx, cy);
        const bucket = this.buckets.get(k);
        if (bucket) bucket.push(box);
        else this.buckets.set(k, [box]);
      }
    }
  }
}
