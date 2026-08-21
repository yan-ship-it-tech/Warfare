// ─────────────────────────────────────────────────────────────────────────
// THE SPATIAL CONTRACT — Pass 25. Zones.
//
// One module, one rule, and every other file in src/three/ obeys it. This
// file replaces `depthAxis.ts` outright.
//
// ── What it replaces, and why ────────────────────────────────────────────
// Passes 23 and 24 tried to draw the whole war on ONE CONTINUOUS DEPTH AXIS:
// true metric scale near the line, a slope-matched logarithm behind it, out
// to 4,300 km. The reasoning was sound and the arithmetic was correct, and it
// failed live-verification three times in a row, always in the same three
// ways:
//
//   1. marker/model scale mismatch — a symbol sized for one end of the axis
//      is wrong at the other, and no single policy fixed both ends;
//   2. sub-pixel elements — a 7 m tank is 0.1 px at a framing that has to
//      contain 4,300 km, so the geometry the tool exists to show could not
//      be seen at the framing the tool opens on;
//   3. sparse / empty ground — a prop budget spread over hundreds of
//      thousands of square kilometres is one tree every few hundred metres,
//      which is not a landscape at any budget this frame can afford.
//
// All three are the same failure wearing three coats: **an axis that spans
// four orders of magnitude of real distance cannot also hold objects sized in
// metres.** No compression curve fixes that, because the curve is not the
// problem — the *span* is. Retiring the curve and bounding the span is the
// only move that fixes it by construction rather than by tuning.
//
// ── The rule ─────────────────────────────────────────────────────────────
// **A small number of bounded, hand-authored zones, laid end to end along the
// locked depth axis, with a visible labelled transition between them.**
//
// Each zone is a fixed ZONE_WIDTH_M of world space. It does not matter that
// The Line covers 50 km of real ground and the Strategic Rear covers 4,150 —
// each gets the same physical footprint, because the footprint is a
// **rendering budget**, and the budget is set by what a camera and a frame
// can actually show, not by how much ground the zone stands for.
//
// Inside a zone, an asset's position along the axis carries **order, not
// distance**: near-to-far ordering is preserved exactly, proportionality is
// preserved only where the zone has room to spend on it. Every asset still
// carries its true distance as a label, and that label — not the pixel — is
// the claim.
//
// ── What the boundaries are NOT ──────────────────────────────────────────
// **Range and cost, not a boundary line.** The zone boundaries below are a
// rendering-budget decision, not a safety or technical claim. The farther
// from the line you are, the fewer platforms can reach you — but that
// threshold never drops to zero. A cheap FPV can hit almost anything within a
// few kilometres; a long-range strike drone or a cruise missile can reach a
// command post or a logistics hub a hundred kilometres back; a sustained
// campaign reaches refineries and airfields a thousand kilometres back and
// keeps reaching them. Nowhere on this map is fully safe. What changes with
// distance is what is worth sending, not whether anything can arrive.
//
// That sentence is load-bearing and it is repeated, deliberately, in three
// places a reader can actually reach: the ruler's zone transition, the About
// page, and docs/DECISIONS.md Pass 25. If you change the zone model, change
// it there too.
//
// ── The axes ─────────────────────────────────────────────────────────────
//   X  depth. NOT metric. Zone-relative — see above. Side_a negative,
//      side_b positive, zero line at 0, same handedness as the 2D view.
//   Y  altitude, metres above mean ground, true below ALT_TRUE_CEILING_M and
//      softly ceilinged above it (drawAltitudeM) so a symbolic 25 km orbit
//      cannot be taller than the world is deep. The one disclosed exception
//      to "Y is metres".
//   Z  lateral position across the represented strip. Genuinely metres, with
//      no compression of any kind, and it stays that way: it is what keeps a
//      7 m hull, a 15 m trench bay and a 1.2 km river honest against each
//      other.
// ─────────────────────────────────────────────────────────────────────────
import type { Side } from "../types";

/**
 * One world unit = one metre — still true for Y and Z, and still true for
 * every piece of authored GEOMETRY (a tank hull is 7 units because a tank is
 * 7 m). What is no longer true is that a world unit along X converts to a
 * real ground distance; that is what the zone model gives up, on purpose.
 */
export const METRES_PER_KM = 1_000;

/**
 * Deepest distance the axis is asked to represent. Matches
 * VIEW.openEndedDisplayCapKm — the reach of Ukraine's "Spiderweb" operation,
 * the deepest thing on the roster. It is now a *label* bound, not a geometry
 * bound: nothing about the scene's size scales with it any more, which is
 * precisely the point.
 */
export const MAX_DEPTH_KM = 4_300;

/**
 * Physical footprint of one zone, in world metres. **Authored, not derived**
 * — this is the rendering budget, and it is the number to change if the zones
 * feel cramped or sparse.
 *
 * 3,000 m is the starting value the brief specifies, and it survived
 * validation for a reason worth writing down: at 3 km deep and a 12 km
 * frontage a zone is a place a camera can actually frame. The whole world is
 * now 19.2 km wide (three zones plus two gaps, mirrored), against 140 km for
 * the axis this replaces — a 7 m vehicle at the default framing went from
 * ~0.1 px to a few px before the legibility floor even engages, which is
 * failure mode 2 fixed by arithmetic rather than by tuning.
 */
export const ZONE_WIDTH_M = 3_000;

/**
 * Gap between adjacent zones, in world metres. **Visible on purpose.** The
 * brief's word is "not blended, not hidden": a reader crossing from one zone
 * to the next should see that they have moved to a different place with a
 * different character, and should never see something that reads as a line
 * beyond which they are safe. 300 m is wide enough to hold the transition
 * seam and its label at every framing from the whole-world default down to a
 * single zone, and narrow enough that the two zones still read as adjacent
 * rather than as separate islands.
 */
export const ZONE_TRANSITION_GAP_M = 300;

/** Margin inside a zone's inner and outer edges that the asset spread will
 *  not use, world metres. Keeps assets off the transition seam, and — at The
 *  Line's inner edge — off the zero line itself, which belongs to the trench
 *  belt and the churn, not to a unit marker. */
const ZONE_EDGE_INSET_M = 60;
const LINE_INNER_INSET_M = 170;

/** Minimum depth-axis separation between two same-side assets in the same
 *  zone, world metres. A real dispersal distance rather than a symbol
 *  footprint — two systems should not stand in each other's position. It is
 *  a *target*: where a zone is too crowded to honour it the spread falls back
 *  to an even one (see buildDepthLayout), which is what "whatever spacing
 *  keeps it populated" means in practice. */
export const ASSET_MIN_GAP_M = 62;

export type ZoneId = "line" | "depth" | "rear";

export interface Zone {
  id: ZoneId;
  /** Display name. Used verbatim by the ruler, the transition label and the
   *  About page — one string, three readers. */
  name: string;
  /** Rendering boundaries, in real km from the zero line. Approximate by
   *  design and described as such everywhere they are shown. */
  minKm: number;
  maxKm: number;
  /** Pre-rendered "≈0–50 km" style range for the UI. */
  rangeLabel: string;
  /** One line on what the zone is *like*. Not a safety statement. */
  character: string;
  /** How km maps to a fraction of the zone's width before the spread runs.
   *  "linear" where the zone's km span is small enough for proportionality to
   *  mean something; "log" for the Strategic Rear, where linear would pile
   *  every real target into the first 5% and leave the rest visibly empty —
   *  which is exactly the reading this pass may not produce. */
  curve: "linear" | "log";
  /** Softness of the log curve, in km. Only read when curve === "log". */
  logSoftKm: number;
  /** World-X magnitude the zone occupies: [innerM, outerM]. */
  innerM: number;
  outerM: number;
  /** World-X magnitude the asset spread may use, inside the edges. */
  spreadMinM: number;
  spreadMaxM: number;
}

interface ZoneSpec {
  id: ZoneId;
  name: string;
  minKm: number;
  maxKm: number;
  rangeLabel: string;
  character: string;
  curve: "linear" | "log";
  logSoftKm: number;
  innerInsetM: number;
}

/**
 * The three zones, near to far.
 *
 * The km boundaries are **not** derived from any single platform's range, and
 * saying so matters: "50 km" is not the edge of anything's envelope. They are
 * chosen where the *character* of the picture changes — where the count of
 * things that can plausibly reach you drops by roughly an order of magnitude
 * — because that is the only thing a rendering budget can honestly track.
 *
 *   0–50 km    everything the front-line fight is made of overlaps here:
 *              FPV, tube and rocket artillery, tactical recon, short- and
 *              medium-range air defence, the whole robotic layer.
 *   50–150 km  mid/long-range strike, EW, and the logistics corridor that
 *              feeds the line. Sparser, never rare.
 *   150 km+    selective, expensive, sustained. Long-range strike drones and
 *              missiles against refineries, airfields, fleets and logistics
 *              hubs — a real campaign, not a handful of outliers.
 */
const ZONE_SPECS: ZoneSpec[] = [
  {
    id: "line",
    name: "The Line",
    minKm: 0,
    maxKm: 50,
    rangeLabel: "≈0–50 km",
    character:
      "Dense and continuous. Many overlapping short- and mid-range systems, none of which defines the boundary.",
    // Logarithmic, softness 8 km. The roster's Line-zone distances have a
    // median of 5.6 km and an interquartile range of roughly 3-13 km either
    // side, so a linear seed would stack two thirds of the zone's assets into
    // its first fifth and leave the de-crowding pass to do all the work —
    // which throws away the one piece of proportional signal worth keeping,
    // that most of this war happens in the first ten kilometres. Measured:
    // linear seeding displaces an asset 890 m on average before it is
    // legible; softness 8 displaces it 568 m; softness 4 displaces it 422 m
    // but pushes the nearest asset 450 m off the line and leaves a visibly
    // empty inner sixth. 8 is the middle of that, not a guess.
    curve: "log",
    logSoftKm: 8,
    innerInsetM: LINE_INNER_INSET_M,
  },
  {
    id: "depth",
    name: "Operational Depth",
    minKm: 50,
    maxKm: 150,
    rangeLabel: "≈50–150 km",
    character:
      "Sparser, not rare. Long-range fires, electronic warfare, and the logistics corridor that feeds the line.",
    curve: "linear",
    logSoftKm: 0,
    innerInsetM: ZONE_EDGE_INSET_M,
  },
  {
    id: "rear",
    name: "Strategic Rear",
    minKm: 150,
    maxKm: MAX_DEPTH_KM,
    rangeLabel: "≈150 km and beyond",
    character:
      "Selective and expensive, and under sustained attack — refineries, airfields, fleets and logistics hubs, reached deliberately rather than incidentally.",
    curve: "log",
    // 260 km of softness spreads the roster's real rear distances (220, 250,
    // 274, 300, 308, 350, 375, 440, 480, 500, 1,050, 4,300 km) across roughly
    // the first two thirds of the zone instead of stacking them against the
    // inner edge. Chosen against that actual list, not by feel.
    logSoftKm: 260,
    innerInsetM: ZONE_EDGE_INSET_M,
  },
];

export const ZONES: Zone[] = ZONE_SPECS.map((spec, i) => {
  const innerM = i * (ZONE_WIDTH_M + ZONE_TRANSITION_GAP_M);
  const outerM = innerM + ZONE_WIDTH_M;
  return {
    ...spec,
    innerM,
    outerM,
    spreadMinM: innerM + spec.innerInsetM,
    spreadMaxM: outerM - ZONE_EDGE_INSET_M,
  };
});

/** Half the axis's total world extent, in metres — the outer edge of the
 *  deepest zone. 9,600 m with the shipped constants. */
export const HALF_EXTENT_M = ZONES[ZONES.length - 1].outerM;

/** The transition gaps, near to far: the world-X span between two zones and
 *  the two zones it joins. Rendered as a seam and labelled — see
 *  `buildZoneTransitions()` in scenery.ts and the DOM chips in Scene3D. */
export interface ZoneGap {
  inner: Zone;
  outer: Zone;
  startM: number;
  endM: number;
  centreM: number;
}
export const ZONE_GAPS: ZoneGap[] = ZONES.slice(0, -1).map((inner, i) => {
  const outer = ZONES[i + 1];
  return {
    inner,
    outer,
    startM: inner.outerM,
    endM: outer.innerM,
    centreM: (inner.outerM + outer.innerM) / 2,
  };
});

/** The zone a real distance belongs to. This is the whole of asset-to-zone
 *  assignment: automatic, from `distance_km_from_zero`, nothing stored. */
export function zoneForKm(km: number): Zone {
  const d = Math.max(0, km);
  for (const zone of ZONES) if (d <= zone.maxKm) return zone;
  return ZONES[ZONES.length - 1];
}

/** The zone a world-X magnitude falls in, or `null` inside a transition gap
 *  or past the outer edge. Callers that need a zone for dressing/terrain use
 *  `zoneAtSaturating` instead. */
export function zoneAtDepthM(m: number): Zone | null {
  const d = Math.abs(m);
  for (const zone of ZONES) if (d >= zone.innerM && d <= zone.outerM) return zone;
  return null;
}

/** Same question, but never null: a gap resolves to the zone it is leaving
 *  and anything past the outer edge resolves to the deepest zone. What the
 *  terrain tint and the dressing want. */
export function zoneAtSaturating(m: number): Zone {
  const d = Math.abs(m);
  let last = ZONES[0];
  for (const zone of ZONES) {
    if (d <= zone.outerM) return zone;
    last = zone;
  }
  return last;
}

/** Index of a zone in ZONES — 0 at the line. */
export function zoneIndex(zone: Zone): number {
  return ZONES.indexOf(zone);
}

/** How far through its own zone a real distance sits, 0 → 1. Linear in km for
 *  the two near zones; logarithmic for the Strategic Rear, where linear would
 *  put eleven of twelve real targets inside the first 8% of the zone. */
export function zoneFractionForKm(zone: Zone, km: number): number {
  const d = clamp(km, zone.minKm, zone.maxKm);
  if (zone.maxKm <= zone.minKm) return 0;
  if (zone.curve === "linear") return (d - zone.minKm) / (zone.maxKm - zone.minKm);
  const L = zone.logSoftKm;
  const span = zone.maxKm - zone.minKm;
  return Math.log(1 + (d - zone.minKm) / L) / Math.log(1 + span / L);
}

/**
 * Depth of a real distance along the axis, world metres, magnitude only —
 * the ROSTER-INDEPENDENT answer.
 *
 * This is what terrain, scenery, landmarks, the OSM anchor and the ruler use,
 * because none of them is an asset and none of them can take part in the
 * asset spread. Assets go through `buildDepthLayout()` below instead, which
 * starts here and then de-crowds. The two agree closely wherever a zone has
 * room, and differ where it does not — which is the honest consequence of the
 * zone model and is stated in the UI rather than hidden.
 */
export function depthMForKm(km: number): number {
  const zone = zoneForKm(km);
  return zone.innerM + zoneFractionForKm(zone, km) * ZONE_WIDTH_M;
}

/** Signed world X of a real distance on a side. */
export function worldXForKm(side: Side, km: number): number {
  return (side === "side_a" ? -1 : 1) * depthMForKm(km);
}

/**
 * Roster-aware depth layout — the thing that actually positions assets.
 *
 * Per (side, zone) cohort:
 *   1. sort by true km, ties broken by id so the layout is deterministic;
 *   2. seed each asset at its roster-independent `depthMForKm()`;
 *   3. push apart to ASSET_MIN_GAP_M, order-preserving, clamped to the zone's
 *      own spread window. Where the cohort is too crowded for the full gap,
 *      the gap shrinks uniformly to whatever the zone can afford, which
 *      degrades gracefully into an even spread rather than into a pile.
 *
 * Step 3 is the whole design in four lines: **ordering is exact, spacing is
 * whatever keeps the zone populated, and no zone is ever asked to cover more
 * real km than it has world space to spend looking good.**
 */
export interface DepthItem {
  id: string;
  side: Side;
  km: number;
}

export interface DepthLayout {
  /** Placed world-X magnitude for an asset, or undefined if it was not in the
   *  item list. */
  depthFor(id: string): number | undefined;
  /**
   * Where a real distance lands on THIS roster's placed ladder, world-X
   * magnitude — the mapping everything that has to sit next to an asset must
   * use.
   *
   * This exists because `depthMForKm` (the pure zone curve) and the placed
   * ladder genuinely differ: de-crowding moves a Line-zone asset 568 m on
   * average, which is a fifth of the zone. A forest patch authored at 8 km so
   * an artillery piece at 10 km can hide in it has to follow the artillery,
   * not the curve, or Pass 18's whole tactical-siting idea quietly stops
   * meaning anything. So scenery.ts's landmarks and terrain features are
   * placed through here.
   *
   * The terrain itself is NOT: `terrainHeight` has to stay a pure function of
   * (x, z) with no roster dependence, because every other module's anchoring
   * assumes it, and its gradients are broad tints rather than point
   * relationships to a specific asset.
   */
  depthAtKm(side: Side, km: number): number;
  /**
   * Inverse, for drag-to-reposition: the real distance a drop point stands
   * for. Reads the placed ladder rather than the pure curve, so dropping an
   * asset between two neighbours yields a km between theirs and the asset
   * re-ranks back to approximately where it was dropped. A pure curve would
   * have sent it somewhere else on release, which is the kind of thing that
   * makes an editor feel broken.
   */
  kmAtWorldX(side: Side, worldX: number): number;
}

/** One (side, zone) ladder: ascending, strictly monotone in both columns,
 *  anchored on the zone's own spread window so an interpolation can never
 *  wander into a neighbouring zone. */
type Ladder = Array<[depthM: number, km: number]>;

export function buildDepthLayout(items: DepthItem[]): DepthLayout {
  const placed = new Map<string, number>();
  const ladders = new Map<string, Ladder>();
  const key = (side: Side, zone: Zone) => `${side}:${zone.id}`;

  for (const side of ["side_a", "side_b"] as Side[]) {
    for (const zone of ZONES) {
      const cohort = items
        .filter((it) => it.side === side && zoneForKm(it.km) === zone)
        .sort((a, b) => a.km - b.km || a.id.localeCompare(b.id));

      const lo = zone.spreadMinM;
      const hi = zone.spreadMaxM;
      // Ends of the ladder: the zone's own window mapped to its own km range.
      // Present even when the zone has no assets, which is why an empty zone
      // still resolves sensibly (side_b currently has nothing at all between
      // 50 and 150 km — a real roster gap, logged in docs/BACKLOG.md).
      const ladder: Ladder = [
        [zone.innerM, zone.minKm],
        [zone.outerM, zone.maxKm],
      ];

      const n = cohort.length;
      if (n > 0) {
        const avail = hi - lo;
        // Feasible gap: the target, or whatever the zone can actually afford.
        const gap = n > 1 ? Math.min(ASSET_MIN_GAP_M, avail / (n - 1)) : 0;

        const xs = cohort.map((it) => clamp(depthMForKm(it.km), lo, hi));
        // Forward: honour the gap, and never advance past the point where the
        // remaining assets would no longer fit before the outer edge.
        for (let i = 0; i < n; i++) {
          const floor = lo + gap * i;
          const ceil = hi - gap * (n - 1 - i);
          const prev = i > 0 ? xs[i - 1] + gap : floor;
          xs[i] = clamp(Math.max(xs[i], prev), floor, ceil);
        }
        // Backward: the forward pass can only push outward, which bunches a
        // crowded cohort against the outer edge. This pulls the slack back in
        // without ever violating the gap the forward pass established.
        for (let i = n - 2; i >= 0; i--) {
          xs[i] = Math.min(xs[i], xs[i + 1] - gap);
          xs[i] = Math.max(xs[i], lo + gap * i);
        }

        cohort.forEach((it, i) => {
          placed.set(it.id, xs[i]);
          ladder.push([xs[i], it.km]);
        });
      }

      ladders.set(key(side, zone), monotone(ladder));
    }
  }

  const interp = (ladder: Ladder, v: number, col: 0 | 1): number => {
    const other = col === 0 ? 1 : 0;
    if (v <= ladder[0][col]) return ladder[0][other];
    for (let i = 0; i < ladder.length - 1; i++) {
      const a = ladder[i];
      const b = ladder[i + 1];
      if (v <= b[col]) {
        const span = b[col] - a[col];
        const t = span === 0 ? 0 : (v - a[col]) / span;
        return a[other] + t * (b[other] - a[other]);
      }
    }
    return ladder[ladder.length - 1][other];
  };

  return {
    depthFor: (id) => placed.get(id),
    depthAtKm: (side, km) => {
      const zone = zoneForKm(km);
      const ladder = ladders.get(key(side, zone));
      if (!ladder) return depthMForKm(km);
      return interp(ladder, clamp(km, zone.minKm, zone.maxKm), 1);
    },
    kmAtWorldX: (side, worldX) => {
      const d = clamp(Math.abs(worldX), 0, HALF_EXTENT_M);
      const zone = zoneAtSaturating(d);
      const ladder = ladders.get(key(side, zone));
      if (!ladder) return clamp(kmForZoneFraction(zone, (d - zone.innerM) / ZONE_WIDTH_M), 0, MAX_DEPTH_KM);
      return clamp(interp(ladder, d, 0), 0, MAX_DEPTH_KM);
    },
  };
}

/** Sorts a ladder and drops any entry that would break strict monotonicity in
 *  either column — an interpolation over a non-monotone table returns
 *  whichever branch it happened to hit first, which shows up as an asset
 *  drifting sideways on a drag for no reason the user can see. */
function monotone(ladder: Ladder): Ladder {
  const sorted = [...ladder].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Ladder = [];
  for (const row of sorted) {
    const last = out[out.length - 1];
    if (last && (row[0] <= last[0] || row[1] <= last[1])) continue;
    out.push(row);
  }
  return out.length >= 2 ? out : sorted.slice(0, 2);
}

/** Inverse of `zoneFractionForKm` — used by the drag inverse where a zone has
 *  no assets to interpolate between. */
export function kmForZoneFraction(zone: Zone, t: number): number {
  const f = clamp(t, 0, 1);
  if (zone.curve === "linear") return zone.minKm + f * (zone.maxKm - zone.minKm);
  const L = zone.logSoftKm;
  const span = zone.maxKm - zone.minKm;
  return zone.minKm + L * (Math.pow(1 + span / L, f) - 1);
}

// ── altitude ─────────────────────────────────────────────────────────────
/**
 * Altitude below which the drawn height is the real height, metres.
 *
 * Everything the roster actually flies at in its working band — FPV at 30–200
 * m, loitering munitions at 150–1,200, tactical recon at 800–2,000 — is at or
 * near true scale here, which is the part that has to be right.
 */
export const ALT_TRUE_CEILING_M = 1_200;

/**
 * The sky's ceiling, metres. Nothing is ever drawn higher.
 *
 * This is a disclosed compromise, and it is the *same* compromise the old
 * axis made with FAR_SYMBOLIC_ALT_MAX, moved to where it belongs. The world
 * is now 9.6 km deep per side; a symbolic 25 km orbit drawn true would be a
 * stalk two and a half times taller than the entire scene is deep, which is
 * the "absurd stalks" complaint in a new costume. 4,200 m keeps the highest
 * thing in the sky comfortably below the depth of the ground beneath it while
 * leaving the real air layers — deck, FPV, recon, MALE — visibly stacked and
 * distinct.
 */
export const ALT_DRAW_MAX_M = 4_200;

/** Real metres → drawn metres. Identity below the true ceiling; an
 *  exponential approach to ALT_DRAW_MAX_M above it, so ordering between air
 *  layers is strictly preserved and nothing ever pierces the ceiling. */
export function drawAltitudeM(metres: number): number {
  if (metres <= ALT_TRUE_CEILING_M) return metres;
  const span = ALT_DRAW_MAX_M - ALT_TRUE_CEILING_M;
  return ALT_TRUE_CEILING_M + span * (1 - Math.exp(-(metres - ALT_TRUE_CEILING_M) / span));
}

// ── copy ─────────────────────────────────────────────────────────────────
/**
 * The one sentence this pass may not ship without, derived from the constants
 * so it cannot drift from them. Rendered on the About page, in the Legend and
 * as the screen-reader equivalent of the ruler.
 */
export function zonesSummary(): string {
  const list = ZONES.map((z) => `${z.name} (${z.rangeLabel})`).join(", ");
  return (
    `The depth axis is divided into three bounded zones — ${list} — laid end to end with a ` +
    `visible transition between them. Each zone gets the same physical footprint on screen ` +
    `regardless of how much ground it stands for, so position within a zone carries near-to-far ` +
    `order rather than proportional distance; every asset is still labelled with its true ` +
    `distance. These boundaries are a rendering-budget decision, not a safety or technical ` +
    `claim: the farther from the line you are, the fewer platforms can reach you, but that ` +
    `threshold never drops to zero. Nowhere on this map is fully safe — what changes with ` +
    `distance is what is worth sending, not whether anything can arrive.`
  );
}

/**
 * One-line form, for the Legend's corner panel where the full paragraph
 * would take over the screen. The safety clause is NOT the part that gets
 * cut — the proportionality clause is, because the ruler says that too.
 */
export function zonesSummaryShort(): string {
  return (
    `Three bounded zones — ${ZONES.map((z) => z.name).join(", ")} — each with the same footprint ` +
    `on screen whatever ground it stands for. Position inside a zone is order, not distance; ` +
    `labels state true km. The boundaries are a drawing budget, not a safety line: nowhere here ` +
    `is out of reach, only more expensive to reach.`
  );
}

/** Short form for the transition seam's own label. */
export const ZONE_TRANSITION_NOTE = "Range and cost, not a boundary line — nothing out here is out of reach.";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
