/**
 * Agent Config Manager
 * Manages persistent agent identity configuration stored in ~/.onsembl/agent-config.json
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { pino } from 'pino';

export interface AgentConfig {
  id: string;
  name?: string | undefined;
  type: string;
  createdAt: string;
  lastUsed: string;
  metadata: {
    hostMachine: string;
    platform: string;
  };
}

export interface AgentConfigFile {
  version: string;
  defaultAgent: string | null;
  agents: Record<string, AgentConfig>;
}

export interface GetOrCreateOptions {
  name?: string | undefined;
  agentId?: string | undefined;
}

export interface AgentIdentity {
  id: string;
  name?: string | undefined;
  isNew: boolean;
}

/**
 * AgentConfigManager
 *
 * Handles persistent agent identity storage in ~/.onsembl/agent-config.json
 * Enables agents to maintain stable identities across restarts
 */
export class AgentConfigManager {
  private configDir: string;
  private configPath: string;
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.configDir = path.join(os.homedir(), '.onsembl');
    this.configPath = path.join(this.configDir, 'agent-config.json');
    this.logger = logger || pino({
      name: 'agent-config-manager',
      level: process.env['LOG_LEVEL'] || 'info'
    });
  }

  /**
   * Get or create a stable agent ID
   *
   * Strategy:
   * 1. If specific agentId provided, use it (multi-agent support)
   * 2. Otherwise, use default agent if exists
   * 3. If no default, create new agent and set as default
   */
  async getOrCreateAgentId(
    agentType: string,
    options?: GetOrCreateOptions
  ): Promise<AgentIdentity> {
    await this.ensureConfigDir();
    const config = await this.loadConfig();

    // If specific agentId provided, use it
    if (options?.agentId && config.agents[options.agentId]) {
      const agent = config.agents[options.agentId];
      if (!agent) {
        throw new Error(`Agent ${options.agentId} not found in config`);
      }

      agent.lastUsed = new Date().toISOString();
      await this.saveConfig(config);

      this.logger.info({
        agentId: agent.id,
        name: agent.name
      }, 'Using specified agent ID');

      return {
        id: agent.id,
        name: agent.name ?? undefined,
        isNew: false
      };
    }

    // Use default agent if exists
    if (config.defaultAgent && config.agents[config.defaultAgent]) {
      const agent = config.agents[config.defaultAgent];
      if (!agent) {
        throw new Error(`Default agent ${config.defaultAgent} not found in config`);
      }

      // Update last used timestamp
      agent.lastUsed = new Date().toISOString();

      // Update name if provided in options
      if (options?.name && options.name !== agent.name) {
        const oldName = agent.name;
        agent.name = options.name;
        this.logger.info({
          agentId: agent.id,
          oldName,
          newName: options.name
        }, 'Updated agent name');
      }

      await this.saveConfig(config);

      this.logger.info({
        agentId: agent.id,
        name: agent.name
      }, 'Using existing default agent');

      return {
        id: agent.id,
        name: agent.name ?? undefined,
        isNew: false
      };
    }

    // Create new agent
    const newAgentId = this.generateStableId(agentType);
    const newAgent: AgentConfig = {
      id: newAgentId,
      name: options?.name ?? undefined,
      type: agentType,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      metadata: {
        hostMachine: os.hostname(),
        platform: os.platform()
      }
    };

    config.agents[newAgentId] = newAgent;
    config.defaultAgent = newAgentId;
    await this.saveConfig(config);

    this.logger.info({
      agentId: newAgentId,
      name: options?.name,
      type: agentType
    }, 'Created new agent identity');

    return {
      id: newAgentId,
      name: options?.name ?? undefined,
      isNew: true
    };
  }

  /**
   * Update agent name
   */
  async updateAgentName(agentId: string, name: string): Promise<void> {
    const config = await this.loadConfig();

    if (!config.agents[agentId]) {
      throw new Error(`Agent ${agentId} not found in config`);
    }

    const oldName = config.agents[agentId].name;
    config.agents[agentId].name = name;
    await this.saveConfig(config);

    this.logger.info({
      agentId,
      oldName,
      newName: name
    }, 'Agent name updated');
  }

  /**
   * List all configured agents
   */
  async listAgents(): Promise<AgentConfig[]> {
    const config = await this.loadConfig();
    return Object.values(config.agents).sort((a, b) => {
      // Sort by last used, most recent first
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    });
  }

  /**
   * Get the default agent ID
   */
  async getDefaultAgentId(): Promise<string | null> {
    const config = await this.loadConfig();
    return config.defaultAgent;
  }

  /**
   * Set the default agent
   */
  async setDefaultAgent(agentId: string): Promise<void> {
    const config = await this.loadConfig();

    if (!config.agents[agentId]) {
      throw new Error(`Agent ${agentId} not found in config`);
    }

    config.defaultAgent = agentId;
    await this.saveConfig(config);

    this.logger.info({ agentId }, 'Default agent updated');
  }

  /**
   * Delete agent from config
   * Note: This only removes from local config, not from backend database
   */
  async deleteAgent(agentId: string): Promise<void> {
    const config = await this.loadConfig();

    if (!config.agents[agentId]) {
      throw new Error(`Agent ${agentId} not found in config`);
    }

    const deletedAgent = config.agents[agentId];
    delete config.agents[agentId];

    // If deleted agent was default, pick a new default
    if (config.defaultAgent === agentId) {
      const remainingAgents = Object.keys(config.agents);
      config.defaultAgent = remainingAgents.length > 0 ? (remainingAgents[0] ?? null) : null;
    }

    await this.saveConfig(config);

    this.logger.info({
      agentId,
      name: deletedAgent.name,
      newDefault: config.defaultAgent
    }, 'Agent deleted from config');
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<AgentConfig | null> {
    const config = await this.loadConfig();
    return config.agents[agentId] || null;
  }

  /**
   * Check if config file exists
   */
  configExists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Get config file path for debugging
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Generate a stable agent ID
   * Format: {type}-{timestamp-base36}-{random}
   * Example: mock-l8x9k2-abc123def
   */
  private generateStableId(agentType: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 11);
    return `${agentType}-${timestamp}-${random}`;
  }

  /**
   * Ensure config directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.access(this.configDir);
    } catch {
      await fs.mkdir(this.configDir, { recursive: true });
      this.logger.info({ configDir: this.configDir }, 'Created config directory');
    }
  }

  /**
   * Load config from file
   */
  private async loadConfig(): Promise<AgentConfigFile> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);

      // Validate version
      if (parsed.version !== '1.0.0') {
        this.logger.warn({
          version: parsed.version
        }, 'Unknown config version, attempting to use anyway');
      }

      // Ensure defaultAgent is null (not undefined)
      return {
        ...parsed,
        defaultAgent: parsed.defaultAgent ?? null
      };
    } catch (error) {
      // Config doesn't exist yet, return empty structure
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug('Config file not found, will create new one');
        return {
          version: '1.0.0',
          defaultAgent: null,
          agents: {}
        };
      }

      // Invalid JSON or other error
      this.logger.error({ error }, 'Failed to load config file');
      throw new Error(`Failed to load agent config: ${error}`);
    }
  }

  /**
   * Save config to file
   */
  private async saveConfig(config: AgentConfigFile): Promise<void> {
    try {
      const json = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, json, 'utf-8');
      this.logger.debug({ configPath: this.configPath }, 'Config saved successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to save config file');
      throw new Error(`Failed to save agent config: ${error}`);
    }
  }
}
