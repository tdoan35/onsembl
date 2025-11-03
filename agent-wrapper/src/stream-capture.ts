import { Transform, Readable } from 'stream';
import { EventEmitter } from 'events';
import { Config } from './config.js';

// ANSI escape code patterns
const ANSI_REGEX = /\x1b\[[0-9;]*[mGKHF]/g;
const ANSI_COLOR_REGEX = /\x1b\[([0-9;]+)m/g;

export interface OutputChunk {
  data: string;
  ansiCodes?: string | undefined;
  timestamp: Date;
  isBlank?: boolean;
}

export interface StreamCaptureOptions {
  config: Config;
  onOutput: (stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  onError: (error: Error) => void;
}

/**
 * Stream capture class for handling process output with ANSI code parsing
 */
export class StreamCapture extends EventEmitter {
  private config: Config;
  private onOutput: (stream: 'stdout' | 'stderr', chunk: OutputChunk) => Promise<void>;
  private onError: (error: Error) => void;

  private stdoutBuffer: Buffer = Buffer.alloc(0);
  private stderrBuffer: Buffer = Buffer.alloc(0);
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(options: StreamCaptureOptions) {
    super();
    this.config = options.config;
    this.onOutput = options.onOutput;
    this.onError = options.onError;
  }

  /**
   * Create a transform stream for capturing stdout
   */
  createStdoutCapture(): Transform {
    return this.createCaptureStream('stdout');
  }

  /**
   * Create a transform stream for capturing stderr
   */
  createStderrCapture(): Transform {
    return this.createCaptureStream('stderr');
  }

  /**
   * Attach to existing readable streams
   */
  attachToStreams(stdout: Readable, stderr: Readable): void {
    stdout.pipe(this.createStdoutCapture());
    stderr.pipe(this.createStderrCapture());
  }

  /**
   * Flush any remaining buffered output
   */
  flush(): void {
    if (this.stdoutBuffer.length > 0) {
      this.processBuffer('stdout', this.stdoutBuffer);
      this.stdoutBuffer = Buffer.alloc(0);
    }

    if (this.stderrBuffer.length > 0) {
      this.processBuffer('stderr', this.stderrBuffer);
      this.stderrBuffer = Buffer.alloc(0);
    }
  }

  /**
   * Start automatic flushing of buffers
   */
  startAutoFlush(): void {
    this.stopAutoFlush();

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.outputFlushInterval);
  }

  /**
   * Stop automatic flushing
   */
  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Destroy the stream capture and clean up resources
   */
  destroy(): void {
    this.stopAutoFlush();
    this.flush();
    this.removeAllListeners();
  }

  private createCaptureStream(streamType: 'stdout' | 'stderr'): Transform {
    return new Transform({
      transform: (chunk: Buffer, encoding, callback) => {
        try {
          this.handleChunk(streamType, chunk);
          callback(null, chunk); // Pass through the original chunk
        } catch (error) {
          this.onError(error as Error);
          callback(error as Error);
        }
      },
      flush: (callback) => {
        this.flush();
        callback();
      }
    });
  }

  private handleChunk(streamType: 'stdout' | 'stderr', chunk: Buffer): void {
    const buffer = streamType === 'stdout' ? this.stdoutBuffer : this.stderrBuffer;
    const newBuffer = Buffer.concat([buffer, chunk]);

    // Check if buffer exceeds maximum size
    if (newBuffer.length > this.config.outputBufferSize) {
      // Process the buffer and reset
      this.processBuffer(streamType, newBuffer);

      if (streamType === 'stdout') {
        this.stdoutBuffer = Buffer.alloc(0);
      } else {
        this.stderrBuffer = Buffer.alloc(0);
      }
    } else {
      // Update the buffer
      if (streamType === 'stdout') {
        this.stdoutBuffer = newBuffer;
      } else {
        this.stderrBuffer = newBuffer;
      }
    }

    // Check for complete lines and process them
    this.processCompleteLines(streamType);
  }

  private processCompleteLines(streamType: 'stdout' | 'stderr'): void {
    const buffer = streamType === 'stdout' ? this.stdoutBuffer : this.stderrBuffer;
    const data = buffer.toString('utf8');

    // Normalize CRLF to LF for consistent handling across platforms
    const normalized = data.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    // Keep the last incomplete line in the buffer
    if (lines.length > 1) {
      const completeLines = lines.slice(0, -1);
      const incompleteLine = lines[lines.length - 1];

      // Process all complete lines (including blank lines)
      for (const line of completeLines) {
        // Detect if line is blank (only whitespace)
        const isBlank = line.trim().length === 0;
        this.processLine(streamType, line + '\n', { isBlank });
      }

      // Update buffer with remaining incomplete line
      const newBuffer = Buffer.from(incompleteLine || '', 'utf8');
      if (streamType === 'stdout') {
        this.stdoutBuffer = newBuffer;
      } else {
        this.stderrBuffer = newBuffer;
      }
    }
  }

  private processBuffer(streamType: 'stdout' | 'stderr', buffer: Buffer): void {
    const data = buffer.toString('utf8');
    if (data.length > 0) {
      this.processLine(streamType, data);
    }
  }

  private processLine(streamType: 'stdout' | 'stderr', line: string, metadata?: { isBlank: boolean }): void {
    try {
      const { cleanText, ansiCodes } = this.parseAnsiCodes(line);

      const chunk: OutputChunk = {
        data: cleanText,
        timestamp: new Date(),
        ...(ansiCodes.length > 0 && { ansiCodes: ansiCodes.join('') }),
        ...(metadata?.isBlank !== undefined && { isBlank: metadata.isBlank }),
      };

      // Send output asynchronously
      this.onOutput(streamType, chunk).catch(error => {
        this.onError(error);
      });

      this.emit('output', streamType, chunk);
    } catch (error) {
      this.onError(error as Error);
    }
  }

  private parseAnsiCodes(text: string): { cleanText: string; ansiCodes: string[] } {
    const ansiCodes: string[] = [];
    let match;

    // Extract ANSI escape sequences
    while ((match = ANSI_COLOR_REGEX.exec(text)) !== null) {
      ansiCodes.push(match[0]);
    }

    // Remove ANSI codes to get clean text
    const cleanText = text.replace(ANSI_REGEX, '');

    return { cleanText, ansiCodes };
  }
}

/**
 * Utility functions for ANSI code handling
 */
export class AnsiParser {
  /**
   * Parse ANSI color codes into CSS styles
   */
  static parseAnsiToCss(ansiCodes: string[]): Record<string, string> {
    const styles: Record<string, string> = {};

    for (const code of ansiCodes) {
      const match = code.match(/\x1b\[([0-9;]+)m/);
      if (!match) continue;

      const params = match?.[1]?.split(';').map(Number) || [];

      for (const param of params) {
        switch (param) {
          case 0: // Reset
            return {};
          case 1: // Bold
            styles['fontWeight'] = 'bold';
            break;
          case 3: // Italic
            styles['fontStyle'] = 'italic';
            break;
          case 4: // Underline
            styles['textDecoration'] = 'underline';
            break;
          case 30: styles['color'] = '#000000'; break; // Black
          case 31: styles['color'] = '#cd0000'; break; // Red
          case 32: styles['color'] = '#00cd00'; break; // Green
          case 33: styles['color'] = '#cdcd00'; break; // Yellow
          case 34: styles['color'] = '#0000ee'; break; // Blue
          case 35: styles['color'] = '#cd00cd'; break; // Magenta
          case 36: styles['color'] = '#00cdcd'; break; // Cyan
          case 37: styles['color'] = '#e5e5e5'; break; // White
          case 90: styles['color'] = '#7f7f7f'; break; // Bright Black
          case 91: styles['color'] = '#ff0000'; break; // Bright Red
          case 92: styles['color'] = '#00ff00'; break; // Bright Green
          case 93: styles['color'] = '#ffff00'; break; // Bright Yellow
          case 94: styles['color'] = '#5c5cff'; break; // Bright Blue
          case 95: styles['color'] = '#ff00ff'; break; // Bright Magenta
          case 96: styles['color'] = '#00ffff'; break; // Bright Cyan
          case 97: styles['color'] = '#ffffff'; break; // Bright White
          case 40: styles['backgroundColor'] = '#000000'; break; // Black background
          case 41: styles['backgroundColor'] = '#cd0000'; break; // Red background
          case 42: styles['backgroundColor'] = '#00cd00'; break; // Green background
          case 43: styles['backgroundColor'] = '#cdcd00'; break; // Yellow background
          case 44: styles['backgroundColor'] = '#0000ee'; break; // Blue background
          case 45: styles['backgroundColor'] = '#cd00cd'; break; // Magenta background
          case 46: styles['backgroundColor'] = '#00cdcd'; break; // Cyan background
          case 47: styles['backgroundColor'] = '#e5e5e5'; break; // White background
        }
      }
    }

    return styles;
  }

  /**
   * Check if text contains binary data
   */
  static isBinary(data: Buffer | string): boolean {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // Check for null bytes (common in binary files)
    for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    // Check for high percentage of non-printable characters
    let nonPrintable = 0;
    for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
      const byte = buffer[i];
      if (byte !== undefined && byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintable++;
      }
    }

    return nonPrintable / Math.min(buffer.length, 1024) > 0.3;
  }

  /**
   * Sanitize text for safe transmission
   */
  static sanitizeText(text: string): string {
    // Remove or replace problematic characters
    return text
      .replace(/\u0000/g, '') // Remove null bytes
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove control characters except tab, newline, carriage return
      .substring(0, 10000); // Limit length to prevent memory issues
  }
}