#!/usr/bin/env node

/**
 * Agent Protocol CLI - Command-line tools for WebSocket message validation and testing
 *
 * Provides utilities for:
 * - Validating WebSocket messages from stdin or files
 * - Generating sample messages for testing
 * - Converting messages between formats
 * - Running test WebSocket server/client for debugging
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import WebSocket, { WebSocketServer } from 'ws';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';

import {
  MessageType,
  type WebSocketMessage,
  type AgentConnectPayload,
  type AgentHeartbeatPayload,
  type CommandRequestPayload,
  type AgentStatusPayload,
  type TerminalOutputPayload,
  type TraceEventPayload
} from './types.js';

// Import constants from the right location
const MESSAGE_TYPES = {
  AGENT_CONNECT: 'AGENT_CONNECT' as const,
  AGENT_HEARTBEAT: 'AGENT_HEARTBEAT' as const,
  COMMAND_REQUEST: 'COMMAND_REQUEST' as const,
  PING: 'PING' as const,
  PONG: 'PONG' as const,
  ERROR: 'ERROR' as const
} as const;

const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_FORMAT: 'INVALID_FORMAT',
  CONNECTION_ERROR: 'CONNECTION_ERROR'
} as const;

const PROTOCOL_VERSION = '1.0.0';

// Simple validation interface for CLI
interface ValidationResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    issues: Array<{
      path: string[];
      message: string;
      code: string;
    }>;
  };
}

const program = new Command();

program
  .name('agent-protocol')
  .description('CLI tools for Onsembl.ai Agent Protocol WebSocket messages')
  .version('0.1.0');

// ============================================================================
// Validate Command
// ============================================================================

program
  .command('validate')
  .description('Validate WebSocket messages from stdin or file')
  .option('-f, --file <path>', 'read from file instead of stdin')
  .option('-t, --type <type>', 'expected message type to validate against')
  .option('--strict', 'use strict validation (fail on warnings)', false)
  .option('--json', 'output results as JSON', false)
  .action(async (options) => {
    try {
      const messages = await readMessages(options.file);
      let totalMessages = 0;
      let validMessages = 0;
      let errors: any[] = [];

      for (const messageStr of messages) {
        if (!messageStr.trim()) continue;

        totalMessages++;
        try {
          const message = JSON.parse(messageStr);
          const result = await validateMessage(message, options.type, options.strict);

          if (result.success) {
            validMessages++;
            if (!options.json) {
              console.log(chalk.green(`✓ Valid ${message.type} message (ID: ${message.id})`));
            }
          } else {
            errors.push({
              message: messageStr,
              error: result.error
            });
            if (!options.json) {
              console.log(chalk.red(`✗ Invalid message: ${result.error?.message}`));
              if (result.error?.issues) {
                result.error.issues.forEach(issue => {
                  console.log(chalk.yellow(`  - ${issue.path.join('.')}: ${issue.message}`));
                });
              }
            }
          }
        } catch (parseError) {
          errors.push({
            message: messageStr,
            error: { message: `JSON parse error: ${parseError}` }
          });
          if (!options.json) {
            console.log(chalk.red(`✗ JSON parse error: ${parseError}`));
          }
        }
      }

      const summary = {
        total: totalMessages,
        valid: validMessages,
        invalid: totalMessages - validMessages,
        errors: options.json ? errors : undefined
      };

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(chalk.cyan(`\nSummary: ${validMessages}/${totalMessages} valid messages`));
        if (errors.length > 0) {
          console.log(chalk.red(`${errors.length} validation errors`));
        }
      }

      process.exit(errors.length > 0 ? 1 : 0);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

// ============================================================================
// Generate Command
// ============================================================================

program
  .command('generate')
  .description('Generate sample messages for testing')
  .argument('<type>', 'message type to generate')
  .option('-c, --count <number>', 'number of messages to generate', '1')
  .option('--pretty', 'pretty-print JSON output', false)
  .option('--realistic', 'generate realistic sample data', false)
  .action((messageType: string, options) => {
    try {
      const count = parseInt(options.count);
      if (isNaN(count) || count < 1) {
        throw new Error('Count must be a positive integer');
      }

      const messages: WebSocketMessage[] = [];

      for (let i = 0; i < count; i++) {
        const message = generateSampleMessage(messageType as MessageType, options.realistic);
        messages.push(message);
      }

      const output = options.pretty
        ? messages.map(msg => JSON.stringify(msg, null, 2)).join('\n\n')
        : messages.map(msg => JSON.stringify(msg)).join('\n');

      console.log(output);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

// ============================================================================
// List Types Command
// ============================================================================

program
  .command('list-types')
  .description('List all available message types')
  .option('--category <cat>', 'filter by category: agent, server, dashboard, common')
  .action((options) => {
    const messageTypes = Object.values(MessageType);

    let filteredTypes = messageTypes;
    if (options.category) {
      switch (options.category.toLowerCase()) {
        case 'agent':
          filteredTypes = messageTypes.filter(type =>
            ['AGENT_CONNECT', 'AGENT_HEARTBEAT', 'AGENT_ERROR', 'COMMAND_ACK',
             'COMMAND_COMPLETE', 'TERMINAL_OUTPUT', 'TRACE_EVENT', 'INVESTIGATION_REPORT'].includes(type as string)
          );
          break;
        case 'server':
          filteredTypes = messageTypes.filter(type =>
            ['COMMAND_REQUEST', 'COMMAND_CANCEL', 'AGENT_CONTROL', 'TOKEN_REFRESH',
             'SERVER_HEARTBEAT', 'AGENT_STATUS', 'COMMAND_STATUS', 'TERMINAL_STREAM',
             'TRACE_STREAM', 'QUEUE_UPDATE', 'EMERGENCY_STOP'].includes(type as string)
          );
          break;
        case 'dashboard':
          filteredTypes = messageTypes.filter(type =>
            ['DASHBOARD_INIT', 'DASHBOARD_SUBSCRIBE', 'DASHBOARD_UNSUBSCRIBE'].includes(type as string)
          );
          break;
        case 'common':
          filteredTypes = messageTypes.filter(type =>
            ['PING', 'PONG', 'ACK', 'ERROR'].includes(type as string)
          );
          break;
        default:
          console.error(chalk.red(`Unknown category: ${options.category}`));
          process.exit(1);
      }
    }

    console.log(chalk.cyan('Available Message Types:'));
    filteredTypes.forEach(type => {
      console.log(`  ${type}`);
    });
  });

// ============================================================================
// Test Server Command
// ============================================================================

program
  .command('test-server')
  .description('Start a test WebSocket server for debugging')
  .option('-p, --port <port>', 'port to listen on', '8080')
  .option('--echo', 'echo received messages back to clients', false)
  .option('--validate', 'validate incoming messages', false)
  .action((options) => {
    const port = parseInt(options.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(chalk.red('Invalid port number'));
      process.exit(1);
    }

    const wss = new WebSocketServer({ port });

    console.log(chalk.green(`🚀 Test WebSocket server started on port ${port}`));
    console.log(chalk.cyan(`   Connect to: ws://localhost:${port}`));
    console.log(chalk.cyan(`   Echo mode: ${options.echo ? 'enabled' : 'disabled'}`));
    console.log(chalk.cyan(`   Validation: ${options.validate ? 'enabled' : 'disabled'}`));

    wss.on('connection', (ws, req) => {
      const clientId = uuidv4().slice(0, 8);
      console.log(chalk.blue(`📱 Client ${clientId} connected from ${req.socket.remoteAddress}`));

      ws.on('message', async (data) => {
        try {
          const messageStr = data.toString();
          console.log(chalk.gray(`📨 [${clientId}] Received: ${messageStr}`));

          if (options.validate) {
            try {
              const message = JSON.parse(messageStr);
              const result = await validateMessage(message);
              if (!result.success) {
                console.log(chalk.yellow(`⚠️  [${clientId}] Validation failed: ${result.error?.message}`));
                if (options.echo) {
                  const errorResponse = {
                    type: MessageType.ERROR,
                    id: uuidv4(),
                    timestamp: Date.now(),
                    payload: {
                      code: 'VALIDATION_FAILED',
                      message: result.error?.message || 'Validation failed',
                      originalMessageId: message.id
                    }
                  };
                  ws.send(JSON.stringify(errorResponse));
                }
                return;
              } else {
                console.log(chalk.green(`✓ [${clientId}] Message validated successfully`));
              }
            } catch (parseError) {
              console.log(chalk.red(`❌ [${clientId}] JSON parse error: ${parseError}`));
              return;
            }
          }

          if (options.echo) {
            ws.send(messageStr);
            console.log(chalk.magenta(`📤 [${clientId}] Echoed message back`));
          }
        } catch (error) {
          console.log(chalk.red(`❌ [${clientId}] Error handling message: ${error}`));
        }
      });

      ws.on('close', () => {
        console.log(chalk.blue(`📱 Client ${clientId} disconnected`));
      });

      ws.on('error', (error) => {
        console.log(chalk.red(`❌ [${clientId}] WebSocket error: ${error}`));
      });
    });

    wss.on('error', (error) => {
      console.error(chalk.red(`❌ Server error: ${error}`));
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Shutting down server...'));
      wss.close(() => {
        console.log(chalk.green('✅ Server closed'));
        process.exit(0);
      });
    });
  });

// ============================================================================
// Test Client Command
// ============================================================================

program
  .command('test-client')
  .description('Connect to a WebSocket server and send/receive messages')
  .argument('<url>', 'WebSocket server URL to connect to')
  .option('-m, --message <message>', 'JSON message to send immediately')
  .option('-f, --file <path>', 'file containing messages to send (one per line)')
  .option('-i, --interactive', 'interactive mode for sending messages', false)
  .option('--ping-interval <ms>', 'send ping messages every N milliseconds')
  .action(async (url: string, options) => {
    try {
      console.log(chalk.cyan(`🔌 Connecting to ${url}...`));

      const ws = new WebSocket(url);

      ws.on('open', async () => {
        console.log(chalk.green('✅ Connected successfully'));

        // Set up ping interval if specified
        let pingInterval: NodeJS.Timeout | undefined;
        if (options.pingInterval) {
          const interval = parseInt(options.pingInterval);
          if (!isNaN(interval) && interval > 0) {
            pingInterval = setInterval(() => {
              const pingMessage = {
                type: MessageType.PING,
                id: uuidv4(),
                timestamp: Date.now(),
                payload: { timestamp: Date.now() }
              };
              ws.send(JSON.stringify(pingMessage));
              console.log(chalk.blue('📡 Sent ping'));
            }, interval);
          }
        }

        // Send immediate message if provided
        if (options.message) {
          try {
            const message = JSON.parse(options.message);
            ws.send(JSON.stringify(message));
            console.log(chalk.blue(`📤 Sent: ${options.message}`));
          } catch (error) {
            console.log(chalk.red(`❌ Invalid JSON message: ${error}`));
          }
        }

        // Send messages from file if provided
        if (options.file) {
          try {
            const messages = await readMessages(options.file);
            for (const messageStr of messages) {
              if (messageStr.trim()) {
                ws.send(messageStr);
                console.log(chalk.blue(`📤 Sent: ${messageStr}`));
                // Small delay between messages
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          } catch (error) {
            console.log(chalk.red(`❌ Error reading file: ${error}`));
          }
        }

        // Interactive mode
        if (options.interactive) {
          console.log(chalk.cyan('💬 Interactive mode - type messages to send (Ctrl+C to exit):'));
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.gray('> ')
          });

          rl.prompt();
          rl.on('line', (input) => {
            const trimmed = input.trim();
            if (trimmed) {
              try {
                // Try to parse as JSON first
                JSON.parse(trimmed);
                ws.send(trimmed);
                console.log(chalk.blue(`📤 Sent: ${trimmed}`));
              } catch (error) {
                console.log(chalk.red(`❌ Invalid JSON: ${error}`));
              }
            }
            rl.prompt();
          });

          rl.on('SIGINT', () => {
            console.log(chalk.yellow('\n🛑 Closing connection...'));
            if (pingInterval) clearInterval(pingInterval);
            ws.close();
            rl.close();
          });
        }
      });

      ws.on('message', (data) => {
        const messageStr = data.toString();
        console.log(chalk.green(`📨 Received: ${messageStr}`));
      });

      ws.on('close', (code, reason) => {
        console.log(chalk.yellow(`🔌 Connection closed (${code}): ${reason || 'No reason'}`));
        process.exit(0);
      });

      ws.on('error', (error) => {
        console.error(chalk.red(`❌ WebSocket error: ${error}`));
        process.exit(1);
      });

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error}`));
      process.exit(1);
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function readMessages(filePath?: string): Promise<string[]> {
  const messages: string[] = [];

  if (filePath) {
    // Read from file
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim());
  } else {
    // Read from stdin
    const rl = createInterface({
      input: process.stdin,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        messages.push(line);
      }
    }

    return messages;
  }
}

async function validateMessage(
  message: any,
  expectedType?: string,
  strict = false
): Promise<ValidationResult> {
  try {
    // Basic validation - check message structure
    if (!message || typeof message !== 'object') {
      return {
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Message must be a valid object',
          issues: [{ path: [], message: 'Invalid message format', code: 'INVALID_FORMAT' }]
        }
      };
    }

    // Check required fields
    const requiredFields = ['type', 'id', 'timestamp', 'payload'];
    const missingFields = requiredFields.filter(field => !(field in message));

    if (missingFields.length > 0) {
      return {
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: `Missing required fields: ${missingFields.join(', ')}`,
          issues: missingFields.map(field => ({
            path: [field],
            message: `Required field '${field}' is missing`,
            code: 'MISSING_FIELD'
          }))
        }
      };
    }

    // Check message type
    const validTypes = Object.values(MessageType);
    if (!validTypes.includes(message.type)) {
      return {
        success: false,
        error: {
          code: 'INVALID_TYPE',
          message: `Invalid message type: ${message.type}`,
          issues: [{ path: ['type'], message: `Unknown message type '${message.type}'`, code: 'INVALID_TYPE' }]
        }
      };
    }

    // Check specific type if provided
    if (expectedType && message.type !== expectedType) {
      return {
        success: false,
        error: {
          code: 'TYPE_MISMATCH',
          message: `Expected type '${expectedType}' but got '${message.type}'`,
          issues: [{ path: ['type'], message: `Type mismatch`, code: 'TYPE_MISMATCH' }]
        }
      };
    }

    // Basic ID validation (should be UUID format)
    if (typeof message.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.id)) {
      return {
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Message ID must be a valid UUID',
          issues: [{ path: ['id'], message: 'Invalid UUID format', code: 'INVALID_ID' }]
        }
      };
    }

    // Basic timestamp validation
    if (typeof message.timestamp !== 'number' || message.timestamp <= 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_TIMESTAMP',
          message: 'Timestamp must be a positive number',
          issues: [{ path: ['timestamp'], message: 'Invalid timestamp', code: 'INVALID_TIMESTAMP' }]
        }
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${error}`,
        issues: []
      }
    };
  }
}

function generateSampleMessage(messageType: MessageType, realistic = false): WebSocketMessage {
  const baseMessage = {
    type: messageType,
    id: uuidv4(),
    timestamp: Date.now()
  };

  // Generate realistic vs simple payloads based on message type
  let payload: any;

  switch (messageType) {
    case MessageType.AGENT_CONNECT:
      payload = realistic ? {
        agentId: uuidv4(),
        agentType: 'CLAUDE',
        version: '1.0.0',
        hostMachine: 'dev-machine-001',
        capabilities: {
          maxTokens: 100000,
          supportsInterrupt: true,
          supportsTrace: true
        }
      } : {
        agentId: uuidv4(),
        agentType: 'CLAUDE',
        version: '1.0.0',
        hostMachine: 'test-host',
        capabilities: { maxTokens: 1000, supportsInterrupt: true, supportsTrace: false }
      };
      break;

    case MessageType.AGENT_HEARTBEAT:
      payload = realistic ? {
        agentId: uuidv4(),
        healthMetrics: {
          cpuUsage: Math.random() * 100,
          memoryUsage: Math.random() * 8192,
          uptime: Math.floor(Math.random() * 86400),
          commandsProcessed: Math.floor(Math.random() * 1000),
          averageResponseTime: Math.random() * 2000
        }
      } : {
        agentId: uuidv4(),
        healthMetrics: { cpuUsage: 50, memoryUsage: 1024, uptime: 3600, commandsProcessed: 10, averageResponseTime: 500 }
      };
      break;

    case MessageType.COMMAND_REQUEST:
      payload = realistic ? {
        commandId: uuidv4(),
        content: 'Implement user authentication with JWT tokens',
        type: 'NATURAL',
        priority: 1,
        executionConstraints: {
          timeLimitMs: 300000,
          tokenBudget: 50000,
          maxRetries: 3
        }
      } : {
        commandId: uuidv4(),
        content: 'test command',
        type: 'NATURAL',
        priority: 1
      };
      break;

    case MessageType.TERMINAL_OUTPUT:
      payload = realistic ? {
        commandId: uuidv4(),
        agentId: uuidv4(),
        streamType: 'STDOUT',
        content: 'Building project... \x1b[32m✓\x1b[0m Success',
        ansiCodes: true,
        sequence: 1
      } : {
        commandId: uuidv4(),
        agentId: uuidv4(),
        streamType: 'STDOUT',
        content: 'test output',
        ansiCodes: false,
        sequence: 1
      };
      break;

    case MessageType.PING:
      payload = { timestamp: Date.now() };
      break;

    case MessageType.PONG:
      payload = { timestamp: Date.now(), latency: Math.random() * 100 };
      break;

    case MessageType.ERROR:
      payload = realistic ? {
        code: 'COMMAND_EXECUTION_FAILED',
        message: 'Failed to execute command due to missing dependencies',
        details: { missingPackages: ['typescript', 'eslint'] }
      } : {
        code: 'TEST_ERROR',
        message: 'test error message'
      };
      break;

    default:
      payload = { message: `Sample payload for ${messageType}` };
  }

  return { ...baseMessage, payload };
}

// ============================================================================
// Main Program
// ============================================================================

program.parse();
