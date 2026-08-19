#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Export the current equipment roster as flat sourcing worksheets.
//
// Purpose: hand a human (or an outsourced modeller/researcher) a list of
// every real-world system this repo currently depicts, so 3D models and
// photographs can be sourced against it. Everything is derived from the
// live data — data/assets/*.json, data/catalog/*.json, the hero-model
// registry in src/three/models.ts and the Pass 16 sourcing manifest — so
// re-running after a content pass produces an up-to-date worksheet rather
// than a stale snapshot.
//
//   node scripts/export-equipment-list.mjs [--out=exports]
//
// Writes (all derived, safe to delete and regenerate):
//   <out>/equipment-ukraine.csv     side_a roster, one row per asset
//   <out>/equipment-russia.csv      side_b roster
//   <out>/equipment-all.csv         both sides, with the side column
//   <out>/reference-systems.csv     data/catalog swap-target systems
//   <out>/equipment-export.json     the same rows, machine-readable
//   <out>/EQUIPMENT_SOURCING.md     human-readable checklist by side/group
//
// No dependencies by design (matches scripts/audit-content.mjs). The
// spreadsheet build is a separate, optional step — scripts/export-
// equipment-xlsx.py, which needs openpyxl.
// ─────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT = path.resolve(ROOT, outArg ? outArg.slice("--out=".length) : "exports");

// ── side labels ─────────────────────────────────────────────────────────
// Mirrors src/config/ui.ts. The data layer only knows side_a/side_b; the
// Ukraine/Russia labelling is presentation, and an export is presentation.
const SIDE_LABEL = { side_a: "Ukraine", side_b: "Russia" };
const SIDE_CODE = { side_a: "UA", side_b: "RU" };

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ── inputs ──────────────────────────────────────────────────────────────
const assets = fs
  .readdirSync(path.join(ROOT, "data/assets"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => readJson(path.join(ROOT, "data/assets", f)));

const groupLabels = Object.fromEntries(
  readJson(path.join(ROOT, "data/groups.json")).map((g) => [g.id, g.label]),
);

/** Hero-tier 3D geometry already authored in src/three/models.ts. Parsed out
 *  of the source rather than duplicated here, so the list can't drift. */
function heroAssetIds() {
  const src = fs.readFileSync(path.join(ROOT, "src/three/models.ts"), "utf8");
  const block = src.slice(src.indexOf("const HERO_BUILDERS"));
  const body = block.slice(block.indexOf("{"), block.indexOf("};") + 1);
  return new Set([...body.matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]));
}
const HERO = heroAssetIds();

/** Pass 16's sourcing manifest, if the JSON twin is present. */
function priorManifest() {
  const p = path.join(ROOT, "docs/3d-model-sourcing-manifest.json");
  if (!fs.existsSync(p)) return [];
  return readJson(p).rows ?? [];
}
const MANIFEST = priorManifest();

// ── matching the roster against the prior manifest ──────────────────────
// The manifest was written against an earlier spreadsheet, not against
// data/assets, so ids don't line up — match on name text instead. Anything
// below the threshold is reported as unmatched rather than guessed at.
const STOP = new Set(["the", "a", "of", "and", "system", "vehicle", "3d", "model"]);
const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const tokens = (s) => new Set(norm(s).split(" ").filter((t) => t && !STOP.has(t)));

function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  // Containment-weighted rather than plain Jaccard: "T-72 (various
  // modernized variants)" should still match "T-72B3 / T-72B3M".
  return shared / Math.min(A.size, B.size);
}

/** Two roster entries name the same system the manifest does, but worded
 *  differently enough that no safe similarity threshold catches them.
 *  Pinned by asset id rather than by loosening the threshold, which would
 *  start producing wrong matches elsewhere in the armour rows. */
const MANIFEST_ALIASES = {
  "side_a-armor-leopard2": "Leopard 2 (A4/A6)",
  "side_b-uav-strike-lancet": "Lancet (Izdelie-52)",
};

function matchManifest(asset) {
  const wanted = SIDE_CODE[asset.side];
  const alias = MANIFEST_ALIASES[asset.id];
  if (alias) {
    const row = MANIFEST.find((r) => r["Asset Name"] === alias && r.Side === wanted);
    if (row) return { row, score: 1 };
  }
  let best = null;
  let bestScore = 0;
  for (const row of MANIFEST) {
    if (row.Side && row.Side !== wanted) continue;
    const score = Math.max(
      similarity(asset.name, row["Asset Name"]),
      similarity(asset.representative_system, row["Asset Name"]) * 0.95,
    );
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return bestScore >= 0.6 ? { row: best, score: bestScore } : null;
}

// ── is this a real piece of hardware, or a composite/place? ─────────────
// Roughly a fifth of the roster is a concept (a logistics point, a grid
// node, "the first link in the evacuation chain"). Those need reference
// photography of a *type*, not a model of a named system — worth flagging
// so sourcing effort doesn't get spent hunting for a system that has no
// single real-world referent.
const COMPOSITE_RE = /\bcomposite\b|\bgeneric\b|not a named/i;
const kindOf = (a) =>
  COMPOSITE_RE.test(a.representative_system || "") ? "composite/site" : "platform";

// ── what an asset's icon_image actually points at ───────────────────────
// Most of the roster carries a `/icons/<slug>.png` path minted by the Asset
// Editor (src/components/AssetEditorPanel.tsx) for a file that was never
// created — there is no public/icons/ in the repo. Nothing breaks today
// because the map glyph comes from the authored SVG set in
// src/icons/registry.tsx and never reads icon_image, but for a sourcing
// pass the distinction matters: a placeholder path is a picture that does
// not exist, not a picture already in hand.
function iconStatus(asset) {
  const src = asset.icon_image ?? "";
  if (!src) return "none";
  if (/^https?:/i.test(src)) return "external url";
  const onDisk = ["public", "static", "assets"].some((dir) =>
    fs.existsSync(path.join(ROOT, dir, src.replace(/^\//, ""))),
  );
  return onDisk ? "local file present" : "local placeholder — file not in repo";
}

// ── rows ────────────────────────────────────────────────────────────────
const rows = assets
  .map((a) => {
    const m = matchManifest(a);
    return {
      asset_id: a.id,
      side: SIDE_LABEL[a.side] ?? a.side,
      side_code: SIDE_CODE[a.side] ?? a.side,
      name: a.name,
      representative_system: a.representative_system ?? "",
      kind: kindOf(a),
      group: groupLabels[a.group] ?? a.group,
      category: a.category ?? "",
      comparison_group: a.comparison_group ?? "",
      platform_domain: a.platform_domain ?? "",
      engagement_domain: a.domain ?? "",
      echelon: a.echelon ?? "",
      short_role: a.short_role ?? "",
      has_hero_3d_model: HERO.has(a.id) ? "yes" : "no",
      current_icon_image: a.icon_image ?? "",
      icon_image_status: iconStatus(a),
      current_gallery_images: (a.gallery_images ?? []).join(" | "),
      gallery_image_count: (a.gallery_images ?? []).length,
      prior_3d_tier: m?.row["3D Model Tier"] ?? "",
      prior_sourcing_status: m?.row["Sourcing Status"] ?? "",
      prior_model_source: m?.row["Primary Source (Sketchfab unless noted)"] ?? "",
      prior_model_license: m?.row["License / Cost"] ?? "",
      prior_model_notes: m?.row["Notes"] ?? "",
      prior_manifest_match: m ? m.row["Asset Name"] : "",
      reference_links: (a.sources ?? [])
        .map((s) => s.url)
        .filter(Boolean)
        .slice(0, 3)
        .join(" | "),
      // Blank columns for whoever does the sourcing to fill in.
      found_model_url: "",
      found_model_license: "",
      found_model_poly_count: "",
      found_image_urls: "",
      found_image_license: "",
      sourcing_notes: "",
    };
  })
  .sort(
    (x, y) =>
      x.side.localeCompare(y.side) ||
      x.group.localeCompare(y.group) ||
      x.name.localeCompare(y.name),
  );

// ── catalog swap-target systems ─────────────────────────────────────────
// data/catalog/*.json is the per-asset "compare this slot against a
// different real system" dropdown. Those systems are shown in the UI too,
// so they need pictures even though they have no asset file.
const catalogRows = [];
for (const file of fs.readdirSync(path.join(ROOT, "data/catalog")).filter((f) => f.endsWith(".json"))) {
  const cat = readJson(path.join(ROOT, "data/catalog", file));
  for (const e of cat.equipment ?? []) {
    const cost = e.unit_cost_usd ?? {};
    catalogRows.push({
      catalog_id: e.id,
      country: cat.country ?? "",
      name: e.name,
      category: e.category ?? "",
      comparison_group: e.comparison_group ?? "",
      domain: e.domain ?? "",
      manufacturer: e.manufacturer ?? "",
      country_of_origin: e.country_of_origin ?? "",
      in_service_since: e.in_service_since ?? "",
      unit_cost_usd:
        cost.min || cost.max ? `${cost.min ?? ""}${cost.max && cost.max !== cost.min ? `–${cost.max}` : ""}` : "",
      wikipedia: e.wikipedia ?? "",
      source_file: `data/catalog/${file}`,
      found_model_url: "",
      found_image_urls: "",
      sourcing_notes: "",
    });
  }
}
catalogRows.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

// ── writers ─────────────────────────────────────────────────────────────
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (list) => {
  if (!list.length) return "";
  const cols = Object.keys(list[0]);
  return [cols.join(","), ...list.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
};

fs.mkdirSync(OUT, { recursive: true });
const write = (name, body) => {
  fs.writeFileSync(path.join(OUT, name), body);
  console.log(`  ${path.relative(ROOT, path.join(OUT, name))}`);
};

const ua = rows.filter((r) => r.side_code === "UA");
const ru = rows.filter((r) => r.side_code === "RU");

console.log(`Exporting ${rows.length} assets (${ua.length} Ukraine, ${ru.length} Russia) + ${catalogRows.length} catalog systems`);
write("equipment-ukraine.csv", toCsv(ua));
write("equipment-russia.csv", toCsv(ru));
write("equipment-all.csv", toCsv(rows));
write("reference-systems.csv", toCsv(catalogRows));
write(
  "equipment-export.json",
  JSON.stringify(
    {
      generated_from: "data/assets/*.json + data/catalog/*.json + src/three/models.ts",
      generator: "scripts/export-equipment-list.mjs",
      counts: { assets: rows.length, ukraine: ua.length, russia: ru.length, catalog_systems: catalogRows.length },
      assets: rows,
      catalog_systems: catalogRows,
    },
    null,
    2,
  ) + "\n",
);

// ── markdown checklist ──────────────────────────────────────────────────
function markdown() {
  const out = [];
  out.push("# Equipment sourcing list — 3D models & imagery");
  out.push("");
  out.push(
    "Generated by `node scripts/export-equipment-list.mjs` from the live roster " +
      "(`data/assets/*.json`, `data/catalog/*.json`) — regenerate rather than hand-edit.",
  );
  out.push("");
  out.push(
    `**${rows.length} assets** — ${ua.length} Ukraine, ${ru.length} Russia — plus ` +
      `**${catalogRows.length} catalog comparison systems**. ` +
      `${rows.filter((r) => r.has_hero_3d_model === "yes").length} assets already have hero-tier authored geometry; ` +
      `${rows.filter((r) => r.kind === "composite/site").length} are composites/places rather than named systems ` +
      "(source reference photography of the type, not a model of a specific system).",
  );
  out.push("");
  out.push(
    "Search on **Representative system**, not the display name — the display name is " +
      "sometimes a role (\"Point of Injury\") while the representative system names the real hardware.",
  );
  out.push("");
  out.push("Legend: 🧊 authored hero model already in `src/three/models.ts` · 🧱 composite/site, no single real system · ✅/⚠️/❌ Pass 16 manifest status (sourced / verify / no free source).");
  out.push("");

  for (const [label, list] of [["Ukraine", ua], ["Russia", ru]]) {
    out.push(`## ${label} (${list.length})`);
    out.push("");
    const groups = [...new Set(list.map((r) => r.group))].sort();
    for (const g of groups) {
      const inGroup = list.filter((r) => r.group === g);
      out.push(`### ${g} (${inGroup.length})`);
      out.push("");
      out.push("| Asset | Representative system | Flags | Prior sourcing | Current image |");
      out.push("|---|---|---|---|---|");
      for (const r of inGroup) {
        const flags = [
          r.has_hero_3d_model === "yes" ? "🧊" : "",
          r.kind === "composite/site" ? "🧱" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const status = r.prior_sourcing_status;
        const icon =
          status === "Sourced" ? "✅" : status === "Weak / Verify" ? "⚠️" : status === "No free source" ? "❌" : "";
        const prior = status
          ? `${icon} ${status}${r.prior_model_source ? ` — ${r.prior_model_source}` : ""}${r.prior_model_license ? ` (${r.prior_model_license})` : ""}`
          : "—";
        out.push(
          `| **${r.name}** | ${r.representative_system || "—"} | ${flags || "—"} | ${prior} | ${r.current_icon_image ? `[icon](${r.current_icon_image})` : "—"} |`,
        );
      }
      out.push("");
    }
  }

  out.push("## Catalog comparison systems");
  out.push("");
  out.push(
    "Swap-target systems from `data/catalog/*.json` — shown in the per-asset comparison " +
      "dropdown, so they need imagery too. No asset file, no icon today.",
  );
  out.push("");
  for (const country of [...new Set(catalogRows.map((r) => r.country))]) {
    const list = catalogRows.filter((r) => r.country === country);
    out.push(`### ${country} (${list.length})`);
    out.push("");
    out.push("| System | Category | Manufacturer | Reference |");
    out.push("|---|---|---|---|");
    for (const r of list) {
      out.push(
        `| **${r.name}** | ${r.category || "—"} | ${r.manufacturer || "—"} | ${r.wikipedia ? `[wikipedia](${r.wikipedia})` : "—"} |`,
      );
    }
    out.push("");
  }

  const gaps = rows.filter((r) => r.kind === "platform" && !r.prior_sourcing_status);
  const noFree = rows.filter((r) => r.prior_sourcing_status === "No free source");
  const verify = rows.filter((r) => r.prior_sourcing_status === "Weak / Verify");

  out.push("## Where the work actually is");
  out.push("");
  out.push(
    `- **${gaps.length} named systems have no row in the Pass 16 manifest at all** — never searched, ` +
      "not \"searched and found nothing\". Start here.",
  );
  out.push("");
  for (const r of gaps) out.push(`  - ${r.side_code} · ${r.name} — ${r.representative_system}`);
  out.push("");
  out.push(`- **${noFree.length} were searched and had no free model source** — these need a paid licence or a commission:`);
  out.push("");
  for (const r of noFree) out.push(`  - ${r.side_code} · ${r.name}${r.prior_model_license ? ` (${r.prior_model_license})` : ""}`);
  out.push("");
  out.push(`- **${verify.length} have a candidate whose licence or exact variant was never verified:**`);
  out.push("");
  for (const r of verify) out.push(`  - ${r.side_code} · ${r.name} — ${r.prior_model_source || "see notes"}`);
  out.push("");
  const placeholderIcons = rows.filter((r) => r.icon_image_status.startsWith("local placeholder"));
  const realIcons = rows.filter((r) => r.icon_image_status === "external url");
  out.push(
    "- **Imagery is close to greenfield.** Every asset carries an `icon_image` value, but " +
      `${placeholderIcons.length} of them are \`/icons/<slug>.png\` placeholder paths minted by the Asset ` +
      "Editor for files that don't exist (there is no `public/icons/` in this repo). Only " +
      `${realIcons.length} point at a real image — Wikimedia Commons \`Special:FilePath\` links — and only ` +
      `${rows.filter((r) => r.gallery_image_count > 0).length} assets have any gallery image at all. The ` +
      "catalog comparison systems have none.",
  );
  out.push("");
  out.push(
    "  Note where a sourced photo actually lands: the map glyph is the authored SVG set in " +
      "`src/icons/registry.tsx`, which deliberately never reads `icon_image` (a photo is unreadable at " +
      "32–44 px — see that file's header). Photographs earn their place in `gallery_images`, which the " +
      "detail panel renders.",
  );
  out.push("");
  out.push("## Licensing constraints that apply to anything sourced here");
  out.push("");
  out.push(
    "- **Binary assets can't be fetched from an agent session** — this environment's egress " +
      "proxy blocks them, so a downloaded model would be a license assumed rather than read. " +
      "Sourced models/images need a human to download and check the licence. See `CLAUDE.md`.",
  );
  out.push(
    "- **Anything sourced must carry attribution** in the app where it's rendered — the same " +
      "obligation `data/osm/` already carries for OpenStreetMap (ODbL).",
  );
  out.push(
    "- **CC BY-NC-ND models are a trap** for anything that might be reused commercially — the " +
      "Pass 16 manifest flags at least one (Shahed-136).",
  );
  out.push(
    "- Imported geometry still has to meet `docs/MODEL_STYLE_GUIDE.md` (proportions, poly " +
      "budget, palette) — a 190k-tri Orlan-10 needs decimating before it goes near the map view.",
  );
  out.push("");
  return out.join("\n");
}
write("EQUIPMENT_SOURCING.md", markdown());
