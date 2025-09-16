import { createClient } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';
import { Database } from '../types/database';
import { AgentModel, Agent, AgentInsert, AgentUpdate } from '../models/agent';
import { CommandModel } from '../models/command';
import { EventEmitter } from 'events';

export interface AgentServiceEvents {
  'agent:connected': (agent: Agent) => void;
  'agent:disconnected': (agent: Agent) => void;
  'agent:status-changed': (agent: Agent, oldStatus: string) => void;
  'agent:heartbeat': (agentId: string) => void;
}

export class AgentService extends EventEmitter {
  private agentModel: AgentModel;
  private commandModel: CommandModel;
  private activeConnections: Map<string, { agentId: string; connectionId: string }>;
  private heartbeatTimers: Map<string, NodeJS.Timeout>;

  constructor(
    private supabase: ReturnType<typeof createClient<Database>>,
    private fastify: FastifyInstance
  ) {
    super();
    this.agentModel = new AgentModel(supabase);
    this.commandModel = new CommandModel(supabase);
    this.activeConnections = new Map();
    this.heartbeatTimers = new Map();
  }

  async getAllAgents(filters?: { status?: string; type?: string }) {
    return this.agentModel.findAll(filters);
  }

  async getAgent(id: string) {
    return this.agentModel.findById(id);
  }

  async createAgent(data: AgentInsert) {
    const agent = await this.agentModel.create({
      ...data,
      status: 'offline',
      created_at: new Date().toISOString(),
    });

    this.fastify.log.info({ agentId: agent.id }, 'Agent created');
    return agent;
  }

  async updateAgent(id: string, updates: AgentUpdate) {
    const oldAgent = await this.agentModel.findById(id);
    const updatedAgent = await this.agentModel.update(id, updates);

    if (oldAgent && updates.status && oldAgent.status !== updates.status) {
      this.emit('agent:status-changed', updatedAgent, oldAgent.status);
    }

    this.fastify.log.info({ agentId: id, updates }, 'Agent updated');
    return updatedAgent;
  }

  async deleteAgent(id: string) {
    // Cancel any active commands
    const activeCommands = await this.commandModel.getActiveCommands(id);
    for (const command of activeCommands || []) {
      await this.commandModel.updateStatus(command.id, 'cancelled', null, 'Agent deleted');
    }

    await this.agentModel.delete(id);
    this.fastify.log.info({ agentId: id }, 'Agent deleted');
    return true;
  }

  async connectAgent(agentId: string, connectionId: string, metadata?: any) {
    // Update agent status
    await this.agentModel.update(agentId, {
      status: 'online',
      last_ping: new Date().toISOString(),
      metadata: {
        ...metadata,
        connectionId,
      },
    });

    // Store connection mapping
    this.activeConnections.set(connectionId, { agentId, connectionId });

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring(agentId);

    const agent = await this.agentModel.findById(agentId);
    if (agent) {
      this.emit('agent:connected', agent);
    }

    this.fastify.log.info({ agentId, connectionId }, 'Agent connected');
    return agent;
  }

  async disconnectAgent(connectionId: string) {
    const connection = this.activeConnections.get(connectionId);
    if (!connection) {
      return null;
    }

    const { agentId } = connection;

    // Update agent status
    await this.agentModel.updateStatus(agentId, 'offline');

    // Stop heartbeat monitoring
    this.stopHeartbeatMonitoring(agentId);

    // Remove connection
    this.activeConnections.delete(connectionId);

    // Cancel any active commands
    const activeCommands = await this.commandModel.getActiveCommands(agentId);
    for (const command of activeCommands || []) {
      await this.commandModel.updateStatus(command.id, 'cancelled', null, 'Agent disconnected');
    }

    const agent = await this.agentModel.findById(agentId);
    if (agent) {
      this.emit('agent:disconnected', agent);
    }

    this.fastify.log.info({ agentId, connectionId }, 'Agent disconnected');
    return agent;
  }

  async handleHeartbeat(agentId: string, metrics?: any) {
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
        const avgExecutionTime = await this.commandModel.calculateAverageExecutionTime(agent.id);

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
      for (const [connectionId, connection] of this.activeConnections.entries()) {
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
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    this.heartbeatTimers.clear();

    // Disconnect all agents
    for (const connectionId of this.activeConnections.keys()) {
      await this.disconnectAgent(connectionId);
    }
  }
}