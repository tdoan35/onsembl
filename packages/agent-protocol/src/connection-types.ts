/**
 * Connection state types for WebSocket management
 */

export interface ConnectionInfo {
  id: string
  state: ConnectionState
  connectedAt?: number
  lastActivity?: number
  reconnectAttempts: number
  metadata?: ConnectionMetadata
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface ConnectionMetadata {
  userAgent?: string
  timezone?: string
  viewport?: {
    width: number
    height: number
  }
  version?: string
  platform?: string
}

export interface ReconnectionConfig {
  immediate: boolean
  baseDelay: number // Initial delay in ms
  maxDelay: number // Maximum delay in ms
  factor: number // Exponential factor
  jitter: number // Jitter percentage (0-1)
  maxAttempts?: number // Optional max attempts before giving up
}

export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  immediate: true,
  baseDelay: 1000,
  maxDelay: 30000,
  factor: 2,
  jitter: 0.2,
  maxAttempts: undefined // Unlimited by default
}

export interface ConnectionEvents {
  onConnect?: (info: ConnectionInfo) => void
  onDisconnect?: (info: ConnectionInfo, reason?: string) => void
  onReconnecting?: (info: ConnectionInfo, attempt: number) => void
  onReconnectFailed?: (info: ConnectionInfo, error: Error) => void
  onError?: (error: Error) => void
  onMessage?: (message: any) => void
}

export class ReconnectionStrategy {
  private config: ReconnectionConfig

  constructor(config: Partial<ReconnectionConfig> = {}) {
    this.config = { ...DEFAULT_RECONNECTION_CONFIG, ...config }
  }

  getDelay(attempt: number): number {
    if (attempt === 0 && this.config.immediate) {
      return 0
    }

    // Calculate exponential backoff
    const baseDelay = this.config.baseDelay * Math.pow(this.config.factor, attempt - 1)
    const delay = Math.min(baseDelay, this.config.maxDelay)

    // Add jitter
    const jitterRange = delay * this.config.jitter
    const jitter = (Math.random() - 0.5) * 2 * jitterRange

    return Math.round(delay + jitter)
  }

  shouldRetry(attempt: number): boolean {
    if (!this.config.maxAttempts) {
      return true
    }
    return attempt < this.config.maxAttempts
  }
}

export interface WebSocketManagerOptions {
  url: string
  protocols?: string[]
  reconnection?: Partial<ReconnectionConfig>
  heartbeatInterval?: number
  messageTimeout?: number
  events?: ConnectionEvents
}

export interface WebSocketStats {
  messagesSent: number
  messagesReceived: number
  bytessSent: number
  bytesReceived: number
  connectionTime?: number
  lastError?: Error
  reconnectCount: number
}