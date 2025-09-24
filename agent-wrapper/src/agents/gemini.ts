import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Config, getAgentEnvironment } from '../config.js';
import { StreamCapture, OutputChunk } from '../stream-capture.js';
import { AgentStatus, AgentMetadata } from './claude.js';

export interface GeminiAgentOptions {
  config: Config;
  onOutput: (stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  onError: (error: Error) => void;
  onStatusChange: (status: AgentStatus) => void;
}

/**
 * Gemini agent process manager
 */
export class GeminiAgent extends EventEmitter {
  private config: Config;
  private process: ChildProcess | null = null;
  private streamCapture: StreamCapture | null = null;
  private status: AgentStatus = 'stopped';
  private metadata: AgentMetadata;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;

  private onOutput: (
    stream: 'stdout' | 'stderr',
    chunk: OutputChunk,
  ) => Promise<void>;
  private onError: (error: Error) => void;
  private onStatusChange: (status: AgentStatus) => void;

  constructor(options: GeminiAgentOptions) {
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
   * Start the Gemini agent process
   */
  async start(): Promise<void> {
    if (this.process || this.status === 'starting') {
      throw new Error('Gemini agent is already running or starting');
    }

    console.log('Starting Gemini agent process');
    this.setStatus('starting');

    try {
      // Validate Gemini command exists
      if (!this.validateCommand()) {
        throw new Error(
          `Gemini command '${this.config.agentCommand}' not found in PATH`,
        );
      }

      // Prepare command arguments
      const args = this.buildCommandArgs();
      const env = getAgentEnvironment(this.config);

      // Spawn Gemini process
      this.process = spawn(this.config.agentCommand!, args, {
        cwd: this.config.workingDirectory,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (this.process.pid !== undefined) {
        this.metadata.pid = this.process.pid;
      }

      // Set up stream capture
      this.streamCapture = new StreamCapture({
        config: this.config,
        onOutput: async (stream, chunk) => {
          // Process Gemini-specific output
          this.processOutput(stream, chunk);
          await this.onOutput(stream, chunk);
        },
        onError: this.onError,
      });

      // Attach to process streams
      if (this.process.stdout && this.process.stderr) {
        this.streamCapture.attachToStreams(
          this.process.stdout,
          this.process.stderr,
        );
        this.streamCapture.startAutoFlush();
      }

      // Set up process event handlers
      this.setupProcessHandlers();

      // Start health monitoring
      this.startHealthCheck();

      // Wait for Gemini to be ready
      await this.waitForReady();

      this.setStatus('ready');
      console.log('Gemini agent started successfully');
    } catch (error) {
      this.setStatus('error');
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the Gemini agent process
   */
  async stop(): Promise<void> {
    if (
      !this.process ||
      this.status === 'stopping' ||
      this.status === 'stopped'
    ) {
      return;
    }

    console.log('Stopping Gemini agent process');
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
      console.log('Gemini agent stopped');
    }
  }

  /**
   * Restart the Gemini agent process
   */
  async restart(): Promise<void> {
    console.log('Restarting Gemini agent process');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    await this.start();
    this.metadata.restartCount++;
  }

  /**
   * Send input to the Gemini process
   */
  async sendInput(input: string): Promise<void> {
    if (!this.process || !this.process.stdin || this.status !== 'ready') {
      throw new Error('Gemini agent is not ready for input');
    }

    this.setStatus('busy');

    try {
      this.process.stdin.write(input + '\n');
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

      // Additional Gemini-specific health checks could go here
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

    // Add model configuration - Gemini CLI uses -m/--model
    if (this.config.gemini.model) {
      args.push('--model', this.config.gemini.model);
    }

    // Use auto-approval mode for programmatic interaction
    args.push('--approval-mode', 'yolo');

    // Enable debug mode for better output tracking
    args.push('--debug');

    // Interactive prompt mode with initial prompt
    args.push('--prompt-interactive', 'Ready to assist with coding tasks');

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
      'multimodal', // Gemini supports images
      'web-search',
      'function-calling',
    ];
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.on('exit', (code, signal) => {
      console.log(`Gemini process exited with code ${code}, signal ${signal}`);

      if (this.status !== 'stopping') {
        // Unexpected exit, attempt restart if configured
        this.setStatus('error');
        this.scheduleRestart();
      }
    });

    this.process.on('error', error => {
      console.error('Gemini process error:', error);
      this.setStatus('error');
      this.onError(error);
    });

    // Handle process signals
    this.process.on('SIGTERM', () => {
      console.log('Gemini process received SIGTERM');
    });

    this.process.on('SIGKILL', () => {
      console.log('Gemini process received SIGKILL');
    });
  }

  private processOutput(stream: 'stdout' | 'stderr', chunk: OutputChunk): void {
    const data = chunk.data;

    // Look for Gemini-specific patterns
    if (stream === 'stdout') {
      // Check for ready signal - Gemini CLI prompts
      if (
        data.includes('Ready') ||
        data.includes('gemini>') ||
        data.includes('Gemini CLI') ||
        data.includes('>') ||
        this.status === 'starting'
      ) {
        if (this.status === 'starting' || this.status === 'busy') {
          this.setStatus('ready');
        }
      }

      // Check for error patterns
      if (
        data.includes('Error:') ||
        data.includes('Exception:') ||
        data.includes('API_ERROR')
      ) {
        console.warn('Gemini output contains error:', data);
      }

      // Extract model information if available
      const modelMatch = data.match(/Model:\s*(gemini-[\w-]+)/i);
      if (modelMatch && modelMatch[1]) {
        this.metadata.version = modelMatch[1];
      }

      // Check for safety filtering
      if (data.includes('SAFETY') || data.includes('blocked')) {
        console.warn('Gemini response was blocked by safety filters:', data);
      }

      // Check for function calling
      if (data.includes('function_call') || data.includes('tool_use')) {
        console.log('Gemini is making function calls');
      }
    } else {
      // stderr - treat as potential errors
      console.warn('Gemini stderr:', data);

      // Check for common Gemini error patterns
      if (data.includes('QUOTA_EXCEEDED')) {
        console.error('Gemini API quota exceeded');
      } else if (data.includes('INVALID_API_KEY')) {
        console.error('Invalid Gemini API key');
      } else if (data.includes('PERMISSION_DENIED')) {
        console.error('Gemini API permission denied');
      }
    }
  }

  private async waitForReady(timeoutMs = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Gemini to be ready'));
      }, timeoutMs);

      const checkReady = () => {
        if (this.status === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else if (this.status === 'error') {
          clearTimeout(timeout);
          reject(new Error('Gemini failed to start'));
        }
      };

      // Check immediately and then on status changes
      checkReady();
      this.on('status_change', checkReady);

      // Also check for ready signals in output
      const outputListener = (
        stream: 'stdout' | 'stderr',
        chunk: OutputChunk,
      ) => {
        if (
          stream === 'stdout' &&
          (chunk.data.includes('Ready') ||
            chunk.data.includes('gemini>') ||
            chunk.data.includes('Gemini CLI') ||
            chunk.data.includes('>') ||
            this.status === 'starting')
        ) {
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
    delete this.metadata.pid;
  }

  private setStatus(status: AgentStatus): void {
    if (this.status !== status) {
      const oldStatus = this.status;
      this.status = status;
      console.log(`Gemini agent status changed: ${oldStatus} -> ${status}`);
      this.onStatusChange(status);
      this.emit('status_change', status, oldStatus);
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      const isHealthy = await this.healthCheck();
      if (!isHealthy && this.status !== 'error' && this.status !== 'stopping') {
        console.warn('Gemini health check failed');
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

    console.log('Scheduling Gemini agent restart in 5 seconds');
    this.restartTimer = setTimeout(async () => {
      try {
        await this.restart();
      } catch (error) {
        console.error('Failed to restart Gemini agent:', error);
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
      const psOutput = execSync(
        `ps -p ${this.process.pid} -o %mem,%cpu --no-headers`,
        {
          encoding: 'utf8',
          timeout: 1000,
        },
      );

      const [memPercent, cpuPercent] = psOutput.trim().split(/\s+/).map(Number);

      this.metadata.memoryUsage = memPercent;
      this.metadata.cpuUsage = cpuPercent;
    } catch (error) {
      // Ignore errors in resource monitoring
      console.debug('Failed to update resource usage:', error);
    }
  }
}
