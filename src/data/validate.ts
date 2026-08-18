// ─────────────────────────────────────────────────────────────────────────
// Runtime validation of asset JSON against the scaffold schema.
//
// Philosophy: a bad or half-finished asset file should degrade the tool, not
// break it. Anything that can still be placed on the map gets placed, and
// every complaint is collected into the Data health panel — which doubles as
// the working checklist while categories are being filled in.
// ─────────────────────────────────────────────────────────────────────────
import type { Asset, ConnectionType, DistanceBand, Domain, DomainLayer, Echelon, Side } from "../types";
import type { DataIssue } from "./model";

const SIDES: Side[] = ["side_a", "side_b"];
const ECHELONS: Echelon[] = ["strategic", "operational", "tactical"];
const CONNECTION_TYPES: ConnectionType[] = [
  "supply",
  "data_c2",
  "personnel",
  "fires_support",
  "casevac",
  "maintenance",
];

const REQUIRED_STRINGS = [
  "id",
  "name",
  "category",
  "representative_system",
  "icon_image",
  "short_role",
  "employment_notes",
  "contrast_vs_traditional",
] as const;

export interface ValidationResult {
  /** Placeable assets, cast to Asset once they clear the placement-critical checks. */
  asset: Asset | null;
  issues: DataIssue[];
}

/**
 * Validates one raw asset record. Returns the asset when it carries enough
 * to be positioned (id, side, domain, a numeric distance); otherwise null,
 * with an error explaining why it was dropped.
 */
export function validateAsset(
  raw: unknown,
  source: string,
  bands: DistanceBand[],
  domains: DomainLayer[],
): ValidationResult {
  const issues: DataIssue[] = [];
  const push = (severity: DataIssue["severity"], message: string, subject?: string) =>
    issues.push({ severity, source, subject, message });

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    push("error", "File does not contain a JSON object.");
    return { asset: null, issues };
  }
  const a = raw as Record<string, unknown>;
  const id = typeof a.id === "string" ? a.id : "";
  const subject = id || source;

  // ── placement-critical ────────────────────────────────────────────────
  let placeable = true;
  if (!id) {
    push("error", "Missing `id` — cannot be indexed or referenced by a connection.");
    placeable = false;
  }
  if (typeof a.side !== "string" || !SIDES.includes(a.side as Side)) {
    push("error", `\`side\` must be one of ${SIDES.join(" | ")}; got ${JSON.stringify(a.side)}.`, subject);
    placeable = false;
  }
  const domainIds = domains.map((d) => d.id);
  if (typeof a.domain !== "string" || !domainIds.includes(a.domain as Domain)) {
    push("error", `\`domain\` must be one of ${domainIds.join(" | ")}; got ${JSON.stringify(a.domain)}.`, subject);
    placeable = false;
  }
  if (typeof a.distance_km_from_zero !== "number" || !Number.isFinite(a.distance_km_from_zero)) {
    push("error", "`distance_km_from_zero` must be a finite number.", subject);
    placeable = false;
  } else if (a.distance_km_from_zero < 0) {
    push("error", "`distance_km_from_zero` is negative — distance is measured outward from the zero line on both sides.", subject);
    placeable = false;
  }

  // ── band consistency ──────────────────────────────────────────────────
  const band = bands.find((b) => b.id === a.band_id);
  if (typeof a.band_id !== "string" || !band) {
    push("error", `\`band_id\` ${JSON.stringify(a.band_id)} does not match any band in bands.json.`, subject);
    placeable = false;
  } else if (typeof a.distance_km_from_zero === "number") {
    const km = a.distance_km_from_zero;
    if (km < band.min_km || km > band.max_km) {
      push(
        "warning",
        `Placed at ${km} km but tagged band "${band.id}" (${band.min_km}–${band.max_km} km). The map follows the km value; the band tag is what disagrees.`,
        subject,
      );
    }
    if (typeof a.echelon === "string" && a.echelon !== band.echelon) {
      push(
        "info",
        `\`echelon\` is "${a.echelon}" but band "${band.id}" is "${band.echelon}". Fine if deliberate — a tactical asset can sit in an operational-depth band — just flagging the mismatch.`,
        subject,
      );
    }
  }

  if (typeof a.echelon !== "string" || !ECHELONS.includes(a.echelon as Echelon)) {
    push("warning", `\`echelon\` must be one of ${ECHELONS.join(" | ")}; got ${JSON.stringify(a.echelon)}.`, subject);
  }

  // ── content fields ────────────────────────────────────────────────────
  for (const key of REQUIRED_STRINGS) {
    if (typeof a[key] !== "string" || (a[key] as string).trim() === "") {
      push("warning", `\`${key}\` is missing or empty.`, subject);
    }
  }
  if (!Array.isArray(a.characteristics) || a.characteristics.length === 0) {
    push("warning", "`characteristics` is empty — the detail panel will look thin.", subject);
  }
  if (!Array.isArray(a.gallery_images)) {
    push("info", "`gallery_images` is missing; the panel falls back to the generated icon.", subject);
  }

  // ── sourcing (the credibility check) ──────────────────────────────────
  const sources = Array.isArray(a.sources) ? (a.sources as { label?: string; url?: string }[]) : [];
  if (sources.length === 0) {
    push("warning", "No `sources` at all. Flagged as unsourced in the detail panel.", subject);
  } else {
    const citable = sources.filter((s) => typeof s?.url === "string" && s.url.trim() !== "");
    if (citable.length === 0) {
      push(
        "info",
        "Sources are named but carry no URL — treated as an explicit 'verify before publishing' flag, which is the scaffold's documented convention.",
        subject,
      );
    }
  }

  // ── connections ───────────────────────────────────────────────────────
  if (!Array.isArray(a.connections)) {
    push("warning", "`connections` is missing — the dependency overlay will show this asset isolated.", subject);
  } else {
    a.connections.forEach((c, i) => {
      const conn = c as Record<string, unknown>;
      if (typeof conn?.target_id !== "string" || conn.target_id === "") {
        push("error", `connections[${i}] has no \`target_id\`.`, subject);
      }
      if (typeof conn?.type !== "string" || !CONNECTION_TYPES.includes(conn.type as ConnectionType)) {
        push("error", `connections[${i}] has unknown type ${JSON.stringify(conn?.type)}.`, subject);
      }
      if (typeof conn?.description !== "string" || conn.description.trim() === "") {
        push("warning", `connections[${i}] has no description — nothing to show on hover.`, subject);
      }
      if (conn?.target_id === id) {
        push("warning", `connections[${i}] points at its own asset.`, subject);
      }
    });
  }

  // ── conventions ───────────────────────────────────────────────────────
  const expectedFile = `${id}.json`;
  if (id && !source.endsWith(expectedFile)) {
    push("info", `Filename does not match id — expected ${expectedFile}. Cosmetic, but the scaffold's one-asset-per-file convention is easier to navigate when they match.`, subject);
  }
  if (a.editable !== true) {
    push("info", "`editable` is not true. The scaffold marks every asset editable.", subject);
  }

  return { asset: placeable ? (a as unknown as Asset) : null, issues };
}
