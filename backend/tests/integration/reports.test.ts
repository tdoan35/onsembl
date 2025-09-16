import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext, authenticateTestUser } from '../helpers/test-server';
import { MessageType, AgentType, CommandStatus, TraceEventType, TerminalOutputType } from '@onsembl/agent-protocol';

describe('Integration: Investigation Report Generation', () => {
  let ctx: TestContext;
  let wsUrl: string;
  let authToken: string;
  let testAgentId: string;
  let testCommandId: string;

  // Test data for report generation
  const investigationCommand = 'Investigate: Performance bottlenecks in the system';
  const reports = new Map();
  const commands = new Map();
  const traceData: any[] = [];
  const terminalOutputs: any[] = [];

  beforeAll(async () => {
    ctx = await createTestServer();
    authToken = await authenticateTestUser(ctx.supabase) || '';
    testAgentId = 'agent-report-test';
    testCommandId = 'cmd-investigation-' + Date.now();

    await ctx.server.register(require('@fastify/websocket'));

    // WebSocket handler for agent simulation
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        let agentId: string;

        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            agentId = data.payload.agentId;
            connection.socket.send(JSON.stringify({
              type: MessageType.CONNECTION_ACK,
              payload: {
                agentId,
                connectionId: 'conn-' + Date.now(),
                serverVersion: '1.0.0',
              },
              timestamp: new Date().toISOString(),
            }));
          }

          if (data.type === MessageType.COMMAND_REQUEST) {
            const commandId = data.payload.commandId;

            // Store command data
            commands.set(commandId, {
              id: commandId,
              agentId,
              command: data.payload.command,
              status: CommandStatus.EXECUTING,
              startedAt: new Date().toISOString(),
            });

            // Send acknowledgment
            connection.socket.send(JSON.stringify({
              type: MessageType.COMMAND_ACK,
              payload: {
                commandId,
                status: CommandStatus.EXECUTING,
              },
              timestamp: new Date().toISOString(),
            }));

            // Simulate investigation process with outputs and traces
            simulateInvestigationProcess(connection, commandId, agentId, data.payload.command);
          }
        });
      });
    });

    // REST API endpoints for reports
    ctx.server.get('/reports', async (request, reply) => {
      const { agentId, status } = request.query as any;
      let filteredReports = Array.from(reports.values());

      if (agentId) {
        filteredReports = filteredReports.filter(r => r.agentId === agentId);
      }

      if (status) {
        filteredReports = filteredReports.filter(r => r.status === status);
      }

      return reply.send({
        reports: filteredReports,
        total: filteredReports.length,
      });
    });

    ctx.server.get('/reports/:reportId', async (request, reply) => {
      const { reportId } = request.params as any;
      const report = reports.get(reportId);

      if (!report) {
        return reply.code(404).send({ error: 'Report not found' });
      }

      return reply.send(report);
    });

    ctx.server.get('/reports/:reportId/export', async (request, reply) => {
      const { reportId } = request.params as any;
      const { format = 'json' } = request.query as any;
      const report = reports.get(reportId);

      if (!report) {
        return reply.code(404).send({ error: 'Report not found' });
      }

      if (format === 'markdown') {
        const markdown = generateMarkdownReport(report);
        return reply.type('text/markdown').send(markdown);
      }

      return reply.send(report);
    });

    ctx.server.post('/reports/generate', async (request, reply) => {
      const { commandId, agentId, title } = request.body as any;
      const reportId = 'report-' + Date.now();

      const report = {
        id: reportId,
        commandId,
        agentId,
        title: title || 'Investigation Report',
        summary: '',
        status: 'pending',
        content: {
          sections: [],
          findings: [],
          recommendations: [],
          metadata: {},
        },
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      };

      reports.set(reportId, report);

      // Simulate report generation process
      setTimeout(() => generateInvestigationReport(reportId), 100);

      return reply.send({
        reportId,
        status: 'pending',
        message: 'Report generation started',
      });
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  beforeEach(() => {
    // Clear test data between tests
    reports.clear();
    commands.clear();
    traceData.length = 0;
    terminalOutputs.length = 0;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  function simulateInvestigationProcess(connection: any, commandId: string, agentId: string, command: string) {
    let sequence = 1;

    // Simulate various outputs and traces for investigation
    const investigationSteps = [
      {
        output: 'Starting system investigation...',
        traces: [
          { type: TraceEventType.THOUGHT, content: 'Analyzing system performance metrics' },
        ],
      },
      {
        output: 'Checking CPU and memory usage...',
        traces: [
          { type: TraceEventType.ACTION, content: 'Reading /proc/cpuinfo and /proc/meminfo' },
          { type: TraceEventType.OBSERVATION, content: 'CPU usage: 85%, Memory usage: 72%' },
        ],
      },
      {
        output: 'Analyzing process list...',
        traces: [
          { type: TraceEventType.ACTION, content: 'Executing ps aux command' },
          { type: TraceEventType.OBSERVATION, content: 'Found 3 high-CPU processes' },
        ],
      },
      {
        output: 'Error: Unable to access disk usage statistics',
        type: 'stderr',
        traces: [
          { type: TraceEventType.ERROR, content: 'Permission denied accessing /sys/block' },
        ],
      },
      {
        output: 'Investigation completed. Generating report...',
        traces: [
          { type: TraceEventType.THOUGHT, content: 'Summarizing findings and recommendations' },
        ],
      },
    ];

    investigationSteps.forEach((step, index) => {
      setTimeout(() => {
        // Send terminal output
        const outputMessage = {
          type: MessageType.TERMINAL_OUTPUT,
          payload: {
            commandId,
            agentId,
            output: step.output + '\n',
            type: step.type || TerminalOutputType.STDOUT,
            sequence: sequence++,
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };

        connection.socket.send(JSON.stringify(outputMessage));
        terminalOutputs.push(outputMessage.payload);

        // Send trace events
        step.traces.forEach((trace, traceIndex) => {
          const traceMessage = {
            type: MessageType.TRACE_EVENT,
            payload: {
              commandId,
              agentId,
              type: trace.type,
              content: trace.content,
              metadata: {
                model: 'claude-3-sonnet',
                promptTokens: 150,
                completionTokens: 50,
                temperature: 0.7,
                duration: 1200 + traceIndex * 100,
              },
            },
            timestamp: new Date().toISOString(),
          };

          setTimeout(() => {
            connection.socket.send(JSON.stringify(traceMessage));
            traceData.push(traceMessage.payload);
          }, traceIndex * 50);
        });

        // Complete command after last step
        if (index === investigationSteps.length - 1) {
          setTimeout(() => {
            const command = commands.get(commandId);
            if (command) {
              command.status = CommandStatus.COMPLETED;
              command.completedAt = new Date().toISOString();
              commands.set(commandId, command);
            }

            connection.socket.send(JSON.stringify({
              type: MessageType.COMMAND_COMPLETE,
              payload: {
                commandId,
                status: CommandStatus.COMPLETED,
                exitCode: 0,
                duration: 5000,
                startedAt: command?.startedAt || new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
              timestamp: new Date().toISOString(),
            }));
          }, 200);
        }
      }, index * 300);
    });
  }

  function generateInvestigationReport(reportId: string) {
    const report = reports.get(reportId);
    if (!report) return;

    // Update status to generating
    report.status = 'generating';
    reports.set(reportId, report);

    setTimeout(() => {
      // Generate structured report with findings
      report.status = 'complete';
      report.summary = 'Investigation identified several performance bottlenecks affecting system efficiency.';
      report.content = {
        sections: [
          {
            title: 'Executive Summary',
            content: 'System analysis revealed high CPU and memory usage with several problematic processes.',
            type: 'summary',
            order: 1,
          },
          {
            title: 'Performance Metrics',
            content: 'CPU Usage: 85%\nMemory Usage: 72%\nActive Processes: 156',
            type: 'metrics',
            order: 2,
          },
          {
            title: 'Command History',
            content: 'Commands executed during investigation:\n- System resource check\n- Process analysis\n- Error diagnostics',
            type: 'history',
            order: 3,
          },
        ],
        findings: [
          {
            description: 'High CPU usage detected on primary processes',
            severity: 'high',
            evidence: ['CPU usage at 85%', '3 processes consuming >20% CPU each'],
          },
          {
            description: 'Memory utilization approaching threshold',
            severity: 'medium',
            evidence: ['Memory usage at 72%', 'Potential memory leak in process PID 1234'],
          },
          {
            description: 'Disk access permissions issue',
            severity: 'low',
            evidence: ['Permission denied errors in trace logs'],
          },
        ],
        recommendations: [
          {
            action: 'Optimize high-CPU processes',
            priority: 'high',
            rationale: 'Reduce system load and improve responsiveness',
          },
          {
            action: 'Investigate memory leak',
            priority: 'medium',
            rationale: 'Prevent potential system instability',
          },
          {
            action: 'Fix disk access permissions',
            priority: 'low',
            rationale: 'Enable complete system monitoring',
          },
        ],
        metadata: {
          commandCount: terminalOutputs.length,
          traceCount: traceData.length,
          errorCount: terminalOutputs.filter(o => o.type === 'stderr').length,
          duration: '5.2 seconds',
          agentType: AgentType.CLAUDE,
        },
      };
      report.completedAt = new Date().toISOString();
      report.updatedAt = new Date().toISOString();

      reports.set(reportId, report);
    }, 500);
  }

  function generateMarkdownReport(report: any): string {
    return `# ${report.title}

## Summary
${report.summary}

## Findings
${report.content.findings.map((f: any) =>
  `### ${f.description} (${f.severity})
${f.evidence.map((e: any) => `- ${e}`).join('\n')}`
).join('\n\n')}

## Recommendations
${report.content.recommendations.map((r: any) =>
  `### ${r.action} (Priority: ${r.priority})
${r.rationale}`
).join('\n\n')}

---
Generated: ${report.completedAt}
`;
  }

  it('should execute investigation command and generate structured report', async () => {
    const ws = new WebSocket(wsUrl);
    let reportId: string;

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: testAgentId,
            token: authToken,
            version: '1.0.0',
            capabilities: ['code_execution', 'file_operations', 'investigation'],
          },
          timestamp: new Date().toISOString(),
        }));
      });

      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === MessageType.CONNECTION_ACK) {
          // Send investigation command
          ws.send(JSON.stringify({
            type: MessageType.COMMAND_REQUEST,
            payload: {
              commandId: testCommandId,
              command: investigationCommand,
              arguments: { type: 'performance' },
              priority: 1,
            },
            timestamp: new Date().toISOString(),
          }));
        }

        if (message.type === MessageType.COMMAND_COMPLETE) {
          expect(message.payload.commandId).toBe(testCommandId);
          expect(message.payload.status).toBe(CommandStatus.COMPLETED);

          // Generate report for the completed investigation
          const response = await ctx.server.inject({
            method: 'POST',
            url: '/reports/generate',
            payload: {
              commandId: testCommandId,
              agentId: testAgentId,
              title: 'System Performance Investigation',
            },
          });

          expect(response.statusCode).toBe(200);
          const result = JSON.parse(response.payload);
          reportId = result.reportId;
          expect(result.status).toBe('pending');

          ws.close();
          resolve();
        }
      });
    });

    // Wait for report generation to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify report was generated with structured findings
    const reportResponse = await ctx.server.inject({
      method: 'GET',
      url: `/reports/${reportId}`,
    });

    expect(reportResponse.statusCode).toBe(200);
    const report = JSON.parse(reportResponse.payload);

    expect(report.id).toBe(reportId);
    expect(report.status).toBe('complete');
    expect(report.title).toBe('System Performance Investigation');
    expect(report.summary).toContain('performance bottlenecks');
    expect(report.completedAt).toBeTruthy();

    // Verify structured content
    expect(report.content.sections).toHaveLength(3);
    expect(report.content.findings).toHaveLength(3);
    expect(report.content.recommendations).toHaveLength(3);

    // Verify findings have required fields
    report.content.findings.forEach((finding: any) => {
      expect(finding).toHaveProperty('description');
      expect(finding).toHaveProperty('severity');
      expect(finding).toHaveProperty('evidence');
      expect(Array.isArray(finding.evidence)).toBe(true);
    });

    // Verify recommendations have required fields
    report.content.recommendations.forEach((rec: any) => {
      expect(rec).toHaveProperty('action');
      expect(rec).toHaveProperty('priority');
      expect(rec).toHaveProperty('rationale');
    });

    // Verify metadata includes command history and errors
    expect(report.content.metadata).toHaveProperty('commandCount');
    expect(report.content.metadata).toHaveProperty('traceCount');
    expect(report.content.metadata).toHaveProperty('errorCount');
    expect(report.content.metadata.errorCount).toBeGreaterThan(0);
  });

  it('should filter reports by agent and time range', async () => {
    // Create multiple reports for different agents
    const agents = ['agent-1', 'agent-2', 'agent-3'];
    const reportIds: string[] = [];

    for (const agentId of agents) {
      const response = await ctx.server.inject({
        method: 'POST',
        url: '/reports/generate',
        payload: {
          commandId: `cmd-${agentId}-${Date.now()}`,
          agentId,
          title: `Report for ${agentId}`,
        },
      });

      const result = JSON.parse(response.payload);
      reportIds.push(result.reportId);
    }

    // Wait for reports to be generated
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test filtering by agent
    const agent1Response = await ctx.server.inject({
      method: 'GET',
      url: '/reports?agentId=agent-1',
    });

    expect(agent1Response.statusCode).toBe(200);
    const agent1Reports = JSON.parse(agent1Response.payload);
    expect(agent1Reports.reports).toHaveLength(1);
    expect(agent1Reports.reports[0].agentId).toBe('agent-1');

    // Test filtering by status
    const completeResponse = await ctx.server.inject({
      method: 'GET',
      url: '/reports?status=complete',
    });

    expect(completeResponse.statusCode).toBe(200);
    const completeReports = JSON.parse(completeResponse.payload);
    expect(completeReports.reports.length).toBeGreaterThan(0);
    completeReports.reports.forEach((report: any) => {
      expect(report.status).toBe('complete');
    });

    // Test getting all reports
    const allResponse = await ctx.server.inject({
      method: 'GET',
      url: '/reports',
    });

    expect(allResponse.statusCode).toBe(200);
    const allReports = JSON.parse(allResponse.payload);
    expect(allReports.reports.length).toBe(agents.length);
    expect(allReports.total).toBe(agents.length);
  });

  it('should test report status transitions', async () => {
    // Generate a new report
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/reports/generate',
      payload: {
        commandId: 'cmd-status-test',
        agentId: 'agent-status-test',
        title: 'Status Transition Test',
      },
    });

    const result = JSON.parse(response.payload);
    const reportId = result.reportId;

    // Verify initial status is pending
    expect(result.status).toBe('pending');

    // Check status after a short delay (should be generating)
    await new Promise(resolve => setTimeout(resolve, 200));

    let reportResponse = await ctx.server.inject({
      method: 'GET',
      url: `/reports/${reportId}`,
    });

    let report = JSON.parse(reportResponse.payload);
    expect(report.status).toBe('generating');
    expect(report.completedAt).toBeNull();

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 800));

    reportResponse = await ctx.server.inject({
      method: 'GET',
      url: `/reports/${reportId}`,
    });

    report = JSON.parse(reportResponse.payload);
    expect(report.status).toBe('complete');
    expect(report.completedAt).toBeTruthy();
    expect(new Date(report.updatedAt).getTime()).toBeGreaterThan(new Date(report.createdAt).getTime());
  });

  it('should export report in markdown format', async () => {
    // Generate a report
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/reports/generate',
      payload: {
        commandId: 'cmd-export-test',
        agentId: 'agent-export-test',
        title: 'Export Format Test',
      },
    });

    const result = JSON.parse(response.payload);
    const reportId = result.reportId;

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Export as JSON (default)
    const jsonResponse = await ctx.server.inject({
      method: 'GET',
      url: `/reports/${reportId}/export`,
    });

    expect(jsonResponse.statusCode).toBe(200);
    expect(jsonResponse.headers['content-type']).toContain('application/json');
    const jsonReport = JSON.parse(jsonResponse.payload);
    expect(jsonReport.id).toBe(reportId);

    // Export as markdown
    const markdownResponse = await ctx.server.inject({
      method: 'GET',
      url: `/reports/${reportId}/export?format=markdown`,
    });

    expect(markdownResponse.statusCode).toBe(200);
    expect(markdownResponse.headers['content-type']).toContain('text/markdown');

    const markdown = markdownResponse.payload;
    expect(markdown).toContain('# Export Format Test');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('## Recommendations');
    expect(markdown).toContain('Generated:');
  });

  it('should handle non-existent report requests', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/reports/non-existent-id',
    });

    expect(response.statusCode).toBe(404);
    const error = JSON.parse(response.payload);
    expect(error.error).toBe('Report not found');

    // Test export of non-existent report
    const exportResponse = await ctx.server.inject({
      method: 'GET',
      url: '/reports/non-existent-id/export',
    });

    expect(exportResponse.statusCode).toBe(404);
  });

  it('should verify report includes command history and error analysis', async () => {
    const ws = new WebSocket(wsUrl);
    let reportId: string;

    // Execute command that will generate errors and various outputs
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'agent-error-test',
            token: authToken,
            version: '1.0.0',
            capabilities: ['investigation'],
          },
          timestamp: new Date().toISOString(),
        }));
      });

      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === MessageType.CONNECTION_ACK) {
          ws.send(JSON.stringify({
            type: MessageType.COMMAND_REQUEST,
            payload: {
              commandId: 'cmd-error-analysis',
              command: 'Investigate: System errors and failures',
              arguments: {},
              priority: 1,
            },
            timestamp: new Date().toISOString(),
          }));
        }

        if (message.type === MessageType.COMMAND_COMPLETE) {
          // Generate report
          const response = await ctx.server.inject({
            method: 'POST',
            url: '/reports/generate',
            payload: {
              commandId: 'cmd-error-analysis',
              agentId: 'agent-error-test',
              title: 'Error Analysis Report',
            },
          });

          const result = JSON.parse(response.payload);
          reportId = result.reportId;
          ws.close();
          resolve();
        }
      });
    });

    // Wait for report completion
    await new Promise(resolve => setTimeout(resolve, 1000));

    const reportResponse = await ctx.server.inject({
      method: 'GET',
      url: `/reports/${reportId}`,
    });

    const report = JSON.parse(reportResponse.payload);

    // Verify command history is included
    const historySection = report.content.sections.find((s: any) => s.type === 'history');
    expect(historySection).toBeTruthy();
    expect(historySection.content).toContain('Commands executed during investigation');

    // Verify error analysis in metadata
    expect(report.content.metadata.errorCount).toBeGreaterThan(0);
    expect(report.content.metadata.commandCount).toBeGreaterThan(0);
    expect(report.content.metadata.traceCount).toBeGreaterThan(0);

    // Verify findings include error-related information
    const errorFindings = report.content.findings.filter((f: any) =>
      f.description.toLowerCase().includes('error') ||
      f.description.toLowerCase().includes('permission')
    );
    expect(errorFindings.length).toBeGreaterThan(0);

    // Verify recommendations address identified issues
    expect(report.content.recommendations.length).toBeGreaterThan(0);
    report.content.recommendations.forEach((rec: any) => {
      expect(rec.action).toBeTruthy();
      expect(rec.priority).toMatch(/^(high|medium|low)$/);
      expect(rec.rationale).toBeTruthy();
    });
  });
});