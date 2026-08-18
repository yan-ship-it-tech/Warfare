// ─────────────────────────────────────────────────────────────────────────
// UI-level configuration. Nothing here belongs in the data schema — this is
// presentation only, so relabeling the sides or retuning the oblique view
// never touches /data.
// ─────────────────────────────────────────────────────────────────────────
import type { Side } from "../types";

/**
 * Side labels are deliberately generic. The data layer only ever knows
 * "side_a" / "side_b"; renaming is a config change here, not a data migration.
 */
export const SIDE_LABELS: Record<Side, { short: string; long: string; note: string }> = {
  side_a: {
    short: "Side A",
    long: "Side A",
    note: "Representative equipment set: Western-supplied systems (Patriot, M777, Leopard 2).",
  },
  side_b: {
    short: "Side B",
    long: "Side B",
    note: "Representative equipment set: Russian systems (Lancet, T-72, Orlan).",
  },
};

export const SIDE_ORDER: Side[] = ["side_a", "side_b"];

/** side_a recedes to the left of the zero line, side_b to the right. */
export const SIDE_DIRECTION: Record<Side, -1 | 1> = { side_a: -1, side_b: 1 };

// ── Oblique view geometry ────────────────────────────────────────────────
export const VIEW = {
  /** Screen width allocated to each distance band, per side. Bands are not
   *  linearly scaled against each other — 0–5 km and 150 km+ cannot share a
   *  linear axis and still be legible. The ruler labels real km throughout,
   *  so the compression is visible rather than hidden. */
  bandWidthPx: {
    tactical: 400,
    op_near: 440,
    op_deep: 460,
    strategic_rear: 360,
    deep_strategic: 420,
  } as Record<string, number>,
  /** Fallback width for any band id not listed above — matters once bands are
   *  user-edited, since a renamed or newly added band has no entry here. */
  defaultBandWidthPx: 400,
  /** Open-ended bands (max_km ≥ 10,000) are drawn up to this cap and labelled
   *  "+". Set to roughly the distance of a genuine cross-border deep-strike
   *  example (Ukraine's "Spiderweb" operation reached targets ~4,300 km from
   *  the front) so that category of asset has room to sit meaningfully far
   *  out rather than pinned to the band's near edge. */
  openEndedDisplayCapKm: 4300,
  /** Dead zone straddling the zero line. */
  zeroGutterPx: 132,
  /** Vertical spacing between domain lanes. */
  laneHeightPx: 176,
  /** Horizontal drift per lane going down — this is what makes the stack read
   *  as an oblique cross-section. Applied as a discrete per-lane offset rather
   *  than a CSS skew on the scene, so icons and hit-boxes stay undistorted. */
  laneObliqueOffsetPx: 58,
  /** Height reserved for the sticky ruler. Fixed rather than measured so the
   *  domain rail can align to it without a layout read on every scroll. */
  rulerHeightPx: 116,
  /** Padding around the whole scene. */
  scenePadPx: { top: 96, bottom: 140, x: 120 },
  /** Minimum horizontal separation between two icons in the same lane before
   *  the later one is bumped to a sub-row. */
  minIconSeparationPx: 132,
  subRowOffsetPx: 76,
  maxSubRows: 3,
};

export const DOMAIN_ACCENT: Record<string, string> = {
  space: "#8b93d6",
  air: "#5aa9e6",
  cyber_ew: "#b07fd4",
  c2_comms: "#57bfa8",
  land: "#c2a25a",
  logistics: "#7f9a6a",
  medical: "#d3697a",
  sea: "#4d93a8",
};

export const CONNECTION_STYLE: Record<
  string,
  { label: string; color: string; dash: string; width: number }
> = {
  supply: { label: "Supply", color: "#7f9a6a", dash: "10 6", width: 1.6 },
  data_c2: { label: "Data / C2", color: "#57bfa8", dash: "0", width: 1.6 },
  personnel: { label: "Personnel", color: "#8b93d6", dash: "2 6", width: 1.5 },
  fires_support: { label: "Fires support", color: "#d98b4a", dash: "14 5 3 5", width: 1.8 },
  casevac: { label: "Casevac", color: "#d3697a", dash: "6 5", width: 1.6 },
  maintenance: { label: "Maintenance", color: "#9a8f7a", dash: "3 4", width: 1.4 },
};

export const DISCLAIMER = {
  headline: "Composite illustrative model — not a live or historical map.",
  body: [
    "This is a teaching and briefing tool built from open-source doctrine, publicly reported equipment characteristics, and generic force-structure patterns. It does not depict real current unit positions, and no placement here should be read as intelligence.",
    "Named systems (Patriot, M777, Lancet, T-72) appear as representative examples that make a category concrete. Distances are representative placements within a band, not measured positions.",
    "Where public sourcing is thin, the asset says so in its own source notes rather than presenting a guess as fact. Assets carrying no usable citation are flagged in the detail panel and in Data health.",
  ],
};

export const SIDE_ACCENT: Record<Side, { base: string; soft: string; text: string }> = {
  side_a: { base: "#4d97d6", soft: "rgba(77,151,214,0.16)", text: "#9ecbf0" },
  side_b: { base: "#d0655a", soft: "rgba(208,101,90,0.16)", text: "#eea79e" },
};
