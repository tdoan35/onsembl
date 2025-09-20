export default function AgentsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Agent Management</h1>
      <p className="text-muted-foreground mb-8">
        Monitor and control your AI coding agents including Claude, Gemini, and Codex.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Claude Agent</h3>
          <p className="text-sm text-muted-foreground mb-4">Status: Ready</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm">
              Start
            </button>
            <button className="px-3 py-1 border rounded text-sm">
              Configure
            </button>
          </div>
        </div>

        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Gemini Agent</h3>
          <p className="text-sm text-muted-foreground mb-4">Status: Idle</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm">
              Start
            </button>
            <button className="px-3 py-1 border rounded text-sm">
              Configure
            </button>
          </div>
        </div>

        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Codex Agent</h3>
          <p className="text-sm text-muted-foreground mb-4">Status: Offline</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm">
              Start
            </button>
            <button className="px-3 py-1 border rounded text-sm">
              Configure
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}