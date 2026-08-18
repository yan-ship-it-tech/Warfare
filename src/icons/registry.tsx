// ─────────────────────────────────────────────────────────────────────────
// Uniform illustrated icon set.
//
// Art-direction call (open item in the master prompt): a single commissioned-
// feel line/silhouette set, not photographs. Reasons: photos are inconsistent
// in crop, lighting and licensing across sources; they are unreadable at the
// 44 px the default zoom needs; and a mixed photo set reads as a scraped deck
// rather than a built tool in front of procurement. Photos still earn their
// place in the detail panel gallery, where size and context make them useful.
//
// The schema is untouched: every asset keeps its `icon_image` path. The loader
// uses that image when the file exists, and falls back to the symbol below,
// picked by `category` and then by `domain`. So dropping real art into
// public/icons/ later upgrades the map with no code or data change.
// ─────────────────────────────────────────────────────────────────────────
import type { JSX } from "react";
import type { Domain } from "../types";

type IconProps = { className?: string };
type Icon = (p: IconProps) => JSX.Element;

const svg =
  (children: JSX.Element): Icon =>
  ({ className }: IconProps) => (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );

// ── land ─────────────────────────────────────────────────────────────────
const TANK = svg(
  <>
    <path d="M6 33h30l3-5H9z" fill="currentColor" fillOpacity={0.16} />
    <path d="M14 28v-5h11l3 4" fill="currentColor" fillOpacity={0.24} />
    <path d="M27 24h15" />
    <circle cx="11" cy="36" r="3" />
    <circle cx="20" cy="36" r="3" />
    <circle cx="29" cy="36" r="3" />
    <path d="M8 39h24" />
  </>,
);

const HOWITZER = svg(
  <>
    <path d="M10 34 34 18" />
    <path d="M31 16.5 37 20.5" />
    <path d="M10 34 4 40M10 34 8 42" />
    <circle cx="15" cy="34" r="4" />
    <path d="M13 30h9l2 4" fill="currentColor" fillOpacity={0.18} />
  </>,
);

const INFANTRY_POSITION = svg(
  <>
    <path d="M4 30h12l4 6h8l4-6h12" />
    <path d="M16 30v10h16V30" fill="currentColor" fillOpacity={0.14} />
    <path d="M20 22v8M28 22v8" />
  </>,
);

// ── air ──────────────────────────────────────────────────────────────────
const SAM_LAUNCHER = svg(
  <>
    <path d="M7 35h22l4-4H11z" fill="currentColor" fillOpacity={0.16} />
    <path d="M13 30 30 15" />
    <path d="M15 33 32 18" />
    <path d="M29 13l5 4-2 3" fill="currentColor" fillOpacity={0.3} />
    <circle cx="12" cy="38" r="2.5" />
    <circle cx="24" cy="38" r="2.5" />
    <path d="M38 34V22M34 22h8" />
    <path d="M36 20a6 6 0 0 1 8 0" />
  </>,
);

const LOITERING_MUNITION = svg(
  <>
    <path d="M10 24h26" />
    <path d="M36 24 42 21v6z" fill="currentColor" fillOpacity={0.3} />
    <path d="M18 24 12 15M18 24 12 33" />
    <path d="M30 24 26 18M30 24 26 30" />
    <circle cx="10" cy="24" r="2" fill="currentColor" fillOpacity={0.4} />
  </>,
);

const RECON_UAV = svg(
  <>
    <path d="M8 26h28" />
    <path d="M22 26 14 14h5l6 12" fill="currentColor" fillOpacity={0.18} />
    <path d="M22 26 14 38h5l6-12" fill="currentColor" fillOpacity={0.1} />
    <path d="M36 26 42 24v4z" fill="currentColor" fillOpacity={0.3} />
    <circle cx="11" cy="26" r="2.4" />
    <path d="M11 30v4" />
  </>,
);

const AIRCRAFT = svg(
  <>
    <path d="M6 27h30l6-3-6-3H6z" fill="currentColor" fillOpacity={0.16} />
    <path d="M16 24 10 12h5l9 12" fill="currentColor" fillOpacity={0.2} />
    <path d="M16 24 10 36h5l9-12" fill="currentColor" fillOpacity={0.12} />
  </>,
);

// ── other domains ────────────────────────────────────────────────────────
const LOGISTICS_HUB = svg(
  <>
    <path d="M6 20 24 12l18 8v20H6z" fill="currentColor" fillOpacity={0.12} />
    <path d="M14 40V28h9v12" />
    <path d="M27 30h9v10h-9z" fill="currentColor" fillOpacity={0.2} />
    <path d="M6 20 24 12l18 8" />
  </>,
);

const MEDICAL = svg(
  <>
    <path d="M8 18h32v22H8z" fill="currentColor" fillOpacity={0.1} />
    <path d="M24 22v14M17 29h14" />
    <path d="M8 18l4-6h24l4 6" />
  </>,
);

const C2_NODE = svg(
  <>
    <path d="M24 12v22" />
    <path d="M16 40 24 12l8 28" fill="currentColor" fillOpacity={0.12} />
    <path d="M12 40h24" />
    <path d="M14 20a14 14 0 0 1 20 0" opacity={0.75} />
    <path d="M18 25a8 8 0 0 1 12 0" opacity={0.5} />
    <circle cx="24" cy="11" r="2" fill="currentColor" fillOpacity={0.5} />
  </>,
);

const EW = svg(
  <>
    <path d="M20 40h8l-2-18h-4z" fill="currentColor" fillOpacity={0.16} />
    <path d="M16 22h16" />
    <path d="M13 17a15 15 0 0 1 22 0" />
    <path d="M17 12a22 22 0 0 1 14 0" opacity={0.55} />
    <path d="M14 40h20" />
  </>,
);

const SATELLITE = svg(
  <>
    <path d="M20 20h8v8h-8z" fill="currentColor" fillOpacity={0.22} />
    <path d="M6 18h12v12H6zM30 18h12v12H30z" fill="currentColor" fillOpacity={0.12} />
    <path d="M24 28v8" />
    <path d="M19 40a7 7 0 0 1 10 0" />
  </>,
);

const NAVAL = svg(
  <>
    <path d="M8 30h32l-5 8H13z" fill="currentColor" fillOpacity={0.18} />
    <path d="M18 30v-8h10l3 8" fill="currentColor" fillOpacity={0.12} />
    <path d="M24 22v-6" />
    <path d="M6 41c3 0 3 2 6 2s3-2 6-2 3 2 6 2 3-2 6-2 3 2 6 2" opacity={0.6} />
  </>,
);

const UGV = svg(
  <>
    <rect x="10" y="20" width="24" height="12" rx="2" fill="currentColor" fillOpacity={0.16} />
    <path d="M10 20V15h24v5" />
    <circle cx="14" cy="34" r="3.4" />
    <circle cx="22" cy="34" r="3.4" />
    <circle cx="30" cy="34" r="3.4" />
    <path d="M17 15v-4h10v4" />
    <path d="M36 24h4l2 4-2 3h-4" opacity={0.7} />
  </>,
);

const POWER_PLANT = svg(
  <>
    <path d="M8 40V22l7-9 7 9v18" fill="currentColor" fillOpacity={0.12} />
    <path d="M24 40V26l6-7 6 7v14" fill="currentColor" fillOpacity={0.2} />
    <path d="M8 40h34" />
    <path d="M13 22c-2-3-1-6 2-7-1 3 1 5 3 4-1 4-3 5-5 3z" opacity={0.55} />
    <path d="M31 20c-2-3-1-6 2-7-1 3 1 5 3 4-1 4-3 5-5 3z" opacity={0.4} />
  </>,
);

const BARRACKS = svg(
  <>
    <path d="M6 22 24 10l18 12" />
    <path d="M9 22v18h30V22" fill="currentColor" fillOpacity={0.12} />
    <path d="M20 40V28h8v12" />
    <path d="M14 26h4v4h-4zM30 26h4v4h-4z" opacity={0.6} />
  </>,
);

const TRAINING_TARGET = svg(
  <>
    <circle cx="24" cy="24" r="15" fill="currentColor" fillOpacity={0.06} />
    <circle cx="24" cy="24" r="10" />
    <circle cx="24" cy="24" r="4" fill="currentColor" fillOpacity={0.35} />
    <path d="M24 3v6M24 39v6M3 24h6M39 24h6" opacity={0.6} />
  </>,
);

const CHECKPOINT = svg(
  <>
    <path d="M8 40V12h4v28" />
    <path d="M12 14h26l-5 6 5 6H12z" fill="currentColor" fillOpacity={0.2} />
    <path d="M4 40h30" />
  </>,
);

const CIVILIAN_SUPPORT = svg(
  <>
    <path d="M16 22a6 6 0 1 1 12 0" />
    <path d="M9 40c1-8 6-12 15-12s14 4 15 12" fill="currentColor" fillOpacity={0.12} />
    <path d="M18 30c1 3 3 4 6 4" opacity={0.7} />
  </>,
);

const GENERIC = svg(
  <>
    <path d="M24 8 40 17v18L24 44 8 35V17z" fill="currentColor" fillOpacity={0.12} />
    <circle cx="24" cy="26" r="4" />
  </>,
);

// ── resolution ───────────────────────────────────────────────────────────
const BY_CATEGORY: Record<string, Icon> = {
  "air-defense-long-range": SAM_LAUNCHER,
  "air-defense-mid-range": SAM_LAUNCHER,
  "air-defense-short-range": SAM_LAUNCHER,
  "uav-strike": LOITERING_MUNITION,
  "uav-reconnaissance": RECON_UAV,
  artillery: HOWITZER,
  "armor-main-battle-tank": TANK,
};

const KEYWORD_RULES: [RegExp, Icon][] = [
  [/air[-_ ]?defen[cs]e|cuas|manpads|sam\b/, SAM_LAUNCHER],
  [/loiter|kamikaze|fpv|uav[-_ ]?strike|munition/, LOITERING_MUNITION],
  [/recon|isr|surveillance|uav|drone/, RECON_UAV],
  [/artillery|howitzer|mortar|mlrs|himars/, HOWITZER],
  [/tank|armou?r|ifv|apc|mbt/, TANK],
  [/infantry|trench|fortification|position|engineer/, INFANTRY_POSITION],
  [/logistic|supply|depot|hub|warehouse|distribution|ammo|fuel/, LOGISTICS_HUB],
  [/medic|casevac|medevac|stabilis|stabiliz|aid|ccp/, MEDICAL],
  [/c2|command|battle[-_ ]management|comms|network|radio|starlink|satcom/, C2_NODE],
  [/\bew\b|jam|sigint|electronic|spoof|cyber/, EW],
  [/satellite|space|pnt|orbit/, SATELLITE],
  [/naval|maritime|fleet|usv|ship|corridor|sea/, NAVAL],
  [/aircraft|jet|helicopter|airfield|rotary|fixed[-_ ]wing/, AIRCRAFT],
];

const BY_DOMAIN: Record<Domain, Icon> = {
  land: TANK,
  air: RECON_UAV,
  sea: NAVAL,
  space: SATELLITE,
  cyber_ew: EW,
  logistics: LOGISTICS_HUB,
  medical: MEDICAL,
  c2_comms: C2_NODE,
};

/** `group` (data/groups.json) is the most reliable signal once an asset has
 *  one — it's an authored, closed taxonomy rather than a regex guess. Tried
 *  first; category/keyword/domain remain the fallback chain for pending
 *  stubs, which don't carry a group. */
const BY_GROUP: Record<string, Icon> = {
  uav: RECON_UAV,
  air_defense: SAM_LAUNCHER,
  armor: TANK,
  artillery: HOWITZER,
  ground_robots: UGV,
  logistics: LOGISTICS_HUB,
  medical: MEDICAL,
  ew: EW,
  c2: C2_NODE,
  infantry: INFANTRY_POSITION,
  naval: NAVAL,
  space: SATELLITE,
  air_force: AIRCRAFT,
  strategic_target: POWER_PLANT,
  training: TRAINING_TARGET,
  border_control: CHECKPOINT,
  soldier_accommodation: BARRACKS,
  civilian_support: CIVILIAN_SUPPORT,
};

/** Picks the best symbol for an asset or a pending stub. */
export function resolveIcon(opts: { group?: string; category?: string; id?: string; domain: Domain }): Icon {
  if (opts.group && BY_GROUP[opts.group]) return BY_GROUP[opts.group];
  if (opts.category && BY_CATEGORY[opts.category]) return BY_CATEGORY[opts.category];
  const haystack = `${opts.category ?? ""} ${opts.id ?? ""}`.toLowerCase().replace(/_/g, "-");
  for (const [re, icon] of KEYWORD_RULES) {
    if (re.test(haystack)) return icon;
  }
  return BY_DOMAIN[opts.domain] ?? GENERIC;
}
