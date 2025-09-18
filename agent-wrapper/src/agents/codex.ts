import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Config, getAgentEnvironment } from '../config';
import { StreamCapture, OutputChunk } from '../stream-capture';
import { AgentStatus, AgentMetadata } from './claude';

export interface CodexAgentOptions {
  config: Config;
  onOutput: (stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  onError: (error: Error) => void;
  onStatusChange: (status: AgentStatus) => void;
}

/**
 * Codex agent process manager
 */
export class CodexAgent extends EventEmitter {
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

  constructor(options: CodexAgentOptions) {
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
   * Start the Codex agent process
   */
  async start(): Promise<void> {
    if (this.process || this.status === 'starting') {
      throw new Error('Codex agent is already running or starting');
    }

    console.log('Starting Codex agent process');
    this.setStatus('starting');

    try {
      // Validate Codex command exists
      if (!this.validateCommand()) {
        throw new Error(`Codex command '${this.config.agentCommand}' not found in PATH`);
      }

      // Prepare command arguments
      const args = this.buildCommandArgs();
      const env = getAgentEnvironment(this.config);

      // Spawn Codex process
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
          // Process Codex-specific output
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

      // Wait for Codex to be ready
      await this.waitForReady();

      this.setStatus('ready');
      console.log('Codex agent started successfully');

    } catch (error) {
      this.setStatus('error');
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the Codex agent process
   */
  async stop(): Promise<void> {
    if (!this.process || this.status === 'stopping' || this.status === 'stopped') {
      return;
    }

    console.log('Stopping Codex agent process');
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
      console.log('Codex agent stopped');
    }
  }

  /**
   * Restart the Codex agent process
   */
  async restart(): Promise<void> {
    console.log('Restarting Codex agent process');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    await this.start();
    this.metadata.restartCount++;
  }

  /**
   * Send input to the Codex process
   */
  async sendInput(input: string): Promise<void> {
    if (!this.process || !this.process.stdin || this.status !== 'ready') {
      throw new Error('Codex agent is not ready for input');
    }

    this.setStatus('busy');

    try {
      // For Codex proto mode, wrap input in protocol format
      const protocolMessage = JSON.stringify({
        type: 'message',
        content: input,
        model: this.config.codex.model,
        temperature: this.config.codex.temperature,
        maxTokens: this.config.codex.maxTokens
      });
      this.process.stdin.write(protocolMessage + '\n');
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

      // Additional Codex-specific health checks could go here
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
      const { execSync } = require('child_process');
      // Try which first, then check if it's an npm global command
      try {
        execSync(`which ${this.config.agentCommand}`, { stdio: 'ignore' });
        return true;
      } catch {
        // Try to find it in npm global bin
        const npmBin = execSync('npm bin -g', { encoding: 'utf8' }).trim();
        const fs = require('fs');
        const path = require('path');
        const commandPath = path.join(npmBin, this.config.agentCommand!);
        if (fs.existsSync(commandPath)) {
          // Update config to use full path
          this.config.agentCommand = commandPath;
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private buildCommandArgs(): string[] {
    const args: string[] = [];

    // Use proto command for protocol stream interaction
    args.push('proto');

    // The model and other parameters need to be passed via stdin in protocol format
    // We'll handle those in the input stream

    return args;
  }

  private getCapabilities(): string[] {
    return [
      'code-generation',
      'code-completion',
      'code-analysis',
      'code-translation',
      'debugging',
      'documentation',
      'unit-tests',
      'refactoring',
      'streaming',
      'json-output',
      'multi-language', // Codex supports many programming languages
    ];
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.on('exit', (code, signal) => {
      console.log(`Codex process exited with code ${code}, signal ${signal}`);

      if (this.status !== 'stopping') {
        // Unexpected exit, attempt restart if configured
        this.setStatus('error');
        this.scheduleRestart();
      }
    });

    this.process.on('error', (error) => {
      console.error('Codex process error:', error);
      this.setStatus('error');
      this.onError(error);
    });

    // Handle process signals
    this.process.on('SIGTERM', () => {
      console.log('Codex process received SIGTERM');
    });

    this.process.on('SIGKILL', () => {
      console.log('Codex process received SIGKILL');
    });
  }

  private processOutput(stream: 'stdout' | 'stderr', chunk: OutputChunk): void {
    const data = chunk.data;

    // Look for Codex-specific patterns
    if (stream === 'stdout') {
      // Check for ready signal - Codex proto mode uses JSON protocol
      if (data.includes('"protocol":') ||
          data.includes('"ready":true') ||
          data.includes('Connected') ||
          this.status === 'starting') {
        if (this.status === 'starting' || this.status === 'busy') {
          this.setStatus('ready');
        }
      }

      // Check for error patterns
      if (data.includes('Error:') ||
          data.includes('Exception:') ||
          data.includes('OpenAI API error')) {
        console.warn('Codex output contains error:', data);
      }

      // Extract model information if available
      const modelMatch = data.match(/Model:\s*(gpt-[\w-]+|davinci|cushman|babbage|ada)/i);
      if (modelMatch) {
        this.metadata.version = modelMatch[1];
      }

      // Check for rate limiting
      if (data.includes('rate limit') || data.includes('quota')) {
        console.warn('Codex rate limit or quota issue:', data);
      }

      // Check for code completion patterns
      if (data.includes('completion') || data.includes('suggestion')) {
        console.log('Codex providing code completion');
      }

      // Check for code generation patterns
      if (data.includes('```') || data.includes('function') || data.includes('class')) {
        console.log('Codex generating code');
      }

    } else {
      // stderr - treat as potential errors
      console.warn('Codex stderr:', data);

      // Check for common OpenAI/Codex error patterns
      if (data.includes('invalid_api_key')) {
        console.error('Invalid OpenAI API key');
      } else if (data.includes('insufficient_quota')) {
        console.error('OpenAI API quota exceeded');
      } else if (data.includes('rate_limit_exceeded')) {
        console.error('OpenAI API rate limit exceeded');
      } else if (data.includes('model_not_found')) {
        console.error('Codex model not found or not available');
      } else if (data.includes('context_length_exceeded')) {
        console.error('Input context length exceeded for Codex model');
      }
    }
  }

  private async waitForReady(timeoutMs = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Codex to be ready'));
      }, timeoutMs);

      const checkReady = () => {
        if (this.status === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else if (this.status === 'error') {
          clearTimeout(timeout);
          reject(new Error('Codex failed to start'));
        }
      };

      // Check immediately and then on status changes
      checkReady();
      this.on('status_change', checkReady);

      // Also check for ready signals in output
      const outputListener = (stream: 'stdout' | 'stderr', chunk: OutputChunk) => {
        if (stream === 'stdout' && (
          chunk.data.includes('"protocol":') ||
          chunk.data.includes('"ready":true') ||
          chunk.data.includes('Connected') ||
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
      console.log(`Codex agent status changed: ${oldStatus} -> ${status}`);
      this.onStatusChange(status);
      this.emit('status_change', status, oldStatus);
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      const isHealthy = await this.healthCheck();
      if (!isHealthy && this.status !== 'error' && this.status !== 'stopping') {
        console.warn('Codex health check failed');
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

    console.log('Scheduling Codex agent restart in 5 seconds');
    this.restartTimer = setTimeout(async () => {
      try {
        await this.restart();
      } catch (error) {
        console.error('Failed to restart Codex agent:', error);
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
      // On Unix systems, we can use ps to get memory and CPU usage
      const { execSync } = require('child_process');
      const psOutput = execSync(`ps -p ${this.process.pid} -o %mem,%cpu --no-headers`, {
        encoding: 'utf8',
        timeout: 1000,
      });

      const [memPercent, cpuPercent] = psOutput.trim().split(/\s+/).map(Number);

      this.metadata.memoryUsage = memPercent;
      this.metadata.cpuUsage = cpuPercent;

    } catch (error) {
      // Ignore errors in resource monitoring
      console.debug('Failed to update resource usage:', error);
    }
  }
}