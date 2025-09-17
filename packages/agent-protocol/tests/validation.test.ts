/**
 * Comprehensive tests for WebSocket message validation
 * Tests all message types, schemas, and validation functions
 */

import {
  MessageType,
  AgentType,
  AgentStatus,
  AgentActivityState,
  CommandType,
  CommandStatus,
  StreamType,
  TraceType,
  ErrorType,
  AgentControlAction,
  ReportStatus,
} from '../src/types';

import {
  validateMessage,
  validatePayload,
  validateCompleteMessage,
  createMessage,
  MessageBuilder,
  WebSocketMessageSchema,
  AgentConnectPayloadSchema,
  AgentHeartbeatPayloadSchema,
  CommandAckPayloadSchema,
  TerminalOutputPayloadSchema,
  TraceEventPayloadSchema,
  CommandCompletePayloadSchema,
  InvestigationReportPayloadSchema,
  AgentErrorPayloadSchema,
  CommandRequestPayloadSchema,
  CommandCancelPayloadSchema,
  AgentControlPayloadSchema,
  TokenRefreshPayloadSchema,
  ServerHeartbeatPayloadSchema,
  AgentStatusPayloadSchema,
  CommandStatusPayloadSchema,
  TerminalStreamPayloadSchema,
  TraceStreamPayloadSchema,
  QueueUpdatePayloadSchema,
  EmergencyStopPayloadSchema,
  DashboardInitPayloadSchema,
  DashboardSubscribePayloadSchema,
  DashboardUnsubscribePayloadSchema,
  PingPayloadSchema,
  PongPayloadSchema,
  AckPayloadSchema,
  ErrorPayloadSchema,
  MessageValidationMap,
} from '../src/validation';

describe('WebSocket Message Validation', () => {
  describe('Base Message Structure', () => {
    it('should validate a properly structured WebSocket message', () => {
      const validMessage = {
        type: MessageType.PING,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: { timestamp: Date.now() }
      };

      const result = validateMessage(validMessage);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject message without required fields', () => {
      const invalidMessage = {
        type: MessageType.PING,
        // missing id, timestamp, payload
      };

      const result = validateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Required');
    });

    it('should reject message with invalid UUID', () => {
      const invalidMessage = {
        type: MessageType.PING,
        id: 'not-a-uuid',
        timestamp: Date.now(),
        payload: {}
      };

      const result = validateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('uuid');
    });

    it('should reject message with negative timestamp', () => {
      const invalidMessage = {
        type: MessageType.PING,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: -1,
        payload: {}
      };

      const result = validateMessage(invalidMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('should reject message with invalid type', () => {
      const invalidMessage = {
        type: 'INVALID_TYPE',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: {}
      };

      const result = validateMessage(invalidMessage);
      expect(result.valid).toBe(false);
    });
  });

  describe('Agent → Server Message Payloads', () => {
    describe('AgentConnectPayload', () => {
      it('should validate valid agent connect payload', () => {
        const validPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          agentType: 'CLAUDE' as AgentType,
          version: '1.0.0',
          hostMachine: 'localhost',
          capabilities: {
            maxTokens: 4000,
            supportsInterrupt: true,
            supportsTrace: true,
          }
        };

        const result = AgentConnectPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should reject agent connect with invalid version format', () => {
        const invalidPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          agentType: 'CLAUDE' as AgentType,
          version: 'v1.0', // Invalid format
          hostMachine: 'localhost',
          capabilities: {
            maxTokens: 4000,
            supportsInterrupt: true,
            supportsTrace: true,
          }
        };

        const result = AgentConnectPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });

      it('should reject agent connect with invalid agent type', () => {
        const invalidPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          agentType: 'INVALID_AGENT',
          version: '1.0.0',
          hostMachine: 'localhost',
          capabilities: {
            maxTokens: 4000,
            supportsInterrupt: true,
            supportsTrace: true,
          }
        };

        const result = AgentConnectPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });
    });

    describe('AgentHeartbeatPayload', () => {
      it('should validate valid heartbeat payload', () => {
        const validPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          healthMetrics: {
            cpuUsage: 45.5,
            memoryUsage: 1024,
            uptime: 3600,
            commandsProcessed: 10,
            averageResponseTime: 250,
          }
        };

        const result = AgentHeartbeatPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should reject heartbeat with CPU usage over 100', () => {
        const invalidPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          healthMetrics: {
            cpuUsage: 150, // Invalid: > 100
            memoryUsage: 1024,
            uptime: 3600,
            commandsProcessed: 10,
            averageResponseTime: 250,
          }
        };

        const result = AgentHeartbeatPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });
    });

    describe('CommandAckPayload', () => {
      it('should validate valid command ack payload', () => {
        const validPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          status: 'RECEIVED' as const,
        };

        const result = CommandAckPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should validate command ack with queue position', () => {
        const validPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          status: 'QUEUED' as const,
          queuePosition: 3,
        };

        const result = CommandAckPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });

    describe('TerminalOutputPayload', () => {
      it('should validate valid terminal output payload', () => {
        const validPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          streamType: 'STDOUT' as StreamType,
          content: 'Hello, world!\n',
          ansiCodes: true,
          sequence: 1,
        };

        const result = TerminalOutputPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should reject terminal output with negative sequence', () => {
        const invalidPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          streamType: 'STDOUT' as StreamType,
          content: 'Hello, world!\n',
          ansiCodes: true,
          sequence: -1, // Invalid
        };

        const result = TerminalOutputPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });
    });

    describe('TraceEventPayload', () => {
      it('should validate valid trace event payload', () => {
        const validPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          traceId: '550e8400-e29b-41d4-a716-446655440002',
          parentId: null,
          type: 'LLM_PROMPT' as TraceType,
          name: 'Code Generation',
          content: {
            prompt: 'Generate a function to calculate fibonacci',
            response: 'Here is the function...',
          },
          startedAt: Date.now() - 1000,
          completedAt: Date.now(),
          durationMs: 1000,
          tokensUsed: 150,
        };

        const result = TraceEventPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should validate trace event with parent ID', () => {
        const validPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          traceId: '550e8400-e29b-41d4-a716-446655440002',
          parentId: '550e8400-e29b-41d4-a716-446655440003',
          type: 'TOOL_CALL' as TraceType,
          name: 'File Read',
          content: {
            toolName: 'read_file',
            toolInput: { path: '/test.txt' },
            toolOutput: 'file contents',
          },
          startedAt: Date.now() - 500,
          completedAt: Date.now(),
          durationMs: 500,
        };

        const result = TraceEventPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });

    describe('InvestigationReportPayload', () => {
      it('should validate valid investigation report payload', () => {
        const validPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          reportId: '550e8400-e29b-41d4-a716-446655440002',
          status: 'COMPLETE' as ReportStatus,
          title: 'Code Quality Analysis',
          summary: 'Analysis of codebase quality and recommendations',
          content: {
            sections: [
              {
                title: 'Overview',
                content: 'This section provides an overview...',
                order: 1,
              }
            ],
            findings: [
              {
                type: 'issue',
                severity: 'medium',
                description: 'Missing error handling in authentication module',
                evidence: ['auth.ts:45', 'auth.ts:67'],
              }
            ],
            recommendations: [
              {
                priority: 1,
                action: 'Add comprehensive error handling',
                rationale: 'To improve application reliability',
              }
            ],
          },
          metadata: {
            commandCount: 5,
            traceCount: 20,
            errorCount: 2,
            duration: 30000,
          },
        };

        const result = InvestigationReportPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });

    describe('AgentErrorPayload', () => {
      it('should validate valid agent error payload', () => {
        const validPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          errorType: 'EXECUTION' as ErrorType,
          message: 'Command execution failed',
          recoverable: true,
          details: { exitCode: 1 },
          stack: 'Error: Command failed\n    at ...',
        };

        const result = AgentErrorPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Server → Agent Message Payloads', () => {
    describe('CommandRequestPayload', () => {
      it('should validate valid command request payload', () => {
        const validPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          content: 'Analyze the codebase and provide recommendations',
          type: 'INVESTIGATE' as CommandType,
          priority: 50,
          executionConstraints: {
            timeLimitMs: 300000,
            tokenBudget: 4000,
            maxRetries: 3,
          },
          context: {
            previousCommandId: '550e8400-e29b-41d4-a716-446655440001',
            parameters: { depth: 'deep' },
          },
        };

        const result = CommandRequestPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should reject command request with priority over 100', () => {
        const invalidPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          content: 'Analyze the codebase',
          type: 'INVESTIGATE' as CommandType,
          priority: 150, // Invalid: > 100
        };

        const result = CommandRequestPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });
    });

    describe('TokenRefreshPayload', () => {
      it('should validate valid token refresh payload', () => {
        const validPayload = {
          accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...',
          expiresIn: 3600,
          refreshToken: 'refresh_token_here',
        };

        const result = TokenRefreshPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should validate token refresh without refresh token', () => {
        const validPayload = {
          accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...',
          expiresIn: 3600,
        };

        const result = TokenRefreshPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Server → Dashboard Message Payloads', () => {
    describe('AgentStatusPayload', () => {
      it('should validate valid agent status payload', () => {
        const validPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'ONLINE' as AgentStatus,
          activityState: 'PROCESSING' as AgentActivityState,
          healthMetrics: {
            cpuUsage: 25.5,
            memoryUsage: 512,
            uptime: 7200,
            commandsProcessed: 15,
            averageResponseTime: 300,
          },
          currentCommand: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            type: 'NATURAL' as CommandType,
            startedAt: Date.now() - 5000,
          },
          queuedCommands: 3,
        };

        const result = AgentStatusPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });

    describe('QueueUpdatePayload', () => {
      it('should validate valid queue update payload', () => {
        const validPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          queueSize: 3,
          executing: {
            commandId: '550e8400-e29b-41d4-a716-446655440001',
            startedAt: Date.now() - 2000,
          },
          queued: [
            {
              commandId: '550e8400-e29b-41d4-a716-446655440002',
              position: 1,
              priority: 80,
              estimatedStartTime: Date.now() + 5000,
            },
            {
              commandId: '550e8400-e29b-41d4-a716-446655440003',
              position: 2,
              priority: 60,
            }
          ],
        };

        const result = QueueUpdatePayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });

    describe('EmergencyStopPayload', () => {
      it('should validate valid emergency stop payload', () => {
        const validPayload = {
          triggeredBy: 'user_123',
          reason: 'System overload detected',
          agentsStopped: 5,
          commandsCancelled: 12,
          timestamp: Date.now(),
        };

        const result = EmergencyStopPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Dashboard → Server Message Payloads', () => {
    describe('DashboardInitPayload', () => {
      it('should validate valid dashboard init payload', () => {
        const validPayload = {
          userId: 'user_123',
          subscriptions: {
            agents: ['550e8400-e29b-41d4-a716-446655440000'],
            commands: ['550e8400-e29b-41d4-a716-446655440001'],
            traces: true,
            terminals: true,
          },
        };

        const result = DashboardInitPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should validate dashboard init without subscriptions', () => {
        const validPayload = {
          userId: 'user_123',
        };

        const result = DashboardInitPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });

    describe('DashboardSubscribePayload', () => {
      it('should validate dashboard subscribe to specific agent', () => {
        const validPayload = {
          type: 'agent' as const,
          id: '550e8400-e29b-41d4-a716-446655440000',
        };

        const result = DashboardSubscribePayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should validate dashboard subscribe to all traces', () => {
        const validPayload = {
          type: 'trace' as const,
          all: true,
        };

        const result = DashboardSubscribePayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Common Payloads', () => {
    describe('PingPayload', () => {
      it('should validate valid ping payload', () => {
        const validPayload = {
          timestamp: Date.now(),
          sequence: 1,
        };

        const result = PingPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });

      it('should validate ping without sequence', () => {
        const validPayload = {
          timestamp: Date.now(),
        };

        const result = PingPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });

    describe('ErrorPayload', () => {
      it('should validate valid error payload', () => {
        const validPayload = {
          code: 'VALIDATION_FAILED',
          message: 'The provided message failed validation',
          details: { field: 'agentId', issue: 'invalid UUID' },
          originalMessageId: '550e8400-e29b-41d4-a716-446655440000',
        };

        const result = ErrorPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Validation Functions', () => {
    describe('validatePayload', () => {
      it('should validate payload for known message type', () => {
        const payload = {
          timestamp: Date.now(),
        };

        const result = validatePayload(MessageType.PING, payload);
        expect(result.valid).toBe(true);
      });

      it('should reject payload for unknown message type', () => {
        const payload = {};
        const result = validatePayload('UNKNOWN_TYPE' as MessageType, payload);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unknown message type');
      });

      it('should reject invalid payload for known type', () => {
        const invalidPayload = {
          timestamp: -1, // Invalid negative timestamp
        };

        const result = validatePayload(MessageType.PING, invalidPayload);
        expect(result.valid).toBe(false);
      });
    });

    describe('validateCompleteMessage', () => {
      it('should validate complete valid message', () => {
        const validMessage = {
          type: MessageType.PING,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: { timestamp: Date.now() }
        };

        const result = validateCompleteMessage(validMessage);
        expect(result.valid).toBe(true);
        expect(result.data).toEqual(validMessage);
      });

      it('should reject message with invalid structure', () => {
        const invalidMessage = {
          type: MessageType.PING,
          // Missing required fields
        };

        const result = validateCompleteMessage(invalidMessage);
        expect(result.valid).toBe(false);
      });

      it('should reject message with valid structure but invalid payload', () => {
        const invalidMessage = {
          type: MessageType.PING,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: { timestamp: -1 } // Invalid payload
        };

        const result = validateCompleteMessage(invalidMessage);
        expect(result.valid).toBe(false);
      });
    });

    describe('createMessage', () => {
      it('should create valid message with auto-generated ID', () => {
        const payload = { timestamp: Date.now() };
        const result = createMessage(MessageType.PING, payload);

        expect(result.valid).toBe(true);
        expect(result.message).toBeDefined();
        expect(result.message.type).toBe(MessageType.PING);
        expect(result.message.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(result.message.payload).toEqual(payload);
      });

      it('should create valid message with provided ID', () => {
        const payload = { timestamp: Date.now() };
        const id = '550e8400-e29b-41d4-a716-446655440000';
        const result = createMessage(MessageType.PING, payload, id);

        expect(result.valid).toBe(true);
        expect(result.message.id).toBe(id);
      });

      it('should reject creation with invalid payload', () => {
        const invalidPayload = { timestamp: -1 };
        const result = createMessage(MessageType.PING, invalidPayload);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('MessageBuilder', () => {
    it('should build valid agent connect message', () => {
      const payload = {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        agentType: 'CLAUDE' as AgentType,
        version: '1.0.0',
        hostMachine: 'localhost',
        capabilities: {
          maxTokens: 4000,
          supportsInterrupt: true,
          supportsTrace: true,
        }
      };

      const result = MessageBuilder.agentConnect(payload);
      expect(result.valid).toBe(true);
      expect(result.message.type).toBe(MessageType.AGENT_CONNECT);
      expect(result.message.payload).toEqual(payload);
    });

    it('should build valid ping message', () => {
      const result = MessageBuilder.ping(123);
      expect(result.valid).toBe(true);
      expect(result.message.type).toBe(MessageType.PING);
      expect(result.message.payload.sequence).toBe(123);
    });

    it('should build valid error message', () => {
      const result = MessageBuilder.error(
        'VALIDATION_FAILED',
        'Invalid message format',
        { field: 'type' },
        '550e8400-e29b-41d4-a716-446655440000'
      );

      expect(result.valid).toBe(true);
      expect(result.message.type).toBe(MessageType.ERROR);
      expect(result.message.payload.code).toBe('VALIDATION_FAILED');
      expect(result.message.payload.message).toBe('Invalid message format');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle very large timestamp values', () => {
      const largeTimestamp = Number.MAX_SAFE_INTEGER;
      const message = {
        type: MessageType.PING,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: largeTimestamp,
        payload: { timestamp: largeTimestamp }
      };

      const result = validateCompleteMessage(message);
      expect(result.valid).toBe(true);
    });

    it('should handle empty string content where allowed', () => {
      const payload = {
        commandId: '550e8400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        streamType: 'STDOUT' as StreamType,
        content: '', // Empty but valid
        ansiCodes: false,
        sequence: 0,
      };

      const result = TerminalOutputPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject zero values where not allowed', () => {
      const payload = {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        agentType: 'CLAUDE' as AgentType,
        version: '1.0.0',
        hostMachine: 'localhost',
        capabilities: {
          maxTokens: 0, // Invalid: should be positive
          supportsInterrupt: true,
          supportsTrace: true,
        }
      };

      const result = AgentConnectPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should handle maximum CPU usage boundary', () => {
      const payload = {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        healthMetrics: {
          cpuUsage: 100, // Boundary value
          memoryUsage: 1024,
          uptime: 3600,
          commandsProcessed: 10,
          averageResponseTime: 250,
        }
      };

      const result = AgentHeartbeatPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should handle minimum valid values', () => {
      const payload = {
        commandId: '550e8400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        streamType: 'STDOUT' as StreamType,
        content: 'x', // Minimum non-empty content
        ansiCodes: false,
        sequence: 0, // Minimum allowed sequence
      };

      const result = TerminalOutputPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('Message Validation Map', () => {
    it('should have validation schema for all message types', () => {
      const messageTypes = Object.values(MessageType);

      for (const messageType of messageTypes) {
        expect(MessageValidationMap[messageType]).toBeDefined();
      }
    });

    it('should not have extra validation schemas', () => {
      const mapKeys = Object.keys(MessageValidationMap);
      const messageTypes = Object.values(MessageType);

      expect(mapKeys.length).toBe(messageTypes.length);
    });
  });
});