/**
 * Message Handler Registry
 * Manages WebSocket message handlers by type
 */

import { WebSocketMessage } from '@onsembl/agent-protocol'

export type MessageHandler<T = any> = (message: WebSocketMessage<T>) => void | Promise<void>

export class MessageHandlerRegistry {
  private handlers: Map<string, Set<MessageHandler>>
  private wildcardHandlers: Set<MessageHandler>

  constructor() {
    this.handlers = new Map()
    this.wildcardHandlers = new Set()
  }

  /**
   * Register a handler for a specific message type
   */
  register(type: string | '*', handler: MessageHandler): void {
    if (type === '*') {
      this.wildcardHandlers.add(handler)
    } else {
      if (!this.handlers.has(type)) {
        this.handlers.set(type, new Set())
      }
      this.handlers.get(type)!.add(handler)
    }
  }

  /**
   * Unregister a handler
   */
  unregister(type: string | '*', handler: MessageHandler): void {
    if (type === '*') {
      this.wildcardHandlers.delete(handler)
    } else {
      const handlers = this.handlers.get(type)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.handlers.delete(type)
        }
      }
    }
  }

  /**
   * Handle a message by calling all registered handlers
   */
  async handle(message: WebSocketMessage): Promise<void> {
    const promises: Promise<void>[] = []

    // Call type-specific handlers
    const handlers = this.handlers.get(message.type)
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(message)
          if (result instanceof Promise) {
            promises.push(result.catch(error => {
              console.error(`Handler error for ${message.type}:`, error)
            }))
          }
        } catch (error) {
          console.error(`Handler error for ${message.type}:`, error)
        }
      }
    }

    // Call wildcard handlers
    for (const handler of this.wildcardHandlers) {
      try {
        const result = handler(message)
        if (result instanceof Promise) {
          promises.push(result.catch(error => {
            console.error('Wildcard handler error:', error)
          }))
        }
      } catch (error) {
        console.error('Wildcard handler error:', error)
      }
    }

    // Wait for all async handlers to complete
    if (promises.length > 0) {
      await Promise.all(promises)
    }
  }

  /**
   * Clear all handlers for a specific type
   */
  clearType(type: string): void {
    this.handlers.delete(type)
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear()
    this.wildcardHandlers.clear()
  }

  /**
   * Get handler count for a type
   */
  getHandlerCount(type: string): number {
    const handlers = this.handlers.get(type)
    return handlers ? handlers.size : 0
  }

  /**
   * Get total handler count
   */
  getTotalHandlerCount(): number {
    let total = this.wildcardHandlers.size
    for (const handlers of this.handlers.values()) {
      total += handlers.size
    }
    return total
  }

  /**
   * Check if there are handlers for a type
   */
  hasHandlers(type: string): boolean {
    return this.handlers.has(type) || this.wildcardHandlers.size > 0
  }
}