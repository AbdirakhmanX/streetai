// Bins hazard points into a flat-top hexagon grid and reports back an
// intensity value per hex, so the map can draw a smooth "hotspot" layer
// instead of thousands of individual dots.
//
// Math reference: https://www.redblobgames.com/grids/hexagons/ (flat-top, axial coords)

function pixelToAxial(x, y, size) {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;
  return { q, r };
}

function axialRound(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
}

function axialToPixel(q, r, size) {
  const x = size * (1.5 * q);
  const y = size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
  return { x, y };
}

function hexCorners(cx, cy, size) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  corners.push(corners[0]); // close the ring
  return corners;
}

self.onmessage = (e) => {
  const { type, payload } = e.data || {};
  if (type !== "build-hex") return;

  const { hazards, bbox, hexSizeMeters } = payload || {};
  const features = hazards?.features || [];
  if (!features.length || !bbox) {
    self.postMessage({ type: "hex-result", payload: { features: [] } });
    return;
  }

  const [west, south] = bbox;
  const lat0 = south;
  const lng0 = west;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);

  const bins = new Map();

  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    const x = (lng - lng0) * metersPerDegLng;
    const y = (lat - lat0) * metersPerDegLat;

    const { q, r } = pixelToAxial(x, y, hexSizeMeters);
    const { q: qi, r: ri } = axialRound(q, r);
    const key = `${qi},${ri}`;

    const weight =
      f.properties?.weightHeat ?? f.properties?.weightBase ?? 1;
    bins.set(key, (bins.get(key) || 0) + weight);
  }

  const outFeatures = [];
  for (const [key, intensity] of bins) {
    const [qi, ri] = key.split(",").map(Number);
    const { x: cx, y: cy } = axialToPixel(qi, ri, hexSizeMeters);

    const coords = hexCorners(cx, cy, hexSizeMeters).map(([x, y]) => [
      lng0 + x / metersPerDegLng,
      lat0 + y / metersPerDegLat,
    ]);

    outFeatures.push({
      type: "Feature",
      properties: { intensity },
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  }

  self.postMessage({ type: "hex-result", payload: { features: outFeatures } });
};
