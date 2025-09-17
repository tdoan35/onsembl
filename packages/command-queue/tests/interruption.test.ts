/**
 * Command interruption logic tests
 *
 * Tests the interrupt functionality for stopping commands gracefully and forcefully
 */

import { jest } from '@jest/globals';
import { Queue, QueueEvents, Job } from 'bullmq';
import { Logger } from 'pino';
import { QueueManager } from '../src/queue.js';
import type { QueuedCommand, CommandJobData, InterruptRequest, InterruptResult } from '../src/types.js';

// Mock BullMQ
jest.mock('bullmq');
jest.mock('../src/config.js');

const MockedQueue = Queue as jest.MockedClass<typeof Queue>;
const MockedQueueEvents = QueueEvents as jest.MockedClass<typeof QueueEvents>;

describe('Command Interruption Logic', () => {
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

  const mockCommand: QueuedCommand = {
    id: 'test-cmd-1',
    type: 'execute',
    content: 'test command',
    createdAt: Date.now(),
    status: 'pending',
    queuedAt: Date.now(),
    attemptCount: 0,
    maxAttempts: 3
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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

    // Create mock queue
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

  describe('Command Not Found', () => {
    it('should return error when command not found', async () => {
      mockQueue.getJobs.mockResolvedValue([]);

      const request: InterruptRequest = {
        commandId: 'non-existent',
        reason: 'Test interruption',
        force: false
      };

      const result = await queueManager.interruptCommand(request);

      const expectedResult: InterruptResult = {
        success: false,
        commandId: 'non-existent',
        wasInterrupted: false,
        error: 'Command not found in queue'
      };

      expect(result).toEqual(expectedResult);
    });
  });

  describe('Waiting Job Interruption', () => {
    it('should immediately remove waiting jobs', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(false),
        isWaiting: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(undefined)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'User cancelled',
        force: false
      };

      const result = await queueManager.interruptCommand(request);

      const expectedResult: InterruptResult = {
        success: true,
        commandId: 'test-cmd-1',
        wasInterrupted: true,
        reason: 'User cancelled'
      };

      expect(result).toEqual(expectedResult);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          commandId: 'test-cmd-1',
          reason: 'User cancelled',
          force: false
        },
        'Command interrupted'
      );
      expect(mockQueue.getWaiting).toHaveBeenCalled(); // Position update
    });

    it('should handle waiting job removal failure', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(false),
        isWaiting: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockRejectedValue(new Error('Remove failed'))
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'User cancelled',
        force: false
      };

      const result = await queueManager.interruptCommand(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Remove failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error), commandId: 'test-cmd-1' },
        'Failed to interrupt command'
      );
    });
  });

  describe('Active Job Interruption', () => {
    it('should interrupt active job with graceful shutdown', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        updateData: jest.fn().mockResolvedValue(undefined),
        waitUntilFinished: jest.fn().mockResolvedValue({ success: true })
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'System shutdown',
        force: false,
        timeout: 5000
      };

      const result = await queueManager.interruptCommand(request);

      const expectedResult: InterruptResult = {
        success: true,
        commandId: 'test-cmd-1',
        wasInterrupted: true,
        reason: 'System shutdown'
      };

      expect(result).toEqual(expectedResult);
      expect(mockJob.updateData).toHaveBeenCalledWith({
        ...mockJob.data,
        interruptReason: 'System shutdown'
      });
      expect(mockJob.waitUntilFinished).toHaveBeenCalledWith(mockQueueEvents);
    });

    it('should force interrupt active job on timeout', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        updateData: jest.fn().mockResolvedValue(undefined),
        waitUntilFinished: jest.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(resolve, 10000)) // Takes longer than timeout
        ),
        remove: jest.fn().mockResolvedValue(undefined)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Emergency stop',
        force: false,
        timeout: 100 // Short timeout
      };

      const result = await queueManager.interruptCommand(request);

      const expectedResult: InterruptResult = {
        success: true,
        commandId: 'test-cmd-1',
        wasInterrupted: true,
        reason: 'Emergency stop (forced after timeout)'
      };

      expect(result).toEqual(expectedResult);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should immediately force interrupt when force flag is true', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        remove: jest.fn().mockResolvedValue(undefined)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Force stop',
        force: true
      };

      const result = await queueManager.interruptCommand(request);

      const expectedResult: InterruptResult = {
        success: true,
        commandId: 'test-cmd-1',
        wasInterrupted: true,
        reason: 'Force stop'
      };

      expect(result).toEqual(expectedResult);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockJob.updateData).not.toHaveBeenCalled(); // Skip graceful shutdown
    });

    it('should use default timeout when not specified', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        updateData: jest.fn().mockResolvedValue(undefined),
        waitUntilFinished: jest.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(resolve, 6000)) // Longer than default timeout
        ),
        remove: jest.fn().mockResolvedValue(undefined)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Default timeout test',
        force: false
        // No timeout specified - should use default 5000ms
      };

      const startTime = Date.now();
      const result = await queueManager.interruptCommand(request);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.reason).toContain('(forced after timeout)');
      expect(elapsed).toBeGreaterThan(4900); // Should wait about 5 seconds
      expect(elapsed).toBeLessThan(6000);
      expect(mockJob.remove).toHaveBeenCalled();
    });
  });

  describe('Job State Validation', () => {
    it('should return error for completed jobs', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(false),
        isWaiting: jest.fn().mockResolvedValue(false)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Too late',
        force: false
      };

      const result = await queueManager.interruptCommand(request);

      const expectedResult: InterruptResult = {
        success: false,
        commandId: 'test-cmd-1',
        wasInterrupted: false,
        error: 'Command is not currently active or waiting'
      };

      expect(result).toEqual(expectedResult);
    });

    it('should handle job state check failures', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockRejectedValue(new Error('State check failed')),
        isWaiting: jest.fn().mockResolvedValue(false)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Test error',
        force: false
      };

      const result = await queueManager.interruptCommand(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('State check failed');
    });
  });

  describe('Multiple Interruption Scenarios', () => {
    it('should handle multiple concurrent interruptions', async () => {
      const mockJob1 = {
        id: 'job-1',
        data: { command: { ...mockCommand, id: 'cmd-1' } },
        isActive: jest.fn().mockResolvedValue(false),
        isWaiting: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(undefined)
      } as any;

      const mockJob2 = {
        id: 'job-2',
        data: { command: { ...mockCommand, id: 'cmd-2' } },
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        updateData: jest.fn().mockResolvedValue(undefined),
        waitUntilFinished: jest.fn().mockResolvedValue({ success: true })
      } as any;

      mockQueue.getJobs
        .mockResolvedValueOnce([mockJob1])
        .mockResolvedValueOnce([mockJob2]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const requests: InterruptRequest[] = [
        { commandId: 'cmd-1', reason: 'Cancel waiting', force: false },
        { commandId: 'cmd-2', reason: 'Stop active', force: false }
      ];

      const results = await Promise.all(
        requests.map(req => queueManager.interruptCommand(req))
      );

      expect(results[0].success).toBe(true);
      expect(results[0].commandId).toBe('cmd-1');
      expect(results[1].success).toBe(true);
      expect(results[1].commandId).toBe('cmd-2');

      expect(mockJob1.remove).toHaveBeenCalled();
      expect(mockJob2.updateData).toHaveBeenCalled();
    });

    it('should handle graceful shutdown interruption data update', async () => {
      const originalData = {
        command: mockCommand,
        userId: 'user-1',
        priority: 50
      };

      const mockJob = {
        id: 'job-1',
        data: originalData,
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        updateData: jest.fn().mockResolvedValue(undefined),
        waitUntilFinished: jest.fn().mockResolvedValue({ success: true })
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Resource cleanup needed',
        force: false
      };

      await queueManager.interruptCommand(request);

      expect(mockJob.updateData).toHaveBeenCalledWith({
        ...originalData,
        interruptReason: 'Resource cleanup needed'
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle job removal during graceful shutdown', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        updateData: jest.fn().mockResolvedValue(undefined),
        waitUntilFinished: jest.fn().mockRejectedValue(new Error('Job was removed')),
        remove: jest.fn().mockResolvedValue(undefined)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'External removal',
        force: false,
        timeout: 1000
      };

      const result = await queueManager.interruptCommand(request);

      expect(result.success).toBe(true);
      expect(result.reason).toContain('(forced after timeout)');
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should handle unknown errors during interruption', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(true),
        isWaiting: jest.fn().mockResolvedValue(false),
        updateData: jest.fn().mockRejectedValue({ code: 'UNKNOWN_ERROR' })
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Unknown error test',
        force: false
      };

      const result = await queueManager.interruptCommand(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should log interruption attempts with details', async () => {
      const mockJob = {
        id: 'job-1',
        data: { command: mockCommand },
        isActive: jest.fn().mockResolvedValue(false),
        isWaiting: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(undefined)
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockJob]);
      mockQueue.getWaiting.mockResolvedValue([]);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'System maintenance',
        force: true
      };

      await queueManager.interruptCommand(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          commandId: 'test-cmd-1',
          reason: 'System maintenance',
          force: true
        },
        'Command interrupted'
      );
    });
  });

  describe('Initialization State', () => {
    it('should require initialization before interruption', async () => {
      const uninitializedManager = new QueueManager(mockLogger);

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Test',
        force: false
      };

      await expect(uninitializedManager.interruptCommand(request))
        .rejects.toThrow('QueueManager not initialized');
    });

    it('should prevent interruption during shutdown', async () => {
      // Mock the shutdown process
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.pause.mockResolvedValue();
      mockQueue.close.mockResolvedValue();
      mockQueueEvents.close.mockResolvedValue();

      const shutdownPromise = queueManager.shutdown();

      const request: InterruptRequest = {
        commandId: 'test-cmd-1',
        reason: 'Test during shutdown',
        force: false
      };

      await expect(queueManager.interruptCommand(request))
        .rejects.toThrow('QueueManager is shutting down');

      await shutdownPromise;
    });
  });
});