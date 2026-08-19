// ─────────────────────────────────────────────────────────────────────────
// Data loader. Reads /data exactly as the scaffold defines it:
//   bands.json      → distance bands
//   domains.json    → vertical domain lanes
//   data/assets/*.json → one asset per file (a new asset is a new file)
//   connections.json → flat dependency list mirroring per-asset connections
//   doctrine_markers.json → sourced depth findings overlaid on the ruler
//
// Adding an asset requires no code change: the glob below picks up any new
// file in data/assets/ on the next dev-server reload / build.
// ─────────────────────────────────────────────────────────────────────────
import type { Asset, ConnectionType, DistanceBand, Domain, DomainLayer, Side } from "../types";
import type {
  DataIssue,
  DoctrineMarker,
  GroupDef,
  LowerSkyControl,
  PendingStub,
  ResolvedConnection,
  WorldModel,
  Lesson,
} from "./model";
import { validateAsset } from "./validate";
import type { AssetOverride } from "../state/overridesState";

import bandsJson from "../../data/bands.json";
import domainsJson from "../../data/domains.json";
import groupsJson from "../../data/groups.json";
import connectionsJson from "../../data/connections.json";
import doctrineJson from "../../data/doctrine_markers.json";
import lessonsJson from "../../data/lessons.json";

const assetModules = import.meta.glob<{ default: unknown }>("../../data/assets/*.json", {
  eager: true,
});

/** Shipped defaults, exported so the bands editor can seed itself and offer
 *  a real "reset to defaults" rather than just clearing to nothing. */
export const DEFAULT_BANDS = bandsJson as DistanceBand[];

interface FlatConnection {
  source_id: string;
  target_id: string;
  type: ConnectionType;
  description: string;
}

const connKey = (s: string, t: string, ty: string) => `${s}→${t}:${ty}`;

// ── stub inference ───────────────────────────────────────────────────────
// A connection may point at an asset that has not been built yet. The scaffold
// documents this as intentional. Rather than dropping the edge, we synthesise a
// placeholder node from whatever the id slug tells us, and mark every inferred
// field so the UI can show it as provisional rather than authored.

/**
 * Token → domain, resolved left to right across the id slug. Order within the
 * id decides, which is what makes "c2-integrated-air-defense-network" a C2 node
 * rather than an air one: "c2" comes first and is the subject, "air-defense" is
 * a qualifier. A pure keyword scan gets that backwards.
 */
const DOMAIN_TOKENS: Record<string, Domain> = {
  uav: "air", drone: "air", fpv: "air", air: "air", aviation: "air",
  helicopter: "air", airfield: "air", cuas: "air",
  satellite: "space", satcom: "space", space: "space", pnt: "space",
  ew: "cyber_ew", jamming: "cyber_ew", jammer: "cyber_ew", sigint: "cyber_ew",
  cyber: "cyber_ew", spoofing: "cyber_ew",
  c2: "c2_comms", comms: "c2_comms", command: "c2_comms", network: "c2_comms",
  starlink: "c2_comms", radio: "c2_comms",
  logistics: "logistics", supply: "logistics", depot: "logistics",
  hub: "logistics", ammo: "logistics", fuel: "logistics", distribution: "logistics",
  medical: "medical", casevac: "medical", medevac: "medical", ccp: "medical",
  naval: "sea", maritime: "sea", sea: "sea", usv: "sea", fleet: "sea",
  armor: "land", armour: "land", artillery: "land", infantry: "land",
  tank: "land", ugv: "land", engineer: "land", fortification: "land",
};

const BAND_HINTS: [RegExp, string][] = [
  [/\b(tactical|zero|front|forward)\b/, "tactical"],
  [/\bop[-_]near\b/, "op_near"],
  [/\bop[-_]deep\b/, "op_deep"],
  [/\b(cross[-_]border|deep[-_]strategic)\b/, "deep_strategic"],
  [/\b(strategic|rear|national|deep[-_]rear)\b/, "strategic_rear"],
];

/** Domain acronyms that should stay uppercase in a generated stub label. */
const ACRONYMS = new Set([
  "uav", "ugv", "usv", "ew", "c2", "cp", "isr", "fpv", "cuas", "satcom", "pnt",
  "mlrs", "sam", "ccp", "hq", "id", "rf",
]);

function titleFromId(id: string): string {
  return id
    .replace(/^side_[ab]-/, "")
    .split("-")
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/** Representative distance for a band: 40% into it, capped so open-ended bands
 *  don't land at an absurd 50,000 km. */
function bandRepresentativeKm(band: DistanceBand): number {
  const span = band.max_km - band.min_km;
  return Math.round(band.min_km + Math.min(span * 0.4, 50));
}

function inferStub(
  targetId: string,
  referencingAsset: Asset | undefined,
  bands: DistanceBand[],
  domains: DomainLayer[],
): PendingStub {
  const slug = targetId.toLowerCase();

  const sideMatch = /^side_(a|b)-/.exec(slug);
  const side: Side = sideMatch
    ? (`side_${sideMatch[1]}` as Side)
    : (referencingAsset?.side ?? "side_a");

  const tokens = slug.replace(/^side_[ab]-/, "").replace(/_/g, "-").split("-");
  let domain: Domain | null = null;
  for (const token of tokens) {
    const hit = DOMAIN_TOKENS[token];
    if (hit) {
      domain = hit;
      break;
    }
  }
  const domainInferred = domain !== null;
  if (!domain) domain = domains.some((d) => d.id === "land") ? "land" : domains[0].id;

  let bandId: string | null = null;
  for (const [re, b] of BAND_HINTS) {
    if (re.test(slug.replace(/_/g, "-")) && bands.some((x) => x.id === b)) {
      bandId = b;
      break;
    }
  }
  const bandInferred = bandId !== null;
  if (!bandId) bandId = referencingAsset?.band_id ?? bands[0].id;
  const band = bands.find((b) => b.id === bandId) ?? bands[0];

  return {
    id: targetId,
    label: titleFromId(targetId),
    side,
    domain,
    band_id: band.id,
    distance_km_from_zero: bandRepresentativeKm(band),
    referenced_by: referencingAsset ? [referencingAsset.id] : [],
    inferred: { side: !sideMatch, domain: !domainInferred, band: !bandInferred },
  };
}

/**
 * @param bandsOverride  Live bands (from the in-app editor) to place assets
 *   against instead of the shipped defaults. Pass null/undefined to use
 *   bands.json as-is.
 * @param assetOverrides Per-asset local edits (distance / operating range)
 *   from the in-app placement editor, keyed by asset id. Applied before
 *   validation so a bad edit surfaces in Data health like any other issue.
 * @param customAssets Brand-new assets built from scratch in the Asset
 *   Editor page (src/components/AssetEditorPanel.tsx) — distinct from
 *   `assetOverrides`, which only patches a shipped asset. Run through the
 *   same `validateAsset` as every file in data/assets/, so a locally-added
 *   asset shows up in Data health exactly like a shipped one.
 */
export function loadWorld(
  bandsOverride?: DistanceBand[] | null,
  assetOverrides?: Record<string, AssetOverride> | null,
  customAssets?: Record<string, Asset> | null,
): WorldModel {
  const issues: DataIssue[] = [];
  const bands = bandsOverride && bandsOverride.length > 0 ? bandsOverride : (bandsJson as DistanceBand[]);
  const domains = ([...(domainsJson as DomainLayer[])] as DomainLayer[]).sort(
    (a, b) => a.vertical_order - b.vertical_order,
  );
  const groups = groupsJson as GroupDef[];
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  if (bands.length === 0) issues.push({ severity: "error", source: "bands.json", message: "No bands defined." });
  if (domains.length === 0) issues.push({ severity: "error", source: "domains.json", message: "No domain layers defined." });

  // ── assets ─────────────────────────────────────────────────────────────
  const assets: Asset[] = [];
  const assetsById = new Map<string, Asset>();

  for (const [path, mod] of Object.entries(assetModules)) {
    const file = path.split("/").pop() ?? path;
    const base = mod.default as Record<string, unknown>;
    const override = assetOverrides?.[base.id as string];
    const merged = override
      ? {
          ...base,
          distance_km_from_zero: override.distance_km_from_zero ?? base.distance_km_from_zero,
          operating_range_km: override.operating_range_km !== undefined
            ? override.operating_range_km
            : base.operating_range_km,
        }
      : base;
    const { asset, issues: assetIssues } = validateAsset(merged, file, bands, domains, groups);
    if (override) {
      issues.push({
        severity: "info",
        source: file,
        subject: base.id as string,
        message: "Placement locally edited in this browser (distance and/or operating range overridden). Not saved to the data file.",
      });
    }
    issues.push(...assetIssues);
    if (!asset) continue;
    if (assetsById.has(asset.id)) {
      issues.push({
        severity: "error",
        source: file,
        subject: asset.id,
        message: `Duplicate asset id — this file was ignored in favour of the one loaded first.`,
      });
      continue;
    }
    assetsById.set(asset.id, asset);
    assets.push(asset);
  }
  // ── custom assets — added live from the Asset Editor page, not a file ──
  for (const custom of Object.values(customAssets ?? {})) {
    const id = (custom as unknown as Record<string, unknown>).id as string | undefined;
    if (id && assetsById.has(id)) {
      issues.push({
        severity: "error",
        source: "Asset Editor",
        subject: id,
        message: `A shipped asset already uses id "${id}" — this locally-added asset was skipped rather than shadowing it. Edit it and pick a different id.`,
      });
      continue;
    }
    const { asset, issues: assetIssues } = validateAsset(
      custom,
      `${id ?? "?"}.json`,
      bands,
      domains,
      groups,
    );
    issues.push(...assetIssues);
    if (!asset) continue;
    issues.push({
      severity: "info",
      source: "Asset Editor",
      subject: asset.id,
      message: "Added in this browser via the Asset Editor page. Not a data file — it lives in this browser's storage (or the shared sync store, if configured) alongside every other override, and won't survive a data reset the way a committed asset file does.",
    });
    assetsById.set(asset.id, asset);
    assets.push(asset);
  }

  assets.sort((a, b) => a.distance_km_from_zero - b.distance_km_from_zero || a.id.localeCompare(b.id));

  // ── connections: merge per-asset + flat file, keeping both honest ──────
  const embedded = new Map<string, ResolvedConnection>();
  for (const asset of assets) {
    for (const c of asset.connections ?? []) {
      if (!c?.target_id || !c?.type) continue;
      const key = connKey(asset.id, c.target_id, c.type);
      if (embedded.has(key)) {
        issues.push({
          severity: "info",
          source: `${asset.id}.json`,
          subject: asset.id,
          message: `Duplicate connection to ${c.target_id} (${c.type}) inside the same asset file.`,
        });
        continue;
      }
      embedded.set(key, {
        key,
        source_id: asset.id,
        target_id: c.target_id,
        type: c.type,
        description: c.description ?? "",
        origin: "asset",
        target_pending: false,
      });
    }
  }

  const flatRaw = (connectionsJson as { connections?: FlatConnection[] }).connections ?? [];
  const merged = new Map<string, ResolvedConnection>(embedded);
  for (const f of flatRaw) {
    if (!f?.source_id || !f?.target_id || !f?.type) {
      issues.push({ severity: "error", source: "connections.json", message: "Connection entry is missing source_id, target_id or type." });
      continue;
    }
    if (!assetsById.has(f.source_id)) {
      issues.push({
        severity: "info",
        source: "connections.json",
        subject: f.source_id,
        message: `source_id "${f.source_id}" is not a built asset yet — the edge is held until it exists.`,
      });
      continue;
    }
    const key = connKey(f.source_id, f.target_id, f.type);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, { ...existing, origin: "both", description: existing.description || f.description });
    } else {
      merged.set(key, {
        key,
        source_id: f.source_id,
        target_id: f.target_id,
        type: f.type,
        description: f.description ?? "",
        origin: "file",
        target_pending: false,
      });
    }
  }

  // The scaffold README asks that connections.json and the per-asset arrays be
  // kept in sync by hand. Rather than silently preferring one, flag the drift.
  for (const c of merged.values()) {
    if (c.origin === "asset") {
      issues.push({
        severity: "info",
        source: "connections.json",
        subject: c.source_id,
        message: `Edge ${c.source_id} → ${c.target_id} (${c.type}) is declared on the asset but missing from connections.json. Both render; the flat file is the one that has drifted.`,
      });
    } else if (c.origin === "file") {
      issues.push({
        severity: "warning",
        source: `${c.source_id}.json`,
        subject: c.source_id,
        message: `Edge ${c.source_id} → ${c.target_id} (${c.type}) exists in connections.json but not on the asset itself. Both render; the asset file is the one that has drifted.`,
      });
    }
  }

  // ── pending stubs for unresolved targets ──────────────────────────────
  const stubsById = new Map<string, PendingStub>();
  for (const c of merged.values()) {
    if (assetsById.has(c.target_id)) continue;
    c.target_pending = true;
    const referencing = assetsById.get(c.source_id);
    const existing = stubsById.get(c.target_id);
    if (existing) {
      if (referencing && !existing.referenced_by.includes(referencing.id)) {
        existing.referenced_by.push(referencing.id);
      }
    } else {
      stubsById.set(c.target_id, inferStub(c.target_id, referencing, bands, domains));
    }
  }
  for (const stub of stubsById.values()) {
    issues.push({
      severity: "info",
      source: "connections",
      subject: stub.id,
      message: `Pending target: referenced by ${stub.referenced_by.join(", ") || "an unknown source"} but not built yet. Shown as a provisional stub at ${stub.distance_km_from_zero} km in the ${stub.domain} lane.`,
    });
  }

  const connections = [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));

  const doctrine = doctrineJson as {
    markers?: DoctrineMarker[];
    lower_sky_control?: LowerSkyControl;
  };

  return {
    bands,
    domains,
    groups,
    groupsById,
    assets,
    assetsById,
    stubs: [...stubsById.values()],
    stubsById,
    connections,
    lessons: [...((lessonsJson as { lessons?: Lesson[] }).lessons ?? [])].sort(
      (a, b) => a.order - b.order,
    ),
    doctrineMarkers: doctrine.markers ?? [],
    lowerSky: doctrine.lower_sky_control ?? null,
    issues,
  };
}
