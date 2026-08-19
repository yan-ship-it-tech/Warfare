// ─────────────────────────────────────────────────────────────────────────
// Persistence adapters.
//
// THE CONSTRAINT WORTH READING BEFORE CHANGING ANYTHING HERE
//
// This app is a static site on GitHub Pages. There is no server of ours in
// the request path, which means any credential a "simple hosted JSON store"
// needs (JSONBin, Supabase, Firebase, ...) would have to ship inside the
// client bundle — readable by anyone who opens devtools, and committed to a
// public repo besides. A *write-capable* key published that way is not a
// shortcut, it is an open invitation to wipe the shared state.
//
// So this file does three things instead of hardcoding one:
//
//   1. Defines the adapter seam. Everything above it (overridesState) is
//      storage-agnostic, so swapping local for remote is a config change,
//      not a refactor — which is what backlog item #11 actually asked for.
//   2. Ships `localAdapter` (today's behaviour) and `remoteAdapter` (a real
//      REST client), with the remote one configured from build-time env
//      rather than a literal in the source. No secret is committed here.
//   3. Ships export/import, which is the genuinely zero-backend way to move
//      a working set between devices right now, with no key to leak.
//
// To go shared: set VITE_SYNC_URL (and optionally VITE_SYNC_TOKEN) at build
// time to an endpoint you control. The contract is at the bottom of this
// file and is deliberately small enough to satisfy with a ~20-line worker.
// ─────────────────────────────────────────────────────────────────────────
import type { Asset, DistanceBand } from "../types";
import type { AssetOverride } from "./overridesState";

export interface StoreShape {
  version: 1;
  updated_at: string;
  bands: DistanceBand[] | null;
  assetOverrides: Record<string, AssetOverride>;
  /** Brand-new assets added live from the Asset Editor page (Pass 7, item 7)
   *  — distinct from `assetOverrides`, which only patches a *shipped* asset.
   *  Optional so a StoreShape saved before this field existed still parses:
   *  every reader below defaults a missing value to `{}` rather than
   *  treating it as an error. */
  customAssets?: Record<string, Asset>;
}

export interface StorageAdapter {
  /** Shown in the UI so it is never ambiguous where edits are going. */
  readonly label: string;
  /** True when edits reach other devices/people. Drives the honesty banner. */
  readonly shared: boolean;
  load(): Promise<StoreShape | null>;
  save(data: StoreShape): Promise<void>;
}

const BANDS_KEY = "warfare-twin:bands:v1";
const ASSET_OVERRIDES_KEY = "warfare-twin:asset-overrides:v1";
const CUSTOM_ASSETS_KEY = "warfare-twin:custom-assets:v1";

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Today's behaviour, unchanged — and still the offline fallback when a
 *  remote store is configured but unreachable. */
export const localAdapter: StorageAdapter = {
  label: "This browser only",
  shared: false,
  async load() {
    const bands = readJSON<DistanceBand[]>(BANDS_KEY);
    const assetOverrides = readJSON<Record<string, AssetOverride>>(ASSET_OVERRIDES_KEY) ?? {};
    const customAssets = readJSON<Record<string, Asset>>(CUSTOM_ASSETS_KEY) ?? {};
    return { version: 1, updated_at: new Date().toISOString(), bands, assetOverrides, customAssets };
  },
  async save(data) {
    try {
      if (data.bands) window.localStorage.setItem(BANDS_KEY, JSON.stringify(data.bands));
      else window.localStorage.removeItem(BANDS_KEY);
      window.localStorage.setItem(ASSET_OVERRIDES_KEY, JSON.stringify(data.assetOverrides));
      window.localStorage.setItem(CUSTOM_ASSETS_KEY, JSON.stringify(data.customAssets ?? {}));
    } catch {
      // Private browsing / quota. Edits still work this session; they just
      // won't survive a reload. Not an app-level error.
    }
  },
};

/**
 * REST adapter. Two calls, no SDK, no vendor lock:
 *   GET  {url}  → StoreShape (or 404 when nothing saved yet)
 *   PUT  {url}  ← StoreShape
 *
 * Writes fall back to local on failure rather than throwing away the edit,
 * and every remote save also writes locally so a network outage degrades to
 * the old behaviour instead of losing work.
 */
export function remoteAdapter(url: string, token?: string): StorageAdapter {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  return {
    label: "Shared store",
    shared: true,
    async load() {
      try {
        const res = await fetch(url, { headers });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`sync load failed: ${res.status}`);
        return (await res.json()) as StoreShape;
      } catch (err) {
        console.warn("[persistence] remote load failed, falling back to local", err);
        return localAdapter.load();
      }
    },
    async save(data) {
      // Local first: a successful remote write is a bonus, a failed one must
      // never be the reason an edit disappears.
      await localAdapter.save(data);
      try {
        const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(data) });
        if (!res.ok) throw new Error(`sync save failed: ${res.status}`);
      } catch (err) {
        console.warn("[persistence] remote save failed; edit is saved locally only", err);
      }
    },
  };
}

const SYNC_URL = import.meta.env.VITE_SYNC_URL as string | undefined;
const SYNC_TOKEN = import.meta.env.VITE_SYNC_TOKEN as string | undefined;

/** The adapter this build uses. Remote when configured, local otherwise. */
export const activeAdapter: StorageAdapter =
  SYNC_URL && SYNC_URL.trim() !== "" ? remoteAdapter(SYNC_URL, SYNC_TOKEN) : localAdapter;

// ── export / import: the zero-backend way to move edits between devices ──

export function serialize(data: StoreShape): string {
  return JSON.stringify({ ...data, updated_at: new Date().toISOString() }, null, 2);
}

export function downloadStore(data: StoreShape) {
  const blob = new Blob([serialize(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `warfare-twin-edits-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parses an imported file, rejecting anything that isn't our shape rather
 *  than merging half-understood JSON into live state. */
export function parseStore(text: string): StoreShape {
  const raw = JSON.parse(text) as Partial<StoreShape>;
  if (raw.version !== 1) throw new Error("Unrecognised file version — expected version 1.");
  if (raw.assetOverrides == null || typeof raw.assetOverrides !== "object") {
    throw new Error("File is missing `assetOverrides`.");
  }
  return {
    version: 1,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
    bands: Array.isArray(raw.bands) ? (raw.bands as DistanceBand[]) : null,
    assetOverrides: raw.assetOverrides as Record<string, AssetOverride>,
    customAssets:
      raw.customAssets && typeof raw.customAssets === "object"
        ? (raw.customAssets as Record<string, Asset>)
        : {},
  };
}
