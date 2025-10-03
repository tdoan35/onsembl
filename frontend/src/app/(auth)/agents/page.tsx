'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, Plus } from 'lucide-react';
import AgentCard from '@/components/agents/agent-card';
import TerminalViewer from '@/components/terminal/terminal-viewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export default function ActiveAgentsPage() {
  const { agents, addAgent, refreshAgents } = useAgentStore();
  const { addNotification } = useUIStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize agents if empty (for demo purposes)
  useEffect(() => {
    if (agents.length === 0) {
      // Add sample agents
      addAgent({
        id: 'claude-1',
        name: 'Claude Agent',
        type: 'claude',
        version: '3.5',
        status: 'online',
        capabilities: ['code-analysis', 'debugging', 'refactoring', 'documentation'],
        metrics: {
          uptime: 7245,
          memoryUsage: 128 * 1024 * 1024,
          cpuUsage: 23.5,
          commandsExecuted: 142
        },
        lastPing: new Date(Date.now() - 30000).toISOString(),
      });

      addAgent({
        id: 'gemini-1',
        name: 'Gemini Agent',
        type: 'gemini',
        version: '2.0',
        status: 'offline',
        capabilities: ['code-generation', 'testing', 'optimization'],
        lastPing: new Date(Date.now() - 300000).toISOString(),
      });

      addAgent({
        id: 'codex-1',
        name: 'Codex Agent',
        type: 'codex',
        version: '1.5',
        status: 'connecting',
        capabilities: ['autocomplete', 'translation', 'explanation'],
        lastPing: new Date(Date.now() - 60000).toISOString(),
      });
    }
  }, [agents, addAgent]);

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

  // Filter agents based on search and status
  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Get active agents count
  const activeAgentsCount = agents.filter(agent => agent.status === 'online').length;

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
          {/* Search and Filter Bar */}
          <div className="p-4 border-b bg-background/50">
            <div className="flex space-x-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search agents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="connecting">Connecting</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Summary */}
            <div className="flex space-x-2">
              <Badge variant="outline" className="text-green-600">
                {agents.filter(a => a.status === 'online').length} Online
              </Badge>
              <Badge variant="outline" className="text-gray-500">
                {agents.filter(a => a.status === 'offline').length} Offline
              </Badge>
              <Badge variant="outline" className="text-yellow-600">
                {agents.filter(a => a.status === 'connecting').length} Connecting
              </Badge>
              {agents.filter(a => a.status === 'error').length > 0 && (
                <Badge variant="outline" className="text-red-600">
                  {agents.filter(a => a.status === 'error').length} Error
                </Badge>
              )}
            </div>
          </div>

          {/* Agents List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <p className="text-sm">No agents found</p>
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm('')}
                    className="mt-2"
                  >
                    Clear search
                  </Button>
                )}
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