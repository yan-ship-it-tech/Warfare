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
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DistanceBand } from "../types";
import {
  activeAdapter,
  downloadStore,
  parseStore,
  type StoreShape,
} from "./persistence";

/** A user-supplied picture or clip attached to an asset from the detail
 *  panel. Images are re-encoded to a size-capped data URL and persist like
 *  every other override; video cannot — a real clip blows past what
 *  localStorage can hold — so it plays for this session via an object URL
 *  and is clearly marked as not saved. See docs/DECISIONS.md Pass 5. */
export interface CustomMedia {
  id: string;
  kind: "image" | "video";
  url: string;
  name: string;
  persisted: boolean;
}

/** Free-text fields an asset author can edit in place from the detail panel.
 *  Kept separate from the structured fields above so "reset placement" and
 *  "reset text" can stay independent resets (see docs/BACKLOG.md #7). */
export interface AssetTextOverride {
  short_role?: string;
  employment_notes?: string;
  contrast_vs_traditional?: string;
  characteristics?: string[];
}

export interface AssetOverride {
  distance_km_from_zero?: number;
  operating_range_km?: { min_km: number; max_km: number } | null;
  /** Which catalog entry fills this asset's slot — see src/data/catalog.ts.
   *  null/undefined means "the asset's own authored system." */
  catalog_equipment_id?: string | null;
  text?: AssetTextOverride;
  customMedia?: CustomMedia[];
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

  /** Where edits are being persisted, and whether that reaches other people.
   *  Surfaced in the UI rather than assumed — "saved" meaning two different
   *  things depending on build config is exactly the kind of thing that
   *  should never be implicit. */
  storageLabel: string;
  storageIsShared: boolean;
  syncState: "idle" | "loading" | "saving" | "error";
  exportEdits: () => void;
  importEdits: (file: File) => Promise<void>;

  assetOverrides: Record<string, AssetOverride>;
  setAssetOverride: (id: string, patch: AssetOverride) => void;
  resetAssetOverride: (id: string) => void;
  hasAssetOverride: (id: string) => boolean;

  /** Merges into the existing text override rather than replacing it. */
  setAssetText: (id: string, patch: AssetTextOverride) => void;
  resetAssetText: (id: string) => void;
  addCustomMedia: (id: string, media: CustomMedia) => void;
  removeCustomMedia: (id: string, mediaId: string) => void;
}

const Ctx = createContext<OverridesState | null>(null);

export function OverridesProvider({
  defaultBands,
  children,
}: {
  defaultBands: DistanceBand[];
  children: ReactNode;
}) {
  const [bands, setBands] = useState<DistanceBand[] | null>(null);
  const [assetOverrides, setAssetOverrides] = useState<Record<string, AssetOverride>>({});
  const [syncState, setSyncState] = useState<"idle" | "loading" | "saving" | "error">("loading");
  // Nothing is written back until the initial load has landed, or an empty
  // first render would immediately overwrite a populated remote store.
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    activeAdapter
      .load()
      .then((data) => {
        if (cancelled || !data) return;
        setBands(data.bands ?? null);
        setAssetOverrides(data.assetOverrides ?? {});
      })
      .catch(() => setSyncState("error"))
      .finally(() => {
        if (cancelled) return;
        hydrated.current = true;
        setSyncState((s) => (s === "error" ? s : "idle"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced so dragging a band slider is one write, not forty.
  useEffect(() => {
    if (!hydrated.current) return;
    setSyncState("saving");
    const t = window.setTimeout(() => {
      void activeAdapter
        .save({ version: 1, updated_at: new Date().toISOString(), bands, assetOverrides })
        .then(() => setSyncState("idle"))
        .catch(() => setSyncState("error"));
    }, 400);
    return () => window.clearTimeout(t);
  }, [bands, assetOverrides]);

  const exportEdits = useCallback(() => {
    downloadStore({ version: 1, updated_at: new Date().toISOString(), bands, assetOverrides });
  }, [bands, assetOverrides]);

  const importEdits = useCallback(async (file: File) => {
    const parsed: StoreShape = parseStore(await file.text());
    setBands(parsed.bands);
    setAssetOverrides(parsed.assetOverrides);
  }, []);

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

  const setAssetText = useCallback((id: string, patch: AssetTextOverride) => {
    setAssetOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], text: { ...prev[id]?.text, ...patch } },
    }));
  }, []);

  const resetAssetText = useCallback((id: string) => {
    setAssetOverrides((prev) => {
      if (!prev[id]?.text) return prev;
      const { text: _drop, ...rest } = prev[id];
      return { ...prev, [id]: rest };
    });
  }, []);

  const addCustomMedia = useCallback((id: string, media: CustomMedia) => {
    setAssetOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], customMedia: [...(prev[id]?.customMedia ?? []), media] },
    }));
  }, []);

  const removeCustomMedia = useCallback((id: string, mediaId: string) => {
    setAssetOverrides((prev) => {
      const existing = prev[id]?.customMedia;
      if (!existing) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], customMedia: existing.filter((m) => m.id !== mediaId) },
      };
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
      storageLabel: activeAdapter.label,
      storageIsShared: activeAdapter.shared,
      syncState,
      exportEdits,
      importEdits,
      assetOverrides,
      setAssetOverride,
      resetAssetOverride,
      hasAssetOverride: (id: string) => id in assetOverrides,
      setAssetText,
      resetAssetText,
      addCustomMedia,
      removeCustomMedia,
    }),
    [
      bands,
      setBand,
      addBand,
      removeBand,
      resetBands,
      syncState,
      exportEdits,
      importEdits,
      assetOverrides,
      setAssetOverride,
      resetAssetOverride,
      setAssetText,
      resetAssetText,
      addCustomMedia,
      removeCustomMedia,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOverrides(): OverridesState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOverrides must be used inside <OverridesProvider>");
  return v;
}
