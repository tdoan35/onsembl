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
  HardDrive,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Agent, AgentStatus, useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import { deleteAgent } from '@/services/agent-api.service';

interface AgentCardProps {
  agent: Agent;
  compact?: boolean;
  onToggleExpand?: () => void;
}

const statusConfig: Record<AgentStatus, {
  color: string;
  dotColor: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  icon: any;
}> = {
  online: {
    color: 'text-success',
    dotColor: 'bg-green-500',
    variant: 'success',
    icon: Activity
  },
  offline: {
    color: 'text-gray-500',
    dotColor: 'bg-gray-400',
    variant: 'secondary',
    icon: Square
  },
  error: {
    color: 'text-destructive',
    dotColor: 'bg-red-500',
    variant: 'destructive',
    icon: AlertCircle
  },
  connecting: {
    color: 'text-secondary',
    dotColor: 'bg-yellow-500',
    variant: 'warning',
    icon: RotateCcw
  },
};

// Agent type colors for avatar backgrounds
const agentTypeColors: Record<string, string> = {
  claude: 'bg-purple-500',
  gemini: 'bg-blue-500',
  codex: 'bg-green-500',
};

export default function AgentCard({ agent, compact = false, onToggleExpand }: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const { updateAgentStatus, removeAgent } = useAgentStore();
  const { addNotification, setLoading } = useUIStore();
  const [lastPingTime, setLastPingTime] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const statusInfo = statusConfig[agent.status];
  const StatusIcon = statusInfo.icon;
  const avatarBgColor = agentTypeColors[agent.type] || 'bg-gray-500';
  const agentInitial = agent.name.charAt(0).toUpperCase();

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

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAgent(agent.id);
      removeAgent(agent.id);
      addNotification({
        title: 'Agent Deleted',
        description: `${agent.name} has been removed`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete agent',
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
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

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (onToggleExpand) {
      onToggleExpand();
    }
  };

  return (
    <Card className="w-full hover:shadow-md transition-shadow">
      {/* Header - Always visible */}
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarFallback className={cn(avatarBgColor, "text-white font-semibold")}>
                  {agentInitial}
                </AvatarFallback>
              </Avatar>
              <div className={cn(
                "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                statusInfo.dotColor,
                agent.status === 'connecting' && "animate-pulse"
              )} />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">{agent.name}</h3>
              <p className="text-sm text-muted-foreground capitalize">{agent.type} • v{agent.version}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={statusInfo.variant} className="capitalize">
              {agent.status}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleExpand}
              className="h-8 w-8"
              title={isExpanded ? "Collapse details" : "Expand details"}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
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
                  {agent.status === 'offline' && (
                    <Button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full justify-start text-destructive hover:text-destructive"
                      variant="outline"
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Agent
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Expanded Content - Only visible when expanded */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t space-y-4">
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
              <div className="p-3 border border-destructive/20 bg-destructive/10 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Error</p>
                    <p className="text-sm text-destructive/80">{agent.error}</p>
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
                      <HardDrive className="h-3 w-3 text-muted-foreground" />
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
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{agent.name}&quot; and all associated command history, traces, and logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Agent'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}