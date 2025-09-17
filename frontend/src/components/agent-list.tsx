'use client';

import { useEffect, useState, useMemo } from 'react';
import { Users, Circle, AlertTriangle, CheckCircle, XCircle, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentStore } from '@/stores/agent.store';
import { useWebSocketStore } from '@/stores/websocket.store';
import { cn } from '@/lib/utils';
import AgentCard from './agents/agent-card';

export interface AgentListProps {
  className?: string;
  onAgentSelect?: (agentId: string) => void;
  showOffline?: boolean;
  viewMode?: 'cards' | 'list';
  maxHeight?: string | number;
}

export function AgentList({
  className,
  onAgentSelect,
  showOffline = true,
  viewMode = 'cards',
  maxHeight = 'auto'
}: AgentListProps) {
  const {
    agents,
    selectedAgentId,
    selectAgent,
    getOnlineAgents,
    getOfflineAgents,
    getAgentsByStatus,
    isLoading,
    error
  } = useAgentStore();

  const { isConnected, connectionState } = useWebSocketStore();
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'error'>('all');

  const onlineAgents = getOnlineAgents();
  const offlineAgents = getOfflineAgents();
  const errorAgents = getAgentsByStatus('error');

  const filteredAgents = useMemo(() => {
    switch (filterStatus) {
      case 'online':
        return onlineAgents;
      case 'offline':
        return offlineAgents;
      case 'error':
        return errorAgents;
      default:
        return showOffline ? agents : onlineAgents;
    }
  }, [agents, onlineAgents, offlineAgents, errorAgents, filterStatus, showOffline]);

  const handleAgentClick = (agentId: string) => {
    selectAgent(agentId);
    if (onAgentSelect) {
      onAgentSelect(agentId);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <Circle className="h-2 w-2 fill-green-500 text-green-500" />;
      case 'busy':
        return <Circle className="h-2 w-2 fill-yellow-500 text-yellow-500" />;
      case 'error':
        return <Circle className="h-2 w-2 fill-red-500 text-red-500" />;
      default:
        return <Circle className="h-2 w-2 fill-gray-400 text-gray-400" />;
    }
  };

  const getAgentHealth = (agent: any) => {
    const cpuUsage = agent.metrics?.cpuUsage || 0;
    const memoryUsage = agent.metrics?.memoryUsage || 0;

    if (agent.status === 'error') return 'error';
    if (cpuUsage > 90 || memoryUsage > 90) return 'critical';
    if (cpuUsage > 70 || memoryUsage > 70) return 'warning';
    return 'healthy';
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={cn('border-destructive', className)}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-destructive font-medium">Failed to load agents</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!isConnected && connectionState !== 'connecting') {
    return (
      <Card className={cn('border-muted', className)}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Activity className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground font-medium">Waiting for connection</p>
          <p className="text-sm text-muted-foreground">Agent list will update when connected</p>
        </CardContent>
      </Card>
    );
  }

  if (filteredAgents.length === 0) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Users className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground font-medium">No agents found</p>
          <p className="text-sm text-muted-foreground">
            {filterStatus !== 'all' ? `No ${filterStatus} agents` : 'No agents configured'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="flex items-center space-x-1">
            <Users className="h-3 w-3" />
            <span>{agents.length} Total</span>
          </Badge>
          <Badge variant="default" className="flex items-center space-x-1">
            <CheckCircle className="h-3 w-3" />
            <span>{onlineAgents.length} Online</span>
          </Badge>
          {errorAgents.length > 0 && (
            <Badge variant="destructive" className="flex items-center space-x-1">
              <XCircle className="h-3 w-3" />
              <span>{errorAgents.length} Error</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-1">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('all')}
          >
            All
          </Button>
          <Button
            variant={filterStatus === 'online' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('online')}
          >
            Online
          </Button>
          {showOffline && (
            <Button
              variant={filterStatus === 'offline' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterStatus('offline')}
            >
              Offline
            </Button>
          )}
          {errorAgents.length > 0 && (
            <Button
              variant={filterStatus === 'error' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterStatus('error')}
            >
              Error
            </Button>
          )}
        </div>
      </div>

      {/* Agent List */}
      <ScrollArea
        className={cn('', viewMode === 'list' ? '' : 'pr-4')}
        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        {viewMode === 'cards' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => handleAgentClick(agent.id)}
                className="cursor-pointer"
              >
                <AgentCard
                  agent={agent}
                  isSelected={selectedAgentId === agent.id}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAgents.map((agent) => (
              <Card
                key={agent.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  selectedAgentId === agent.id && 'border-primary'
                )}
                onClick={() => handleAgentClick(agent.id)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(agent.status)}
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                        <span>{agent.type}</span>
                        {agent.version && (
                          <>
                            <span>•</span>
                            <span>v{agent.version}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {agent.metrics && (
                      <div className="text-xs text-right">
                        <div>CPU: {agent.metrics.cpuUsage}%</div>
                        <div>MEM: {agent.metrics.memoryUsage}%</div>
                      </div>
                    )}
                    <Badge
                      variant={
                        getAgentHealth(agent) === 'healthy'
                          ? 'default'
                          : getAgentHealth(agent) === 'warning'
                          ? 'secondary'
                          : getAgentHealth(agent) === 'critical'
                          ? 'destructive'
                          : 'outline'
                      }
                    >
                      {getAgentHealth(agent)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Real-time Update Indicator */}
      {isConnected && (
        <div className="flex items-center justify-center">
          <div className="flex items-center space-x-1.5 text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>Real-time updates active</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentList;