import Map from "../Map.jsx";

export default function DashboardSection() {
  return (
    <section id="dashboard" className="bg-asphalt border-t border-steel/10">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="font-mono text-xs uppercase tracking-widest text-hazard mb-4">
          Live Dashboard — Bothell, WA
        </div>
        <h2 className="font-display font-semibold text-3xl md:text-4xl text-chalk leading-tight max-w-2xl">
          This is the same tool your team would use.
        </h2>
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <p className="max-w-2xl text-steel leading-relaxed">
            Switch between raw reports, hotspot density, and repair-cost
            prioritization. The data below is sample data for demonstration —
            the layout and workflow are what would ship with real StreetSense
            events flowing in.
          </p>
          <a
            href="/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-sm border border-lane/40 text-lane hover:bg-lane/10 transition-colors whitespace-nowrap"
          >
            Open full-screen ↗
          </a>
        </div>

        <div className="mt-10 rounded-lg border border-steel/20 bg-panel p-2 md:p-3 shadow-2xl shadow-black/40">
          <Map mode="reports" />
        </div>
      </div>
    </section>
  );
}
