// ─────────────────────────────────────────────────────────────────────────
// THE SPATIAL CONTRACT — Pass 24.
//
// One module, one rule, and every other file in src/three/ obeys it.
//
// What it replaces. Until this pass the 3D scene mapped km → world X through
// `Projection.xFor()`: a per-band pixel allocation (400px for 0–5 km, 420px
// for 500–4300 km) invented for the 2D schematic view. That is a legitimate
// schematic device and a fatal one for a 3D scene, because it makes the same
// picture claim two scales at once — real OSM geometry drawn at roughly 1:1
// in one band, and 3,800 km of depth folded into the width of the band next
// to it. Every symptom Pass 24 was sent to fix descends from that single
// contradiction: assets on absurd stalks, model scale that could not be made
// correct because there was no scale to be correct against, air altitude that
// meant nothing, a hard-edged terrain plate with no principled place to end.
//
// The rule. **One continuous scene, two registers, along a locked depth axis.**
//
//   NEAR REGISTER — 0 … TRUE_SCALE_DEPTH_KM, true scale.
//     One world unit is one metre. Position is linear in real distance,
//     terrain and OSM geometry are 1:1, and altitude and model size are
//     physically correct against both. Nothing here is a compromise.
//
//   FAR REGISTER — TRUE_SCALE_DEPTH_KM … MAX_DEPTH_KM, compressed.
//     Position follows a logarithm anchored to the near register's own slope,
//     so the two registers meet with no seam: same value AND same first
//     derivative at the boundary (see FAR_SOFTNESS_KM). Fidelity degrades
//     *with* the compression — that is the honest signal that beyond here the
//     geography is schematic, not a place.
//
// Why a logarithm and not a power law or a fixed set of band widths:
//   * monotonic and strictly increasing, so ordering is never violated — an
//     asset at 300 km can never draw nearer than one at 200 km, whatever the
//     roster does;
//   * analytically invertible, which drag-to-reposition needs (worldXToKm)
//     and which the old per-band mapping could only answer by binary search;
//   * slope-matchable at the boundary, which is what makes the transition
//     invisible. A power law can match the value but not the derivative
//     without a second free parameter, and a piecewise-linear ramp cannot
//     match the derivative at all — that discontinuity is exactly the class
//     of artifact Pass 17 root-caused in the old distance graticule.
//
// The constants are argued in docs/DECISIONS.md Pass 24 against
// docs/doctrine.md §2, not chosen for how the picture looked.
// ─────────────────────────────────────────────────────────────────────────

/**
 * One world unit = one metre. This is the number the whole pass turns on.
 *
 * It is not arbitrary: `src/three/models.ts` has always authored hero
 * geometry at roughly metre scale (a main battle tank hull is 7.0 units long,
 * a road wheel 0.72 across, a rifle 1.5), it just never had an axis that
 * agreed with it. Declaring the unit to be a metre makes the most numerous
 * and most carefully proportioned geometry in the repo correct *by
 * construction* rather than by a fudge factor, and makes an altitude in
 * metres and an OSM extract in km directly usable without conversion.
 */
export const UNITS_PER_KM = 1000;

/**
 * Depth, each side of the zero line, drawn at true scale.
 *
 * docs/doctrine.md §2 gives the sourced structure this has to respect:
 *   • 0–5 km   FPV / short-range attack envelope, "the dominant killing zone";
 *   • 0–10 km  close reconnaissance, continuous observation;
 *   • ~0–30 km the drone-dense corridor either side of the line — §2's
 *              explicit figure, and the band the whole tool is really about;
 *   • 10–70 km medium/long-range strike and deep reconnaissance, which starts
 *              inside that corridor and runs well past it.
 * 40 km sits just past the sourced 30 km corridor, so the entire drone-dense
 * belt plus a margin renders at true scale, while the strike-and-recon layer
 * that continues past it crosses the boundary rather than being cut by it.
 * Going to 70 km to swallow that layer whole would have spent 140 km of
 * true-scale depth on ground the roster barely populates; going to 30 km
 * would have put the boundary exactly on a sourced number and invited the
 * reading that something changes *at* 30 km, which nothing does.
 */
export const TRUE_SCALE_DEPTH_KM = 40;

/**
 * Deepest distance the axis draws. Matches VIEW.openEndedDisplayCapKm — the
 * reach of Ukraine's "Spiderweb" operation, the deepest thing on the roster.
 */
export const MAX_DEPTH_KM = 4300;

/** True-scale depth, in world units. */
export const TRUE_SCALE_DEPTH_UNITS = TRUE_SCALE_DEPTH_KM * UNITS_PER_KM;

/**
 * World units the compressed register is allowed to occupy, per side.
 *
 * 30 km of screen depth for 4,260 km of real depth, against 40 km of screen
 * depth for the first 40 km. So the near register takes 57% of the axis for
 * 0.9% of the distance — the compression is not subtle, and it is not
 * supposed to be. The ruler shows it and the fidelity gradient explains it.
 */
export const FAR_REGISTER_UNITS = 30_000;

/**
 * The logarithm's soft length, in km — the only free parameter, and it is
 * solved, not chosen: it is the value that makes the far register span
 * exactly FAR_REGISTER_UNITS given the near register's slope. Bisection at
 * module load rather than a baked constant so the three numbers above stay
 * the editable ones and this can never silently disagree with them.
 *
 * Solves  UNITS_PER_KM · L · ln(1 + (MAX_DEPTH_KM − D)/L) = FAR_REGISTER_UNITS.
 */
export const FAR_SOFTNESS_KM = (() => {
  const span = MAX_DEPTH_KM - TRUE_SCALE_DEPTH_KM;
  const target = FAR_REGISTER_UNITS / UNITS_PER_KM;
  const f = (L: number) => L * Math.log(1 + span / L);
  // f is increasing in L over (0, ∞): more softness ⇒ less compression.
  let lo = 1e-4;
  let hi = span;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();

/** Half the axis's total world extent — the deepest rear, in world units. */
export const HALF_EXTENT_UNITS = TRUE_SCALE_DEPTH_UNITS + FAR_REGISTER_UNITS;

/**
 * Distance from the zero line, in km → depth along the axis, in world units.
 * Magnitude only; the caller applies the side's sign.
 *
 * Strictly increasing everywhere, C¹ at TRUE_SCALE_DEPTH_KM by construction.
 */
export function depthUnitsFor(km: number): number {
  const d = Math.max(0, km);
  if (d <= TRUE_SCALE_DEPTH_KM) return d * UNITS_PER_KM;
  const L = FAR_SOFTNESS_KM;
  return (
    TRUE_SCALE_DEPTH_UNITS + UNITS_PER_KM * L * Math.log(1 + (d - TRUE_SCALE_DEPTH_KM) / L)
  );
}

/** Exact inverse of depthUnitsFor — what drag-to-reposition turns a drop
 *  point back into. Closed form, not a search: that is half of why the
 *  function is a logarithm. */
export function kmForDepthUnits(units: number): number {
  const u = Math.max(0, units);
  if (u <= TRUE_SCALE_DEPTH_UNITS) return u / UNITS_PER_KM;
  const L = FAR_SOFTNESS_KM;
  return (
    TRUE_SCALE_DEPTH_KM + L * (Math.exp((u - TRUE_SCALE_DEPTH_UNITS) / (UNITS_PER_KM * L)) - 1)
  );
}

/** d(units)/d(km) at a distance — the axis's local scale. UNITS_PER_KM
 *  throughout the near register, falling away hyperbolically past it. */
export function axisSlopeAt(km: number): number {
  const d = Math.max(0, km);
  if (d <= TRUE_SCALE_DEPTH_KM) return UNITS_PER_KM;
  const L = FAR_SOFTNESS_KM;
  return (UNITS_PER_KM * L) / (L + d - TRUE_SCALE_DEPTH_KM);
}

/**
 * How hard the axis is squeezing at a distance: 1 in the near register,
 * growing without bound in the far one (≈26× at 150 km, ≈115× at 500 km,
 * ≈978× at 4,300 km).
 *
 * This is the single number the fidelity gradient and the far-register model
 * scale are both derived from, so "detail degrades with the compression" is a
 * literal statement about the code rather than a description of an intent.
 */
export function compressionAt(km: number): number {
  return UNITS_PER_KM / axisSlopeAt(km);
}

/** Same question asked in world units instead of km — what the terrain and
 *  scatter loops actually have in hand. */
export function compressionAtUnits(units: number): number {
  return compressionAt(kmForDepthUnits(Math.abs(units)));
}

/**
 * Visual fidelity at a depth: 1 where the ground is a place, 0 where it is a
 * schematic silhouette. A reciprocal of the compression rather than a
 * distance ramp, so it is the *same* curve the position mapping uses — the
 * detail fades exactly as fast as the geography stops being true, which is
 * the rule this pass is asserting.
 *
 * `k` sets how quickly: fidelity is 0.5 where the axis compresses by k.
 */
export function fidelityAtUnits(units: number, k = 6): number {
  const c = compressionAtUnits(units);
  return k / (k + (c - 1));
}

/**
 * Model scale in the far register. Position is compressed; a model is not —
 * squashing a 7 m hull by 978× would render it as nothing, and stretching the
 * axis to keep it honest is the contradiction this whole module removes. So
 * model scale is *decoupled* from position past the boundary and clamped, per
 * Pass 24's brief: a far-register model is drawn at the apparent size it
 * would have had at the boundary, up to FAR_MODEL_SCALE_MAX.
 *
 * 1 everywhere inside the near register, so nothing true-scale is ever
 * touched by this.
 */
export const FAR_MODEL_SCALE_MAX = 16;
export function modelScaleFor(km: number): number {
  const c = compressionAt(km);
  return Math.min(FAR_MODEL_SCALE_MAX, Math.max(1, c));
}

/** Human-readable one-liner for the info affordance and the DECISIONS entry.
 *  Derived from the constants so it can never drift from them. */
export function compressionSummary(): string {
  const at = (km: number) => Math.round(compressionAt(km));
  return (
    `0–${TRUE_SCALE_DEPTH_KM} km is drawn at true scale (1 unit = 1 m). ` +
    `Past ${TRUE_SCALE_DEPTH_KM} km the axis compresses logarithmically — ` +
    `about ${at(150)}× at 150 km, ${at(500)}× at 500 km and ${at(MAX_DEPTH_KM)}× at ` +
    `${MAX_DEPTH_KM.toLocaleString()} km — so every label still states its true distance ` +
    `while the far bands visibly squeeze toward the horizon.`
  );
}
