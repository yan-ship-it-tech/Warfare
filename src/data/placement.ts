// ─────────────────────────────────────────────────────────────────────────
// Engagement domain vs. platform domain.
//
// `Asset.domain` answers "which domain does this thing fight in?". That is the
// right taxonomy for lanes, legend colour and filters, and it is why every
// SAM battery in the dataset is `air`: a Patriot is an air-domain weapon.
//
// It is the WRONG input to an altitude, and Pass 8 found both renderers using
// it as one. The 3D view lifted anything with DOMAIN_ALTITUDE > 2 onto a
// tether, and the 2D view popped it up by DOMAIN_ALTITUDE_PX — so 16 assets
// that physically sit on the ground were drawn hovering over their own ground
// shadow: 11 air-defence/C-UAS systems, 2 truck-mounted EW systems, and 3
// ground C2/satcom terminals. Pass 7's grounding fix only ever reached the
// assets whose engagement domain happened to match their platform (tanks,
// ships), which is exactly why it looked fixed and wasn't.
//
// So the two meanings are split rather than one being redefined. Nothing about
// the teaching taxonomy changes; only the question "how high off the deck do I
// draw this?" now asks a field that actually means height.
// ─────────────────────────────────────────────────────────────────────────
import type { Asset, Domain } from "../types";

/**
 * Category → where the hardware physically sits, for assets that don't state
 * it. Keyed by prefix so a new `air-defense-very-long-range` (or any other
 * sub-category coined later) inherits the right answer instead of silently
 * floating — the failure mode this whole module exists to prevent.
 *
 * Only categories whose platform differs from their engagement domain need to
 * be listed; everything else falls through to `domain`, which is already
 * correct for armor, artillery, logistics, medical and the rest.
 */
const PLATFORM_BY_CATEGORY_PREFIX: { prefix: string; platform: Domain }[] = [
  // Ground-based air defence and counter-UAS: engages `air`, sits on `land`.
  { prefix: "air-defense-", platform: "land" },
  { prefix: "cuas-", platform: "land" },
  // Truck/mast-mounted electronic warfare: engages `cyber_ew`, sits on `land`.
  { prefix: "ew-", platform: "land" },
  // Command posts and the ground half of a satcom link: the terminal is a
  // dish on the ground, not the spacecraft it talks to.
  { prefix: "c2-", platform: "land" },
  { prefix: "satcom-", platform: "land" },
  // Genuinely airborne / afloat / in orbit — listed so the intent is explicit
  // rather than resting on the fallback happening to agree.
  { prefix: "uav-", platform: "air" },
  { prefix: "naval-", platform: "sea" },
  { prefix: "space-", platform: "space" },
];

/**
 * Where this asset physically sits. Explicit `platform_domain` wins; otherwise
 * infer from `category`; otherwise fall back to the engagement domain.
 *
 * Deliberately total and never throws — a half-finished asset from the in-app
 * editor still gets a usable answer, per the repo's degrade-don't-break rule.
 */
export function resolvePlatformDomain(
  asset: Pick<Asset, "domain"> & Partial<Pick<Asset, "platform_domain" | "category">>,
): Domain {
  if (asset.platform_domain) return asset.platform_domain;
  const category = asset.category ?? "";
  for (const rule of PLATFORM_BY_CATEGORY_PREFIX) {
    if (category.startsWith(rule.prefix)) return rule.platform;
  }
  return asset.domain;
}

/**
 * True when an asset's engagement domain and platform domain disagree — i.e.
 * the case that used to render as a floating marker. Surfaced in Data Health
 * so the conflation stays visible in the dataset rather than only in code.
 */
export function hasSplitDomain(
  asset: Pick<Asset, "domain"> & Partial<Pick<Asset, "platform_domain" | "category">>,
): boolean {
  return resolvePlatformDomain(asset) !== asset.domain;
}

// ── air-layer altitude (Pass 24) ─────────────────────────────────────────
/**
 * How high off the deck, in METRES. The companion to resolvePlatformDomain():
 * that answers "does this thing fly", this answers "how high", and both are
 * deliberately in this file rather than in a renderer, because the 3D scene,
 * the schematic view and the detail panel must never be able to disagree.
 *
 * Order of preference:
 *   1. the asset's own `altitude_band_m`, at the band's GEOMETRIC mean. These
 *      bands are wide and skewed low — a Shahed's published 60–4,000 m
 *      envelope is flown near its floor far more often than its ceiling — and
 *      an arithmetic mean would put it at 2,030 m, which is a claim the
 *      sourcing does not support. The geometric mean lands at ~490 m.
 *   2. `symbolic`: the band is real and unrenderable (an orbital asset), so
 *      the platform-domain fallback is used and the caller is told the height
 *      is a symbol, not a measurement.
 *   3. `unknown` or no band at all: the platform-domain fallback, flagged.
 *
 * `fallbackFor` is injected rather than imported so this module stays free of
 * any dependency on the 3D layer — src/three/worldMapping.ts owns the
 * per-domain table and passes it in.
 */
export type AltitudeBasis = "sourced" | "estimated" | "symbolic" | "unknown" | "ground";

export interface ResolvedAltitude {
  /** Metres above mean ground. */
  metres: number;
  basis: AltitudeBasis;
  /** True when `metres` is a legible stand-in rather than a physical claim —
   *  the caller should say so wherever it shows the number. */
  symbolic: boolean;
}

export function resolveAltitudeM(
  asset: Pick<Asset, "domain"> &
    Partial<Pick<Asset, "platform_domain" | "category" | "altitude_band_m">>,
  fallbackFor: (domain: Domain) => number,
): ResolvedAltitude {
  const platform = resolvePlatformDomain(asset);
  const fallback = fallbackFor(platform) ?? 0;
  const band = asset.altitude_band_m;

  if (band && band.basis !== "unknown" && band.min_m !== null && band.max_m !== null) {
    if (band.basis === "symbolic") {
      return { metres: fallback, basis: "symbolic", symbolic: true };
    }
    const lo = Math.max(1, band.min_m);
    const hi = Math.max(lo, band.max_m);
    return { metres: Math.sqrt(lo * hi), basis: band.basis, symbolic: false };
  }

  // Nothing to draw from. A ground/sea platform is not "unknown" — it is at
  // grade, which is a fact, so only genuinely airborne platforms are flagged.
  const airborne = platform === "air" || platform === "space" || fallback > 0;
  return {
    metres: fallback,
    basis: airborne ? (band ? "unknown" : "estimated") : "ground",
    symbolic: airborne && !band,
  };
}
