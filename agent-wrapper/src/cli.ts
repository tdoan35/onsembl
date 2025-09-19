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
    this.agentId = `${config.agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    .action(async (options) => {
      try {
        const config = loadConfig({
          agentType: options.agent,
          serverUrl: options.server,
          apiKey: options.apiKey,
          authType: options.authType,
          workingDirectory: options.workingDir,
          disableWebsocket: options.noWebsocket,
          showStatusBar: options.statusBar,
        });

        // Use InteractiveAgentWrapper if interactive mode is requested
        if (options.interactive || (!options.headless && process.stdin.isTTY)) {
          const interactiveOptions: InteractiveOptions = {
            interactive: options.interactive,
            headless: options.headless,
            noWebsocket: options.noWebsocket,
            statusBar: options.statusBar,
          };

          const wrapper = new InteractiveAgentWrapper(config, interactiveOptions);
          await wrapper.start();
        } else {
          // Use standard wrapper for headless mode
          const wrapper = new AgentWrapper(config);
          await wrapper.start();
        }

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

  return program;
}

// Main execution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = createCLI();
  cli.parse(process.argv);
}

export { AgentWrapper, createCLI };