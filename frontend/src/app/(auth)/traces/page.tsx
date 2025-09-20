export default function TracesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">LLM Trace Visualization</h1>
      <p className="text-muted-foreground mb-8">
        Visualize LLM decision trees and trace execution paths with 30-day audit log retention.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Trace Tree</h2>
          <div className="border rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                <div>
                  <div className="font-medium">User Request</div>
                  <div className="text-sm text-muted-foreground">Initialize frontend structure</div>
                </div>
              </div>
              <div className="ml-6 space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                  <div>
                    <div className="font-medium">Claude Analysis</div>
                    <div className="text-sm text-muted-foreground">Planning Next.js 14 setup</div>
                  </div>
                </div>
                <div className="ml-6 space-y-2">
                  <div className="flex items-start space-x-4">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2"></div>
                    <div>
                      <div className="font-medium">Task Execution</div>
                      <div className="text-sm text-muted-foreground">Creating app structure</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Audit Log</h2>
          <div className="border rounded-lg p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Files created: 12</span>
                <span className="text-muted-foreground">2m ago</span>
              </div>
              <div className="flex justify-between">
                <span>Dependencies installed</span>
                <span className="text-muted-foreground">3m ago</span>
              </div>
              <div className="flex justify-between">
                <span>Dev server started</span>
                <span className="text-muted-foreground">5m ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}