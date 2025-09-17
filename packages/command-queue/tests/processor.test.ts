/**
 * Command processor tests
 *
 * Tests the command processing logic and worker functionality
 */

import { jest } from '@jest/globals';
import { Job, Worker } from 'bullmq';
import { Logger } from 'pino';
import { CommandProcessor } from '../src/processor.js';
import type { CommandJobData, CommandJobResult } from '../src/types.js';
import { createMockLogger, createMockCommand } from './setup.js';

// Mock BullMQ
jest.mock('bullmq');
jest.mock('../src/config.js');
jest.mock('../src/redis-connection.js');

const MockedWorker = Worker as jest.MockedClass<typeof Worker>;

describe('Command Processor', () => {
  let processor: CommandProcessor;
  let mockLogger: jest.Mocked<Logger>;
  let mockWorker: jest.Mocked<Worker>;

  const mockConfig = {
    queue: {
      name: 'test-queue',
      concurrency: 5,
      maxStalledCount: 1,
      stalledInterval: 30000
    }
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLogger = createMockLogger() as any;

    // Mock config
    const { ConfigManager } = await import('../src/config.js');
    (ConfigManager.get as jest.Mock).mockReturnValue(mockConfig);
    (ConfigManager.getRedisOptions as jest.Mock).mockReturnValue({
      host: 'localhost',
      port: 6379
    });

    // Mock Redis connection
    const { createRedisConnection } = await import('../src/redis-connection.js');
    (createRedisConnection as jest.Mock).mockReturnValue({
      duplicate: jest.fn().mockReturnThis(),
      quit: jest.fn().mockResolvedValue(undefined)
    });

    // Create mock worker
    mockWorker = {
      on: jest.fn().mockReturnThis(),
      close: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockedWorker.mockImplementation(() => mockWorker);

    processor = new CommandProcessor(mockLogger);
  });

  afterEach(async () => {
    await processor.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize worker with correct configuration', () => {
      expect(MockedWorker).toHaveBeenCalledWith(
        mockConfig.queue.name,
        expect.any(Function), // processor function
        {
          connection: expect.any(Object),
          concurrency: mockConfig.queue.concurrency,
          maxStalledCount: mockConfig.queue.maxStalledCount,
          stalledInterval: mockConfig.queue.stalledInterval
        }
      );
    });

    it('should set up worker event listeners', () => {
      expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('stalled', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('Command Processing', () => {
    let processorFunction: (job: Job<CommandJobData>) => Promise<CommandJobResult>;

    beforeEach(() => {
      // Extract the processor function passed to Worker constructor
      const workerCall = MockedWorker.mock.calls[0];
      processorFunction = workerCall[1] as any;
    });

    it('should process execute command successfully', async () => {
      const command = createMockCommand({
        type: 'execute',
        content: 'echo "Hello World"'
      });

      const mockJob: Job<CommandJobData> = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: undefined
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result).toEqual({
        success: true,
        commandId: command.id,
        agentId: 'agent-1',
        executionTime: expect.any(Number),
        tokensUsed: expect.any(Number),
        output: expect.any(String)
      });

      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should handle command with time limit constraint', async () => {
      const command = createMockCommand({
        type: 'execute',
        content: 'sleep 10' // Long running command
      });

      const mockJob: Job<CommandJobData> = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: {
            timeLimitMs: 1000 // 1 second limit
          }
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle command with token budget constraint', async () => {
      const command = createMockCommand({
        type: 'analyze',
        content: 'Large text to analyze that would exceed token budget'
      });

      const mockJob: Job<CommandJobData> = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: {
            tokenBudget: 10 // Very low token budget
          }
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('token budget');
    });

    it('should handle interruption during processing', async () => {
      const command = createMockCommand({
        type: 'execute',
        content: 'long-running-command'
      });

      const mockJob: Job<CommandJobData> = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: undefined,
          interruptReason: 'User cancelled'
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('interrupted');
      expect(result.error).toContain('User cancelled');
    });

    it('should update progress during processing', async () => {
      const command = createMockCommand({
        type: 'execute',
        content: 'multi-step-command'
      });

      const mockJob: Job<CommandJobData> = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: undefined
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      await processorFunction(mockJob);

      // Should update progress at least once during processing
      expect(mockJob.updateProgress).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should handle processing errors gracefully', async () => {
      const command = createMockCommand({
        type: 'execute',
        content: 'invalid-command-that-will-fail'
      });

      const mockJob: Job<CommandJobData> = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: undefined
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should track token usage for LLM commands', async () => {
      const command = createMockCommand({
        type: 'analyze',
        content: 'Analyze this text for sentiment'
      });

      const mockJob: Job<CommandJobData> = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: undefined
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.tokensUsed).toBeGreaterThan(0);
    });
  });

  describe('Worker Event Handling', () => {
    it('should handle job completion events', () => {
      const completedHandler = mockWorker.on.mock.calls.find(
        call => call[0] === 'completed'
      )?.[1] as Function;

      const mockJob = { id: 'job-1', name: 'test-job' };
      const mockResult = { success: true, commandId: 'cmd-1' };

      completedHandler?.(mockJob, mockResult);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { jobId: 'job-1', jobName: 'test-job', result: mockResult },
        'Job completed'
      );
    });

    it('should handle job failure events', () => {
      const failedHandler = mockWorker.on.mock.calls.find(
        call => call[0] === 'failed'
      )?.[1] as Function;

      const mockJob = { id: 'job-1', name: 'test-job' };
      const mockError = new Error('Processing failed');

      failedHandler?.(mockJob, mockError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { jobId: 'job-1', jobName: 'test-job', error: mockError },
        'Job failed'
      );
    });

    it('should handle stalled job events', () => {
      const stalledHandler = mockWorker.on.mock.calls.find(
        call => call[0] === 'stalled'
      )?.[1] as Function;

      const mockJob = { id: 'job-1', name: 'test-job' };

      stalledHandler?.(mockJob);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { jobId: 'job-1', jobName: 'test-job' },
        'Job stalled'
      );
    });

    it('should handle worker error events', () => {
      const errorHandler = mockWorker.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1] as Function;

      const mockError = new Error('Worker error');

      errorHandler?.(mockError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: mockError },
        'Worker error'
      );
    });
  });

  describe('Command Type Handlers', () => {
    let processorFunction: (job: Job<CommandJobData>) => Promise<CommandJobResult>;

    beforeEach(() => {
      const workerCall = MockedWorker.mock.calls[0];
      processorFunction = workerCall[1] as any;
    });

    it('should handle execute command type', async () => {
      const command = createMockCommand({ type: 'execute' });
      const mockJob = {
        id: 'job-1',
        data: { command, userId: 'user-1', agentId: 'agent-1', priority: 50 },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.commandId).toBe(command.id);
      expect(result.agentId).toBe('agent-1');
    });

    it('should handle analyze command type', async () => {
      const command = createMockCommand({ type: 'analyze' });
      const mockJob = {
        id: 'job-1',
        data: { command, userId: 'user-1', agentId: 'agent-1', priority: 50 },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.commandId).toBe(command.id);
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should handle unknown command types', async () => {
      const command = createMockCommand({ type: 'unknown' as any });
      const mockJob = {
        id: 'job-1',
        data: { command, userId: 'user-1', agentId: 'agent-1', priority: 50 },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown command type');
    });
  });

  describe('Worker Lifecycle', () => {
    it('should pause worker', async () => {
      await processor.pause();

      expect(mockWorker.pause).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Command processor paused');
    });

    it('should resume worker', async () => {
      await processor.resume();

      expect(mockWorker.resume).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Command processor resumed');
    });

    it('should shutdown worker gracefully', async () => {
      await processor.shutdown();

      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Command processor shutdown complete');
    });
  });

  describe('Error Recovery', () => {
    it('should handle worker initialization failure', () => {
      MockedWorker.mockImplementation(() => {
        throw new Error('Worker initialization failed');
      });

      expect(() => new CommandProcessor(mockLogger)).toThrow(
        'Worker initialization failed'
      );
    });

    it('should handle job processing timeout', async () => {
      const processorFunction = MockedWorker.mock.calls[0][1] as any;

      const command = createMockCommand({
        type: 'execute',
        content: 'timeout-command'
      });

      const mockJob = {
        id: 'job-1',
        data: {
          command,
          userId: 'user-1',
          agentId: 'agent-1',
          priority: 50,
          executionConstraints: { timeLimitMs: 100 }
        },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      // Mock a command that takes longer than the time limit
      jest.spyOn(processor as any, 'executeCommand').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle progress update failures', async () => {
      const processorFunction = MockedWorker.mock.calls[0][1] as any;

      const command = createMockCommand({ type: 'execute' });
      const mockJob = {
        id: 'job-1',
        data: { command, userId: 'user-1', agentId: 'agent-1', priority: 50 },
        updateProgress: jest.fn().mockRejectedValue(new Error('Progress update failed'))
      } as any;

      // Should not throw even if progress update fails
      const result = await processorFunction(mockJob);

      expect(result).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to update job progress'
      );
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track execution metrics', async () => {
      const processorFunction = MockedWorker.mock.calls[0][1] as any;

      const command = createMockCommand({ type: 'execute' });
      const mockJob = {
        id: 'job-1',
        data: { command, userId: 'user-1', agentId: 'agent-1', priority: 50 },
        updateProgress: jest.fn().mockResolvedValue(undefined)
      } as any;

      const startTime = Date.now();
      const result = await processorFunction(mockJob);
      const endTime = Date.now();

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(endTime - startTime + 100); // Some tolerance
    });

    it('should provide processor statistics', () => {
      const stats = processor.getStats();

      expect(stats).toEqual({
        totalJobsProcessed: 0,
        successfulJobs: 0,
        failedJobs: 0,
        averageExecutionTime: 0,
        totalTokensUsed: 0,
        isActive: true
      });
    });
  });
});