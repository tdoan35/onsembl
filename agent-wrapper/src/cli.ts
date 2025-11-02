#!/usr/bin/env node

import { Command } from 'commander';
import { EventEmitter } from 'events';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Config, loadConfig, getWebSocketUrl } from './config.js';
import { WebSocketClient, CommandMessage } from './websocket-client.js';
import { CommandExecutor, ExecutionResult } from './command-executor.js';
import { ReconnectionManager } from './reconnection.js';
import { ClaudeAgent } from './agents/claude.js';
import { GeminiAgent } from './agents/gemini.js';
import { CodexAgent } from './agents/codex.js';
import { MockAgent } from './agents/mock.js';
import { OutputChunk } from './stream-capture.js';
import { InteractiveAgentWrapper, InteractiveOptions } from './terminal/interactive-wrapper.js';
import { checkPtyAvailable } from './terminal/pty-manager.js';
import AuthManager from './auth/auth-manager.js';
import APIClient from './api/client.js';

// Package info
const packageJson = { name: 'onsembl-agent-wrapper', version: '1.0.0' };

// PID file for process management
const PID_FILE = join(process.cwd(), '.onsembl-agent.pid');
const STATUS_FILE = join(process.cwd(), '.onsembl-agent.status');

/**
 * Main agent wrapper application
 */
class AgentWrapper extends EventEmitter {
  private config: Config;
  private wsClient: WebSocketClient | null = null;
  private commandExecutor: CommandExecutor | null = null;
  private reconnectionManager: ReconnectionManager | null = null;
  private agent: ClaudeAgent | GeminiAgent | CodexAgent | MockAgent | null = null;
  private agentId: string;
  private isShuttingDown = false;

  constructor(config: Config) {
    super();
    this.config = config;
    // Use the registered agent ID if available, otherwise fall back to random ID
    this.agentId = config.agentId || `${config.agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start the agent wrapper
   */
  async start(): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Agent wrapper is already running');
    }

    console.log(`Starting Onsembl Agent Wrapper (${this.config.agentType})`);
    console.log(`Agent ID: ${this.agentId}`);

    try {
      // Write PID file
      this.writePidFile();

      // Initialize components
      await this.initializeAgent();
      await this.initializeCommandExecutor();
      await this.initializeWebSocketClient();
      await this.initializeReconnectionManager();

      // Start agent process
      await this.agent!.start();

      // Connect to server
      await this.connectToServer();

      // Set up signal handlers
      this.setupSignalHandlers();

      console.log('Agent wrapper started successfully');
      this.updateStatus('running');

    } catch (error) {
      console.error('Failed to start agent wrapper:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the agent wrapper
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    console.log('Stopping agent wrapper...');
    this.isShuttingDown = true;
    this.updateStatus('stopping');

    try {
      // Cancel all active commands
      if (this.commandExecutor) {
        await this.commandExecutor.cancelAllCommands('shutdown');
      }

      // Stop agent
      if (this.agent) {
        await this.agent.stop();
      }

      // Disconnect from server
      if (this.wsClient) {
        await this.wsClient.disconnect();
      }

      // Clean up
      await this.cleanup();

      console.log('Agent wrapper stopped');
      this.updateStatus('stopped');

    } catch (error) {
      console.error('Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Restart the agent wrapper
   */
  async restart(): Promise<void> {
    console.log('Restarting agent wrapper...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
    await this.start();
  }

  /**
   * Get agent status
   */
  getStatus(): any {
    return {
      agentId: this.agentId,
      agentType: this.config.agentType,
      status: this.agent?.getStatus() || 'stopped',
      metadata: this.agent?.getMetadata(),
      connected: this.wsClient?.connected || false,
      reconnecting: this.reconnectionManager?.isReconnecting || false,
      activeCommands: this.commandExecutor?.getActiveCommands() || [],
    };
  }

  /**
   * Check if agent wrapper is running
   */
  isRunning(): boolean {
    if (!existsSync(PID_FILE)) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0); // Check if process exists
      return true;
    } catch {
      // Process doesn't exist, clean up stale PID file
      this.removePidFile();
      return false;
    }
  }

  private async initializeAgent(): Promise<void> {
    const agentOptions = {
      config: this.config,
      onOutput: async (stream: 'stdout' | 'stderr', chunk: OutputChunk) => {
        // Forward output to WebSocket if connected
        if (this.wsClient && this.wsClient.connected) {
          // Note: This would need a command ID from active command context
          // For now, we'll use a placeholder
          await this.wsClient.sendOutput('agent-output', stream, chunk.data, chunk.ansiCodes);
        }
      },
      onError: (error: Error) => {
        console.error(`${this.config.agentType} agent error:`, error);
      },
      onStatusChange: async (status: any) => {
        // Send status update to server
        if (this.wsClient && this.wsClient.connected) {
          await this.wsClient.sendStatus(status, this.agent?.getMetadata());
        }
      },
    };

    switch (this.config.agentType) {
      case 'claude':
        this.agent = new ClaudeAgent(agentOptions);
        break;
      case 'gemini':
        this.agent = new GeminiAgent(agentOptions);
        break;
      case 'codex':
        this.agent = new CodexAgent(agentOptions);
        break;
      case 'mock':
        this.agent = new MockAgent(agentOptions as any);
        break;
      default:
        throw new Error(`Unsupported agent type: ${this.config.agentType}`);
    }
  }

  private async initializeCommandExecutor(): Promise<void> {
    this.commandExecutor = new CommandExecutor({
      config: this.config,
      onOutput: async (commandId: string, stream: 'stdout' | 'stderr', chunk: OutputChunk) => {
        if (this.wsClient && this.wsClient.connected) {
          await this.wsClient.sendOutput(commandId, stream, chunk.data, chunk.ansiCodes);
        }
      },
      onComplete: async (result: ExecutionResult) => {
        if (this.wsClient && this.wsClient.connected) {
          await this.wsClient.sendCommandComplete(
            result.commandId,
            result.exitCode,
            result.duration,
            result.error
          );
        }
      },
      onError: (commandId: string, error: Error) => {
        console.error(`Command ${commandId} error:`, error);
      },
    });
  }

  private async initializeWebSocketClient(): Promise<void> {
    this.wsClient = new WebSocketClient({
      config: this.config,
      agentId: this.agentId,
      onCommand: async (message: CommandMessage) => {
        console.log(`Received command: ${message.command}`);
        if (this.commandExecutor) {
          await this.commandExecutor.executeCommand(message);
        }
      },
      onError: (error: Error) => {
        console.error('WebSocket error:', error);
      },
    });
  }

  private async initializeReconnectionManager(): Promise<void> {
    this.reconnectionManager = new ReconnectionManager({
      config: this.config,
      onReconnect: async () => {
        if (this.wsClient) {
          await this.wsClient.connect();
        }
      },
      onReconnectFailed: (error: Error) => {
        console.error('Reconnection failed:', error);
      },
      onMaxAttemptsReached: () => {
        console.error('Maximum reconnection attempts reached, shutting down');
        this.stop().catch(console.error);
      },
    });

    // Set up reconnection triggers
    if (this.wsClient) {
      this.wsClient.on('disconnected', () => {
        if (!this.isShuttingDown) {
          this.reconnectionManager!.startReconnection();
        }
      });

      this.wsClient.on('connected', () => {
        this.reconnectionManager!.reset();
      });
    }
  }

  private async connectToServer(): Promise<void> {
    if (this.wsClient) {
      await this.wsClient.connect();
    }
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    signals.forEach(signal => {
      process.on(signal, () => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        this.stop()
          .then(() => process.exit(0))
          .catch((error) => {
            console.error('Error during shutdown:', error);
            process.exit(1);
          });
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.stop()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled promise rejection:', reason);
      this.stop()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });
  }

  private writePidFile(): void {
    writeFileSync(PID_FILE, process.pid.toString());
  }

  private removePidFile(): void {
    if (existsSync(PID_FILE)) {
      try {
        unlinkSync(PID_FILE);
      } catch (error) {
        console.warn('Failed to remove PID file:', error);
      }
    }
  }

  private updateStatus(status: string): void {
    const statusData = {
      status,
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      agentType: this.config.agentType,
      pid: process.pid,
    };

    try {
      writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
    } catch (error) {
      console.warn('Failed to write status file:', error);
    }
  }

  private async cleanup(): Promise<void> {
    // Destroy components
    if (this.reconnectionManager) {
      this.reconnectionManager.destroy();
    }

    if (this.commandExecutor) {
      await this.commandExecutor.destroy();
    }

    if (this.agent) {
      await this.agent.destroy();
    }

    // Remove files
    this.removePidFile();

    if (existsSync(STATUS_FILE)) {
      try {
        unlinkSync(STATUS_FILE);
      } catch (error) {
        console.warn('Failed to remove status file:', error);
      }
    }
  }
}

/**
 * CLI Commands
 */
function createCLI(): Command {
  const program = new Command();

  program
    .name('onsembl-agent')
    .description('Onsembl.ai Agent Wrapper')
    .version(packageJson.version || '1.0.0');

  // Start command
  program
    .command('start')
    .description('Start the agent wrapper')
    .option('-a, --agent <type>', 'Agent type (claude|gemini|codex|mock)', 'mock')
    .option('-s, --server <url>', 'Server URL', 'ws://localhost:8080')
    .option('-k, --api-key <key>', 'API key for authentication')
    .option('--auth-type <type>', 'Authentication type (api-key|subscription)', 'api-key')
    .option('-w, --working-dir <dir>', 'Working directory', process.cwd())
    .option('-c, --config <file>', 'Configuration file path')
    .option('-i, --interactive', 'Run in interactive mode with terminal passthrough')
    .option('--headless', 'Force headless mode (no terminal passthrough)')
    .option('--no-websocket', 'Disable WebSocket connection (local only)')
    .option('--status-bar', 'Show status bar in interactive mode')
    .option('-n, --name <name>', 'Set a friendly name for this agent')
    .option('--agent-id <id>', 'Use a specific agent ID (for multi-agent setups)')
    .action(async (options) => {
      try {
        const config = loadConfig({
          agentType: options.agent,
          serverUrl: options.server,
          apiKey: options.apiKey,
          authType: options.authType,
          workingDirectory: options.workingDir,
          disableWebsocket: !options.websocket,
          showStatusBar: options.statusBar,
        });

        // Check authentication before starting
        const authManager = new AuthManager({
          serverUrl: config.serverUrl
        });

        if (!(await authManager.isAuthenticated())) {
          console.error('Not authenticated. Please run: onsembl-agent auth login');
          process.exit(1);
        }

        // Always use InteractiveAgentWrapper to support command forwarding
        // It will automatically fall back to headless mode if PTY is not available

        // Check if node-pty is available for interactive mode
        if (options.interactive && process.stdin.isTTY) {
          const ptyAvailable = await checkPtyAvailable();
          if (!ptyAvailable) {
            console.warn('⚠️  Warning: node-pty is not available. Interactive mode will fall back to headless mode.');
            console.warn('   To enable full interactive mode, install node-pty with: npm install node-pty');
            console.warn('');
          }
        }

        const interactiveOptions: InteractiveOptions = {
          interactive: options.interactive || (!options.headless && process.stdin.isTTY),
          headless: options.headless || !process.stdin.isTTY,
          noWebsocket: !options.websocket,
          statusBar: options.statusBar,
          agentName: options.name,
          agentId: options.agentId,
        };

        // Always use InteractiveAgentWrapper for command forwarding support
        const wrapper = new InteractiveAgentWrapper(config, interactiveOptions);
        await wrapper.start();

        // Keep process alive
        process.stdin.resume();

      } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
      }
    });

  // Stop command
  program
    .command('stop')
    .description('Stop the agent wrapper')
    .action(async () => {
      try {
        if (!existsSync(PID_FILE)) {
          console.log('Agent wrapper is not running');
          return;
        }

        const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
        process.kill(pid, 'SIGTERM');
        console.log('Stop signal sent to agent wrapper');

      } catch (error) {
        console.error('Failed to stop:', error);
        process.exit(1);
      }
    });

  // Restart command
  program
    .command('restart')
    .description('Restart the agent wrapper')
    .action(async () => {
      try {
        // Stop first
        if (existsSync(PID_FILE)) {
          const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
          process.kill(pid, 'SIGTERM');

          // Wait for process to stop
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Then start with default config
        const config = loadConfig();

        // Check authentication before restarting
        const authManager = new AuthManager({
          serverUrl: config.serverUrl
        });

        if (!(await authManager.isAuthenticated())) {
          console.error('Not authenticated. Please run: onsembl-agent auth login');
          process.exit(1);
        }

        const wrapper = new AgentWrapper(config);
        await wrapper.start();

        // Keep process alive
        process.stdin.resume();

      } catch (error) {
        console.error('Failed to restart:', error);
        process.exit(1);
      }
    });

  // Status command
  program
    .command('status')
    .description('Show agent wrapper status')
    .action(() => {
      try {
        if (!existsSync(STATUS_FILE)) {
          console.log('Agent wrapper is not running');
          return;
        }

        const statusData = JSON.parse(readFileSync(STATUS_FILE, 'utf8'));
        console.log(JSON.stringify(statusData, null, 2));

      } catch (error) {
        console.error('Failed to get status:', error);
        process.exit(1);
      }
    });

  // Logs command
  program
    .command('logs')
    .description('Show agent wrapper logs')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .action((options) => {
      // This would need to be implemented based on logging setup
      console.log('Log viewing not yet implemented');
    });

  // Control command for switching between local and remote control
  program
    .command('control <mode>')
    .description('Switch control mode (local|remote)')
    .action((mode) => {
      if (!['local', 'remote'].includes(mode)) {
        console.error('Invalid mode. Use "local" or "remote"');
        process.exit(1);
      }

      // This would send a signal to the running process
      // For now, just show the intent
      console.log(`Control mode switch to "${mode}" requested`);
      console.log('Note: Dynamic control switching will be available in interactive mode');
    });

  // ====== AUTHENTICATION COMMANDS ======

  const authCommand = program
    .command('auth')
    .description('Authentication commands');

  // Login command
  authCommand
    .command('login')
    .description('Authenticate with Onsembl.ai')
    .option('-s, --server <url>', 'Server URL to authenticate with')
    .option('--no-browser', 'Skip opening browser automatically')
    .option('--scope <scope>', 'Authentication scope', 'agent:manage')
    .option('--force', 'Force re-authentication even if already logged in')
    .action(async (options) => {
      try {
        const authManager = new AuthManager({
          serverUrl: options.server
        });

        await authManager.login({
          scope: options.scope,
          openBrowser: options.browser !== false,
          force: options.force
        });
      } catch (error) {
        console.error('Login failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Logout command
  authCommand
    .command('logout')
    .description('Sign out of Onsembl.ai')
    .action(async () => {
      try {
        const authManager = new AuthManager();
        await authManager.logout();
      } catch (error) {
        console.error('Logout failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Status command
  authCommand
    .command('status')
    .description('View authentication status')
    .action(async () => {
      try {
        const authManager = new AuthManager();
        const status = await authManager.getAuthStatus();

        if (status.authenticated) {
          console.log('✓ Authenticated');
          console.log(`  User ID: ${status.user_id}`);
          console.log(`  Server: ${status.server_url}`);
          console.log(`  Scopes: ${status.scopes?.join(', ')}`);

          if (status.expires_at) {
            const expiresAt = new Date(status.expires_at * 1000);
            console.log(`  Token expires: ${expiresAt.toLocaleString()}`);
          }
        } else {
          console.log('✗ Not authenticated');
          console.log('Run "onsembl auth login" to authenticate');
        }
      } catch (error) {
        console.error('Failed to get auth status:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // ====== AGENT MANAGEMENT COMMANDS ======

  const agentCommand = program
    .command('agent')
    .description('Agent management commands');

  // List agents command
  agentCommand
    .command('list')
    .alias('ls')
    .description('List registered agents')
    .option('--status <status>', 'Filter by status (online|offline|executing|error|maintenance)')
    .option('--type <type>', 'Filter by type (claude|gemini|codex|custom)')
    .action(async (options) => {
      try {
        const apiClient = new APIClient();

        // Check authentication
        if (!(await apiClient.isAuthenticated())) {
          console.error('Not authenticated. Please run: onsembl auth login');
          process.exit(1);
        }

        const { agents } = await apiClient.listAgents({
          status: options.status,
          type: options.type
        });

        if (agents.length === 0) {
          console.log('No agents found.');
          console.log('Register an agent with: onsembl agent register --name <name> --type <type>');
          return;
        }

        console.log(`Found ${agents.length} agent(s):\n`);

        agents.forEach(agent => {
          const statusIcon = agent.status === 'online' ? '🟢' :
                           agent.status === 'offline' ? '🔴' :
                           agent.status === 'executing' ? '🟡' :
                           agent.status === 'error' ? '🔴' : '⚪';

          console.log(`${statusIcon} ${agent.name}`);
          console.log(`   ID: ${agent.id}`);
          console.log(`   Type: ${agent.type}`);
          console.log(`   Status: ${agent.status}`);
          console.log(`   Version: ${agent.version}`);
          if (agent.last_ping) {
            console.log(`   Last ping: ${new Date(agent.last_ping).toLocaleString()}`);
          }
          if (agent.metadata?.description) {
            console.log(`   Description: ${agent.metadata.description}`);
          }
          console.log('');
        });

      } catch (error) {
        console.error('Failed to list agents:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Register agent command
  agentCommand
    .command('register')
    .description('Register a new agent')
    .option('-n, --name <name>', 'Agent name (required)')
    .option('-t, --type <type>', 'Agent type (claude|gemini|codex|custom)', 'claude')
    .option('-d, --description <description>', 'Agent description')
    .action(async (options) => {
      try {
        if (!options.name) {
          console.error('Agent name is required. Use --name <name>');
          process.exit(1);
        }

        const apiClient = new APIClient();

        // Check authentication
        if (!(await apiClient.isAuthenticated())) {
          console.error('Not authenticated. Please run: onsembl auth login');
          process.exit(1);
        }

        console.log(`Registering agent "${options.name}"...`);

        const agent = await apiClient.createAgent({
          name: options.name,
          type: options.type,
          description: options.description,
          capabilities: []
        });

        console.log('✓ Agent registered successfully!');
        console.log(`  ID: ${agent.id}`);
        console.log(`  Name: ${agent.name}`);
        console.log(`  Type: ${agent.type}`);
        console.log(`  Status: ${agent.status}`);

      } catch (error) {
        console.error('Failed to register agent:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Start agent command
  agentCommand
    .command('start <name>')
    .description('Start an agent by name')
    .option('-a, --agent <type>', 'Agent type override (claude|gemini|codx|mock)')
    .option('-s, --server <url>', 'Server URL override')
    .option('-k, --api-key <key>', 'API key override')
    .option('-w, --working-dir <dir>', 'Working directory override')
    .option('-i, --interactive', 'Run in interactive mode')
    .option('--headless', 'Force headless mode')
    .action(async (name, options) => {
      try {
        const apiClient = new APIClient();

        // Check authentication
        if (!(await apiClient.isAuthenticated())) {
          console.error('Not authenticated. Please run: onsembl auth login');
          process.exit(1);
        }

        // Get agent by name
        let agent;
        try {
          agent = await apiClient.getAgentByName(name);
        } catch (error) {
          console.error(`Agent "${name}" not found. Register it first with: onsembl agent register --name ${name}`);
          process.exit(1);
        }

        console.log(`Starting agent "${agent.name}" (${agent.type})...`);

        // Load config with authentication
        const userId = await new AuthManager().getCurrentUserId();
        const config = loadConfig({
          agentType: options.agent || agent.type,
          serverUrl: options.server,
          apiKey: options.apiKey,
          workingDirectory: options.workingDir,
          userId: userId, // Pass user ID to config
          agentName: agent.name,
          agentId: agent.id
        });

        // Always use InteractiveAgentWrapper to support command forwarding
        const interactiveOptions: InteractiveOptions = {
          interactive: options.interactive || (!options.headless && process.stdin.isTTY),
          headless: options.headless || !process.stdin.isTTY,
          statusBar: true,
          agentName: agent.name,
          agentId: agent.id
        };

        const wrapper = new InteractiveAgentWrapper(config, interactiveOptions);
        await wrapper.start();

        // Keep process alive
        process.stdin.resume();

      } catch (error) {
        console.error('Failed to start agent:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Delete agent command
  agentCommand
    .command('delete <name>')
    .description('Delete an agent by name')
    .option('--force', 'Skip confirmation prompt')
    .action(async (name, options) => {
      try {
        const apiClient = new APIClient();

        // Check authentication
        if (!(await apiClient.isAuthenticated())) {
          console.error('Not authenticated. Please run: onsembl auth login');
          process.exit(1);
        }

        // Get agent by name
        let agent;
        try {
          agent = await apiClient.getAgentByName(name);
        } catch (error) {
          console.error(`Agent "${name}" not found.`);
          process.exit(1);
        }

        if (!options.force) {
          const { default: inquirer } = await import('inquirer');
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete agent "${agent.name}"?`,
            default: false
          }]);

          if (!confirm) {
            console.log('Deletion cancelled.');
            return;
          }
        }

        await apiClient.deleteAgent(agent.id);
        console.log(`✓ Agent "${agent.name}" deleted successfully.`);

      } catch (error) {
        console.error('Failed to delete agent:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Restart agent command
  agentCommand
    .command('restart <name>')
    .description('Restart an agent by name')
    .action(async (name) => {
      try {
        const apiClient = new APIClient();

        // Check authentication
        if (!(await apiClient.isAuthenticated())) {
          console.error('Not authenticated. Please run: onsembl auth login');
          process.exit(1);
        }

        // Get agent by name
        let agent;
        try {
          agent = await apiClient.getAgentByName(name);
        } catch (error) {
          console.error(`Agent "${name}" not found.`);
          process.exit(1);
        }

        console.log(`Restarting agent "${agent.name}"...`);
        const result = await apiClient.restartAgent(agent.id);

        if (result.success) {
          console.log(`✓ ${result.message}`);
        } else {
          console.error('Failed to restart agent');
          process.exit(1);
        }

      } catch (error) {
        console.error('Failed to restart agent:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Whoami command - Show current agent identity
  agentCommand
    .command('whoami')
    .description('Show current agent identity and configuration')
    .action(async () => {
      try {
        const { AgentConfigManager } = await import('./agent-config-manager.js');
        const configManager = new AgentConfigManager();

        const agents = await configManager.listAgents();
        const defaultAgentId = await configManager.getDefaultAgentId();

        if (agents.length === 0) {
          console.log('No agents configured yet.');
          console.log('Run "onsembl-agent start" to create your first agent.');
          return;
        }

        console.log('\nConfigured Agents:\n');

        for (const agent of agents) {
          const isDefault = agent.id === defaultAgentId;
          const defaultMarker = isDefault ? ' (default)' : '';

          console.log(`${isDefault ? '→' : ' '} ${agent.name || agent.id}${defaultMarker}`);
          console.log(`   ID: ${agent.id}`);
          console.log(`   Type: ${agent.type}`);
          console.log(`   Created: ${new Date(agent.createdAt).toLocaleString()}`);
          console.log(`   Last Used: ${new Date(agent.lastUsed).toLocaleString()}`);
          console.log(`   Platform: ${agent.metadata.platform}`);
          console.log(`   Host: ${agent.metadata.hostMachine}`);
          console.log('');
        }

        console.log(`Config file: ${configManager.getConfigPath()}\n`);

      } catch (error) {
        console.error('Failed to get agent identity:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Rename command - Rename the current agent
  agentCommand
    .command('rename <name>')
    .description('Rename the current default agent')
    .option('--agent-id <id>', 'Rename a specific agent by ID')
    .action(async (name, options) => {
      try {
        const { AgentConfigManager } = await import('./agent-config-manager.js');
        const configManager = new AgentConfigManager();

        let agentId = options.agentId;

        if (!agentId) {
          // Use default agent
          agentId = await configManager.getDefaultAgentId();

          if (!agentId) {
            console.error('No default agent found.');
            console.error('Run "onsembl-agent start" to create an agent first.');
            process.exit(1);
          }
        }

        await configManager.updateAgentName(agentId, name);
        console.log(`✓ Renamed agent to: ${name}`);

      } catch (error) {
        console.error('Failed to rename agent:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return program;
}

// Main execution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Always execute CLI when file is run (bin entry point)
const cli = createCLI();
cli.parse(process.argv);

export { AgentWrapper, createCLI };