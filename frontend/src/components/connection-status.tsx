'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWebSocketStore } from '@/stores/websocket.store';
import { cn } from '@/lib/utils';

export interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  onReconnect?: () => void;
}

export function ConnectionStatus({
  className,
  showDetails = true,
  onReconnect
}: ConnectionStatusProps) {
  const {
    isConnected,
    connectionState,
    error,
    reconnectAttempts,
    lastConnected,
    connect,
    disconnect
  } = useWebSocketStore();

  const [timeSinceDisconnect, setTimeSinceDisconnect] = useState<string>('');

  useEffect(() => {
    if (!isConnected && lastConnected) {
      const interval = setInterval(() => {
        const seconds = Math.floor((Date.now() - new Date(lastConnected).getTime()) / 1000);
        if (seconds < 60) {
          setTimeSinceDisconnect(`${seconds}s ago`);
        } else if (seconds < 3600) {
          const minutes = Math.floor(seconds / 60);
          setTimeSinceDisconnect(`${minutes}m ago`);
        } else {
          const hours = Math.floor(seconds / 3600);
          setTimeSinceDisconnect(`${hours}h ago`);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isConnected, lastConnected]);

  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected':
        return <Wifi className="h-4 w-4" />;
      case 'connecting':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <WifiOff className="h-4 w-4" />;
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return `Connecting${reconnectAttempts > 0 ? ` (Retry ${reconnectAttempts})` : ''}`;
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  const getStatusVariant = () => {
    switch (connectionState) {
      case 'connected':
        return 'default';
      case 'connecting':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const handleReconnectClick = () => {
    if (onReconnect) {
      onReconnect();
    } else {
      connect();
    }
  };

  const statusBadge = (
    <Badge
      variant={getStatusVariant() as any}
      className={cn(
        'flex items-center space-x-1.5 transition-all',
        className
      )}
    >
      {getStatusIcon()}
      <span>{getStatusText()}</span>
    </Badge>
  );

  if (!showDetails) {
    return statusBadge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center space-x-2">
            {statusBadge}
            {connectionState === 'disconnected' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReconnectClick}
                className="h-7 px-2"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-sm">
            <div className="font-semibold">WebSocket Status</div>
            {connectionState === 'connected' && (
              <div className="text-success">Active connection</div>
            )}
            {connectionState === 'connecting' && (
              <div className="text-secondary">
                {reconnectAttempts > 0
                  ? `Reconnection attempt ${reconnectAttempts}`
                  : 'Establishing connection...'}
              </div>
            )}
            {connectionState === 'disconnected' && lastConnected && (
              <div className="text-muted-foreground">
                Disconnected {timeSinceDisconnect}
              </div>
            )}
            {error && (
              <div className="text-destructive text-xs mt-1">
                Error: {error}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ConnectionStatus;