import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import { Config, getAgentEnvironment } from '../config';
import { StreamCapture, OutputChunk } from '../stream-capture';

export interface ClaudeAgentOptions {
  config: Config;
  onOutput: (stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  onError: (error: Error) => void;
  onStatusChange: (status: AgentStatus) => void;
}

export type AgentStatus = 'starting' | 'ready' | 'busy' | 'error' | 'stopping' | 'stopped';

export interface AgentMetadata {
  version?: string;
  capabilities: string[];
  pid?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  startTime: Date;
  restartCount: number;
}

/**
 * Claude agent process manager
 */
export class ClaudeAgent extends EventEmitter {
  private config: Config;
  private process: ChildProcess | null = null;
  private streamCapture: StreamCapture | null = null;
  private status: AgentStatus = 'stopped';
  private metadata: AgentMetadata;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;

  private onOutput: (stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  private onError: (error: Error) => void;
  private onStatusChange: (status: AgentStatus) => void;

  constructor(options: ClaudeAgentOptions) {
    super();
    this.config = options.config;
    this.onOutput = options.onOutput;
    this.onError = options.onError;
    this.onStatusChange = options.onStatusChange;

    this.metadata = {
      capabilities: this.getCapabilities(),
      startTime: new Date(),
      restartCount: 0,
    };
  }

  /**
   * Start the Claude agent process
   */
  async start(): Promise<void> {
    if (this.process || this.status === 'starting') {
      throw new Error('Claude agent is already running or starting');
    }

    console.log('Starting Claude agent process');
    this.setStatus('starting');

    try {
      // Validate Claude command exists
      if (!this.validateCommand()) {
        throw new Error(`Claude command '${this.config.agentCommand}' not found in PATH`);
      }

      // Prepare command arguments
      const args = this.buildCommandArgs();
      const env = getAgentEnvironment(this.config);

      // Spawn Claude process
      this.process = spawn(this.config.agentCommand!, args, {
        cwd: this.config.workingDirectory,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.metadata.pid = this.process.pid;

      // Set up stream capture
      this.streamCapture = new StreamCapture({
        config: this.config,
        onOutput: async (stream, chunk) => {
          // Process Claude-specific output
          this.processOutput(stream, chunk);
          await this.onOutput(stream, chunk);
        },
        onError: this.onError,
      });

      // Attach to process streams
      if (this.process.stdout && this.process.stderr) {
        this.streamCapture.attachToStreams(this.process.stdout, this.process.stderr);
        this.streamCapture.startAutoFlush();
      }

      // Set up process event handlers
      this.setupProcessHandlers();

      // Start health monitoring
      this.startHealthCheck();

      // Wait for Claude to be ready
      // Note: In stream-json input mode, Claude may not output anything until it receives input
      // So we'll consider it ready after a short delay if the process is running
      await this.waitForReadyOrTimeout();

      this.setStatus('ready');
      console.log('Claude agent started successfully');

    } catch (error) {
      this.setStatus('error');
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the Claude agent process
   */
  async stop(): Promise<void> {
    if (!this.process || this.status === 'stopping' || this.status === 'stopped') {
      return;
    }

    console.log('Stopping Claude agent process');
    this.setStatus('stopping');

    // Stop health checking
    this.stopHealthCheck();

    try {
      // Try graceful shutdown first
      if (this.process.stdin) {
        this.process.stdin.write('\x03'); // Send Ctrl+C
      }

      // Wait for graceful shutdown
      await this.waitForExit(5000);

    } catch (error) {
      console.warn('Graceful shutdown failed, force killing process');
      this.forceKill();
    } finally {
      this.cleanup();
      this.setStatus('stopped');
      console.log('Claude agent stopped');
    }
  }

  /**
   * Restart the Claude agent process
   */
  async restart(): Promise<void> {
    console.log('Restarting Claude agent process');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    await this.start();
    this.metadata.restartCount++;
  }

  /**
   * Send input to the Claude process
   */
  async sendInput(input: string): Promise<void> {
    if (!this.process || !this.process.stdin || this.status !== 'ready') {
      throw new Error('Claude agent is not ready for input');
    }

    this.setStatus('busy');

    try {
      // For Claude Code with stream-json format, wrap input in JSON
      const jsonMessage = JSON.stringify({
        type: 'user-message',
        content: input
      });
      this.process.stdin.write(jsonMessage + '\n');
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Get agent metadata
   */
  getMetadata(): AgentMetadata {
    return { ...this.metadata };
  }

  /**
   * Check if agent is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.process || this.status === 'stopped') {
      return false;
    }

    try {
      // Update resource usage
      await this.updateResourceUsage();

      // Check if process is still alive
      if (this.process.killed || this.process.exitCode !== null) {
        return false;
      }

      // Additional Claude-specific health checks could go here
      return true;

    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Destroy the agent and clean up resources
   */
  async destroy(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
  }

  private validateCommand(): boolean {
    try {
      // First check if the command is already an absolute path
      if (this.config.agentCommand?.startsWith('/')) {
        if (existsSync(this.config.agentCommand)) {
          return true;
        }
      }

      // Try which to find the command in PATH
      try {
        const commandPath = execSync(`which ${this.config.agentCommand}`, { encoding: 'utf8' }).trim();
        if (commandPath && existsSync(commandPath)) {
          // Update config to use full path
          this.config.agentCommand = commandPath;
          return true;
        }
      } catch {
        // which failed, try other methods
      }

      // Check nvm paths
      const nvmPaths = [
        '/Users/tythanhdoan/.nvm/versions/node/v22.18.0/bin/claude',
        join(process.env.HOME || '', '.nvm/versions/node/v22.18.0/bin/claude'),
      ];

      for (const nvmPath of nvmPaths) {
        if (existsSync(nvmPath)) {
          this.config.agentCommand = nvmPath;
          return true;
        }
      }

      // Try to find it in npm global bin
      try {
        const npmBin = execSync('npm bin -g', { encoding: 'utf8' }).trim();
        const commandPath = join(npmBin, 'claude');
        if (existsSync(commandPath)) {
          this.config.agentCommand = commandPath;
          return true;
        }
      } catch {
        // npm bin failed
      }

      return false;
    } catch {
      return false;
    }
  }

  private buildCommandArgs(): string[] {
    const args: string[] = [];

    // Add model configuration - Claude Code supports --model
    if (this.config.claude.model) {
      args.push('--model', this.config.claude.model);
    }

    // Use stream-json format for programmatic interaction
    args.push('--print');

    // IMPORTANT: --verbose is required when using --output-format=stream-json with --print
    args.push('--verbose');

    args.push('--output-format', 'stream-json');
    args.push('--input-format', 'stream-json');

    // Include partial messages for real-time streaming
    args.push('--include-partial-messages');

    // Replay user messages for acknowledgment
    args.push('--replay-user-messages');

    // Bypass permissions for automated use
    args.push('--dangerously-skip-permissions');

    return args;
  }

  private getCapabilities(): string[] {
    return [
      'text-generation',
      'code-analysis',
      'code-generation',
      'conversation',
      'streaming',
      'json-output',
      'file-upload',
      'web-search',
    ];
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.on('exit', (code, signal) => {
      console.log(`Claude process exited with code ${code}, signal ${signal}`);

      if (this.status !== 'stopping') {
        // Unexpected exit, attempt restart if configured
        this.setStatus('error');
        this.scheduleRestart();
      }
    });

    this.process.on('error', (error) => {
      console.error('Claude process error:', error);
      this.setStatus('error');
      this.onError(error);
    });

    // Handle process signals
    this.process.on('SIGTERM', () => {
      console.log('Claude process received SIGTERM');
    });

    this.process.on('SIGKILL', () => {
      console.log('Claude process received SIGKILL');
    });
  }

  private processOutput(stream: 'stdout' | 'stderr', chunk: OutputChunk): void {
    const data = chunk.data;

    // Debug: Log all output during startup
    if (this.status === 'starting') {
      console.log(`[Claude ${stream} during startup]:`, data.substring(0, 200));
    }

    // Look for Claude-specific patterns
    if (stream === 'stdout') {
      // Check for ready signal - Claude Code uses stream-json format
      // In stream-json mode with --input-format stream-json, Claude may not output anything initially
      if (data.includes('"type":"session-started"') ||
          data.includes('"type":"model-ready"') ||
          data.includes('Ready') ||
          data.includes('{')) {
        if (this.status === 'starting' || this.status === 'busy') {
          console.log('Claude detected as ready from stdout');
          this.setStatus('ready');
        }
      }

      // Check for error patterns
      if (data.includes('Error:') || data.includes('Exception:')) {
        console.warn('Claude output contains error:', data);
      }

      // Extract model information if available
      const modelMatch = data.match(/Model:\s*([\w-]+)/);
      if (modelMatch) {
        this.metadata.version = modelMatch[1];
      }
    } else {
      // stderr - treat as potential errors but don't fail immediately
      if (data.trim()) {
        console.warn('Claude stderr:', data);
      }
    }
  }

  private async waitForReadyOrTimeout(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Set a shorter timeout for stream-json mode
      const timeout = setTimeout(() => {
        if (!resolved) {
          // If process is still running after timeout, consider it ready
          // This is because Claude in stream-json input mode may not output anything initially
          if (this.process && !this.process.killed && this.process.exitCode === null) {
            console.log('Claude process is running, assuming ready (stream-json mode)');
            resolved = true;
            resolve();
          } else {
            resolved = true;
            reject(new Error('Timeout waiting for Claude to be ready'));
          }
        }
      }, timeoutMs);

      const checkReady = () => {
        if (resolved) return;

        if (this.status === 'ready') {
          clearTimeout(timeout);
          resolved = true;
          resolve();
        } else if (this.status === 'error') {
          clearTimeout(timeout);
          resolved = true;
          reject(new Error('Claude failed to start'));
        }
      };

      // Check immediately and then on status changes
      checkReady();
      this.on('status_change', checkReady);

      // Also listen for any stdout as a sign of readiness
      const outputListener = (stream: 'stdout' | 'stderr', chunk: OutputChunk) => {
        if (!resolved && stream === 'stdout') {
          console.log('Claude stdout received, marking as ready');
          clearTimeout(timeout);
          resolved = true;
          this.removeListener('output', outputListener);
          resolve();
        }
      };
      this.on('output', outputListener);
    });
  }

  private async waitForReady(timeoutMs = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Claude to be ready'));
      }, timeoutMs);

      const checkReady = () => {
        if (this.status === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else if (this.status === 'error') {
          clearTimeout(timeout);
          reject(new Error('Claude failed to start'));
        }
      };

      // Check immediately and then on status changes
      checkReady();
      this.on('status_change', checkReady);

      // Also check for ready signals in output
      const outputListener = (stream: 'stdout' | 'stderr', chunk: OutputChunk) => {
        if (stream === 'stdout' && (
          chunk.data.includes('"type":"session-started"') ||
          chunk.data.includes('"type":"model-ready"') ||
          chunk.data.includes('Ready') ||
          this.status === 'starting'
        )) {
          clearTimeout(timeout);
          this.removeListener('output', outputListener);
          resolve();
        }
      };

      this.on('output', outputListener);
    });
  }

  private async waitForExit(timeoutMs: number): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for process exit'));
      }, timeoutMs);

      this.process!.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private forceKill(): void {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }
  }

  private cleanup(): void {
    this.stopHealthCheck();
    this.stopRestartTimer();

    if (this.streamCapture) {
      this.streamCapture.destroy();
      this.streamCapture = null;
    }

    this.process = null;
    this.metadata.pid = undefined;
  }

  private setStatus(status: AgentStatus): void {
    if (this.status !== status) {
      const oldStatus = this.status;
      this.status = status;
      console.log(`Claude agent status changed: ${oldStatus} -> ${status}`);
      this.onStatusChange(status);
      this.emit('status_change', status, oldStatus);
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      const isHealthy = await this.healthCheck();
      if (!isHealthy && this.status !== 'error' && this.status !== 'stopping') {
        console.warn('Claude health check failed');
        this.setStatus('error');
        this.scheduleRestart();
      }
    }, 10000); // Check every 10 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private scheduleRestart(): void {
    if (this.restartTimer) return; // Already scheduled

    console.log('Scheduling Claude agent restart in 5 seconds');
    this.restartTimer = setTimeout(async () => {
      try {
        await this.restart();
      } catch (error) {
        console.error('Failed to restart Claude agent:', error);
        this.onError(error as Error);
      }
    }, 5000);
  }

  private stopRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private async updateResourceUsage(): Promise<void> {
    if (!this.process?.pid) return;

    try {
      // Use ps command compatible with macOS
      const psOutput = execSync(`ps -p ${this.process.pid} -o %mem,%cpu`, {
        encoding: 'utf8',
        timeout: 1000,
      });

      // Split output by lines and get the data line (skip header)
      const lines = psOutput.trim().split('\n');
      if (lines.length > 1) {
        const [memPercent, cpuPercent] = lines[1].trim().split(/\s+/).map(Number);
        this.metadata.memoryUsage = memPercent;
        this.metadata.cpuUsage = cpuPercent;
      }

    } catch (error) {
      // Ignore errors in resource monitoring - it's not critical
      // console.debug('Failed to update resource usage:', error);
    }
  }
}