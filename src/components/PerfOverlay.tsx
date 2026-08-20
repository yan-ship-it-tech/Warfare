// ─────────────────────────────────────────────────────────────────────────
// The frame-time / draw-call readout (Pass 16 item 1).
//
// Instrument before optimizing: this exists so "the app stutters" can be
// stated as a number, compared against the same number after a change, and
// recorded in DECISIONS.md. It reads src/three/perfMonitor.ts on a slow
// interval — never per frame, or the instrument would be part of the load it
// is measuring.
//
// Visible by default in `npm run dev`, and reachable in a production build
// two ways: the "Performance HUD" switch in the nav drawer, or `?perf=1` on
// the URL. The query param, not a hash flag, because the hash belongs to the
// in-app router (src/state/router.tsx) and `#perf` would look like a route.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { perf, type PerfSnapshot } from "../three/perfMonitor";

/** Poll interval. Four readings a second is legible without the numbers
 *  flickering too fast to read, and costs nothing. */
const POLL_MS = 250;

function tone(fps: number): string {
  if (fps >= 50) return "is-good";
  if (fps >= 30) return "is-warn";
  return "is-bad";
}

export function PerfOverlay() {
  const [s, setS] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setS(perf.snapshot()), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!s) return null;

  return (
    <div className="perfhud" role="status" aria-label="Renderer performance readout" data-testid="perf-hud">
      <div className="perfhud__row perfhud__row--head">
        <span className={`perfhud__fps ${tone(s.fps)}`}>{s.fps.toFixed(0)} fps</span>
        <span className="perfhud__frame">{s.frameMs.toFixed(1)} ms</span>
      </div>
      <dl className="perfhud__grid">
        <dt>p95 / worst</dt>
        <dd>
          {s.p95Ms.toFixed(1)} / {s.worstMs.toFixed(1)} ms
        </dd>
        <dt>layout / render</dt>
        <dd>
          {s.layoutMs.toFixed(2)} / {s.renderMs.toFixed(2)} ms
        </dd>
        <dt>hitches &gt;33ms</dt>
        <dd>{s.hitches}</dd>
        <dt>draw calls</dt>
        <dd>{s.drawCalls}</dd>
        <dt>triangles</dt>
        <dd>{s.triangles.toLocaleString()}</dd>
        <dt>geom / prog</dt>
        <dd>
          {s.geometries} / {s.programs}
        </dd>
        <dt>assets / titled</dt>
        <dd>
          {s.entries} / {s.titled}
        </dd>
        <dt>layout skipped</dt>
        <dd>{(s.layoutSkipRate * 100).toFixed(0)}%</dd>
        <dt>occl. probes</dt>
        <dd>{s.occlusionProbes}</dd>
      </dl>
    </div>
  );
}

export default PerfOverlay;
