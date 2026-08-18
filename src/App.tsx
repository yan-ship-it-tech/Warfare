import { useCallback, useEffect, useMemo, useState } from "react";
import { loadWorld } from "./data/loader";
import { Scene } from "./scene/Scene";
import { Toolbar } from "./components/Toolbar";
import { DetailPanel } from "./components/DetailPanel";
import { AboutPanel } from "./components/AboutPanel";
import { DataHealthPanel } from "./components/DataHealthPanel";
import { Legend } from "./components/Legend";
import { ViewStateProvider, useViewState } from "./state/viewState";

function AppInner() {
  const world = useMemo(() => loadWorld(), []);
  const view = useViewState();
  const [replayNonce, setReplayNonce] = useState(0);
  const replay = useCallback(() => setReplayNonce((n) => n + 1), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view.openPanel) view.setOpenPanel(null);
      else view.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  return (
    <div className={`app${view.selectedId ? " has-detail" : ""}`}>
      <Toolbar world={world} />
      <main className="app__main">
        <Scene world={world} replayNonce={replayNonce} />
        <Legend world={world} />
      </main>
      <DetailPanel world={world} onReplay={replay} />
      <AboutPanel world={world} />
      <DataHealthPanel world={world} />
    </div>
  );
}

export function App() {
  return (
    <ViewStateProvider>
      <AppInner />
    </ViewStateProvider>
  );
}
