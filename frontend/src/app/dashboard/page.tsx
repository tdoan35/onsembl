'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  Terminal,
  Users,
  Cpu,
  AlertTriangle,
  TrendingUp,
  Zap,
  Clock
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import AgentCard from '@/components/agents/agent-card';
import TerminalViewer from '@/components/terminal/terminal-viewer';
import CommandInput from '@/components/command/command-input';
import TraceTree from '@/components/trace/trace-tree';
import EmergencyStop from '@/components/system/emergency-stop';

import { useAgentStore } from '@/stores/agent-store';
import { useCommandStore } from '@/stores/command-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const [selectedTab, setSelectedTab] = useState('overview');

  const {
    agents,
    selectedAgentId,
    selectAgent,
    getOnlineAgents,
    getAgentsByStatus,
    isLoading: agentsLoading,
    setLoading: setAgentsLoading,
  } = useAgentStore();

  const {
    commands,
    getRunningCommands,
    getCommandsByStatus,
    addCommand,
    isExecuting,
  } = useCommandStore();

  const {
    terminalVisible,
    setTerminalVisible,
    addNotification,
  } = useUIStore();

  const onlineAgents = getOnlineAgents();
  const runningCommands = getRunningCommands();
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  // Mock data initialization for demo purposes
  useEffect(() => {
    const initializeMockData = () => {
      // This would normally come from API/WebSocket connections
      console.log('Dashboard initialized');
    };

    initializeMockData();
  }, []);

  const handleCommandSubmit = async (command: string, agentId: string, priority: any) => {
    const newCommand = {
      id: `cmd-${Date.now()}`,
      agentId,
      content: command,
      status: 'pending' as const,
      priority,
      createdAt: new Date().toISOString(),
    };

    addCommand(newCommand);

    // Simulate command execution
    setTimeout(() => {
      // This would be handled by WebSocket in real implementation
      addNotification({
        title: 'Command Executed',
        description: `Command "${command}" completed`,
        type: 'success',
      });
    }, 2000);
  };

  const handleAgentSelect = (agentId: string) => {
    selectAgent(agentId);
    if (!terminalVisible) {
      setTerminalVisible(true);
    }
  };

  const getSystemHealth = () => {
    const totalAgents = agents.length;
    const onlineCount = onlineAgents.length;
    const runningCommandsCount = runningCommands.length;
    const errorAgents = getAgentsByStatus('error').length;

    return {
      status: errorAgents > 0 ? 'warning' : onlineCount === 0 ? 'error' : 'healthy',
      onlinePercent: totalAgents > 0 ? Math.round((onlineCount / totalAgents) * 100) : 0,
      totalAgents,
      onlineCount,
      runningCommandsCount,
      errorAgents,
    };
  };

  const systemHealth = getSystemHealth();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor and control your AI coding agents
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <EmergencyStop />
          <Badge
            variant={
              systemHealth.status === 'healthy'
                ? 'default'
                : systemHealth.status === 'warning'
                ? 'secondary'
                : 'destructive'
            }
            className="flex items-center space-x-1"
          >
            <Activity className="h-3 w-3" />
            <span>
              {systemHealth.status === 'healthy'
                ? 'System Healthy'
                : systemHealth.status === 'warning'
                ? 'System Warning'
                : 'System Error'}
            </span>
          </Badge>
        </div>
      </div>

      {/* System Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemHealth.onlineCount}/{systemHealth.totalAgents}
            </div>
            <p className="text-xs text-muted-foreground">
              {systemHealth.onlinePercent}% operational
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Commands</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemHealth.runningCommandsCount}</div>
            <p className="text-xs text-muted-foreground">Currently executing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Load</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemHealth.runningCommandsCount > 5 ? 'High' :
               systemHealth.runningCommandsCount > 2 ? 'Medium' : 'Low'}
            </div>
            <p className="text-xs text-muted-foreground">Current workload</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Time</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">~150ms</div>
            <p className="text-xs text-muted-foreground">Average latency</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Command Input */}
            <div className="space-y-4">
              <CommandInput
                defaultAgentId={selectedAgentId || undefined}
                onCommandSubmit={handleCommandSubmit}
              />

              {/* Recent Commands */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Clock className="h-5 w-5" />
                    <span>Recent Commands</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {commands.slice(0, 5).map((command) => (
                      <div
                        key={command.id}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="flex-1 min-w-0">
                          <code className="text-sm truncate block">
                            {command.content}
                          </code>
                          <p className="text-xs text-muted-foreground">
                            {agents.find(a => a.id === command.agentId)?.name || command.agentId}
                          </p>
                        </div>
                        <Badge
                          variant={
                            command.status === 'completed'
                              ? 'default'
                              : command.status === 'running'
                              ? 'secondary'
                              : command.status === 'failed'
                              ? 'destructive'
                              : 'outline'
                          }
                        >
                          {command.status}
                        </Badge>
                      </div>
                    ))}
                    {commands.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No recent commands
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* System Status & Agents */}
            <div className="space-y-4">
              {/* System Status */}
              {systemHealth.errorAgents > 0 && (
                <Card className="border-destructive">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center space-x-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      <span>System Alerts</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {systemHealth.errorAgents} agent(s) experiencing errors
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Quick Agent Access */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Agent Access</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {onlineAgents.slice(0, 3).map((agent) => (
                      <Button
                        key={agent.id}
                        variant={selectedAgentId === agent.id ? 'default' : 'outline'}
                        className="justify-start"
                        onClick={() => handleAgentSelect(agent.id)}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span>{agent.name}</span>
                          <Badge variant="outline" className="ml-auto">
                            {agent.type}
                          </Badge>
                        </div>
                      </Button>
                    ))}
                    {onlineAgents.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No agents online
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Agent Management</h2>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">
                {agents.length} Total
              </Badge>
              <Badge variant="default">
                {onlineAgents.length} Online
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.id} onClick={() => handleAgentSelect(agent.id)}>
                <AgentCard
                  agent={agent}
                />
              </div>
            ))}
            {agents.length === 0 && (
              <div className="col-span-full text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Agents Configured</h3>
                <p className="text-muted-foreground mb-4">
                  Set up your first AI coding agent to get started
                </p>
                <Button>Add Agent</Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Terminal Tab */}
        <TabsContent value="terminal" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Terminal Output</h2>
            {selectedAgent && (
              <Badge variant="outline">
                Connected to: {selectedAgent.name}
              </Badge>
            )}
          </div>

          {selectedAgent ? (
            <TerminalViewer
              agentId={selectedAgent.id}
              height={500}
              onCommand={(command) => {
                handleCommandSubmit(command, selectedAgent.id, 'normal');
              }}
            />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-96">
                <div className="text-center">
                  <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Agent Selected</h3>
                  <p className="text-muted-foreground">
                    Select an agent to view its terminal output
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Traces Tab */}
        <TabsContent value="traces" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">LLM Trace Tree</h2>
            {selectedAgent && (
              <Badge variant="outline">
                Agent: {selectedAgent.name}
              </Badge>
            )}
          </div>

          <TraceTree
            agentId={selectedAgentId || undefined}
            className="min-h-[500px]"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}