'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, Plus } from 'lucide-react';
import AgentCard from '@/components/agents/agent-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';
import { useTerminalStore } from '@/stores/terminal.store';
import { useWebSocketStore } from '@/stores/websocket.store';
import { useAgentRealtime } from '@/hooks/useAgentRealtime';
import { cn } from '@/lib/utils';

// Load TerminalViewer only on client side to avoid SSR issues with xterm.js
const TerminalViewer = dynamic(
  () => import('@/components/terminal/terminal-viewer'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">Loading terminal...</div>
      </div>
    ),
  }
);

export default function ActiveAgentsPage() {
  const { agents, addAgent, refreshAgents, updateAgentStatus } = useAgentStore();
  const { addNotification } = useUIStore();
  const { createSession, setActiveSession, sessions, addOutput } = useTerminalStore();
  const { sendCommand, dashboardState } = useWebSocketStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Subscribe to Supabase Realtime for redundant agent status updates
  const { isSubscribed, error: realtimeError } = useAgentRealtime({
    enableLogging: false,
    onError: (error) => {
      console.error('[AgentsPage] Realtime subscription error:', error);
      // Don't show notifications for realtime errors - WebSocket is the primary sync method
    },
    onSubscribed: () => {
      console.log('[AgentsPage] Subscribed to agent realtime updates');
    }
  });

  // NOTE: WebSocket connection is managed by WebSocketProvider (websocket-provider.tsx)
  // This page just consumes the connection state. No need to manage connection here.

  // Load agents from backend on mount only
  useEffect(() => {
    refreshAgents().catch(error => {
      addNotification({
        title: 'Failed to Load Agents',
        description: error.message || 'Could not fetch agents from backend',
        type: 'error',
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Client-side staleness detection: Sync agent status based on heartbeat freshness
  // This provides a fallback when WebSocket status updates fail to deliver
  useEffect(() => {
    // Backend sends PING every 30s, so we need generous timeouts to account for:
    // - Network delays (2-5s)
    // - Database write delays (1-2s)
    // - Processing overhead (1-2s)
    // Total worst-case: ~10s per cycle
    const HEARTBEAT_TIMEOUT = 120000; // 120 seconds = 4× PING interval (prevents false timeouts)
    const HEARTBEAT_FRESH = 75000;    // 75 seconds = 2.5× PING interval (marks fresh agents online)
    const CHECK_INTERVAL = 15000;     // Check every 15 seconds (reduced frequency)
    const CLOCK_SKEW_TOLERANCE = 5000; // 5 seconds tolerance for clock differences

    const stalenessCheckInterval = setInterval(() => {
      const now = Date.now();

      agents.forEach(agent => {
        // Skip agents with no ping data (disconnected agents have null lastPing)
        if (!agent.lastPing) {
          // If agent shows as online but has no lastPing, mark offline
          if (agent.status === 'online') {
            console.log(`[StalenessDetection] Agent ${agent.name || agent.id} shows online but has no lastPing, marking as offline`);
            updateAgentStatus(agent.id, 'offline');
          }
          return;
        }

        const lastPingTime = new Date(agent.lastPing).getTime();
        const timeSinceLastPing = now - lastPingTime;

        // Detect clock skew: lastPing shouldn't be in the future
        if (timeSinceLastPing < -CLOCK_SKEW_TOLERANCE) {
          console.warn(`[StalenessDetection] Agent ${agent.name || agent.id} has lastPing in the future (clock skew detected), skipping`);
          return;
        }

        // Case 1: Agent showing as online but heartbeat is stale → mark offline
        if (agent.status === 'online' && timeSinceLastPing > HEARTBEAT_TIMEOUT) {
          console.log(`[StalenessDetection] Agent ${agent.name || agent.id} hasn't pinged in ${Math.round(timeSinceLastPing / 1000)}s, marking as offline`);
          updateAgentStatus(agent.id, 'offline');
        }

        // Case 2: Agent showing as offline but heartbeat is fresh → mark online
        // Note: With the backend fix, disconnected agents will have null lastPing,
        // so this should only trigger for agents that are actually connected but show as offline
        else if (agent.status === 'offline' && timeSinceLastPing < HEARTBEAT_FRESH && timeSinceLastPing >= 0) {
          console.log(`[StalenessDetection] Agent ${agent.name || agent.id} has fresh heartbeat (${Math.round(timeSinceLastPing / 1000)}s ago), marking as online`);
          updateAgentStatus(agent.id, 'online');
        }
      });
    }, CHECK_INTERVAL);

    return () => clearInterval(stalenessCheckInterval);
  }, [agents, updateAgentStatus]);

  // Manage terminal session when agent is selected/deselected
  useEffect(() => {
    if (!selectedAgentId) {
      setActiveSession(null);
      return;
    }

    // Find the selected agent
    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent) {
      console.warn('[Terminal] Selected agent not found:', selectedAgentId);
      return;
    }

    // Session ID matching agent wrapper convention
    const sessionId = `agent-session-${agent.id}`;

    // Session should already exist (created on AGENT_CONNECTED)
    // If it doesn't, create it now as fallback
    if (!sessions.has(sessionId)) {
      console.warn('[Terminal] Session not found, creating fallback:', sessionId);
      createSession(
        sessionId,
        agent.id,
        `Monitoring ${agent.name || agent.id}`
      );
    }

    // Set as active session
    setActiveSession(sessionId);
    console.log(`[Terminal] Switched to session: ${sessionId}`);

    // Cleanup: Don't clear session on unmount to preserve history
  }, [selectedAgentId, setActiveSession, sessions, agents, createSession]);

  // Handle agent selection
  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(selectedAgentId === agentId ? null : agentId);
  };

  // Handle command execution - wrapped in useCallback to prevent terminal re-initialization
  const handleCommandExecution = useCallback(async (command: string) => {
    console.log('[AgentsPage] ==================== COMMAND EXECUTION START ====================');
    console.log('[AgentsPage] handleCommandExecution called with:', {
      command,
      commandLength: command.length,
      selectedAgentId,
      dashboardState,
      timestamp: new Date().toISOString()
    });

    if (!selectedAgentId || !command.trim()) {
      console.log('[AgentsPage] Aborting: No agent selected or empty command');
      return;
    }

    // Check WebSocket connection state
    if (dashboardState !== 'connected') {
      console.log('[AgentsPage] Aborting: WebSocket not connected');
      addNotification({
        title: 'Not Connected',
        description: 'WebSocket connection is not established. Please wait for connection.',
        type: 'warning',
      });
      return;
    }

    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent) {
      console.log('[AgentsPage] Aborting: Agent not found:', selectedAgentId);
      return;
    }

    console.log('[AgentsPage] Agent details:', {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status
    });

    try {
      // Use the monitoring session ID (don't create a new session)
      const sessionId = `agent-session-${agent.id}`;

      console.log(`[Terminal] Preparing to send command to agent ${agent.id}:`, command);
      console.log('[Terminal] WebSocket sendCommand params:', {
        agentId: agent.id,
        command,
        args: [],
        env: {},
        workingDirectory: undefined,
        priority: 'normal',
        dashboardState
      });

      // Send command via WebSocket using agent ID
      const result = await sendCommand(
        agent.id, // Use agent ID for proper routing
        command,
        [], // args
        {}, // env
        undefined, // workingDirectory
        'normal' // priority
      );

      console.log('[Terminal] sendCommand completed, result:', result);

      // Stay on the same monitoring session to see all output
      // The terminal output will be received via WebSocket and displayed in the current session

      console.log(`[Terminal] Command sent successfully to ${agent.id}`);
      console.log('[AgentsPage] ==================== COMMAND EXECUTION END ====================');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addNotification({
        title: 'Command Failed',
        description: errorMessage,
        type: 'error',
      });
      console.error('[Terminal] Failed to send command:', error);
      console.error('[Terminal] Error details:', {
        error,
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      console.log('[AgentsPage] ==================== COMMAND EXECUTION FAILED ====================');
    }
  }, [selectedAgentId, agents, sendCommand, addNotification, dashboardState]);

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
              {/* Connection status indicator */}
              {dashboardState !== 'connected' && (
                <Badge variant={dashboardState === 'connecting' ? 'secondary' : 'destructive'}>
                  {dashboardState === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </Badge>
              )}
            </div>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 p-4">
            {(() => {
              if (!selectedAgentId) {
                return (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <div className="text-6xl mb-4">🖥️</div>
                      <h3 className="text-lg font-medium mb-2">No Agent Selected</h3>
                      <p className="text-sm">
                        Click on an agent from the left panel to view its terminal output
                      </p>
                    </div>
                  </div>
                );
              }

              const selectedAgent = agents.find(a => a.id === selectedAgentId);

              // Show appropriate message for offline/error agents
              if (!selectedAgent || selectedAgent.status === 'offline' || selectedAgent.status === 'error') {
                return (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <div className="text-6xl mb-4">⚠️</div>
                      <h3 className="text-lg font-medium mb-2">Agent Offline</h3>
                      <p className="text-sm">
                        {selectedAgent?.name || 'This agent'} is currently offline and cannot produce terminal output
                      </p>
                      <p className="text-xs mt-2">
                        Status: <Badge variant="secondary">{selectedAgent?.status || 'unknown'}</Badge>
                      </p>
                    </div>
                  </div>
                );
              }

              // Show connecting message
              if (selectedAgent.status === 'connecting') {
                return (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <div className="text-6xl mb-4">🔄</div>
                      <h3 className="text-lg font-medium mb-2">Agent Connecting</h3>
                      <p className="text-sm">
                        {selectedAgent.name} is establishing connection...
                      </p>
                      <p className="text-xs mt-2">
                        Terminal will be available once connected
                      </p>
                    </div>
                  </div>
                );
              }

              // Only render terminal for online agents
              return (
                <TerminalViewer
                  agentId={selectedAgentId}
                  className="h-full"
                  readOnly={false}
                  onCommand={handleCommandExecution}
                />
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}