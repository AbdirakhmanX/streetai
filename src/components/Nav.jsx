const LINKS = [
  { href: "#problem", label: "The Problem" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#dashboard", label: "Live Dashboard" },
  { href: "#contact", label: "Contact" },
];

export default function Nav() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-asphalt/70 border-b border-steel/10">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#home" className="font-display font-semibold text-chalk text-lg tracking-tight">
          StreetSense<span className="text-lane">.</span>
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-mono text-xs uppercase tracking-wider text-steel hover:text-chalk transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <a
          href="/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-sm border border-lane/40 text-lane hover:bg-lane/10 transition-colors"
        >
          Open Dashboard ↗
        </a>
      </div>
    </header>
  );
}
