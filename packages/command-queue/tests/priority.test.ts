/**
 * Priority queue logic tests
 *
 * Tests the priority-based ordering and queue management functionality
 */

import { jest } from '@jest/globals';
import { Queue, QueueEvents, Job } from 'bullmq';
import { Logger } from 'pino';
import { QueueManager } from '../src/queue.js';
import type { QueuedCommand, CommandJobData } from '../src/types.js';

// Mock BullMQ
jest.mock('bullmq');
jest.mock('../src/config.js');

const MockedQueue = Queue as jest.MockedClass<typeof Queue>;
const MockedQueueEvents = QueueEvents as jest.MockedClass<typeof QueueEvents>;

describe('Priority Queue Logic', () => {
  let queueManager: QueueManager;
  let mockQueue: jest.Mocked<Queue>;
  let mockQueueEvents: jest.Mocked<QueueEvents>;
  let mockLogger: jest.Mocked<Logger>;

  const mockConfig = {
    queue: {
      name: 'test-queue',
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 10,
        attempts: 3
      }
    },
    priorities: {
      emergency: 100,
      high: 75,
      normal: 50,
      low: 25
    }
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    // Mock config
    const { ConfigManager } = await import('../src/config.js');
    (ConfigManager.get as jest.Mock).mockReturnValue(mockConfig);
    (ConfigManager.getRedisOptions as jest.Mock).mockReturnValue({
      host: 'localhost',
      port: 6379
    });

    // Create mock queue and events
    mockQueue = {
      add: jest.fn(),
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getDelayed: jest.fn(),
      getWaitingCount: jest.fn(),
      getActiveCount: jest.fn(),
      getDelayedCount: jest.fn(),
      getJobs: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      close: jest.fn(),
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
      on: jest.fn()
    } as any;

    mockQueueEvents = {
      close: jest.fn(),
      on: jest.fn()
    } as any;

    MockedQueue.mockImplementation(() => mockQueue);
    MockedQueueEvents.mockImplementation(() => mockQueueEvents);

    queueManager = new QueueManager(mockLogger);
    await queueManager.initialize();
  });

  afterEach(async () => {
    await queueManager.shutdown();
  });

  describe('Priority Assignment', () => {
    it('should assign correct priority values based on configuration', async () => {
      const command: QueuedCommand = {
        id: 'test-cmd-1',
        type: 'execute',
        content: 'test command',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      const mockJob = { id: 'job-1', data: {} } as Job<CommandJobData>;
      mockQueue.add.mockResolvedValue(mockJob);
      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);

      // Test emergency priority
      await queueManager.addCommand(command, {
        userId: 'user-1',
        priority: mockConfig.priorities.emergency
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          priority: mockConfig.priorities.emergency
        }),
        expect.objectContaining({
          priority: mockConfig.priorities.emergency
        })
      );
    });

    it('should clamp priority values to 0-100 range', async () => {
      const command: QueuedCommand = {
        id: 'test-cmd-1',
        type: 'execute',
        content: 'test command',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      const mockJob = { id: 'job-1', data: {} } as Job<CommandJobData>;
      mockQueue.add.mockResolvedValue(mockJob);
      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);

      // Test priority above 100
      await queueManager.addCommand(command, {
        userId: 'user-1',
        priority: 150
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          priority: 100
        }),
        expect.objectContaining({
          priority: 100
        })
      );

      // Test negative priority
      await queueManager.addCommand(command, {
        userId: 'user-1',
        priority: -10
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          priority: 0
        }),
        expect.objectContaining({
          priority: 0
        })
      );
    });

    it('should use default normal priority when not specified', async () => {
      const command: QueuedCommand = {
        id: 'test-cmd-1',
        type: 'execute',
        content: 'test command',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      const mockJob = { id: 'job-1', data: {} } as Job<CommandJobData>;
      mockQueue.add.mockResolvedValue(mockJob);
      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);

      await queueManager.addCommand(command, {
        userId: 'user-1'
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          priority: mockConfig.priorities.normal
        }),
        expect.objectContaining({
          priority: mockConfig.priorities.normal
        })
      );
    });
  });

  describe('Queue Position Tracking', () => {
    it('should calculate correct queue positions', async () => {
      const waitingJobs = [
        { data: { command: { id: 'cmd-1' } } },
        { data: { command: { id: 'cmd-2' } } },
        { data: { command: { id: 'cmd-3' } } }
      ] as Job<CommandJobData>[];

      mockQueue.getWaiting.mockResolvedValue(waitingJobs);

      const position1 = await queueManager.getCommandPosition('cmd-1');
      const position2 = await queueManager.getCommandPosition('cmd-2');
      const position3 = await queueManager.getCommandPosition('cmd-3');
      const positionNotFound = await queueManager.getCommandPosition('cmd-nonexistent');

      expect(position1).toBe(1);
      expect(position2).toBe(2);
      expect(position3).toBe(3);
      expect(positionNotFound).toBeNull();
    });

    it('should emit position updates when queue changes', async () => {
      const command: QueuedCommand = {
        id: 'test-cmd-1',
        type: 'execute',
        content: 'test command',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      const mockJob = { id: 'job-1', data: { command } } as Job<CommandJobData>;
      mockQueue.add.mockResolvedValue(mockJob);
      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);
      mockQueue.getWaiting.mockResolvedValue([mockJob]);

      const positionUpdateSpy = jest.fn();
      queueManager.on('position:updated', positionUpdateSpy);

      await queueManager.addCommand(command, { userId: 'user-1' });

      expect(positionUpdateSpy).toHaveBeenCalledWith('test-cmd-1', 1);
    });
  });

  describe('Priority-based Ordering', () => {
    it('should maintain priority order in queue', async () => {
      // Create commands with different priorities
      const lowPriorityCommand: QueuedCommand = {
        id: 'low-cmd',
        type: 'execute',
        content: 'low priority',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      const highPriorityCommand: QueuedCommand = {
        id: 'high-cmd',
        type: 'execute',
        content: 'high priority',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);

      const mockLowJob = { id: 'low-job', data: { command: lowPriorityCommand } };
      const mockHighJob = { id: 'high-job', data: { command: highPriorityCommand } };

      mockQueue.add
        .mockResolvedValueOnce(mockLowJob as any)
        .mockResolvedValueOnce(mockHighJob as any);

      // Add low priority first
      await queueManager.addCommand(lowPriorityCommand, {
        userId: 'user-1',
        priority: mockConfig.priorities.low
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          priority: mockConfig.priorities.low
        }),
        expect.objectContaining({
          priority: mockConfig.priorities.low
        })
      );

      // Add high priority second
      await queueManager.addCommand(highPriorityCommand, {
        userId: 'user-1',
        priority: mockConfig.priorities.high
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          priority: mockConfig.priorities.high
        }),
        expect.objectContaining({
          priority: mockConfig.priorities.high
        })
      );
    });
  });

  describe('Queue Size Management', () => {
    it('should calculate total queue size correctly', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getDelayedCount.mockResolvedValue(1);

      const queueSize = await queueManager.getQueueSize();

      expect(queueSize).toBe(8); // 5 + 2 + 1
    });

    it('should enforce maximum queue size', async () => {
      // Create a queue manager with small max size
      const smallQueueManager = new QueueManager(mockLogger, 2);
      await smallQueueManager.initialize();

      mockQueue.getWaitingCount.mockResolvedValue(2);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);

      const command: QueuedCommand = {
        id: 'test-cmd-1',
        type: 'execute',
        content: 'test command',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      const queueFullSpy = jest.fn();
      smallQueueManager.on('queue:full', queueFullSpy);

      await expect(
        smallQueueManager.addCommand(command, { userId: 'user-1' })
      ).rejects.toThrow('Queue is full');

      expect(queueFullSpy).toHaveBeenCalledWith(command);

      await smallQueueManager.shutdown();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      mockQueue.getWaitingCount.mockRejectedValue(new Error('Redis connection failed'));

      const queueSize = await queueManager.getQueueSize();

      expect(queueSize).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to get queue size'
      );
    });

    it('should handle job addition failures', async () => {
      const command: QueuedCommand = {
        id: 'test-cmd-1',
        type: 'execute',
        content: 'test command',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);
      mockQueue.add.mockRejectedValue(new Error('Failed to add job'));

      await expect(
        queueManager.addCommand(command, { userId: 'user-1' })
      ).rejects.toThrow('Failed to add job');

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error), commandId: 'test-cmd-1' },
        'Failed to add command to queue'
      );
    });
  });
});