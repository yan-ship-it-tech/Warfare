// ─────────────────────────────────────────────────────────────────────────
// Frame instrumentation for the WebGL view.
//
// Pass 16 item 1: "sluggish" has to become a number before and after, or
// there is no way to tell whether a fix worked. This is the number.
//
// Deliberately allocation-free in the hot path: sample() is called once per
// frame from Scene3D's tick and writes into preallocated ring buffers. The
// React overlay that displays this polls on its own (slow) interval rather
// than being pushed to, so instrumenting the scene can never itself become
// the thing that makes the scene re-render 60 times a second.
// ─────────────────────────────────────────────────────────────────────────

/** Frames kept for the rolling averages. ~2s at 60fps. */
const WINDOW = 120;

export interface PerfSnapshot {
  /** Instantaneous frames per second, from the rolling mean frame time. */
  fps: number;
  /** Mean frame interval over the window, ms. */
  frameMs: number;
  /** 95th-percentile frame interval, ms — the stutter number. A good mean
   *  with a bad p95 IS the "smooth then it hitches" complaint. */
  p95Ms: number;
  /** Worst frame interval in the window, ms. */
  worstMs: number;
  /** Time spent inside the label layout pass, mean over the window, ms. */
  layoutMs: number;
  /** Time spent inside renderer.render(), mean over the window, ms. */
  renderMs: number;
  /** Long frames (>33.4ms, i.e. below 30fps) seen since the monitor started. */
  hitches: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  /** Scene-specific counters, so a regression can be attributed. */
  entries: number;
  titled: number;
  /** Frames where the label layout was skipped because nothing moved. */
  layoutSkipRate: number;
  occlusionProbes: number;
}

const EMPTY: PerfSnapshot = {
  fps: 0, frameMs: 0, p95Ms: 0, worstMs: 0, layoutMs: 0, renderMs: 0, hitches: 0,
  drawCalls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0,
  entries: 0, titled: 0, layoutSkipRate: 0, occlusionProbes: 0,
};

/** A frame slower than this counts as a hitch. 30fps — the point at which
 *  a pan stops reading as motion and starts reading as a series of jumps. */
const HITCH_MS = 33.4;

export class PerfMonitor {
  private readonly frame = new Float32Array(WINDOW);
  private readonly layout = new Float32Array(WINDOW);
  private readonly render = new Float32Array(WINDOW);
  private readonly sorted = new Float32Array(WINDOW);
  private i = 0;
  private filled = 0;
  private last = 0;
  private skipped = 0;
  private counted = 0;
  hitches = 0;

  // Written directly by the scene each frame — plain fields, no allocation.
  entries = 0;
  titled = 0;
  occlusionProbes = 0;
  drawCalls = 0;
  triangles = 0;
  programs = 0;
  geometries = 0;
  textures = 0;

  /** Call once per frame with the two sub-timings. `skippedLayout` records
   *  that the layout pass short-circuited, which is itself a headline number:
   *  a high skip rate on an idle camera is the whole point of the fix. */
  sample(now: number, layoutMs: number, renderMs: number, skippedLayout: boolean): void {
    if (this.last !== 0) {
      const dt = now - this.last;
      this.frame[this.i] = dt;
      this.layout[this.i] = layoutMs;
      this.render[this.i] = renderMs;
      this.i = (this.i + 1) % WINDOW;
      if (this.filled < WINDOW) this.filled++;
      if (dt > HITCH_MS) this.hitches++;
      this.counted++;
      if (skippedLayout) this.skipped++;
    }
    this.last = now;
  }

  /** Allocates one object — called from a slow React interval, never per frame. */
  snapshot(): PerfSnapshot {
    const n = this.filled;
    if (n === 0) return EMPTY;
    let fSum = 0, lSum = 0, rSum = 0, worst = 0;
    for (let k = 0; k < n; k++) {
      const f = this.frame[k];
      fSum += f;
      lSum += this.layout[k];
      rSum += this.render[k];
      if (f > worst) worst = f;
      this.sorted[k] = f;
    }
    // Partial sort is not worth it at n=120 and this runs 4×/second.
    const view = this.sorted.subarray(0, n);
    view.sort();
    const p95 = view[Math.min(n - 1, Math.floor(n * 0.95))];
    const frameMs = fSum / n;
    return {
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMs,
      p95Ms: p95,
      worstMs: worst,
      layoutMs: lSum / n,
      renderMs: rSum / n,
      hitches: this.hitches,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      programs: this.programs,
      geometries: this.geometries,
      textures: this.textures,
      entries: this.entries,
      titled: this.titled,
      layoutSkipRate: this.counted > 0 ? this.skipped / this.counted : 0,
      occlusionProbes: this.occlusionProbes,
    };
  }

  reset(): void {
    this.i = 0;
    this.filled = 0;
    this.last = 0;
    this.hitches = 0;
    this.skipped = 0;
    this.counted = 0;
  }
}

/** One monitor per page. Scene3D writes it; the overlay reads it. A module
 *  singleton rather than context because the overlay must be mountable
 *  without threading a prop through App → main → scene. */
export const perf = new PerfMonitor();
