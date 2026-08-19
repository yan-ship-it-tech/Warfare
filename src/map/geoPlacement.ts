// ─────────────────────────────────────────────────────────────────────────
// Real-geography placement for the map view.
//
// The schematic Scene (src/scene) is the source of truth for distance — this
// module never changes that data. It only answers a second question: "if
// this asset's true distance_km_from_zero were laid onto the real map, where
// would it sit?" That's a pure projection, computed at render time from data
// that already exists (side, domain, distance_km_from_zero), so it needed no
// schema change and can never drift out of sync with the schematic view.
//
// Anchor: a real point on the current contact line near Orikhiv, Zaporizhzhia
// Oblast — chosen because it sits on open, well-documented flat steppe
// typical of most of the 1,200 km front, not because any asset is claimed to
// be located there. Same honesty rule as the schematic view: every placement
// here is representative, not a measured unit position. Ukraine's rear
// projects west/northwest (toward Zaporizhzhia city, Dnipro, Kyiv); Russia's
// rear projects east/southeast (toward occupied Tokmak/Melitopol and on into
// Russian territory). A real bearing and a real destination-point formula,
// applied to an illustrative distance — see docs/DECISIONS.md.
// ─────────────────────────────────────────────────────────────────────────
import type { Domain, Side } from "../types";

export const FRONT_ANCHOR = { lat: 47.5806, lng: 35.7828 }; // near Orikhiv, Zaporizhzhia Oblast

const BEARING_DEG: Record<Side, number> = {
  side_a: 288, // toward Ukrainian-held deep rear
  side_b: 108, // toward Russian-held/Russia deep rear
};

const EARTH_RADIUS_KM = 6371;

/** Standard destination-point formula: start point + bearing + distance → new point. */
function destination(lat: number, lng: number, bearingDeg: number, distanceKm: number) {
  const δ = distanceKm / EARTH_RADIUS_KM;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );

  return { lat: (φ2 * 180) / Math.PI, lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

/** Small deterministic hash so the same asset id always lands at the same
 *  lateral jitter, instead of reshuffling on every render. */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

const DOMAIN_LANE_KM: Record<Domain, number> = {
  land: 0,
  logistics: 2.4,
  medical: -2.4,
  c2_comms: 4.8,
  cyber_ew: -4.8,
  air: 7.2,
  sea: -7.2,
  space: 9.6,
};

/**
 * Projects one asset onto the real map. Distance drives how far along the
 * side's bearing it sits; domain gives it a small, consistent lateral
 * offset (perpendicular to that bearing) purely so markers at a shared
 * distance don't stack directly on top of one another — it carries no
 * geographic claim of its own.
 */
export function geoPlacement(opts: {
  id: string;
  side: Side;
  domain: Domain;
  distance_km_from_zero: number;
}): { lat: number; lng: number } {
  const bearing = BEARING_DEG[opts.side];
  const primary = destination(FRONT_ANCHOR.lat, FRONT_ANCHOR.lng, bearing, opts.distance_km_from_zero);

  const laneKm = DOMAIN_LANE_KM[opts.domain] ?? 0;
  const jitterKm = ((hash(opts.id) % 100) / 100 - 0.5) * 3; // ±1.5 km, id-stable
  const lateralKm = laneKm + jitterKm;
  const perpBearing = bearing + 90;

  if (lateralKm === 0) return primary;
  return destination(
    primary.lat,
    primary.lng,
    lateralKm >= 0 ? perpBearing : perpBearing + 180,
    Math.abs(lateralKm),
  );
}
