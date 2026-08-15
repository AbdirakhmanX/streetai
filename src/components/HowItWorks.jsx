const STAGES = [
  {
    n: "01",
    key: "VISUAL",
    title: "Visual candidate",
    detail: "An onboard camera flags a shape on the road that looks like a pothole or debris pile.",
  },
  {
    n: "02",
    key: "DEPTH",
    title: "Depth check",
    detail: "Stereo depth confirms it's actually a dip or a raised object — not a shadow, puddle, or stain.",
  },
  {
    n: "03",
    key: "MOTION",
    title: "Motion correlation",
    detail: "For potholes, the vehicle's own motion sensors confirm it actually felt an impact at that spot.",
  },
  {
    n: "04",
    key: "LOCATION",
    title: "Location & repeat pass",
    detail: "GPS snaps it to a road segment; being seen again on later drives raises confidence further.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-panel border-t border-steel/10">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="font-mono text-xs uppercase tracking-widest text-signal mb-4">
          The Pipeline
        </div>
        <h2 className="font-display font-semibold text-3xl md:text-4xl text-chalk leading-tight max-w-2xl">
          A detection only becomes an event once it survives four checks.
        </h2>
        <p className="mt-4 max-w-2xl text-steel leading-relaxed">
          This is the difference between "the model saw something" and "this
          is repair-ready." Each stage has to pass before a candidate is
          promoted — false positives get filtered out along the way instead
          of landing on the map.
        </p>

        <div className="mt-16 grid md:grid-cols-4 gap-8 md:gap-6 relative">
          <div className="hidden md:block absolute top-6 left-[12.5%] right-[12.5%] h-px bg-steel/20" />
          {STAGES.map((s) => (
            <div key={s.key} className="relative">
              <div className="flex items-center gap-3 md:block">
                <div className="font-mono text-xs text-hazard bg-panel md:bg-transparent relative z-10 md:mb-4">
                  {s.n}
                </div>
              </div>
              <div className="font-display font-medium text-lg text-chalk">
                {s.title}
              </div>
              <p className="mt-2 text-steel text-sm leading-relaxed">
                {s.detail}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex items-center gap-4 p-5 rounded-sm border border-lane/30 bg-asphalt max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-widest text-lane">
            Output
          </div>
          <div className="text-chalk text-sm">
            A structured hazard event: type, location, severity, confidence,
            timestamp, and evidence — ready for a maintenance queue.
          </div>
        </div>
      </div>
    </section>
  );
}
