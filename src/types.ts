// ─────────────────────────────────────────────────────────────────────────
// Core data model for the Multi-Domain Warfare Digital Twin
// Everything the UI renders is driven from these shapes + the JSON files
// in /data. Add a new asset by adding a new JSON file — no code changes.
// ─────────────────────────────────────────────────────────────────────────

export type Side = "side_a" | "side_b"; // generic by default — rename in ui-config, not here

export type Domain =
  | "land"
  | "air"
  | "sea"
  | "space"
  | "cyber_ew"
  | "logistics"
  | "medical"
  | "c2_comms";

export type Echelon = "strategic" | "operational" | "tactical";

/**
 * Coarse toggleable grouping — "turn off everything that isn't air defense."
 * Deliberately separate from `category` (which stays granular, e.g.
 * "air-defense-long-range"): `group` is the taxonomy the show/hide toolbar
 * filters on, `category` is the specific thing an asset is. Defined in
 * data/groups.json so the toolbar's chips, colors and labels are data too.
 */
export type AssetGroup = string;

export type ConnectionType =
  | "supply"        // ammo, fuel, parts
  | "data_c2"       // sensor feed, targeting data, command link
  | "personnel"      // crew rotation, reinforcement, training pipeline
  | "fires_support"  // calls for fire, target handoff
  | "casevac"        // medical evacuation chain
  | "maintenance";   // repair / recovery

export interface DistanceBand {
  id: string;
  label: string;               // e.g. "Tactical (0–5 km)"
  echelon: Echelon;
  min_km: number;
  max_km: number;               // use a large number for open-ended "150km+"
  side: Side | "both";
}

export interface DomainLayer {
  id: Domain;
  label: string;
  vertical_order: number;       // stacking order for the up/down scroll axis
  description: string;
}

export interface AssetConnection {
  target_id: string;            // id of the other Asset
  type: ConnectionType;
  description: string;          // short — shown on hover/click of the line
}

/** Always-present, comparable across every asset — the point of the field is
 *  that it survives even when reporting is thin: use `confidence` to say so
 *  rather than omitting the number or presenting a guess as a hard figure. */
export interface AssetCost {
  unit_cost_usd: number | null;          // null when genuinely too variable/unknown to give one number
  display: string;                       // human string shown in the UI, e.g. "~$1.1M per launcher unit"
  confidence: "reported" | "estimated" | "unknown";
}

/** Exactly three, author-chosen per asset — the three facts worth knowing at
 *  a glance beyond cost (which has its own guaranteed stat tile). A crew
 *  count matters for a howitzer and means nothing for a satellite; this is
 *  where that difference lives, while cost stays the one constant. */
export type KeyFact = { label: string; value: string };

export interface Asset {
  id: string;                            // stable slug, e.g. "side_a-air-defense-long-patriot"
  name: string;                          // display name, e.g. "Patriot (PAC-3 MSE)"
  side: Side;
  /** ENGAGEMENT domain — which domain this asset fights *in or against*.
   *  This is the teaching taxonomy: it drives lane order, legend colour and
   *  the show/hide filters, and it is why a Patriot battery is `air` (it is
   *  an air-domain weapon) even though the launcher never leaves the ground.
   *  It is NOT a statement about where the hardware physically sits — use
   *  `platform_domain` for that. See `src/data/placement.ts`. */
  domain: Domain;
  /** PLATFORM domain — where the hardware physically SITS, which is what any
   *  renderer must use to decide altitude. Optional: when absent it is
   *  inferred from `category` (see `resolvePlatformDomain`), so an asset file
   *  that omits it still places correctly rather than floating. Set it
   *  explicitly whenever the engagement domain and the physical one differ —
   *  ground-based air defence, truck-mounted EW, ground satcom terminals. */
  platform_domain?: Domain;
  echelon: Echelon;
  group: AssetGroup;                     // references a groups.json entry — the show/hide taxonomy
  /** Optional link into data/catalog/*.json — when set, the detail panel offers
   *  swapping which real system fills this slot (e.g. this side's armor slot
   *  showing T-72B3 vs. T-90M vs. T-80BVM). References CatalogEntry.comparison_group. */
  comparison_group?: string;
  distance_km_from_zero: number;         // representative placement, not literal intel
  /** Typical employment envelope, distinct from the single representative
   *  point above. Optional because not every category has a meaningful range
   *  (a fixed power plant doesn't "operate" at a distance). When present, it
   *  draws a bracket on the ruler and is what an edit should move first. */
  operating_range_km?: { min_km: number; max_km: number } | null;
  band_id: string;                       // written for convenience/back-compat; the app recomputes
                                          // this live from distance_km_from_zero against the current
                                          // (possibly user-edited) bands rather than trusting it blindly
  category: string;                      // e.g. "air-defense-long-range"
  representative_system: string;         // real-world system used as the example
  icon_image: string;                    // path/URL to the small map icon
  gallery_images: string[];              // path/URL(s) for the detail panel

  /** The detail page's hero photo — sourced from docs/imagery-sourcing-ledger.xlsx
   *  (Pass 20), tracked with the same license/attribution discipline as
   *  `sources` tracks factual citations. `url`/`source_url` point at a stable
   *  Wikimedia Commons `Special:FilePath` resolution and the file's own page;
   *  neither is ever fetched by this app's build — the *visitor's* browser
   *  resolves them, same reasoning as the Pass 4 real-photo decision in
   *  docs/DECISIONS.md. `kind` drives how the detail page renders it:
   *    photo         — a real photo of this specific system (url/source_url set)
   *    conceptual     — an abstract node (network, category, sensitive subject)
   *                      with no unit-specific photo; `caption` explains why
   *    placeholder    — a real system with no free-licensed photo found;
   *                      falls back to the category's NATO/APP-6 symbol
   *  Optional only because a hand-built custom asset (Asset Editor) has no
   *  ledger entry to draw from. */
  image?: {
    url: string | null;
    source_url: string | null;
    license: string;
    kind: "photo" | "conceptual" | "placeholder";
    caption?: string;
  };

  cost: AssetCost;
  key_facts: KeyFact[];                  // exactly 3

  short_role: string;                    // 1 sentence, shown on hover
  characteristics: string[];             // bullet facts (range, crew, etc.)
  employment_notes: string;              // how it's actually used in practice
  contrast_vs_traditional: string;       // 2-4 sentences: what changed vs. legacy warfare

  reactive_behavior?: {
    animation_id: string;                // key into the animation registry
    description: string;                 // what the vignette shows
  };

  /** Seed of a "most notable/memorable moments" database — specific, dated,
   *  sourced incidents involving this system (a first-of-its-kind strike, a
   *  famous engagement), distinct from the general characteristics/employment
   *  fields above. Optional and sparse for now; see docs/DECISIONS.md backlog. */
  notable_events?: {
    date: string;              // ISO date, or a year if that's all that's public
    title: string;
    description: string;
    sources: { label: string; url: string }[];
  }[];

  connections: AssetConnection[];

  sources: { label: string; url: string }[];

  /** Stamped by `node scripts/audit-content.mjs --write` — the verification
   *  half of the two-pass content pipeline (docs/CONTENT_PIPELINE.md).
   *  Never hand-edited: it is derived from `sources` so it cannot drift into
   *  claiming a confidence the citations do not support.
   *
   *  verified                ≥2 independent named sources (distinct outlets;
   *                          image-credit links are excluded from the count)
   *  sourced_low_confidence   exactly 1 named source
   *  unverified               general knowledge / doctrine.md only */
  verification?: {
    status: "verified" | "sourced_low_confidence" | "unverified";
    independent_sources: number;
    last_audit: string;
    notes: string[];
  };

  editable: true;                        // scaffold marker — all assets are user-editable
}
