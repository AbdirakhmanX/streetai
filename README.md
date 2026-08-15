# StreetSense — Bothell Pilot (Map Dashboard)

This is the map dashboard: it shows pothole/debris reports on a map of Bothell, WA,
with three views (Reports, Heatmap, Cost). Right now it's loaded with sample data —
it's not connected to real StreetSense detections yet.

## First-time setup

1. **Install Node.js** if you don't have it: https://nodejs.org (get the "LTS" version).

2. **Open a terminal in this folder** and install everything the project needs:
   ```
   npm install
   ```

3. **Get a free MapTiler key**: sign up at https://www.maptiler.com/ and copy your API key.

4. **Set up your local environment file**:
   - Copy `.env.example` and rename the copy to `.env`
   - Open `.env` and paste your key in:
     ```
     VITE_MAPTILER_KEY=your_real_key_here
     ```
   - Never commit `.env` to git (it's already in `.gitignore`) — that's how the last key
     ended up exposed in the sample code.

5. **Run it**:
   ```
   npm run dev
   ```
   Then open the URL it prints (usually `http://localhost:5173`) in your browser.

You should see a dark map centered on Bothell with a handful of sample pothole/debris
points on it. Try the Reports / Heatmap / Cost buttons in the top-left.

## What's here

```
src/
  App.jsx              # top-level page, just renders the Map
  Map.jsx              # the whole map component (modes, layers, filters)
  index.css            # Tailwind setup
  assets/
    sampleHazards.json # fake demo data — swap for real StreetSense events later
  utils/
    hazardProcessor.js # turns raw hazard records into map-ready GeoJSON
    costModel.js        # rough repair-cost / priority estimates
    csvExport.js         # "download as CSV" button logic
  workers/
    aggWorker.js         # background thread that groups points into hexagons for the heatmap
```

## Next steps (when you're ready)

- Replace `sampleHazards.json` with real data once the StreetSense detection pipeline
  is producing events — the event schema in the paper (type, location, severity,
  confidence, timestamp, evidence, status) maps directly onto the fields this app expects.
- The cost numbers in `costModel.js` are placeholders — swap in real repair costs and
  traffic counts if you want the "Cost" view to reflect actual Bothell numbers.
