const GAPS = [
  {
    label: "Complaint-driven reports",
    detail: "Timely when they happen — but only catch what someone bothers to report, and miss what nobody drives past twice.",
  },
  {
    label: "Periodic pavement surveys",
    detail: "Accurate when they run — but expensive, and roads keep deteriorating in between inspection cycles.",
  },
];

export default function Problem() {
  return (
    <section id="problem" className="bg-asphalt border-t border-steel/10">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-[1fr_1.3fr] gap-12 md:gap-20">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-signal mb-4">
              The Gap
            </div>
            <h2 className="font-display font-semibold text-3xl md:text-4xl text-chalk leading-tight">
              Road conditions change faster than the systems that track them.
            </h2>
            <p className="mt-6 text-steel leading-relaxed">
              Bothell's roads don't wait for the next inspection cycle. Today,
              cities are stuck choosing between two imperfect options:
            </p>
          </div>

          <div className="space-y-6">
            {GAPS.map((g) => (
              <div key={g.label} className="border-l-2 border-hazard/60 pl-6 py-1">
                <div className="font-display font-medium text-lg text-chalk">
                  {g.label}
                </div>
                <p className="mt-1 text-steel text-sm leading-relaxed">
                  {g.detail}
                </p>
              </div>
            ))}

            <div className="mt-10 p-6 rounded-sm bg-panel border border-lane/20">
              <div className="font-mono text-xs uppercase tracking-widest text-lane mb-2">
                $26.5B
              </div>
              <p className="text-chalk text-sm leading-relaxed">
                what U.S. drivers pay annually in pothole-related vehicle
                repairs, according to AAA — costs that compound every extra
                week a hazard goes unreported.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
