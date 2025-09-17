/**
 * Message validation utilities for WebSocket protocol
 */

import type {
  WebSocketMessage,
  DashboardConnectMessage,
  CommandRequestMessage,
  CommandInterruptMessage,
  HeartbeatMessage,
  AgentStatusUpdateMessage,
  AgentListMessage,
  TerminalOutputMessage,
  CommandStatusUpdateMessage,
  CommandQueueUpdateMessage,
  ConnectionAckMessage,
  ErrorMessage
} from './websocket-messages.js'

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

export class WebSocketMessageValidator {
  private static readonly VERSION = '1.0.0'

  static validateBase(message: any): ValidationResult {
    const errors: ValidationError[] = []

    if (!message || typeof message !== 'object') {
      return {
        valid: false,
        errors: [{ field: 'message', message: 'Message must be an object', code: 'INVALID_TYPE' }]
      }
    }

    if (!message.version) {
      errors.push({ field: 'version', message: 'Version is required', code: 'MISSING_FIELD' })
    } else if (message.version !== this.VERSION) {
      errors.push({ field: 'version', message: `Invalid version. Expected ${this.VERSION}`, code: 'INVALID_VERSION' })
    }

    if (!message.type) {
      errors.push({ field: 'type', message: 'Type is required', code: 'MISSING_FIELD' })
    } else if (typeof message.type !== 'string') {
      errors.push({ field: 'type', message: 'Type must be a string', code: 'INVALID_TYPE' })
    }

    if (!message.timestamp) {
      errors.push({ field: 'timestamp', message: 'Timestamp is required', code: 'MISSING_FIELD' })
    } else if (typeof message.timestamp !== 'number') {
      errors.push({ field: 'timestamp', message: 'Timestamp must be a number', code: 'INVALID_TYPE' })
    }

    if (!message.payload) {
      errors.push({ field: 'payload', message: 'Payload is required', code: 'MISSING_FIELD' })
    } else if (typeof message.payload !== 'object') {
      errors.push({ field: 'payload', message: 'Payload must be an object', code: 'INVALID_TYPE' })
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  static validateDashboardConnect(message: any): ValidationResult {
    const baseResult = this.validateBase(message)
    if (!baseResult.valid) return baseResult

    const errors: ValidationError[] = []
    const payload = message.payload

    if (message.type !== 'dashboard:connect') {
      errors.push({ field: 'type', message: 'Invalid message type', code: 'TYPE_MISMATCH' })
    }

    if (!payload.token) {
      errors.push({ field: 'payload.token', message: 'Token is required', code: 'MISSING_FIELD' })
    }

    if (!payload.clientInfo) {
      errors.push({ field: 'payload.clientInfo', message: 'Client info is required', code: 'MISSING_FIELD' })
    } else {
      if (!payload.clientInfo.userAgent) {
        errors.push({ field: 'payload.clientInfo.userAgent', message: 'User agent is required', code: 'MISSING_FIELD' })
      }
      if (!payload.clientInfo.timezone) {
        errors.push({ field: 'payload.clientInfo.timezone', message: 'Timezone is required', code: 'MISSING_FIELD' })
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  static validateCommandRequest(message: any): ValidationResult {
    const baseResult = this.validateBase(message)
    if (!baseResult.valid) return baseResult

    const errors: ValidationError[] = []
    const payload = message.payload

    if (message.type !== 'command:request') {
      errors.push({ field: 'type', message: 'Invalid message type', code: 'TYPE_MISMATCH' })
    }

    if (!payload.agentId) {
      errors.push({ field: 'payload.agentId', message: 'Agent ID is required', code: 'MISSING_FIELD' })
    }

    if (!payload.command) {
      errors.push({ field: 'payload.command', message: 'Command is required', code: 'MISSING_FIELD' })
    }

    if (!payload.priority) {
      errors.push({ field: 'payload.priority', message: 'Priority is required', code: 'MISSING_FIELD' })
    } else if (!['high', 'normal', 'low'].includes(payload.priority)) {
      errors.push({ field: 'payload.priority', message: 'Invalid priority value', code: 'INVALID_VALUE' })
    }

    if (payload.timeout !== undefined && typeof payload.timeout !== 'number') {
      errors.push({ field: 'payload.timeout', message: 'Timeout must be a number', code: 'INVALID_TYPE' })
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  static validateCommandInterrupt(message: any): ValidationResult {
    const baseResult = this.validateBase(message)
    if (!baseResult.valid) return baseResult

    const errors: ValidationError[] = []
    const payload = message.payload

    if (message.type !== 'command:interrupt') {
      errors.push({ field: 'type', message: 'Invalid message type', code: 'TYPE_MISMATCH' })
    }

    if (!payload.commandId) {
      errors.push({ field: 'payload.commandId', message: 'Command ID is required', code: 'MISSING_FIELD' })
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  static validateHeartbeat(message: any): ValidationResult {
    const baseResult = this.validateBase(message)
    if (!baseResult.valid) return baseResult

    const errors: ValidationError[] = []
    const payload = message.payload

    if (message.type !== 'heartbeat') {
      errors.push({ field: 'type', message: 'Invalid message type', code: 'TYPE_MISMATCH' })
    }

    if (typeof payload.sequence !== 'number') {
      errors.push({ field: 'payload.sequence', message: 'Sequence must be a number', code: 'INVALID_TYPE' })
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  static validateMessage(message: any): ValidationResult {
    const baseResult = this.validateBase(message)
    if (!baseResult.valid) return baseResult

    // Route to specific validator based on type
    switch (message.type) {
      case 'dashboard:connect':
        return this.validateDashboardConnect(message)
      case 'command:request':
        return this.validateCommandRequest(message)
      case 'command:interrupt':
        return this.validateCommandInterrupt(message)
      case 'heartbeat':
        return this.validateHeartbeat(message)
      default:
        // For other message types, base validation is sufficient
        return baseResult
    }
  }

  static sanitizeMessage(message: any): WebSocketMessage | null {
    try {
      // Remove any extra fields and ensure proper structure
      return {
        version: message.version || '1.0.0',
        type: String(message.type),
        timestamp: Number(message.timestamp) || Date.now(),
        payload: message.payload || {}
      }
    } catch (error) {
      return null
    }
  }
}

// Export convenience validation functions
export function validateWebSocketMessage(message: any): ValidationResult {
  return WebSocketMessageValidator.validateMessage(message)
}

export function isValidWebSocketMessage(message: any): boolean {
  return WebSocketMessageValidator.validateMessage(message).valid
}

export function sanitizeWebSocketMessage(message: any): WebSocketMessage | null {
  return WebSocketMessageValidator.sanitizeMessage(message)
}