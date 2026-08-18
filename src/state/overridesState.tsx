// ─────────────────────────────────────────────────────────────────────────
// Local, persisted overrides layer — distance bands and per-asset placement.
//
// The master prompt's build sequence asks for a real backend later ("start
// with local JSON/DB-backed storage, don't over-engineer backend on day one").
// This is that first step: edits live in this browser's localStorage, on top
// of the shipped data/*.json, rather than mutating the repo files at runtime.
// They therefore don't sync across devices or persist across a data reset —
// worth knowing before treating an edit as durable. Wiring these onto a real
// store is the natural extension of this file, not a rewrite of it.
//
// Bands change every few months as doctrine shifts; asset distances change
// per-asset as reporting improves. Both need to be editable without a code
// change, and both need the map to react immediately — which is why the band
// list here is what the projection and every "which band is this asset in"
// read from, not the static bands.json.
// ─────────────────────────────────────────────────────────────────────────
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DistanceBand } from "../types";

const BANDS_KEY = "warfare-twin:bands:v1";
const ASSET_OVERRIDES_KEY = "warfare-twin:asset-overrides:v1";

export interface AssetOverride {
  distance_km_from_zero?: number;
  operating_range_km?: { min_km: number; max_km: number } | null;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing / quota — edits still work for this session, just
    // won't survive a reload. Not worth surfacing as an app-level error.
  }
}

let bandIdSeq = 0;
function newBandId() {
  bandIdSeq += 1;
  return `custom_band_${Date.now().toString(36)}_${bandIdSeq}`;
}

export interface OverridesState {
  /** null = "use the shipped bands.json defaults, unedited". */
  bands: DistanceBand[] | null;
  bandsAreCustom: boolean;
  setBand: (id: string, patch: Partial<DistanceBand>) => void;
  addBand: () => void;
  removeBand: (id: string) => void;
  resetBands: () => void;

  assetOverrides: Record<string, AssetOverride>;
  setAssetOverride: (id: string, patch: AssetOverride) => void;
  resetAssetOverride: (id: string) => void;
  hasAssetOverride: (id: string) => boolean;
}

const Ctx = createContext<OverridesState | null>(null);

export function OverridesProvider({
  defaultBands,
  children,
}: {
  defaultBands: DistanceBand[];
  children: ReactNode;
}) {
  const [bands, setBands] = useState<DistanceBand[] | null>(() => readJSON<DistanceBand[]>(BANDS_KEY));
  const [assetOverrides, setAssetOverrides] = useState<Record<string, AssetOverride>>(
    () => readJSON<Record<string, AssetOverride>>(ASSET_OVERRIDES_KEY) ?? {},
  );

  useEffect(() => {
    if (bands) writeJSON(BANDS_KEY, bands);
    else window.localStorage.removeItem(BANDS_KEY);
  }, [bands]);

  useEffect(() => {
    writeJSON(ASSET_OVERRIDES_KEY, assetOverrides);
  }, [assetOverrides]);

  const ensureCustom = useCallback(
    (mutate: (draft: DistanceBand[]) => DistanceBand[]) => {
      setBands((prev) => mutate(prev ? [...prev] : defaultBands.map((b) => ({ ...b }))));
    },
    [defaultBands],
  );

  const setBand = useCallback(
    (id: string, patch: Partial<DistanceBand>) => {
      ensureCustom((draft) => draft.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [ensureCustom],
  );

  const addBand = useCallback(() => {
    ensureCustom((draft) => {
      const maxKm = draft.reduce((m, b) => Math.max(m, b.max_km < 10_000 ? b.max_km : m), 0);
      return [
        ...draft,
        {
          id: newBandId(),
          label: `New band (${maxKm}–${maxKm + 50} km)`,
          echelon: "operational",
          min_km: maxKm,
          max_km: maxKm + 50,
          side: "both",
        },
      ];
    });
  }, [ensureCustom]);

  const removeBand = useCallback(
    (id: string) => {
      ensureCustom((draft) => (draft.length <= 1 ? draft : draft.filter((b) => b.id !== id)));
    },
    [ensureCustom],
  );

  const resetBands = useCallback(() => setBands(null), []);

  const setAssetOverride = useCallback((id: string, patch: AssetOverride) => {
    setAssetOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const resetAssetOverride = useCallback((id: string) => {
    setAssetOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const value = useMemo<OverridesState>(
    () => ({
      bands,
      bandsAreCustom: bands !== null,
      setBand,
      addBand,
      removeBand,
      resetBands,
      assetOverrides,
      setAssetOverride,
      resetAssetOverride,
      hasAssetOverride: (id: string) => id in assetOverrides,
    }),
    [bands, setBand, addBand, removeBand, resetBands, assetOverrides, setAssetOverride, resetAssetOverride],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOverrides(): OverridesState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOverrides must be used inside <OverridesProvider>");
  return v;
}
