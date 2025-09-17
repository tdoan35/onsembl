'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StopCircle, AlertTriangle } from 'lucide-react';
import { useWebSocketStore } from '@/stores/websocket';
import { useToast } from '@/hooks/use-toast';
import { MessageType } from '@onsembl/agent-protocol';

export function EmergencyStop() {
  const [isLoading, setIsLoading] = useState(false);
  const { sendMessage } = useWebSocketStore();
  const { toast } = useToast();

  const handleEmergencyStop = async () => {
    setIsLoading(true);

    try {
      // Send emergency stop to all agents
      sendMessage({
        type: MessageType.EMERGENCY_STOP,
        payload: {
          reason: 'User initiated emergency stop',
          force: true,
        },
        timestamp: Date.now(),
      });

      toast({
        title: 'Emergency Stop Activated',
        description: 'All agents have been stopped and queued commands cancelled.',
        variant: 'destructive',
      });
    } catch (error) {
      console.error('Emergency stop failed:', error);
      toast({
        title: 'Emergency Stop Failed',
        description: 'Failed to stop all agents. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          disabled={isLoading}
          className="gap-2"
        >
          <StopCircle className="h-4 w-4" />
          Emergency Stop
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Emergency Stop
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action will immediately stop all running agents and cancel all queued commands.
            This cannot be undone. Are you sure you want to proceed?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEmergencyStop}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Stop All Agents
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}