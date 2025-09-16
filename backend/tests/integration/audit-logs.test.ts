import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext, authenticateTestUser } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

describe('Integration: Complete Audit Trail (Test 10)', () => {
  let ctx: TestContext;
  let wsUrl: string;
  let authToken: string;
  let testUserId: string;

  // Mock audit log storage
  const auditLogs: any[] = [];
  const retentionDays = 30;

  beforeAll(async () => {
    ctx = await createTestServer();

    // Setup authentication
    authToken = await authenticateTestUser(ctx.supabase);
    expect(authToken).toBeDefined();

    // Get test user ID
    const { data: { user } } = await ctx.supabase.auth.getUser(authToken);
    testUserId = user!.id;

    // Setup WebSocket
    await ctx.server.register(require('@fastify/websocket'));

    // Audit logging middleware
    const logAuditEvent = (eventType: string, details: any = {}) => {
      const auditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventType,
        userId: details.userId || null,
        agentId: details.agentId || null,
        commandId: details.commandId || null,
        details: {
          // Redact sensitive data
          ...details,
          password: details.password ? '[REDACTED]' : undefined,
          token: details.token ? '[REDACTED]' : undefined,
          secret: details.secret ? '[REDACTED]' : undefined,
        },
        ipAddress: details.ipAddress || '127.0.0.1',
        userAgent: details.userAgent || 'test-client',
        createdAt: new Date().toISOString(),
      };

      // Remove undefined fields for cleaner logs
      Object.keys(auditEntry.details).forEach(key => {
        if (auditEntry.details[key] === undefined) {
          delete auditEntry.details[key];
        }
      });

      auditLogs.push(auditEntry);
    };

    // Authentication endpoints with audit logging
    ctx.server.post('/auth/login', async (request, reply) => {
      const { email, password } = request.body as any;

      logAuditEvent('USER_LOGIN', {
        userId: testUserId,
        email,
        password, // Will be redacted
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({ token: authToken, userId: testUserId });
    });

    ctx.server.post('/auth/logout', async (request, reply) => {
      logAuditEvent('USER_LOGOUT', {
        userId: testUserId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({ success: true });
    });

    // Command presets with audit logging
    ctx.server.post('/presets', async (request, reply) => {
      const preset = request.body as any;
      const presetId = `preset-${Date.now()}`;

      logAuditEvent('PRESET_CREATED', {
        userId: testUserId,
        presetId,
        name: preset.name,
        command: preset.command,
      });

      return reply.send({ id: presetId, ...preset });
    });

    // WebSocket with audit logging
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            const agentId = data.payload.agentId;

            logAuditEvent('AGENT_CONNECT', {
              agentId,
              version: data.payload.version,
              capabilities: data.payload.capabilities,
            });

            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: { agentId },
            }));
          }

          if (data.type === MessageType.COMMAND_COMPLETE) {
            logAuditEvent('COMMAND_COMPLETED', {
              agentId: data.payload.agentId,
              commandId: data.payload.commandId,
              exitCode: data.payload.exitCode,
              duration: data.payload.duration,
            });
          }

          if (data.type === MessageType.AGENT_ERROR) {
            logAuditEvent('AGENT_ERROR', {
              agentId: data.payload.agentId,
              errorCode: data.payload.errorCode,
              message: data.payload.message,
            });
          }
        });

        connection.socket.on('close', () => {
          logAuditEvent('AGENT_DISCONNECT', {
            // Agent ID would be tracked in real implementation
            reason: 'connection_closed',
          });
        });
      });
    });

    // Commands with audit logging
    ctx.server.post('/commands', async (request, reply) => {
      const command = request.body as any;
      const commandId = `cmd-${Date.now()}`;

      logAuditEvent('COMMAND_SENT', {
        userId: testUserId,
        agentId: command.agentId,
        commandId,
        command: command.command,
        priority: command.priority,
      });

      return reply.send({ id: commandId, ...command });
    });

    // Emergency stop with audit logging
    ctx.server.post('/emergency-stop', async (request, reply) => {
      logAuditEvent('EMERGENCY_STOP', {
        userId: testUserId,
        reason: 'user_initiated',
        affectedAgents: ['all'],
      });

      return reply.send({ stopped: true });
    });

    // Audit logs API
    ctx.server.get('/audit-logs', async (request, reply) => {
      const {
        eventType,
        userId,
        agentId,
        from,
        to,
        limit = 100,
      } = request.query as any;

      let filteredLogs = [...auditLogs];

      // Filter by event type
      if (eventType) {
        filteredLogs = filteredLogs.filter(log => log.eventType === eventType);
      }

      // Filter by user ID
      if (userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === userId);
      }

      // Filter by agent ID
      if (agentId) {
        filteredLogs = filteredLogs.filter(log => log.agentId === agentId);
      }

      // Filter by date range
      if (from) {
        const fromDate = new Date(from);
        filteredLogs = filteredLogs.filter(log => new Date(log.createdAt) >= fromDate);
      }

      if (to) {
        const toDate = new Date(to);
        filteredLogs = filteredLogs.filter(log => new Date(log.createdAt) <= toDate);
      }

      // Apply retention policy (30 days)
      const retentionCutoff = new Date();
      retentionCutoff.setDate(retentionCutoff.getDate() - retentionDays);
      filteredLogs = filteredLogs.filter(log => new Date(log.createdAt) >= retentionCutoff);

      // Sort by created date (newest first) and apply limit
      filteredLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      filteredLogs = filteredLogs.slice(0, parseInt(limit));

      return reply.send(filteredLogs);
    });

    // Test endpoint to manipulate audit log for immutability test
    ctx.server.put('/audit-logs/:id', async (request, reply) => {
      // This should fail - audit logs are immutable
      return reply.code(403).send({ error: 'Audit logs are immutable' });
    });

    // Test endpoint to simulate old audit logs for retention test
    ctx.server.post('/test/create-old-audit-log', async (request, reply) => {
      const { daysOld } = request.body as any;
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - daysOld);

      const oldLog = {
        id: `old-audit-${Date.now()}`,
        eventType: 'TEST_OLD_EVENT',
        userId: testUserId,
        details: { test: true },
        createdAt: oldDate.toISOString(),
      };

      auditLogs.push(oldLog);
      return reply.send(oldLog);
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  beforeEach(() => {
    // Clear audit logs before each test for isolation
    auditLogs.length = 0;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should capture authentication events in audit trail', async () => {
    // Test login
    const loginResponse = await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'secretpassword',
      },
      headers: {
        'user-agent': 'test-browser/1.0',
      },
    });

    expect(loginResponse.statusCode).toBe(200);

    // Test logout
    const logoutResponse = await ctx.server.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        'authorization': `Bearer ${authToken}`,
      },
    });

    expect(logoutResponse.statusCode).toBe(200);

    // Query audit logs
    const auditResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs',
    });

    expect(auditResponse.statusCode).toBe(200);
    const logs = JSON.parse(auditResponse.body);

    // Should have login and logout events
    const loginLog = logs.find((log: any) => log.eventType === 'USER_LOGIN');
    const logoutLog = logs.find((log: any) => log.eventType === 'USER_LOGOUT');

    expect(loginLog).toBeDefined();
    expect(loginLog.userId).toBe(testUserId);
    expect(loginLog.details.email).toBe('test@example.com');
    expect(loginLog.details.password).toBe('[REDACTED]'); // Sensitive data redacted
    expect(loginLog.userAgent).toBe('test-browser/1.0');

    expect(logoutLog).toBeDefined();
    expect(logoutLog.userId).toBe(testUserId);
  });

  it('should capture agent connection and disconnection events', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'test-agent-audit',
            token: 'secret-token',
            version: '2.0.0',
            capabilities: ['code_execution'],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          ws.close();

          setTimeout(async () => {
            const auditResponse = await ctx.server.inject({
              method: 'GET',
              url: '/audit-logs',
            });

            const logs = JSON.parse(auditResponse.body);

            const connectLog = logs.find((log: any) => log.eventType === 'AGENT_CONNECT');
            const disconnectLog = logs.find((log: any) => log.eventType === 'AGENT_DISCONNECT');

            expect(connectLog).toBeDefined();
            expect(connectLog.agentId).toBe('test-agent-audit');
            expect(connectLog.details.version).toBe('2.0.0');
            expect(connectLog.details.token).toBeUndefined(); // Token should be redacted and removed

            expect(disconnectLog).toBeDefined();
            expect(disconnectLog.details.reason).toBe('connection_closed');

            resolve();
          }, 100);
        }
      });
    });
  });

  it('should capture command execution events', async () => {
    // Send command
    const commandResponse = await ctx.server.inject({
      method: 'POST',
      url: '/commands',
      payload: {
        agentId: 'test-agent-1',
        command: 'echo "test command"',
        priority: 1,
      },
    });

    expect(commandResponse.statusCode).toBe(200);
    const command = JSON.parse(commandResponse.body);

    // Simulate command completion via WebSocket
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.COMMAND_COMPLETE,
          payload: {
            agentId: 'test-agent-1',
            commandId: command.id,
            exitCode: 0,
            duration: 1250,
          },
        }));
        ws.close();

        setTimeout(async () => {
          const auditResponse = await ctx.server.inject({
            method: 'GET',
            url: '/audit-logs',
          });

          const logs = JSON.parse(auditResponse.body);

          const sentLog = logs.find((log: any) => log.eventType === 'COMMAND_SENT');
          const completedLog = logs.find((log: any) => log.eventType === 'COMMAND_COMPLETED');

          expect(sentLog).toBeDefined();
          expect(sentLog.userId).toBe(testUserId);
          expect(sentLog.agentId).toBe('test-agent-1');
          expect(sentLog.commandId).toBe(command.id);
          expect(sentLog.details.command).toBe('echo "test command"');

          expect(completedLog).toBeDefined();
          expect(completedLog.agentId).toBe('test-agent-1');
          expect(completedLog.commandId).toBe(command.id);
          expect(completedLog.details.exitCode).toBe(0);
          expect(completedLog.details.duration).toBe(1250);

          resolve();
        }, 100);
      });
    });
  });

  it('should capture preset creation and emergency stop events', async () => {
    // Create preset
    const presetResponse = await ctx.server.inject({
      method: 'POST',
      url: '/presets',
      payload: {
        name: 'Test Preset',
        command: 'system check',
        type: 'INVESTIGATE',
      },
    });

    expect(presetResponse.statusCode).toBe(200);

    // Trigger emergency stop
    const stopResponse = await ctx.server.inject({
      method: 'POST',
      url: '/emergency-stop',
    });

    expect(stopResponse.statusCode).toBe(200);

    // Query audit logs
    const auditResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs',
    });

    const logs = JSON.parse(auditResponse.body);

    const presetLog = logs.find((log: any) => log.eventType === 'PRESET_CREATED');
    const stopLog = logs.find((log: any) => log.eventType === 'EMERGENCY_STOP');

    expect(presetLog).toBeDefined();
    expect(presetLog.userId).toBe(testUserId);
    expect(presetLog.details.name).toBe('Test Preset');
    expect(presetLog.details.command).toBe('system check');

    expect(stopLog).toBeDefined();
    expect(stopLog.userId).toBe(testUserId);
    expect(stopLog.details.reason).toBe('user_initiated');
    expect(stopLog.details.affectedAgents).toEqual(['all']);
  });

  it('should filter audit logs by event type, user, and date range', async () => {
    // Create various events
    await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'pass' },
    });

    await ctx.server.inject({
      method: 'POST',
      url: '/commands',
      payload: { agentId: 'agent-1', command: 'test', priority: 1 },
    });

    await ctx.server.inject({
      method: 'POST',
      url: '/emergency-stop',
    });

    // Test filtering by event type
    const loginLogsResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs?eventType=USER_LOGIN',
    });
    const loginLogs = JSON.parse(loginLogsResponse.body);
    expect(loginLogs.length).toBe(1);
    expect(loginLogs[0].eventType).toBe('USER_LOGIN');

    // Test filtering by user
    const userLogsResponse = await ctx.server.inject({
      method: 'GET',
      url: `/audit-logs?userId=${testUserId}`,
    });
    const userLogs = JSON.parse(userLogsResponse.body);
    expect(userLogs.length).toBe(3); // login, command, emergency stop
    expect(userLogs.every((log: any) => log.userId === testUserId)).toBe(true);

    // Test filtering by agent ID
    const agentLogsResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs?agentId=agent-1',
    });
    const agentLogs = JSON.parse(agentLogsResponse.body);
    expect(agentLogs.length).toBe(1);
    expect(agentLogs[0].eventType).toBe('COMMAND_SENT');

    // Test date range filtering
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentLogsResponse = await ctx.server.inject({
      method: 'GET',
      url: `/audit-logs?from=${oneHourAgo.toISOString()}`,
    });
    const recentLogs = JSON.parse(recentLogsResponse.body);
    expect(recentLogs.length).toBe(3);
  });

  it('should verify audit log immutability', async () => {
    // Create an audit log entry
    await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'pass' },
    });

    const auditResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs',
    });
    const logs = JSON.parse(auditResponse.body);
    const logId = logs[0].id;

    // Attempt to modify the audit log (should fail)
    const updateResponse = await ctx.server.inject({
      method: 'PUT',
      url: `/audit-logs/${logId}`,
      payload: { eventType: 'MODIFIED_EVENT' },
    });

    expect(updateResponse.statusCode).toBe(403);
    const error = JSON.parse(updateResponse.body);
    expect(error.error).toBe('Audit logs are immutable');

    // Verify log is unchanged
    const unchangedResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs',
    });
    const unchangedLogs = JSON.parse(unchangedResponse.body);
    expect(unchangedLogs[0].eventType).toBe('USER_LOGIN');
  });

  it('should test 30-day retention policy', async () => {
    // Create a recent log
    await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'recent@example.com', password: 'pass' },
    });

    // Create an old log (35 days old)
    await ctx.server.inject({
      method: 'POST',
      url: '/test/create-old-audit-log',
      payload: { daysOld: 35 },
    });

    // Create a log within retention period (25 days old)
    await ctx.server.inject({
      method: 'POST',
      url: '/test/create-old-audit-log',
      payload: { daysOld: 25 },
    });

    // Query all logs - should only return logs within 30 days
    const auditResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs',
    });
    const logs = JSON.parse(auditResponse.body);

    // Should have 2 logs (recent + 25 days old), but not the 35-day-old log
    expect(logs.length).toBe(2);
    expect(logs.some((log: any) => log.details?.email === 'recent@example.com')).toBe(true);
    expect(logs.some((log: any) => log.eventType === 'TEST_OLD_EVENT')).toBe(true);
    expect(logs.every((log: any) => {
      const logDate = new Date(log.createdAt);
      const daysDiff = (Date.now() - logDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    })).toBe(true);
  });

  it('should verify sensitive data is redacted in logs', async () => {
    // Create events with sensitive data
    await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'supersecret123',
        secret: 'api-key-12345',
      },
    });

    // Connect agent with token
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'test-agent',
            token: 'jwt-token-secret',
            version: '1.0.0',
          },
        }));
      });

      ws.on('message', () => {
        ws.close();
        resolve();
      });
    });

    // Query audit logs
    const auditResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs',
    });
    const logs = JSON.parse(auditResponse.body);

    const loginLog = logs.find((log: any) => log.eventType === 'USER_LOGIN');
    const connectLog = logs.find((log: any) => log.eventType === 'AGENT_CONNECT');

    // Verify sensitive data is redacted
    expect(loginLog.details.password).toBe('[REDACTED]');
    expect(loginLog.details.secret).toBe('[REDACTED]');
    expect(loginLog.details.email).toBe('test@example.com'); // Email is not sensitive

    // Verify token is completely removed after redaction
    expect(connectLog.details.token).toBeUndefined();
    expect(connectLog.agentId).toBe('test-agent'); // Non-sensitive data preserved
  });

  it('should handle audit logs for all system events comprehensively', async () => {
    // Perform various actions that should be audited
    const actions = [];

    // 1. Authentication
    actions.push(
      ctx.server.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'comprehensive@example.com', password: 'pass' },
      })
    );

    // 2. Preset management
    actions.push(
      ctx.server.inject({
        method: 'POST',
        url: '/presets',
        payload: { name: 'Comprehensive Test', command: 'ls -la', type: 'SYSTEM' },
      })
    );

    // 3. Command execution
    actions.push(
      ctx.server.inject({
        method: 'POST',
        url: '/commands',
        payload: { agentId: 'comp-agent', command: 'comprehensive test', priority: 2 },
      })
    );

    // 4. Emergency stop
    actions.push(
      ctx.server.inject({
        method: 'POST',
        url: '/emergency-stop',
      })
    );

    // Wait for all actions to complete
    await Promise.all(actions);

    // 5. Agent operations via WebSocket
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        // Agent connect
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: { agentId: 'comp-agent', version: '1.0.0' },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          // Agent error
          ws.send(JSON.stringify({
            type: MessageType.AGENT_ERROR,
            payload: {
              agentId: 'comp-agent',
              errorCode: 'TEST_ERROR',
              message: 'Comprehensive test error',
            },
          }));

          // Command complete
          ws.send(JSON.stringify({
            type: MessageType.COMMAND_COMPLETE,
            payload: {
              agentId: 'comp-agent',
              commandId: 'comp-cmd-123',
              exitCode: 1,
              duration: 5000,
            },
          }));

          ws.close();
          resolve();
        }
      });
    });

    // 6. Logout
    await ctx.server.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    // Verify all events are captured
    const auditResponse = await ctx.server.inject({
      method: 'GET',
      url: '/audit-logs?limit=50',
    });
    const logs = JSON.parse(auditResponse.body);

    const expectedEvents = [
      'USER_LOGIN',
      'PRESET_CREATED',
      'COMMAND_SENT',
      'EMERGENCY_STOP',
      'AGENT_CONNECT',
      'AGENT_ERROR',
      'COMMAND_COMPLETED',
      'AGENT_DISCONNECT',
      'USER_LOGOUT',
    ];

    expectedEvents.forEach(eventType => {
      const eventLog = logs.find((log: any) => log.eventType === eventType);
      expect(eventLog).toBeDefined();
      expect(eventLog.createdAt).toBeDefined();
      expect(eventLog.id).toBeDefined();
    });

    // Verify logs are properly ordered (newest first)
    for (let i = 0; i < logs.length - 1; i++) {
      const currentTime = new Date(logs[i].createdAt).getTime();
      const nextTime = new Date(logs[i + 1].createdAt).getTime();
      expect(currentTime).toBeGreaterThanOrEqual(nextTime);
    }

    // Verify each log has required fields
    logs.forEach((log: any) => {
      expect(log.id).toBeDefined();
      expect(log.eventType).toBeDefined();
      expect(log.createdAt).toBeDefined();
      expect(log.details).toBeDefined();
      expect(typeof log.details).toBe('object');
    });
  });
});