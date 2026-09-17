 import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import realHazards from "./assets/data.json";
import { hazardsToGeoJSON } from "./utils/hazardProcessor.js";
import { downloadCSV } from "./utils/csvExport.js";

const BOTHELL_CENTER = [-122.2086, 47.8040];
export default function Map({ className = "h-full w-full" }) {
const containerRef = useRef(null);
const mapRef = useRef(null);
const hazardsFCRef = useRef(null);

const [mode, setMode] = useState("reports");
const [activeTypes, setActiveTypes] = useState(new Set(["pothole", "litter", "line_marking"]));
const [activeSeverities, setActiveSeverities] = useState(new Set(["low", "medium", "high", "critical"]));

const modeRef = useRef("reports");
useEffect(() => { modeRef.current = mode; }, [mode]);

useEffect(() => {
if (!containerRef.current) return;

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
if (!MAPTILER_KEY) {
  console.error("Missing VITE_MAPTILER_KEY in .env file!");
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
    { id: "background", type: "background", paint: { "background-color": "#090d16" } }, 
    { id: "landcover", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": "#0f172a" } }, 
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#020617", "fill-opacity": 0.8 } }, 
    {
      id: "road-glow",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: {
        "line-color": "#1e293b",
        "line-width": ["match", ["get", "class"], "motorway", 2.2, "primary", 1.5, 0.8],
        "line-opacity": 0.5,
      },
    },
    { id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", paint: { "fill-color": "#1e293b", "fill-opacity": 0.3 } },
    { id: "labels", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Open Sans Regular"] }, paint: { "text-color": "#64748b", "text-halo-color": "#090d16", "text-halo-width": 1.5 } },
  ],
};

const map = new maplibregl.Map({
  container: containerRef.current,
  style,
  center: BOTHELL_CENTER,
  zoom: 12.5,
  minZoom: 2,
  attributionControl: false,
});
mapRef.current = map;
map.addControl(new maplibregl.NavigationControl(), "top-right");

map.on("load", () => {
  const hazardsFC = hazardsToGeoJSON(realHazards);
  hazardsFCRef.current = hazardsFC;

  map.addSource("hazards", {
    type: "geojson",
    data: hazardsFC,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 14,
  });

  // --- Heatmap Layer ---
  map.addLayer({
    id: "hazards-heat",
    type: "heatmap",
    source: "hazards",
    maxzoom: 18,
    paint: {
      "heatmap-weight": 1,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.2, 11, 1, 15, 3],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0,   "rgba(34, 197, 94, 0.25)",
        0.3, "rgba(74, 222, 128, 0.5)",
        0.5, "rgba(234, 179, 8, 0.75)",
        0.75,"rgba(249, 115, 22, 0.9)",
        1,   "rgba(185, 28, 28, 1)"
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 12, 11, 30, 15, 80],
      "heatmap-opacity": 0.85
    },
  });

  // --- Reports Mode Layers ---
  map.addLayer({
    id: "hazard-points",
    type: "circle",
    source: "hazards",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 8],
      "circle-color": [
        "match", ["get", "type"],
        "pothole", "#ef4444",
        "trash_loose", "#38bdf8",
        "debris", "#38bdf8",
        "line_erased", "#f59e0b",
        "#94a3b8"
      ],
      "circle-stroke-width": 0,
      "circle-opacity": 0.95
    },
  });

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

  // --- Interactions & Custom Popup ---
  map.on("click", "clusters", (e) => {
    if (modeRef.current !== "reports") return;
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource("hazards").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 0.5 });
    });
  });

  const getLocalImageSrc = (imgPath) => {
    try { return new URL(`./assets/${imgPath}`, import.meta.url).href; } catch { return ""; }
  };

  map.on("click", "hazard-points", (e) => {
    if (modeRef.current !== "reports") return;
    const props = e.features?.[0]?.properties || {};
    const coordinates = e.lngLat;
    let labels = [];
    try { labels = typeof props.labels === "string" ? JSON.parse(props.labels) : (props.labels || []); } catch { labels = []; }

    const rawType = (props.type || "").toLowerCase();
    let hazardColor = "#ef4444";
    if (rawType.includes("trash") || rawType.includes("debris") || rawType.includes("litter")) {
      hazardColor = "#38bdf8";
    } else if (rawType.includes("line") || rawType.includes("erased")) {
      hazardColor = "#f59e0b";
    }

const imageHtml = props.image ? `
  <div class="hazard-img-box" style="position: relative; width: 100%; aspect-ratio: 16/9; margin-top: 8px; background: #000; border-radius: 6px; overflow: hidden; border: 1px solid #1e293b;">
        <img src="${getLocalImageSrc(props.image)}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block;" />
        <svg id="popup-svg-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
          ${labels.map(lbl => {
            if (!lbl.polygon || !lbl.polygon.length) return '';
            const pts = lbl.polygon.map(pt => `${pt[0]},${pt[1]}`).join(' ');
            return `<polygon points="${pts}" fill="${hazardColor}44" stroke="${hazardColor}" stroke-width="0.005" />`;
          }).join('')}
        </svg>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; font-size: 11px;">
        <button id="toggle-poly-btn" style="background: none; border: none; color: #64748b; cursor: pointer; padding: 2px 4px; font-weight: 500;">
          Hide Polygons
        </button>
        <span style="color: #334155;">•</span>
        <button id="fullscreen-popup-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 2px 4px; font-weight: 500;">
          Expand View
        </button>
      </div>
    ` : '';

   const popupStyle = document.createElement('style');
popupStyle.innerHTML = `
  .maplibregl-popup-content {
    background-color: #0f172a !important;
    color: #f8fafc !important;
    border-radius: 10px !important;
    border: 1px solid #1e293b !important;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important;
  }
  .maplibregl-popup-close-button {
    font-size: 20px !important;
    padding: 4px 10px !important;
    color: #64748b !important;
  }
  .maplibregl-popup-close-button:hover {
    color: #f8fafc !important;
  }
  .modal-expanded {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    width: 85vw !important;
    max-width: 900px !important;
    max-height: 90vh !important;
    z-index: 999999 !important;
    background-color: #090d16 !important;
    border: 1px solid #334155 !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9) !important;
    padding: 24px !important;
    /* Allows scrolling just in case of very small screens */
    overflow-y: auto !important; 
  }
  
  /* NEW: Constraints for the image box in expanded view */
  .modal-expanded .hazard-img-box {
    width: auto !important;
    max-width: 100% !important;
    max-height: 65vh !important; /* Forces the box to shrink before breaking the modal boundaries */
    aspect-ratio: 16/9 !important; /* Preserves layout for your SVG polygons */
    margin: 16px auto 0 auto !important; /* Centers the image */
  }
  
  /* Reverted from 'contain' to 'cover' to ensure it fills the 16:9 box correctly */
  .modal-expanded img {
    object-fit: cover !important; 
  }
`;
document.head.appendChild(popupStyle);

const popup = new maplibregl.Popup({
  closeButton: true,
  maxWidth: "700px",
  className: "streetai-popup"
})
  .setLngLat(coordinates)
  .setHTML(`
    <div id="popup-card-wrapper" style="
      width: 100%;
      padding: 4px;
      font-family: system-ui, sans-serif;
      box-sizing: border-box;
    ">
      <div style="
        font-weight:700;
        color:${hazardColor};
        font-size:16px;
        margin-bottom:4px;
        text-transform:uppercase;
      ">
        ${props.type.replace('_', ' ') || 'Hazard'}
      </div>

      <div style="
        font-size:11px;
        color:#64748b;
        font-weight:500;
        margin-bottom:6px;
      ">
        GPS: ${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}
      </div>

      <div style="
        font-size:14px;
        color:#94a3b8;
        margin-bottom:6px;
      ">
        Severity:
        <span style="
          text-transform:capitalize;
          font-weight:600;
          color:${props.severity === "high" ? "#ef4444" : "#f59e0b"}
        ">
          ${props.severity || 'medium'}
        </span>
      </div>

      ${imageHtml}
    </div>
  `)
  .addTo(map);

// Force the actual MapLibre elements to be large
const popupElement = popup.getElement();

if (popupElement) {
  popupElement.style.width = "600px";
  popupElement.style.maxWidth = "600px";

  const content = popupElement.querySelector(".maplibregl-popup-content");

  if (content) {
    content.style.width = "600px";
    content.style.maxWidth = "600px";
    content.style.boxSizing = "border-box";
  }
}

    setTimeout(() => {
      const toggleBtn = document.getElementById("toggle-poly-btn");
      const fsBtn = document.getElementById("fullscreen-popup-btn");
      const svgOverlay = document.getElementById("popup-svg-overlay");
      const cardWrapper = document.getElementById("popup-card-wrapper")?.closest(".maplibregl-popup-content");

      if (toggleBtn && svgOverlay) {
        let polyVisible = true;
        toggleBtn.onclick = () => {
          polyVisible = !polyVisible;
          svgOverlay.style.display = polyVisible ? "block" : "none";
          toggleBtn.textContent = polyVisible ? "Hide Polygons" : "Show Polygons";
          toggleBtn.style.color = polyVisible ? "#64748b" : "#38bdf8";
        };
      }

      if (fsBtn && cardWrapper) {
        let isExpanded = false;
        fsBtn.onclick = () => {
          isExpanded = !isExpanded;
          if (isExpanded) {
            cardWrapper.classList.add("modal-expanded");
            fsBtn.textContent = "Collapse View";
            fsBtn.style.color = "#38bdf8";
          } else {
            cardWrapper.classList.remove("modal-expanded");
            fsBtn.textContent = "Expand View";
            fsBtn.style.color = "#94a3b8";
          }
        };
      }
    }, 50);
  });

  ["clusters", "hazard-points"].forEach(l => {
    map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", l, () => map.getCanvas().style.cursor = "");
  });

  applyFilters();
  applyModeVisibility(mode);
});

return () => {
  if (mapRef.current) mapRef.current.remove();
  mapRef.current = null;
};

}, []);

const applyFilters = () => {
const map = mapRef.current;
if (!map || !hazardsFCRef.current) return;

const filteredFeatures = hazardsFCRef.current.features.filter(f => {
  const sev = (f.properties.severity || "").toLowerCase();
  const rawType = (f.properties.type || "").toLowerCase();
  let mappedType = "other";
  if (rawType === "pothole") mappedType = "pothole";
  if (rawType === "trash_loose" || rawType === "debris") mappedType = "litter";
  if (rawType === "line_erased") mappedType = "line_marking";

  return activeSeverities.has(sev) && activeTypes.has(mappedType);
});

const src = map.getSource("hazards");
if (src) src.setData({ type: "FeatureCollection", features: filteredFeatures });

};

useEffect(() => { applyFilters(); }, [activeTypes, activeSeverities]);

const applyModeVisibility = (m) => {
const map = mapRef.current; if (!map) return;
const vis = (on) => (on ? "visible" : "none");

const showReports = m === "reports";
if (map.getLayer("clusters"))      map.setLayoutProperty("clusters", "visibility", vis(showReports));
if (map.getLayer("cluster-count")) map.setLayoutProperty("cluster-count", "visibility", vis(showReports));
if (map.getLayer("hazard-points")) map.setLayoutProperty("hazard-points", "visibility", vis(showReports));

const showHeat = m === "heatmap";
if (map.getLayer("hazards-heat"))  map.setLayoutProperty("hazards-heat", "visibility", vis(showHeat));

};

useEffect(() => { applyModeVisibility(mode); }, [mode]);

const exportVisibleReportsCSV = () => {
const map = mapRef.current; if (!map) return;
const feats = map.queryRenderedFeatures({ layers: ["hazard-points"] });
const rows = feats.map(f => ({
type: f.properties.type,
severity: f.properties.severity,
lng: f.geometry.coordinates[0],
lat: f.geometry.coordinates[1]
}));
downloadCSV(rows, "streetsense_reports.csv");
};

const toggleType = (type) => {
const next = new Set(activeTypes);
next.has(type) ? next.delete(type) : next.add(type);
setActiveTypes(next);
};

const toggleSeverity = (sev) => {
const next = new Set(activeSeverities);
next.has(sev) ? next.delete(sev) : next.add(sev);
setActiveSeverities(next);
};

return (
<div className={`relative w-full ${className} overflow-hidden z-10 bg-[#090d16]`}>
  <div ref={containerRef} className="w-full h-full" />

  {/* Mode Switcher */}
  <div className="absolute top-3 left-3 z-20 flex gap-1.5 p-1 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700 shadow-xl">
    {["reports", "heatmap"].map(m => (
      <button
        key={m}
        onClick={() => setMode(m)}
        className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all duration-200 ${
          mode === m 
            ? "bg-sky-500 text-white shadow-md shadow-sky-500/20" 
            : "text-slate-400 hover:text-white hover:bg-slate-800"
        }`}
      >
        {m === "reports" ? "Map View" : "Congestion Heatmap"}
      </button>
    ))}
  </div>

  {/* Scaled-Down Control Panel */}
  <div className="absolute top-14 left-3 z-20 p-3.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl text-slate-200 w-64">
    <h2 className="text-sm font-bold text-white mb-3 border-b border-slate-800 pb-1.5 flex items-center justify-between">
      <span>Filter Data</span>
      <span className="text-[10px] font-bold text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800">Live</span>
    </h2>

    {/* Hazard Types */}
    <div className="mb-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Hazard Type</div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${activeTypes.has("pothole") ? "bg-red-500 border-red-500" : "bg-slate-800 border-slate-700"}`}>
            {activeTypes.has("pothole") && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <input type="checkbox" className="hidden" checked={activeTypes.has("pothole")} onChange={() => toggleType("pothole")} />
          <span className="text-xs font-medium text-slate-300 group-hover:text-white">Potholes</span>
        </label>
        
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${activeTypes.has("litter") ? "bg-sky-500 border-sky-500" : "bg-slate-800 border-slate-700"}`}>
            {activeTypes.has("litter") && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <input type="checkbox" className="hidden" checked={activeTypes.has("litter")} onChange={() => toggleType("litter")} />
          <span className="text-xs font-medium text-slate-300 group-hover:text-white">Debris & Litter</span>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${activeTypes.has("line_marking") ? "bg-amber-500 border-amber-500" : "bg-slate-800 border-slate-700"}`}>
            {activeTypes.has("line_marking") && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <input type="checkbox" className="hidden" checked={activeTypes.has("line_marking")} onChange={() => toggleType("line_marking")} />
          <span className="text-xs font-medium text-slate-300 group-hover:text-white">Faded Line Markings</span>
        </label>
      </div>
    </div>

    {/* Severities */}
    <div className="mb-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Severity Level</div>
      <div className="flex flex-wrap gap-1.5">
        {["low", "medium", "high", "critical"].map(s => (
          <button key={s}
            onClick={() => toggleSeverity(s)}
            className={`px-2 py-1 text-[10px] font-bold rounded transition-all duration-200 border ${
              activeSeverities.has(s) 
                ? "bg-slate-700 border-slate-500 text-white shadow-sm" 
                : "bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
            }`}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>
    </div>

    {/* Export */}
    <div className="border-t border-slate-800 pt-3 mt-1">
      <button 
        onClick={exportVisibleReportsCSV} 
        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold tracking-wide rounded border border-slate-700 transition-colors shadow-sm flex items-center justify-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
        Export to CSV
      </button>
    </div>
  </div>
</div>
);
}