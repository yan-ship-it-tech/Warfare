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

/** Altitude per domain, in world units. Ground-level domains share Y = 0 and
 *  are separated on Z instead (see STRIP_Z) — stacking logistics above land
 *  would assert a height difference that isn't real. Air and space are the
 *  only genuinely elevated tiers, plus EW's mast-height emitters. */
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

/** Lateral lane per domain across the strip, in world units. */
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

/**
 * Places one asset in the 3D world. `subRow` comes from the same
 * collision-packing the 2D view already does (placeNodes), so two assets at
 * the same distance separate here exactly as they separate there — just on
 * Z instead of on a sub-row offset in Y.
 */
export function worldPlacement(opts: {
  id: string;
  side: Side;
  domain: Domain;
  km: number;
  subRow: number;
  proj: Projection;
  terrainHeightAt?: (x: number, z: number) => number;
}): WorldPlacement {
  const { id, side, domain, km, subRow, proj } = opts;

  const x = (proj.xFor(side, km, 0) - proj.centerXPx) / PX_PER_UNIT;

  const jitter = (hashId(id) - 0.5) * 7;
  const z = STRIP_Z[domain] + subRow * 8.5 + jitter;

  const altitude = DOMAIN_ALTITUDE[domain] ?? 0;
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
