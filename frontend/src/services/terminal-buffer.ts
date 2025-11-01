/**
 * Terminal Buffer
 * Manages terminal output buffering and streaming
 */

export interface TerminalLine {
  content: string
  timestamp: number
  type: 'stdout' | 'stderr'
  ansiCodes?: string[]
  isCommand?: boolean  // Add flag to identify commands
}

export interface TerminalBufferOptions {
  maxLines?: number
  maxBufferSize?: number
  flushInterval?: number
  onFlush?: (lines: TerminalLine[]) => void
}

export class TerminalBuffer {
  private buffer: TerminalLine[] = []
  private pendingFlush: TerminalLine[] = []
  private options: Required<TerminalBufferOptions>
  private flushTimer: NodeJS.Timeout | null = null
  private totalBytes = 0
  private lineCount = 0

  constructor(options: TerminalBufferOptions = {}) {
    this.options = {
      maxLines: options.maxLines || 10000,
      maxBufferSize: options.maxBufferSize || 1024 * 1024, // 1MB
      flushInterval: options.flushInterval || 50, // 50ms
      onFlush: options.onFlush || (() => {})
    }
  }

  /**
   * Add output to the buffer
   */
  addOutput(
    content: string,
    type: 'stdout' | 'stderr' = 'stdout',
    ansiCodes?: string[],
    isCommand?: boolean
  ): void {
    const lines = content.split('\n')
    const timestamp = Date.now()

    for (const line of lines) {
      if (line.length === 0 && lines.length === 1) {
        continue // Skip single empty lines
      }

      const terminalLine: TerminalLine = {
        content: line,
        timestamp,
        type,
        ansiCodes,
        isCommand
      }

      this.addLine(terminalLine)
    }

    this.scheduleFlush()
  }

  /**
   * Add a line to the buffer
   */
  private addLine(line: TerminalLine): void {
    this.pendingFlush.push(line)
    this.buffer.push(line)
    this.lineCount++
    this.totalBytes += line.content.length

    // Trim buffer if it exceeds limits
    this.trimBuffer()
  }

  /**
   * Trim buffer to stay within limits
   */
  private trimBuffer(): void {
    // Trim by line count
    while (this.buffer.length > this.options.maxLines) {
      const removed = this.buffer.shift()
      if (removed) {
        this.totalBytes -= removed.content.length
        this.lineCount--
      }
    }

    // Trim by size
    while (this.totalBytes > this.options.maxBufferSize && this.buffer.length > 0) {
      const removed = this.buffer.shift()
      if (removed) {
        this.totalBytes -= removed.content.length
        this.lineCount--
      }
    }
  }

  /**
   * Schedule a flush operation
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return // Flush already scheduled
    }

    this.flushTimer = setTimeout(() => {
      this.flush()
    }, this.options.flushInterval)
  }

  /**
   * Flush pending output
   */
  flush(): void {
    if (this.pendingFlush.length === 0) {
      return
    }

    const lines = [...this.pendingFlush]
    this.pendingFlush = []

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    // Call flush callback
    this.options.onFlush(lines)
  }

  /**
   * Get all buffered lines
   */
  getLines(): TerminalLine[] {
    return [...this.buffer]
  }

  /**
   * Get lines after a specific timestamp
   */
  getLinesSince(timestamp: number): TerminalLine[] {
    return this.buffer.filter(line => line.timestamp > timestamp)
  }

  /**
   * Get the last N lines
   */
  getLastLines(count: number): TerminalLine[] {
    return this.buffer.slice(-count)
  }

  /**
   * Search for lines containing text
   */
  search(text: string, caseSensitive = false): TerminalLine[] {
    const searchText = caseSensitive ? text : text.toLowerCase()

    return this.buffer.filter(line => {
      const content = caseSensitive ? line.content : line.content.toLowerCase()
      return content.includes(searchText)
    })
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = []
    this.pendingFlush = []
    this.totalBytes = 0
    this.lineCount = 0

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    lineCount: number
    totalBytes: number
    oldestTimestamp?: number
    newestTimestamp?: number
  } {
    return {
      lineCount: this.lineCount,
      totalBytes: this.totalBytes,
      oldestTimestamp: this.buffer[0]?.timestamp,
      newestTimestamp: this.buffer[this.buffer.length - 1]?.timestamp
    }
  }

  /**
   * Export buffer as text
   */
  toText(): string {
    return this.buffer.map(line => line.content).join('\n')
  }

  /**
   * Export buffer with ANSI codes
   */
  toAnsiText(): string {
    return this.buffer.map(line => {
      if (line.ansiCodes && line.ansiCodes.length > 0) {
        return `\x1b[${line.ansiCodes.join(';')}m${line.content}\x1b[0m`
      }
      return line.content
    }).join('\n')
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clear()
  }
}

/**
 * Terminal buffer manager for multiple command outputs
 */
export class TerminalBufferManager {
  private buffers: Map<string, TerminalBuffer> = new Map()
  private defaultOptions: TerminalBufferOptions

  constructor(defaultOptions: TerminalBufferOptions = {}) {
    this.defaultOptions = defaultOptions
  }

  /**
   * Get or create a buffer for a command
   */
  getBuffer(commandId: string): TerminalBuffer {
    if (!this.buffers.has(commandId)) {
      this.buffers.set(commandId, new TerminalBuffer(this.defaultOptions))
    }
    return this.buffers.get(commandId)!
  }

  /**
   * Add output to a specific command's buffer
   */
  addOutput(
    commandId: string,
    content: string,
    type: 'stdout' | 'stderr' = 'stdout',
    ansiCodes?: string[],
    isCommand?: boolean
  ): void {
    const buffer = this.getBuffer(commandId)
    buffer.addOutput(content, type, ansiCodes, isCommand)
  }

  /**
   * Flush all buffers
   */
  flushAll(): void {
    for (const buffer of this.buffers.values()) {
      buffer.flush()
    }
  }

  /**
   * Clear a specific command's buffer
   */
  clearBuffer(commandId: string): void {
    const buffer = this.buffers.get(commandId)
    if (buffer) {
      buffer.clear()
    }
  }

  /**
   * Remove a command's buffer
   */
  removeBuffer(commandId: string): void {
    const buffer = this.buffers.get(commandId)
    if (buffer) {
      buffer.destroy()
      this.buffers.delete(commandId)
    }
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    for (const buffer of this.buffers.values()) {
      buffer.clear()
    }
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    for (const buffer of this.buffers.values()) {
      buffer.destroy()
    }
    this.buffers.clear()
  }
}