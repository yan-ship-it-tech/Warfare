// ─────────────────────────────────────────────────────────────────────────
// Pass 18 — tactical siting bias.
//
// lateralLayout() (worldMapping.ts) spreads every asset evenly across the
// strip's breadth by (side, band) cohort — collision-safe, deterministic,
// and blind to the actual ground. That's real, tested, perf-measured
// machinery (Pass 8/16/17) and this module does not touch it. It sits
// downstream as a POST-PROCESS: a bounded set of terrain-affine categories
// get their lateralLayout Z blended toward real standing ground Pass 17
// built — artillery into forest patches, drone teams onto elevated
// treelines, logistics-ish assets into a built-up block, air-defense
// toward the real landmark it would plausibly be defending. Command posts
// get the opposite treatment: pushed toward the less-crowded edge of their
// own spread rather than toward a specific feature, per the brief's
// "dispersed and rearward."
//
// Deliberately partial, not a snap: BLEND_TOWARD_FEATURE keeps
// lateralLayout's collision-safe spread as the floor and treats the
// feature as gravity, not a magnet, so nothing this module does can undo
// the separation lateralLayout already guaranteed. Multiple assets sharing
// one feature fan out around its own radius (angular jitter, same idea
// scenery.ts already uses for fighting positions and tree clusters)
// instead of stacking at its exact center.
//
// What this deliberately does NOT touch: `distance_km_from_zero` / X. That
// axis is shared, sourced, and load-bearing for the 2D schematic view and
// the ruler — see worldMapping.ts's own header. Only Z, the axis that
// "carries no distance claim of its own," moves here.
// ─────────────────────────────────────────────────────────────────────────
import type { Side } from "../types";
import { TERRAIN_FEATURES, LANDMARKS, type TerrainFeature, type LandmarkSpec } from "./scenery";
import { worldXFor, hashId } from "./worldMapping";
import { isInWater } from "./terrain3d";
import { unitsPerKm } from "./osmTerrain";

/** One asset is deliberately sited at the OSM inset's real rail geometry
 *  rather than through the generic feature search below — see
 *  data/assets/side_a-logistics-ammo-point-railhead.json. This isn't a
 *  second, independent guess at "near the rail": it's the exact same
 *  anchor osmTerrain.ts uses to draw the rail ribbon itself
 *  (side_a, ANCHOR_KM), applied to one real rail vertex instead of the
 *  whole line, so the ammo point's marker lands inside the actual drawn
 *  rail geometry rather than merely near it. The asset's own
 *  distance_km_from_zero is set to ANCHOR_KM so its X already matches the
 *  inset's anchor with no siting logic needed for that axis — only Z (the
 *  vertex's own local offset from the anchor) is special-cased here. */
const OSM_RAILHEAD_ASSET_ID = "side_a-logistics-ammo-point-railhead";
/** Local xz (km, OSM's own coordinate frame) of a real rail vertex —
 *  data/osm/pokrovsk.json feature osm_314023821's first point — picked as
 *  the closest rail vertex to the inset's own anchor of any in the file,
 *  i.e. genuinely "at the yard" rather than an arbitrary point on the
 *  229 km of alignment the AOI query pulled in. */
const RAILHEAD_LOCAL_Z_KM = -0.153;

export type SitingAffinity = "forest" | "treeline" | "built_up" | "defended" | "rearward" | null;

/** category (never domain — see src/data/placement.ts's own reasoning for
 *  why category, not domain, is the right key for a physical-siting
 *  question) → what kind of real ground this asset should gravitate
 *  toward, if any. Every prefix here is one the brief names explicitly;
 *  everything else falls through to null, i.e. stays exactly where
 *  lateralLayout() already put it. */
export function sitingAffinityFor(category: string): SitingAffinity {
  if (category.startsWith("artillery")) return "forest";
  if (
    ((category.startsWith("uav-strike") || category.startsWith("uav-reconnaissance")) &&
      !category.includes("deep") &&
      !category.includes("strategic")) ||
    category.includes("observation")
  ) {
    // Near-line drone-team launch/observation, or a human OP — same real
    // ground (high, wooded, line of sight without being skylined) serves
    // both, not a deep-strike flight path.
    return "treeline";
  }
  if (category.startsWith("logistics") || category.startsWith("ground-robot-logistics")) return "built_up";
  if (category.startsWith("air-defense") || category.startsWith("cuas")) return "defended";
  if (category.startsWith("c2-") || category.includes("command")) return "rearward";
  return null;
}

const FEATURE_KIND_FOR: Partial<Record<SitingAffinity & string, TerrainFeature["kind"]>> = {
  forest: "forest_patch",
  treeline: "elevated_treeline",
  built_up: "built_up_block",
};

/** What an air-defense asset plausibly defends: fixed high-value rear
 *  infrastructure, not a village or a wreck marker. */
const DEFENDED_LANDMARK_KINDS: LandmarkSpec["kind"][] = ["power_plant", "fuel_depot", "urban_cluster"];

/** How far (world-X units, i.e. METRES in the near register as of Pass 24) a
 *  feature/landmark can be from the asset's own position before it no longer
 *  counts as "nearby." These are finally readable as real distances: 4 km for
 *  a firing position relative to the cover it uses, 22 km for a SAM battery
 *  relative to the infrastructure it covers — which is roughly what the old
 *  30/70 world units worked out to under the projection they were tuned
 *  against, so the behaviour is preserved rather than re-guessed. Note that
 *  in the compressed register the same threshold spans far more real km,
 *  which is correct: what matters is whether two things read as co-located in
 *  the picture, and out there they do. */
const AFFINITY_SEARCH_RADIUS_WORLD = 1_200;
const DEFENDED_SEARCH_RADIUS_WORLD = 5_000;

/** Fraction of the way from lateralLayout's own Z toward the feature's Z.
 *  A full snap would put every artillery piece sharing a patch at one
 *  exact point; blending keeps the collision-safe spread as the floor. */
const BLEND_TOWARD_FEATURE = 0.72;

/** How far (metres) a "rearward" (c2/command) asset gets pushed toward
 *  whichever edge of its own cohort spread is less crowded. Scaled with the
 *  strip: 1.4 km of dispersal across a 12 km frontage is the same relative
 *  push the old 14 units gave across a 124-unit one. */
const REARWARD_PUSH = 1_400;

export interface SitedItem {
  id: string;
  side: Side;
  category: string;
  /** World-X, already resolved from km via worldXFor by the caller — this
   *  module never recomputes distance, same rule every file that touches
   *  placement follows. */
  x: number;
}

interface FeaturePoint {
  x: number;
  z: number;
  radius: number;
  side: Side;
}

/**
 * Nudges `zMap` (id → world-Z, already produced by lateralLayout) toward
 * real terrain for every item whose category has a siting affinity and a
 * matching feature/landmark within range on its own side. Returns a new
 * Map; never mutates the one passed in. Placement's own water/terrain
 * guards (worldPlacement rides the terrain surface, isInWater excludes the
 * river) still apply downstream — this only ever proposes a Z, and backs
 * off to the un-nudged value if the proposal would land in the river.
 */
export function applyTacticalSiting(
  items: SitedItem[],
  zMap: Map<string, number>,
  /** km → world X for NON-ASSET geometry. Pass 25: this has to be the placed
   *  ladder (`DepthLayout.depthAtKm`), not the pure zone curve, or a forest
   *  patch authored at 8 km sits several hundred metres from the artillery
   *  piece authored at 10 km that is supposed to hide in it — see zones.ts's
   *  `depthAtKm`. Defaults to the pure curve so a caller without a layout
   *  still gets sane behaviour. */
  xForKm: (side: Side, km: number) => number = worldXFor,
): Map<string, number> {
  const out = new Map(zMap);
  if (items.length === 0) return out;

  const featuresByKind = new Map<TerrainFeature["kind"], FeaturePoint[]>();
  for (const f of TERRAIN_FEATURES) {
    const list = featuresByKind.get(f.kind) ?? [];
    list.push({ x: xForKm(f.side, f.km), z: f.z, radius: f.radius, side: f.side });
    featuresByKind.set(f.kind, list);
  }
  const defended: FeaturePoint[] = LANDMARKS.filter((l) => DEFENDED_LANDMARK_KINDS.includes(l.kind)).map((l) => ({
    x: xForKm(l.side, l.km),
    z: l.z,
    radius: 480,
    side: l.side,
  }));

  const nearest = (pool: FeaturePoint[], side: Side, x: number, radius: number): FeaturePoint | null => {
    const candidates = pool.filter((f) => f.side === side && Math.abs(f.x - x) < radius);
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b));
  };

  // How many items have already gravitated to a given feature, keyed by its
  // own coordinates — so a second and third asset sharing one fan out
  // around it instead of stacking on the first.
  const occupancy = new Map<string, number>();

  for (const item of items) {
    if (item.id === OSM_RAILHEAD_ASSET_ID) {
      out.set(item.id, RAILHEAD_LOCAL_Z_KM * unitsPerKm());
      continue;
    }

    const affinity = sitingAffinityFor(item.category);
    if (!affinity) continue;

    if (affinity === "rearward") {
      // No specific feature to gravitate toward — command posts disperse
      // FROM each other, not toward a point. A stable per-id hash fans them
      // both directions rather than collapsing the whole cohort onto one
      // edge of the strip, which a single fixed sign would do.
      const current = out.get(item.id) ?? 0;
      const dir = hashId(item.id) < 0.5 ? -1 : 1;
      out.set(item.id, current + dir * REARWARD_PUSH);
      continue;
    }

    const target =
      affinity === "defended"
        ? nearest(defended, item.side, item.x, DEFENDED_SEARCH_RADIUS_WORLD)
        : nearest(featuresByKind.get(FEATURE_KIND_FOR[affinity]!) ?? [], item.side, item.x, AFFINITY_SEARCH_RADIUS_WORLD);
    if (!target) continue;

    const key = `${target.x.toFixed(2)},${target.z.toFixed(2)}`;
    const n = occupancy.get(key) ?? 0;
    occupancy.set(key, n + 1);

    // Angular jitter around the feature so multiple co-located assets don't
    // stack at its exact center — same pattern scenery.ts's own rejection-
    // sampled clusters use, applied here to real data-carrying assets.
    const angle = hashId(item.id) * Math.PI * 2 + n * 2.4;
    const r = Math.max(40, Math.min(target.radius * 0.6, target.radius - 70) * (0.35 + 0.5 * hashId(`${item.id}:r`)));
    const proposedZ = target.z + Math.sin(angle) * r;

    const current = out.get(item.id) ?? 0;
    const blended = current + (proposedZ - current) * BLEND_TOWARD_FEATURE;
    if (!isInWater(target.x, blended)) out.set(item.id, blended);
  }

  return out;
}
