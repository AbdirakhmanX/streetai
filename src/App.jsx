import Map from "./Map";

export default function App() {
  return (
    <main className="w-screen h-screen bg-[#F2EFE7] overflow-hidden m-0 p-0">
      {/* Clean, custom-themed header hovering over the map */}
      <header className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        
      </header>

      {/* The Fullscreen Map */}
      <Map className="w-full h-full" />
    </main>
  );
}