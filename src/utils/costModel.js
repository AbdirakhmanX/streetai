// Rough average-daily-traffic estimates by road class.
// These are placeholder numbers for demo purposes — swap in real counts
// (e.g. from WSDOT or city traffic data) once available.
const AADT_BY_CLASS = {
  motorway: 40000,
  trunk: 25000,
  primary: 15000,
  secondary: 6000,
  tertiary: 2500,
};
const DEFAULT_AADT = 1200;

export function inferAADT(roadClass) {
  return AADT_BY_CLASS[roadClass] ?? DEFAULT_AADT;
}

// Cost constants — placeholders. Tune these against real repair-cost data
// for a credible estimate; they're meant to produce a sensible *ranking*
// of segments for the demo, not a certified budget figure.
const COST_PER_METER = 45; // rough repair cost per meter of affected road
const DELAY_COST_PER_VEHICLE = 0.02; // "cost" of driving over a rough segment
const RISK_COST_PER_SEVERITY_UNIT = 150;

/**
 * Estimates repair/delay/risk cost for a road segment given its length,
 * summed hazard weight (severity + recency), traffic volume, and
 * user-adjustable knobs (alpha/beta/gamma sliders in the UI).
 */
export function segmentCost(lengthMeters, weightSum, aadt, knobs = {}) {
  const { alpha = 1, beta = 1, gamma = 1 } = knobs;

  const Repair = alpha * weightSum * lengthMeters * (COST_PER_METER / 100);
  const Delay = beta * aadt * weightSum * DELAY_COST_PER_VEHICLE;
  const Risk = gamma * weightSum * RISK_COST_PER_SEVERITY_UNIT;

  const expected = Repair + Delay + Risk;
  const priority = lengthMeters > 0 ? expected / lengthMeters : expected;

  return { expected, priority, breakdown: { Repair, Delay, Risk } };
}
