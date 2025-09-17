/**
 * Reconnection Manager
 * Handles WebSocket reconnection with exponential backoff
 */

import { ReconnectionStrategy } from '@onsembl/agent-protocol'

export interface ReconnectionManagerOptions {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
  factor?: number
  jitter?: number
  onReconnect: () => void
  onGiveUp?: () => void
}

export class ReconnectionManager {
  private strategy: ReconnectionStrategy
  private options: ReconnectionManagerOptions
  private reconnectTimer: NodeJS.Timeout | null = null
  private currentAttempt = 0
  private isActive = false

  constructor(options: ReconnectionManagerOptions) {
    this.options = options
    this.strategy = new ReconnectionStrategy({
      immediate: true,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      factor: options.factor || 2,
      jitter: options.jitter || 0.1,
      maxAttempts: options.maxAttempts
    })
  }

  /**
   * Schedule a reconnection attempt
   */
  scheduleReconnect(attempt?: number): void {
    if (!this.isActive) {
      this.isActive = true
      this.currentAttempt = attempt ?? this.currentAttempt
    }

    // Check if we should give up
    if (!this.strategy.shouldRetry(this.currentAttempt)) {
      this.giveUp()
      return
    }

    // Calculate delay
    const delay = this.strategy.getDelay(this.currentAttempt)

    // Scheduling reconnection attempt

    // Clear any existing timer
    this.clearTimer()

    // Schedule reconnection
    this.reconnectTimer = setTimeout(() => {
      this.currentAttempt++
      this.options.onReconnect()
    }, delay)
  }

  /**
   * Reset reconnection attempts
   */
  reset(): void {
    this.currentAttempt = 0
    this.isActive = false
    this.clearTimer()
  }

  /**
   * Stop reconnection attempts
   */
  stop(): void {
    this.isActive = false
    this.clearTimer()
  }

  /**
   * Give up reconnection attempts
   */
  private giveUp(): void {
    // Max reconnection attempts reached
    this.isActive = false
    this.clearTimer()

    if (this.options.onGiveUp) {
      this.options.onGiveUp()
    }
  }

  /**
   * Clear reconnection timer
   */
  private clearTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * Get current attempt number
   */
  getCurrentAttempt(): number {
    return this.currentAttempt
  }

  /**
   * Check if reconnection is active
   */
  isReconnecting(): boolean {
    return this.isActive
  }
}