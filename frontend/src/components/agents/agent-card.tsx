'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  MoreVertical,
  Play,
  Square,
  RotateCcw,
  Cpu,
  Memory,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Agent, AgentStatus, useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

interface AgentCardProps {
  agent: Agent;
  compact?: boolean;
}

const statusConfig: Record<AgentStatus, {
  color: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  icon: React.ComponentType<{ className?: string }>;
}> = {
  online: {
    color: 'text-green-600',
    variant: 'success',
    icon: Activity
  },
  offline: {
    color: 'text-gray-500',
    variant: 'secondary',
    icon: Square
  },
  error: {
    color: 'text-red-600',
    variant: 'destructive',
    icon: AlertCircle
  },
  connecting: {
    color: 'text-yellow-600',
    variant: 'warning',
    icon: RotateCcw
  },
};

export default function AgentCard({ agent, compact = false }: AgentCardProps) {
  const { updateAgentStatus, removeAgent } = useAgentStore();
  const { addNotification, setLoading } = useUIStore();
  const [lastPingTime, setLastPingTime] = useState<string>('');

  const statusInfo = statusConfig[agent.status];
  const StatusIcon = statusInfo.icon;

  // Format last ping time
  useEffect(() => {
    const updatePingTime = () => {
      if (agent.lastPing) {
        const pingTime = new Date(agent.lastPing);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - pingTime.getTime()) / 1000);

        if (diffInSeconds < 60) {
          setLastPingTime(`${diffInSeconds}s ago`);
        } else if (diffInSeconds < 3600) {
          setLastPingTime(`${Math.floor(diffInSeconds / 60)}m ago`);
        } else {
          setLastPingTime(`${Math.floor(diffInSeconds / 3600)}h ago`);
        }
      }
    };

    updatePingTime();
    const interval = setInterval(updatePingTime, 1000);
    return () => clearInterval(interval);
  }, [agent.lastPing]);

  const handleStart = async () => {
    setLoading(`agent-${agent.id}`, true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateAgentStatus(agent.id, 'connecting');
      setTimeout(() => updateAgentStatus(agent.id, 'online'), 2000);

      addNotification({
        title: 'Agent Started',
        description: `${agent.name} is starting up`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Start Failed',
        description: `Failed to start ${agent.name}`,
        type: 'error',
      });
    } finally {
      setLoading(`agent-${agent.id}`, false);
    }
  };

  const handleStop = async () => {
    setLoading(`agent-${agent.id}`, true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      updateAgentStatus(agent.id, 'offline');

      addNotification({
        title: 'Agent Stopped',
        description: `${agent.name} has been stopped`,
        type: 'info',
      });
    } catch (error) {
      addNotification({
        title: 'Stop Failed',
        description: `Failed to stop ${agent.name}`,
        type: 'error',
      });
    } finally {
      setLoading(`agent-${agent.id}`, false);
    }
  };

  const handleRestart = async () => {
    setLoading(`agent-${agent.id}`, true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      updateAgentStatus(agent.id, 'connecting');
      setTimeout(() => updateAgentStatus(agent.id, 'online'), 2000);

      addNotification({
        title: 'Agent Restarted',
        description: `${agent.name} is restarting`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Restart Failed',
        description: `Failed to restart ${agent.name}`,
        type: 'error',
      });
    } finally {
      setLoading(`agent-${agent.id}`, false);
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (compact) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <StatusIcon className={cn("h-5 w-5", statusInfo.color)} />
              <div>
                <h3 className="font-medium">{agent.name}</h3>
                <p className="text-sm text-muted-foreground capitalize">{agent.type}</p>
              </div>
            </div>
            <Badge variant={statusInfo.variant} className="capitalize">
              {agent.status}
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <StatusIcon className={cn("h-8 w-8", statusInfo.color)} />
              {agent.status === 'connecting' && (
                <div className="absolute inset-0 animate-spin">
                  <RotateCcw className="h-8 w-8 text-yellow-600" />
                </div>
              )}
            </div>
            <div>
              <CardTitle className="text-lg">{agent.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {agent.type.charAt(0).toUpperCase() + agent.type.slice(1)} • v{agent.version}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={statusInfo.variant} className="capitalize">
              {agent.status}
            </Badge>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Agent Actions - {agent.name}</DialogTitle>
                  <DialogDescription>
                    Manage {agent.name} agent operations
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  {agent.status === 'offline' && (
                    <Button
                      onClick={handleStart}
                      className="w-full justify-start"
                      variant="outline"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Agent
                    </Button>
                  )}
                  {agent.status === 'online' && (
                    <Button
                      onClick={handleStop}
                      className="w-full justify-start"
                      variant="outline"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Stop Agent
                    </Button>
                  )}
                  <Button
                    onClick={handleRestart}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restart Agent
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Last Ping</p>
            <p className="font-medium">{lastPingTime || 'Never'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Capabilities</p>
            <p className="font-medium">{agent.capabilities.length} features</p>
          </div>
        </div>

        {/* Error Display */}
        {agent.error && (
          <div className="p-3 border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Error</p>
                <p className="text-sm text-red-700 dark:text-red-300">{agent.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Metrics */}
        {agent.metrics && agent.status === 'online' && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Performance Metrics</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Uptime</span>
                </div>
                <p className="text-sm font-medium">
                  {formatUptime(agent.metrics.uptime)}
                </p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <Memory className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Memory</span>
                </div>
                <p className="text-sm font-medium">
                  {formatBytes(agent.metrics.memoryUsage)}
                </p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <Cpu className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">CPU</span>
                </div>
                <p className="text-sm font-medium">
                  {agent.metrics.cpuUsage.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Commands executed */}
            <div className="pt-2 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Commands Executed</span>
                <span className="text-sm font-medium">{agent.metrics.commandsExecuted}</span>
              </div>
            </div>
          </div>
        )}

        {/* Capabilities */}
        {agent.capabilities.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Capabilities</h4>
            <div className="flex flex-wrap gap-1">
              {agent.capabilities.slice(0, 6).map((capability) => (
                <Badge key={capability} variant="outline" className="text-xs">
                  {capability}
                </Badge>
              ))}
              {agent.capabilities.length > 6 && (
                <Badge variant="outline" className="text-xs">
                  +{agent.capabilities.length - 6} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}