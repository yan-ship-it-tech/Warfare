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
