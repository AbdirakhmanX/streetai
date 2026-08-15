export default function Hero() {
  return (
    <section id="home" className="relative hex-field overflow-hidden pt-16">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="scan-line absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-lane/10 to-transparent" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-32 md:pt-36 md:pb-44">
        <div className="font-mono text-xs uppercase tracking-widest text-hazard mb-6">
          Edge-AI Road Sensing — Pilot Partner: Bothell, WA
        </div>

        <h1 className="font-display font-semibold text-4xl sm:text-5xl md:text-6xl leading-[1.05] text-chalk max-w-3xl">
          Every street already tells you where it's breaking.
          <span className="text-steel"> We just listen.</span>
        </h1>

        <p className="mt-6 max-w-xl text-steel text-base md:text-lg leading-relaxed font-body">
          StreetSense turns ordinary vehicle drives into verified pothole and
          debris reports — cross-checked against depth, motion, and repeat
          passes before they ever reach a map, so maintenance teams get
          events they can trust and act on.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="#dashboard"
            className="font-mono text-sm uppercase tracking-wider px-6 py-3 rounded-sm bg-hazard text-asphalt font-medium hover:bg-lane transition-colors"
          >
            See the live dashboard
          </a>
          <a
            href="#how-it-works"
            className="font-mono text-sm uppercase tracking-wider px-6 py-3 rounded-sm border border-steel/30 text-chalk hover:border-chalk transition-colors"
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}
