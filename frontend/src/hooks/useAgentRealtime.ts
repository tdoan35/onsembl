/**
 * Agent Realtime Subscription Hook
 * Subscribes to Supabase Realtime changes on the agents table for redundant real-time updates
 *
 * This provides a second layer of real-time synchronization in addition to WebSocket messages,
 * ensuring UI updates even if WebSocket messages are missed or delayed.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAgentStore } from '@/stores/agent-store';
import type { Agent } from '@/stores/agent-store';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface UseAgentRealtimeOptions {
  /**
   * Enable detailed logging for debugging
   */
  enableLogging?: boolean;

  /**
   * Custom error handler
   */
  onError?: (error: Error) => void;

  /**
   * Callback when subscription is established
   */
  onSubscribed?: () => void;

  /**
   * Callback when subscription fails or disconnects
   */
  onDisconnected?: () => void;
}

/**
 * Subscribe to real-time updates from the agents table
 *
 * Usage:
 * ```tsx
 * function AgentsPage() {
 *   const { isSubscribed, error } = useAgentRealtime({
 *     enableLogging: true
 *   });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useAgentRealtime(options: UseAgentRealtimeOptions = {}) {
  const {
    enableLogging = false,
    onError,
    onSubscribed,
    onDisconnected
  } = options;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const { updateAgent, addAgent, removeAgent } = useAgentStore();

  const isSubscribedRef = useRef(false);
  const errorRef = useRef<Error | null>(null);

  useEffect(() => {
    if (enableLogging) {
      console.log('[useAgentRealtime] Initializing Supabase Realtime subscription');
    }

    // Create Realtime channel for agents table
    const channel = supabase
      .channel('agents-realtime-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents'
        },
        (payload) => {
          if (enableLogging) {
            console.log('[useAgentRealtime] Received database change:', payload);
          }

          try {
            if (payload.eventType === 'INSERT') {
              handleInsert(payload.new);
            } else if (payload.eventType === 'UPDATE') {
              handleUpdate(payload.new);
            } else if (payload.eventType === 'DELETE') {
              handleDelete(payload.old);
            }
          } catch (error) {
            const err = error instanceof Error ? error : new Error('Unknown error processing realtime event');
            errorRef.current = err;

            console.error('[useAgentRealtime] Error processing realtime event:', error);

            if (onError) {
              onError(err);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;

          if (enableLogging) {
            console.log('[useAgentRealtime] Successfully subscribed to agents table changes');
          }

          if (onSubscribed) {
            onSubscribed();
          }
        } else if (status === 'CLOSED') {
          isSubscribedRef.current = false;

          if (enableLogging) {
            console.log('[useAgentRealtime] Subscription closed');
          }

          if (onDisconnected) {
            onDisconnected();
          }
        } else if (status === 'CHANNEL_ERROR') {
          isSubscribedRef.current = false;
          const error = new Error('Realtime channel error');
          errorRef.current = error;

          console.error('[useAgentRealtime] Realtime channel error');

          if (onError) {
            onError(error);
          }

          if (onDisconnected) {
            onDisconnected();
          }
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (enableLogging) {
        console.log('[useAgentRealtime] Cleaning up Supabase Realtime subscription');
      }

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      isSubscribedRef.current = false;
    };
  }, [enableLogging, onError, onSubscribed, onDisconnected]);

  /**
   * Handle agent insertion
   */
  function handleInsert(record: any) {
    if (!record || !record.id) {
      console.warn('[useAgentRealtime] Invalid INSERT payload:', record);
      return;
    }

    const agent = mapDatabaseRecordToAgent(record);

    if (enableLogging) {
      console.log('[useAgentRealtime] Agent inserted:', agent);
    }

    addAgent(agent);
  }

  /**
   * Handle agent update
   */
  function handleUpdate(record: any) {
    if (!record || !record.id) {
      console.warn('[useAgentRealtime] Invalid UPDATE payload:', record);
      return;
    }

    const agent = mapDatabaseRecordToAgent(record);

    if (enableLogging) {
      console.log('[useAgentRealtime] Agent updated:', agent);
    }

    // Use updateAgent which does a partial update
    updateAgent(agent.id, {
      status: agent.status,
      name: agent.name,
      type: agent.type,
      version: agent.version,
      capabilities: agent.capabilities,
      lastPing: agent.lastPing,
      metrics: agent.metrics,
      error: agent.error
    });
  }

  /**
   * Handle agent deletion
   */
  function handleDelete(record: any) {
    if (!record || !record.id) {
      console.warn('[useAgentRealtime] Invalid DELETE payload:', record);
      return;
    }

    if (enableLogging) {
      console.log('[useAgentRealtime] Agent deleted:', record.id);
    }

    removeAgent(record.id);
  }

  /**
   * Map database record to Agent type
   */
  function mapDatabaseRecordToAgent(record: any): Agent {
    // Map database status (lowercase) to agent store status
    let status: Agent['status'] = 'offline';
    const dbStatus = record.status?.toLowerCase();

    if (dbStatus === 'online') status = 'online';
    else if (dbStatus === 'offline') status = 'offline';
    else if (dbStatus === 'error') status = 'error';
    else if (dbStatus === 'connecting') status = 'connecting';

    // Map database type to agent store type
    let type: Agent['type'] = 'claude';
    const dbType = record.type?.toLowerCase();

    if (dbType === 'claude') type = 'claude';
    else if (dbType === 'gemini') type = 'gemini';
    else if (dbType === 'codex') type = 'codex';

    return {
      id: record.id,
      name: record.name || `Agent ${record.id.substring(0, 8)}`,
      type,
      status,
      version: record.version || 'unknown',
      capabilities: record.capabilities || [],
      lastPing: record.last_ping || record.updated_at || new Date().toISOString(),
      metrics: record.metadata?.metrics || undefined,
      error: record.metadata?.lastError || undefined
    };
  }

  return {
    isSubscribed: isSubscribedRef.current,
    error: errorRef.current,
    channel: channelRef.current
  };
}
