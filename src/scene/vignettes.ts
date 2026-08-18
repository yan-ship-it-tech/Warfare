// ─────────────────────────────────────────────────────────────────────────
// Reactive-behaviour registry (build step 6 seam).
//
// Assets already carry `reactive_behavior.animation_id`. Rather than leave
// that field inert until step 6, each known id maps to a short stylised loop
// here, and anything unrecognised falls back to a neutral pulse — so a new
// asset with a brand-new animation_id still selects cleanly and the gap shows
// up in Data health rather than as a broken node.
//
// These are intentionally schematic: a tracer toward the zero line, a launch
// arc, a dive. Full per-type vignettes are step 6 work.
// ─────────────────────────────────────────────────────────────────────────

export type VignetteKind = "launch" | "ballistic" | "dive" | "advance" | "pulse";

export interface Vignette {
  kind: VignetteKind;
  /** Milliseconds; the node clears its playing state after this. */
  durationMs: number;
  /** Short caption shown in the detail panel next to the replay control. */
  caption: string;
}

const REGISTRY: Record<string, Vignette> = {
  sam_launch_intercept: {
    kind: "launch",
    durationMs: 1600,
    caption: "Interceptor climbs away from the battery toward an inbound track.",
  },
  artillery_fire_mission: {
    kind: "ballistic",
    durationMs: 1800,
    caption: "Round arcs downrange toward the zero line, with a fall-of-shot marker.",
  },
  loitering_munition_strike: {
    kind: "dive",
    durationMs: 1700,
    caption: "Loiter, then a terminal dive onto a point near the line.",
  },
  tank_move_fire: {
    kind: "advance",
    durationMs: 1500,
    caption: "Short bound forward, then a direct-fire flash toward the line.",
  },
};

export const FALLBACK: Vignette = {
  kind: "pulse",
  durationMs: 1000,
  caption: "No dedicated vignette for this behaviour yet — showing a neutral select pulse.",
};

export function resolveVignette(animationId: string | undefined): {
  vignette: Vignette;
  known: boolean;
} {
  if (!animationId) return { vignette: FALLBACK, known: false };
  const found = REGISTRY[animationId];
  return found ? { vignette: found, known: true } : { vignette: FALLBACK, known: false };
}

export function knownAnimationIds(): string[] {
  return Object.keys(REGISTRY);
}
