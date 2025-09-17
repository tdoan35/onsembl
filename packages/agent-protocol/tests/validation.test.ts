import { describe, it, expect } from 'vitest';
import {
  validateWebSocketMessage,
  validateMessageType,
  validateTimestamp,
  validatePayload,
  isValidWebSocketMessage
} from '../src/websocket-validation.js';
import type { WebSocketMessage } from '../src/websocket.js';

describe('WebSocket Message Validation', () => {
  describe('validateWebSocketMessage', () => {
    it('should validate a valid message', () => {
      const message: WebSocketMessage = {
        type: 'dashboard:connect',
        timestamp: new Date().toISOString()
      };

      const result = validateWebSocketMessage(message);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject message without type', () => {
      const message = {
        timestamp: new Date().toISOString()
      } as any;

      const result = validateWebSocketMessage(message);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Message must have a type field');
    });

    it('should reject message without timestamp', () => {
      const message = {
        type: 'test:message'
      } as any;

      const result = validateWebSocketMessage(message);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Message must have a timestamp field');
    });

    it('should reject invalid timestamp format', () => {
      const message: WebSocketMessage = {
        type: 'test:message',
        timestamp: 'not-a-timestamp'
      };

      const result = validateWebSocketMessage(message);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid timestamp format');
    });

    it('should validate message with additional fields', () => {
      const message: any = {
        type: 'command:request',
        timestamp: new Date().toISOString(),
        agentId: 'agent-1',
        command: 'test-command'
      };

      const result = validateWebSocketMessage(message);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateMessageType', () => {
    it('should validate known message types', () => {
      const validTypes = [
        'dashboard:connect',
        'dashboard:disconnect',
        'agent:connect',
        'agent:disconnect',
        'command:request',
        'command:interrupt',
        'terminal:output',
        'heartbeat:ping',
        'heartbeat:pong'
      ];

      validTypes.forEach(type => {
        expect(validateMessageType(type)).toBe(true);
      });
    });

    it('should validate custom message types', () => {
      expect(validateMessageType('custom:event')).toBe(true);
      expect(validateMessageType('app:specific')).toBe(true);
    });

    it('should reject invalid type formats', () => {
      expect(validateMessageType('')).toBe(false);
      expect(validateMessageType('invalid')).toBe(false);
      expect(validateMessageType('Invalid:Type')).toBe(false);
      expect(validateMessageType('invalid::type')).toBe(false);
      expect(validateMessageType(':invalid')).toBe(false);
      expect(validateMessageType('invalid:')).toBe(false);
    });
  });

  describe('validateTimestamp', () => {
    it('should validate ISO 8601 timestamps', () => {
      expect(validateTimestamp('2024-01-01T12:00:00Z')).toBe(true);
      expect(validateTimestamp('2024-01-01T12:00:00.000Z')).toBe(true);
      expect(validateTimestamp('2024-01-01T12:00:00+00:00')).toBe(true);
      expect(validateTimestamp(new Date().toISOString())).toBe(true);
    });

    it('should reject invalid timestamps', () => {
      expect(validateTimestamp('')).toBe(false);
      expect(validateTimestamp('2024-01-01')).toBe(false);
      expect(validateTimestamp('12:00:00')).toBe(false);
      expect(validateTimestamp('not-a-date')).toBe(false);
      expect(validateTimestamp('2024-13-01T12:00:00Z')).toBe(false);
    });

    it('should reject future timestamps beyond threshold', () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 10);
      expect(validateTimestamp(futureDate.toISOString())).toBe(false);
    });

    it('should accept timestamps within acceptable future range', () => {
      const nearFuture = new Date();
      nearFuture.setSeconds(nearFuture.getSeconds() + 30);
      expect(validateTimestamp(nearFuture.toISOString())).toBe(true);
    });
  });

  describe('validatePayload', () => {
    describe('dashboard:connect', () => {
      it('should validate correct payload', () => {
        const payload = {
          dashboardId: 'dashboard-123'
        };

        const result = validatePayload('dashboard:connect', payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject missing dashboardId', () => {
        const payload = {};

        const result = validatePayload('dashboard:connect', payload);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('dashboard:connect requires dashboardId');
      });
    });

    describe('agent:connect', () => {
      it('should validate correct payload', () => {
        const payload = {
          agentId: 'agent-123',
          agentType: 'claude'
        };

        const result = validatePayload('agent:connect', payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject missing required fields', () => {
        const payload = {
          agentId: 'agent-123'
        };

        const result = validatePayload('agent:connect', payload);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('agent:connect requires agentType');
      });
    });

    describe('command:request', () => {
      it('should validate correct payload', () => {
        const payload = {
          agentId: 'agent-123',
          command: 'test command'
        };

        const result = validatePayload('command:request', payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate with optional args', () => {
        const payload = {
          agentId: 'agent-123',
          command: 'test command',
          args: ['--flag', 'value']
        };

        const result = validatePayload('command:request', payload);
        expect(result.valid).toBe(true);
      });

      it('should reject invalid args type', () => {
        const payload = {
          agentId: 'agent-123',
          command: 'test command',
          args: 'not-an-array'
        };

        const result = validatePayload('command:request', payload);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('command:request args must be an array');
      });
    });

    describe('terminal:output', () => {
      it('should validate correct payload', () => {
        const payload = {
          agentId: 'agent-123',
          output: {
            type: 'stdout',
            content: 'test output',
            timestamp: new Date().toISOString()
          }
        };

        const result = validatePayload('terminal:output', payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should validate output types', () => {
        const validTypes = ['stdout', 'stderr', 'system', 'command'];

        validTypes.forEach(type => {
          const payload = {
            agentId: 'agent-123',
            output: {
              type,
              content: 'test',
              timestamp: new Date().toISOString()
            }
          };

          const result = validatePayload('terminal:output', payload);
          expect(result.valid).toBe(true);
        });
      });

      it('should reject invalid output type', () => {
        const payload = {
          agentId: 'agent-123',
          output: {
            type: 'invalid',
            content: 'test',
            timestamp: new Date().toISOString()
          }
        };

        const result = validatePayload('terminal:output', payload);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid terminal output type');
      });
    });

    describe('command:interrupt', () => {
      it('should validate correct payload', () => {
        const payload = {
          commandId: 'cmd-123'
        };

        const result = validatePayload('command:interrupt', payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    describe('unknown message type', () => {
      it('should allow unknown message types', () => {
        const payload = {
          customField: 'value'
        };

        const result = validatePayload('custom:message', payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });
  });

  describe('isValidWebSocketMessage', () => {
    it('should return true for valid messages', () => {
      const message: WebSocketMessage = {
        type: 'test:message',
        timestamp: new Date().toISOString()
      };

      expect(isValidWebSocketMessage(message)).toBe(true);
    });

    it('should return false for invalid messages', () => {
      const invalidMessages = [
        null,
        undefined,
        {},
        { type: 'test' },
        { timestamp: new Date().toISOString() },
        { type: '', timestamp: new Date().toISOString() },
        { type: 'test:message', timestamp: 'invalid' }
      ];

      invalidMessages.forEach(msg => {
        expect(isValidWebSocketMessage(msg as any)).toBe(false);
      });
    });
  });

  describe('Message size validation', () => {
    it('should reject messages exceeding size limit', () => {
      const largeContent = 'x'.repeat(1024 * 1024 * 2); // 2MB
      const message: any = {
        type: 'terminal:output',
        timestamp: new Date().toISOString(),
        output: {
          content: largeContent
        }
      };

      const result = validateWebSocketMessage(message, { maxSize: 1024 * 1024 }); // 1MB limit
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Message exceeds size limit');
    });

    it('should accept messages within size limit', () => {
      const message: WebSocketMessage = {
        type: 'terminal:output',
        timestamp: new Date().toISOString(),
        output: {
          type: 'stdout',
          content: 'Small content',
          timestamp: new Date().toISOString()
        }
      } as any;

      const result = validateWebSocketMessage(message, { maxSize: 1024 * 1024 });
      expect(result.valid).toBe(true);
    });
  });
});