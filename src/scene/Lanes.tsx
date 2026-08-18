// Domain lanes: the horizontal slabs the assets sit on, one per entry in
// domains.json, ordered by `vertical_order`. Each lane steps left as you go
// down, which is what gives the stack its oblique cross-section read.
import { Fragment } from "react";
import type { DomainLayer, Side } from "../types";
import type { Projection } from "./projection";
import { DOMAIN_ACCENT, SIDE_ACCENT, SIDE_LABELS, VIEW } from "../config/ui";
import { terrainTexture } from "./terrain";

interface Props {
  domains: DomainLayer[];
  proj: Projection;
  visibleSides: Set<Side>;
}

export function Lanes({ domains, proj, visibleSides }: Props) {
  const laneH = VIEW.laneHeightPx;

  return (
    <div className="lanes" aria-hidden="true">
      {domains.map((domain, laneIndex) => {
        const accent = DOMAIN_ACCENT[domain.id] ?? "#7f8794";
        const top = proj.laneY(laneIndex) - laneH / 2;
        const offsetX = proj.laneOffsetX(laneIndex);
        const zeroX = proj.zeroXAt(laneIndex);
        return (
          <Fragment key={domain.id}>
            <div
              className="lane"
              style={{
                top,
                height: laneH,
                left: VIEW.scenePadPx.x + offsetX,
                width: proj.halfWidthPx * 2 + VIEW.zeroGutterPx,
                ["--lane-accent" as string]: accent,
              }}
            >
              <div className="lane__face" />
              <div
                className="lane__terrain lane__terrain--a"
                style={{
                  right: "50%",
                  backgroundImage: terrainTexture(domain.id, 1),
                }}
              />
              <div
                className="lane__terrain lane__terrain--b"
                style={{
                  left: "50%",
                  backgroundImage: terrainTexture(domain.id, 7),
                }}
              />
              <div className="lane__grid">
                {proj.spans.map((span) => (
                  <Fragment key={span.band.id}>
                    <span
                      className="lane__band-edge"
                      style={{ left: proj.halfWidthPx - span.endPx }}
                    />
                    <span
                      className="lane__band-edge"
                      style={{
                        left: proj.halfWidthPx + VIEW.zeroGutterPx + span.endPx,
                      }}
                    />
                  </Fragment>
                ))}
              </div>
            </div>

            {/* Zero line segment for this lane — the staircase down the middle. */}
            <div
              className="zero-line"
              style={{ top, height: laneH, left: zeroX - 1 }}
            />

            {/* Side tint, so which half of the map you are on is readable at a glance. */}
            {(["side_a", "side_b"] as Side[]).map((side) => {
              const dim = !visibleSides.has(side);
              const width = proj.halfWidthPx;
              const left =
                side === "side_a"
                  ? zeroX - VIEW.zeroGutterPx / 2 - width
                  : zeroX + VIEW.zeroGutterPx / 2;
              return (
                <div
                  key={side}
                  className={`lane__side-tint${dim ? " is-dim" : ""}`}
                  style={{
                    top,
                    height: laneH,
                    left,
                    width,
                    ["--side-soft" as string]: SIDE_ACCENT[side].soft,
                  }}
                  title={SIDE_LABELS[side].long}
                />
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
