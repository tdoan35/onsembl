'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAgentStore } from '@/stores/agent-store';
import { useCommandStore } from '@/stores/command-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { useUIStore } from '@/stores/ui-store';
import { webSocketStoreBridge } from '@/services/websocket-store-bridge';

export default function TestWebSocketPage() {
  const agents = useAgentStore((state) => state.agents);
  const commands = useCommandStore((state) => state.commands);
  const outputs = useTerminalStore((state) => state.outputs);
  const webSocketState = useUIStore((state) => state.webSocketState);
  const [testCommandId, setTestCommandId] = useState<string | null>(null);

  const sendTestCommand = () => {
    const commandId = `cmd_${Date.now()}`;
    const agentId = agents[0]?.id || 'agent_1';

    setTestCommandId(commandId);
    webSocketStoreBridge.sendCommand(
      agentId,
      commandId,
      'echo "Hello from WebSocket test"',
      'normal'
    );
  };

  const cancelTestCommand = () => {
    if (testCommandId && agents[0]) {
      webSocketStoreBridge.cancelCommand(testCommandId, agents[0].id);
    }
  };

  const triggerEmergencyStop = () => {
    webSocketStoreBridge.emergencyStop();
  };

  const simulateAgentUpdate = () => {
    // This would normally come from the backend
    const agentStore = useAgentStore.getState();
    agentStore.addAgent({
      id: 'agent_test',
      name: 'Test Agent',
      type: 'claude',
      status: 'online',
      version: '1.0.0',
      capabilities: ['execute', 'stream'],
      lastPing: new Date().toISOString()
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-6">WebSocket Real-Time Test</h1>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p>
              WebSocket State: <span className="font-mono font-semibold">{webSocketState}</span>
            </p>
            <div className="flex gap-2">
              <Button onClick={simulateAgentUpdate} variant="outline">
                Simulate Agent Update
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agents */}
      <Card>
        <CardHeader>
          <CardTitle>Agents ({agents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-muted-foreground">No agents connected</p>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{agent.name}</p>
                      <p className="text-sm text-muted-foreground">
                        ID: {agent.id} | Type: {agent.type} | Status: {agent.status}
                      </p>
                    </div>
                    <div className={`h-3 w-3 rounded-full ${
                      agent.status === 'online' ? 'bg-green-500' :
                      agent.status === 'offline' ? 'bg-gray-500' :
                      agent.status === 'error' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`} />
                  </div>
                  {agent.metrics && (
                    <div className="mt-2 text-sm">
                      <p>Commands: {agent.metrics.commandsExecuted}</p>
                      <p>Memory: {agent.metrics.memoryUsage}MB</p>
                      <p>CPU: {agent.metrics.cpuUsage}%</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commands */}
      <Card>
        <CardHeader>
          <CardTitle>Commands ({commands.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={sendTestCommand} disabled={agents.length === 0}>
                Send Test Command
              </Button>
              <Button onClick={cancelTestCommand} variant="outline" disabled={!testCommandId}>
                Cancel Test Command
              </Button>
              <Button onClick={triggerEmergencyStop} variant="destructive">
                Emergency Stop
              </Button>
            </div>

            {commands.length === 0 ? (
              <p className="text-muted-foreground">No commands executed</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {commands.slice(0, 10).map((command) => (
                  <div key={command.id} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-mono text-sm">{command.content}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          ID: {command.id} | Agent: {command.agentId}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded ${
                        command.status === 'completed' ? 'bg-green-100 text-green-800' :
                        command.status === 'running' ? 'bg-blue-100 text-blue-800' :
                        command.status === 'failed' ? 'bg-red-100 text-red-800' :
                        command.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {command.status}
                      </span>
                    </div>
                    {command.output && (
                      <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                        <pre className="text-xs whitespace-pre-wrap">{command.output}</pre>
                      </div>
                    )}
                    {command.error && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                        <p className="text-sm text-red-600 dark:text-red-400">{command.error}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Terminal Output */}
      <Card>
        <CardHeader>
          <CardTitle>Terminal Output ({outputs.length} lines)</CardTitle>
        </CardHeader>
        <CardContent>
          {outputs.length === 0 ? (
            <p className="text-muted-foreground">No terminal output</p>
          ) : (
            <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs max-h-96 overflow-y-auto">
              {outputs.slice(-50).map((output) => (
                <div key={output.id} className={output.type === 'stderr' ? 'text-red-400' : ''}>
                  [{new Date(output.timestamp).toLocaleTimeString()}] {output.content}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}