// ─────────────────────────────────────────────────────────────────────────
// Real-geography view. Satellite imagery + real elevation terrain, tilted to
// the oblique aerial read the reference mockups asked for, with every asset
// and pending stub placed by geoPlacement() (see that file for the honesty
// contract: real terrain and real coordinates, illustrative placement).
//
// Both raster sources below are free and keyless — no account, no token, no
// build-time fetch. They are plain https URLs resolved by the *visitor's*
// browser once this is deployed, which is what makes real imagery possible
// here at all (this sandbox cannot fetch binary images itself — see
// docs/DECISIONS.md — but a deployed page's own tile requests never touch
// this sandbox).
//   - Basemap: Esri World Imagery (satellite/aerial), public REST tile
//     service, no key required for reasonable use.
//   - Terrain: AWS Terrain Tiles (registry of open data), Terrarium-encoded
//     raster-dem, s3://elevation-tiles-prod, public and keyless.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";
import {
  Map as MaplibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  LngLatBounds,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WorldModel, SceneNode } from "../data/model";
import { SIDE_ACCENT, DOMAIN_ACCENT } from "../config/ui";
import { useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { resolveAssetDisplay } from "../data/catalog";
import { geoPlacement, FRONT_ANCHOR } from "./geoPlacement";

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
    "terrain-dem": {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15,
      attribution: "AWS Terrain Tiles (Terrarium)",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0a0d13" } },
    { id: "satellite", type: "raster", source: "satellite" },
    {
      id: "hillshade",
      type: "hillshade",
      source: "terrain-dem",
      paint: {
        "hillshade-exaggeration": 0.65,
        "hillshade-shadow-color": "#0c1016",
        "hillshade-highlight-color": "#e9edf5",
        "hillshade-accent-color": "#0c1016",
      },
    },
  ],
  terrain: { source: "terrain-dem", exaggeration: 1.6 },
};

function nodeKm(n: SceneNode): number {
  return n.kind === "asset" ? n.asset.distance_km_from_zero : n.stub.distance_km_from_zero;
}

export function MapView({ world }: { world: WorldModel }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const fittedRef = useRef(false);
  const view = useViewState();
  const overrides = useOverrides();

  // ── mount the map once ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: STYLE,
      center: [FRONT_ANCHOR.lng, FRONT_ANCHOR.lat],
      zoom: 10,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
      maxPitch: 78,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 140, unit: "metric" }), "bottom-left");

    map.on("load", () => {
      // Illustrative front line: a short line through the anchor,
      // perpendicular to the side bearings, purely to orient the eye — not a
      // claim about the real contact line's shape (which winds ~1,200 km).
      map.addSource("front-line", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [FRONT_ANCHOR.lng - 0.14, FRONT_ANCHOR.lat - 0.09],
              [FRONT_ANCHOR.lng + 0.14, FRONT_ANCHOR.lat + 0.09],
            ],
          },
        },
      });
      map.addLayer({
        id: "front-line",
        type: "line",
        source: "front-line",
        paint: {
          "line-color": "#e0483f",
          "line-width": 2,
          "line-dasharray": [2, 1.6],
          "line-opacity": 0.85,
        },
      });

      map.easeTo({ pitch: 58, bearing: 22, duration: 1400 });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── place / update markers whenever the filtered node set changes ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nodes: SceneNode[] = [
      ...world.assets
        .filter((a) => view.visibleSides.has(a.side) && !view.hiddenGroups.has(a.group))
        .map((a): SceneNode => ({ kind: "asset", id: a.id, asset: a })),
      ...(view.showPending
        ? world.stubs
            .filter((s) => view.visibleSides.has(s.side))
            .map((s): SceneNode => ({ kind: "stub", id: s.id, stub: s }))
        : []),
    ];

    const seen = new Set<string>();
    const bounds = new LngLatBounds();
    let any = false;

    for (const node of nodes) {
      seen.add(node.id);
      const side = node.kind === "asset" ? node.asset.side : node.stub.side;
      const domain = node.kind === "asset" ? node.asset.domain : node.stub.domain;
      const km = nodeKm(node);
      const pos = geoPlacement({ id: node.id, side, domain, distance_km_from_zero: km });
      bounds.extend([pos.lng, pos.lat]);
      any = true;

      let marker = markersRef.current.get(node.id);
      if (!marker) {
        const el = buildMarkerEl();
        marker = new Marker({ element: el, anchor: "bottom" })
          .setLngLat([pos.lng, pos.lat])
          .addTo(map);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          view.select(node.id);
        });
        el.addEventListener("mouseenter", () => view.hover(node.id));
        el.addEventListener("mouseleave", () => view.hover(null));
        markersRef.current.set(node.id, marker);
      } else {
        marker.setLngLat([pos.lng, pos.lat]);
      }

      const isStub = node.kind === "stub";
      const swapId = isStub ? null : overrides.assetOverrides[node.asset.id]?.catalog_equipment_id;
      const display = isStub ? null : resolveAssetDisplay(node.asset, swapId);
      const label = isStub ? node.stub.label : (display?.name ?? node.asset.name);
      const iconUrl = !isStub && node.asset.icon_image?.startsWith("http") ? node.asset.icon_image : null;
      const accent = isStub ? "#8b93a3" : SIDE_ACCENT[side].base;
      const domainAccent = DOMAIN_ACCENT[domain] ?? accent;

      renderMarkerEl(marker.getElement(), {
        label,
        km,
        accent,
        domainAccent,
        iconUrl,
        isStub,
        selected: view.selectedId === node.id,
        hovered: view.hoveredId === node.id,
      });
    }

    // Drop markers for nodes no longer in the filtered set.
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (any && !fittedRef.current) {
      map.fitBounds(bounds, { padding: 96, duration: 0, maxZoom: 13 });
      fittedRef.current = true;
    }
  }, [
    world.assets,
    world.stubs,
    view.visibleSides,
    view.hiddenGroups,
    view.showPending,
    view.selectedId,
    view.hoveredId,
    overrides.assetOverrides,
  ]);

  return (
    <div className="geoview">
      <div ref={containerRef} className="geoview__map" />
      <div className="geoview__notice">
        Real satellite imagery &amp; elevation terrain. Asset placement is representative — distance
        from the anchor near Orikhiv, Zaporizhzhia Oblast, not a measured position. The front here is
        mostly flat steppe; terrain is exaggerated (1.6×) to make the real, subtle relief legible.
      </div>
    </div>
  );
}

// ── marker DOM (built once per node, then patched in place) ─────────────
function buildMarkerEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "geo-pin";
  el.innerHTML = `
    <div class="geo-pin__dot"><img class="geo-pin__img" alt="" draggable="false" /></div>
    <div class="geo-pin__label"><span class="geo-pin__name"></span><span class="geo-pin__km"></span></div>
  `;
  return el;
}

function renderMarkerEl(
  el: HTMLElement,
  opts: {
    label: string;
    km: number;
    accent: string;
    domainAccent: string;
    iconUrl: string | null;
    isStub: boolean;
    selected: boolean;
    hovered: boolean;
  },
) {
  el.className = [
    "geo-pin",
    opts.isStub ? "geo-pin--stub" : "",
    opts.selected ? "is-selected" : "",
    opts.hovered ? "is-hovered" : "",
  ]
    .filter(Boolean)
    .join(" ");
  el.style.setProperty("--accent", opts.accent);
  el.style.setProperty("--domain-accent", opts.domainAccent);

  const img = el.querySelector<HTMLImageElement>(".geo-pin__img");
  if (img) {
    if (opts.iconUrl) {
      if (img.src !== opts.iconUrl) img.src = opts.iconUrl;
      img.style.display = "";
      img.onerror = () => {
        img.style.display = "none";
      };
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
  }
  const name = el.querySelector(".geo-pin__name");
  if (name) name.textContent = opts.label;
  const km = el.querySelector(".geo-pin__km");
  if (km) km.textContent = opts.isStub ? "pending" : `${opts.km} km`;
  el.title = opts.label;
}
