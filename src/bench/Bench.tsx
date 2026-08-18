// ─────────────────────────────────────────────────────────────────────────
// Renderer head-to-head: layered DOM/CSS vs. WebGL.
//
// The master prompt asks for the oblique scrolling view to be built on
// whichever of the two actually performs, rather than assuming full 3D. This
// page runs both against the same workload — N sprites, all moving every
// frame, which is the pessimistic case (in the real scene the nodes are static
// and only the container scrolls) — and reports sustained FPS and 95th
// percentile frame time.
//
// Read it with the caveat printed at the bottom: raw fill rate is only one
// input. Text, hit-testing, focus order and screen-reader semantics come free
// in DOM and have to be rebuilt by hand over a canvas.
//
// Open at #bench.
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";

const WARMUP_MS = 800;
const SAMPLE_MS = 4000;

interface Result {
  label: string;
  count: number;
  avgFps: number;
  p95FrameMs: number;
  frames: number;
}

type Phase = "idle" | "dom" | "webgl" | "done";

interface Sprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}

function makeSprites(n: number, w: number, h: number): Sprite[] {
  const out: Sprite[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 24,
      hue: Math.random(),
    });
  }
  return out;
}

function step(sprites: Sprite[], dt: number, w: number, h: number) {
  for (const s of sprites) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x < 0 || s.x > w) s.vx *= -1;
    if (s.y < 0 || s.y > h) s.vy *= -1;
  }
}

function summarise(label: string, count: number, frameTimes: number[]): Result {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const total = frameTimes.reduce((a, b) => a + b, 0);
  return {
    label,
    count,
    avgFps: frameTimes.length ? 1000 / (total / frameTimes.length) : 0,
    p95FrameMs: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
    frames: frameTimes.length,
  };
}

const VERT = `#version 300 es
in vec2 a_corner;
in vec2 a_offset;
in float a_hue;
uniform vec2 u_res;
uniform float u_size;
out vec2 v_uv;
out float v_hue;
void main() {
  v_uv = a_corner;
  v_hue = a_hue;
  vec2 px = a_offset + a_corner * u_size;
  vec2 clip = (px / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_hue;
out vec4 outColor;
vec3 hsl(float h) {
  return 0.55 + 0.35 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67)));
}
void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  float d = max(abs(p.x), abs(p.y));
  float a = smoothstep(1.0, 0.86, d);
  if (a <= 0.01) discard;
  outColor = vec4(hsl(v_hue) * (0.55 + 0.45 * (1.0 - d)), a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? "shader compile failed");
  }
  return sh;
}

export function Bench() {
  const [count, setCount] = useState(300);
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  const domHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const stopRaf = () => cancelAnimationFrame(rafRef.current);

  const runDom = useCallback(
    (n: number) =>
      new Promise<Result>((resolve) => {
        const host = domHostRef.current!;
        const w = host.clientWidth;
        const h = host.clientHeight;
        const sprites = makeSprites(n, w, h);
        host.innerHTML = "";
        const els: HTMLDivElement[] = [];
        for (const s of sprites) {
          const el = document.createElement("div");
          el.className = "bench-sprite";
          el.style.background = `hsl(${Math.round(s.hue * 360)} 55% 55%)`;
          host.appendChild(el);
          els.push(el);
        }
        const frameTimes: number[] = [];
        let last = performance.now();
        const started = last;
        const tick = (now: number) => {
          const dt = (now - last) / 1000;
          if (now - started > WARMUP_MS) frameTimes.push(now - last);
          last = now;
          step(sprites, Math.min(dt, 0.05), w, h);
          for (let i = 0; i < sprites.length; i++) {
            els[i].style.transform = `translate3d(${sprites[i].x}px, ${sprites[i].y}px, 0)`;
          }
          if (now - started < WARMUP_MS + SAMPLE_MS) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            host.innerHTML = "";
            resolve(summarise("Layered DOM / CSS transforms", n, frameTimes));
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      }),
    [],
  );

  const runWebgl = useCallback(
    (n: number) =>
      new Promise<Result>((resolve, reject) => {
        const canvas = canvasRef.current!;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
        if (!gl) {
          reject(new Error("WebGL2 unavailable in this browser."));
          return;
        }
        const prog = gl.createProgram()!;
        gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          reject(new Error(gl.getProgramInfoLog(prog) ?? "link failed"));
          return;
        }
        gl.useProgram(prog);

        const sprites = makeSprites(n, w, h);
        const corners = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        const cornerBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
        gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
        const aCorner = gl.getAttribLocation(prog, "a_corner");
        gl.enableVertexAttribArray(aCorner);
        gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

        const offsets = new Float32Array(n * 2);
        const offsetBuf = gl.createBuffer();
        const aOffset = gl.getAttribLocation(prog, "a_offset");
        gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuf);
        gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aOffset);
        gl.vertexAttribPointer(aOffset, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(aOffset, 1);

        const hues = new Float32Array(sprites.map((s) => s.hue));
        const hueBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, hueBuf);
        gl.bufferData(gl.ARRAY_BUFFER, hues, gl.STATIC_DRAW);
        const aHue = gl.getAttribLocation(prog, "a_hue");
        gl.enableVertexAttribArray(aHue);
        gl.vertexAttribPointer(aHue, 1, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(aHue, 1);

        gl.uniform2f(gl.getUniformLocation(prog, "u_res"), w, h);
        gl.uniform1f(gl.getUniformLocation(prog, "u_size"), 34);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const frameTimes: number[] = [];
        let last = performance.now();
        const started = last;
        const tick = (now: number) => {
          const dt = (now - last) / 1000;
          if (now - started > WARMUP_MS) frameTimes.push(now - last);
          last = now;
          step(sprites, Math.min(dt, 0.05), w, h);
          for (let i = 0; i < n; i++) {
            offsets[i * 2] = sprites[i].x;
            offsets[i * 2 + 1] = sprites[i].y;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
          if (now - started < WARMUP_MS + SAMPLE_MS) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            gl.clear(gl.COLOR_BUFFER_BIT);
            resolve(summarise("WebGL2 instanced quads", n, frameTimes));
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      }),
    [],
  );

  const run = useCallback(async () => {
    setError(null);
    setResults([]);
    try {
      setPhase("dom");
      const dom = await runDom(count);
      setResults([dom]);
      setPhase("webgl");
      const webgl = await runWebgl(count);
      setResults([dom, webgl]);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("done");
    }
  }, [count, runDom, runWebgl]);

  useEffect(() => stopRaf, []);

  return (
    <div className="bench">
      <header>
        <h1>Renderer head-to-head</h1>
        <p>
          Same workload both ways: <b>{count}</b> sprites, every one repositioned every frame, {SAMPLE_MS / 1000}s
          sample after an {WARMUP_MS}ms warmup. This is the pessimistic case — in the real scene the
          nodes are static and only the container scrolls.
        </p>
      </header>

      <div className="bench__controls">
        <label>
          Sprites
          <input
            type="range"
            min={50}
            max={2000}
            step={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={phase === "dom" || phase === "webgl"}
          />
          <b>{count}</b>
        </label>
        <button onClick={run} disabled={phase === "dom" || phase === "webgl"}>
          {phase === "dom" ? "Running DOM…" : phase === "webgl" ? "Running WebGL…" : "Run benchmark"}
        </button>
        <a href="#" onClick={() => (window.location.hash = "")}>
          ← back to the map
        </a>
      </div>

      <div className="bench__stages">
        <div className={`bench__stage${phase === "dom" ? " is-active" : ""}`}>
          <h2>Layered DOM / CSS</h2>
          <div className="bench__host" ref={domHostRef} />
        </div>
        <div className={`bench__stage${phase === "webgl" ? " is-active" : ""}`}>
          <h2>WebGL2 instanced</h2>
          <canvas className="bench__host" ref={canvasRef} />
        </div>
      </div>

      {error && <p className="bench__error">{error}</p>}

      {results.length > 0 && (
        <table className="bench__results">
          <thead>
            <tr>
              <th>Renderer</th>
              <th>Sprites</th>
              <th>Avg FPS</th>
              <th>p95 frame</th>
              <th>Frames</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.count}</td>
                <td>{r.avgFps.toFixed(1)}</td>
                <td>{r.p95FrameMs.toFixed(1)} ms</td>
                <td>{r.frames}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="bench__note">
        <p>
          <b>Read this with the caveat.</b> Raw fill rate is one input, and both renderers will sit
          at the display refresh rate until the scene is far larger than this tool will ever be. What
          the numbers cannot show is the rest of the bill: over a canvas, every text label, hover
          target, focus ring, keyboard path and screen-reader name has to be rebuilt by hand, and the
          detail panel still needs DOM anyway. The scene ships on DOM for that reason — see
          docs/DECISIONS.md.
        </p>
      </footer>
    </div>
  );
}
