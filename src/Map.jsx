import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import sampleHazards from "./assets/sampleHazards.json";
import { hazardsToGeoJSON, recencyDecay } from "./utils/hazardProcessor.js";
import { inferAADT, segmentCost } from "./utils/costModel.js";
import { downloadCSV } from "./utils/csvExport.js";

const JSMap = globalThis.Map;

// City center for the pilot deployment (Bothell, WA — approx. downtown/City Hall area).
// Swap this if the pilot area shifts (e.g. a specific route or neighborhood).
const BOTHELL_CENTER = [-122.2054, 47.7601];

export default function Map({ mode: initialMode, className = "h-[70vh]" }) {
  // Coerce whatever comes back from the worker into a clean number[]
  function toNumberArray(input) {
    if (Array.isArray(input)) {
      return input.map(Number).filter(Number.isFinite);
    }
    if (typeof input === "string") {
      try {
        const parsed = JSON.parse(input);
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
      } catch { return []; }
    }
    if (input && typeof input === "object") {
      return Object.values(input).map(Number).filter(Number.isFinite);
    }
    return [];
  }

  function sparklineSVG(input) {
    const data = (() => {
      const arr = toNumberArray(input);
      return arr.length ? arr : [0, 0, 0, 0, 0];
    })();

    const w = 160, h = 40, pad = 4;
    const max = Math.max(1, ...data);
    const step = (w - pad * 2) / Math.max(1, data.length - 1);
    const pts = data.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x},${y}`;
    }).join(" ");

    return `<svg width="${w}" height="${h}">
      <polyline fill="none" stroke="#a78bfa" stroke-width="2" points="${pts}" />
    </svg>`;
  }

  // DOM & Map refs
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  // Data refs
  const hazardsFCRef = useRef(null); // FeatureCollection for hazards
  const aggWorkerRef = useRef(null); // hex aggregation web worker
  const costTimerRef = useRef(null);
  const playTimerRef = useRef(null);

  // UI state
  const [mode, setMode] = useState(initialMode || "reports"); // "reports" | "heatmap" | "cost"
  const [timeWindow, setTimeWindow] = useState(30); // days
  const [compareOn, setCompareOn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [budget, setBudget] = useState(250000);
  const [costKnobs, setCostKnobs] = useState({ alpha: 1, beta: 1, gamma: 1 });

  const [reportFilters, setReportFilters] = useState({
    severities: new Set(), // e.g., new Set(["high","critical"]) – lowercase strings
    types: new Set(),      // e.g., new Set(["pothole","flood"]) – lowercase strings
  });

  // keep the latest UI state available inside map event handlers
  const modeRef = useRef(initialMode || "reports");
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const compareRef = useRef(false);
  useEffect(() => { compareRef.current = compareOn; }, [compareOn]);

  // ------------------ init map ------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
    if (!MAPTILER_KEY) {
      // eslint-disable-next-line no-console
      console.error(
        "Missing VITE_MAPTILER_KEY. Add it to a local .env file (see .env.example) " +
        "and never commit real keys to source control."
      );
    }
    const style = {
      version: 8,
      glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`,
      sources: {
        openmaptiles: {
          type: "vector",
          url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
        },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#0b0118" } },
        { id: "landcover", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": "#140a22" } },
        { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#1b0f2b", "fill-opacity": 0.9 } },
        {
          id: "road-glow",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "class"], "motorway"], "#f0c94a",
              ["==", ["get", "class"], "primary"],  "#b472ff",
              "#7e51ff",
            ],
            "line-width": [
              "match",
              ["get", "class"],
              "motorway", 2.8,
              "primary",  2.0,
              "secondary",1.3,
              0.8,
            ],
            "line-opacity": 0.6,
            "line-blur": 2.5,
          },
        },
        { id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", paint: { "fill-color": "#26133a", "fill-outline-color": "#3b2070" } },
        { id: "labels", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Open Sans Regular"] }, paint: { "text-color": "#e4d0ff", "text-halo-color": "#0d0218", "text-halo-width": 1.5 } },
      ],
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: BOTHELL_CENTER,
      zoom: 12.5,
      attributionControl: false,
    });
    mapRef.current = map;

    // controls
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    // decorative pulsing marker
    const markerEl = document.createElement("div");
    markerEl.style.cssText = `
      width: 16px; height: 16px; border-radius: 50%;
      background: radial-gradient(circle, #b472ff 0%, #5b1f99 70%);
      box-shadow: 0 0 12px rgba(180,114,255,0.8), 0 0 24px rgba(240,201,74,0.4);
    `;
    markerEl.animate(
      [ { transform: "scale(1)", opacity: 1 }, { transform: "scale(1.3)", opacity: 0.7 }, { transform: "scale(1)", opacity: 1 } ],
      { duration: 2500, iterations: Infinity }
    );
    new maplibregl.Marker({ element: markerEl })
      .setLngLat(BOTHELL_CENTER)
      .setPopup(new maplibregl.Popup().setHTML("<b>Bothell, WA</b>"))
      .addTo(map);

    // animated road glow
    let op = 0.6, dir = 1;
    const glow = () => {
      const m = mapRef.current;
      if (!m || typeof m.getLayer !== "function" || !m.getLayer("road-glow")) return;
      op += dir * 0.01;
      if (op > 0.8) dir = -1;
      if (op < 0.4) dir = 1;
      m.setPaintProperty("road-glow", "line-opacity", op);
      requestAnimationFrame(glow);
    };

    map.on("load", () => {
      glow();

      // --- worker for hex aggregation ---
      aggWorkerRef.current = new Worker(new URL("./workers/aggWorker.js", import.meta.url), { type: "module" });
      aggWorkerRef.current.onmessage = (msg) => {
        const { type, payload } = msg.data || {};
        if (type === "hex-result") {
          const features = payload?.features || [];
          // eslint-disable-next-line no-console
          console.log("hex-result:", features.length, features[0]?.properties);
          const src = map.getSource("heat-hex");
          if (src) src.setData({ type: "FeatureCollection", features });
        }
      };

      // --- hazards ---
      const hazardsFC = hazardsToGeoJSON(sampleHazards);
      hazardsFCRef.current = hazardsFC;

      map.addSource("hazards", {
        type: "geojson",
        data: hazardsFC,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      // clusters
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "hazards",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#b472ff", 20, "#ff9e3b", 100, "#ff3b7b"],
          "circle-radius": ["step", ["get", "point_count"], 15, 20, 25, 100, 40],
          "circle-opacity": 0.7,
          "circle-blur": 1.2,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "hazards",
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Open Sans Bold"], "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });
      
      // click to expand cluster (Reports mode only)
      const onClusterClick = (e) => {
        if (modeRef.current !== "reports") return;
        const f = e.features && e.features[0];
        if (!f) return;

        const src = map.getSource("hazards");
        const cid = f.properties.cluster_id;
        const center = f.geometry.coordinates;
        const startZoom = map.getZoom();

        if (src && typeof src.getClusterExpansionZoom === "function") {
          src.getClusterExpansionZoom(cid, (err, z) => {
            if (!err && typeof z === "number") {
              map.easeTo({ center, zoom: Math.max(z, startZoom + 1.2), duration: 600 });
            } else {
              map.easeTo({ center, zoom: startZoom + 1.5, duration: 600 });
            }
          });
        } else {
          map.easeTo({ center, zoom: startZoom + 1.5, duration: 600 });
        }
      };
      map.on("click", "clusters", onClusterClick);
      map.on("click", "cluster-count", onClusterClick);

      // --- Cluster zoom with guaranteed fallback ---
      function expandCluster(feature) {
        const map = mapRef.current;
        const src = map.getSource("hazards");
        if (!map || !src || !feature?.properties) return;

        const center = feature.geometry.coordinates;
        const startZoom = map.getZoom();
        const cid = feature.properties.cluster_id;

        let settled = false;

        const fitChildren = () => {
          if (settled) return;
          settled = true;
          if (typeof src.getClusterChildren === "function") {
            src.getClusterChildren(cid, (err, kids = []) => {
              if (!err && kids.length) {
                const bounds = kids.reduce((b, f, i) => {
                  const c = f.geometry.coordinates;
                  return i ? b.extend(c) : new maplibregl.LngLatBounds(c, c);
                }, null);
                if (bounds) return map.fitBounds(bounds, { padding: 100, duration: 700, maxZoom: 16 });
              }
              map.easeTo({ center, zoom: startZoom + 1.5, duration: 600 });
            });
          } else {
            map.easeTo({ center, zoom: startZoom + 1.5, duration: 600 });
          }
        };
        // Fire only when Reports is active (and layer is visible)
        function onClusterLayerClick(e) {
          if (modeRef.current !== "reports") return;
          const f = e.features?.[0];
          if (f) expandCluster(f);
        }
        map.off("click", "clusters", onClusterLayerClick);
        map.off("click", "cluster-count", onClusterLayerClick);

        // Map-level safety net (helps if another layer sits above visually)
        function clusterFallback(e) {
          if (modeRef.current !== "reports") return;
          const hit = map.queryRenderedFeatures(e.point, { layers: ["clusters", "cluster-count"] });
          if (hit && hit.length) expandCluster(hit[0]);
        }
        map.off("click", clusterFallback);
        map.on("click", clusterFallback);

        // If MapLibre never calls back, we still zoom
        const bail = setTimeout(fitChildren, 200);

        if (typeof src.getClusterExpansionZoom === "function") {
          src.getClusterExpansionZoom(cid, (err, z) => {
            if (settled) return;
            clearTimeout(bail);
            if (!err && typeof z === "number") {
              settled = true;
              map.easeTo({
                center,
                // ensure visible change
                zoom: Math.max(z, startZoom + 1.2),
                duration: 600,
                easing: t => 1 - Math.pow(1 - t, 3),
              });
              return;
            }
            fitChildren();
          });
        } else {
          clearTimeout(bail);
          fitChildren();
        }
      }

      // Cursor affordance
      ["clusters", "cluster-count"].forEach(l => {
        map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer");
        map.on("mouseleave", l, () => map.getCanvas().style.cursor = "");
      });


      // points
      map.addLayer({
        id: "hazard-glow",
        type: "circle",
        source: "hazards",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 15, 20],
          "circle-color": [
            "match", ["get", "severity"],
            "critical", "#ff3b7b", "high", "#ff9e3b", "medium", "#ffd93b", "low", "#6eff9e", "#aaaaaa",
          ],
          "circle-blur": 1.2,
          "circle-opacity": 0.35,
        },
      });
      map.addLayer({
        id: "hazard-points",
        type: "circle",
        source: "hazards",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 15, 8],
          "circle-color": [
            "match", ["get", "severity"],
            "critical", "#ff4da6", "high", "#ffa94d", "medium", "#ffe34d", "low", "#87ff8f", "#cccccc",
          ],
          "circle-opacity": 0.9,
        },
      });

      

      map.on("click", "hazard-points", (e) => {
        const props = e.features?.[0]?.properties || {};
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div>
              <div style="font-weight:700;color:#C084FC;font-size:14px;margin-bottom:6px">${props.type}</div>
              <div style="margin-bottom:4px"><b>Severity:</b>
                <span style="color:${props.severity === "high" ? "#f87171" : props.severity === "medium" ? "#facc15" :
                  props.severity === "critical" ? "#22d3ee" : "#4ade80"}">${props.severity}</span>
              </div>
              <div style="opacity:0.9">${props.description || ""}</div>
            </div>`)
          .addTo(map);
      });

      ["clusters","cluster-count"].forEach(l=>{
        map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer");
        map.on("mouseleave", l, () => map.getCanvas().style.cursor = "");
      });

      // heatmap kernel (point-based) — optional backup to hex
      map.addLayer({
        id: "hazards-heat",
        type: "heatmap",
        source: "hazards",
        maxzoom: 15,
        paint: {
          "heatmap-weight": ["coalesce", ["get", "weightHeat"], 0.001],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 14, 1.2],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 26],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "#5b1f99",
            0.4, "#7e51ff",
            0.6, "#ff9e3b",
            0.8, "#ff3b7b",
            1, "#ffd93b"
          ],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.85, 14, 0.95],
        },
      });

      // hex heat overlay
      map.addSource("heat-hex", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "heat-hex-fill",
        type: "fill",
        source: "heat-hex",
        // heat-hex-fill (replace paint:)
        paint: {
          "fill-color": [
            "interpolate", ["linear"], ["get", "intensity"],
              0,   "#1b1033",   // faint background so very small values still read
              0.2, "#2e026d",
              1,   "#7c3aed",
              3,   "#f472b6",
              6,   "#f59e0b",
              10,  "#fde047"
          ],
          "fill-opacity": [
            "interpolate", ["linear"], ["get", "intensity"],
              0,   0.00,
              0.05,0.35,
              0.5, 0.70,
              2,   0.82
          ],
          "fill-outline-color": "rgba(255,255,255,0.06)"
        },
      });
      map.addLayer({
        id: "heat-hex-outline",
        type: "line",
        source: "heat-hex",
        paint: {
          "line-color": "rgba(255,255,255,0.10)",
          "line-width": 0.5,
          "line-opacity": [
            "interpolate", ["linear"], ["get", "intensity"],
              0,   0.0,
              0.05,0.5,
              1,   0.8
          ]
        }
      });

      

      map.on("click", "heat-hex-fill", (e) => {
        if (modeRef.current !== "heatmap") return;
        const f = e.features?.[0]; if (!f) return;
        const p = f.properties || {};

        const intensityNow =
          Number(p.intensity ?? p.count ?? p.value ?? 0);

        const svg = sparklineSVG(p.spark || p.history || p.timeseries || []);
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="min-width:220px">
              <div style="font-weight:700;color:#C084FC;margin-bottom:4px">Hotspot</div>
              <div style="font-size:12px;opacity:.85;margin-bottom:6px">
                Frequency now: <b>${intensityNow.toFixed(1)}</b>
                ${compareRef.current && p.prevIntensity != null
                  ? `&nbsp;&nbsp;Prev: <b>${Number(p.prevIntensity).toFixed(1)}</b>`
                  : ""}
              </div>
              ${svg}
              <div style="font-size:11px;color:#a78bfa;opacity:.9">Events over time</div>
            </div>`)
          .addTo(map);
      });

      map.addSource("cost-segments", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "cost-segments-casing", type: "line", source: "cost-segments", paint: { "line-color": "#0b0118", "line-width": 6, "line-opacity": 0.6 } });
      map.addLayer({
        id: "cost-segments",
        type: "line",
        source: "cost-segments",
        paint: {
          "line-width": ["interpolate", ["linear"], ["get", "priority"], 0, 1, 50_000, 8],
          "line-color": ["interpolate", ["linear"], ["get", "expected"], 0, "#5eead4", 50_000, "#fde047", 150_000, "#fb7185", 400_000, "#ef4444"],
          "line-opacity": ["case", ["==", ["get", "modeCost"], 1], 0.9, 0.0],
        },
      });

      // initial renders
      refreshHeatmapWeights(timeWindow);
      refreshCostOverlay();
      applyModeVisibility(mode);
      buildHexOverlay();
      applyReportFiltersToSource(timeWindow);
      // recompute cost on moveend (throttled)

      map.on("moveend", () => {
        if (mode !== "cost") return;
        if (costTimerRef.current) clearTimeout(costTimerRef.current);
        costTimerRef.current = setTimeout(refreshCostOverlay, 120);
      });
    });

    return () => {
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------ helpers (component scope) ------------------

  const applyModeVisibility = (m) => {
    const map = mapRef.current; if (!map) return;
    const vis = (on) => (on ? "visible" : "none");

    const showReports = m === "reports";
    if (map.getLayer("clusters"))         map.setLayoutProperty("clusters", "visibility", vis(showReports));
    if (map.getLayer("cluster-count"))    map.setLayoutProperty("cluster-count", "visibility", vis(showReports));
    if (map.getLayer("hazard-glow"))      map.setLayoutProperty("hazard-glow", "visibility", vis(showReports));
    if (map.getLayer("hazard-points"))    map.setLayoutProperty("hazard-points", "visibility", vis(showReports));

    const showHeat = m === "heatmap";
    if (map.getLayer("hazards-heat"))     map.setLayoutProperty("hazards-heat", "visibility", "none"); // keep OFF
    if (map.getLayer("heat-hex-fill"))    map.setLayoutProperty("heat-hex-fill", "visibility", vis(showHeat));
    if (map.getLayer("heat-hex-outline")) map.setLayoutProperty("heat-hex-outline", "visibility", vis(showHeat));

    const showCost = m === "cost";
    if (map.getLayer("cost-segments"))        map.setLayoutProperty("cost-segments", "visibility", vis(showCost));
    if (map.getLayer("cost-segments-casing")) map.setLayoutProperty("cost-segments-casing", "visibility", vis(showCost));
  };


  // --------------------------- FILTERING HELPERS ------------------------------
  const norm = (v) => String(v || "").toLowerCase();

  const passesFilters = (props, filters) => {
    const sev = norm(props.severity);
    const typ = norm(props.type);
    const { severities, types } = filters;
    const sevOK  = !severities || severities.size === 0 || severities.has(sev);
    const typeOK = !types      || types.size === 0      || types.has(typ);
    return sevOK && typeOK;
  };

  // Return filtered features (original objects are NOT mutated)
  const getFilteredHazards = () => {
    const all = hazardsFCRef.current?.features || [];
    if (!all.length) return [];
    return all.filter(f => passesFilters(f.properties, reportFilters));
  };

  // FeatureCollection clone, with recency weights applied (used by reports/heatmap)
  const getFilteredHazardsFCWithWeights = (windowDays = timeWindow) => {
    const now = Date.now();
    const feats = getFilteredHazards().map((f) => {
      const g = structuredClone(f);
      const base  = g.properties.weightBase || 1;
      const decay = recencyDecay(g.properties.ts, now, windowDays);
      g.properties.weightHeat = base * decay; // used by heatmap
      return g;
    });
    return { type: "FeatureCollection", features: feats };
  };

  // Push the filtered+weighted FC into the "hazards" source (clusters & points update)
  const applyReportFiltersToSource = (windowDays = timeWindow) => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource("hazards"); if (!src) return;
    src.setData(getFilteredHazardsFCWithWeights(windowDays));
  };

  const refreshHeatmapWeights = (windowDays) => {
    if (!hazardsFCRef.current) return;

    // update weights in the backing store
    const now = Date.now();
    for (const f of hazardsFCRef.current.features) {
      const base = f.properties.weightBase || 1;
      const decay = recencyDecay(f.properties.ts, now, windowDays);
      f.properties.weightHeat = base * decay;
    }

    // push the filtered+weighted FC into the map
    applyReportFiltersToSource(windowDays);
  };


  const buildHexOverlay = () => {
    const map = mapRef.current; const worker = aggWorkerRef.current;
    if (!map || !worker || !hazardsFCRef.current) return;

    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const zoom = map.getZoom();
    const hexSizeMeters = Math.max(220, 1600 / Math.max(1, (zoom - 8)));


    const filteredFC = getFilteredHazardsFCWithWeights(timeWindow);

    worker.postMessage({
      type: "build-hex",
      payload: {
        hazards: filteredFC,          // <-- already filtered
        bbox,
        hexSizeMeters,
        now: Date.now(),
        windowDays: timeWindow,
        compareWindowDays: timeWindow,
        doCompare: compareOn,
        // optional, if your worker still uses them:
        filters: {
          severities: [...reportFilters.severities],
          types:      [...reportFilters.types],
        }
      }
    });
};


  const refreshCostOverlay = () => {
    const map = mapRef.current; if (!map) return;
    const hazards = getFilteredHazards();
    if (!hazards.length) return;

    const roads = map.queryRenderedFeatures({ layers: ["road-glow"] });
    const srcCost = map.getSource("cost-segments");
    if (!roads.length) { srcCost && srcCost.setData({ type: "FeatureCollection", features: [] }); return; }

    const agg = new JSMap();

    const nearestOnSegScreen = (pLL, aLL, bLL) => {
      const P = map.project(pLL), A = map.project(aLL), B = map.project(bLL);
      const ABx = B.x - A.x, ABy = B.y - A.y;
      const APx = P.x - A.x, APy = P.y - A.y;
      const ab2 = ABx*ABx + ABy*ABy || 1e-9;
      let t = (APx*ABx + APy*ABy) / ab2; t = Math.max(0, Math.min(1, t));
      const Qx = A.x + t*ABx, Qy = A.y + t*ABy;
      return (P.x - Qx)**2 + (P.y - Qy)**2;
    };

    const paddingPx = 100;
    const canvas = map.getCanvas();
    const bbox = [ { x: 0 - paddingPx, y: 0 - paddingPx }, { x: canvas.width + paddingPx, y: canvas.height + paddingPx } ];
    const inView = (lng, lat) => { const p = map.project({ lng, lat }); return (p.x >= bbox[0].x && p.x <= bbox[1].x && p.y >= bbox[0].y && p.y <= bbox[1].y); };

    const roadGeom = new JSMap();
      for (const r of roads) {
        if (!r.id) continue;
        const g = r.geometry;
        const lines = g.type === "LineString" ? [g.coordinates]
                    : g.type === "MultiLineString" ? g.coordinates
                    : [];
        if (lines.length) roadGeom.set(r.id, { class: r.properties.class, lines });
      }


    const now = Date.now();
    const decayTau = timeWindow;
    hazards.forEach(h => {
      const [lng, lat] = h.geometry.coordinates;
      if (!inView(lng, lat)) return;

      let bestRoad = null; let bestDist2 = Infinity;
      for (const [rid, info] of roadGeom) {
        for (const line of info.lines) {
          for (let i = 0; i < line.length - 1; i++) {
            const a = { lng: line[i][0], lat: line[i][1] };
            const b = { lng: line[i+1][0], lat: line[i+1][1] };
            const d2 = nearestOnSegScreen({lng, lat}, a, b);
            if (d2 < bestDist2) { bestDist2 = d2; bestRoad = { rid, info }; }
          }
        }
      }
      if (!bestRoad) return;

      const key = bestRoad.rid;
      const recW = recencyDecay(h.properties.ts, now, decayTau);
      const weight = (h.properties.weightBase || 1) * recW;

      const entry = agg.get(key) || {
        class: bestRoad.info.class,
        weightSum: 0,
        lines: bestRoad.info.lines.map(line => line.slice()) // keep as array-of-lines
      };
      entry.weightSum += weight;
      agg.set(key, entry);
    });

    // meters per pixel around center
    const mPerPx = (() => {
      const c = map.getCenter();
      const p1 = map.project(c);
      const p2 = { x: p1.x + 100, y: p1.y };
      const ll2 = map.unproject(p2);
      const R = 6371000;
      const toRad = (v)=>v*Math.PI/180;
      const dLon = toRad(ll2.lng - c.lng);
      const dLat = toRad(ll2.lat - c.lat);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(c.lat))*Math.cos(toRad(ll2.lat))*Math.sin(dLon/2)**2;
      const d = 2*R*Math.asin(Math.sqrt(a));
      return d / 100;
    })();

    const pixelLength = (lines) => {
      let len = 0;
      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const p = map.project({ lng: line[i][0],   lat: line[i][1] });
          const q = map.project({ lng: line[i+1][0], lat: line[i+1][1] });
          len += Math.hypot(p.x - q.x, p.y - q.y);
        }
      }
      return len;
    };

    const features = [];
    for (const [rid, v] of agg) {
      const lines = v.lines; // array of LineString coordinate arrays
      const lengthMeters = Math.max(10, pixelLength(lines) * mPerPx);
      const aadt = inferAADT(v.class);
      const { expected, priority, breakdown } =
        segmentCost(lengthMeters, v.weightSum, aadt, costKnobs);

      features.push({
        type: "Feature",
        properties: {
          expected, priority, aadt, class: v.class, lengthMeters,
          Repair: breakdown.Repair, Delay: breakdown.Delay, Risk: breakdown.Risk,
          modeCost: mode === "cost" ? 1 : 0,
        },
        geometry: lines.length > 1
          ? { type: "MultiLineString", coordinates: lines }
          : { type: "LineString", coordinates: lines[0] }
      });
    }


    // budget pass (greedy)
    features.sort((a, b) => b.properties.expected - a.properties.expected);
    let spent = 0;
    for (const f of features) {
      const cost = f.properties.expected;
      if (spent + cost <= budget) { f.properties.funded = 1; spent += cost; } else { f.properties.funded = 0; }
    }

    const fundedPaint = [
      "case",
      ["==", ["get", "funded"], 1],
      "#22d3ee",
      ["interpolate", ["linear"], ["get", "expected"], 0, "#5eead4", 50000, "#fde047", 150000, "#fb7185", 400000, "#ef4444"]
    ];
    if (map.getLayer("cost-segments")) map.setPaintProperty("cost-segments", "line-color", fundedPaint);

    srcCost && srcCost.setData({ type: "FeatureCollection", features });
  };

  const exportVisibleReportsCSV = () => {
    const map = mapRef.current; if (!map) return;
    const feats = map.queryRenderedFeatures({ layers: ["hazard-points"] });
    const rows = feats.map(f => ({
      type: f.properties.type,
      severity: f.properties.severity,
      description: f.properties.description,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1]
    }));
    downloadCSV(rows, "reports_visible.csv");
  };

  // ------------------ reactive effects ------------------

  // mode change -> toggle visibility & recompute overlays as needed
  useEffect(() => {
    applyModeVisibility(mode);
    if (mode === "heatmap") buildHexOverlay();
    if (mode === "cost") refreshCostOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // knobs/timeWindow affect both heatmap and cost
  useEffect(() => {
    refreshHeatmapWeights(timeWindow);
    if (mode === "cost") refreshCostOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeWindow, costKnobs, budget]);

  // hex needs rebuild on these
  useEffect(() => {
    if (mode === "heatmap") buildHexOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, timeWindow, compareOn, reportFilters]);

  // rebuild hex when map stops moving and heatmap mode
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const handler = () => { if (mode === "heatmap") buildHexOverlay(); };
    m.on("moveend", handler);
    return () => m.off("moveend", handler);
  }, [mode]);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  // rectangle select (Shift+drag) for Reports mode – exports selection now
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    let start = null, box = null;

    const down = (e) => {
      if (!e.originalEvent.shiftKey) return;
      start = e.point;
      box = document.createElement("div");
      Object.assign(box.style, {
        position: "absolute", border: "1px dashed #a78bfa", background: "rgba(167,139,250,0.12)",
        left: `${start.x}px`, top: `${start.y}px`, width: "0px", height: "0px", pointerEvents: "none", zIndex: 30
      });
      map.getContainer().appendChild(box);
      map.getCanvas().style.cursor = "crosshair";
    };
    const move = (e) => {
      if (!start || !box) return;
      const minx = Math.min(start.x, e.point.x), maxx = Math.max(start.x, e.point.x);
      const miny = Math.min(start.y, e.point.y), maxy = Math.max(start.y, e.point.y);
      Object.assign(box.style, { left: `${minx}px`, top: `${miny}px`, width: `${maxx-minx}px`, height: `${maxy-miny}px` });
    };
    const up = (e) => {
      if (!start) return;
      const min = { x: Math.min(start.x, e.point.x), y: Math.min(start.y, e.point.y) };
      const max = { x: Math.max(start.x, e.point.x), y: Math.max(start.y, e.point.y) };
      const feats = map.queryRenderedFeatures([min, max], { layers: ["hazard-points"] });
      const rows = feats.map(f => ({ type: f.properties.type, severity: f.properties.severity, description: f.properties.description, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
      if (rows.length) downloadCSV(rows, "reports_selected.csv");
      if (box) box.remove(); box = null; start = null; map.getCanvas().style.cursor = "";
    };

    map.on("mousedown", down);
    map.on("mousemove", move);
    map.on("mouseup", up);
    return () => { map.off("mousedown", down); map.off("mousemove", move); map.off("mouseup", up); };
  }, []);

  // timers cleanup
  useEffect(() => () => { if (playTimerRef.current) clearInterval(playTimerRef.current); }, []);
  useEffect(() => () => { if (aggWorkerRef.current) { aggWorkerRef.current.terminate(); aggWorkerRef.current = null; } }, []);

  useEffect(() => {
    // Update clusters/points + heatmap weights
    applyReportFiltersToSource(timeWindow);

    // Rebuild overlays that depend on hazards
    if (mode === "heatmap") buildHexOverlay();
    if (mode === "cost")    refreshCostOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportFilters]);


  // ------------------ UI ------------------
  return (
    <div className={`relative w-full ${className} rounded-2xl overflow-hidden border border-purple-700/30 shadow-glow z-10`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* mode switcher */}
      <div className="absolute top-3 left-3 z-20 flex gap-2">
        {["reports","heatmap","cost"].map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              mode === m ? "bg-purple-600/70 border-purple-300 text-white" : "bg-black/40 border-purple-500/30 text-purple-100"
            } backdrop-blur-sm`}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* right panel */}
      <div className="absolute top-3 right-3 z-20 p-3 rounded-xl bg-black/55 backdrop-blur-md border border-purple-500/30 text-purple-100 text-sm w-80">
        <div className="font-semibold text-purple-200 mb-2">
          {mode === "reports" && "Reports • filters"}
          {mode === "heatmap" && "Heatmap • time & playback"}
          {mode === "cost"    && "Cost • scenario"}
        </div>

        {/* shared: time window */}
        <div className="mb-3">
          <div className="flex justify-between"><span>Time window</span><span>{timeWindow}d</span></div>
          <input type="range" min={7} max={90} step={1} value={timeWindow} onChange={(e)=>setTimeWindow(Number(e.target.value))} className="w-full"/>
        </div>

        {mode === "cost" && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {["alpha","beta","gamma"].map(k => (
                <div key={k}>
                  <div className="text-xs mb-1 uppercase">{k}</div>
                  <input type="range" min="0" max="3" step="0.1" value={costKnobs[k]} onChange={(e)=>setCostKnobs({...costKnobs, [k]: Number(e.target.value)})} className="w-full"/>
                </div>
              ))}
            </div>
            <div className="mb-2 flex justify-between"><span>Budget</span><span>${budget.toLocaleString()}</span></div>
            <input type="range" min="50000" max="1000000" step="5000" value={budget} onChange={(e)=>setBudget(Number(e.target.value))} className="w-full"/>
            <div className="mt-2 text-xs text-purple-300/80">Segments under budget are highlighted in cyan. Export below.</div>
            <button
              onClick={() => {
                const src = mapRef.current?.getSource("cost-segments");
                const feats = src?._data?.features || [];
                const rows = feats.map(f => ({
                  road_class: f.properties.class,
                  expected: Math.round(f.properties.expected),
                  funded: f.properties.funded ? "yes" : "no",
                  length_m: Math.round(f.properties.lengthMeters),
                  aadt: f.properties.aadt
                }));
                downloadCSV(rows, "cost_plan.csv");
              }}
              className="mt-3 w-full px-3 py-1.5 text-sm rounded-md bg-purple-600/70 border border-purple-300 text-white"
            >
              Export plan CSV
            </button>
          </>
        )}

        {mode === "heatmap" && (
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={compareOn} onChange={e=>setCompareOn(e.target.checked)} />
              <span>Compare to previous window</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={()=>{
                  if (playing) { clearInterval(playTimerRef.current); setPlaying(false); return; }
                  setPlaying(true);
                  playTimerRef.current = setInterval(()=>{
                    setTimeWindow(w => (w >= 90 ? 7 : w + 1));
                  }, 450);
                }}
                className="px-2 py-1 rounded bg-purple-600/70 border border-purple-300 text-white"
              >
                {playing ? "Stop" : "Play"}
              </button>
              <span className="text-xs text-purple-300/80">Animates windowDays</span>
            </div>
          </div>
        )}

        {mode === "reports" && (
          <div className="space-y-2">
            <div className="text-xs">Filters</div>
            <div className="flex flex-wrap gap-1">
              {["low","medium","high","critical"].map(s => (
                <button key={s}
                  onClick={()=>{
                    const next = new Set(reportFilters.severities);
                    next.has(s) ? next.delete(s) : next.add(s);
                    setReportFilters({...reportFilters, severities: next});
                  }}
                  className={`px-2 py-0.5 rounded ${reportFilters.severities.has(s) ? "bg-purple-600 text-white" : "bg-white/10"}`}>
                  {s}
                </button>
              ))}
            </div>
            <button onClick={exportVisibleReportsCSV} className="mt-1 px-2 py-1 rounded bg-purple-500/70 border border-purple-300 text-white">Export visible reports</button>
            <div className="text-xs text-purple-300/80">(Shift+Drag to rectangle-select)</div>
          </div>
        )}
      </div>
    </div>
  );
}
