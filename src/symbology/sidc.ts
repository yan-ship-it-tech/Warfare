// ─────────────────────────────────────────────────────────────────────────
// NATO/APP-6 (MIL-STD-2525) symbol identification — Pass 20.
//
// Replaces the hand-drawn "arbitrary" glyph the detail panel used to show
// (src/icons/registry.tsx's resolveIcon()) with a real SIDC — the same
// 15-character code a genuine battle-management system would build — fed to
// milsymbol.js (MIT licensed) for rendering. resolveIcon() and its glyph set
// are UNTOUCHED and still used everywhere else (the 3D/2D map renderers):
// this only replaces the detail page's single identifying symbol, per the
// brief ("replace the top-left symbol"). Swapping the map's own WebGL/DOM
// marker rendering is a much larger integration (Scene3D's per-frame loop,
// AssetNode.tsx) that Pass 20 was not scoped to touch — see docs/DECISIONS.md.
//
// SIDC anatomy used here (MIL-STD-2525C / APP-6B "letter" form, what
// milsymbol@2.x's default standard draws):
//   1     Coding scheme       "S" (Warfighting) — the only scheme this app needs
//   2     Affiliation         F(riend) | H(ostile) — from `side`, see below
//   3     Battle dimension    G(round) | A(ir) | S(ea surface) | U(ndersea) | P(space)
//   4     Status              "P" (Present) — every asset here is a real,
//                              currently-fielded system, never anticipated/planned
//   5-10  Function ID         6 chars — *what it is*; this is the part that
//                              actually varies per category below
//   11-15 Modifiers/country/OOB — left blank ("-----"). Deliberately: SIDC's
//         echelon modifier (squad/battalion/brigade...) is a real military
//         organizational size, and nothing in this app's data model tracks
//         that — `Asset.echelon` here means "how far back in the battlespace"
//         (tactical/operational/strategic), a distance classification, not a
//         unit-size one. Filling the echelon slot from that field would be a
//         wrong claim dressed as correct symbology, exactly the kind of
//         mistake this pass exists to remove. See docs/DECISIONS.md Pass 20.
//
// Every function ID below is a real code copied from milsymbol's own
// MIL-STD-2525C ground/air/sea/subsurface/space/installation tables
// (node_modules/milsymbol/src/lettersidc/sidc/*.js) — none invented. Where
// 2525C genuinely has no dedicated symbol (it predates common UGV/loitering-
// munition categorization), the closest real functional equivalent is used
// and called out inline, never a made-up code.
// ─────────────────────────────────────────────────────────────────────────
import type { Domain, Side } from "../types";

export type Affiliation = "Friend" | "Hostile";

/** side_a (Ukraine) reads as Friend, side_b (Russia) as Hostile — the same
 *  editorial stance the app already takes via SIDE_ACCENT's blue/red and the
 *  DISCLAIMER copy. Presentation-layer only, same as everything else in
 *  src/config/ui.ts; the data layer still only ever knows side_a/side_b. */
export const SIDE_AFFILIATION: Record<Side, Affiliation> = {
  side_a: "Friend",
  side_b: "Hostile",
};

type Dimension = "G" | "A" | "S" | "U" | "P";

/** 6-character MIL-STD-2525C function ID (SIDC positions 5-10). */
type FunctionId = string;

interface SymbolSpec {
  dimension: Dimension;
  functionId: FunctionId;
  /** Short human label for the symbol, shown as alt text / a tooltip — what
   *  the SIDC's function ID actually stands for, so the symbol teaches
   *  something rather than just looking authoritative. */
  meaning: string;
}

const symbol = (dimension: Dimension, functionId: FunctionId, meaning: string): SymbolSpec => ({
  dimension,
  functionId,
  meaning,
});

// ── by exact category — the precise cases worth distinguishing ────────────
const BY_CATEGORY: Record<string, SymbolSpec> = {
  // air defense — range distinguishes the function ID's own suffix
  "air-defense-long-range": symbol("G", "EWMAL-", "Air defense missile launcher, long range"),
  "air-defense-medium-range": symbol("G", "EWMAI-", "Air defense missile launcher, intermediate range"),
  "air-defense-short-range": symbol("G", "EWMASE", "Air defense missile launcher, short range (TELAR)"),
  "cuas-gun": symbol("G", "EWA---", "Air defense gun"),

  // armor
  "armor-main-battle-tank": symbol("G", "EVATM-", "Tank, medium"),
  "armor-ifv": symbol("G", "EVAI--", "Armored fighting vehicle"),
  "armor-apc": symbol("G", "EVAA--", "Armored personnel carrier"),

  // artillery / rocket forces
  artillery: symbol("G", "EWH---", "Howitzer"),
  "artillery-self-propelled": symbol("G", "EWHMS-", "Howitzer, self-propelled, intermediate range"),
  "artillery-rocket": symbol("G", "EWXH--", "Multiple rocket launcher, long range"),
  "artillery-rocket-deep-strike": symbol("G", "EWMSL-", "Surface-to-surface missile launcher, long range"),

  // C2 / comms
  "c2-battle-management": symbol("G", "UH1---", "Headquarters / headquarters element"),
  "c2-squad-level": symbol("G", "UUS---", "Signal unit"),
  "satcom-comms": symbol("G", "UUSRS-", "Signal, satellite"),

  // electronic warfare — 2525C's dedicated jamming code
  "ew-jamming": symbol("G", "UUMSEJ", "Electronic warfare, jamming"),
  "ew-counter-uas": symbol("G", "UUMSEJ", "Electronic warfare, jamming (counter-UAS)"),

  // ground robots — 2525C predates a dedicated unmanned-ground-vehicle
  // symbol (that arrives in 2525D). Closest real functional equivalent by
  // what the platform physically does, not invented:
  "ground-robot-combat": symbol("G", "EVAI--", "Armored fighting vehicle (unmanned combat ground platform)"),
  "ground-robot-engineering": symbol("G", "EVEA--", "Mine clearing equipment"),
  "ground-robot-logistics": symbol("G", "EVU---", "Utility vehicle (unmanned logistics ground platform)"),
  "ground-robot-multipurpose": symbol("G", "EVU---", "Utility vehicle (unmanned multipurpose ground platform)"),

  // logistics / medical — composite nodes, coded as the unit function they represent
  "logistics-hub": symbol("G", "USS---", "Supply"),
  "medical-casevac": symbol("G", "USM---", "Medical"),

  // naval
  "naval-frigate": symbol("S", "CLFF--", "Frigate"),
  "naval-submarine": symbol("U", "S-----", "Submarine"),
  "naval-surface-fleet": symbol("S", "C-----", "Surface combatant"),
  "naval-usv": symbol("S", "CU----", "Unmanned surface water vehicle"),
  "naval-usv-strike": symbol("S", "CU----", "Unmanned surface water vehicle"),

  // space
  "space-isr": symbol("P", "S-----", "Satellite"),

  // strategic infrastructure — installations, not units
  "strategic-infrastructure-target": symbol("G", "IUE---", "Electric power facility"),

  // UAVs — one real 2525C code (air dimension), refined by role in the meaning only
  "uav-reconnaissance": symbol("A", "MFR---", "Reconnaissance (unmanned)"),
  "uav-strike": symbol("A", "MFQ---", "Unmanned aerial vehicle (strike/loitering munition)"),
  "uav-strike-deep": symbol("A", "MFQ---", "Unmanned aerial vehicle (long-range strike)"),
  "uav-strike-strategic-sabotage": symbol("A", "MFQ---", "Unmanned aerial vehicle (deep-strike swarm)"),
};

// ── by group — the fallback net for any category not listed above ─────────
const BY_GROUP: Record<string, SymbolSpec> = {
  uav: symbol("A", "MFQ---", "Unmanned aerial vehicle"),
  air_defense: symbol("G", "EWMA--", "Air defense missile launcher"),
  armor: symbol("G", "EVATM-", "Tank, medium"),
  artillery: symbol("G", "EWH---", "Howitzer"),
  ground_robots: symbol("G", "EVU---", "Utility vehicle (unmanned ground platform)"),
  logistics: symbol("G", "USS---", "Supply"),
  medical: symbol("G", "USM---", "Medical"),
  ew: symbol("G", "UUMSEJ", "Electronic warfare, jamming"),
  c2: symbol("G", "UUS---", "Signal"),
  infantry: symbol("G", "UCI---", "Infantry"),
  naval: symbol("S", "C-----", "Surface combatant"),
  space: symbol("P", "S-----", "Satellite"),
  air_force: symbol("A", "MFF---", "Fighter"),
  strategic_target: symbol("G", "IUE---", "Electric power facility"),
  training: symbol("G", "IB----", "Base (installation)"),
  border_control: symbol("G", "UCSGD-", "Security"),
  soldier_accommodation: symbol("G", "IB----", "Base (installation)"),
  civilian_support: symbol("G", "EVC---", "Civilian vehicle"),
};

// ── by domain — last resort, matches resolveIcon()'s own fallback chain ───
const BY_DOMAIN: Record<Domain, SymbolSpec> = {
  land: symbol("G", "EVATM-", "Tank, medium"),
  air: symbol("A", "MFQ---", "Unmanned aerial vehicle"),
  sea: symbol("S", "C-----", "Surface combatant"),
  space: symbol("P", "S-----", "Satellite"),
  cyber_ew: symbol("G", "UUMSEJ", "Electronic warfare, jamming"),
  logistics: symbol("G", "USS---", "Supply"),
  medical: symbol("G", "USM---", "Medical"),
  c2_comms: symbol("G", "UUS---", "Signal"),
};

const GENERIC = symbol("G", "------", "Unspecified");

function resolveSpec(opts: { group?: string; category?: string; domain: Domain }): SymbolSpec {
  if (opts.category && BY_CATEGORY[opts.category]) return BY_CATEGORY[opts.category];
  if (opts.group && BY_GROUP[opts.group]) return BY_GROUP[opts.group];
  return BY_DOMAIN[opts.domain] ?? GENERIC;
}

/** Builds a full 15-character MIL-STD-2525C SIDC string for milsymbol. */
export function resolveSidc(opts: { side: Side; group?: string; category?: string; domain: Domain }): {
  sidc: string;
  meaning: string;
} {
  const spec = resolveSpec(opts);
  const affiliation = SIDE_AFFILIATION[opts.side];
  const affLetter = affiliation === "Friend" ? "F" : "H";
  const functionId = spec.functionId.padEnd(6, "-").slice(0, 6);
  const sidc = `S${affLetter}${spec.dimension}P${functionId}-----`;
  return { sidc, meaning: spec.meaning };
}

/** Same resolution, but for a pending stub — no `group`/`category` yet, only
 *  domain and side inferred from the id slug (see src/data/loader.ts). */
export function resolveStubSidc(opts: { side: Side; domain: Domain }): { sidc: string; meaning: string } {
  return resolveSidc({ side: opts.side, domain: opts.domain });
}
