'use client';

import { useState, useCallback } from 'react';
import {
  AlertTriangle,
  StopCircle,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAgentStore, Agent } from '@/stores/agent-store';
import { useCommandStore } from '@/stores/command-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

interface EmergencyStopProps {
  className?: string;
  variant?: 'button' | 'card' | 'inline';
  size?: 'sm' | 'default' | 'lg';
}

interface StopOperation {
  id: string;
  agentId: string;
  agentName: string;
  status: 'pending' | 'stopping' | 'stopped' | 'failed';
  startTime: Date;
  endTime?: Date;
  error?: string;
  commandsStopped?: number;
}

export default function EmergencyStop({
  className,
  variant = 'button',
  size = 'default'
}: EmergencyStopProps) {
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const [operations, setOperations] = useState<StopOperation[]>([]);
  const [isStopping, setIsStopping] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const { agents, updateAgentStatus, getOnlineAgents, getAgentsByStatus } = useAgentStore();
  const { getRunningCommands, updateCommand } = useCommandStore();
  const { addNotification, openModal } = useUIStore();

  const onlineAgents = getOnlineAgents();
  const runningCommands = getRunningCommands();
  const busyAgents = getAgentsByStatus('online').filter(
    agent => runningCommands.some(cmd => cmd.agentId === agent.id)
  );

  const executeEmergencyStop = useCallback(async (agentIds: string[]) => {
    setIsStopping(true);
    setShowProgress(true);

    const selectedAgents = agents.filter(agent => agentIds.includes(agent.id));
    const newOperations: StopOperation[] = selectedAgents.map(agent => ({
      id: `stop-${agent.id}-${Date.now()}`,
      agentId: agent.id,
      agentName: agent.name,
      status: 'pending',
      startTime: new Date(),
      commandsStopped: 0
    }));

    setOperations(newOperations);

    // Sequential stop operations to avoid overwhelming the system
    for (const operation of newOperations) {
      try {
        // Update operation status
        setOperations(prev => prev.map(op =>
          op.id === operation.id
            ? { ...op, status: 'stopping' }
            : op
        ));

        // Stop all running commands for this agent
        const agentCommands = runningCommands.filter(cmd => cmd.agentId === operation.agentId);
        let commandsStopped = 0;

        for (const command of agentCommands) {
          try {
            // Simulate command cancellation
            await new Promise(resolve => setTimeout(resolve, 200));
            updateCommand(command.id, {
              status: 'cancelled',
              completedAt: new Date().toISOString()
            });
            commandsStopped++;
          } catch (error) {
            console.warn(`Failed to stop command ${command.id}:`, error);
          }
        }

        // Stop the agent
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate agent stop
        updateAgentStatus(operation.agentId, 'offline');

        // Update operation as completed
        setOperations(prev => prev.map(op =>
          op.id === operation.id
            ? {
                ...op,
                status: 'stopped',
                endTime: new Date(),
                commandsStopped
              }
            : op
        ));

        addNotification({
          title: 'Agent Stopped',
          description: `${operation.agentName} has been stopped (${commandsStopped} commands cancelled)`,
          type: 'success',
        });

      } catch (error) {
        // Update operation as failed
        setOperations(prev => prev.map(op =>
          op.id === operation.id
            ? {
                ...op,
                status: 'failed',
                endTime: new Date(),
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            : op
        ));

        addNotification({
          title: 'Stop Failed',
          description: `Failed to stop ${operation.agentName}`,
          type: 'error',
        });
      }

      // Small delay between operations
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsStopping(false);

    const successCount = newOperations.filter(op =>
      operations.find(o => o.id === op.id)?.status === 'stopped'
    ).length;

    if (successCount === selectedAgents.length) {
      addNotification({
        title: 'Emergency Stop Complete',
        description: `Successfully stopped ${successCount} agent(s)`,
        type: 'success',
      });
    } else {
      addNotification({
        title: 'Emergency Stop Partial',
        description: `Stopped ${successCount}/${selectedAgents.length} agents`,
        type: 'warning',
      });
    }

    // Auto-close progress dialog after a delay
    setTimeout(() => {
      setShowProgress(false);
      setOperations([]);
    }, 3000);

  }, [agents, runningCommands, updateAgentStatus, updateCommand, addNotification, operations]);

  const handleEmergencyStop = useCallback((agentIds?: string[]) => {
    const targetAgents = agentIds || onlineAgents.map(agent => agent.id);

    if (targetAgents.length === 0) {
      addNotification({
        title: 'No Agents Online',
        description: 'No agents are currently running',
        type: 'warning',
      });
      return;
    }

    const affectedAgents = agents.filter(agent => targetAgents.includes(agent.id));
    const totalCommands = runningCommands.filter(cmd =>
      targetAgents.includes(cmd.agentId)
    ).length;

    openModal({
      title: 'Confirm Emergency Stop',
      content: (
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium">This will immediately stop:</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>• {affectedAgents.length} agent(s)</li>
                <li>• {totalCommands} running command(s)</li>
              </ul>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
            <div className="flex">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 mr-2" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Warning
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  Any unsaved work or ongoing operations will be lost. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Agents to stop:</p>
            <div className="space-y-1">
              {affectedAgents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span className="font-medium">{agent.name}</span>
                  <Badge variant="outline">{agent.type}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      onConfirm: () => executeEmergencyStop(targetAgents),
      confirmText: 'Emergency Stop',
      cancelText: 'Cancel',
      variant: 'destructive'
    });
  }, [onlineAgents, agents, runningCommands, openModal, executeEmergencyStop, addNotification]);

  const handleSingleAgentStop = useCallback((agent: Agent) => {
    const agentCommands = runningCommands.filter(cmd => cmd.agentId === agent.id);

    openModal({
      title: `Stop ${agent.name}`,
      content: (
        <div className="space-y-4">
          <p>Are you sure you want to stop this agent?</p>

          <div className="bg-muted p-3 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Agent:</span>
              <span className="font-medium">{agent.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="outline">{agent.type}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Running commands:</span>
              <Badge variant="secondary">{agentCommands.length}</Badge>
            </div>
          </div>

          {agentCommands.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {agentCommands.length} running command(s) will be cancelled.
              </p>
            </div>
          )}
        </div>
      ),
      onConfirm: () => executeEmergencyStop([agent.id]),
      confirmText: 'Stop Agent',
      cancelText: 'Cancel',
      variant: 'destructive'
    });
  }, [runningCommands, openModal, executeEmergencyStop]);

  const formatDuration = useCallback((start: Date, end?: Date) => {
    const endTime = end || new Date();
    const duration = endTime.getTime() - start.getTime();
    return `${(duration / 1000).toFixed(1)}s`;
  }, []);

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span>Emergency Stop</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Online Agents</p>
              <p className="font-medium">{onlineAgents.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Running Commands</p>
              <p className="font-medium">{runningCommands.length}</p>
            </div>
          </div>

          {busyAgents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Busy Agents:</p>
              <div className="space-y-1">
                {busyAgents.map(agent => (
                  <div key={agent.id} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-sm">{agent.name}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleSingleAgentStop(agent)}
                    >
                      Stop
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="destructive"
            className="w-full"
            onClick={() => handleEmergencyStop()}
            disabled={onlineAgents.length === 0 || isStopping}
          >
            <StopCircle className="h-4 w-4 mr-2" />
            {isStopping ? 'Stopping...' : 'Emergency Stop All'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn("flex items-center space-x-2", className)}>
        {onlineAgents.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {onlineAgents.length} online
          </Badge>
        )}
        {runningCommands.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {runningCommands.length} running
          </Badge>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size={size}
              disabled={onlineAgents.length === 0 || isStopping}
            >
              <StopCircle className={cn(
                "mr-1",
                size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
              )} />
              Stop All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>Emergency Stop Confirmation</span>
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will stop all {onlineAgents.length} online agents and cancel {runningCommands.length} running commands. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleEmergencyStop()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Emergency Stop
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Default button variant
  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            size={size}
            className={className}
            disabled={onlineAgents.length === 0 || isStopping}
          >
            <StopCircle className={cn(
              "mr-2",
              size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
            )} />
            {isStopping ? 'Stopping...' : 'Emergency Stop'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span>Emergency Stop Confirmation</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will stop all {onlineAgents.length} online agents and cancel {runningCommands.length} running commands.
              Any unsaved work will be lost. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleEmergencyStop()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Emergency Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Progress Dialog */}
      <Dialog open={showProgress} onOpenChange={setShowProgress}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <span>Emergency Stop in Progress</span>
            </DialogTitle>
            <DialogDescription>
              Stopping agents and cancelling running commands...
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-96">
            <div className="space-y-3">
              {operations.map(operation => {
                const StatusIcon = {
                  pending: Clock,
                  stopping: RefreshCw,
                  stopped: CheckCircle,
                  failed: XCircle
                }[operation.status];

                const statusColor = {
                  pending: 'text-muted-foreground',
                  stopping: 'text-blue-500',
                  stopped: 'text-green-500',
                  failed: 'text-red-500'
                }[operation.status];

                return (
                  <Card key={operation.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <StatusIcon className={cn(
                            "h-4 w-4",
                            statusColor,
                            operation.status === 'stopping' && 'animate-spin'
                          )} />
                          <div>
                            <p className="font-medium">{operation.agentName}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {operation.status}
                              {operation.commandsStopped !== undefined &&
                                ` • ${operation.commandsStopped} commands cancelled`
                              }
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={operation.status === 'failed' ? 'destructive' : 'outline'}>
                            {formatDuration(operation.startTime, operation.endTime)}
                          </Badge>
                        </div>
                      </div>
                      {operation.error && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
                          Error: {operation.error}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>

          {!isStopping && operations.length > 0 && (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setShowProgress(false);
                  setOperations([]);
                }}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}