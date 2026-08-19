// ─────────────────────────────────────────────────────────────────────────
// Dev-only frame-time / draw-call readout.
//
// Pass 13's first instruction, and the reason it comes first: "sluggish" is
// not a thing you can fix, because it is not a thing you can compare. Every
// number this pass claims — before and after — comes out of here.
//
// Never visible unless explicitly asked for. Three ways in, all opt-in:
//   ?perf=1 in the query string   (what scripts/perf-probe.mjs uses)
//   #/...?perf=1 in the hash      (survives this app's hash router)
//   Shift+P                       (toggles, and remembers in localStorage)
// There is no build-time flag and no automatic "on in dev": a readout that
// appears by itself is one more thing covering the scene it is measuring.
//
// Cost of the instrument itself: one performance.now() pair per frame, a
// ring buffer of 240 floats written in place, and a DOM text write at 5 Hz.
// Nothing here allocates per frame — an allocating profiler would be
// measuring itself (see docs/DECISIONS.md Pass 13).
// ─────────────────────────────────────────────────────────────────────────
import type * as THREE from "three";

const STORAGE_KEY = "warfare.perfHud";
/** Four seconds at 60 Hz — long enough that a single hitch shows up in p95
 *  rather than being averaged away, short enough to still track a gesture. */
const WINDOW = 240;
/** A frame slower than this is a visible hitch, not just a slow frame. 33 ms
 *  is two missed vsyncs at 60 Hz. */
const HITCH_MS = 33;

export interface PerfSample {
  fps: number;
  /** Wall-clock interval between presented frames. */
  frameAvgMs: number;
  frameP95Ms: number;
  frameWorstMs: number;
  /** Time spent inside our own tick — the part this codebase can actually fix. */
  cpuAvgMs: number;
  cpuP95Ms: number;
  cpuWorstMs: number;
  /** Frames over HITCH_MS, as a percentage of the window. */
  hitchPct: number;
  calls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  labelsFull: number;
  labelsDot: number;
  labelsHidden: number;
  /** React commits of the label layer per second, averaged since the last
   *  reset() — the metric that made the label rework obviously correct
   *  rather than plausible. One per rendered frame before Pass 13; zero
   *  during camera motion after it. */
  reactCommitsPerSec: number;
  heapMB: number | null;
}

declare global {
  interface Window {
    /** Read by scripts/perf-probe.mjs. Present whenever the HUD is armed. */
    __warfarePerf?: {
      sample: () => PerfSample;
      reset: () => void;
      markReactCommit: () => void;
    };
  }
}

function readFlag(): boolean {
  if (typeof window === "undefined") return false;
  const inQuery = /(^|[?&])perf=1(&|$)/.test(window.location.search);
  const inHash = /[?&]perf=1(&|$)/.test(window.location.hash);
  if (inQuery || inHash) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Counts React commits of the label layer. Incremented from Scene3D's render
 *  body; read (and zeroed) by each HUD sample. Module-level so it survives
 *  the HUD being toggled off and on mid-session. */
let reactCommits = 0;
export function markReactCommit(): void {
  reactCommits += 1;
}

function percentile(sorted: Float64Array, n: number, p: number): number {
  if (n === 0) return 0;
  const i = Math.min(n - 1, Math.max(0, Math.round((n - 1) * p)));
  return sorted[i];
}

export class PerfHud {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly el: HTMLDivElement;
  private readonly frameMs = new Float64Array(WINDOW);
  private readonly cpuMs = new Float64Array(WINDOW);
  private readonly scratch = new Float64Array(WINDOW);
  private write = 0;
  private filled = 0;
  private lastFrameAt = 0;
  private resetAt = 0;
  private commitsAtReset = 0;
  private cpuStart = 0;
  private lastPaint = 0;
  private full = 0;
  private dot = 0;
  private hidden = 0;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, mount: HTMLElement) {
    this.renderer = renderer;
    this.resetAt = performance.now();
    this.commitsAtReset = reactCommits;
    this.el = document.createElement("div");
    this.el.className = "perf-hud";
    this.el.setAttribute("aria-hidden", "true");
    mount.appendChild(this.el);
    window.__warfarePerf = {
      sample: () => this.sample(),
      reset: () => this.reset(),
      markReactCommit,
    };
  }

  reset(): void {
    this.write = 0;
    this.filled = 0;
    this.lastFrameAt = 0;
    this.resetAt = performance.now();
    this.commitsAtReset = reactCommits;
    this.renderer.info.reset();
  }

  /** Called at the very top of the render loop. */
  begin(now: number): void {
    if (this.lastFrameAt > 0) {
      const dt = now - this.lastFrameAt;
      this.frameMs[this.write] = dt;
    } else {
      this.frameMs[this.write] = 0;
    }
    this.lastFrameAt = now;
    this.cpuStart = now;
  }

  setLabelCounts(full: number, dot: number, hidden: number): void {
    this.full = full;
    this.dot = dot;
    this.hidden = hidden;
  }

  /** Called after renderer.render() — everything between begin() and here is
   *  work this app chose to do. */
  end(now: number): void {
    this.cpuMs[this.write] = now - this.cpuStart;
    this.write = (this.write + 1) % WINDOW;
    if (this.filled < WINDOW) this.filled += 1;
    if (now - this.lastPaint > 200) {
      this.lastPaint = now;
      this.paint();
    }
  }

  sample(): PerfSample {
    const n = this.filled;
    const stats = (src: Float64Array) => {
      let sum = 0;
      let worst = 0;
      for (let i = 0; i < n; i++) {
        const v = src[i];
        sum += v;
        if (v > worst) worst = v;
        this.scratch[i] = v;
      }
      const view = this.scratch.subarray(0, n);
      view.sort();
      return { avg: n ? sum / n : 0, p95: percentile(this.scratch, n, 0.95), worst };
    };
    // frameMs first: stats() reuses one scratch buffer, so the two calls
    // cannot be interleaved.
    const f = stats(this.frameMs);
    const c = stats(this.cpuMs);
    let hitches = 0;
    for (let i = 0; i < n; i++) if (this.frameMs[i] > HITCH_MS) hitches += 1;
    const info = this.renderer.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const elapsed = Math.max(1, performance.now() - (this.resetAt || performance.now() - 1000));
    const commitRate = ((reactCommits - this.commitsAtReset) / elapsed) * 1000;
    return {
      fps: f.avg > 0 ? 1000 / f.avg : 0,
      frameAvgMs: f.avg,
      frameP95Ms: f.p95,
      frameWorstMs: f.worst,
      cpuAvgMs: c.avg,
      cpuP95Ms: c.p95,
      cpuWorstMs: c.worst,
      hitchPct: n ? (hitches / n) * 100 : 0,
      calls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      labelsFull: this.full,
      labelsDot: this.dot,
      labelsHidden: this.hidden,
      reactCommitsPerSec: commitRate,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
    };
  }

  private paint(): void {
    const s = this.sample();
    const f1 = (v: number) => v.toFixed(1);
    this.el.textContent =
      `${f1(s.fps)} fps  ·  frame ${f1(s.frameAvgMs)}/${f1(s.frameP95Ms)}/${f1(s.frameWorstMs)} ms (avg/p95/max)\n` +
      `cpu ${f1(s.cpuAvgMs)}/${f1(s.cpuP95Ms)}/${f1(s.cpuWorstMs)} ms  ·  hitches ${f1(s.hitchPct)}%\n` +
      `draws ${s.calls}  ·  tris ${(s.triangles / 1000).toFixed(1)}k  ·  progs ${s.programs}\n` +
      `geom ${s.geometries}  ·  tex ${s.textures}` +
      (s.heapMB !== null ? `  ·  heap ${s.heapMB.toFixed(0)} MB` : "") +
      `\nlabels ${s.labelsFull} titled / ${s.labelsDot} dot / ${s.labelsHidden} hidden  ·  react ${f1(s.reactCommitsPerSec)}/s`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.el.remove();
    if (window.__warfarePerf) delete window.__warfarePerf;
  }
}

/**
 * Arms the HUD if it has been asked for, and wires the Shift+P toggle either
 * way. Returns a teardown. `onChange` is how the render loop learns that the
 * HUD appeared or vanished mid-session without the loop being rebuilt.
 */
export function installPerfHud(
  renderer: THREE.WebGLRenderer,
  mount: HTMLElement,
  onChange: (hud: PerfHud | null) => void,
): () => void {
  let hud: PerfHud | null = readFlag() ? new PerfHud(renderer, mount) : null;
  onChange(hud);

  const onKey = (e: KeyboardEvent) => {
    // Shift+P, and only when nothing is being typed into.
    if (!e.shiftKey || (e.key !== "P" && e.key !== "p")) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    if (hud) {
      hud.dispose();
      hud = null;
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch { /* private mode — the toggle still works for this session */ }
    } else {
      hud = new PerfHud(renderer, mount);
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch { /* as above */ }
    }
    onChange(hud);
  };
  window.addEventListener("keydown", onKey);

  return () => {
    window.removeEventListener("keydown", onKey);
    hud?.dispose();
    hud = null;
  };
}
