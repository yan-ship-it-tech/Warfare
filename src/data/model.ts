// ─────────────────────────────────────────────────────────────────────────
// Loader-derived types. These sit *on top of* the scaffold schema in
// ../types.ts — that file is the contract and is used exactly as delivered.
// Nothing here changes the shape of an asset JSON file.
// ─────────────────────────────────────────────────────────────────────────
import type {
  Asset,
  AssetGroup,
  ConnectionType,
  DistanceBand,
  Domain,
  DomainLayer,
  Side,
} from "../types";

export type IssueSeverity = "error" | "warning" | "info";

export interface DataIssue {
  severity: IssueSeverity;
  /** File or logical origin the issue came from, e.g. a JSON filename. */
  source: string;
  /** Asset / connection id the issue is about, when there is one. */
  subject?: string;
  message: string;
}

/**
 * A connection whose `target_id` does not (yet) resolve to a real asset.
 * connections.json documents this case explicitly: the loader must render a
 * "pending" stub node or hide the line, never error. We build a stub node so
 * the dependency web stays legible while categories are still being filled in.
 */
export interface PendingStub {
  id: string;
  label: string;
  side: Side;
  domain: Domain;
  band_id: string;
  distance_km_from_zero: number;
  /** ids of the real assets that point at this stub. */
  referenced_by: string[];
  /** Which parts of the placement were inferred from the id slug vs. borrowed
   *  from the referencing asset — surfaced in the UI so an inferred position is
   *  never mistaken for an authored one. */
  inferred: { side: boolean; domain: boolean; band: boolean };
}

export interface ResolvedConnection {
  key: string;
  source_id: string;
  target_id: string;
  type: ConnectionType;
  description: string;
  /** Where this edge was declared. Both means asset + connections.json agree. */
  origin: "asset" | "file" | "both";
  /** True when target_id resolves to a PendingStub rather than a real Asset. */
  target_pending: boolean;
}

export interface DoctrineMarker {
  id: string;
  label: string;
  min_km: number;
  max_km: number;
  side: Side | "both";
  source_tag: string;
  note: string;
}

export interface LowerSkyControl {
  source_tag: string;
  finding: string;
  with_control: { closest_deploy_km: number; closest_deploy_km_max?: number; note: string };
  without_control: { closest_deploy_km: number; note: string };
}

export interface GroupDef {
  id: AssetGroup;
  label: string;
  description: string;
  color: string;
}

/** Everything the scene renders from, assembled once at load. */
export interface WorldModel {
  bands: DistanceBand[];
  domains: DomainLayer[];
  groups: GroupDef[];
  groupsById: Map<string, GroupDef>;
  assets: Asset[];
  assetsById: Map<string, Asset>;
  stubs: PendingStub[];
  stubsById: Map<string, PendingStub>;
  connections: ResolvedConnection[];
  doctrineMarkers: DoctrineMarker[];
  lowerSky: LowerSkyControl | null;
  issues: DataIssue[];
}

/**
 * The band whose [min_km, max_km) contains `km`, falling back to whichever
 * band edge is nearest when nothing contains it (bands are user-editable, so
 * gaps and out-of-range values are a normal transient state, not a bug).
 * This is the single source of truth for "which band is an asset in" — the
 * stored `band_id` on an asset is informational only; placement and display
 * both derive from distance against the *current* bands.
 */
export function resolveBand(km: number, bands: DistanceBand[]): DistanceBand | undefined {
  if (bands.length === 0) return undefined;
  const hit = bands.find((b) => km >= b.min_km && km <= b.max_km);
  if (hit) return hit;
  const sorted = [...bands].sort((a, b) => a.min_km - b.min_km);
  return km < sorted[0].min_km ? sorted[0] : sorted[sorted.length - 1];
}

/** Either kind of node the scene can place and the overlay can connect. */
export type SceneNode =
  | { kind: "asset"; id: string; asset: Asset }
  | { kind: "stub"; id: string; stub: PendingStub };

export function nodeSide(n: SceneNode): Side {
  return n.kind === "asset" ? n.asset.side : n.stub.side;
}
export function nodeDomain(n: SceneNode): Domain {
  return n.kind === "asset" ? n.asset.domain : n.stub.domain;
}
export function nodeDistance(n: SceneNode): number {
  return n.kind === "asset"
    ? n.asset.distance_km_from_zero
    : n.stub.distance_km_from_zero;
}
export function nodeLabel(n: SceneNode): string {
  return n.kind === "asset" ? n.asset.name : n.stub.label;
}
