/**
 * Queue management operations tests
 *
 * Tests queue creation, worker management, stats, and lifecycle operations
 */
import { jest } from '@jest/globals';
import { Queue, QueueEvents } from 'bullmq';
import { QueueManager } from '../src/queue.js';
// Mock BullMQ
jest.mock('bullmq');
jest.mock('../src/config.js');
const MockedQueue = Queue;
const MockedQueueEvents = QueueEvents;
describe('Queue Manager Operations', () => {
    let queueManager;
    let mockQueue;
    let mockQueueEvents;
    let mockLogger;
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
        jest.clearAllMocks();
        mockLogger = {
            child: jest.fn().mockReturnThis(),
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        };
        // Mock config
        const { ConfigManager } = await import('../src/config.js');
        ConfigManager.get.mockReturnValue(mockConfig);
        ConfigManager.getRedisOptions.mockReturnValue({
            host: 'localhost',
            port: 6379
        });
        // Create comprehensive mock queue
        mockQueue = {
            add: jest.fn(),
            getWaiting: jest.fn(),
            getActive: jest.fn(),
            getCompleted: jest.fn(),
            getFailed: jest.fn(),
            getDelayed: jest.fn(),
            getWaitingCount: jest.fn(),
            getActiveCount: jest.fn(),
            getCompletedCount: jest.fn(),
            getFailedCount: jest.fn(),
            getDelayedCount: jest.fn(),
            getJobs: jest.fn(),
            pause: jest.fn(),
            resume: jest.fn(),
            drain: jest.fn(),
            clean: jest.fn(),
            close: jest.fn(),
            waitUntilReady: jest.fn().mockResolvedValue(undefined),
            on: jest.fn()
        };
        mockQueueEvents = {
            close: jest.fn(),
            on: jest.fn()
        };
        MockedQueue.mockImplementation(() => mockQueue);
        MockedQueueEvents.mockImplementation(() => mockQueueEvents);
        queueManager = new QueueManager(mockLogger);
        await queueManager.initialize();
    });
    afterEach(async () => {
        await queueManager.shutdown();
    });
    describe('Initialization', () => {
        it('should initialize queue successfully', async () => {
            expect(MockedQueue).toHaveBeenCalledWith(mockConfig.queue.name, expect.objectContaining({
                connection: expect.any(Object),
                defaultJobOptions: expect.objectContaining({
                    removeOnComplete: 50,
                    removeOnFail: 25
                })
            }));
            expect(MockedQueueEvents).toHaveBeenCalledWith(mockConfig.queue.name, expect.objectContaining({
                connection: expect.any(Object)
            }));
            expect(mockQueue.waitUntilReady).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('QueueManager initialized successfully');
        });
        it('should handle initialization timeout', async () => {
            const timeoutQueueManager = new QueueManager(mockLogger);
            mockQueue.waitUntilReady.mockImplementation(() => new Promise(() => { }) // Never resolves
            );
            await expect(timeoutQueueManager.initialize()).rejects.toThrow('Redis connection timeout');
        });
        it('should not reinitialize if already initialized', async () => {
            const initSpy = jest.spyOn(mockQueue, 'waitUntilReady');
            initSpy.mockClear();
            await queueManager.initialize();
            expect(initSpy).not.toHaveBeenCalled();
        });
    });
    describe('Command Management', () => {
        const mockCommand = {
            id: 'test-cmd-1',
            type: 'execute',
            content: 'test command',
            createdAt: Date.now(),
            status: 'pending',
            queuedAt: Date.now(),
            attemptCount: 0,
            maxAttempts: 3
        };
        beforeEach(() => {
            mockQueue.getWaitingCount.mockResolvedValue(0);
            mockQueue.getActiveCount.mockResolvedValue(0);
            mockQueue.getDelayedCount.mockResolvedValue(0);
            mockQueue.getWaiting.mockResolvedValue([]);
        });
        it('should add command with correct job data', async () => {
            const mockJob = { id: 'job-1', data: {} };
            mockQueue.add.mockResolvedValue(mockJob);
            const job = await queueManager.addCommand(mockCommand, {
                userId: 'user-1',
                agentId: 'agent-1',
                priority: 75,
                executionConstraints: {
                    timeLimitMs: 30000,
                    tokenBudget: 1000
                }
            });
            expect(mockQueue.add).toHaveBeenCalledWith(`command-${mockCommand.id}`, expect.objectContaining({
                command: expect.objectContaining({
                    ...mockCommand,
                    queuedAt: expect.any(Number),
                    attemptCount: 0,
                    maxAttempts: mockConfig.queue.defaultJobOptions.attempts
                }),
                agentId: 'agent-1',
                userId: 'user-1',
                priority: 75,
                executionConstraints: {
                    timeLimitMs: 30000,
                    tokenBudget: 1000
                }
            }), expect.objectContaining({
                priority: 75,
                jobId: expect.stringMatching(/^cmd-test-cmd-1-\d+$/),
                removeOnComplete: mockConfig.queue.defaultJobOptions.removeOnComplete,
                removeOnFail: mockConfig.queue.defaultJobOptions.removeOnFail
            }));
            expect(job).toBe(mockJob);
        });
        it('should add command with delay', async () => {
            const mockJob = { id: 'job-1', data: {} };
            mockQueue.add.mockResolvedValue(mockJob);
            await queueManager.addCommand(mockCommand, {
                userId: 'user-1',
                delay: 5000
            });
            expect(mockQueue.add).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.objectContaining({
                delay: 5000
            }));
        });
        it('should find command by ID', async () => {
            const mockJob = {
                id: 'job-1',
                data: { command: mockCommand }
            };
            mockQueue.getJobs.mockResolvedValue([mockJob]);
            const result = await queueManager.getCommand('test-cmd-1');
            expect(result).toBe(mockJob);
            expect(mockQueue.getJobs).toHaveBeenCalledWith(['waiting', 'active', 'completed', 'failed', 'delayed']);
        });
        it('should return null for non-existent command', async () => {
            mockQueue.getJobs.mockResolvedValue([]);
            const result = await queueManager.getCommand('non-existent');
            expect(result).toBeNull();
        });
        it('should remove command and update positions', async () => {
            const mockJob = {
                id: 'job-1',
                data: { command: mockCommand },
                remove: jest.fn()
            };
            mockQueue.getJobs.mockResolvedValue([mockJob]);
            const removedSpy = jest.fn();
            queueManager.on('job:removed', removedSpy);
            const result = await queueManager.removeCommand('test-cmd-1');
            expect(result).toBe(true);
            expect(mockJob.remove).toHaveBeenCalled();
            expect(removedSpy).toHaveBeenCalledWith('job-1', 'test-cmd-1');
            expect(mockQueue.getWaiting).toHaveBeenCalled(); // For position update
        });
        it('should return false when removing non-existent command', async () => {
            mockQueue.getJobs.mockResolvedValue([]);
            const result = await queueManager.removeCommand('non-existent');
            expect(result).toBe(false);
        });
    });
    describe('Queue Operations', () => {
        it('should pause queue', async () => {
            const pausedSpy = jest.fn();
            queueManager.on('queue:paused', pausedSpy);
            await queueManager.pause();
            expect(mockQueue.pause).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Queue paused');
            expect(pausedSpy).toHaveBeenCalled();
        });
        it('should resume queue', async () => {
            const resumedSpy = jest.fn();
            queueManager.on('queue:resumed', resumedSpy);
            await queueManager.resume();
            expect(mockQueue.resume).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Queue resumed');
            expect(resumedSpy).toHaveBeenCalled();
        });
        it('should drain queue', async () => {
            await queueManager.drain();
            expect(mockQueue.drain).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Queue drained');
        });
        it('should clean old jobs', async () => {
            mockQueue.clean
                .mockResolvedValueOnce(['job1', 'job2'])
                .mockResolvedValueOnce(['job3']);
            await queueManager.clean(24 * 60 * 60 * 1000);
            expect(mockQueue.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 100, 'completed');
            expect(mockQueue.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 50, 'failed');
            expect(mockLogger.info).toHaveBeenCalledWith({ completedCleaned: ['job1', 'job2'], failedCleaned: ['job3'] }, 'Queue cleaned');
        });
    });
    describe('Metrics', () => {
        it('should calculate comprehensive queue metrics', async () => {
            const mockWaiting = [{ id: '1' }, { id: '2' }];
            const mockActive = [{ id: '3' }];
            const mockCompleted = [{ id: '4' }, { id: '5' }, { id: '6' }];
            const mockFailed = [{ id: '7' }];
            const mockDelayed = [{ id: '8' }];
            const recentJobs = [
                {
                    id: '4',
                    timestamp: 1000,
                    processedOn: 2000,
                    finishedOn: 3000
                },
                {
                    id: '5',
                    timestamp: 1500,
                    processedOn: 2500,
                    finishedOn: 4000
                }
            ];
            mockQueue.getWaiting.mockResolvedValue(mockWaiting);
            mockQueue.getActive.mockResolvedValue(mockActive);
            mockQueue.getCompleted.mockResolvedValue(mockCompleted);
            mockQueue.getFailed.mockResolvedValue(mockFailed);
            mockQueue.getDelayed.mockResolvedValue(mockDelayed);
            mockQueue.getJobs.mockResolvedValue(recentJobs);
            const metrics = await queueManager.getMetrics();
            const expectedMetrics = {
                totalJobs: 8, // 2 + 1 + 3 + 1 + 1
                waitingJobs: 2,
                activeJobs: 1,
                completedJobs: 3,
                failedJobs: 1,
                avgWaitTime: 1000, // Average of (2000-1000) and (2500-1500)
                avgProcessingTime: 1250, // Average of (3000-2000) and (4000-2500)
                throughputPerHour: 0 // No jobs completed in the last hour
            };
            expect(metrics).toEqual(expectedMetrics);
        });
        it('should handle metrics calculation with no jobs', async () => {
            mockQueue.getWaiting.mockResolvedValue([]);
            mockQueue.getActive.mockResolvedValue([]);
            mockQueue.getCompleted.mockResolvedValue([]);
            mockQueue.getFailed.mockResolvedValue([]);
            mockQueue.getDelayed.mockResolvedValue([]);
            mockQueue.getJobs.mockResolvedValue([]);
            const metrics = await queueManager.getMetrics();
            expect(metrics).toEqual({
                totalJobs: 0,
                waitingJobs: 0,
                activeJobs: 0,
                completedJobs: 0,
                failedJobs: 0,
                avgWaitTime: 0,
                avgProcessingTime: 0,
                throughputPerHour: 0
            });
        });
        it('should calculate throughput correctly', async () => {
            const now = Date.now();
            const hourAgo = now - (60 * 60 * 1000);
            const recentJobs = [
                { id: '1', finishedOn: now - 30000 }, // 30 seconds ago
                { id: '2', finishedOn: now - 1800000 }, // 30 minutes ago
                { id: '3', finishedOn: now - 7200000 } // 2 hours ago (should not count)
            ];
            mockQueue.getWaiting.mockResolvedValue([]);
            mockQueue.getActive.mockResolvedValue([]);
            mockQueue.getCompleted.mockResolvedValue([]);
            mockQueue.getFailed.mockResolvedValue([]);
            mockQueue.getDelayed.mockResolvedValue([]);
            mockQueue.getJobs.mockResolvedValue(recentJobs);
            const metrics = await queueManager.getMetrics();
            expect(metrics.throughputPerHour).toBe(2); // Only first 2 jobs
        });
    });
    describe('Command Filtering', () => {
        const mockJobs = [
            {
                data: {
                    command: { id: 'cmd-1', type: 'execute', status: 'completed', createdAt: 1000 },
                    agentId: 'agent-1',
                    userId: 'user-1',
                    priority: 75
                }
            },
            {
                data: {
                    command: { id: 'cmd-2', type: 'analyze', status: 'pending', createdAt: 2000 },
                    agentId: 'agent-2',
                    userId: 'user-2',
                    priority: 50
                }
            }
        ];
        beforeEach(() => {
            mockQueue.getJobs.mockResolvedValue(mockJobs);
        });
        it('should filter commands by agent ID', async () => {
            const commands = await queueManager.getCommands({ agentId: 'agent-1' });
            expect(commands).toHaveLength(1);
            expect(commands[0].id).toBe('cmd-1');
        });
        it('should filter commands by user ID', async () => {
            const commands = await queueManager.getCommands({ userId: 'user-2' });
            expect(commands).toHaveLength(1);
            expect(commands[0].id).toBe('cmd-2');
        });
        it('should filter commands by command type', async () => {
            const commands = await queueManager.getCommands({ commandType: 'analyze' });
            expect(commands).toHaveLength(1);
            expect(commands[0].id).toBe('cmd-2');
        });
        it('should filter commands by status', async () => {
            const commands = await queueManager.getCommands({ status: 'completed' });
            expect(commands).toHaveLength(1);
            expect(commands[0].id).toBe('cmd-1');
        });
        it('should filter commands by priority range', async () => {
            const commands = await queueManager.getCommands({
                priority: { min: 60, max: 80 }
            });
            expect(commands).toHaveLength(1);
            expect(commands[0].id).toBe('cmd-1');
        });
        it('should filter commands by date range', async () => {
            const commands = await queueManager.getCommands({
                dateRange: { from: 1500, to: 2500 }
            });
            expect(commands).toHaveLength(1);
            expect(commands[0].id).toBe('cmd-2');
        });
        it('should apply pagination', async () => {
            const commands = await queueManager.getCommands({}, 1, 1);
            expect(mockQueue.getJobs).toHaveBeenCalledWith(expect.any(Array), 1, 1);
        });
    });
    describe('Error Handling', () => {
        it('should prevent operations when not initialized', async () => {
            const uninitializedManager = new QueueManager(mockLogger);
            await expect(uninitializedManager.addCommand({}, {}))
                .rejects.toThrow('QueueManager not initialized');
            await expect(uninitializedManager.pause())
                .rejects.toThrow('QueueManager not initialized');
        });
        it('should prevent operations during shutdown', async () => {
            // Mock active jobs for shutdown test
            mockQueue.getActive.mockResolvedValue([]);
            mockQueue.pause.mockResolvedValue();
            mockQueue.close.mockResolvedValue();
            mockQueueEvents.close.mockResolvedValue();
            const shutdownPromise = queueManager.shutdown();
            await expect(queueManager.addCommand({}, {}))
                .rejects.toThrow('QueueManager is shutting down');
            await shutdownPromise;
        });
        it('should handle queue errors', () => {
            const errorSpy = jest.fn();
            queueManager.on('queue:error', errorSpy);
            const error = new Error('Queue error');
            const queueErrorHandler = mockQueue.on.mock.calls.find(call => call[0] === 'error')?.[1];
            queueErrorHandler?.(error);
            expect(errorSpy).toHaveBeenCalledWith(error);
            expect(mockLogger.error).toHaveBeenCalledWith({ error }, 'Queue error');
        });
    });
    describe('Shutdown', () => {
        it('should perform graceful shutdown', async () => {
            const activeJobs = [
                { waitUntilFinished: jest.fn().mockResolvedValue({}) }
            ];
            mockQueue.getActive.mockResolvedValue(activeJobs);
            mockQueue.pause.mockResolvedValue();
            mockQueue.close.mockResolvedValue();
            mockQueueEvents.close.mockResolvedValue();
            await queueManager.shutdown();
            expect(mockQueue.pause).toHaveBeenCalled();
            expect(activeJobs[0].waitUntilFinished).toHaveBeenCalled();
            expect(mockQueue.close).toHaveBeenCalled();
            expect(mockQueueEvents.close).toHaveBeenCalled();
        });
        it('should timeout waiting for active jobs', async () => {
            const activeJobs = [
                { waitUntilFinished: jest.fn().mockImplementation(() => new Promise(() => { })) }
            ];
            mockQueue.getActive.mockResolvedValue(activeJobs);
            mockQueue.pause.mockResolvedValue();
            mockQueue.close.mockResolvedValue();
            mockQueueEvents.close.mockResolvedValue();
            const startTime = Date.now();
            await queueManager.shutdown();
            const endTime = Date.now();
            // Should not wait more than 30 seconds
            expect(endTime - startTime).toBeLessThan(35000);
            expect(mockQueue.close).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=queue-manager.test.js.map