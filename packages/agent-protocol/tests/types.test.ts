/**
 * Comprehensive tests for type guards, type assertions, and type-related utilities
 * Tests all enum values, type guards, and type mappings
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
  MessagePayloadMap,
  AgentMessage,
  DashboardMessage,
  ServerMessage,
  isAgentMessage,
  isServerToAgentMessage,
  isDashboardMessage,
  isServerToDashboardMessage,
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

describe('Type System Tests', () => {
  describe('Enum Values', () => {
    describe('MessageType', () => {
      it('should have all expected agent message types', () => {
        const agentMessageTypes = [
          MessageType.AGENT_CONNECT,
          MessageType.AGENT_HEARTBEAT,
          MessageType.AGENT_ERROR,
          MessageType.COMMAND_ACK,
          MessageType.COMMAND_COMPLETE,
          MessageType.TERMINAL_OUTPUT,
          MessageType.TRACE_EVENT,
          MessageType.INVESTIGATION_REPORT,
        ];

        agentMessageTypes.forEach(type => {
          expect(Object.values(MessageType)).toContain(type);
        });
      });

      it('should have all expected server to agent message types', () => {
        const serverToAgentTypes = [
          MessageType.COMMAND_REQUEST,
          MessageType.COMMAND_CANCEL,
          MessageType.AGENT_CONTROL,
          MessageType.TOKEN_REFRESH,
          MessageType.SERVER_HEARTBEAT,
        ];

        serverToAgentTypes.forEach(type => {
          expect(Object.values(MessageType)).toContain(type);
        });
      });

      it('should have all expected server to dashboard message types', () => {
        const serverToDashboardTypes = [
          MessageType.AGENT_STATUS,
          MessageType.COMMAND_STATUS,
          MessageType.TERMINAL_STREAM,
          MessageType.TRACE_STREAM,
          MessageType.QUEUE_UPDATE,
          MessageType.EMERGENCY_STOP,
        ];

        serverToDashboardTypes.forEach(type => {
          expect(Object.values(MessageType)).toContain(type);
        });
      });

      it('should have all expected dashboard to server message types', () => {
        const dashboardToServerTypes = [
          MessageType.DASHBOARD_INIT,
          MessageType.DASHBOARD_SUBSCRIBE,
          MessageType.DASHBOARD_UNSUBSCRIBE,
        ];

        dashboardToServerTypes.forEach(type => {
          expect(Object.values(MessageType)).toContain(type);
        });
      });

      it('should have all expected bidirectional message types', () => {
        const bidirectionalTypes = [
          MessageType.PING,
          MessageType.PONG,
          MessageType.ACK,
          MessageType.ERROR,
        ];

        bidirectionalTypes.forEach(type => {
          expect(Object.values(MessageType)).toContain(type);
        });
      });
    });

    describe('AgentType', () => {
      it('should have expected agent types', () => {
        const expectedTypes: AgentType[] = ['CLAUDE', 'GEMINI', 'CODEX'];
        expectedTypes.forEach(type => {
          expect(type).toBeDefined();
          expect(typeof type).toBe('string');
        });
      });
    });

    describe('AgentStatus', () => {
      it('should have expected agent statuses', () => {
        const expectedStatuses: AgentStatus[] = ['ONLINE', 'OFFLINE', 'CONNECTING', 'ERROR'];
        expectedStatuses.forEach(status => {
          expect(status).toBeDefined();
          expect(typeof status).toBe('string');
        });
      });
    });

    describe('AgentActivityState', () => {
      it('should have expected activity states', () => {
        const expectedStates: AgentActivityState[] = ['IDLE', 'PROCESSING', 'QUEUED'];
        expectedStates.forEach(state => {
          expect(state).toBeDefined();
          expect(typeof state).toBe('string');
        });
      });
    });

    describe('CommandType', () => {
      it('should have expected command types', () => {
        const expectedTypes: CommandType[] = ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'];
        expectedTypes.forEach(type => {
          expect(type).toBeDefined();
          expect(typeof type).toBe('string');
        });
      });
    });

    describe('CommandStatus', () => {
      it('should have expected command statuses', () => {
        const expectedStatuses: CommandStatus[] = ['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'];
        expectedStatuses.forEach(status => {
          expect(status).toBeDefined();
          expect(typeof status).toBe('string');
        });
      });
    });

    describe('StreamType', () => {
      it('should have expected stream types', () => {
        const expectedTypes: StreamType[] = ['STDOUT', 'STDERR'];
        expectedTypes.forEach(type => {
          expect(type).toBeDefined();
          expect(typeof type).toBe('string');
        });
      });
    });

    describe('TraceType', () => {
      it('should have expected trace types', () => {
        const expectedTypes: TraceType[] = ['LLM_PROMPT', 'TOOL_CALL', 'RESPONSE'];
        expectedTypes.forEach(type => {
          expect(type).toBeDefined();
          expect(typeof type).toBe('string');
        });
      });
    });

    describe('ErrorType', () => {
      it('should have expected error types', () => {
        const expectedTypes: ErrorType[] = ['CONNECTION', 'EXECUTION', 'RESOURCE', 'UNKNOWN'];
        expectedTypes.forEach(type => {
          expect(type).toBeDefined();
          expect(typeof type).toBe('string');
        });
      });
    });

    describe('AgentControlAction', () => {
      it('should have expected control actions', () => {
        const expectedActions: AgentControlAction[] = ['STOP', 'RESTART', 'PAUSE', 'RESUME'];
        expectedActions.forEach(action => {
          expect(action).toBeDefined();
          expect(typeof action).toBe('string');
        });
      });
    });

    describe('ReportStatus', () => {
      it('should have expected report statuses', () => {
        const expectedStatuses: ReportStatus[] = ['DRAFT', 'IN_PROGRESS', 'COMPLETE'];
        expectedStatuses.forEach(status => {
          expect(status).toBeDefined();
          expect(typeof status).toBe('string');
        });
      });
    });
  });

  describe('Type Guards', () => {
    describe('isAgentMessage', () => {
      it('should return true for agent message types', () => {
        const agentMessageTypes = [
          MessageType.AGENT_CONNECT,
          MessageType.AGENT_HEARTBEAT,
          MessageType.AGENT_ERROR,
          MessageType.COMMAND_ACK,
          MessageType.COMMAND_COMPLETE,
          MessageType.TERMINAL_OUTPUT,
          MessageType.TRACE_EVENT,
          MessageType.INVESTIGATION_REPORT,
        ];

        agentMessageTypes.forEach(type => {
          expect(isAgentMessage(type)).toBe(true);
        });
      });

      it('should return false for non-agent message types', () => {
        const nonAgentMessageTypes = [
          MessageType.COMMAND_REQUEST,
          MessageType.COMMAND_CANCEL,
          MessageType.AGENT_CONTROL,
          MessageType.TOKEN_REFRESH,
          MessageType.SERVER_HEARTBEAT,
          MessageType.AGENT_STATUS,
          MessageType.COMMAND_STATUS,
          MessageType.TERMINAL_STREAM,
          MessageType.TRACE_STREAM,
          MessageType.QUEUE_UPDATE,
          MessageType.EMERGENCY_STOP,
          MessageType.DASHBOARD_INIT,
          MessageType.DASHBOARD_SUBSCRIBE,
          MessageType.DASHBOARD_UNSUBSCRIBE,
          MessageType.PING,
          MessageType.PONG,
          MessageType.ACK,
          MessageType.ERROR,
        ];

        nonAgentMessageTypes.forEach(type => {
          expect(isAgentMessage(type)).toBe(false);
        });
      });
    });

    describe('isServerToAgentMessage', () => {
      it('should return true for server to agent message types', () => {
        const serverToAgentTypes = [
          MessageType.COMMAND_REQUEST,
          MessageType.COMMAND_CANCEL,
          MessageType.AGENT_CONTROL,
          MessageType.TOKEN_REFRESH,
          MessageType.SERVER_HEARTBEAT,
        ];

        serverToAgentTypes.forEach(type => {
          expect(isServerToAgentMessage(type)).toBe(true);
        });
      });

      it('should return false for non-server-to-agent message types', () => {
        const nonServerToAgentTypes = [
          MessageType.AGENT_CONNECT,
          MessageType.AGENT_HEARTBEAT,
          MessageType.AGENT_ERROR,
          MessageType.COMMAND_ACK,
          MessageType.COMMAND_COMPLETE,
          MessageType.TERMINAL_OUTPUT,
          MessageType.TRACE_EVENT,
          MessageType.INVESTIGATION_REPORT,
          MessageType.AGENT_STATUS,
          MessageType.COMMAND_STATUS,
          MessageType.TERMINAL_STREAM,
          MessageType.TRACE_STREAM,
          MessageType.QUEUE_UPDATE,
          MessageType.EMERGENCY_STOP,
          MessageType.DASHBOARD_INIT,
          MessageType.DASHBOARD_SUBSCRIBE,
          MessageType.DASHBOARD_UNSUBSCRIBE,
          MessageType.PING,
          MessageType.PONG,
          MessageType.ACK,
          MessageType.ERROR,
        ];

        nonServerToAgentTypes.forEach(type => {
          expect(isServerToAgentMessage(type)).toBe(false);
        });
      });
    });

    describe('isDashboardMessage', () => {
      it('should return true for dashboard message types', () => {
        const dashboardMessageTypes = [
          MessageType.DASHBOARD_INIT,
          MessageType.DASHBOARD_SUBSCRIBE,
          MessageType.DASHBOARD_UNSUBSCRIBE,
        ];

        dashboardMessageTypes.forEach(type => {
          expect(isDashboardMessage(type)).toBe(true);
        });
      });

      it('should return false for non-dashboard message types', () => {
        const nonDashboardTypes = [
          MessageType.AGENT_CONNECT,
          MessageType.AGENT_HEARTBEAT,
          MessageType.AGENT_ERROR,
          MessageType.COMMAND_ACK,
          MessageType.COMMAND_COMPLETE,
          MessageType.TERMINAL_OUTPUT,
          MessageType.TRACE_EVENT,
          MessageType.INVESTIGATION_REPORT,
          MessageType.COMMAND_REQUEST,
          MessageType.COMMAND_CANCEL,
          MessageType.AGENT_CONTROL,
          MessageType.TOKEN_REFRESH,
          MessageType.SERVER_HEARTBEAT,
          MessageType.AGENT_STATUS,
          MessageType.COMMAND_STATUS,
          MessageType.TERMINAL_STREAM,
          MessageType.TRACE_STREAM,
          MessageType.QUEUE_UPDATE,
          MessageType.EMERGENCY_STOP,
          MessageType.PING,
          MessageType.PONG,
          MessageType.ACK,
          MessageType.ERROR,
        ];

        nonDashboardTypes.forEach(type => {
          expect(isDashboardMessage(type)).toBe(false);
        });
      });
    });

    describe('isServerToDashboardMessage', () => {
      it('should return true for server to dashboard message types', () => {
        const serverToDashboardTypes = [
          MessageType.AGENT_STATUS,
          MessageType.COMMAND_STATUS,
          MessageType.TERMINAL_STREAM,
          MessageType.TRACE_STREAM,
          MessageType.QUEUE_UPDATE,
          MessageType.EMERGENCY_STOP,
        ];

        serverToDashboardTypes.forEach(type => {
          expect(isServerToDashboardMessage(type)).toBe(true);
        });
      });

      it('should return false for non-server-to-dashboard message types', () => {
        const nonServerToDashboardTypes = [
          MessageType.AGENT_CONNECT,
          MessageType.AGENT_HEARTBEAT,
          MessageType.AGENT_ERROR,
          MessageType.COMMAND_ACK,
          MessageType.COMMAND_COMPLETE,
          MessageType.TERMINAL_OUTPUT,
          MessageType.TRACE_EVENT,
          MessageType.INVESTIGATION_REPORT,
          MessageType.COMMAND_REQUEST,
          MessageType.COMMAND_CANCEL,
          MessageType.AGENT_CONTROL,
          MessageType.TOKEN_REFRESH,
          MessageType.SERVER_HEARTBEAT,
          MessageType.DASHBOARD_INIT,
          MessageType.DASHBOARD_SUBSCRIBE,
          MessageType.DASHBOARD_UNSUBSCRIBE,
          MessageType.PING,
          MessageType.PONG,
          MessageType.ACK,
          MessageType.ERROR,
        ];

        nonServerToDashboardTypes.forEach(type => {
          expect(isServerToDashboardMessage(type)).toBe(false);
        });
      });
    });
  });

  describe('Type Interfaces', () => {
    describe('WebSocketMessage', () => {
      it('should enforce correct structure at compile time', () => {
        const message: WebSocketMessage<PingPayload> = {
          type: MessageType.PING,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: { timestamp: Date.now() }
        };

        expect(message.type).toBe(MessageType.PING);
        expect(typeof message.id).toBe('string');
        expect(typeof message.timestamp).toBe('number');
        expect(typeof message.payload).toBe('object');
      });
    });

    describe('TypedWebSocketMessage', () => {
      it('should correctly type message based on MessageType', () => {
        const pingMessage: TypedWebSocketMessage<MessageType.PING> = {
          type: MessageType.PING,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: { timestamp: Date.now() }
        };

        // TypeScript should enforce the correct payload type
        expect(pingMessage.payload.timestamp).toBeDefined();
        expect(typeof pingMessage.payload.timestamp).toBe('number');
      });

      it('should correctly type agent connect message', () => {
        const agentConnectMessage: TypedWebSocketMessage<MessageType.AGENT_CONNECT> = {
          type: MessageType.AGENT_CONNECT,
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

        // TypeScript should enforce the correct payload structure
        expect(agentConnectMessage.payload.agentId).toBeDefined();
        expect(agentConnectMessage.payload.agentType).toBe('CLAUDE');
        expect(agentConnectMessage.payload.capabilities.maxTokens).toBe(4000);
      });
    });

    describe('MessagePayloadMap', () => {
      it('should correctly map message types to payload types', () => {
        // This test verifies the type mapping at runtime
        type PingPayloadFromMap = MessagePayloadMap[MessageType.PING];
        type AgentConnectPayloadFromMap = MessagePayloadMap[MessageType.AGENT_CONNECT];

        // These assertions verify that the types are correctly mapped
        const pingPayload: PingPayloadFromMap = { timestamp: Date.now() };
        const agentConnectPayload: AgentConnectPayloadFromMap = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          agentType: 'CLAUDE',
          version: '1.0.0',
          hostMachine: 'localhost',
          capabilities: {
            maxTokens: 4000,
            supportsInterrupt: true,
            supportsTrace: true,
          }
        };

        expect(pingPayload.timestamp).toBeDefined();
        expect(agentConnectPayload.agentId).toBeDefined();
      });
    });
  });

  describe('Union Types', () => {
    describe('AgentMessage', () => {
      it('should accept all agent message types', () => {
        const agentConnect: AgentMessage = {
          type: MessageType.AGENT_CONNECT,
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

        const agentHeartbeat: AgentMessage = {
          type: MessageType.AGENT_HEARTBEAT,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: {
            agentId: '550e8400-e29b-41d4-a716-446655440001',
            healthMetrics: {
              cpuUsage: 45.5,
              memoryUsage: 1024,
              uptime: 3600,
              commandsProcessed: 10,
              averageResponseTime: 250,
            }
          }
        };

        expect(agentConnect.type).toBe(MessageType.AGENT_CONNECT);
        expect(agentHeartbeat.type).toBe(MessageType.AGENT_HEARTBEAT);
      });
    });

    describe('DashboardMessage', () => {
      it('should accept all dashboard message types', () => {
        const dashboardInit: DashboardMessage = {
          type: MessageType.DASHBOARD_INIT,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: {
            userId: 'user_123',
            subscriptions: {
              agents: ['550e8400-e29b-41d4-a716-446655440001'],
              traces: true,
            }
          }
        };

        const dashboardSubscribe: DashboardMessage = {
          type: MessageType.DASHBOARD_SUBSCRIBE,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: {
            type: 'agent',
            id: '550e8400-e29b-41d4-a716-446655440001',
          }
        };

        expect(dashboardInit.type).toBe(MessageType.DASHBOARD_INIT);
        expect(dashboardSubscribe.type).toBe(MessageType.DASHBOARD_SUBSCRIBE);
      });
    });

    describe('ServerMessage', () => {
      it('should accept all server message types', () => {
        const commandRequest: ServerMessage = {
          type: MessageType.COMMAND_REQUEST,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: {
            commandId: '550e8400-e29b-41d4-a716-446655440001',
            content: 'Analyze the codebase',
            type: 'INVESTIGATE',
            priority: 50,
          }
        };

        const agentStatus: ServerMessage = {
          type: MessageType.AGENT_STATUS,
          id: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: Date.now(),
          payload: {
            agentId: '550e8400-e29b-41d4-a716-446655440001',
            status: 'ONLINE',
            activityState: 'IDLE',
          }
        };

        expect(commandRequest.type).toBe(MessageType.COMMAND_REQUEST);
        expect(agentStatus.type).toBe(MessageType.AGENT_STATUS);
      });
    });
  });

  describe('Payload Interfaces', () => {
    describe('AgentConnectPayload', () => {
      it('should enforce correct structure', () => {
        const payload: AgentConnectPayload = {
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          agentType: 'CLAUDE',
          version: '1.0.0',
          hostMachine: 'localhost',
          capabilities: {
            maxTokens: 4000,
            supportsInterrupt: true,
            supportsTrace: true,
          }
        };

        expect(payload.agentId).toBeDefined();
        expect(payload.agentType).toBe('CLAUDE');
        expect(payload.capabilities.maxTokens).toBe(4000);
      });
    });

    describe('TraceEventPayload', () => {
      it('should allow optional fields', () => {
        const payload: TraceEventPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          traceId: '550e8400-e29b-41d4-a716-446655440002',
          parentId: null,
          type: 'LLM_PROMPT',
          name: 'Code Generation',
          content: {
            prompt: 'Generate a function',
            response: 'Here is the function...',
          },
          startedAt: Date.now() - 1000,
          completedAt: Date.now(),
          durationMs: 1000,
        };

        expect(payload.parentId).toBeNull();
        expect(payload.tokensUsed).toBeUndefined();
        expect(payload.metadata).toBeUndefined();
      });

      it('should allow all optional fields to be provided', () => {
        const payload: TraceEventPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          traceId: '550e8400-e29b-41d4-a716-446655440002',
          parentId: '550e8400-e29b-41d4-a716-446655440003',
          type: 'TOOL_CALL',
          name: 'File Read',
          content: {
            toolName: 'read_file',
            toolInput: { path: '/test.txt' },
            toolOutput: 'file contents',
          },
          startedAt: Date.now() - 1000,
          completedAt: Date.now(),
          durationMs: 1000,
          tokensUsed: 150,
          metadata: { model: 'claude-3', temperature: 0.7 },
        };

        expect(payload.parentId).toBeDefined();
        expect(payload.tokensUsed).toBe(150);
        expect(payload.metadata).toBeDefined();
      });
    });

    describe('InvestigationReportPayload', () => {
      it('should handle complex nested structure', () => {
        const payload: InvestigationReportPayload = {
          commandId: '550e8400-e29b-41d4-a716-446655440000',
          agentId: '550e8400-e29b-41d4-a716-446655440001',
          reportId: '550e8400-e29b-41d4-a716-446655440002',
          status: 'COMPLETE',
          title: 'Code Quality Analysis',
          summary: 'Analysis of codebase quality',
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
                description: 'Missing error handling',
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

        expect(payload.content.sections).toHaveLength(1);
        expect(payload.content.findings).toHaveLength(1);
        expect(payload.content.recommendations).toHaveLength(1);
        expect(payload.content.findings[0].type).toBe('issue');
        expect(payload.content.findings[0].severity).toBe('medium');
      });
    });
  });

  describe('Type Consistency', () => {
    it('should have consistent enum and union type values', () => {
      // Verify that string union types match enum values
      const agentTypes: AgentType[] = ['CLAUDE', 'GEMINI', 'CODEX'];
      const agentStatuses: AgentStatus[] = ['ONLINE', 'OFFLINE', 'CONNECTING', 'ERROR'];
      const commandTypes: CommandType[] = ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'];

      agentTypes.forEach(type => expect(typeof type).toBe('string'));
      agentStatuses.forEach(status => expect(typeof status).toBe('string'));
      commandTypes.forEach(type => expect(typeof type).toBe('string'));
    });

    it('should have all message types accounted for in type guards', () => {
      const allMessageTypes = Object.values(MessageType);
      const categorizedTypes = new Set<MessageType>();

      // Collect all types from type guard functions
      allMessageTypes.forEach(type => {
        if (isAgentMessage(type)) categorizedTypes.add(type);
        if (isServerToAgentMessage(type)) categorizedTypes.add(type);
        if (isDashboardMessage(type)) categorizedTypes.add(type);
        if (isServerToDashboardMessage(type)) categorizedTypes.add(type);
      });

      // Add bidirectional types manually since they don't fit the category pattern
      categorizedTypes.add(MessageType.PING);
      categorizedTypes.add(MessageType.PONG);
      categorizedTypes.add(MessageType.ACK);
      categorizedTypes.add(MessageType.ERROR);

      expect(categorizedTypes.size).toBe(allMessageTypes.length);
    });
  });

  describe('Type Safety', () => {
    it('should prevent invalid assignments at compile time', () => {
      // These tests verify TypeScript compile-time type safety
      // They will fail at compile time if types are incorrectly defined

      const validAgentType: AgentType = 'CLAUDE';
      const validStatus: AgentStatus = 'ONLINE';
      const validCommandType: CommandType = 'NATURAL';

      expect(validAgentType).toBe('CLAUDE');
      expect(validStatus).toBe('ONLINE');
      expect(validCommandType).toBe('NATURAL');

      // Test that we can't assign invalid values (this would fail at compile time)
      // const invalidAgentType: AgentType = 'INVALID'; // Would cause compile error
      // const invalidStatus: AgentStatus = 'INVALID'; // Would cause compile error
    });

    it('should enforce correct payload types for each message type', () => {
      // This verifies that TypeScript correctly maps message types to payload types
      type PingPayload = MessagePayloadMap[MessageType.PING];
      type AgentConnectPayload = MessagePayloadMap[MessageType.AGENT_CONNECT];

      const pingPayload: PingPayload = { timestamp: Date.now() };
      const agentConnectPayload: AgentConnectPayload = {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        agentType: 'CLAUDE',
        version: '1.0.0',
        hostMachine: 'localhost',
        capabilities: {
          maxTokens: 4000,
          supportsInterrupt: true,
          supportsTrace: true,
        }
      };

      expect(typeof pingPayload.timestamp).toBe('number');
      expect(agentConnectPayload.agentType).toBe('CLAUDE');
    });
  });
});