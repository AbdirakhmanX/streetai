export default function CTAFooter() {
  return (
    <>
      <section id="contact" className="hex-field border-t border-steel/10">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-signal mb-4">
            Let's Talk, Bothell Public Works
          </div>
          <h2 className="font-display font-semibold text-3xl md:text-4xl text-chalk max-w-xl mx-auto leading-tight">
            We're ready to start a pilot on Bothell roads.
          </h2>
          <p className="mt-4 max-w-lg mx-auto text-steel leading-relaxed">
            Structured events only by default — raw video stays off the map
            and is used solely for model review, never published without
            privacy review.
          </p>

          <div className="mt-8">
            <a
              href="mailto:hello@streetsense.example"
              className="inline-block font-mono text-sm uppercase tracking-wider px-6 py-3 rounded-sm bg-hazard text-asphalt font-medium hover:bg-lane transition-colors"
            >
              hello@streetsense.example
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-asphalt border-t border-steel/10">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="font-display font-medium text-chalk text-sm">
            StreetSense<span className="text-lane">.</span>
          </div>
          <div className="font-mono text-xs text-steel/70">
            © 2026 StreetSense — Bothell pilot proposal
          </div>
        </div>
      </footer>
    </>
  );
}
