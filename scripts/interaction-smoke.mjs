// ─────────────────────────────────────────────────────────────────────────
// Interaction smoke pass for the 3D view.
//
// Pass 11 found two real drag bugs that code review had missed, and Pass 13
// found three more the same way — every one of them only reproduces under an
// actual pointer gesture with real timings, not under a synthetic click().
// So the gestures live in a script rather than in a session's scrollback.
//
//   npm run build && npm run preview -- --port 4173 &
//   node scripts/interaction-smoke.mjs [--url=...] [--headed]
//
// Exits non-zero if any check fails. Not a unit-test framework and not
// pretending to be one — this is the "verify it in a browser" step every pass
// in docs/DECISIONS.md already did, made repeatable.
// ─────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("url", "http://localhost:4173/Warfare/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  headless: !args.includes("--headed"),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".pin3d:not(.is-hidden)", { timeout: 60_000 });
await sleep(2500);

const titled = () => page.locator(".pin3d:not(.is-hidden):not(.is-collapsed)");

// ── 1. labels are thinned, not all-on ──────────────────────────────────
{
  const total = await page.locator(".pin3d").count();
  const shown = await titled().count();
  check(
    "labels are decluttered, not all rendered",
    total > 40 && shown > 0 && shown <= 24,
    `${shown} titled of ${total} pins`,
  );
}

// ── 2. a tap on a pin selects it (and does NOT need a perfect zero-px click)
{
  const pin = titled().first();
  const name = (await pin.locator(".pin3d__name").textContent())?.trim();
  const box = await pin.boundingBox();
  // Deliberately jittered by a few px between down and up — a real finger or
  // a real mouse never releases on the exact pixel it pressed, and the old
  // 4 px drag threshold turned that into a failed drag instead of a tap.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(40);
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 2);
  await sleep(40);
  await page.mouse.up();
  await sleep(700);
  const open = await page.locator(".detail").count();
  const heading = open ? (await page.locator(".detail h2").first().textContent())?.trim() : "";
  check("jittered tap on a pin opens its detail panel", open === 1, `${name} -> ${heading}`);
}

// ── 3. z-order: the detail panel is above every pin ────────────────────
{
  const panel = await page.locator(".detail").boundingBox();
  // A point well inside the panel must hit the panel, not a pin drawn over it.
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { tag: el?.tagName, cls: el?.className?.toString?.() ?? "", inPanel: !!el?.closest(".detail") };
    },
    [panel.x + panel.width / 2, panel.y + 220],
  );
  check("detail panel draws above the pins", hit.inPanel, `${hit.tag}.${hit.cls}`);
}

await page.keyboard.press("Escape");
await sleep(500);

// ── 4. a real drag moves the asset and writes a new distance ───────────
{
  const pin = titled().first();
  const name = (await pin.locator(".pin3d__name").textContent())?.trim();
  const kmBefore = (await pin.locator(".pin3d__km").textContent())?.trim();
  const box = await pin.boundingBox();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Slow, many-step travel: the shape of gesture that used to be classified
  // as a tap because it never crossed 4 px between two consecutive moves.
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(sx - i * 7, sy + i * 1.5);
    await sleep(14);
  }
  await sleep(80);
  await page.mouse.up();
  await sleep(900);

  const kmAfter = await page.evaluate((n) => {
    const el = [...document.querySelectorAll(".pin3d")].find(
      (p) => p.querySelector(".pin3d__name")?.textContent?.trim() === n,
    );
    return el?.querySelector(".pin3d__km")?.textContent?.trim() ?? null;
  }, name);
  check("a slow drag repositions the asset", !!kmAfter && kmAfter !== kmBefore, `${name}: ${kmBefore} -> ${kmAfter}`);

  // The camera must still respond after the drag — the old code could leave
  // OrbitControls disabled and never re-enable it, which read as a freeze.
  const before = await page.evaluate(() => document.querySelector(".pin3d:not(.is-hidden)")?.style.transform ?? "");
  await page.mouse.move(720, 480);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(720 + i * 12, 480 + i * 2);
  await page.mouse.up();
  await sleep(600);
  const after = await page.evaluate(() => document.querySelector(".pin3d:not(.is-hidden)")?.style.transform ?? "");
  check("camera still orbits after a drag (controls re-enabled)", before !== after);
}

// ── 4b. a long press with no movement is a cancelled drag, not a tap ───
{
  await page.keyboard.press("Escape");
  await sleep(600);
  const pin = titled().first();
  const name = (await pin.locator(".pin3d__name").textContent())?.trim();
  const box = await pin.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(1000); // past TAP_MAX_MS, and past the hold that arms the drag
  await page.mouse.up();
  await sleep(700);
  const open = await page.locator(".detail").count();
  check("a long press with no movement selects nothing", open === 0, `held 1000 ms on ${name}`);
  // ...and the camera is not left frozen by the cancelled gesture.
  const before = await page.evaluate(() => document.querySelector(".pin3d:not(.is-hidden)")?.style.transform ?? "");
  await page.mouse.move(700, 470);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(700 + i * 12, 470 + i * 2);
  await page.mouse.up();
  await sleep(600);
  const after = await page.evaluate(() => document.querySelector(".pin3d:not(.is-hidden)")?.style.transform ?? "");
  check("camera still orbits after a cancelled drag", before !== after);
}

// ── 5. ruler exists, and its tick spacing is genuinely non-uniform ─────
{
  const gaps = await page.evaluate(() => {
    const xs = [...document.querySelectorAll(".scene3d__ruler-tick:not(.is-off)")]
      .map((el) => {
        const m = /translate3d\(([-\d.]+)px/.exec(el.style.transform || "");
        return m ? parseFloat(m[1]) : null;
      })
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    const d = [];
    for (let i = 1; i < xs.length; i++) d.push(xs[i] - xs[i - 1]);
    return d;
  });
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  check("distance ruler is present", gaps.length > 10, `${gaps.length + 1} ticks on screen`);
  check(
    "ruler tick spacing is non-uniform (shows band compression)",
    gaps.length > 10 && max / Math.max(min, 0.5) > 3,
    `gap ${min.toFixed(1)}–${max.toFixed(1)} px`,
  );
}

// ── 6. header side labels follow the camera azimuth ────────────────────
{
  // Fresh load: the checks above have already moved the camera, and this one
  // is about the transition, so it needs a known starting azimuth.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".pin3d:not(.is-hidden)", { timeout: 60_000 });
  await sleep(2500);

  const read = () =>
    page.evaluate(() => ({
      sides: [...document.querySelectorAll(".scene3d__side")].map((e) => e.textContent.trim()),
      legend: document.querySelector(".legend__sides")?.textContent?.trim() ?? "",
      rulerHidden: !!document.querySelector(".scene3d__ruler")?.classList.contains("is-degenerate"),
    }));
  const before = await read();
  check(
    "default framing reads side_a left / side_b right",
    before.sides[0].includes("Ukraine") && before.sides[1].includes("Russia"),
    before.sides.join(" | "),
  );

  // Orbit in ~44 degree steps and record what the labels say at each one.
  const seen = [before];
  let degenerateSeen = before.rulerHidden;
  for (let k = 0; k < 5; k++) {
    await page.mouse.move(720, 450);
    await page.mouse.down();
    for (let i = 1; i <= 25; i++) {
      await page.mouse.move(720 + i * 8, 450);
      await sleep(12);
    }
    await page.mouse.up();
    await sleep(700);
    const r = await read();
    seen.push(r);
    degenerateSeen = degenerateSeen || r.rulerHidden;
  }
  const flipped = seen.find((r) => r.sides[0].includes("Russia"));
  check(
    "scene side legend flips with camera azimuth",
    !!flipped,
    flipped ? `${before.sides.join(" | ")}  ->  ${flipped.sides.join(" | ")}` : "never flipped",
  );
  check(
    "map-info side line flips with camera azimuth",
    !!flipped && flipped.legend !== before.legend,
    flipped?.legend ?? "",
  );
  check(
    "ruler hides itself when the camera looks down the axis",
    degenerateSeen,
    "is-degenerate seen at an end-on azimuth",
  );
}

// ── 7. no runtime errors along the way ────────────────────────────────
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
