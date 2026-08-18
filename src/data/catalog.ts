// ─────────────────────────────────────────────────────────────────────────
// Equipment catalog — user-supplied reference data (data/catalog/*.json),
// used to let an asset "slot" on the map show a different real system that
// fills the same role, e.g. Russia's armor slot swapping T-72B3 for T-90M.
//
// This is deliberately a separate layer from the hand-authored Asset files:
// a catalog entry carries real specs and a cost, but not the doctrine-level
// narrative (employment notes, contrast vs. traditional) an authored Asset
// carries. Swapping to a non-default catalog entry shows its real specs
// under the *original* asset's role narrative, clearly labeled — the
// narrative is usually true at the role level (what changed about armor
// generally) even when the specific system changes.
// ─────────────────────────────────────────────────────────────────────────
import type { Asset, AssetCost, KeyFact, Side } from "../types";

import ruJson from "../../data/catalog/russian_military_equipment.json";
import uaJson from "../../data/catalog/ukrainian_military_equipment.json";

export interface CatalogCostField {
  min: number | null;
  max: number | null;
  basis?: string;
  confidence?: "high" | "medium" | "low";
}

export interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  comparison_group: string;
  domain: string;
  manufacturer: string;
  country_of_origin: string;
  in_service_since: number;
  crew: number | null;
  unit_cost_usd: CatalogCostField;
  additional_costs?: Record<string, CatalogCostField & { note?: string }>;
  specifications: Record<string, string | number | boolean>;
  combat_notes: string;
  wikipedia: string;
  /** Which side's catalog file this came from — side_a's catalog is the
   *  Ukrainian file, side_b's is the Russian file, matching the convention
   *  every asset already uses. */
  side: Side;
}

interface RawCatalogFile {
  country: string;
  equipment: Omit<CatalogEntry, "side">[];
}

const SIDE_FILES: [Side, RawCatalogFile][] = [
  ["side_a", uaJson as unknown as RawCatalogFile],
  ["side_b", ruJson as unknown as RawCatalogFile],
];

const allEntries: CatalogEntry[] = SIDE_FILES.flatMap(([side, file]) =>
  file.equipment.map((e) => ({ ...e, side })),
);

export const CATALOG_ENTRIES: CatalogEntry[] = allEntries;
export const catalogById = new Map(allEntries.map((e) => [e.id, e]));

/** All catalog entries in the same role, on the same side, as `entry` —
 *  the swap list for its slot. Always includes `entry` itself. */
export function catalogSiblings(entry: CatalogEntry): CatalogEntry[] {
  return allEntries.filter((e) => e.side === entry.side && e.comparison_group === entry.comparison_group);
}

export function findCatalogEntry(side: Side, comparisonGroup: string, id?: string): CatalogEntry | undefined {
  const pool = allEntries.filter((e) => e.side === side && e.comparison_group === comparisonGroup);
  if (id) return pool.find((e) => e.id === id) ?? pool[0];
  return pool[0];
}

function titleCase(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b(usd|kmh|km|rpm|mm|kg|rha|hp)\b/gi, (m) => m.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatSpecValue(v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString("en-US");
  return v;
}

/** Turns the catalog's free-form `specifications` object into up to 3
 *  key-fact tiles — the same shape an authored asset uses, so the detail
 *  panel doesn't need two different rendering paths. Field order in the
 *  source JSON is deliberate/curated per entry, so the first 3 win. */
export function catalogKeyFacts(entry: CatalogEntry): KeyFact[] {
  return Object.entries(entry.specifications)
    .slice(0, 3)
    .map(([k, v]) => ({ label: titleCase(k), value: formatSpecValue(v) }));
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

export function catalogCost(entry: CatalogEntry): AssetCost {
  const { min, max, basis, confidence } = entry.unit_cost_usd ?? {};
  const tier: AssetCost["confidence"] =
    confidence === "high" ? "reported" : confidence === "medium" ? "reported" : confidence === "low" ? "estimated" : "unknown";
  if (min == null && max == null) {
    return { unit_cost_usd: null, display: basis || "Not publicly disclosed", confidence: "unknown" };
  }
  const range = min === max || max == null ? fmtUsd(min!) : `${fmtUsd(min!)}–${fmtUsd(max)}`;
  const extra = entry.additional_costs
    ? "; " +
      Object.entries(entry.additional_costs)
        .map(([k, c]) => `${titleCase(k)}: ${c.min != null ? fmtUsd(c.min) : "?"}${c.max && c.max !== c.min ? `–${fmtUsd(c.max)}` : ""}${c.note ? ` (${c.note})` : ""}`)
        .join("; ")
    : "";
  return {
    unit_cost_usd: min ?? max ?? null,
    display: `${range}${basis ? ` — ${basis}` : ""}${extra}`,
    confidence: tier,
  };
}

// ── swap resolution ─────────────────────────────────────────────────────

export interface AssetDisplay {
  name: string;
  category: string;
  representative_system: string;
  manufacturer?: string;
  cost: AssetCost;
  key_facts: KeyFact[];
  wikipedia?: string;
  combat_notes?: string;
  /** True when a non-default catalog entry is currently selected for this
   *  asset's slot — callers use this to show the "swapped" banner. */
  isSwapped: boolean;
  swappedEntry?: CatalogEntry;
}

/**
 * The asset's own authored fields, or a swapped-in catalog entry's fields
 * when the slot's override picks one. Role narrative (short_role,
 * employment_notes, contrast_vs_traditional), position and connections are
 * deliberately untouched by a swap — those stay the caller's own asset
 * fields regardless, since the doctrine-level "what changed" story is
 * usually true at the role level even when the specific system changes.
 */
export function resolveAssetDisplay(asset: Asset, catalogEquipmentId: string | null | undefined): AssetDisplay {
  const fallback: AssetDisplay = {
    name: asset.name,
    category: asset.category,
    representative_system: asset.representative_system,
    cost: asset.cost,
    key_facts: asset.key_facts,
    isSwapped: false,
  };
  if (!catalogEquipmentId || !asset.comparison_group) return fallback;
  const entry = catalogById.get(catalogEquipmentId);
  if (!entry || entry.side !== asset.side || entry.comparison_group !== asset.comparison_group) return fallback;
  return {
    name: entry.name,
    category: entry.category,
    representative_system: entry.name,
    manufacturer: entry.manufacturer,
    cost: catalogCost(entry),
    key_facts: catalogKeyFacts(entry),
    wikipedia: entry.wikipedia,
    combat_notes: entry.combat_notes,
    isSwapped: true,
    swappedEntry: entry,
  };
}
