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
  useState,
  type ReactNode,
} from "react";
import type { ConnectionType, Side } from "../types";

export type PanelId = "about" | "health" | null;

export interface ViewState {
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

export function ViewStateProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo<ViewState>(
    () => ({
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
      openPanel,
      setOpenPanel,
    }),
    [
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
