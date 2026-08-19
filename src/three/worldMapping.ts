// ─────────────────────────────────────────────────────────────────────────
// Battlefield → 3D world coordinates.
//
// The contract that makes this safe: this module NEVER recomputes distance.
// It consumes `Projection.xFor()` from src/scene/projection.ts — the exact
// same per-band, non-linear screen allocation the 2D schematic view and the
// ruler have always used — and only converts the result into world units.
// Pass 5's finding stands unchanged: real geography cannot put a 0–5 km FPV
// envelope and a 500 km deep-strike target on one legible axis, so the axis
// stays band-compressed. What changed in Pass 6 is only how the ground under
// that axis is *drawn*. See docs/DECISIONS.md Pass 6.
//
// Axes:
//   X  distance from the zero line (band-compressed). Zero line at X = 0,
//      side_a negative, side_b positive — same handedness as the 2D view.
//   Y  altitude. This is the thing the 2D view could never express: air and
//      space sit genuinely above the ground plane, not in a lane below it.
//   Z  lateral position across a representative strip. The scene is a strip
//      a few km wide and the full rear-to-rear depth, per explicit scope —
//      Z separates ground domains from each other and spreads co-located
//      assets, and carries no distance claim of its own.
// ─────────────────────────────────────────────────────────────────────────
import type { Domain, Side } from "../types";
import type { Projection } from "../scene/projection";

/** Scene pixels per world unit. Tuned so the full rear-to-rear span is a
 *  comfortable camera distance rather than a number chosen for its own sake. */
export const PX_PER_UNIT = 12;

/** Altitude per PLATFORM domain, in world units — i.e. keyed by where the
 *  hardware physically sits, never by what it shoots at. Feeding this the
 *  engagement domain is what left every SAM battery hovering; see
 *  src/data/placement.ts. Ground-level platforms share Y = 0 and are separated
 *  on Z instead — stacking logistics above land would assert a height
 *  difference that isn't real.
 *
 *  cyber_ew and c2_comms keep a nonzero altitude for the genuinely airborne or
 *  orbital members of those domains; every ground-mounted jammer and command
 *  post in the dataset now resolves to a `land` platform and sits at grade. */
export const DOMAIN_ALTITUDE: Record<Domain, number> = {
  space: 96,
  air: 32,
  cyber_ew: 11,
  c2_comms: 4,
  land: 0,
  logistics: 0,
  medical: 0,
  sea: -1.4,
};

/** Ordering of platform domains across the strip's breadth. Pass 8 demoted
 *  this from an absolute Z position to a sort key: assets are now spread
 *  across the full breadth by band cohort (see lateralLayout), and this only
 *  decides which end of that breadth a given domain tends toward — so sea
 *  still gathers to one side and logistics to the other without every land
 *  asset being pinned to a single crowded line down the middle. */
export const STRIP_Z: Record<Domain, number> = {
  land: 0,
  air: 2,
  space: 6,
  c2_comms: 15,
  logistics: 30,
  cyber_ew: -15,
  medical: -30,
  sea: -46,
};

/** Half-width of the represented strip, world units. Terrain is generated to
 *  this extent plus a margin so the strip's edges fall outside the frame. */
export const STRIP_HALF_Z = 62;

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

/** Jitter as a fraction of the cohort's own slot pitch. Fixed-magnitude jitter
 *  was the first version and it was wrong: ±2.5 units against a pitch of ~5.4
 *  can close a neighbouring pair to almost nothing. Scaling it to the pitch
 *  means two neighbours always keep at least (1 − 2·JITTER_FRACTION) of their
 *  slot, whatever the cohort size. */
const JITTER_FRACTION = 0.15;

/** Minimum ground-plane separation between any two same-side assets, world
 *  units — a bit over the marker/ring footprint so rings don't overlap. */
const MIN_SEPARATION = 4.6;
const RELAX_ITERATIONS = 6;

/** One asset's input to the lateral layout. */
export interface LateralItem {
  id: string;
  side: Side;
  km: number;
  platformDomain: Domain;
}

/**
 * Lays every asset out across the strip's full breadth, by band cohort.
 *
 * The old rule was `STRIP_Z[domain] + subRow * 8.5 + jitter`, which had two
 * compounding problems at 87 assets: the domain lanes it keyed off are only
 * ~2 units apart for the common cases (land 0, air 2), and `subRow` came from
 * the 2D packer, which caps at VIEW.maxSubRows = 3. So the 42 land assets were
 * competing for a band of Z barely 30 units wide inside a strip 124 wide, and
 * everything piled up down the middle with the edges left empty.
 *
 * Now: assets sharing a (side, band) cohort are distributed evenly across the
 * breadth. Sorting by platform domain keeps sea at one end and logistics at
 * the other — the domain read survives — while sorting by km *within* a domain
 * means the assets most likely to collide in X are the ones pushed furthest
 * apart in Z, which is precisely the separation that was wanted.
 *
 * Deterministic: same cohort in, same layout out, no dependence on render
 * order or on how many frames have gone by.
 */
export function lateralLayout(items: LateralItem[], proj: Projection): Map<string, number> {
  const half = STRIP_HALF_Z * SPREAD_FILL;
  const bandIndexFor = (km: number): number => {
    const i = proj.spans.findIndex((s) => km <= s.band.max_km);
    return i === -1 ? proj.spans.length : i;
  };

  const cohorts = new Map<string, LateralItem[]>();
  for (const item of items) {
    const key = `${item.side}:${bandIndexFor(item.km)}`;
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
  // Spreading each cohort independently guarantees separation *within* a band
  // and says nothing across bands: two assets either side of a band boundary
  // sit only a couple of world units apart in X and draw their Z from
  // unrelated layouts, so they could still land on top of each other. A few
  // iterations of pairwise push-apart fix that directly rather than leaving it
  // to luck.
  //
  // Only Z moves. X encodes the asset's actual distance from the zero line and
  // is the one number this whole view promises is true — the ruler, the 2D
  // schematic and the detail panel all have to agree with it, so it is never
  // nudged for layout's sake.
  const all = items.map((item) => ({
    item,
    x: (proj.xFor(item.side, item.km, 0) - proj.centerXPx) / PX_PER_UNIT,
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
        a.z = THREE_CLAMP(a.z - dir * push, -STRIP_HALF_Z, STRIP_HALF_Z);
        b.z = THREE_CLAMP(b.z + dir * push, -STRIP_HALF_Z, STRIP_HALF_Z);
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
function THREE_CLAMP(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Places one asset in the 3D world. `z` comes from lateralLayout() above;
 * `platformDomain` — not the engagement domain — decides the altitude.
 */
export function worldPlacement(opts: {
  side: Side;
  platformDomain: Domain;
  km: number;
  z: number;
  proj: Projection;
  terrainHeightAt?: (x: number, z: number) => number;
}): WorldPlacement {
  const { side, platformDomain, km, z, proj } = opts;

  const x = (proj.xFor(side, km, 0) - proj.centerXPx) / PX_PER_UNIT;

  const altitude = DOMAIN_ALTITUDE[platformDomain] ?? 0;
  // Ground-bound assets ride the terrain surface; airborne ones are measured
  // from mean ground so they don't bob with the hills underneath them.
  const ground = altitude <= 4 && opts.terrainHeightAt ? opts.terrainHeightAt(x, z) : 0;
  const y = altitude + ground;

  return { x, y, z };
}

/** World-unit X of a given distance/side — used by the ruler ticks and the
 *  zero-line marker so both stay locked to the same axis as the assets. */
export function worldXFor(side: Side, km: number, proj: Projection): number {
  return (proj.xFor(side, km, 0) - proj.centerXPx) / PX_PER_UNIT;
}

/** Total half-extent of the world along X, world units. */
export function worldHalfWidth(proj: Projection): number {
  return (proj.halfWidthPx + 70) / PX_PER_UNIT;
}
