// ─────────────────────────────────────────────────────────────────────────
// View state. Deliberately separate from the data model: nothing in here is
// persisted or written back to /data. When edit mode arrives (build step 7)
// it gets its own store that *does* write, and this one keeps handling
// selection, filters and overlays.
// ─────────────────────────────────────────────────────────────────────────
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AssetGroup, ConnectionType, Side } from "../types";

// "nav" is the hamburger drawer. About/Data health/Key lessons used to live
// here as PanelIds (gated modals); they're routed pages now (see
// src/state/router.tsx, src/pages/) — the router owns their visibility, not
// this single-slot panel gate. Bands/categories/editor stay panel-gated:
// they're live-editing surfaces meant to float over the map you're editing,
// not standalone pages, and nothing in this pass asked them to change.
export type PanelId = "nav" | "bands" | "categories" | "editor" | null;

/** Pass 6 keeps BOTH renderers rather than replacing one with the other.
 *  Pass 5 removed a view outright and the immediate feedback was "I can't see
 *  the map anymore" — so the 3D terrain view leads, and the schematic
 *  cross-section (ruler, band editor, dependency overlay) stays one click
 *  away rather than being deleted for it. */
export type RenderMode = "terrain3d" | "schematic";

/** A request to point the 3D camera at a set of assets — raised by selection
 *  and by the Lessons page, consumed by Scene3D. The nonce makes re-issuing
 *  the same set a distinct event, so clicking one lesson twice re-frames it. */
export interface FocusRequest {
  assetIds: string[];
  nonce: number;
}

export interface ViewState {
  renderMode: RenderMode;
  setRenderMode: (m: RenderMode) => void;

  focusRequest: FocusRequest | null;
  focusAssets: (assetIds: string[]) => void;
  clearFocus: () => void;

  /** Uniform CSS-transform scale on the whole scene — the "zoom" control.
   *  Distinct from the browser/OS zoom: this scales node icons, labels and
   *  the terrain background together so they grow as a unit, independent of
   *  any real map tiles (there are none — see docs/DECISIONS.md Pass 5). */
  sceneZoom: number;
  setSceneZoom: (z: number | ((prev: number) => number)) => void;

  selectedId: string | null;
  hoveredId: string | null;
  hoveredConnectionKey: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  hoverConnection: (key: string | null) => void;

  showConnections: boolean;
  toggleConnections: () => void;
  connectionTypes: Set<ConnectionType>;
  toggleConnectionType: (t: ConnectionType) => void;

  /** connections.json documents two acceptable behaviours for an unresolved
   *  target: render a "pending" stub, or hide the line. Both are implemented;
   *  this switches between them at runtime. */
  showPending: boolean;
  togglePending: () => void;

  showDoctrineMarkers: boolean;
  toggleDoctrineMarkers: () => void;

  visibleSides: Set<Side>;
  toggleSide: (s: Side) => void;

  /** Groups the category filter has switched off. Empty = everything shown. */
  hiddenGroups: Set<AssetGroup>;
  toggleGroup: (g: AssetGroup) => void;
  showAllGroups: () => void;
  hideAllGroups: (allGroupIds: AssetGroup[]) => void;

  openPanel: PanelId;
  setOpenPanel: (p: PanelId) => void;
}

const ALL_CONNECTION_TYPES: ConnectionType[] = [
  "supply",
  "data_c2",
  "personnel",
  "fires_support",
  "casevac",
  "maintenance",
];

const Ctx = createContext<ViewState | null>(null);

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

export function ViewStateProvider({ children }: { children: ReactNode }) {
  const [renderMode, setRenderMode] = useState<RenderMode>("terrain3d");
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusNonce = useRef(0);
  const [sceneZoom, setSceneZoomRaw] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredConnectionKey, setHoveredConnectionKey] = useState<string | null>(null);
  const [showConnections, setShowConnections] = useState(true);
  const [connectionTypes, setConnectionTypes] = useState<Set<ConnectionType>>(
    () => new Set(ALL_CONNECTION_TYPES),
  );
  const [showPending, setShowPending] = useState(true);
  const [showDoctrineMarkers, setShowDoctrineMarkers] = useState(true);
  const [visibleSides, setVisibleSides] = useState<Set<Side>>(
    () => new Set<Side>(["side_a", "side_b"]),
  );
  const [hiddenGroups, setHiddenGroups] = useState<Set<AssetGroup>>(() => new Set());
  const [openPanel, setOpenPanel] = useState<PanelId>(null);

  const toggleConnectionType = useCallback((t: ConnectionType) => {
    setConnectionTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const toggleSide = useCallback((s: Side) => {
    setVisibleSides((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        // Never let both sides be hidden — an empty battlefield is a bug, not a view.
        if (next.size === 1) return prev;
        next.delete(s);
      } else next.add(s);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((g: AssetGroup) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }, []);

  const showAllGroups = useCallback(() => setHiddenGroups(new Set()), []);
  const hideAllGroups = useCallback((allGroupIds: AssetGroup[]) => setHiddenGroups(new Set(allGroupIds)), []);

  const focusAssets = useCallback((assetIds: string[]) => {
    focusNonce.current += 1;
    setFocusRequest({ assetIds, nonce: focusNonce.current });
  }, []);

  const clearFocus = useCallback(() => setFocusRequest(null), []);

  const setSceneZoom = useCallback((z: number | ((prev: number) => number)) => {
    setSceneZoomRaw((prev) => {
      const next = typeof z === "function" ? z(prev) : z;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    });
  }, []);

  const value = useMemo<ViewState>(
    () => ({
      renderMode,
      setRenderMode,
      focusRequest,
      focusAssets,
      clearFocus,
      sceneZoom,
      setSceneZoom,
      selectedId,
      hoveredId,
      hoveredConnectionKey,
      select: setSelectedId,
      hover: setHoveredId,
      hoverConnection: setHoveredConnectionKey,
      showConnections,
      toggleConnections: () => setShowConnections((v) => !v),
      connectionTypes,
      toggleConnectionType,
      showPending,
      togglePending: () => setShowPending((v) => !v),
      showDoctrineMarkers,
      toggleDoctrineMarkers: () => setShowDoctrineMarkers((v) => !v),
      visibleSides,
      toggleSide,
      hiddenGroups,
      toggleGroup,
      showAllGroups,
      hideAllGroups,
      openPanel,
      setOpenPanel,
    }),
    [
      renderMode,
      focusRequest,
      focusAssets,
      clearFocus,
      sceneZoom,
      setSceneZoom,
      selectedId,
      hoveredId,
      hoveredConnectionKey,
      showConnections,
      connectionTypes,
      toggleConnectionType,
      showPending,
      showDoctrineMarkers,
      visibleSides,
      toggleSide,
      hiddenGroups,
      toggleGroup,
      showAllGroups,
      hideAllGroups,
      openPanel,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewState(): ViewState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useViewState must be used inside <ViewStateProvider>");
  return v;
}

export { ALL_CONNECTION_TYPES };
