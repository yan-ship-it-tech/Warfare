// ─────────────────────────────────────────────────────────────────────────
// Battlefield → 3D world coordinates.
//
// Pass 24 changed the load-bearing rule in this file. It used to consume
// `Projection.xFor()` — the 2D schematic view's per-band pixel allocation —
// and only convert the result into world units. That coupling is gone: km →
// world X now goes through `depthAxis.ts`, a pure two-register function with
// no dependence on the live band set at all. Read that file's header first;
// this one is downstream of it.
//
// What that costs, stated plainly because it is a real deviation from the
// invariant CLAUDE.md records ("the 3D view reads the same underlying
// projection so the two views can never disagree about where anything is"):
// the two views no longer share one km→X function. What they still share —
// and what that invariant was actually protecting — is the number itself.
// Both draw an asset from `distance_km_from_zero`, both label it in true km,
// and neither can move an asset without moving that field. What differs is
// only how each *allocates screen depth* to a km, and it has to differ: the
// 2D view is an explicitly schematic cross-section that gives each band a
// legible slice, while a 3D scene with real terrain in it cannot claim two
// scales at once. See docs/DECISIONS.md Pass 24.
//
// The other consequence, and it is an improvement: editing a band no longer
// moves anything in the 3D scene. A band is an annotation on the axis now,
// not the thing that defines it — which is what the stored-`band_id`-is-
// informational rule already said about the data.
//
// Axes:
//   X  distance from the zero line. Zero line at X = 0, side_a negative,
//      side_b positive — same handedness as the 2D view. True scale (1 unit
//      = 1 m) out to TRUE_SCALE_DEPTH_KM, logarithmically compressed past it.
//   Y  altitude, in metres above mean ground. Genuinely above the ground
//      plane, and — inside the near register — genuinely correct.
//   Z  lateral position across the represented strip, in metres. The scene is
//      a strip ~12 km wide and the full rear-to-rear depth; Z separates
//      co-located assets and carries no distance claim of its own.
// ─────────────────────────────────────────────────────────────────────────
import type { Domain, Side } from "../types";
import {
  UNITS_PER_KM,
  depthUnitsFor,
  kmForDepthUnits,
  HALF_EXTENT_UNITS,
  MAX_DEPTH_KM,
} from "./depthAxis";

/** Retained for the 2D schematic view's own scale note; the 3D axis no
 *  longer has a px-per-unit relationship to anything. */
export const PX_PER_UNIT = 12;

/**
 * Fallback altitude per PLATFORM domain, in METRES — i.e. keyed by where the
 * hardware physically sits, never by what it shoots at. Feeding this the
 * engagement domain is what left every SAM battery hovering; see
 * src/data/placement.ts.
 *
 * Pass 24 turned these from arbitrary world offsets into real heights, and
 * demoted them to a *fallback*: an asset with its own `altitude_band_m`
 * (Pass 24's air-layer data) is drawn at its own altitude and never reaches
 * these. What is left here is what an asset with no band should do.
 *
 *  air       1,200 m — a generic "airborne, tactical" height, deliberately
 *                      between the fixed-wing recon band (800–2,000 m) and
 *                      the rotary/FPV deck. Anything that needs to be right
 *                      carries its own band.
 *  space    25,000 m — SYMBOLIC and flagged as such. A real LEO altitude is
 *                      ~400 km: fifty times the depth of the entire near
 *                      register, and drawing it true would put every space
 *                      asset off-scene. This is the one altitude in the file
 *                      that is not a physical claim.
 *  cyber_ew  3,000 m — airborne jammers only; every truck- and mast-mounted
 *  c2_comms  1,500 m   EW/C2 system in the dataset resolves to `land` and
 *                      sits at grade (src/data/placement.ts).
 *  sea          -3 m — waterline, not a hover.
 */
export const DOMAIN_ALTITUDE: Record<Domain, number> = {
  space: 25_000,
  air: 1_200,
  cyber_ew: 3_000,
  c2_comms: 1_500,
  land: 0,
  logistics: 0,
  medical: 0,
  sea: -3,
};

/** Above this altitude (metres) a platform is genuinely off the deck and gets
 *  the tether treatment. 50 m clears the FPV band's own floor of 30 m, so a
 *  quadcopter at treetop height reads as flying rather than as parked. */
export const ELEVATED_ALTITUDE_M = 50;

/** Ordering of platform domains across the strip's breadth. A sort key, not
 *  an absolute Z: assets are spread across the full breadth by band cohort
 *  (see lateralLayout) and this only decides which end of that breadth a
 *  domain tends toward. Scaled to metres alongside everything else. */
export const STRIP_Z: Record<Domain, number> = {
  land: 0,
  air: 200,
  space: 600,
  c2_comms: 1_500,
  logistics: 3_000,
  cyber_ew: -1_500,
  medical: -3_000,
  sea: -4_600,
};

/**
 * Half-width of the represented strip, in METRES. 6 km either side of the
 * scene's centreline — a 12 km frontage, which is a plausible brigade-ish
 * sector and, not by coincidence, wide enough to hold most of the ±10 km OSM
 * extract at its own true scale (osmTerrain.ts clips the remainder).
 *
 * Terrain and dressing run considerably further — see the two constants
 * below — so the plate never ends on a visible cut.
 */
export const STRIP_HALF_Z = 6_000;

/**
 * Three lateral extents, not one — the fix for a scene that read as a floating
 * tile even after the depth axis was right.
 *
 *   STRIP_HALF_Z     6 km  the REPRESENTED sector. Assets live here, and only
 *                          here: it is what the lateral layout spreads across
 *                          and what "a strip 12 km wide" in the UI means.
 *   SCENERY_HALF_Z  12 km  how far the dressing runs — trenches, obstacles,
 *                          treelines. A trench line that stops dead at the
 *                          sector boundary announces the boundary; one that
 *                          runs on past it and fades says the sector is a cut
 *                          from something larger, which is the truth.
 *   TERRAIN_HALF_Z  32 km  how far the GROUND runs. With yaw locked the camera
 *                          looks across the axis, so the near and far edges of
 *                          the plate are the two edges most often in frame;
 *                          at 6 km they were a visible cut a few degrees from
 *                          the subject. At 32 km, with the lateral haze fully
 *                          engaged well before it, the ground simply recedes.
 *
 * The cost is terrain vertices, and it is paid with a graded Z sampling the
 * same way the depth axis is graded (buildTerrain) rather than by uniformly
 * spending them on 26 km of deliberately-hazed ground.
 */
export const SCENERY_HALF_Z = 12_000;
export const TERRAIN_HALF_Z = 32_000;

/** Deterministic per-id hash — the same asset always lands in the same spot
 *  instead of reshuffling on every render. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export interface WorldPlacement {
  x: number;
  y: number;
  z: number;
}

/** Fraction of the strip's half-breadth the spread is allowed to use. Short of
 *  1 so the outermost asset still has terrain beyond it rather than sitting on
 *  the strip's cut edge. */
const SPREAD_FILL = 0.86;

/** Jitter as a fraction of the cohort's own slot pitch, so two neighbours
 *  always keep at least (1 − 2·JITTER_FRACTION) of their slot whatever the
 *  cohort size. */
const JITTER_FRACTION = 0.15;

/** Minimum ground-plane separation between any two same-side assets, in
 *  metres. 400 m is a real dispersal distance rather than a marker footprint:
 *  the markers are screen-constant symbols now (Scene3D), so this is about
 *  two systems not standing in each other's position, not about two discs
 *  overlapping. */
const MIN_SEPARATION = 400;
const RELAX_ITERATIONS = 6;

/** One asset's input to the lateral layout. */
export interface LateralItem {
  id: string;
  side: Side;
  km: number;
  platformDomain: Domain;
}

/** Cohort boundaries for the lateral spread, in km. Was "whichever band this
 *  km falls in", which tied the layout to the live band set; now a fixed
 *  ladder, for the same reason the axis itself no longer reads bands. The
 *  stops are the doctrine.md §2 depth structure the bands themselves follow,
 *  so the practical grouping is unchanged for the shipped band set. */
const COHORT_STOPS_KM = [5, 30, 150, 500];

/**
 * Lays every asset out across the strip's full breadth, by cohort.
 *
 * Assets sharing a (side, cohort) are distributed evenly across the breadth.
 * Sorting by platform domain keeps sea at one end and logistics at the other
 * — the domain read survives — while sorting by km *within* a domain means
 * the assets most likely to collide in X are the ones pushed furthest apart
 * in Z, which is precisely the separation that was wanted.
 *
 * Deterministic: same cohort in, same layout out, no dependence on render
 * order or on how many frames have gone by.
 */
export function lateralLayout(items: LateralItem[]): Map<string, number> {
  const half = STRIP_HALF_Z * SPREAD_FILL;
  const cohortFor = (km: number): number => {
    const i = COHORT_STOPS_KM.findIndex((stop) => km <= stop);
    return i === -1 ? COHORT_STOPS_KM.length : i;
  };

  const cohorts = new Map<string, LateralItem[]>();
  for (const item of items) {
    const key = `${item.side}:${cohortFor(item.km)}`;
    const list = cohorts.get(key);
    if (list) list.push(item);
    else cohorts.set(key, [item]);
  }

  const out = new Map<string, number>();
  for (const cohort of cohorts.values()) {
    const sorted = [...cohort].sort(
      (a, b) =>
        (STRIP_Z[a.platformDomain] ?? 0) - (STRIP_Z[b.platformDomain] ?? 0) ||
        a.km - b.km ||
        a.id.localeCompare(b.id),
    );
    const n = sorted.length;
    const pitch = n > 1 ? (2 * half) / (n - 1) : 0;
    sorted.forEach((item, i) => {
      // n === 1 lands at 0 rather than at an arbitrary edge.
      const t = n === 1 ? 0.5 : i / (n - 1);
      // Deterministic jitter, scaled to the pitch so it can never close a gap.
      const jitter = (hashId(item.id) - 0.5) * pitch * 2 * JITTER_FRACTION;
      out.set(item.id, (t - 0.5) * 2 * half + jitter);
    });
  }

  // ── cross-cohort relaxation ────────────────────────────────────────────
  // Spreading each cohort independently guarantees separation *within* a
  // cohort and says nothing across them: two assets either side of a cohort
  // boundary can sit metres apart in X and draw their Z from unrelated
  // layouts. A few iterations of pairwise push-apart fix that directly.
  //
  // Only Z moves. X encodes the asset's actual distance from the zero line and
  // is the one number this whole view promises is true — the ruler, the 2D
  // schematic and the detail panel all have to agree with it, so it is never
  // nudged for layout's sake.
  const all = items.map((item) => ({
    item,
    x: worldXFor(item.side, item.km),
    z: out.get(item.id) ?? 0,
  }));
  all.sort((a, b) => a.x - b.x || a.item.id.localeCompare(b.item.id));

  for (let pass = 0; pass < RELAX_ITERATIONS; pass++) {
    let moved = false;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        // Sorted by x, so once the x gap alone exceeds the threshold every
        // later j is further still — nothing more to check for this i.
        if (b.x - a.x >= MIN_SEPARATION) break;
        if (a.item.side !== b.item.side) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= MIN_SEPARATION) continue;
        // How far apart they still need to get, along Z only.
        const needZ = Math.sqrt(Math.max(0, MIN_SEPARATION * MIN_SEPARATION - dx * dx));
        const push = (needZ - Math.abs(dz)) / 2;
        if (push <= 0) continue;
        const dir = dz === 0 ? (hashId(a.item.id) < hashId(b.item.id) ? -1 : 1) : Math.sign(dz);
        a.z = clamp(a.z - dir * push, -STRIP_HALF_Z, STRIP_HALF_Z);
        b.z = clamp(b.z + dir * push, -STRIP_HALF_Z, STRIP_HALF_Z);
        moved = true;
      }
    }
    if (!moved) break;
  }

  for (const entry of all) out.set(entry.item.id, entry.z);
  return out;
}

/** Local clamp — this module stays free of a three.js import so it can be
 *  exercised by a plain node harness. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Places one asset in the 3D world. `z` comes from lateralLayout() above;
 * `altitudeM` — a real height in metres, resolved by the caller from the
 * asset's own `altitude_band_m` or, failing that, DOMAIN_ALTITUDE keyed on
 * the PLATFORM domain, never the engagement domain.
 */
export function worldPlacement(opts: {
  side: Side;
  km: number;
  z: number;
  altitudeM: number;
  terrainHeightAt?: (x: number, z: number) => number;
}): WorldPlacement {
  const { side, km, z, altitudeM } = opts;

  const x = worldXFor(side, km);

  // Ground-bound assets ride the terrain surface; airborne ones are measured
  // from mean ground so they don't bob with the hills underneath them.
  const ground =
    altitudeM <= ELEVATED_ALTITUDE_M && opts.terrainHeightAt ? opts.terrainHeightAt(x, z) : 0;
  const y = altitudeM + ground;

  return { x, y, z };
}

/** World-unit X of a given distance/side — used by the ruler ticks, the
 *  scenery/feature tables and the zero-line marker, so everything stays
 *  locked to the same axis as the assets. */
export function worldXFor(side: Side, km: number): number {
  return (side === "side_a" ? -1 : 1) * depthUnitsFor(km);
}

/** Inverse of worldXFor — world-unit X (magnitude, either side) back to km.
 *  Closed form as of Pass 24: the old binary search existed because
 *  `Projection.xFor()` folded in a lane-oblique term and a zero-line gutter
 *  that could not be inverted in closed form. depthAxis.ts has neither. */
export function worldXToKm(_side: Side, worldX: number): number {
  return Math.min(MAX_DEPTH_KM, kmForDepthUnits(Math.abs(worldX)));
}

/** Total half-extent of the world along X, world units. */
export function worldHalfWidth(): number {
  return HALF_EXTENT_UNITS;
}

/** Convenience for callers that think in km-per-unit. */
export const METRES_PER_KM = UNITS_PER_KM;
