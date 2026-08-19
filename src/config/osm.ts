// ─────────────────────────────────────────────────────────────────────────
// Small, data-FREE constants about the OSM metric inset (src/three/osmTerrain.ts),
// for anything that needs to reference it without pulling in the ~140 KB
// derived extract that module also imports.
//
// Why this file exists rather than importing osmTerrain.ts directly: that
// module is only ever reached today through Scene3D.tsx, which App.tsx lazy-
// loads specifically so the app shell and every routed page never pay for
// three.js or its data (see App.tsx's own comment on why). The About page
// is NOT lazy — it's a routed page reached through the ordinary import
// graph — so an import from AboutPage.tsx straight into osmTerrain.ts would
// drag its JSON import into a shared chunk loaded on first paint, silently
// undoing that split. This file is the seam: values with no data attached
// live here and get imported by both sides; anything that actually needs
// the parsed extract stays inside osmTerrain.ts, reached only through
// Scene3D's lazy boundary.
//
// The attribution/license strings are copied from `data/osm/pokrovsk.json`'s
// own `source` block (docs/OSM_PIPELINE.md's output schema) rather than
// read from it at build time — ODbL's required credit text is fixed by the
// licence itself, not something a re-fetch would change, so a literal here
// is the honest trade for not importing data into a non-lazy path. If a
// future AOI ever shipped under a different license this would need to be
// revisited, not silently reused.
// ─────────────────────────────────────────────────────────────────────────
import type { Side } from "../types";

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const OSM_LICENSE = "ODbL 1.0";

/** Mirrors src/three/osmTerrain.ts's own OSM_INSET_SIDE/KM — see that file
 *  for the full placement reasoning. Kept here too only so the About page
 *  can name where the patch sits without importing the heavy module. */
export const OSM_INSET_SIDE: Side = "side_a";
export const OSM_INSET_KM = 20;
