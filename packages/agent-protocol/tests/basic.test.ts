/**
 * Basic tests for the agent-protocol package
 * Tests core functionality and exports
 */

describe('Agent Protocol Package', () => {
  describe('Package Structure', () => {
    it('should be able to import the main package', async () => {
      const pkg = await import('../src/index');
      expect(pkg).toBeDefined();
    });

    it('should export MESSAGE_TYPES constants', async () => {
      const { MESSAGE_TYPES } = await import('../src/index');
      expect(MESSAGE_TYPES).toBeDefined();
      expect(MESSAGE_TYPES.AGENT_CONNECT).toBe('AGENT_CONNECT');
      expect(MESSAGE_TYPES.PING).toBe('PING');
      expect(MESSAGE_TYPES.ERROR).toBe('ERROR');
    });

    it('should export ERROR_CODES constants', async () => {
      const { ERROR_CODES } = await import('../src/index');
      expect(ERROR_CODES).toBeDefined();
      expect(ERROR_CODES.CONNECTION_FAILED).toBe('CONNECTION_FAILED');
      expect(ERROR_CODES.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    it('should export RATE_LIMITS constants', async () => {
      const { RATE_LIMITS } = await import('../src/index');
      expect(RATE_LIMITS).toBeDefined();
      expect(typeof RATE_LIMITS.AGENT_MESSAGES_PER_SECOND).toBe('number');
      expect(typeof RATE_LIMITS.MAX_MESSAGE_SIZE).toBe('number');
    });

    it('should export MessageValidator class', async () => {
      const { MessageValidator } = await import('../src/index');
      expect(MessageValidator).toBeDefined();
      expect(typeof MessageValidator.validate).toBe('function');
      expect(typeof MessageValidator.validateMessageType).toBe('function');
    });

    it('should export version information', async () => {
      const { PACKAGE_VERSION, PROTOCOL_VERSION } = await import('../src/index');
      expect(PACKAGE_VERSION).toBeDefined();
      expect(PROTOCOL_VERSION).toBeDefined();
      expect(typeof PACKAGE_VERSION).toBe('string');
      expect(typeof PROTOCOL_VERSION).toBe('string');
    });
  });

  describe('MessageValidator Basic Functionality', () => {
    it('should validate a basic message structure', async () => {
      const { MessageValidator } = await import('../src/index');

      const validMessage = {
        type: 'PING',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: { timestamp: Date.now() }
      };

      const result = MessageValidator.validate(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject invalid message structure', async () => {
      const { MessageValidator } = await import('../src/index');

      const invalidMessage = {
        type: 'PING',
        // Missing required fields
      };

      const result = MessageValidator.validate(invalidMessage);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate message type matching', async () => {
      const { MessageValidator } = await import('../src/index');

      const message = {
        type: 'PING',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: { timestamp: Date.now() }
      };

      const result = MessageValidator.validateMessageType(message, 'PING');
      expect(result.success).toBe(true);
    });

    it('should reject type mismatches', async () => {
      const { MessageValidator } = await import('../src/index');

      const message = {
        type: 'PING',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: { timestamp: Date.now() }
      };

      const result = MessageValidator.validateMessageType(message, 'PONG');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TYPE_MISMATCH');
    });
  });

  describe('Type System', () => {
    it('should export MessageType enum', async () => {
      const { MessageType } = await import('../src/index');
      expect(MessageType).toBeDefined();
      expect(MessageType.AGENT_CONNECT).toBe('AGENT_CONNECT');
      expect(MessageType.PING).toBe('PING');
      expect(MessageType.ERROR).toBe('ERROR');
    });

    it('should have consistent message types', async () => {
      const { MessageType, MESSAGE_TYPES } = await import('../src/index');

      // Verify enum and constants are consistent
      expect(MessageType.AGENT_CONNECT).toBe(MESSAGE_TYPES.AGENT_CONNECT);
      expect(MessageType.PING).toBe(MESSAGE_TYPES.PING);
      expect(MessageType.ERROR).toBe(MESSAGE_TYPES.ERROR);
    });
  });

  describe('Constants Validation', () => {
    it('should have valid rate limit values', async () => {
      const { RATE_LIMITS } = await import('../src/index');

      expect(RATE_LIMITS.AGENT_MESSAGES_PER_SECOND).toBeGreaterThan(0);
      expect(RATE_LIMITS.DASHBOARD_MESSAGES_PER_SECOND).toBeGreaterThan(0);
      expect(RATE_LIMITS.MAX_MESSAGE_SIZE).toBeGreaterThan(0);
      expect(RATE_LIMITS.MAX_AGENTS_PER_USER).toBeGreaterThan(0);
    });

    it('should have comprehensive error codes', async () => {
      const { ERROR_CODES } = await import('../src/index');

      const requiredErrorCodes = [
        'CONNECTION_FAILED',
        'AUTHENTICATION_FAILED',
        'INVALID_MESSAGE_FORMAT',
        'COMMAND_EXECUTION_FAILED',
        'AGENT_NOT_FOUND',
        'VALIDATION_FAILED',
        'INTERNAL_ERROR'
      ];

      requiredErrorCodes.forEach(code => {
        expect(ERROR_CODES[code]).toBeDefined();
        expect(typeof ERROR_CODES[code]).toBe('string');
      });
    });
  });

  describe('Message Builder Functionality', () => {
    it('should have message builders available', async () => {
      const pkg = await import('../src/index');

      expect(pkg.AgentMessageBuilder).toBeDefined();
      expect(pkg.ServerToAgentMessageBuilder).toBeDefined();
      expect(pkg.ServerToDashboardMessageBuilder).toBeDefined();
      expect(pkg.ErrorMessageBuilder).toBeDefined();
    });
  });

  describe('JSON Serialization Basic Tests', () => {
    it('should handle basic message serialization', () => {
      const message = {
        type: 'PING',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: { timestamp: Date.now(), sequence: 1 }
      };

      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(message);
      expect(deserialized.type).toBe('PING');
      expect(deserialized.payload.sequence).toBe(1);
    });

    it('should handle complex payloads', () => {
      const complexMessage = {
        type: 'AGENT_CONNECT',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: {
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          agentType: 'CLAUDE',
          version: '1.0.0',
          hostMachine: 'localhost',
          capabilities: {
            maxTokens: 4000,
            supportsInterrupt: true,
            supportsTrace: true,
          }
        }
      };

      const serialized = JSON.stringify(complexMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(complexMessage);
      expect(deserialized.payload.agentType).toBe('CLAUDE');
      expect(deserialized.payload.capabilities.maxTokens).toBe(4000);
    });

    it('should handle Unicode and special characters', () => {
      const messageWithUnicode = {
        type: 'TERMINAL_OUTPUT',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          content: 'Hello 🌍! Testing émojis and spëcial chars: αβγ',
          streamType: 'STDOUT',
          ansiCodes: false,
          sequence: 1,
        }
      };

      const serialized = JSON.stringify(messageWithUnicode);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(messageWithUnicode);
      expect(deserialized.payload.content).toContain('🌍');
      expect(deserialized.payload.content).toContain('émojis');
      expect(deserialized.payload.content).toContain('αβγ');
    });
  });

  describe('Performance Tests', () => {
    it('should serialize and deserialize efficiently', () => {
      const message = {
        type: 'PING',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: { timestamp: Date.now() }
      };

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const serialized = JSON.stringify(message);
        const deserialized = JSON.parse(serialized);
        expect(deserialized.type).toBe('PING');
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete 1000 iterations in reasonable time
      expect(duration).toBeLessThan(1000);
    });
  });
});