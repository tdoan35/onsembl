'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import AgentCard from '@/components/agents/agent-card';
import TerminalViewer from '@/components/terminal/terminal-viewer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export default function ActiveAgentsPage() {
  const { agents, addAgent, refreshAgents } = useAgentStore();
  const { addNotification } = useUIStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load real agents from backend on mount
  useEffect(() => {
    refreshAgents().catch(error => {
      addNotification({
        title: 'Failed to Load Agents',
        description: error.message || 'Could not fetch agents from backend',
        type: 'error',
      });
    });
  }, [refreshAgents, addNotification]);

  // Handle agent selection
  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(selectedAgentId === agentId ? null : agentId);
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshAgents();
      addNotification({
        title: 'Agents Refreshed',
        description: 'Agent status has been updated',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Refresh Failed',
        description: 'Failed to refresh agent status',
        type: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter agents based on status tab
  const filteredAgents = agents.filter(agent => {
    switch (statusFilter) {
      case 'all':
        return true;
      case 'active':
        return agent.status === 'online';
      case 'idle':
        return agent.status === 'connecting';
      case 'offline':
        return agent.status === 'offline' || agent.status === 'error';
      default:
        return true;
    }
  });

  // Get agent counts for tabs
  const agentCounts = {
    all: agents.length,
    active: agents.filter(a => a.status === 'online').length,
    idle: agents.filter(a => a.status === 'connecting').length,
    offline: agents.filter(a => a.status === 'offline' || a.status === 'error').length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Active Agents</h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh agents"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>

            <Button size="sm" variant="primary">
              <Plus className="h-4 w-4" />
              Add Agent
            </Button>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Active Agents */}
        <div className="w-1/2 border-r bg-muted/10 flex flex-col">
          {/* Tab Filter */}
          <div className="p-4 bg-background/50">
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="text-xs sm:text-sm">
                  All
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {agentCounts.all}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="active" className="text-xs sm:text-sm">
                  Active
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {agentCounts.active}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="idle" className="text-xs sm:text-sm">
                  Idle
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {agentCounts.idle}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="offline" className="text-xs sm:text-sm">
                  Offline
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {agentCounts.offline}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Agents List */}
          <div className="flex-1 overflow-y-auto px-4 pt-1 space-y-4 scrollbar-hover-only">
            {filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <p className="text-sm">No agents found in this category</p>
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary/20 rounded-lg",
                    selectedAgentId === agent.id && "ring-2 ring-primary"
                  )}
                  onClick={() => handleAgentSelect(agent.id)}
                >
                  <AgentCard agent={agent} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Real-time Terminal */}
        <div className="w-1/2 flex flex-col">
          {/* Terminal Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Real-time Terminal</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedAgentId
                    ? `Monitoring output from ${agents.find(a => a.id === selectedAgentId)?.name || 'Unknown Agent'}`
                    : 'Select an agent to view terminal output'
                  }
                </p>
              </div>

              {selectedAgentId && (
                <div className="flex items-center space-x-2">
                  <Badge
                    variant={agents.find(a => a.id === selectedAgentId)?.status === 'online' ? 'default' : 'secondary'}
                  >
                    {agents.find(a => a.id === selectedAgentId)?.status}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 p-4">
            {selectedAgentId ? (
              <TerminalViewer
                agentId={selectedAgentId}
                className="h-full"
                readOnly={false}
                onCommand={(command) => {
                  // Handle command execution
                  addNotification({
                    title: 'Command Sent',
                    description: `Sent command to ${agents.find(a => a.id === selectedAgentId)?.name}`,
                    type: 'info',
                  });
                }}
                initialContent={`Welcome to ${agents.find(a => a.id === selectedAgentId)?.name} terminal\r\nAgent Status: ${agents.find(a => a.id === selectedAgentId)?.status}\r\nReady for commands...\r\n\r\n`}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <div className="text-6xl mb-4">🖥️</div>
                  <h3 className="text-lg font-medium mb-2">No Agent Selected</h3>
                  <p className="text-sm">
                    Click on an agent from the left panel to view its terminal output
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}