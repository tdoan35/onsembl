import { EventEmitter } from 'events';
import { Config } from '../config.js';
import { OutputChunk } from '../stream-capture.js';

export interface MockAgentOptions {
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
 * Mock agent for testing without actual CLI tools
 */
export class MockAgent extends EventEmitter {
  private config: Config;
  private status: AgentStatus = 'stopped';
  private metadata: AgentMetadata;
  private simulationTimer: NodeJS.Timeout | null = null;

  private onOutput: (stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  private onError: (error: Error) => void;
  private onStatusChange: (status: AgentStatus) => void;

  constructor(options: MockAgentOptions) {
    super();
    this.config = options.config;
    this.onOutput = options.onOutput;
    this.onError = options.onError;
    this.onStatusChange = options.onStatusChange;

    this.metadata = {
      version: '1.0.0-mock',
      capabilities: ['execute', 'interrupt', 'trace'],
      startTime: new Date(),
      restartCount: 0,
      pid: process.pid,
    };
  }

  async start(): Promise<void> {
    if (this.status !== 'stopped') {
      throw new Error('Mock agent is already running');
    }

    console.log('Starting Mock agent (simulated)');
    this.setStatus('starting');

    // Simulate startup delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    this.setStatus('ready');
    console.log('Mock agent ready');

    // Start simulation of periodic status updates
    this.simulationTimer = setInterval(() => {
      this.metadata.memoryUsage = Math.random() * 100;
      this.metadata.cpuUsage = Math.random() * 50;
    }, 5000);
  }

  async stop(): Promise<void> {
    console.log('Stopping Mock agent');
    this.setStatus('stopping');

    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    this.setStatus('stopped');
  }

  async executeCommand(command: string): Promise<void> {
    if (this.status !== 'ready') {
      throw new Error('Mock agent is not ready');
    }

    this.setStatus('busy');
    console.log(`Mock agent executing: ${command}`);

    // Simulate command output
    await this.onOutput('stdout', {
      data: `Mock execution of: ${command}\n`,
      ansiCodes: [],
    });

    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.onOutput('stdout', {
      data: 'Command completed successfully\n',
      ansiCodes: [],
    });

    this.setStatus('ready');
  }

  async interrupt(): Promise<void> {
    if (this.status === 'busy') {
      console.log('Mock agent interrupted');
      this.setStatus('ready');
    }
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getMetadata(): AgentMetadata {
    return { ...this.metadata };
  }

  async destroy(): Promise<void> {
    await this.stop();
  }

  private setStatus(status: AgentStatus): void {
    const oldStatus = this.status;
    this.status = status;
    console.log(`Mock agent status changed: ${oldStatus} -> ${status}`);
    this.onStatusChange(status);
  }
}