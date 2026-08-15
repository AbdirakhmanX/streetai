import { Link } from "react-router-dom";
import Map from "../Map.jsx";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-asphalt flex flex-col">
      <header className="h-16 shrink-0 border-b border-steel/10 bg-asphalt/90 backdrop-blur-md flex items-center justify-between px-4 md:px-6">
        <Link to="/" className="font-display font-semibold text-chalk text-lg tracking-tight">
          StreetSense<span className="text-lane">.</span>
        </Link>
        <div className="font-mono text-xs uppercase tracking-wider text-steel">
          Bothell, WA — Pilot Dashboard
        </div>
        <Link
          to="/"
          className="font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded-sm border border-steel/30 text-chalk hover:border-chalk transition-colors"
        >
          ← Back to overview
        </Link>
      </header>

      <main className="flex-1 p-3 md:p-4">
        <Map mode="reports" className="h-[calc(100vh-6rem)]" />
      </main>
    </div>
  );
}
