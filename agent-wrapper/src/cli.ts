#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from './lib/logger.js';
import { loadConfig } from './lib/config.js';

const program = new Command();

program
  .name('onsembl-agent')
  .description('CLI wrapper for AI coding agents')
  .version('0.1.0');

program
  .command('start')
  .description('Start an agent wrapper')
  .option('-u, --url <url>', 'WebSocket server URL')
  .option('-t, --token <token>', 'Authentication token')
  .option('-a, --agent <type>', 'Agent type (claude|gemini|codex)')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const finalConfig = {
        ...config,
        ...(options.url && { serverUrl: options.url }),
        ...(options.token && { authToken: options.token }),
        ...(options.agent && { agentType: options.agent }),
      };

      logger.info('Starting agent wrapper', { config: finalConfig });
      // Implementation will be added during task execution
      console.log('Agent wrapper started successfully');
    } catch (error) {
      logger.error('Failed to start agent wrapper', { error });
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop an agent wrapper')
  .option('-i, --id <id>', 'Agent instance ID')
  .action(async (options) => {
    try {
      logger.info('Stopping agent wrapper', { id: options.id });
      // Implementation will be added during task execution
      console.log('Agent wrapper stopped successfully');
    } catch (error) {
      logger.error('Failed to stop agent wrapper', { error });
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check agent status')
  .option('-i, --id <id>', 'Agent instance ID')
  .action(async (options) => {
    try {
      logger.info('Checking agent status', { id: options.id });
      // Implementation will be added during task execution
      console.log('Agent status: running');
    } catch (error) {
      logger.error('Failed to check agent status', { error });
      process.exit(1);
    }
  });

// Handle errors and unhandled promise rejections
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

program.parse();