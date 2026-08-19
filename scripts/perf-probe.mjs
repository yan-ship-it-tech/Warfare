// ─────────────────────────────────────────────────────────────────────────
// Repeatable frame-time / draw-call probe for the 3D view.
//
// Pass 13's whole premise is that "sluggish" has to become a number, and a
// number nobody can reproduce is barely better than an adjective — so the
// gesture sequence lives here rather than in a session's scrollback. Runs
// the same scripted idle / orbit / pan / zoom passes every time and prints
// what src/three/perfHud.ts measured for each.
//
//   npm run preview -- --port 4173 &
//   node scripts/perf-probe.mjs [--url=http://localhost:4173/Warfare/] [--json]
//
// SwiftShader, not a GPU: the absolute numbers are a software rasteriser's,
// so they are only ever compared against another run of this same script on
// this same machine. That is exactly what a before/after needs.
// ─────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const BASE = arg("url", "http://localhost:4173/Warfare/");
const asJson = args.includes("--json");
const LABEL = arg("label", "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`${BASE}?perf=1`, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__warfarePerf, null, { timeout: 60_000 });
// Terrain, props and 90 asset groups all build on first frames — let that
// settle before measuring, or the baseline is really a measure of startup.
await sleep(3000);

const box = await page.locator(".scene3d__mount").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

async function measure(name, gesture, ms = 4000) {
  await page.evaluate(() => window.__warfarePerf.reset());
  const done = gesture();
  await sleep(ms);
  await done;
  const s = await page.evaluate(() => window.__warfarePerf.sample());
  return { name, ...s };
}

const results = [];

results.push(await measure("idle", async () => {}));

results.push(
  await measure("orbit-drag", async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 60; i++) {
      await page.mouse.move(cx + Math.sin(i / 9) * 320, cy + Math.cos(i / 13) * 90);
      await sleep(16);
    }
    await page.mouse.up();
  }),
);

results.push(
  await measure("pan-drag", async () => {
    await page.keyboard.down("Shift");
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "right" });
    for (let i = 0; i < 60; i++) {
      await page.mouse.move(cx + Math.sin(i / 7) * 380, cy + 40);
      await sleep(16);
    }
    await page.mouse.up({ button: "right" });
    await page.keyboard.up("Shift");
  }),
);

results.push(
  await measure("zoom-wheel", async () => {
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, i % 20 < 10 ? 220 : -220);
      await sleep(45);
    }
  }),
);

// Selecting an asset opens the detail panel, which narrows the canvas and
// forces a renderer resize + framebuffer reallocation. Measured separately
// from the drag so the two costs don't hide inside one number.
results.push(
  await measure(
    "click-select",
    async () => {
      const pin = page.locator(".pin3d:not(.is-hidden):not(.is-collapsed)").first();
      await pin.click();
    },
    4000,
  ),
);

// Dropping an asset rewrites the overrides store, which rebuilds every asset
// group in the scene — the one interaction that is a rebuild rather than a
// redraw, and therefore the most likely source of a visible freeze.
results.push(
  await measure(
    "drag-drop",
    async () => {
      const pin = page.locator(".pin3d:not(.is-hidden):not(.is-collapsed)").first();
      const b = await pin.boundingBox();
      if (!b) return;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 20; i++) {
        await page.mouse.move(b.x + b.width / 2 - i * 6, b.y + b.height / 2 + i);
        await sleep(16);
      }
      await page.mouse.up();
    },
    5000,
  ),
);

await browser.close();

if (asJson) {
  console.log(JSON.stringify({ label: LABEL, url: BASE, results, consoleErrors }, null, 2));
} else {
  const f = (v, d = 1) => Number(v).toFixed(d);
  console.log(LABEL ? `\n== ${LABEL} ==` : "");
  console.log(
    ["pass", "fps", "frm avg", "p95", "max", "cpu avg", "p95", "max", "hitch%", "draws", "tris", "lbl F/D/H", "react/s"]
      .map((h, i) => (i === 0 ? h.padEnd(11) : h.padStart(9)))
      .join(""),
  );
  for (const r of results) {
    console.log(
      [
        r.name.padEnd(11),
        f(r.fps).padStart(9),
        f(r.frameAvgMs).padStart(9),
        f(r.frameP95Ms).padStart(9),
        f(r.frameWorstMs).padStart(9),
        f(r.cpuAvgMs).padStart(9),
        f(r.cpuP95Ms).padStart(9),
        f(r.cpuWorstMs).padStart(9),
        f(r.hitchPct).padStart(9),
        String(r.calls).padStart(9),
        `${f(r.triangles / 1000)}k`.padStart(9),
        `${r.labelsFull}/${r.labelsDot}/${r.labelsHidden}`.padStart(9),
        f(r.reactCommitsPerSec).padStart(9),
      ].join(""),
    );
  }
  if (consoleErrors.length) {
    console.log(`\n${consoleErrors.length} console error(s):`);
    for (const e of consoleErrors.slice(0, 8)) console.log(`  ${e}`);
  }
}
