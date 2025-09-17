export default function CommandsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Command Center</h1>
      <p className="text-muted-foreground mb-8">
        Execute commands with priority-based queueing and real-time output streaming.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Command Queue</h2>
          <div className="border rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">npm install dependencies</span>
                <span className="text-xs text-muted-foreground">Running</span>
              </div>
              <div className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">Run test suite</span>
                <span className="text-xs text-muted-foreground">Queued</span>
              </div>
              <div className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">Build production</span>
                <span className="text-xs text-muted-foreground">Queued</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Terminal Output</h2>
          <div className="border rounded-lg p-4 bg-black text-green-400 font-mono text-sm min-h-[200px]">
            <div>$ npm install</div>
            <div>Installing dependencies...</div>
            <div>✓ Dependencies installed successfully</div>
            <div className="animate-pulse">█</div>
          </div>
        </div>
      </div>
    </div>
  )
}