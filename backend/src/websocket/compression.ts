import { WebSocket } from 'ws';
import zlib from 'zlib';
import { promisify } from 'util';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

export interface CompressionConfig {
  enabled?: boolean;
  threshold?: number; // Minimum size to compress (bytes)
  algorithm?: 'gzip' | 'deflate' | 'brotli';
  level?: number; // Compression level (1-9)
  compressibleTypes?: string[];
  excludeTypes?: string[];
}

interface CompressedMessage {
  type: 'compressed';
  algorithm: string;
  originalType: string;
  originalSize: number;
  compressedSize: number;
  data: string; // Base64 encoded compressed data
  timestamp: string;
}

export class CompressionHandler {
  private config: Required<CompressionConfig>;
  private compressionStats = {
    totalCompressed: 0,
    totalUncompressed: 0,
    bytesSaved: 0,
    compressionRatio: 0
  };

  constructor(config: CompressionConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      threshold: config.threshold ?? 1024, // 1KB
      algorithm: config.algorithm ?? 'gzip',
      level: config.level ?? 6,
      compressibleTypes: config.compressibleTypes ?? [
        'terminal:output',
        'trace:data',
        'log:batch',
        'file:content'
      ],
      excludeTypes: config.excludeTypes ?? [
        'heartbeat:ping',
        'heartbeat:pong',
        'auth:token'
      ]
    };
  }

  /**
   * Compress message if applicable
   */
  async compressMessage(message: WebSocketMessage): Promise<string> {
    if (!this.config.enabled) {
      return JSON.stringify(message);
    }

    const original = JSON.stringify(message);
    const size = Buffer.byteLength(original);

    // Check if compression is needed
    if (!this.shouldCompress(message, size)) {
      this.compressionStats.totalUncompressed++;
      return original;
    }

    try {
      // Compress the message
      const compressed = await this.compress(Buffer.from(original));

      // Check if compression actually reduced size
      if (compressed.length >= size) {
        this.compressionStats.totalUncompressed++;
        return original;
      }

      // Create compressed message wrapper
      const compressedMessage: CompressedMessage = {
        type: 'compressed',
        algorithm: this.config.algorithm,
        originalType: message.type,
        originalSize: size,
        compressedSize: compressed.length,
        data: compressed.toString('base64'),
        timestamp: new Date().toISOString()
      };

      // Update stats
      this.compressionStats.totalCompressed++;
      this.compressionStats.bytesSaved += size - compressed.length;
      this.updateCompressionRatio();

      return JSON.stringify(compressedMessage);

    } catch (error) {
      // Compression error occurred, falling back to uncompressed
      return original;
    }
  }

  /**
   * Decompress message if needed
   */
  async decompressMessage(data: string | Buffer): Promise<WebSocketMessage> {
    try {
      const text = typeof data === 'string' ? data : data.toString();
      const parsed = JSON.parse(text);

      // Check if it's a compressed message
      if (parsed.type === 'compressed') {
        const compressed = parsed as CompressedMessage;
        const buffer = Buffer.from(compressed.data, 'base64');
        const decompressed = await this.decompress(buffer, compressed.algorithm);
        return JSON.parse(decompressed.toString());
      }

      return parsed;

    } catch (error) {
      // If it's not JSON or compressed, return as-is
      throw new Error(`Failed to decompress message: ${error}`);
    }
  }

  /**
   * Check if message should be compressed
   */
  private shouldCompress(message: WebSocketMessage, size: number): boolean {
    // Check size threshold
    if (size < this.config.threshold) {
      return false;
    }

    // Check excluded types
    if (this.config.excludeTypes.includes(message.type)) {
      return false;
    }

    // Check if type is compressible
    if (this.config.compressibleTypes.length > 0) {
      return this.config.compressibleTypes.includes(message.type);
    }

    return true;
  }

  /**
   * Compress data
   */
  private async compress(data: Buffer): Promise<Buffer> {
    const options = { level: this.config.level };

    switch (this.config.algorithm) {
      case 'gzip':
        return gzip(data, options);

      case 'deflate':
        return deflate(data, options);

      case 'brotli':
        return promisify(zlib.brotliCompress)(data, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: this.config.level
          }
        });

      default:
        throw new Error(`Unsupported algorithm: ${this.config.algorithm}`);
    }
  }

  /**
   * Decompress data
   */
  private async decompress(data: Buffer, algorithm?: string): Promise<Buffer> {
    const algo = algorithm || this.config.algorithm;

    switch (algo) {
      case 'gzip':
        return gunzip(data);

      case 'deflate':
        return inflate(data);

      case 'brotli':
        return promisify(zlib.brotliDecompress)(data);

      default:
        throw new Error(`Unsupported algorithm: ${algo}`);
    }
  }

  /**
   * Enable per-message compression for WebSocket
   */
  configureWebSocket(socket: WebSocket): void {
    if (!this.config.enabled) return;

    // Store original send method
    const originalSend = socket.send.bind(socket);

    // Override send method to compress
    socket.send = async (data: any, cb?: (err?: Error) => void) => {
      try {
        if (typeof data === 'string') {
          const message = JSON.parse(data);
          const compressed = await this.compressMessage(message);
          originalSend(compressed, cb);
        } else {
          originalSend(data, cb);
        }
      } catch (error) {
        if (cb) cb(error as Error);
      }
    };
  }

  /**
   * Update compression ratio
   */
  private updateCompressionRatio(): void {
    const total = this.compressionStats.totalCompressed + this.compressionStats.totalUncompressed;
    if (total > 0) {
      this.compressionStats.compressionRatio =
        this.compressionStats.totalCompressed / total;
    }
  }

  /**
   * Get compression statistics
   */
  getStats(): typeof this.compressionStats {
    return { ...this.compressionStats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.compressionStats = {
      totalCompressed: 0,
      totalUncompressed: 0,
      bytesSaved: 0,
      compressionRatio: 0
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CompressionConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get estimated compression ratio for a message type
   */
  estimateCompressionRatio(messageType: string): number {
    // Based on typical compression ratios
    const ratios: Record<string, number> = {
      'terminal:output': 0.3, // Terminal output compresses well
      'trace:data': 0.4,      // JSON trace data
      'log:batch': 0.35,      // Log entries
      'file:content': 0.25,   // Source code
      'agent:metrics': 0.6,   // Numeric data
      'default': 0.5
    };

    return ratios[messageType] || ratios.default;
  }
}

// Export singleton instance
export const compressionHandler = new CompressionHandler();