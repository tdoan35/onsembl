'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal.store';
import { useAgentStore } from '@/stores/agent.store';
import { useCommandStore } from '@/stores/command.store';
import { webSocketService } from '@/services/websocket.service';
import { MessageType } from '@onsembl/agent-protocol';
import TerminalViewer from '@/components/terminal/terminal-viewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, StopCircle, Trash2, RefreshCw } from 'lucide-react';

export default function CommandsPage() {
  const [command, setCommand] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [priority, setPriority] = useState<number>(5);

  const { sessions, activeSessionId, setActiveSession, clearSession } = useTerminalStore();
  const { agents } = useAgentStore();
  const { commands } = useCommandStore();
  // TODO: Add executeCommand and cancelCommand to command store
  const executeCommand = (cmd: any) => console.log('Execute command:', cmd);
  const cancelCommand = (id: string) => console.log('Cancel command:', id);

  // Get active agents
  const activeAgents = Array.from(agents.values()).filter(agent => agent.status === 'connected');

  // Auto-select first agent if none selected
  useEffect(() => {
    if (!selectedAgentId && activeAgents.length > 0 && activeAgents[0]) {
      setSelectedAgentId(activeAgents[0].id);
    }
  }, [activeAgents, selectedAgentId]);

  const handleExecuteCommand = useCallback(() => {
    if (!command.trim() || !selectedAgentId) return;

    // Generate a command ID
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Send command request via WebSocket
    // TODO: The protocol needs to be updated to include agentId in CommandRequestPayload
    webSocketService.send('dashboard', MessageType.COMMAND_REQUEST, {
      commandId,
      content: command.trim(),
      type: 'execute' as any, // TODO: Import CommandType enum
      priority,
      executionConstraints: {
        timeLimitMs: 300000 // 5 minutes timeout
      }
    });

    // Create terminal session
    useTerminalStore.getState().createSession(commandId, selectedAgentId, command.trim());

    // Store command in command store
    executeCommand({
      id: commandId,
      agentId: selectedAgentId,
      command: command.trim(),
      priority,
      status: 'QUEUED',
      createdAt: new Date()
    });

    // Clear input
    setCommand('');
  }, [command, selectedAgentId, priority, executeCommand]);

  const handleCancelCommand = useCallback((commandId: string) => {
    // Send cancel request via WebSocket
    webSocketService.send('dashboard', MessageType.COMMAND_CANCEL, {
      commandId,
      reason: 'User cancelled' // Required field
    });

    // Update command status
    cancelCommand(commandId);
  }, [cancelCommand]);

  const handleEmergencyStop = useCallback(() => {
    // Send emergency stop to all agents
    webSocketService.send('dashboard', MessageType.EMERGENCY_STOP, {
      reason: 'User initiated emergency stop',
      timestamp: Date.now(),
      triggeredBy: 'dashboard', // Required field
      agentsStopped: 0, // Will be populated by backend
      commandsCancelled: 0 // Will be populated by backend
    });
  }, []);

  // Get queue of commands
  const queuedCommands = Array.from(commands.values())
    .filter(cmd => cmd.status === 'queued' || cmd.status === 'executing')
    .sort((a, b) => {
      if (a.status === 'executing' && b.status !== 'executing') return -1;
      if (b.status === 'executing' && a.status !== 'executing') return 1;
      return (b.priority || 0) - (a.priority || 0);
    });

  const completedCommands = Array.from(commands.values())
    .filter(cmd => cmd.status === 'completed' || cmd.status === 'failed' || cmd.status === 'cancelled')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground mt-2">
            Execute commands with priority-based queueing and real-time output streaming.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleEmergencyStop}
        >
          <StopCircle className="h-4 w-4 mr-2" />
          Emergency Stop
        </Button>
      </div>

      {/* Command Input Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Execute Command</CardTitle>
          <CardDescription>Run a command on the selected agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {activeAgents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name} ({agent.id})
                  </SelectItem>
                ))}
                {activeAgents.length === 0 && (
                  <SelectItem value="" disabled>No agents available</SelectItem>
                )}
              </SelectContent>
            </Select>

            <Input
              type="text"
              placeholder="Enter command (e.g., ls -la, npm test)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleExecuteCommand();
                }
              }}
              className="flex-1"
            />

            <Select value={priority.toString()} onValueChange={(v) => setPriority(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">High (10)</SelectItem>
                <SelectItem value="5">Normal (5)</SelectItem>
                <SelectItem value="1">Low (1)</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleExecuteCommand}
              disabled={!command.trim() || !selectedAgentId || activeAgents.length === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              Execute
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Command Queue */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Command Queue</CardTitle>
              <CardDescription>
                {queuedCommands.length} command(s) in queue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {queuedCommands.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No commands in queue</p>
                ) : (
                  queuedCommands.map(cmd => (
                    <div key={cmd.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono">{cmd.command}</code>
                          <Badge variant={cmd.status === 'executing' ? 'default' : 'secondary'}>
                            {cmd.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Agent: {cmd.agent_id} • Priority: {cmd.priority}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setActiveSession(cmd.id)}
                          className="h-8 w-8"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCancelCommand(cmd.id)}
                          className="h-8 w-8"
                        >
                          <StopCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Commands */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Commands</CardTitle>
              <CardDescription>
                Last {completedCommands.length} completed command(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {completedCommands.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed commands</p>
                ) : (
                  completedCommands.map(cmd => (
                    <div key={cmd.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <code className="text-sm font-mono">{cmd.command}</code>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={
                              cmd.status === 'completed' ? 'success' :
                              cmd.status === 'failed' ? 'destructive' :
                              'secondary'
                            }
                          >
                            {cmd.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(cmd.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setActiveSession(cmd.id)}
                        className="h-8 w-8"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Terminal Output */}
        <div className="space-y-4">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Terminal Output</CardTitle>
                  <CardDescription>
                    {activeSessionId ? `Session: ${activeSessionId}` : 'No active session'}
                  </CardDescription>
                </div>
                {activeSessionId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => clearSession(activeSessionId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {activeSessionId && sessions.get(activeSessionId)?.agentId ? (
                <TerminalViewer
                  agentId={sessions.get(activeSessionId)!.agentId}
                  height={500}
                  readOnly={true}
                />
              ) : (
                <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    Execute a command to see terminal output
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}