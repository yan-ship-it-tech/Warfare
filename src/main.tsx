import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// #bench is the renderer head-to-head (layered DOM vs. WebGL) used to settle
// the rendering-approach question. Lazy so it never touches the main bundle.
const Bench = lazy(() => import("./bench/Bench").then((m) => ({ default: m.Bench })));

const isBench = window.location.hash.replace("#", "") === "bench";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isBench ? (
      <Suspense fallback={<div style={{ padding: 32 }}>Loading benchmark…</div>}>
        <Bench />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);

// Switching to or from #bench swaps the whole app; a reload keeps it simple.
window.addEventListener("hashchange", () => window.location.reload());
