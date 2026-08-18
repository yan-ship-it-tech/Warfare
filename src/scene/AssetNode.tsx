// A single placed node: either a real asset or a pending stub standing in for
// an asset a connection points at but which has not been built yet.
import { useEffect, useState } from "react";
import type { PlacedNode } from "./projection";
import { resolveIcon } from "../icons/registry";
import { resolveVignette } from "./vignettes";
import { DOMAIN_ACCENT, SIDE_ACCENT, SIDE_DIRECTION } from "../config/ui";

interface Props {
  placed: PlacedNode;
  selected: boolean;
  hovered: boolean;
  /** Dimmed when a selection elsewhere has focus and this node is not connected to it. */
  faded: boolean;
  /** Bumped to replay the vignette without re-selecting. */
  replayNonce: number;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function AssetNode({
  placed,
  selected,
  hovered,
  faded,
  replayNonce,
  onSelect,
  onHover,
}: Props) {
  const { node, x, y } = placed;
  const isStub = node.kind === "stub";
  const side = isStub ? node.stub.side : node.asset.side;
  const domain = isStub ? node.stub.domain : node.asset.domain;
  const label = isStub ? node.stub.label : node.asset.name;
  const km = isStub ? node.stub.distance_km_from_zero : node.asset.distance_km_from_zero;
  const category = isStub ? undefined : node.asset.category;
  const iconPath = isStub ? "" : node.asset.icon_image;

  const Icon = resolveIcon({ category, id: node.id, domain });
  const [imageFailed, setImageFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  const { vignette } = resolveVignette(
    isStub ? undefined : node.asset.reactive_behavior?.animation_id,
  );

  // Play the vignette on select, and again whenever the replay nonce moves.
  useEffect(() => {
    if (!selected || isStub) return;
    setPlaying(true);
    const t = window.setTimeout(() => setPlaying(false), vignette.durationMs);
    return () => window.clearTimeout(t);
  }, [selected, replayNonce, vignette.durationMs, isStub]);

  const accent = DOMAIN_ACCENT[domain] ?? "#8b93a3";
  const dir = SIDE_DIRECTION[side];

  const className = [
    "node",
    `node--${side}`,
    isStub ? "node--stub" : "node--asset",
    selected ? "is-selected" : "",
    hovered ? "is-hovered" : "",
    faded ? "is-faded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      style={{
        left: x,
        top: y,
        ["--accent" as string]: accent,
        ["--side-base" as string]: SIDE_ACCENT[side].base,
        ["--dir" as string]: String(dir),
      }}
      onClick={() => onSelect(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      aria-pressed={selected}
      aria-label={
        isStub
          ? `${label} — pending, not yet built. Referenced by ${node.stub.referenced_by.length} asset(s).`
          : `${label}, ${node.asset.category}, ${km} km from the zero line`
      }
    >
      <span className="node__glyph">
        {!isStub && iconPath && !imageFailed ? (
          <img
            src={iconPath}
            alt=""
            onError={() => setImageFailed(true)}
            draggable={false}
          />
        ) : (
          <Icon className="node__svg" />
        )}
        {playing && <span className={`vignette vignette--${vignette.kind}`} aria-hidden="true" />}
      </span>

      <span className="node__label">
        <span className="node__name">{label}</span>
        <span className="node__meta">
          {isStub ? "pending" : `${km} km`}
          {!isStub && node.asset.representative_system ? " · repr." : ""}
        </span>
      </span>

      {hovered && !selected && (
        <span className="node__tip" role="tooltip">
          <b>{label}</b>
          <span>
            {isStub
              ? `Referenced by ${node.stub.referenced_by.join(", ") || "an unresolved source"}, but no asset file exists yet. Position is inferred from the id.`
              : node.asset.short_role}
          </span>
        </span>
      )}
    </button>
  );
}
