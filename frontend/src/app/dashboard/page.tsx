'use client';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Monitor and control your AI agents from a unified dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Active Agents</h3>
          <div className="text-3xl font-bold">3</div>
          <p className="text-sm text-muted-foreground mt-1">
            1 online, 1 busy, 1 offline
          </p>
        </div>

        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Commands Executed</h3>
          <div className="text-3xl font-bold">127</div>
          <p className="text-sm text-muted-foreground mt-1">
            Last 24 hours
          </p>
        </div>

        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Queue Size</h3>
          <div className="text-3xl font-bold">5</div>
          <p className="text-sm text-muted-foreground mt-1">
            Pending commands
          </p>
        </div>

        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Terminal Sessions</h3>
          <div className="text-3xl font-bold">2</div>
          <p className="text-sm text-muted-foreground mt-1">
            Active sessions
          </p>
        </div>

        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Avg Response Time</h3>
          <div className="text-3xl font-bold">182ms</div>
          <p className="text-sm text-muted-foreground mt-1">
            WebSocket latency
          </p>
        </div>

        <div className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">System Health</h3>
          <div className="text-3xl font-bold text-green-500">Good</div>
          <p className="text-sm text-muted-foreground mt-1">
            All systems operational
          </p>
        </div>
      </div>

      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <p className="font-medium">Agent 1 executed command</p>
              <p className="text-sm text-muted-foreground">npm install @radix-ui/react-icons</p>
            </div>
            <span className="text-sm text-muted-foreground">2 min ago</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <p className="font-medium">Agent 2 went offline</p>
              <p className="text-sm text-muted-foreground">Connection lost</p>
            </div>
            <span className="text-sm text-muted-foreground">5 min ago</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <p className="font-medium">Agent 3 status changed</p>
              <p className="text-sm text-muted-foreground">Status: busy → online</p>
            </div>
            <span className="text-sm text-muted-foreground">12 min ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}