// ─────────────────────────────────────────────────────────────────────────
// Distance ruler for the 3D view (Pass 13 item 9).
//
// The X axis is band-compressed on purpose — 0–5 km and 500 km+ cannot share
// a linear axis and both stay legible (docs/DECISIONS.md Pass 5/6). The 2D
// schematic has had a ruler since the beginning and the 3D view never did,
// so in the default view there was nothing at all telling a reader that a
// centimetre near the zero line and a centimetre out in the deep rear are
// not the same distance.
//
// The rule this file follows, and the reason it does not just draw a bar with
// evenly spaced numbers on it: **ticks are laid out at a constant step in
// KILOMETRES, and drawn wherever that km lands on screen.** The uneven
// spacing that results IS the compression, shown rather than described — the
// tactical band's 1 km ticks stand well apart, the deep-strategic band's
// 500 km ticks crowd together, and the change in density between them is the
// visible cue. A ruler with evenly spaced ticks would be a linear scale over
// a non-linear axis, i.e. a lie.
//
// This module only derives the model — which ticks exist and what world X
// each sits at. Projecting them to screen and writing them into the DOM is
// Scene3D's render loop, because it has to happen in the same frame as the
// scene draw or the ruler lags the terrain it is measuring.
// ─────────────────────────────────────────────────────────────────────────
import type { Projection } from "../scene/projection";
import type { Side } from "../types";
import { SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { worldXFor } from "./worldMapping";

/** Step sizes a reader can do arithmetic with. Same list the 2D ruler uses
 *  (src/scene/Ruler.tsx) — the two views must not label the same axis with
 *  different numbers. */
const NICE_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

function niceStep(span: number, target = 4): number {
  const raw = span / target;
  return NICE_STEPS.find((s) => s >= raw) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

export interface RulerTick {
  key: string;
  side: Side;
  km: number;
  worldX: number;
  /** Band edges are majors: they get a taller tick and always keep their
   *  label, because they are where the scale changes. */
  major: boolean;
  label: string;
  color: string;
}

export interface RulerBand {
  key: string;
  side: Side;
  label: string;
  /** World X of the band's near and far edges, in that order. */
  x0: number;
  x1: number;
  color: string;
}

export interface RulerModel {
  ticks: RulerTick[];
  bands: RulerBand[];
  /** Extremes of the whole axis, used to detect the camera looking straight
   *  down the axis (where a screen-space ruler degenerates). */
  minWorldX: number;
  maxWorldX: number;
  sideNames: Record<Side, string>;
}

export function buildRulerModel(proj: Projection): RulerModel {
  const ticks: RulerTick[] = [];
  const bands: RulerBand[] = [];
  let minWorldX = 0;
  let maxWorldX = 0;

  for (const side of ["side_a", "side_b"] as Side[]) {
    const color = SIDE_ACCENT[side].base;
    // Per SIDE, not per band: adjacent bands share an edge (one's max_km is
    // the next's min_km), so a per-band set let the same kilometre emit two
    // ticks landing on the exact same pixel.
    const seen = new Set<number>();
    for (const span of proj.spans) {
      const x0 = worldXFor(side, span.band.min_km, proj);
      const x1 = worldXFor(side, span.displayMaxKm, proj);
      minWorldX = Math.min(minWorldX, x0, x1);
      maxWorldX = Math.max(maxWorldX, x0, x1);
      const openEnded = span.band.max_km >= 10_000;
      bands.push({
        key: `${side}:${span.band.id}`,
        side,
        label: span.band.label + (openEnded ? " +" : ""),
        x0,
        x1,
        color,
      });

      const step = niceStep(span.displayMaxKm - span.band.min_km);
      // Interior ticks at a constant km step, plus the band's own far edge as
      // a major — the edge is the point where the scale changes, so it is the
      // one tick that must never be dropped to a collision.
      for (let km = span.band.min_km; km <= span.displayMaxKm + 1e-6; km += step) {
        const r = Math.round(km);
        // Both sides' innermost band starts at 0 km and both would draw their
        // own "0" on top of the other's, plus the zero line is already marked
        // in the scene. Exactly one zero on the whole ruler, and it is not
        // this one.
        if (r === 0 || seen.has(r)) continue;
        seen.add(r);
        ticks.push({
          key: `${side}:${span.band.id}:${r}`,
          side,
          km: r,
          worldX: worldXFor(side, r, proj),
          major: false,
          label: String(r),
          color,
        });
      }
      const edge = Math.round(span.displayMaxKm);
      if (edge !== 0) {
        const existing = ticks.find((t) => t.side === side && t.km === edge);
        if (existing) existing.major = true;
        else if (!seen.has(edge)) {
          seen.add(edge);
          ticks.push({
            key: `${side}:${span.band.id}:edge${edge}`,
            side,
            km: edge,
            worldX: worldXFor(side, edge, proj),
            major: true,
            label: `${edge}${openEnded ? "+" : ""}`,
            color,
          });
        }
      }
    }
  }

  ticks.sort((a, b) => a.worldX - b.worldX);

  return {
    ticks,
    bands,
    minWorldX,
    maxWorldX,
    sideNames: { side_a: SIDE_LABELS.side_a.short, side_b: SIDE_LABELS.side_b.short },
  };
}
