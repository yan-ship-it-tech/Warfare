// ─────────────────────────────────────────────────────────────────────────
// UI-level configuration. Nothing here belongs in the data schema — this is
// presentation only, so relabeling the sides or retuning the oblique view
// never touches /data.
// ─────────────────────────────────────────────────────────────────────────
import type { Side } from "../types";

/**
 * The data layer only ever knows "side_a" / "side_b" — renaming is a config
 * change here, not a data migration. Named for this specific war rather than
 * kept generic, per explicit direction: side_a is Ukraine (and the systems
 * it fields — domestic production plus Western-donated equipment), side_b is
 * Russia. Every asset's own `side` field already lines up with this.
 */
export const SIDE_LABELS: Record<Side, { short: string; long: string; note: string }> = {
  side_a: {
    short: "Ukraine",
    long: "Ukraine",
    note: "Domestic production (Bohdana, Fire Point FP-1, Magura V5, ...) plus Western-donated equipment (Patriot, HIMARS, Leopard 2, ...).",
  },
  side_b: {
    short: "Russia",
    long: "Russia",
    note: "Russian-produced and Soviet-legacy equipment (Lancet, T-72/T-90, Orlan, Geran-2, ...).",
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
  /** Was a per-lane horizontal drift meant to read as an oblique cross-section
   *  — removed. It offset actual node/ruler coordinates rather than just
   *  decoration, so a node's true distance silently stopped matching its
   *  on-screen position the deeper its lane sat (up to ~400px off at the
   *  bottom lane), and produced a visually doubled zero line (each lane drew
   *  its own offset segment). Correctness wins: 0 means every lane's zero
   *  line is the same vertical line and every node sits exactly under its
   *  true ruler tick, in every lane. A real oblique/elevated-viewpoint read
   *  is still wanted (see docs/DECISIONS.md backlog) but belongs on a
   *  decorative layer via a CSS 3D transform, never on coordinates that the
   *  ruler and the detail panel both have to agree with. */
  laneObliqueOffsetPx: 0,
  /** Purely decorative "each layer steps back" stagger for the terrain
   *  background only (src/scene/Lanes.tsx) — never read by projection.ts, so
   *  it can't repeat the laneObliqueOffsetPx bug above. Nodes and the ruler
   *  stay at their true, correctness-guaranteed x; only the ground plane
   *  drawn underneath them tilts, which is enough to sell a 2.5D cross-
   *  section read without risking the distance-matches-position guarantee. */
  laneVisualSkewPx: 22,
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

/** Purely visual "pop" per domain lane — how far a node's icon floats above
 *  its own ground point, in px. Air/space read as overhead (with a tether
 *  line down to a ground shadow); everything else sits at grade. This is
 *  the 2.5D read: never touches the y placeNodes() computed, just how the
 *  icon renders relative to that point. */
export const DOMAIN_ALTITUDE_PX: Record<string, number> = {
  space: 30,
  air: 20,
  cyber_ew: 10,
  c2_comms: 0,
  land: 0,
  logistics: 0,
  medical: 0,
  sea: 0,
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
    "This is a teaching and briefing tool about the Russo-Ukrainian war, built from open-source equipment catalogs, doctrine reporting, and publicly reported combat use. It does not depict real current unit positions, troop dispositions, or order of battle, and no placement here should be read as intelligence.",
    "Systems shown (Patriot, HIMARS, Bohdana, Lancet, T-72, Geran-2, ...) are real, currently-fielded equipment reported in use in this war — not generic stand-ins — but where each one sits on the map is a representative placement within a distance band, not a measured position of an actual unit.",
    "Where public sourcing is thin, the asset says so in its own source notes rather than presenting a guess as fact. Assets carrying no usable citation are flagged in the detail panel and in Data health.",
  ],
};

export const SIDE_ACCENT: Record<Side, { base: string; soft: string; text: string }> = {
  side_a: { base: "#4d97d6", soft: "rgba(77,151,214,0.16)", text: "#9ecbf0" },
  side_b: { base: "#d0655a", soft: "rgba(208,101,90,0.16)", text: "#eea79e" },
};
