// Persistent distance ruler. Sticks to the top of the scroll container so it
// stays visible while you move vertically between domains, and scrolls
// horizontally with the battlefield so a reading is always literal.
//
// Each side is labelled independently, outward from the zero line. Bands do
// not share a linear scale (see projection.ts), so ticks are generated per
// band at a step that suits that band's span — the density change is the
// visible cue that the axis is compressed.
import { Fragment } from "react";
import type { Side } from "../types";
import { MARKER_ROW_H, RULER_AXIS_H, type PackedMarker, type Projection } from "./projection";
import { SIDE_ACCENT, SIDE_DIRECTION, SIDE_LABELS, VIEW } from "../config/ui";

const NICE_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500];

function niceStep(span: number, target = 5): number {
  const raw = span / target;
  return NICE_STEPS.find((s) => s >= raw) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

interface Props {
  proj: Projection;
  visibleSides: Set<Side>;
  /** Pre-packed doctrine rows; the caller owns them because the ruler's height
   *  depends on how many rows they need, and the domain rail has to line up
   *  underneath it. */
  markerRows: PackedMarker[];
  showMarkers: boolean;
  height: number;
}

// Ruler positions come straight from proj.xFor(..., laneIndex 0), which already
// carries the top lane's oblique offset — the inner wrapper must not translate
// again or every reading lands one lane-step off.
export function Ruler({ proj, visibleSides, markerRows, showMarkers, height }: Props) {
  const sides: Side[] = ["side_a", "side_b"];

  return (
    <div
      className="ruler"
      style={{ width: proj.sceneWidthPx, height }}
      role="img"
      aria-label="Distance from the zero line, in kilometres, labelled independently for each side."
    >
      <div className="ruler__inner">
        {sides.map((side) => {
          const dir = SIDE_DIRECTION[side];
          const dim = !visibleSides.has(side);
          return (
            <Fragment key={side}>
              {proj.spans.map((span) => {
                const startAbs = proj.xFor(side, span.band.min_km, 0);
                const endAbs = proj.xFor(side, span.displayMaxKm, 0);
                const left = Math.min(startAbs, endAbs);
                const width = Math.abs(endAbs - startAbs);
                const step = niceStep(span.displayMaxKm - span.band.min_km);
                const ticks: number[] = [];
                for (let km = span.band.min_km; km <= span.displayMaxKm + 1e-6; km += step) {
                  ticks.push(Math.round(km));
                }
                const openEnded = span.band.max_km >= 10_000;
                return (
                  <div
                    key={`${side}-${span.band.id}`}
                    className={`ruler__band${dim ? " is-dim" : ""}`}
                    style={{
                      left,
                      width,
                      ["--side-base" as string]: SIDE_ACCENT[side].base,
                    }}
                  >
                    <div className="ruler__band-label">
                      {span.band.label}
                      {openEnded ? " +" : ""}
                    </div>
                    <div className="ruler__ticks">
                      {ticks.map((km) => {
                        const x = proj.xFor(side, km, 0) - left;
                        const major = km === span.band.min_km || km === Math.round(span.displayMaxKm);
                        return (
                          <span
                            key={km}
                            className={`ruler__tick${major ? " is-major" : ""}`}
                            style={{ left: x }}
                          >
                            <i />
                            <b>
                              {km}
                              {openEnded && km === Math.round(span.displayMaxKm) ? "+" : ""}
                            </b>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div
                className={`ruler__side-name${dim ? " is-dim" : ""}`}
                style={{
                  left: proj.xFor(side, 0, 0) + dir * (VIEW.zeroGutterPx / 2 + 14),
                  transform: dir === -1 ? "translateX(-100%)" : "none",
                  color: SIDE_ACCENT[side].text,
                }}
              >
                {SIDE_LABELS[side].short} — rear {dir === -1 ? "◀" : "▶"}
              </div>
            </Fragment>
          );
        })}

        <div className="ruler__zero" style={{ left: proj.zeroXAt(0) }}>
          <span>ZERO LINE</span>
        </div>

        {showMarkers && (
          <div className="ruler__markers" style={{ top: RULER_AXIS_H }}>
            {markerRows
              .filter((r) => visibleSides.has(r.side))
              .map((r) => (
                <div
                  key={`${r.marker.id}-${r.side}`}
                  className="ruler__marker"
                  style={{
                    left: r.left,
                    width: r.width,
                    top: r.row * MARKER_ROW_H,
                    ["--side-base" as string]: SIDE_ACCENT[r.side].base,
                  }}
                  title={`${r.marker.label} — ${r.marker.min_km}–${r.marker.max_km} km. ${r.marker.note} [${r.marker.source_tag}]`}
                >
                  <span className="ruler__marker-label">{r.marker.label}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
