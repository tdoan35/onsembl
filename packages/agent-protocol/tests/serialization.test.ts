/**
 * Comprehensive tests for JSON serialization and deserialization
 * Tests round-trip serialization, edge cases, and data integrity
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
  WebSocketMessage,
  TypedWebSocketMessage,
  AgentConnectPayload,
  AgentHeartbeatPayload,
  CommandAckPayload,
  TerminalOutputPayload,
  TraceEventPayload,
  CommandCompletePayload,
  InvestigationReportPayload,
  AgentErrorPayload,
  CommandRequestPayload,
  CommandCancelPayload,
  AgentControlPayload,
  TokenRefreshPayload,
  ServerHeartbeatPayload,
  AgentStatusPayload,
  CommandStatusPayload,
  TerminalStreamPayload,
  TraceStreamPayload,
  QueueUpdatePayload,
  EmergencyStopPayload,
  DashboardInitPayload,
  DashboardSubscribePayload,
  DashboardUnsubscribePayload,
  PingPayload,
  PongPayload,
  AckPayload,
  ErrorPayload,
} from '../src/types';

import {
  validateCompleteMessage,
  MessageBuilder,
} from '../src/validation';

describe('JSON Serialization Tests', () => {
  describe('Basic Serialization Round-Trip', () => {
    it('should serialize and deserialize a simple ping message', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.PING> = {
        type: MessageType.PING,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          timestamp: 1634567890123,
          sequence: 42,
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.type).toBe(MessageType.PING);
      expect(deserialized.payload.sequence).toBe(42);
    });

    it('should serialize and deserialize a complex agent connect message', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.AGENT_CONNECT> = {
        type: MessageType.AGENT_CONNECT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          agentType: 'CLAUDE' as AgentType,
          version: '1.0.0',
          hostMachine: 'localhost',
          capabilities: {
            maxTokens: 4000,
            supportsInterrupt: true,
            supportsTrace: true,
          }
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.agentType).toBe('CLAUDE');
      expect(deserialized.payload.capabilities.maxTokens).toBe(4000);
    });

    it('should serialize and deserialize a trace event with complex content', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.TRACE_EVENT> = {
        type: MessageType.TRACE_EVENT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          traceId: '550e8400-e29b-41d4-a716-446655440003',
          parentId: '550e8400-e29b-41d4-a716-446655440004',
          type: 'TOOL_CALL' as TraceType,
          name: 'File Read Operation',
          content: {
            toolName: 'read_file',
            toolInput: {
              path: '/path/to/file.txt',
              encoding: 'utf-8',
              options: { maxSize: 1024 }
            },
            toolOutput: {
              content: 'File content here...',
              size: 256,
              lastModified: '2023-10-01T12:00:00Z'
            }
          },
          startedAt: 1634567890000,
          completedAt: 1634567890123,
          durationMs: 123,
          tokensUsed: 25,
          metadata: {
            model: 'claude-3-haiku',
            temperature: 0.7,
            custom: { key: 'value', nested: { deep: true } }
          }
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.content.toolInput.options.maxSize).toBe(1024);
      expect(deserialized.payload.metadata.custom.nested.deep).toBe(true);
    });
  });

  describe('Investigation Report Serialization', () => {
    it('should serialize and deserialize investigation report with complex nested structure', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.INVESTIGATION_REPORT> = {
        type: MessageType.INVESTIGATION_REPORT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          reportId: '550e8400-e29b-41d4-a716-446655440003',
          status: 'COMPLETE' as ReportStatus,
          title: 'Security Analysis Report',
          summary: 'Comprehensive security analysis of the application',
          content: {
            sections: [
              {
                title: 'Executive Summary',
                content: 'The analysis revealed several security concerns...',
                order: 1,
              },
              {
                title: 'Technical Details',
                content: 'Detailed technical analysis shows...',
                order: 2,
              }
            ],
            findings: [
              {
                type: 'issue',
                severity: 'high',
                description: 'SQL injection vulnerability in user authentication',
                evidence: [
                  'auth.ts:lines 45-67',
                  'database.ts:line 123',
                  'Test case: malicious input "OR 1=1"'
                ],
              },
              {
                type: 'insight',
                severity: 'medium',
                description: 'Code quality metrics indicate technical debt',
                evidence: ['metrics.json', 'coverage report']
              }
            ],
            recommendations: [
              {
                priority: 1,
                action: 'Implement parameterized queries for all database operations',
                rationale: 'Prevents SQL injection attacks and improves security posture',
              },
              {
                priority: 2,
                action: 'Add comprehensive input validation',
                rationale: 'Reduces attack surface and improves data integrity',
              }
            ],
          },
          metadata: {
            commandCount: 15,
            traceCount: 47,
            errorCount: 3,
            duration: 45000,
          },
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.content.sections).toHaveLength(2);
      expect(deserialized.payload.content.findings).toHaveLength(2);
      expect(deserialized.payload.content.recommendations).toHaveLength(2);
      expect(deserialized.payload.content.findings[0].evidence).toHaveLength(3);
    });
  });

  describe('Special Characters and Unicode', () => {
    it('should handle terminal output with ANSI escape codes', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.TERMINAL_OUTPUT> = {
        type: MessageType.TERMINAL_OUTPUT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          streamType: 'STDOUT' as StreamType,
          content: '\\u001b[31mError: \\u001b[0mCommand failed\\n\\u001b[32m✓\\u001b[0m Success',
          ansiCodes: true,
          sequence: 5,
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.content).toContain('\\u001b[31m');
      expect(deserialized.payload.content).toContain('✓');
    });

    it('should handle Unicode characters in various fields', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.COMMAND_REQUEST> = {
        type: MessageType.COMMAND_REQUEST,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          content: 'Analyze this file: 📁 /path/with/émojis/and/açcénts.txt 🔍',
          type: 'INVESTIGATE' as CommandType,
          priority: 50,
          context: {
            parameters: {
              locale: 'en-US',
              special: '特殊文字 and русский текст',
              math: 'π ≈ 3.14159, ∑ symbols',
            }
          }
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.content).toContain('📁');
      expect(deserialized.payload.content).toContain('émojis');
      expect(deserialized.payload.context.parameters.special).toContain('特殊文字');
      expect(deserialized.payload.context.parameters.math).toContain('π');
    });

    it('should handle newlines, tabs, and control characters', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.TERMINAL_OUTPUT> = {
        type: MessageType.TERMINAL_OUTPUT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          streamType: 'STDOUT' as StreamType,
          content: 'Line 1\\nLine 2\\n\\tIndented line\\n\\r\\nCRLF line ending',
          ansiCodes: false,
          sequence: 10,
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.content).toContain('\\n');
      expect(deserialized.payload.content).toContain('\\t');
      expect(deserialized.payload.content).toContain('\\r\\n');
    });
  });

  describe('Large Data Serialization', () => {
    it('should handle large terminal output content', () => {
      const largeContent = 'x'.repeat(50000); // 50KB of content
      const originalMessage: TypedWebSocketMessage<MessageType.TERMINAL_OUTPUT> = {
        type: MessageType.TERMINAL_OUTPUT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          streamType: 'STDOUT' as StreamType,
          content: largeContent,
          ansiCodes: false,
          sequence: 1,
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.content).toHaveLength(50000);
      expect(serialized.length).toBeGreaterThan(50000);
    });

    it('should handle complex investigation reports with many findings', () => {
      const manyFindings = Array.from({ length: 100 }, (_, i) => ({
        type: 'issue' as const,
        severity: 'low' as const,
        description: `Issue ${i + 1}: Description of the issue`,
        evidence: [`file${i}.ts:line ${i * 10}`, `test${i}.spec.ts:line ${i * 5}`]
      }));

      const originalMessage: TypedWebSocketMessage<MessageType.INVESTIGATION_REPORT> = {
        type: MessageType.INVESTIGATION_REPORT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          reportId: '550e8400-e29b-41d4-a716-446655440003',
          status: 'COMPLETE' as ReportStatus,
          title: 'Large Report',
          summary: 'A report with many findings',
          content: {
            sections: [],
            findings: manyFindings,
            recommendations: [],
          },
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.content.findings).toHaveLength(100);
      expect(deserialized.payload.content.findings[99].description).toContain('Issue 100');
    });
  });

  describe('Edge Cases and Boundary Values', () => {
    it('should handle messages with null and undefined values', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.TRACE_EVENT> = {
        type: MessageType.TRACE_EVENT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          agentId: '550e8400-e29b-41d4-a716-446655440002',
          traceId: '550e8400-e29b-41d4-a716-446655440003',
          parentId: null, // Explicitly null
          type: 'LLM_PROMPT' as TraceType,
          name: 'Test Trace',
          content: {
            prompt: 'Test prompt',
            response: 'Test response',
            error: undefined, // This will be omitted in JSON
          },
          startedAt: 1634567890000,
          completedAt: 1634567890100,
          durationMs: 100,
          // tokensUsed: undefined, // Optional field omitted
          // metadata: undefined, // Optional field omitted
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      // Note: undefined values are omitted in JSON serialization
      expect(deserialized.payload.parentId).toBeNull();
      expect(deserialized.payload.content.error).toBeUndefined();
      expect(deserialized.payload.tokensUsed).toBeUndefined();
      expect(deserialized.payload.metadata).toBeUndefined();
    });

    it('should handle empty arrays and objects', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.QUEUE_UPDATE> = {
        type: MessageType.QUEUE_UPDATE,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123,
        payload: {
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          queueSize: 0,
          queued: [], // Empty array
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.payload.queued).toEqual([]);
      expect(Array.isArray(deserialized.payload.queued)).toBe(true);
    });

    it('should handle maximum and minimum numeric values', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.AGENT_HEARTBEAT> = {
        type: MessageType.AGENT_HEARTBEAT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Number.MAX_SAFE_INTEGER,
        payload: {
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          healthMetrics: {
            cpuUsage: 100, // Maximum percentage
            memoryUsage: Number.MAX_SAFE_INTEGER,
            uptime: Number.MAX_SAFE_INTEGER,
            commandsProcessed: Number.MAX_SAFE_INTEGER,
            averageResponseTime: 0, // Minimum time
          }
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.timestamp).toBe(Number.MAX_SAFE_INTEGER);
      expect(deserialized.payload.healthMetrics.cpuUsage).toBe(100);
      expect(deserialized.payload.healthMetrics.averageResponseTime).toBe(0);
    });

    it('should handle floating point precision', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.AGENT_HEARTBEAT> = {
        type: MessageType.AGENT_HEARTBEAT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1634567890123.456,
        payload: {
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          healthMetrics: {
            cpuUsage: 45.123456789,
            memoryUsage: 1024.999,
            uptime: 3600.5,
            commandsProcessed: 10,
            averageResponseTime: 250.25,
          }
        }
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(originalMessage);
      expect(deserialized.timestamp).toBe(1634567890123.456);
      expect(deserialized.payload.healthMetrics.cpuUsage).toBe(45.123456789);
    });
  });

  describe('Message Builder Serialization', () => {
    it('should serialize messages created by MessageBuilder', () => {
      const builderResult = MessageBuilder.agentConnect({
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        agentType: 'CLAUDE' as AgentType,
        version: '1.0.0',
        hostMachine: 'localhost',
        capabilities: {
          maxTokens: 4000,
          supportsInterrupt: true,
          supportsTrace: true,
        }
      });

      expect(builderResult.valid).toBe(true);
      const message = builderResult.message;

      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(message);

      // Verify the deserialized message is still valid
      const validationResult = validateCompleteMessage(deserialized);
      expect(validationResult.valid).toBe(true);
    });

    it('should serialize ping messages with sequence numbers', () => {
      const builderResult = MessageBuilder.ping(123);
      expect(builderResult.valid).toBe(true);
      const message = builderResult.message;

      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(message);
      expect(deserialized.payload.sequence).toBe(123);

      // Verify the deserialized message is still valid
      const validationResult = validateCompleteMessage(deserialized);
      expect(validationResult.valid).toBe(true);
    });

    it('should serialize error messages with complex details', () => {
      const complexDetails = {
        stackTrace: ['at function1 (file1.ts:10)', 'at function2 (file2.ts:20)'],
        userAgent: 'Mozilla/5.0 (compatible; bot)',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        nested: {
          level1: {
            level2: {
              value: 'deep nested value',
              array: [1, 2, 3, 'mixed', true]
            }
          }
        }
      };

      const builderResult = MessageBuilder.error(
        'EXECUTION_FAILED',
        'Command execution failed with complex error details',
        complexDetails,
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(builderResult.valid).toBe(true);
      const message = builderResult.message;

      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(message);
      expect(deserialized.payload.details.nested.level1.level2.value).toBe('deep nested value');
      expect(deserialized.payload.details.nested.level1.level2.array).toEqual([1, 2, 3, 'mixed', true]);

      // Verify the deserialized message is still valid
      const validationResult = validateCompleteMessage(deserialized);
      expect(validationResult.valid).toBe(true);
    });
  });

  describe('Serialization Performance', () => {
    it('should serialize and deserialize efficiently', () => {
      const message: TypedWebSocketMessage<MessageType.PING> = {
        type: MessageType.PING,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: { timestamp: Date.now() }
      };

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const serialized = JSON.stringify(message);
        const deserialized = JSON.parse(serialized);
        expect(deserialized.type).toBe(MessageType.PING);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete 1000 iterations in reasonable time (< 100ms on most systems)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent serialization operations', async () => {
      const message: TypedWebSocketMessage<MessageType.AGENT_STATUS> = {
        type: MessageType.AGENT_STATUS,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: {
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          status: 'ONLINE' as AgentStatus,
          activityState: 'PROCESSING' as AgentActivityState,
        }
      };

      const promises = Array.from({ length: 100 }, async (_, i) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            const serialized = JSON.stringify(message);
            const deserialized = JSON.parse(serialized);
            expect(deserialized.type).toBe(MessageType.AGENT_STATUS);
            resolve();
          }, Math.random() * 10);
        });
      });

      await Promise.all(promises);
    });
  });

  describe('Serialization Validation Integration', () => {
    it('should maintain validation after round-trip serialization', () => {
      const originalMessage: TypedWebSocketMessage<MessageType.COMMAND_REQUEST> = {
        type: MessageType.COMMAND_REQUEST,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: {
          commandId: '550e8400-e29b-41d4-a716-446655440001',
          content: 'Analyze the codebase for security vulnerabilities',
          type: 'INVESTIGATE' as CommandType,
          priority: 75,
          executionConstraints: {
            timeLimitMs: 300000,
            tokenBudget: 4000,
            maxRetries: 2,
          },
          context: {
            previousCommandId: '550e8400-e29b-41d4-a716-446655440002',
            parameters: {
              depth: 'comprehensive',
              includeTests: true,
              outputFormat: 'detailed'
            }
          }
        }
      };

      // Validate original message
      const originalValidation = validateCompleteMessage(originalMessage);
      expect(originalValidation.valid).toBe(true);

      // Serialize and deserialize
      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);

      // Validate deserialized message
      const deserializedValidation = validateCompleteMessage(deserialized);
      expect(deserializedValidation.valid).toBe(true);

      // Ensure both are structurally identical
      expect(deserialized).toEqual(originalMessage);
    });

    it('should preserve validation errors after serialization', () => {
      // Create an invalid message (missing required fields)
      const invalidMessage = {
        type: MessageType.AGENT_CONNECT,
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: Date.now(),
        payload: {
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          agentType: 'CLAUDE',
          // Missing version, hostMachine, capabilities
        }
      };

      // Validate original invalid message
      const originalValidation = validateCompleteMessage(invalidMessage);
      expect(originalValidation.valid).toBe(false);

      // Serialize and deserialize
      const serialized = JSON.stringify(invalidMessage);
      const deserialized = JSON.parse(serialized);

      // Validate deserialized message - should still be invalid
      const deserializedValidation = validateCompleteMessage(deserialized);
      expect(deserializedValidation.valid).toBe(false);

      // Ensure structural identity is preserved
      expect(deserialized).toEqual(invalidMessage);
    });
  });
});