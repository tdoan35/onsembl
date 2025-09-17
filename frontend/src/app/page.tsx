export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
          Welcome to Onsembl.ai
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
          Agent Control Center for orchestrating multiple AI coding agents through a unified dashboard with real-time WebSocket streaming.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Agent Management</h3>
            <p className="text-muted-foreground">
              Monitor and control multiple AI agents including Claude, Gemini, and Codex.
            </p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Real-time Streaming</h3>
            <p className="text-muted-foreground">
              Watch command execution in real-time with WebSocket streaming and terminal output.
            </p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Command Queue</h3>
            <p className="text-muted-foreground">
              Priority-based command queueing with interruption support and emergency stop.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}