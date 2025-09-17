import type { TerminalOutput } from '@onsembl/agent-protocol/websocket';

export interface DebounceConfig {
  enabled?: boolean;
  delay?: number;
  maxDelay?: number;
  maxBufferSize?: number;
  mergeStrategy?: 'append' | 'replace' | 'smart';
}

interface DebouncedOutput {
  agentId: string;
  outputs: TerminalOutput[];
  timer?: NodeJS.Timeout;
  firstReceived: number;
  lastReceived: number;
}

export class TerminalDebouncer {
  private config: Required<DebounceConfig>;
  private buffers = new Map<string, DebouncedOutput>();
  private outputCallback?: (agentId: string, outputs: TerminalOutput[]) => void;

  constructor(config: DebounceConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      delay: config.delay ?? 50, // 50ms default debounce
      maxDelay: config.maxDelay ?? 200, // Max 200ms delay
      maxBufferSize: config.maxBufferSize ?? 100, // Max 100 outputs
      mergeStrategy: config.mergeStrategy ?? 'smart'
    };
  }

  /**
   * Set output callback
   */
  setOutputCallback(callback: (agentId: string, outputs: TerminalOutput[]) => void): void {
    this.outputCallback = callback;
  }

  /**
   * Add terminal output with debouncing
   */
  addOutput(agentId: string, output: TerminalOutput): void {
    if (!this.config.enabled) {
      // Pass through immediately
      if (this.outputCallback) {
        this.outputCallback(agentId, [output]);
      }
      return;
    }

    let buffer = this.buffers.get(agentId);

    if (!buffer) {
      buffer = {
        agentId,
        outputs: [],
        firstReceived: Date.now(),
        lastReceived: Date.now()
      };
      this.buffers.set(agentId, buffer);
    }

    // Add output to buffer
    this.mergeOutput(buffer, output);
    buffer.lastReceived = Date.now();

    // Clear existing timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    // Check if we should flush immediately
    if (this.shouldFlushImmediately(buffer)) {
      this.flush(agentId);
      return;
    }

    // Calculate delay
    const timeSinceFirst = Date.now() - buffer.firstReceived;
    const delay = Math.min(this.config.delay, this.config.maxDelay - timeSinceFirst);

    // Set new timer
    buffer.timer = setTimeout(() => {
      this.flush(agentId);
    }, Math.max(0, delay));
  }

  /**
   * Merge output into buffer based on strategy
   */
  private mergeOutput(buffer: DebouncedOutput, output: TerminalOutput): void {
    switch (this.config.mergeStrategy) {
      case 'append':
        buffer.outputs.push(output);
        break;

      case 'replace':
        buffer.outputs = [output];
        break;

      case 'smart':
        this.smartMerge(buffer, output);
        break;
    }
  }

  /**
   * Smart merge strategy
   */
  private smartMerge(buffer: DebouncedOutput, output: TerminalOutput): void {
    const lastOutput = buffer.outputs[buffer.outputs.length - 1];

    // Merge consecutive outputs of the same type
    if (lastOutput &&
        lastOutput.type === output.type &&
        this.isConsecutive(lastOutput, output)) {

      // Merge content
      if (output.type === 'stdout' || output.type === 'stderr') {
        lastOutput.content += output.content;
        lastOutput.timestamp = output.timestamp;
      } else {
        // For other types, just append
        buffer.outputs.push(output);
      }
    } else {
      // Different type or not consecutive, append
      buffer.outputs.push(output);
    }

    // Limit buffer size
    if (buffer.outputs.length > this.config.maxBufferSize) {
      // Keep the most recent outputs
      buffer.outputs = buffer.outputs.slice(-this.config.maxBufferSize);
    }
  }

  /**
   * Check if outputs are consecutive
   */
  private isConsecutive(prev: TerminalOutput, current: TerminalOutput): boolean {
    const prevTime = new Date(prev.timestamp).getTime();
    const currentTime = new Date(current.timestamp).getTime();

    // Consider consecutive if within 100ms
    return currentTime - prevTime < 100;
  }

  /**
   * Check if buffer should be flushed immediately
   */
  private shouldFlushImmediately(buffer: DebouncedOutput): boolean {
    // Flush if buffer is full
    if (buffer.outputs.length >= this.config.maxBufferSize) {
      return true;
    }

    // Flush if max delay reached
    const timeSinceFirst = Date.now() - buffer.firstReceived;
    if (timeSinceFirst >= this.config.maxDelay) {
      return true;
    }

    // Flush on important output types
    const lastOutput = buffer.outputs[buffer.outputs.length - 1];
    if (lastOutput && this.isImportantOutput(lastOutput)) {
      return true;
    }

    return false;
  }

  /**
   * Check if output is important and should flush immediately
   */
  private isImportantOutput(output: TerminalOutput): boolean {
    // Error outputs are important
    if (output.type === 'stderr') {
      return true;
    }

    // Command completions are important
    if (output.type === 'system' && output.content.includes('completed')) {
      return true;
    }

    // Prompts are important
    if (output.content.includes('$') || output.content.includes('>')) {
      return true;
    }

    return false;
  }

  /**
   * Flush buffer for an agent
   */
  flush(agentId: string): void {
    const buffer = this.buffers.get(agentId);
    if (!buffer || buffer.outputs.length === 0) return;

    // Clear timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = undefined;
    }

    // Send outputs
    if (this.outputCallback) {
      this.outputCallback(agentId, buffer.outputs.slice());
    }

    // Clear buffer
    buffer.outputs = [];
    buffer.firstReceived = Date.now();
  }

  /**
   * Flush all buffers
   */
  flushAll(): void {
    for (const agentId of this.buffers.keys()) {
      this.flush(agentId);
    }
  }

  /**
   * Clear buffer for an agent
   */
  clear(agentId: string): void {
    const buffer = this.buffers.get(agentId);
    if (buffer) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
      this.buffers.delete(agentId);
    }
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    for (const buffer of this.buffers.values()) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
    }
    this.buffers.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    agents: number;
    totalOutputs: number;
    oldestBuffer: number | null;
  } {
    let totalOutputs = 0;
    let oldestBuffer: number | null = null;

    for (const buffer of this.buffers.values()) {
      totalOutputs += buffer.outputs.length;

      if (buffer.outputs.length > 0) {
        if (oldestBuffer === null || buffer.firstReceived < oldestBuffer) {
          oldestBuffer = buffer.firstReceived;
        }
      }
    }

    return {
      agents: this.buffers.size,
      totalOutputs,
      oldestBuffer
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DebounceConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Stop all timers
   */
  stop(): void {
    for (const buffer of this.buffers.values()) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
    }
    this.buffers.clear();
  }
}

// Export singleton instance
export const terminalDebouncer = new TerminalDebouncer();