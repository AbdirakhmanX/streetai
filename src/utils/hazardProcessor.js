// Base "weight" per severity — used for heatmap intensity and cost prioritization.
const SEVERITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Turns an array of raw hazard records into a GeoJSON FeatureCollection
 * that Map.jsx can hand straight to a MapLibre source.
 *
 * Expected input shape per hazard (from StreetSense events, or manual/sample data):
 * {
 *   id: string,
 *   type: "pothole" | "debris" | ...,
 *   severity: "low" | "medium" | "high" | "critical",
 *   description: string,
 *   lat: number,
 *   lng: number,
 *   ts: number (epoch ms) | string (ISO date),
 * }
 */
export function hazardsToGeoJSON(hazards) {
  return {
    type: "FeatureCollection",
    features: hazards.map(h => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [h.lng, h.lat]
      },
      properties: {
        id: h.id,
        type: h.type,
        severity: h.severity,
        description: h.description,
        ts: h.ts,
        // Pass these through so the popup can read them!
        image: h.image,
        labels: h.labels ? JSON.stringify(h.labels) : "[]"
      }
    }))
  };
}

/**
 * Returns a 0–1 multiplier that fades a hazard's weight out as it gets
 * older than the selected time window. Recent events stay near 1;
 * events much older than the window fade toward 0.
 */
export function recencyDecay(ts, now, windowDays) {
  if (!ts || !windowDays) return 1;
  const ageDays = (now - ts) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  return Math.exp(-ageDays / windowDays);
}
