import Scene3D from "../components/Scene3D";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-black">
      {/* The 3D OS Layer */}
      <div className="w-full h-screen absolute top-0 left-0 z-0">
        <Scene3D />
      </div>

      {/* A simple overlay UI for later */}
      <div className="absolute top-5 left-5 z-10 text-white font-mono pointer-events-none">
        <h1 className="text-2xl font-bold">Neuro-Space v0.1</h1>
        <p className="text-sm opacity-70">System: Online</p>
      </div>
    </main>
  );
}