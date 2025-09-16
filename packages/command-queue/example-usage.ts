/**
 * Example usage of the enhanced QueueManager
 *
 * This demonstrates how to use the BullMQ queue wrapper with all the enhanced features.
 */

import { pino } from 'pino';
import { QueueManager } from './src/queue.js';
import type { QueuedCommand } from './src/types.js';

// Initialize logger
const logger = pino({ name: 'queue-example' });

// Create queue manager with max size of 100 commands
const queueManager = new QueueManager(logger, 100);

async function demonstrateQueueManager() {
  try {
    // Initialize the queue
    await queueManager.initialize();
    logger.info('QueueManager initialized successfully');

    // Set up event listeners
    queueManager.on('job:added', (job) => {
      logger.info({ jobId: job.id }, 'Job added to queue');
    });

    queueManager.on('position:updated', (commandId, position) => {
      logger.info({ commandId, position }, 'Command position updated');
    });

    queueManager.on('queue:full', (command) => {
      logger.warn({ commandId: command.id }, 'Queue is full, command rejected');
    });

    // Create example commands
    const commands: QueuedCommand[] = [
      {
        id: 'cmd-1',
        type: 'execute',
        payload: { script: 'npm test' },
        status: 'pending',
        createdAt: Date.now(),
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      },
      {
        id: 'cmd-2',
        type: 'build',
        payload: { project: 'frontend' },
        status: 'pending',
        createdAt: Date.now(),
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      },
      {
        id: 'cmd-3',
        type: 'deploy',
        payload: { environment: 'staging' },
        status: 'pending',
        createdAt: Date.now(),
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      }
    ];

    // Add commands with different priorities
    logger.info('Adding commands to queue...');

    // High priority command
    await queueManager.addCommand(commands[0], {
      userId: 'user-1',
      agentId: 'agent-claude',
      priority: 90, // High priority (0-100 scale)
      executionConstraints: {
        timeLimitMs: 30000,
        tokenBudget: 1000
      }
    });

    // Normal priority command
    await queueManager.addCommand(commands[1], {
      userId: 'user-1',
      agentId: 'agent-gemini',
      priority: 50, // Normal priority
    });

    // Low priority command
    await queueManager.addCommand(commands[2], {
      userId: 'user-2',
      agentId: 'agent-codex',
      priority: 20, // Low priority
      delay: 5000 // Delay execution by 5 seconds
    });

    // Get queue metrics
    const metrics = await queueManager.getMetrics();
    logger.info({ metrics }, 'Queue metrics');

    // Get queue size
    const queueSize = await queueManager.getQueueSize();
    logger.info({ queueSize }, 'Current queue size');

    // Get command position
    const cmd1Position = await queueManager.getCommandPosition('cmd-1');
    logger.info({ commandId: 'cmd-1', position: cmd1Position }, 'Command position');

    // Get all commands with filtering
    const userCommands = await queueManager.getCommands({
      userId: 'user-1'
    });
    logger.info({ count: userCommands.length }, 'Commands for user-1');

    // Demonstrate command interruption
    setTimeout(async () => {
      logger.info('Attempting to interrupt command...');
      const interruptResult = await queueManager.interruptCommand({
        commandId: 'cmd-2',
        reason: 'User requested cancellation',
        force: false,
        timeout: 3000
      });
      logger.info({ interruptResult }, 'Interrupt result');
    }, 2000);

    // Demonstrate graceful shutdown after 10 seconds
    setTimeout(async () => {
      logger.info('Starting graceful shutdown...');
      await queueManager.shutdown();
      logger.info('Shutdown complete');
      process.exit(0);
    }, 10000);

  } catch (error) {
    logger.error({ error }, 'Error in queue manager demonstration');
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error({ error }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await queueManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await queueManager.shutdown();
  process.exit(0);
});

// Run the demonstration
demonstrateQueueManager().catch((error) => {
  logger.error({ error }, 'Failed to run queue manager demonstration');
  process.exit(1);
});