/**
 * CommandQueue Model Usage Examples
 *
 * Demonstrates how to use the CommandQueue model for T077 implementation
 */

import { createClient } from '@supabase/supabase-js';
import { CommandQueueModel } from '../models/command-queue';
import { Database } from '../types/database';

// Example: Initialize the CommandQueue model
function initializeCommandQueue() {
  const supabase = createClient<Database>(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_ANON_KEY']!
  );

  return new CommandQueueModel(supabase);
}

// Example: Basic queue operations
async function basicQueueOperations() {
  const queue = initializeCommandQueue();

  // Enqueue a command with high priority
  const queueItem = await queue.enqueue(
    'command-uuid-123',     // Command ID
    'agent-uuid-456',       // Agent ID
    90,                     // High priority (0-100)
    5000                    // Estimated duration in ms
  );

  console.log('Enqueued:', queueItem);

  // Peek at the next command without removing it
  const nextCommand = await queue.peek('agent-uuid-456');
  console.log('Next command:', nextCommand);

  // Dequeue the highest priority command
  const commandToExecute = await queue.dequeue('agent-uuid-456');
  console.log('Dequeued for execution:', commandToExecute);

  // Get position of a specific command in the queue
  const position = await queue.getPosition('command-uuid-789');
  console.log('Command position:', position);
}

// Example: Priority management
async function priorityManagement() {
  const queue = initializeCommandQueue();

  // Add commands with different priorities
  await queue.enqueue('cmd-1', 'agent-1', 30); // Low priority
  await queue.enqueue('cmd-2', 'agent-1', 90); // High priority
  await queue.enqueue('cmd-3', 'agent-1', 60); // Medium priority

  // Update priority of an existing command
  const queueItem = await queue.findAll({ agent_id: 'agent-1' });
  if (queueItem.length > 0) {
    await queue.updatePriority(queueItem[0].id, 95); // Increase priority
  }

  // The queue is automatically reordered by priority
  const orderedQueue = await queue.findAll({ agent_id: 'agent-1' });
  console.log('Queue ordered by priority:', orderedQueue);
}

// Example: Queue monitoring and statistics
async function queueMonitoring() {
  const queue = initializeCommandQueue();

  // Get queue statistics
  const stats = await queue.getQueueStats('agent-1');
  console.log('Queue statistics:', {
    totalItems: stats.total,
    averagePriority: stats.avgPriority,
    estimatedTotalTime: stats.estimatedTotalDuration,
    oldestItem: stats.oldestItem
  });

  // Get queue with command details
  const queueWithCommands = await queue.getQueueWithCommands('agent-1');
  console.log('Queue with command details:', queueWithCommands);

  // Subscribe to real-time queue changes
  const subscriptionId = queue.subscribeToQueueChanges(
    (payload) => {
      console.log('Queue change:', payload.eventType, payload.new);
    },
    'agent-1'
  );

  // Later: unsubscribe
  setTimeout(() => {
    queue.unsubscribe(subscriptionId);
  }, 30000);
}

// Example: Global queue operations (cross-agent)
async function globalQueueOperations() {
  const queue = initializeCommandQueue();

  // Enqueue to global queue (no specific agent)
  await queue.enqueue('global-cmd-1', null, 80);

  // Dequeue from global queue
  const globalCommand = await queue.dequeue(null);
  console.log('Global command:', globalCommand);

  // Get statistics for all agents
  const globalStats = await queue.getQueueStats();
  console.log('Global queue statistics:', globalStats);

  // Clear entire global queue
  const clearedCount = await queue.clearQueue(null);
  console.log('Cleared items:', clearedCount);
}

// Example: Error handling
async function errorHandling() {
  const queue = initializeCommandQueue();

  try {
    // This will throw CommandQueueValidationError
    await queue.enqueue('invalid-uuid', 'agent-1', 150); // Invalid priority
  } catch (error) {
    if (error.name === 'CommandQueueValidationError') {
      console.error('Validation error:', error.message);
    }
  }

  try {
    // This will throw CommandQueueNotFoundError
    await queue.findById('non-existent-id');
  } catch (error) {
    if (error.name === 'CommandQueueNotFoundError') {
      console.error('Queue item not found:', error.message);
    }
  }

  try {
    // This will throw CommandQueueOperationError if database fails
    await queue.updatePriority('some-id', 75);
  } catch (error) {
    if (error.name === 'CommandQueueOperationError') {
      console.error('Operation failed:', error.message);
    }
  }
}

// Example: Batch operations
async function batchOperations() {
  const queue = initializeCommandQueue();

  // Enqueue multiple commands
  const commands = [
    { id: 'cmd-1', priority: 90 },
    { id: 'cmd-2', priority: 70 },
    { id: 'cmd-3', priority: 85 },
  ];

  for (const cmd of commands) {
    await queue.enqueue(cmd.id, 'agent-1', cmd.priority);
  }

  // Process all commands for an agent
  let command;
  while ((command = await queue.dequeue('agent-1')) !== null) {
    console.log('Processing command:', command.command_id);
    // Simulate command execution
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('All commands processed');
}

export {
  initializeCommandQueue,
  basicQueueOperations,
  priorityManagement,
  queueMonitoring,
  globalQueueOperations,
  errorHandling,
  batchOperations,
};