// ─────────────────────────────────────────────────────────────────────────
// Core data model for the Multi-Domain Warfare Digital Twin
// Everything the UI renders is driven from these shapes + the JSON files
// in /data. Add a new asset by adding a new JSON file — no code changes.
// ─────────────────────────────────────────────────────────────────────────

export type Side = "side_a" | "side_b"; // generic by default — rename in ui-config, not here

export type Domain =
  | "land"
  | "air"
  | "sea"
  | "space"
  | "cyber_ew"
  | "logistics"
  | "medical"
  | "c2_comms";

export type Echelon = "strategic" | "operational" | "tactical";

export type ConnectionType =
  | "supply"        // ammo, fuel, parts
  | "data_c2"       // sensor feed, targeting data, command link
  | "personnel"      // crew rotation, reinforcement, training pipeline
  | "fires_support"  // calls for fire, target handoff
  | "casevac"        // medical evacuation chain
  | "maintenance";   // repair / recovery

export interface DistanceBand {
  id: string;
  label: string;               // e.g. "Tactical (0–5 km)"
  echelon: Echelon;
  min_km: number;
  max_km: number;               // use a large number for open-ended "150km+"
  side: Side | "both";
}

export interface DomainLayer {
  id: Domain;
  label: string;
  vertical_order: number;       // stacking order for the up/down scroll axis
  description: string;
}

export interface AssetConnection {
  target_id: string;            // id of the other Asset
  type: ConnectionType;
  description: string;          // short — shown on hover/click of the line
}

export interface Asset {
  id: string;                            // stable slug, e.g. "side_a-air-defense-long-patriot"
  name: string;                          // display name, e.g. "Patriot (PAC-3 MSE)"
  side: Side;
  domain: Domain;
  echelon: Echelon;
  distance_km_from_zero: number;         // representative placement, not literal intel
  band_id: string;                       // references DistanceBand.id
  category: string;                      // e.g. "air-defense-long-range"
  representative_system: string;         // real-world system used as the example
  icon_image: string;                    // path/URL to the small map icon
  gallery_images: string[];              // path/URL(s) for the detail panel

  short_role: string;                    // 1 sentence, shown on hover
  characteristics: string[];             // bullet facts (range, crew, etc.)
  employment_notes: string;              // how it's actually used in practice
  contrast_vs_traditional: string;       // 2-4 sentences: what changed vs. legacy warfare

  reactive_behavior?: {
    animation_id: string;                // key into the animation registry
    description: string;                 // what the vignette shows
  };

  connections: AssetConnection[];

  sources: { label: string; url: string }[];

  editable: true;                        // scaffold marker — all assets are user-editable
}
