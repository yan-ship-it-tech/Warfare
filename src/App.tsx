import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_BANDS, loadWorld } from "./data/loader";
import { Scene } from "./scene/Scene";
import { AppHeader } from "./components/AppHeader";
import { NavDrawer } from "./components/NavDrawer";
import { PageShell } from "./components/PageShell";
import { DetailPanel } from "./components/DetailPanel";
import { BandsEditorPanel } from "./components/BandsEditorPanel";
import { AssetEditorPanel } from "./components/AssetEditorPanel";
import { Legend } from "./components/Legend";
import { ViewStateProvider, useViewState } from "./state/viewState";
import { OverridesProvider, useOverrides } from "./state/overridesState";
import { RouterProvider, useRouter } from "./state/router";
import { findPage } from "./pages/registry";

// three.js plus the terrain/model builders are by far the heaviest thing in
// the bundle. Lazy so the app shell, the data layer and the schematic view
// never pay for them, and so a device that falls back to the schematic view
// never downloads a 3D engine it will not run.
const Scene3D = lazy(() => import("./three/Scene3D"));

function AppInner() {
  const view = useViewState();
  const overrides = useOverrides();
  const router = useRouter();
  const world = useMemo(
    () => loadWorld(overrides.bands, overrides.assetOverrides, overrides.customAssets),
    [overrides.bands, overrides.assetOverrides, overrides.customAssets],
  );
  const [replayNonce, setReplayNonce] = useState(0);
  const replay = useCallback(() => setReplayNonce((n) => n + 1), []);
  const page = findPage(router.path);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view.openPanel) view.setOpenPanel(null);
      else view.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  // Routed pages get a real, bookmarkable title, same as any other page in
  // this app would — not load-bearing for anything else.
  useEffect(() => {
    document.title = page ? `${page.title} — Multi-Domain Battlefield` : "Multi-Domain Battlefield";
  }, [page]);

  return (
    <div className={`app${view.selectedId ? " has-detail" : ""}`}>
      <AppHeader world={world} />
      <NavDrawer world={world} />
      <main className="app__main">
        {page ? (
          <PageShell title={page.title} onClose={() => router.navigate("/")}>
            <page.Component world={world} />
          </PageShell>
        ) : (
          <>
            {view.renderMode === "terrain3d" ? (
              <Suspense fallback={<div className="scene3d__loading">Building terrain…</div>}>
                <Scene3D world={world} />
              </Suspense>
            ) : (
              <Scene world={world} replayNonce={replayNonce} />
            )}
            <Legend world={world} />
          </>
        )}
      </main>
      <DetailPanel world={world} onReplay={replay} />
      <BandsEditorPanel />
      <AssetEditorPanel world={world} />
    </div>
  );
}

export function App() {
  return (
    <ViewStateProvider>
      <OverridesProvider defaultBands={DEFAULT_BANDS}>
        <RouterProvider>
          <AppInner />
        </RouterProvider>
      </OverridesProvider>
    </ViewStateProvider>
  );
}
