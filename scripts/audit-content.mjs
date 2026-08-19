#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Content verification audit — pass 2 of the two-pass content pipeline.
//
// Run:  node scripts/audit-content.mjs          (report only)
//       node scripts/audit-content.mjs --write  (also stamp data/assets/*.json)
//
// The bar, per docs/CONTENT_PIPELINE.md:
//   verified                 ≥2 INDEPENDENT named sources
//   sourced_low_confidence    1 named source
//   unverified                0 named sources — general knowledge only
//
// "Independent" is the whole point and is where this is stricter than a
// naive link count:
//   • Sources are grouped by registrable host, so three links to one outlet
//     count once.
//   • Wikimedia Commons file pages are EXCLUDED entirely. Pass 4 added those
//     as photo credits, not as evidence for a range or a unit cost, and
//     letting an image credit promote an asset to "verified" would be the
//     exact dishonesty this bar exists to prevent.
//   • Wikipedia is counted (it is named and independent of a trade outlet)
//     but tracked separately, so an asset resting only on Wikipedia is
//     reported as tertiary-only rather than quietly passing.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "data/assets";
const WRITE = process.argv.includes("--write");

/** Hosts that credit an image rather than evidence a claim. */
const IMAGE_CREDIT_HOSTS = new Set(["commons.wikimedia.org", "upload.wikimedia.org"]);
/** Tertiary references — counted, but an asset resting only on these is flagged. */
const TERTIARY_HOSTS = new Set(["en.wikipedia.org", "wikipedia.org", "military-history.fandom.com"]);

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function classify(asset) {
  const sources = Array.isArray(asset.sources) ? asset.sources : [];
  const named = sources.filter((s) => s && typeof s.url === "string" && s.url.trim() !== "");

  const evidenceHosts = new Set();
  const imageHosts = new Set();
  for (const s of named) {
    const h = host(s.url);
    if (!h) continue;
    if (IMAGE_CREDIT_HOSTS.has(h)) imageHosts.add(h);
    else evidenceHosts.add(h);
  }

  const independent = evidenceHosts.size;
  const tertiaryOnly = independent > 0 && [...evidenceHosts].every((h) => TERTIARY_HOSTS.has(h));

  let status;
  if (independent >= 2) status = "verified";
  else if (independent === 1) status = "sourced_low_confidence";
  else status = "unverified";

  const notes = [];
  if (tertiaryOnly) notes.push("Rests only on tertiary reference works; wants a primary or trade source.");
  if (imageHosts.size > 0 && independent === 0) {
    notes.push("Only sources are image credits — they evidence the photo, not the specifications.");
  }
  if (status === "unverified") {
    notes.push("Written from doctrine.md and general knowledge; no per-asset citation yet.");
  }
  const costConfidence = asset?.cost?.confidence;
  if (status === "verified" && costConfidence === "estimated") {
    notes.push("Specs meet the bar but the unit cost is an estimate — cost is not verified.");
  }

  return {
    status,
    independent_sources: independent,
    image_credit_sources: imageHosts.size,
    tertiary_only: tertiaryOnly,
    hosts: [...evidenceHosts].sort(),
    notes,
  };
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const results = [];

for (const f of files) {
  const path = join(DIR, f);
  const asset = JSON.parse(readFileSync(path, "utf8"));
  const v = classify(asset);
  results.push({ file: f, id: asset.id, name: asset.name, ...v });

  if (WRITE) {
    asset.verification = {
      status: v.status,
      independent_sources: v.independent_sources,
      last_audit: new Date().toISOString().slice(0, 10),
      notes: v.notes,
    };
    writeFileSync(path, JSON.stringify(asset, null, 2) + "\n");
  }
}

const by = (s) => results.filter((r) => r.status === s);
const pad = (s, n) => String(s).padEnd(n);

console.log("\nCONTENT VERIFICATION AUDIT");
console.log("=".repeat(78));
for (const status of ["verified", "sourced_low_confidence", "unverified"]) {
  const rows = by(status);
  console.log(`\n${status.toUpperCase()}  (${rows.length})`);
  for (const r of rows) {
    const flag = r.tertiary_only ? " [tertiary-only]" : "";
    console.log(`  ${pad(r.id, 46)} ${r.independent_sources} indep${flag}`);
    for (const n of r.notes) console.log(`      · ${n}`);
  }
}
console.log("\n" + "=".repeat(78));
console.log(
  `TOTAL ${results.length}   verified ${by("verified").length}   ` +
    `low-confidence ${by("sourced_low_confidence").length}   unverified ${by("unverified").length}`,
);
console.log(WRITE ? "Stamped `verification` into every asset file." : "Report only — pass --write to stamp files.");
