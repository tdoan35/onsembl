/**
 * Agent Heartbeat Monitor Service
 * Periodic scanner for detecting stale agents and marking them offline
 *
 * This is separate from WebSocket-level ping/pong monitoring.
 * It tracks AGENT_HEARTBEAT messages and detects crashed/hung agents.
 */

import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import { AgentService } from './agent.service.js';

export interface AgentHeartbeatConfig {
  // How often to scan for stale agents
  checkIntervalMs: number;
  // How long without heartbeat before marking offline
  heartbeatTimeoutMs: number;
  // Enable detailed logging
  enableLogging: boolean;
}

export interface StaleAgentInfo {
  agentId: string;
  lastHeartbeat: Date;
  timeSinceHeartbeat: number;
  agentName?: string;
}

/**
 * AgentHeartbeatMonitor
 *
 * Implements defense-in-depth heartbeat monitoring:
 * - Periodic scanning of all agents every 30 seconds
 * - Automatic detection of agents with missed heartbeats (>90s)
 * - Automatic offline marking and cleanup
 * - Event emission for monitoring and alerting
 */
export class AgentHeartbeatMonitor extends EventEmitter {
  private checkTimer?: NodeJS.Timeout;
  private isRunning = false;
  private staleAgentCount = 0;
  private lastCheckTime = 0;

  constructor(
    private server: FastifyInstance,
    private agentService: AgentService,
    private config: AgentHeartbeatConfig
  ) {
    super();
  }

  /**
   * Start the periodic heartbeat monitoring
   */
  start(): void {
    if (this.isRunning) {
      this.server.log.warn('Agent heartbeat monitor already running');
      return;
    }

    this.isRunning = true;
    this.startPeriodicCheck();

    this.server.log.info({
      checkInterval: this.config.checkIntervalMs,
      heartbeatTimeout: this.config.heartbeatTimeoutMs
    }, 'Agent heartbeat monitor started');

    this.emit('started');
  }

  /**
   * Stop the periodic heartbeat monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.stopPeriodicCheck();

    this.server.log.info('Agent heartbeat monitor stopped');
    this.emit('stopped');
  }

  /**
   * Manually trigger a stale agent check
   */
  async checkNow(): Promise<StaleAgentInfo[]> {
    return await this.checkForStaleAgents();
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    isRunning: boolean;
    staleAgentsDetected: number;
    lastCheckTime: number;
    timeSinceLastCheck: number;
    checkInterval: number;
    heartbeatTimeout: number;
  } {
    return {
      isRunning: this.isRunning,
      staleAgentsDetected: this.staleAgentCount,
      lastCheckTime: this.lastCheckTime,
      timeSinceLastCheck: this.lastCheckTime ? Date.now() - this.lastCheckTime : 0,
      checkInterval: this.config.checkIntervalMs,
      heartbeatTimeout: this.config.heartbeatTimeoutMs
    };
  }

  /**
   * Record heartbeat for an agent (called by agent service)
   */
  recordHeartbeat(agentId: string): void {
    if (this.config.enableLogging) {
      this.server.log.debug({ agentId }, 'Agent heartbeat recorded');
    }
    this.emit('heartbeatReceived', { agentId, timestamp: Date.now() });
  }

  /**
   * Start periodic checking timer
   */
  private startPeriodicCheck(): void {
    this.checkTimer = setInterval(() => {
      if (this.isRunning) {
        this.checkForStaleAgents().catch(error => {
          this.server.log.error({ error }, 'Error during stale agent check');
          this.emit('checkError', { error });
        });
      }
    }, this.config.checkIntervalMs);

    // Run initial check after 5 seconds
    setTimeout(() => {
      if (this.isRunning) {
        this.checkForStaleAgents().catch(error => {
          this.server.log.error({ error }, 'Error during initial stale agent check');
        });
      }
    }, 5000);
  }

  /**
   * Stop periodic checking timer
   */
  private stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Check all agents for stale heartbeats
   */
  private async checkForStaleAgents(): Promise<StaleAgentInfo[]> {
    this.lastCheckTime = Date.now();
    const staleAgents: StaleAgentInfo[] = [];

    try {
      // Get all online agents
      const onlineAgents = await this.agentService.getOnlineAgents();

      if (!onlineAgents || onlineAgents.length === 0) {
        if (this.config.enableLogging) {
          this.server.log.debug('No online agents to check');
        }
        this.emit('checkCompleted', { staleAgents: [], onlineAgents: 0 });
        return staleAgents;
      }

      this.server.log.debug({
        onlineAgentCount: onlineAgents.length
      }, 'Checking agents for stale heartbeats');

      const now = Date.now();

      for (const agent of onlineAgents) {
        if (!agent.last_ping) {
          // Agent has no last_ping timestamp - this means it was cleanly disconnected
          // and set to NULL by the disconnect handler. Skip it.
          this.server.log.debug({
            agentId: agent.id,
            agentName: agent.name
          }, 'Agent has NULL last_ping (cleanly disconnected), skipping staleness check');
          continue;
        }

        const lastHeartbeatTime = new Date(agent.last_ping).getTime();
        const timeSinceHeartbeat = now - lastHeartbeatTime;

        if (timeSinceHeartbeat > this.config.heartbeatTimeoutMs) {
          this.server.log.warn({
            agentId: agent.id,
            agentName: agent.name,
            lastHeartbeat: agent.last_ping,
            timeSinceHeartbeat: Math.round(timeSinceHeartbeat / 1000),
            timeoutSeconds: Math.round(this.config.heartbeatTimeoutMs / 1000)
          }, 'Stale agent detected - heartbeat timeout exceeded');

          staleAgents.push({
            agentId: agent.id,
            lastHeartbeat: new Date(agent.last_ping),
            timeSinceHeartbeat,
            agentName: agent.name
          });
        }
      }

      if (staleAgents.length > 0) {
        this.staleAgentCount += staleAgents.length;

        this.server.log.warn({
          staleAgentCount: staleAgents.length,
          staleAgentIds: staleAgents.map(a => a.agentId)
        }, 'Found stale agents, marking as offline');

        // Mark all stale agents as offline
        for (const staleAgent of staleAgents) {
          await this.markAgentOffline(staleAgent);
        }

        this.emit('staleAgentsDetected', {
          count: staleAgents.length,
          agents: staleAgents
        });
      } else {
        if (this.config.enableLogging) {
          this.server.log.debug({
            onlineAgentCount: onlineAgents.length
          }, 'All agents have recent heartbeats');
        }
      }

      this.emit('checkCompleted', {
        staleAgents: staleAgents.length,
        onlineAgents: onlineAgents.length,
        timestamp: now
      });

      return staleAgents;

    } catch (error) {
      this.server.log.error({ error }, 'Failed to check for stale agents');
      this.emit('checkError', { error });
      throw error;
    }
  }

  /**
   * Mark an agent as offline due to heartbeat timeout
   */
  private async markAgentOffline(staleAgent: StaleAgentInfo): Promise<void> {
    try {
      const { agentId, timeSinceHeartbeat } = staleAgent;

      this.server.log.info({
        agentId,
        agentName: staleAgent.agentName,
        timeSinceHeartbeat: Math.round(timeSinceHeartbeat / 1000)
      }, 'Marking stale agent as offline');

      // Update agent status to offline
      await this.agentService.updateAgent(agentId, {
        status: 'offline',
        disconnectedAt: new Date()
      });

      // Find and disconnect the connection if it exists
      const connections = (this.agentService as any).activeConnections;
      if (connections) {
        for (const [connectionId, connection] of Array.from(connections.entries())) {
          if ((connection as any).agentId === agentId) {
            await this.agentService.disconnectAgent(
              connectionId,
              undefined,
              'Heartbeat timeout'
            );
            break;
          }
        }
      }

      this.emit('agentMarkedOffline', {
        agentId,
        reason: 'heartbeat_timeout',
        timeSinceHeartbeat
      });

    } catch (error) {
      this.server.log.error({
        error,
        agentId: staleAgent.agentId
      }, 'Failed to mark agent as offline');

      this.emit('markOfflineError', {
        agentId: staleAgent.agentId,
        error
      });

      throw error;
    }
  }
}

/**
 * Create agent heartbeat monitor instance
 */
export function createAgentHeartbeatMonitor(
  server: FastifyInstance,
  agentService: AgentService,
  config?: Partial<AgentHeartbeatConfig>
): AgentHeartbeatMonitor {
  const defaultConfig: AgentHeartbeatConfig = {
    checkIntervalMs: 30000,      // Check every 30 seconds
    heartbeatTimeoutMs: 90000,   // 90 seconds timeout (3x heartbeat interval)
    enableLogging: false         // Disable debug logging by default
  };

  return new AgentHeartbeatMonitor(
    server,
    agentService,
    { ...defaultConfig, ...config }
  );
}
