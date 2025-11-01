#!/usr/bin/env node

import { EventEmitter } from 'events';
import { Config } from '../config.js';
import { WebSocketClient, CommandMessage } from '../websocket-client.js';
import { PTYManager, checkPtyAvailable } from './pty-manager.js';
import { ModeDetector } from './mode-detector.js';
import { OutputMultiplexer } from './output-multiplexer.js';
import { InputMultiplexer } from './input-multiplexer.js';
import { StateManager } from './state-manager.js';
import { ResizeHandler } from './resize-handler.js';
import { AgentConfigManager } from '../agent-config-manager.js';
import { pino } from 'pino';
import stripAnsi from 'strip-ansi';

export interface InteractiveOptions {
  interactive?: boolean | undefined;
  headless?: boolean | undefined;
  noWebsocket?: boolean | undefined;
  statusBar?: boolean | undefined;
  agentName?: string | undefined;
  agentId?: string | undefined;
}

export class InteractiveAgentWrapper extends EventEmitter {
  private config: Config;
  private options: InteractiveOptions;
  private logger: pino.Logger;
  private agentId: string;
  private agentName?: string | undefined;
  private sessionId: string;
  private mode: string = 'headless';

  // Core components
  private wsClient: WebSocketClient | null = null;
  private ptyManager: PTYManager | null = null;
  private modeDetector: ModeDetector;
  private outputMultiplexer: OutputMultiplexer | null = null;
  private inputMultiplexer: InputMultiplexer | null = null;
  private stateManager: StateManager;
  private resizeHandler: ResizeHandler | null = null;
  private agentConfigManager: AgentConfigManager;

  // State
  private isRunning: boolean = false;
  private isShuttingDown: boolean = false;
  private inputBuffer: string = ''; // Buffer for detecting command sequences

  constructor(config: Config, options: InteractiveOptions = {}) {
    super();
    this.config = config;
    this.options = options;
    // agentId will be set in start() after async config load
    this.agentId = '';
    this.sessionId = '';

    // Initialize logger
    this.logger = pino({
      name: 'interactive-wrapper',
      level: process.env['LOG_LEVEL'] || 'info'
    });

    // Initialize core components
    this.modeDetector = new ModeDetector(this.logger);
    this.stateManager = new StateManager({ logger: this.logger });
    this.agentConfigManager = new AgentConfigManager(this.logger);

    // Detect mode
    const modeInfo = this.modeDetector.detectMode(options);
    this.mode = modeInfo.mode;
    this.logger.info('Mode detected', modeInfo);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent wrapper is already running');
    }

    // Load or create persistent agent identity
    const options: {name?: string; agentId?: string} = {};
    if (this.options.agentName) options.name = this.options.agentName;
    if (this.options.agentId) options.agentId = this.options.agentId;

    const { id, name, isNew } = await this.agentConfigManager.getOrCreateAgentId(
      this.config.agentType,
      Object.keys(options).length > 0 ? options : undefined
    );

    this.agentId = id;
    this.agentName = name;
    this.sessionId = `agent-session-${this.agentId}`;

    if (isNew) {
      this.logger.info(`Created new agent identity: ${id}${name ? ` (${name})` : ''}`);
    } else {
      this.logger.info(`Reconnecting as agent: ${id}${name ? ` (${name})` : ''}`);
    }

    this.logger.info('Starting Interactive Agent Wrapper', {
      agentId: this.agentId,
      agentName: name,
      agentType: this.config.agentType,
      mode: this.mode,
      isReconnection: !isNew
    });

    try {
      this.isRunning = true;

      // Update state
      this.stateManager.batchUpdate({
        'mode': this.mode,
        'agent.type': this.config.agentType,
        'agent.status': 'starting',
        'agent.startTime': Date.now()
      });

      // Initialize components based on mode
      if (this.mode === 'interactive') {
        // Check if node-pty is available for interactive mode
        const ptyAvailable = await checkPtyAvailable();
        if (!ptyAvailable) {
          this.logger.warn(
            'node-pty is not available - falling back to headless mode. ' +
            'To enable interactive mode, install node-pty: npm install node-pty'
          );
          this.mode = 'headless';
          await this.initializeHeadlessMode();
        } else {
          await this.initializeInteractiveMode();
        }
      } else {
        await this.initializeHeadlessMode();
      }

      // Connect to WebSocket if not disabled
      if (!this.config.disableWebsocket && !this.options.noWebsocket) {
        await this.initializeWebSocket();
      }

      // Set up signal handlers
      this.setupSignalHandlers();

      this.logger.info('Agent wrapper started successfully');
      this.stateManager.updateState('agent.status', 'running');

    } catch (error) {
      this.logger.error('Failed to start agent wrapper', error);
      await this.cleanup();
      throw error;
    }
  }

  private async initializeInteractiveMode(): Promise<void> {
    this.logger.info('Initializing interactive mode with terminal passthrough');

    // Initialize PTY manager
    this.ptyManager = new PTYManager(this.logger);

    // Initialize output multiplexer
    this.outputMultiplexer = new OutputMultiplexer({
      mode: 'interactive',
      logger: this.logger,
      preserveAnsi: true
    });

    // Initialize input multiplexer
    this.inputMultiplexer = new InputMultiplexer({
      mode: 'interactive',
      logger: this.logger
    });

    // Initialize resize handler
    this.resizeHandler = new ResizeHandler({
      logger: this.logger,
      ptyManager: this.ptyManager,
      stateManager: this.stateManager
    });

    // Start resize handler
    this.resizeHandler.start();

    // Get the agent command
    const agentCommand = this.getAgentCommand();

    this.logger.info('Agent command configuration', agentCommand);

    // Spawn PTY process
    const ptyProcess = this.ptyManager.spawn(
      agentCommand.command,
      agentCommand.args,
      { env: agentCommand.env }
    );

    // Handle PTY errors
    this.ptyManager.on('error', (error: Error) => {
      this.logger.error('PTY manager error', error);
    });

    // Set up PTY output handling
    this.ptyManager.on('data', (data: string) => {
      // Log first output for debugging
      if (!this.stateManager.getState()?.firstOutputReceived) {
        this.logger.info('First PTY output received', { length: data.length, preview: data.slice(0, 100) });
        this.stateManager.updateState('firstOutputReceived', true);
      }

      // Send to terminal (preserving ANSI)
      process.stdout.write(data);

      // Send to WebSocket (if connected)
      if (this.wsClient?.connected) {
        // Strip ANSI codes for WebSocket transmission
        const strippedData = stripAnsi(data);
        // Check if original data had ANSI codes
        const hasAnsi = data !== strippedData;
        const ansiCodes = hasAnsi ? 'true' : undefined;

        // Send terminal output to backend
        this.wsClient.sendOutput(this.sessionId, 'stdout', strippedData, ansiCodes);
      }
    });

    // Set up terminal input handling with command detection
    this.inputMultiplexer.addSource('terminal', process.stdin, {
      priority: 10,
      canInterrupt: true,
      handler: (data: string) => {
        // Check for exit command before passing to PTY
        if (this.handleInputCommand(data)) {
          return; // Command was handled, don't send to PTY
        }
        this.ptyManager?.write(data);
      }
    });

    // Enable raw mode for better terminal control
    if (process.stdin.isTTY) {
      this.inputMultiplexer.setupRawMode();
    }

    // Handle PTY exit
    this.ptyManager.on('exit', ({ exitCode }) => {
      this.logger.info('PTY process exited', { exitCode, command: agentCommand.command, args: agentCommand.args });
      this.stateManager.updateState('agent.status', 'stopped');
      this.stop();
    });

    // Display interactive mode help on startup
    this.displayInteractiveHelp();

    // Status bar (optional)
    if (this.config.showStatusBar) {
      this.initializeStatusBar();
    }
  }

  private async initializeHeadlessMode(): Promise<void> {
    this.logger.info('Initializing headless mode (traditional piped approach)');

    // Initialize output multiplexer (no ANSI preservation)
    this.outputMultiplexer = new OutputMultiplexer({
      mode: 'headless',
      logger: this.logger,
      preserveAnsi: false
    });

    // Initialize input multiplexer
    this.inputMultiplexer = new InputMultiplexer({
      mode: 'headless',
      logger: this.logger
    });

    // Get the agent command
    const agentCommand = this.getAgentCommand();

    // Spawn process with piped stdio
    const { spawn } = await import('child_process');
    const childProcess = spawn(agentCommand.command, agentCommand.args, {
      env: { ...process.env, ...agentCommand.env },
      stdio: 'pipe'
    });

    // Handle stdout
    childProcess.stdout?.on('data', (chunk: Buffer) => {
      const data = chunk.toString();

      // Send to WebSocket
      if (this.wsClient?.connected) {
        this.wsClient.sendOutput(this.sessionId, 'stdout', stripAnsi(data), undefined);
      }
    });

    // Handle stderr
    childProcess.stderr?.on('data', (chunk: Buffer) => {
      const data = chunk.toString();

      // Send to WebSocket
      if (this.wsClient?.connected) {
        this.wsClient.sendOutput(this.sessionId, 'stderr', stripAnsi(data), undefined);
      }
    });

    // Handle process exit
    childProcess.on('exit', (code) => {
      this.logger.info('Child process exited', { code });
      this.stateManager.updateState('agent.status', 'stopped');
      this.stop();
    });

    // Store process reference
    this.stateManager.updateState('agent.pid', childProcess.pid);
  }

  private async initializeWebSocket(): Promise<void> {
    this.logger.info('Initializing WebSocket connection');

    this.wsClient = new WebSocketClient({
      config: this.config,
      agentId: this.agentId,
      agentName: this.agentName,
      onCommand: async (message: CommandMessage) => {
        await this.handleRemoteCommand(message);
      },
      onError: (error: Error) => {
        this.logger.error('WebSocket error', error);
      }
    });

    // Add WebSocket as input source (lower priority than terminal)
    this.inputMultiplexer?.addSource('dashboard', null, {
      priority: 5,
      canInterrupt: false,
      handler: (data: string) => {
        if (this.mode === 'interactive') {
          // Queue the command if terminal is active
          this.logger.info('Remote command queued (terminal has priority)');
        } else {
          // Process immediately in headless mode
          this.processRemoteCommand(data);
        }
      }
    });

    await this.wsClient.connect();
    this.stateManager.updateState('websocket.connected', true);
  }

  private async handleRemoteCommand(message: CommandMessage): Promise<void> {
    this.logger.info('Received remote command', { command: message.command });

    // In interactive mode, check control state
    if (this.mode === 'interactive') {
      const state = this.stateManager.getState();
    const controlMode = state?.controlMode;

      if (controlMode === 'local') {
        // Queue the command
        this.inputMultiplexer?.queueCommand({
          source: 'dashboard',
          data: message.command,
          priority: 5,
          timestamp: Date.now(),
          id: (message as any).id || `cmd-${Date.now()}`
        });

        this.logger.info('Remote command queued (local control active)');
        return;
      }
    }

    // Process the command
    this.processRemoteCommand(message.command);
  }

  private processRemoteCommand(command: string): void {
    if (this.ptyManager?.isInteractive) {
      this.ptyManager.write(command + '\n');
    } else {
      // Handle in headless mode
      this.logger.info('Processing remote command in headless mode', { command });
    }
  }

  /**
   * Handle special input commands that control the wrapper itself
   * Returns true if the command was handled (don't pass to PTY)
   */
  private handleInputCommand(data: string): boolean {
    // Add to input buffer
    this.inputBuffer += data;

    // Keep buffer size reasonable (max 50 chars)
    if (this.inputBuffer.length > 50) {
      this.inputBuffer = this.inputBuffer.slice(-50);
    }

    // Check for exit command: ~~exit followed by Enter
    // Handle both \r (Windows) and \n (Unix) line endings
    if (this.inputBuffer.endsWith('~~exit\r') || this.inputBuffer.endsWith('~~exit\n')) {
      this.logger.info('Exit command detected, shutting down gracefully');

      // Clear the line to remove the ~~exit text from terminal
      process.stdout.write('\r\x1b[K');
      process.stdout.write('Exiting interactive mode...\n');

      // Clear buffer
      this.inputBuffer = '';

      // Trigger shutdown
      this.stop().catch((error) => {
        this.logger.error('Error during command-triggered shutdown', error);
        process.exit(1);
      });

      return true; // Command handled
    }

    // Check for help command: ~~help
    if (this.inputBuffer.endsWith('~~help\r') || this.inputBuffer.endsWith('~~help\n')) {
      this.logger.info('Help command detected');

      // Clear the line
      process.stdout.write('\r\x1b[K');

      // Display help
      process.stdout.write('\n');
      process.stdout.write('╔═══════════════════════════════════════════════════════╗\n');
      process.stdout.write('║         Onsembl Agent Wrapper - Commands             ║\n');
      process.stdout.write('╠═══════════════════════════════════════════════════════╣\n');
      process.stdout.write('║  ~~exit   Exit interactive mode and stop the wrapper ║\n');
      process.stdout.write('║  ~~help   Show this help message                     ║\n');
      process.stdout.write('╚═══════════════════════════════════════════════════════╝\n');
      process.stdout.write('\n');

      // Clear buffer
      this.inputBuffer = '';

      return true; // Command handled
    }

    return false; // Not a command, pass through to PTY
  }

  private getAgentCommand(): { command: string; args: string[]; env: any } {
    const isWindows = process.platform === 'win32';

    // On Windows, we need to use cmd.exe to run npm-installed commands
    // On Unix, we can call the command directly
    const agentCommands: Record<string, { command: string; args: string[]; env: any }> = {
      claude: {
        command: isWindows ? 'cmd.exe' : 'claude',
        args: isWindows ? ['/c', 'claude'] : [],
        env: {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          FORCE_COLOR: '3'
        }
      },
      gemini: {
        command: isWindows ? 'cmd.exe' : 'gemini',
        args: isWindows ? ['/c', 'gemini'] : [],
        env: { GEMINI_API_KEY: process.env['GEMINI_API_KEY'] }
      },
      codex: {
        command: isWindows ? 'cmd.exe' : 'codex',
        args: isWindows ? ['/c', 'codex'] : [],
        env: { CODEX_API_KEY: process.env['CODEX_API_KEY'] }
      },
      mock: {
        command: isWindows ? 'cmd.exe' : 'bash',
        args: isWindows
          ? ['/k', 'echo Mock agent ready. Type commands or press Ctrl+C to exit.']
          : ['-c', 'while true; do echo "Mock agent running..."; sleep 5; done'],
        env: {}
      }
    };

    const command = agentCommands[this.config.agentType] || agentCommands['mock'];
    if (!command) {
      throw new Error(`Unknown agent type: ${this.config.agentType}`);
    }
    return command;
  }

  private displayInteractiveHelp(): void {
    // Display a brief help message on startup
    process.stdout.write('\n');
    process.stdout.write('═══════════════════════════════════════════════════════\n');
    process.stdout.write('  Interactive Mode Enabled\n');
    process.stdout.write('  Type ~~help for commands | Type ~~exit to quit\n');
    process.stdout.write('═══════════════════════════════════════════════════════\n');
    process.stdout.write('\n');
  }

  private initializeStatusBar(): void {
    // This would implement a minimal status bar
    // For now, just log the intent
    this.logger.info('Status bar requested but not yet implemented');
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    signals.forEach(signal => {
      process.on(signal, () => {
        this.logger.info(`Received ${signal}, shutting down gracefully`);
        this.stop()
          .then(() => process.exit(0))
          .catch((error) => {
            this.logger.error('Error during shutdown', error);
            process.exit(1);
          });
      });
    });

    // Handle terminal resize
    if (this.mode === 'interactive') {
      process.on('SIGWINCH', () => {
        const { columns, rows } = process.stdout;
        if (columns && rows) {
          this.resizeHandler?.performResize();
        }
      });
    }
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.logger.info('Stopping agent wrapper');
    this.isShuttingDown = true;
    this.stateManager.updateState('agent.status', 'stopping');

    try {
      // Clear input buffer
      this.inputBuffer = '';

      // Disable raw mode if enabled
      if (this.mode === 'interactive') {
        this.inputMultiplexer?.disableRawMode();
      }

      // Stop resize handler
      this.resizeHandler?.stop();

      // Kill PTY process
      this.ptyManager?.kill();

      // Disconnect WebSocket
      if (this.wsClient) {
        await this.wsClient.disconnect();
      }

      // Clean up
      await this.cleanup();

      this.logger.info('Agent wrapper stopped');
      this.stateManager.updateState('agent.status', 'stopped');

    } catch (error) {
      this.logger.error('Error during shutdown', error);
      throw error;
    }
  }

  async switchMode(targetMode: 'local' | 'remote'): Promise<boolean> {
    return this.stateManager.switchControlMode(targetMode);
  }

  getStatus(): any {
    return {
      agentId: this.agentId,
      agentType: this.config.agentType,
      mode: this.mode,
      state: this.stateManager.getState(),
      queueStatus: this.inputMultiplexer?.getQueueStatus(),
      performance: this.stateManager.getPerformanceMetrics()
    };
  }

  private async cleanup(): Promise<void> {
    this.isRunning = false;
    this.ptyManager = null;
    this.outputMultiplexer = null;
    this.inputMultiplexer = null;
    this.resizeHandler = null;
    this.wsClient = null;
  }
}

export default InteractiveAgentWrapper;