/**
 * Entry point for Onsembl.ai Backend
 * Starts the Fastify server with error handling
 */

import { startServer } from './server.js';
import { config } from './config/index.js';
import { pathToFileURL } from 'url';

/**
 * Application entry point
 */
async function main(): Promise<void> {
  try {
    // Log startup information
    console.log('🚀 Starting Onsembl.ai Backend...');
    console.log(`📦 Environment: ${config.nodeEnv}`);
    console.log(`🔧 Log Level: ${config.logLevel}`);
    console.log(`🌐 Port: ${config.port}`);
    console.log(`🔌 WebSocket Path: ${config.wsPath}`);

    // Start the server
    const server = await startServer();

    // Log successful startup
    console.log('✅ Onsembl.ai Backend started successfully!');
    console.log(`📍 Health check: http://${config.host}:${config.port}/health`);
    console.log(`🔌 WebSocket: ws://${config.host}:${config.port}${config.wsPath}`);

  } catch (error) {
    console.error('❌ Failed to start Onsembl.ai Backend:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
// Handle both Windows and Unix paths by normalizing to file:// URLs
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}