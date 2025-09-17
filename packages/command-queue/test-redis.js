#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { createRedisConnection, pingRedis, closeRedisConnection } from './dist/redis-connection.js';
import { QueueManager } from './dist/queue-manager.js';

async function testRedisConnection() {
  console.log('Testing Redis connection...\n');

  // Debug: Show which Redis configuration is being used
  if (process.env.REDIS_URL) {
    console.log('Using REDIS_URL:', process.env.REDIS_URL.substring(0, 30) + '...');
  } else {
    console.log('Using REDIS_HOST:', process.env.REDIS_HOST || 'localhost');
    console.log('Using REDIS_PORT:', process.env.REDIS_PORT || '6379');
  }
  console.log('');

  let queueManager;

  try {
    // Test 1: Create connection
    console.log('1. Creating Redis connection...');
    const redis = createRedisConnection();
    console.log('   ✓ Connection created\n');

    // Wait a moment for connection to establish
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: Ping Redis
    console.log('2. Testing Redis ping...');
    const isAlive = await pingRedis();
    if (isAlive) {
      console.log('   ✓ Redis is responding\n');
    } else {
      console.log('   ✗ Redis is not responding\n');
      process.exit(1);
    }

    // Test 3: Create a test queue with new QueueManager instance
    console.log('3. Creating test queue...');
    queueManager = new QueueManager();
    const testQueue = queueManager.createQueue({
      name: 'test-queue',
      defaultJobOptions: {
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    });
    console.log('   ✓ Queue created\n');

    // Test 4: Add a job to the queue
    console.log('4. Adding test job to queue...');
    const job = await testQueue.add('test-job', {
      message: 'Hello from Onsembl.ai!',
      timestamp: new Date().toISOString(),
    });
    console.log(`   ✓ Job added with ID: ${job.id}\n`);

    // Test 5: Get queue stats
    console.log('5. Getting queue statistics...');
    const stats = await queueManager.getQueueStats('test-queue');
    console.log(`   Queue stats:`, stats);
    console.log('   ✓ Stats retrieved\n');

    // Test 6: Clean up
    console.log('6. Cleaning up...');
    await queueManager.clearQueue('test-queue');
    console.log('   ✓ Queue cleared');

    await queueManager.close();
    console.log('   ✓ Queue manager closed');

    await closeRedisConnection();
    console.log('   ✓ Redis connection closed\n');

    console.log('✅ All Redis tests passed successfully!');
    console.log('\nRedis connection is properly configured and working.');
    console.log('You can now use BullMQ for command queueing in Onsembl.ai.');

  } catch (error) {
    console.error('\n❌ Redis test failed:', error.message);
    console.error('\nPlease check:');
    console.error('1. Redis/Upstash credentials in .env file');
    console.error('2. REDIS_URL or REDIS_HOST, REDIS_PORT, REDIS_PASSWORD are set correctly');
    console.error('3. Your Redis instance is running and accessible');
    process.exit(1);
  }
}

testRedisConnection();