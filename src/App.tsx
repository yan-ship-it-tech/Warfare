import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_BANDS, loadWorld } from "./data/loader";
import { Scene } from "./scene/Scene";
import { Toolbar } from "./components/Toolbar";
import { DetailPanel } from "./components/DetailPanel";
import { AboutPanel } from "./components/AboutPanel";
import { DataHealthPanel } from "./components/DataHealthPanel";
import { BandsEditorPanel } from "./components/BandsEditorPanel";
import { LessonsPanel } from "./components/LessonsPanel";
import { Legend } from "./components/Legend";
import { ViewStateProvider, useViewState } from "./state/viewState";
import { OverridesProvider, useOverrides } from "./state/overridesState";

// three.js plus the terrain/model builders are by far the heaviest thing in
// the bundle. Lazy so the app shell, the data layer and the schematic view
// never pay for them, and so a device that falls back to the schematic view
// never downloads a 3D engine it will not run.
const Scene3D = lazy(() => import("./three/Scene3D"));

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
        {view.renderMode === "terrain3d" ? (
          <Suspense fallback={<div className="scene3d__loading">Building terrain…</div>}>
            <Scene3D world={world} />
          </Suspense>
        ) : (
          <Scene world={world} replayNonce={replayNonce} />
        )}
        <Legend world={world} />
      </main>
      <DetailPanel world={world} onReplay={replay} />
      <AboutPanel world={world} />
      <DataHealthPanel world={world} />
      <BandsEditorPanel />
      <LessonsPanel world={world} />
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
