import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_BANDS, loadWorld } from "./data/loader";
import { Scene } from "./scene/Scene";
import { MapView } from "./map/MapView";
import { Toolbar } from "./components/Toolbar";
import { DetailPanel } from "./components/DetailPanel";
import { AboutPanel } from "./components/AboutPanel";
import { DataHealthPanel } from "./components/DataHealthPanel";
import { BandsEditorPanel } from "./components/BandsEditorPanel";
import { Legend } from "./components/Legend";
import { ViewStateProvider, useViewState } from "./state/viewState";
import { OverridesProvider, useOverrides } from "./state/overridesState";

function AppInner() {
  const view = useViewState();
  const overrides = useOverrides();
  const world = useMemo(
    () => loadWorld(overrides.bands, overrides.assetOverrides),
    [overrides.bands, overrides.assetOverrides],
  );
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
        {view.mode === "map" ? (
          <MapView world={world} />
        ) : (
          <Scene world={world} replayNonce={replayNonce} />
        )}
        <Legend world={world} />
      </main>
      <DetailPanel world={world} onReplay={replay} />
      <AboutPanel world={world} />
      <DataHealthPanel world={world} />
      <BandsEditorPanel />
    </div>
  );
}

export function App() {
  return (
    <ViewStateProvider>
      <OverridesProvider defaultBands={DEFAULT_BANDS}>
        <AppInner />
      </OverridesProvider>
    </ViewStateProvider>
  );
}
