export function hazardsToGeoJSON(data) {
  if (!data || !Array.isArray(data)) {
    return { type: "FeatureCollection", features: [] };
  }

  const features = data.map((item) => {
    const hazardType = (item.hazards && item.hazards.length > 0) ? item.hazards[0] : "other";

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.lon, item.lat]
      },
      properties: {
        id: item.id,
        type: hazardType,
        severity: "high", 
        image: item.image,
        labels: JSON.stringify(item.regions || [])
      }
    };
  });

  return {
    type: "FeatureCollection",
    features: features
  };
}