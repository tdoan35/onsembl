import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Config } from './config.js';
import { StreamCapture, OutputChunk } from './stream-capture.js';
import { CommandMessage } from './websocket-client.js';

export interface ExecutionResult {
  commandId: string;
  exitCode: number;
  duration: number;
  error?: string;
  llmTraces?: LLMTrace[];
}

export interface LLMTrace {
  timestamp: Date;
  type: 'request' | 'response' | 'error';
  model?: string;
  tokens?: {
    input: number;
    output: number;
  };
  content?: string;
  error?: string;
}

export interface CommandExecutorOptions {
  config: Config;
  onOutput: (commandId: string, stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  onComplete: (result: ExecutionResult) => Promise<void>;
  onError: (commandId: string, error: Error) => void;
}

export class CommandExecutor extends EventEmitter {
  private config: Config;
  private activeCommands = new Map<string, ActiveCommand>();

  private onOutput: (commandId: string, stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  private onComplete: (result: ExecutionResult) => Promise<void>;
  private onError: (commandId: string, error: Error) => void;

  constructor(options: CommandExecutorOptions) {
    super();
    this.config = options.config;
    this.onOutput = options.onOutput;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  /**
   * Execute a command
   */
  async executeCommand(command: CommandMessage): Promise<void> {
    const { commandId, command: cmd, args = [], options = {} } = command;

    if (this.activeCommands.has(commandId)) {
      throw new Error(`Command ${commandId} is already running`);
    }

    console.log(`Executing command ${commandId}: ${cmd} ${args.join(' ')}`);

    const startTime = Date.now();
    const activeCommand: ActiveCommand = {
      commandId,
      process: null,
      startTime,
      streamCapture: null,
      llmTraces: [],
      cancelled: false,
    };

    this.activeCommands.set(commandId, activeCommand);

    try {
      // Prepare execution environment
      const execOptions = {
        cwd: options.workingDirectory || this.config.workingDirectory,
        env: {
          ...process.env,
          ...options.environment,
        },
        stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      };

      // Apply resource limits if available
      if (process.platform === 'linux') {
        // Note: ulimit and resource limits would need proper implementation
        // This is a simplified version
      }

      // Spawn the process
      const childProcess = spawn(cmd, args, execOptions);
      activeCommand.process = childProcess;

      // Set up stream capture
      const streamCapture = new StreamCapture({
        config: this.config,
        onOutput: async (stream, chunk) => {
          // Check for LLM traces in output
          this.extractLLMTraces(chunk.data, activeCommand);

          // Forward output
          await this.onOutput(commandId, stream, chunk);
        },
        onError: (error) => {
          this.onError(commandId, error);
        },
      });

      activeCommand.streamCapture = streamCapture;

      // Attach stream capture
      if (childProcess.stdout && childProcess.stderr) {
        streamCapture.attachToStreams(childProcess.stdout, childProcess.stderr);
        streamCapture.startAutoFlush();
      }

      // Handle process events
      childProcess.on('close', async (code, signal) => {
        const duration = Date.now() - startTime;
        let error: string | undefined;

        if (signal) {
          error = `Process killed with signal ${signal}`;
        } else if (code !== 0 && !activeCommand.cancelled) {
          error = `Process exited with code ${code}`;
        }

        // Clean up
        streamCapture.destroy();
        this.activeCommands.delete(commandId);

        // Send completion result
        const result: ExecutionResult = {
          commandId,
          exitCode: code || 0,
          duration,
          error,
          llmTraces: activeCommand.llmTraces,
        };

        await this.onComplete(result);
      });

      childProcess.on('error', (error) => {
        console.error(`Process error for command ${commandId}:`, error);
        this.onError(commandId, error);

        // Clean up
        if (activeCommand.streamCapture) {
          activeCommand.streamCapture.destroy();
        }
        this.activeCommands.delete(commandId);
      });

      // Set up timeout if specified
      if (options.timeout) {
        setTimeout(() => {
          if (this.activeCommands.has(commandId)) {
            this.cancelCommand(commandId, 'timeout');
          }
        }, options.timeout);
      }

      this.emit('command_started', commandId);

    } catch (error) {
      // Clean up on error
      this.activeCommands.delete(commandId);
      throw error;
    }
  }

  /**
   * Cancel a running command
   */
  async cancelCommand(commandId: string, reason = 'cancelled'): Promise<void> {
    const activeCommand = this.activeCommands.get(commandId);
    if (!activeCommand) {
      throw new Error(`Command ${commandId} not found`);
    }

    console.log(`Cancelling command ${commandId}: ${reason}`);

    activeCommand.cancelled = true;

    if (activeCommand.process) {
      // Try graceful termination first
      activeCommand.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (activeCommand.process && !activeCommand.process.killed) {
          activeCommand.process.kill('SIGKILL');
        }
      }, 5000);
    }

    this.emit('command_cancelled', commandId, reason);
  }

  /**
   * Get status of all active commands
   */
  getActiveCommands(): string[] {
    return Array.from(this.activeCommands.keys());
  }

  /**
   * Check if a command is running
   */
  isCommandRunning(commandId: string): boolean {
    return this.activeCommands.has(commandId);
  }

  /**
   * Get command information
   */
  getCommandInfo(commandId: string): ActiveCommandInfo | null {
    const activeCommand = this.activeCommands.get(commandId);
    if (!activeCommand) {
      return null;
    }

    return {
      commandId,
      startTime: activeCommand.startTime,
      duration: Date.now() - activeCommand.startTime,
      pid: activeCommand.process?.pid,
      cancelled: activeCommand.cancelled,
    };
  }

  /**
   * Cancel all active commands
   */
  async cancelAllCommands(reason = 'shutdown'): Promise<void> {
    const commandIds = Array.from(this.activeCommands.keys());
    const cancelPromises = commandIds.map(id => this.cancelCommand(id, reason));
    await Promise.allSettled(cancelPromises);
  }

  /**
   * Destroy the executor and clean up resources
   */
  async destroy(): Promise<void> {
    await this.cancelAllCommands('destroy');
    this.removeAllListeners();
  }

  private extractLLMTraces(output: string, activeCommand: ActiveCommand): void {
    // Look for common LLM trace patterns in output
    const patterns = [
      // Claude traces
      /Claude.*(?:request|response|error)/i,
      /Anthropic.*(?:API|token)/i,

      // OpenAI/Codex traces
      /OpenAI.*(?:request|response|error)/i,
      /GPT-.*(?:completion|chat)/i,

      // Gemini traces
      /Gemini.*(?:request|response|error)/i,
      /Google.*AI.*(?:API|token)/i,

      // Generic patterns
      /(?:tokens?|completion|prompt).*\d+/i,
      /(?:model|llm):\s*[\w-]+/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(output)) {
        const trace: LLMTrace = {
          timestamp: new Date(),
          type: this.inferTraceType(output),
          content: this.extractTraceContent(output),
        };

        // Extract model information
        const modelMatch = output.match(/(?:model|llm):\s*([\w-]+)/i);
        if (modelMatch) {
          trace.model = modelMatch[1];
        }

        // Extract token information
        const tokenMatch = output.match(/tokens?.*?(\d+)/i);
        if (tokenMatch) {
          trace.tokens = {
            input: parseInt(tokenMatch[1], 10),
            output: 0, // Would need more sophisticated parsing
          };
        }

        activeCommand.llmTraces.push(trace);
        break; // Only add one trace per output chunk
      }
    }
  }

  private inferTraceType(output: string): LLMTrace['type'] {
    if (/error|fail|exception/i.test(output)) {
      return 'error';
    } else if (/response|completion|result/i.test(output)) {
      return 'response';
    } else {
      return 'request';
    }
  }

  private extractTraceContent(output: string): string {
    // Extract relevant content, limiting length
    const maxLength = 500;
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10 && trimmed.length < maxLength) {
        return trimmed;
      }
    }

    return output.substring(0, maxLength);
  }
}

interface ActiveCommand {
  commandId: string;
  process: ChildProcess | null;
  startTime: number;
  streamCapture: StreamCapture | null;
  llmTraces: LLMTrace[];
  cancelled: boolean;
}

interface ActiveCommandInfo {
  commandId: string;
  startTime: number;
  duration: number;
  pid?: number;
  cancelled: boolean;
}