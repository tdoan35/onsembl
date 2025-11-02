import { createClient } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';
import { Database } from '../types/database';
import { AgentModel, Agent, AgentInsert, AgentUpdate } from '../models/agent';
import { CommandModel } from '../models/command';
import { AuditLogModel, AuditEventType, AuditEntityType } from '../models/audit-log';
import { validate as validateUuid } from 'uuid';
import { EventEmitter } from 'events';

export interface AgentServiceEvents {
  'agent:connected': (agent: Agent) => void;
  'agent:disconnected': (agent: Agent) => void;
  'agent:status-changed': (agent: Agent, oldStatus: string) => void;
  'agent:heartbeat': (agentId: string) => void;
}

/**
 * AgentService - Comprehensive agent orchestration service for Onsembl.ai
 *
 * Implements T078 requirements:
 * - CRUD operations for agents with dependency injection
 * - Real-time status broadcasting via Supabase Realtime
 * - Heartbeat tracking and automatic disconnection handling
 * - Integration with audit logging for key events
 * - WebSocket connection lifecycle management
 */
export class AgentService extends EventEmitter {
  private agentModel: AgentModel;
  private commandModel: CommandModel;
  private auditLogModel: AuditLogModel;
  private activeConnections: Map<string, { agentId: string; connectionId: string }>;
  private heartbeatTimers: Map<string, NodeJS.Timeout>;
  private realtimeChannels: Map<string, any>;
  private isRealtimeConnected: boolean;

  constructor(
    private supabase: ReturnType<typeof createClient<Database>> | null,
    private fastify: FastifyInstance
  ) {
    super();
    this.agentModel = new AgentModel(supabase!);
    this.commandModel = new CommandModel(supabase as any);
    this.auditLogModel = new AuditLogModel(supabase as any);
    this.activeConnections = new Map();
    this.heartbeatTimers = new Map();
    this.realtimeChannels = new Map();
    this.isRealtimeConnected = false;

    // Only setup realtime if Supabase is available
    if (this.supabase) {
      this.setupRealtimeBroadcasting();
    } else {
      this.fastify.log.warn('Supabase client not available, running in mock mode');
    }
  }

  private sanitizeUserId(userId?: string): string | null {
    if (!userId) return null;
    return validateUuid(userId) ? userId : null;
  }

  /**
   * Register a new agent in the system
   * @param data Agent data to register
   * @param userId Optional user ID for audit logging
   * @param requestMetadata Optional request metadata for audit logging
   * @returns Newly registered agent
   */
  async registerAgent(
    data: AgentInsert,
    userId?: string,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ) {
    try {
      const agent = await this.agentModel.create({
        ...data,
        status: 'offline',
        created_at: new Date().toISOString(),
      });

      // Create audit log entry
      await this.auditLogModel.logEvent(
        'AGENT_CONNECTED' as AuditEventType,
        'AGENT' as AuditEntityType,
        agent.id,
        this.sanitizeUserId(userId),
        {
          name: agent.name,
          type: agent.type,
          version: agent.version,
          capabilities: agent.capabilities,
        },
        requestMetadata
      );

      // Broadcast agent registration to all connected dashboards
      await this.broadcastAgentStatusChange(agent as any, 'registered');

      this.fastify.log.info({ agentId: agent.id, name: agent.name }, 'Agent registered');
      return agent;
    } catch (error) {
      this.fastify.log.error({ error, data }, 'Failed to register agent');
      throw error;
    }
  }

  /**
   * Get list of all agents with optional filtering
   * @param filters Optional filters for agents
   * @returns Array of agents matching filters
   */
  async listAgents(filters?: {
    user_id?: string;
    status?: string;
    type?: string;
    connected?: boolean;
    limit?: number;
    offset?: number;
  }) {
    try {
      // Extract userId from filters, use null if not provided (service role query for all agents)
      const userId = filters?.user_id || null;

      return await this.agentModel.findAll(userId, {
        status: filters?.status as any,
        type: filters?.type as any,
        connected: filters?.connected,
      });
    } catch (error) {
      this.fastify.log.error({ error, filters }, 'Failed to list agents');
      throw error;
    }
  }

  /**
   * Get a specific agent by ID
   * @param id Agent ID to retrieve
   * @returns Agent data or null if not found
   */
  async getAgent(id: string) {
    try {
      return await this.agentModel.findById(id);
    } catch (error) {
      this.fastify.log.error({ error, agentId: id }, 'Failed to get agent');
      throw error;
    }
  }

  /**
   * Get an agent by its unique name (user-scoped)
   */
  async getAgentByName(userId: string, name: string) {
    try {
      return await this.agentModel.findByName(userId, name);
    } catch (error) {
      this.fastify.log.error({ error, userId, name }, 'Failed to get agent by name');
      throw error;
    }
  }

  /**
   * Legacy method for compatibility
   * @deprecated Use registerAgent instead
   */
  async createAgent(data: AgentInsert) {
    return this.registerAgent(data);
  }

  /**
   * Legacy method for compatibility
   * @deprecated Use listAgents instead
   */
  async getAllAgents(filters?: { status?: string; type?: string }) {
    return this.listAgents(filters);
  }

  /**
   * Update agent status and broadcast changes
   * @param id Agent ID to update
   * @param status New status to set
   * @param userId Optional user ID for audit logging
   * @param requestMetadata Optional request metadata for audit logging
   * @returns Updated agent
   */
  async updateAgentStatus(
    id: string,
    status: Agent['status'],
    userId?: string,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ) {
    try {
      const oldAgent = await this.agentModel.findById(id);
      const updatedAgent = await this.agentModel.updateStatus(id, status);

      // Create audit log entry for status change
      await this.auditLogModel.logEvent(
        'AGENT_DISCONNECTED' as AuditEventType, // Use appropriate event type based on status
        'AGENT' as AuditEntityType,
        id,
        userId,
        {
          old_status: oldAgent.status,
          new_status: status,
          name: oldAgent.name,
          type: oldAgent.type,
        },
        requestMetadata
      );

      // Broadcast status change
      await this.broadcastAgentStatusChange(updatedAgent as any, 'status_changed');
      this.emit('agent:status-changed', updatedAgent, oldAgent.status);

      this.fastify.log.info({ agentId: id, oldStatus: oldAgent.status, newStatus: status }, 'Agent status updated');
      return updatedAgent;
    } catch (error) {
      this.fastify.log.error({ error, agentId: id, status }, 'Failed to update agent status');
      throw error;
    }
  }

  /**
   * Update agent data with audit logging and broadcasting
   * @param id Agent ID to update
   * @param updates Updates to apply
   * @param userId Optional user ID for audit logging
   * @param requestMetadata Optional request metadata for audit logging
   * @returns Updated agent
   */
  async updateAgent(
    id: string,
    updates: AgentUpdate,
    userId?: string,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ) {
    try {
      const oldAgent = await this.agentModel.findById(id);
      const updatedAgent = await this.agentModel.update(id, updates);

      // Create audit log entry
      await this.auditLogModel.logEvent(
        'CONFIG_UPDATED' as AuditEventType,
        'AGENT' as AuditEntityType,
        id,
        userId,
        {
          updates: updates,
          old_data: {
            name: oldAgent.name,
            type: oldAgent.type,
            status: oldAgent.status,
            version: oldAgent.version,
          },
        },
        requestMetadata
      );

      if (oldAgent && updates.status && oldAgent.status !== updates.status) {
        await this.broadcastAgentStatusChange(updatedAgent as any, 'status_changed');
        this.emit('agent:status-changed', updatedAgent, oldAgent.status);
      }

      this.fastify.log.info({ agentId: id, updates }, 'Agent updated');
      return updatedAgent;
    } catch (error) {
      this.fastify.log.error({ error, agentId: id, updates }, 'Failed to update agent');
      throw error;
    }
  }

  async deleteAgent(id: string, userId?: string) {
    // Verify ownership if userId provided
    if (userId) {
      const agent = await this.agentModel.findById(id);
      if (agent.user_id !== userId) {
        throw new Error('Unauthorized: Cannot delete agent owned by another user');
      }
    }

    // Cancel any active commands
    const runningCommands = await this.commandModel.getRunningCommands(id);
    const queuedCommands = await this.commandModel.getQueuedCommands(id);
    const activeCommands = [...(runningCommands || []), ...(queuedCommands || [])];

    for (const command of activeCommands) {
      await this.commandModel.cancel(command.id);
    }

    await this.agentModel.delete(id);
    this.fastify.log.info({ agentId: id, userId }, 'Agent deleted successfully');
    return true;
  }

  /**
   * Connect an agent and establish WebSocket connection
   * @param agentId Agent ID to connect
   * @param connectionId WebSocket connection ID
   * @param userId Optional user ID for audit logging
   * @param metadata Optional connection metadata
   * @param requestMetadata Optional request metadata for audit logging
   * @returns Connected agent
   */
  async connectAgent(
    agentId: string,
    connectionId: string,
    userId?: string,
    metadata?: any,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ) {
    try {
      // Update agent status
      await this.agentModel.update(agentId, {
        status: 'online',
        last_ping: new Date().toISOString(),
        metadata: {
          ...metadata,
          connectionId,
          connectedAt: new Date().toISOString(),
        },
      });

      // Store connection mapping
      this.activeConnections.set(connectionId, { agentId, connectionId });

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring(agentId);

      const agent = await this.agentModel.findById(agentId);

      // Create audit log entry
      await this.auditLogModel.logEvent(
        'AGENT_CONNECTED' as AuditEventType,
        'AGENT' as AuditEntityType,
        agentId,
        this.sanitizeUserId(userId),
        {
          connection_id: connectionId,
          metadata: metadata,
          name: agent.name,
          type: agent.type,
        },
        requestMetadata
      );

      // Broadcast connection event
      await this.broadcastAgentStatusChange(agent as any, 'connected');
      this.emit('agent:connected', agent);

      this.fastify.log.info({ agentId, connectionId, agentName: agent.name }, 'Agent connected');
      return agent;
    } catch (error) {
      this.fastify.log.error({ error, agentId, connectionId }, 'Failed to connect agent');
      throw error;
    }
  }

  /**
   * Disconnect an agent and clean up resources
   * @param connectionId WebSocket connection ID to disconnect
   * @param userId Optional user ID for audit logging
   * @param reason Optional reason for disconnection
   * @param requestMetadata Optional request metadata for audit logging
   * @returns Disconnected agent or null if not found
   */
  async disconnectAgent(
    connectionId: string,
    userId?: string,
    reason?: string,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ) {
    const connection = this.activeConnections.get(connectionId);
    if (!connection) {
      return null;
    }

    const { agentId } = connection;

    try {
      // Get agent info before disconnect
      const agent = await this.agentModel.findById(agentId);

      // Update agent status
      await this.agentModel.updateStatus(agentId, 'offline');

      // Stop heartbeat monitoring
      this.stopHeartbeatMonitoring(agentId);

      // Remove connection
      this.activeConnections.delete(connectionId);

      // Cancel any active commands
      const runningCommands = await this.commandModel.getRunningCommands(agentId);
      const queuedCommands = await this.commandModel.getQueuedCommands(agentId);
      const activeCommands = [...(runningCommands || []), ...(queuedCommands || [])];

      for (const command of activeCommands) {
        await this.commandModel.cancel(command.id);
      }

      // Create audit log entry
      await this.auditLogModel.logEvent(
        'AGENT_DISCONNECTED' as AuditEventType,
        'AGENT' as AuditEntityType,
        agentId,
        this.sanitizeUserId(userId),
        {
          connection_id: connectionId,
          reason: reason || 'Normal disconnection',
          name: agent.name,
          type: agent.type,
          active_commands_cancelled: activeCommands?.length || 0,
        },
        requestMetadata
      );

      // Broadcast disconnection event
      await this.broadcastAgentStatusChange(agent as any, 'disconnected');
      this.emit('agent:disconnected', agent);

      this.fastify.log.info({
        agentId,
        connectionId,
        agentName: agent.name,
        reason: reason || 'Normal disconnection'
      }, 'Agent disconnected');

      return agent;
    } catch (error) {
      this.fastify.log.error({ error, agentId, connectionId }, 'Failed to disconnect agent');
      throw error;
    }
  }

  /**
   * Restart an agent by disconnecting and requesting reconnection
   * @param agentId Agent ID to restart
   * @param userId Optional user ID for audit logging
   * @param requestMetadata Optional request metadata for audit logging
   * @returns Restarted agent status
   */
  async restartAgent(
    agentId: string,
    userId?: string,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ) {
    try {
      const agent = await this.agentModel.findById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Find the active connection for this agent
      let connectionId: string | null = null;
      for (const [connId, conn] of this.activeConnections.entries()) {
        if (conn.agentId === agentId) {
          connectionId = connId;
          break;
        }
      }

      // Send restart command to agent
      if (connectionId) {
        const connection = this.activeConnections.get(connectionId);
        if (connection?.ws) {
          // Send restart command
          const restartMessage = JSON.stringify({
            type: 'AGENT_CONTROL',
            payload: {
              action: 'restart',
              gracefulTimeout: 5000,
            },
            timestamp: Date.now(),
          });
          connection.ws.send(restartMessage);

          // Mark as restarting
          await this.agentModel.updateStatus(agentId, 'restarting');

          // Log audit event
          await this.auditLogModel.logEvent(
            'AGENT_DISCONNECTED' as AuditEventType,
            'AGENT' as AuditEntityType,
            agentId,
            this.sanitizeUserId(userId),
            {
              action: 'restart',
              name: agent.name,
              type: agent.type,
              previous_status: agent.status,
            },
            requestMetadata
          );

          // Schedule check for reconnection
          setTimeout(async () => {
            const updatedAgent = await this.agentModel.findById(agentId);
            if (updatedAgent.status === 'restarting') {
              // If still restarting after timeout, mark as offline
              await this.agentModel.updateStatus(agentId, 'offline');
              this.emit('agent:restart-failed', updatedAgent);
            }
          }, 10000); // 10 second timeout

          this.fastify.log.info({ agentId, connectionId }, 'Agent restart initiated');
          return { status: 'restarting', agentId };
        }
      }

      // Agent is offline, just return current status
      this.fastify.log.warn({ agentId }, 'Cannot restart offline agent');
      return { status: 'offline', agentId, error: 'Agent is not connected' };
    } catch (error) {
      this.fastify.log.error({ error, agentId }, 'Failed to restart agent');
      throw error;
    }
  }

  /**
   * Handle agent heartbeat (legacy method for backward compatibility)
   * @param agentId Agent ID sending heartbeat
   * @param metrics Optional performance metrics
   * @returns Heartbeat acknowledgment
   */
  async handleHeartbeat(agentId: string, metrics?: any) {
    try {
      await this.agentModel.updateLastPing(agentId);

      if (metrics) {
        await this.agentModel.update(agentId, {
          metadata: {
            metrics,
            lastHeartbeat: new Date().toISOString(),
          },
        });
      }

      this.emit('agent:heartbeat', agentId);
      this.resetHeartbeatTimer(agentId);

      return { acknowledged: true, serverTime: new Date().toISOString() };
    } catch (error) {
      this.fastify.log.error({ error, agentId }, 'Failed to handle heartbeat');
      throw error;
    }
  }

  async getAgentByConnectionId(connectionId: string) {
    const connection = this.activeConnections.get(connectionId);
    if (!connection) {
      return null;
    }

    return this.agentModel.findById(connection.agentId);
  }

  async getOnlineAgents() {
    return this.agentModel.getOnlineAgents();
  }

  async getAgentHealth(id: string) {
    return this.agentModel.checkHealth(id);
  }

  async getAgentStats() {
    const [statusCounts, onlineAgents] = await Promise.all([
      this.agentModel.countByStatus(),
      this.agentModel.getOnlineAgents(),
    ]);

    const agentStats = await Promise.all(
      (onlineAgents || []).map(async (agent) => {
        const commandStats = await this.commandModel.getCommandStats(agent.id);
        // Note: calculateAverageExecutionTime method not available in current CommandModel
        const avgExecutionTime = null;

        return {
          agentId: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          commandStats,
          avgExecutionTime,
        };
      })
    );

    return {
      totalAgents: Object.values(statusCounts || {}).reduce((sum, count) => sum + count, 0),
      statusCounts,
      agentStats,
      activeConnections: this.activeConnections.size,
    };
  }

  private startHeartbeatMonitoring(agentId: string) {
    // Clear any existing timer
    this.stopHeartbeatMonitoring(agentId);

    // Set up new timer (90 seconds timeout)
    const timer = setTimeout(async () => {
      this.fastify.log.warn({ agentId }, 'Agent heartbeat timeout');

      // Mark agent as offline
      await this.agentModel.updateStatus(agentId, 'offline');

      // Find and disconnect the connection
      for (const [connectionId, connection] of Array.from(this.activeConnections.entries())) {
        if (connection.agentId === agentId) {
          await this.disconnectAgent(connectionId);
          break;
        }
      }
    }, 90000);

    this.heartbeatTimers.set(agentId, timer);
  }

  private stopHeartbeatMonitoring(agentId: string) {
    const timer = this.heartbeatTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimers.delete(agentId);
    }
  }

  private resetHeartbeatTimer(agentId: string) {
    this.startHeartbeatMonitoring(agentId);
  }

  async cleanup() {
    // Clear all heartbeat timers
    for (const timer of Array.from(this.heartbeatTimers.values())) {
      clearTimeout(timer);
    }
    this.heartbeatTimers.clear();

    // Disconnect all agents
    for (const connectionId of Array.from(this.activeConnections.keys())) {
      await this.disconnectAgent(connectionId);
    }

    // Unsubscribe from all realtime channels
    for (const [channelName, channel] of this.realtimeChannels.entries()) {
      try {
        await channel.unsubscribe();
        this.fastify.log.debug({ channelName }, 'Unsubscribed from realtime channel');
      } catch (error) {
        this.fastify.log.error({ error, channelName }, 'Error unsubscribing from realtime channel');
      }
    }
    this.realtimeChannels.clear();

    this.fastify.log.info('AgentService cleanup completed');
  }

  /**
   * Set up real-time broadcasting for agent status changes
   * Uses Supabase Realtime to broadcast to all connected dashboards
   */
  private setupRealtimeBroadcasting() {
    if (!this.supabase) {
      this.fastify.log.warn('Skipping realtime setup - Supabase not available');
      return;
    }

    // Create a dedicated channel for agent status updates
    const agentStatusChannel = this.supabase
      .channel('agent_status_updates')
      .on('broadcast', { event: 'agent_change' }, (payload) => {
        this.fastify.log.debug({ payload }, 'Received agent status broadcast');
        this.emit('agent:realtime-update', payload);
      })
      .on('presence', { event: 'sync' }, () => {
        this.fastify.log.debug('Agent presence sync');
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.fastify.log.debug({ key, newPresences }, 'Agent presence join');
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.fastify.log.debug({ key, leftPresences }, 'Agent presence leave');
      });

    // Store channel reference
    this.realtimeChannels.set('agent_status', agentStatusChannel);

    // Subscribe to database changes
    const dbChangesChannel = this.supabase
      .channel('agent_db_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents',
        },
        async (payload) => {
          this.fastify.log.debug({ payload }, 'Agent database change detected');

          if (payload.eventType === 'UPDATE' && payload.new) {
            const agent = payload.new as Agent;
            await this.broadcastAgentStatusChange(agent, 'updated');
            this.emit('agent:db-update', agent);
          } else if (payload.eventType === 'INSERT' && payload.new) {
            const agent = payload.new as Agent;
            await this.broadcastAgentStatusChange(agent, 'created');
            this.emit('agent:db-insert', agent);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const agent = payload.old as Agent;
            await this.broadcastAgentStatusChange(agent, 'deleted');
            this.emit('agent:db-delete', agent);
          }
        }
      );

    // Store channel reference
    this.realtimeChannels.set('agent_db_changes', dbChangesChannel);

    // Subscribe to channels
    agentStatusChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.fastify.log.info('Successfully subscribed to agent status channel');
        this.isRealtimeConnected = true;
      } else if (status === 'CLOSED') {
        this.fastify.log.warn('Agent status channel closed');
        this.isRealtimeConnected = false;
      } else if (status === 'CHANNEL_ERROR') {
        this.fastify.log.error('Agent status channel error');
        this.isRealtimeConnected = false;
      }
    });

    dbChangesChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.fastify.log.info('Successfully subscribed to agent database changes');
      } else if (status === 'CLOSED') {
        this.fastify.log.warn('Agent database changes channel closed');
      } else if (status === 'CHANNEL_ERROR') {
        this.fastify.log.error('Agent database changes channel error');
      }
    });

    // Set up connection monitoring
    this.setupRealtimeConnectionMonitoring();

    this.fastify.log.info('Enhanced real-time agent status broadcasting setup complete');
  }

  /**
   * Set up real-time connection monitoring and recovery
   */
  private setupRealtimeConnectionMonitoring() {
    // Monitor connection health every 30 seconds
    setInterval(() => {
      this.checkRealtimeHealth();
    }, 30000);

    // Set up presence tracking for this service instance
    const servicePresence = this.supabase
      .channel('service_presence')
      .on('presence', { event: 'sync' }, () => {
        const state = servicePresence.presenceState();
        this.fastify.log.debug({ state }, 'Service presence sync');
      });

    // Subscribe first, then track this service instance
    servicePresence.subscribe();

    // Track this service instance after subscribing
    servicePresence.track({
      service: 'agent-service',
      instance_id: process.env['INSTANCE_ID'] || 'default',
      started_at: new Date().toISOString(),
      version: process.env['npm_package_version'] || '1.0.0',
    });
    this.realtimeChannels.set('service_presence', servicePresence);
  }

  /**
   * Check realtime connection health and reconnect if needed
   */
  private async checkRealtimeHealth() {
    if (!this.isRealtimeConnected) {
      this.fastify.log.warn('Realtime connection lost, attempting to reconnect...');

      // Unsubscribe from all channels
      for (const [name, channel] of this.realtimeChannels.entries()) {
        try {
          await channel.unsubscribe();
        } catch (error) {
          this.fastify.log.error({ error, channel: name }, 'Error unsubscribing from channel');
        }
      }

      // Clear channels map
      this.realtimeChannels.clear();

      // Re-setup realtime broadcasting
      this.setupRealtimeBroadcasting();
    }
  }

  /**
   * Subscribe to agent presence updates
   */
  async subscribeToAgentPresence(agentId: string): Promise<void> {
    const presenceChannel = this.supabase
      .channel(`agent_presence_${agentId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        this.emit('agent:presence-sync', { agentId, state });
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.emit('agent:presence-join', { agentId, key, newPresences });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.emit('agent:presence-leave', { agentId, key, leftPresences });
      });

    await presenceChannel.subscribe();
    this.realtimeChannels.set(`agent_presence_${agentId}`, presenceChannel);
  }

  /**
   * Update agent presence in realtime
   */
  async updateAgentPresence(agentId: string, presence: any): Promise<void> {
    const channel = this.realtimeChannels.get(`agent_presence_${agentId}`);
    if (channel) {
      await channel.track({
        agent_id: agentId,
        last_seen: new Date().toISOString(),
        ...presence,
      });
    }
  }

  /**
   * Broadcast agent status changes to all connected dashboards
   * @param agent Agent that changed
   * @param changeType Type of change (connected, disconnected, status_changed, etc.)
   */
  private async broadcastAgentStatusChange(agent: Agent, changeType: string) {
    try {
      // Create the broadcast payload
      const payload = {
        type: 'AGENT_STATUS_CHANGE',
        changeType,
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          last_ping: agent.last_ping,
          metadata: agent.metadata,
          updated_at: agent.updated_at,
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast via Supabase Realtime to the 'agent_status' channel
      const channel = this.supabase.channel('agent_status');
      await channel.send({
        type: 'broadcast',
        event: 'agent_change',
        payload,
      });

      this.fastify.log.debug({
        agentId: agent.id,
        changeType,
        status: agent.status
      }, 'Broadcasted agent status change');
    } catch (error) {
      this.fastify.log.error({
        error,
        agentId: agent.id,
        changeType
      }, 'Failed to broadcast agent status change');
    }
  }

  /**
   * Enhanced heartbeat handling with metrics tracking
   * @param agentId Agent ID sending heartbeat
   * @param metrics Optional performance metrics
   * @param userId Optional user ID for audit logging
   * @returns Heartbeat acknowledgment
   */
  async handleHeartbeatWithMetrics(
    agentId: string,
    metrics?: {
      cpuUsage?: number;
      memoryUsage?: number;
      uptime?: number;
      commandsProcessed?: number;
      averageResponseTime?: number;
      // Legacy snake_case support
      cpu_usage?: number;
      memory_usage?: number;
      active_commands?: number;
    },
    userId?: string
  ) {
    try {
      await this.agentModel.updateLastPing(agentId);

      if (metrics) {
        // Structure metrics according to new schema (support both camelCase and snake_case)
        const structuredMetrics = {
          commandsExecuted: metrics.commandsProcessed ?? metrics.active_commands ?? 0,
          uptime: metrics.uptime ?? 0,
          memoryUsage: metrics.memoryUsage ?? metrics.memory_usage ?? 0,
          cpuUsage: metrics.cpuUsage ?? metrics.cpu_usage ?? 0,
          lastUpdated: new Date().toISOString(),
        };

        // Get existing metadata and merge structured metrics
        const agent = await this.agentModel.findById(agentId);
        const existingMetadata = (agent.metadata as any) || {};

        await this.agentModel.update(agentId, {
          metadata: {
            ...existingMetadata,
            metrics: structuredMetrics,
            lastHeartbeat: new Date().toISOString(),
            // Keep legacy fields for backward compatibility
            memory_usage: structuredMetrics.memoryUsage,
            performance_metrics: {
              commands_executed: structuredMetrics.commandsExecuted,
              uptime: structuredMetrics.uptime,
              average_response_time: metrics.averageResponseTime ?? 0,
            },
          },
        });
      }

      // Emit heartbeat event for local listeners
      this.emit('agent:heartbeat', agentId);
      this.resetHeartbeatTimer(agentId);

      // Optionally log heartbeat in audit for debugging
      if (userId) {
        await this.auditLogModel.logEvent(
          'SYSTEM_STARTED' as AuditEventType, // Using available enum value
          'AGENT' as AuditEntityType,
          agentId,
          this.sanitizeUserId(userId),
          {
            event: 'heartbeat',
            metrics: metrics || {},
          }
        );
      }

      return {
        acknowledged: true,
        serverTime: new Date().toISOString(),
        nextHeartbeatExpected: new Date(Date.now() + 60000).toISOString(), // 60 seconds from now
      };
    } catch (error) {
      this.fastify.log.error({ error, agentId }, 'Failed to handle heartbeat');
      throw error;
    }
  }

  async updateHeartbeat(
    agentId: string,
    metrics?: {
      cpu_usage?: number;
      memory_usage?: number;
      active_commands?: number;
      uptime?: number;
    },
    userId?: string
  ) {
    return this.handleHeartbeatWithMetrics(agentId, metrics, userId);
  }

  /**
   * Get comprehensive agent statistics including health metrics
   * @returns Detailed statistics about all agents
   */
  async getDetailedAgentStats() {
    try {
      const [statusCounts, onlineAgents, staleAgents] = await Promise.all([
        this.agentModel.countByStatus(),
        this.agentModel.getOnlineAgents(),
        this.agentModel.getStaleAgents(2), // Agents stale for 2+ minutes
      ]);

      const agentStats = await Promise.all(
        (onlineAgents || []).map(async (agent) => {
          const commandStats = await this.commandModel.getCommandStats(agent.id);
          // Note: calculateAverageExecutionTime method not available in current CommandModel
          const avgExecutionTime = null;
          const health = await this.agentModel.checkHealth(agent.id);

          return {
            agentId: agent.id,
            name: agent.name,
            type: agent.type,
            status: agent.status,
            health: health,
            commandStats,
            avgExecutionTime,
            metadata: agent.metadata,
            last_ping: agent.last_ping,
          };
        })
      );

      return {
        totalAgents: Object.values(statusCounts || {}).reduce((sum, count) => sum + count, 0),
        statusCounts,
        agentStats,
        activeConnections: this.activeConnections.size,
        staleAgents: staleAgents?.length || 0,
        healthySummary: {
          healthy: agentStats.filter(a => a.health.healthy).length,
          unhealthy: agentStats.filter(a => !a.health.healthy).length,
          connected: agentStats.filter(a => a.health.connected).length,
        },
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Failed to get detailed agent stats');
      throw error;
    }
  }
}
