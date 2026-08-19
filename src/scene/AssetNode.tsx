// A single placed node: either a real asset or a pending stub standing in for
// an asset a connection points at but which has not been built yet.
//
// Deliberately icon-only, never a photo (Pass 5): real equipment photos live
// in the detail panel gallery, where size and context make them useful — a
// 32px map glyph is too small for a photo to read at, and it fights the
// "clearly stylized, not a real map" read the rest of the scene aims for.
// The `--altitude` per domain is a purely visual pop (translateY + a ground
// tether/shadow), not a coordinate change — y is still whatever placeNodes()
// computed; see docs/DECISIONS.md Pass 5.
import { useEffect, useState } from "react";
import type { PlacedNode } from "./projection";
import { resolveIcon } from "../icons/registry";
import { resolveVignette } from "./vignettes";
import { DOMAIN_ACCENT, DOMAIN_ALTITUDE_PX, SIDE_ACCENT, SIDE_DIRECTION } from "../config/ui";
import { resolvePlatformDomain } from "../data/placement";
import { resolveAssetDisplay } from "../data/catalog";
import { useOverrides } from "../state/overridesState";

interface Props {
  placed: PlacedNode;
  selected: boolean;
  hovered: boolean;
  /** Dimmed when a selection elsewhere has focus and this node is not connected to it. */
  faded: boolean;
  /** Bumped to replay the vignette without re-selecting. */
  replayNonce: number;
  /** This node's label lost the declutter pass, so it renders icon-only and
   *  reveals its name on hover, focus or selection. */
  labelCollapsed: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function AssetNode({
  placed,
  selected,
  hovered,
  faded,
  replayNonce,
  labelCollapsed,
  onSelect,
  onHover,
}: Props) {
  const { node, x, y } = placed;
  const isStub = node.kind === "stub";
  const side = isStub ? node.stub.side : node.asset.side;
  const domain = isStub ? node.stub.domain : node.asset.domain;
  const overrides = useOverrides();
  const swapId = isStub ? null : overrides.assetOverrides[node.asset.id]?.catalog_equipment_id;
  const display = isStub ? null : resolveAssetDisplay(node.asset, swapId);
  const label = isStub ? node.stub.label : (display?.name ?? node.asset.name);
  const km = isStub ? node.stub.distance_km_from_zero : node.asset.distance_km_from_zero;
  const category = isStub ? undefined : node.asset.category;

  const group = isStub ? undefined : node.asset.group;
  const Icon = resolveIcon({ group, category, id: node.id, domain });
  // Altitude keys off the PLATFORM domain, not the engagement domain — the 3D
  // view had exactly this bug and the two views must not disagree about
  // whether a thing is off the ground. A Patriot is an `air` asset that sits
  // on `land`; it gets no pop and no tether. See src/data/placement.ts.
  const platformDomain = isStub
    ? resolvePlatformDomain({ domain })
    : resolvePlatformDomain(node.asset);
  const altitude = DOMAIN_ALTITUDE_PX[platformDomain] ?? 0;
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
    labelCollapsed ? "is-label-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      style={{
        left: x,
        // The card itself floats `altitude` px above its true ground point
        // (y from placeNodes(), untouched) — a tether below reconnects it,
        // so the *button's hit target* is the only thing that moves, and by
        // a small, purely decorative amount. Label/tooltip position moves
        // with it, which reads fine since they're part of the same "card".
        top: y - altitude,
        ["--accent" as string]: accent,
        ["--side-base" as string]: SIDE_ACCENT[side].base,
        ["--dir" as string]: String(dir),
        ["--altitude" as string]: `${altitude}px`,
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
          : `${label}, ${display?.category ?? node.asset.category}, ${km} km from the zero line${display?.isSwapped ? " (swapped from default)" : ""}`
      }
    >
      {altitude > 0 && <span className="node__tether" aria-hidden="true" />}
      <span className="node__glyph">
        <Icon className="node__svg" />
        {playing && <span className={`vignette vignette--${vignette.kind}`} aria-hidden="true" />}
        {display?.isSwapped && <span className="node__swap-badge" title="Swapped from the default system">⇄</span>}
      </span>

      <span className="node__label">
        <span className="node__name">{label}</span>
        <span className="node__meta">
          {isStub ? "pending" : `${km} km`}
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
