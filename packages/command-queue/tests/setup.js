/**
 * Test setup and utilities for command-queue tests
 */
import { jest } from '@jest/globals';
// Mock BullMQ globally
jest.mock('bullmq', () => ({
    Queue: jest.fn(),
    Worker: jest.fn(),
    QueueEvents: jest.fn(),
    Job: jest.fn()
}));
// Mock Redis connection
jest.mock('../src/redis-connection.js', () => ({
    createRedisConnection: jest.fn().mockReturnValue({
        duplicate: jest.fn().mockReturnThis(),
        quit: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        ping: jest.fn().mockResolvedValue('PONG')
    }),
    getRedisClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue('PONG'),
        quit: jest.fn().mockResolvedValue(undefined)
    })
}));
// Mock configuration
jest.mock('../src/config.js', () => ({
    ConfigManager: {
        get: jest.fn().mockReturnValue({
            redis: {
                host: 'localhost',
                port: 6379,
                keyPrefix: 'test:'
            },
            queue: {
                name: 'test-command-queue',
                defaultJobOptions: {
                    removeOnComplete: 10,
                    removeOnFail: 10,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 1000
                    }
                },
                concurrency: 5,
                maxStalledCount: 1,
                stalledInterval: 30000
            },
            priorities: {
                emergency: 100,
                high: 75,
                normal: 50,
                low: 25
            }
        }),
        getRedisOptions: jest.fn().mockReturnValue({
            host: 'localhost',
            port: 6379,
            keyPrefix: 'test:',
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            lazyConnect: true
        })
    }
}));
// Test utilities
export const createMockLogger = () => ({
    child: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn()
});
export const createMockCommand = (overrides = {}) => ({
    id: 'test-command-id',
    type: 'execute',
    content: 'test command content',
    createdAt: Date.now(),
    status: 'pending',
    queuedAt: Date.now(),
    attemptCount: 0,
    maxAttempts: 3,
    ...overrides
});
export const createMockJob = (command = createMockCommand(), overrides = {}) => ({
    id: 'test-job-id',
    name: `command-${command.id}`,
    data: {
        command,
        userId: 'test-user',
        agentId: 'test-agent',
        priority: 50,
        executionConstraints: undefined,
        ...overrides
    },
    opts: {
        priority: 50,
        removeOnComplete: 10,
        removeOnFail: 10,
        attempts: 3
    },
    timestamp: Date.now(),
    processedOn: null,
    finishedOn: null,
    returnvalue: null,
    failedReason: null,
    stacktrace: null,
    attemptsMade: 0,
    // Job methods
    isActive: jest.fn().mockResolvedValue(false),
    isWaiting: jest.fn().mockResolvedValue(true),
    isCompleted: jest.fn().mockResolvedValue(false),
    isFailed: jest.fn().mockResolvedValue(false),
    isDelayed: jest.fn().mockResolvedValue(false),
    remove: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    updateData: jest.fn().mockResolvedValue(undefined),
    updateProgress: jest.fn().mockResolvedValue(undefined),
    waitUntilFinished: jest.fn().mockResolvedValue({ success: true })
});
export const createMockQueue = () => ({
    // Queue state methods
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    // Queue count methods
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    // Job management
    add: jest.fn().mockResolvedValue(createMockJob()),
    getJob: jest.fn().mockResolvedValue(null),
    getJobs: jest.fn().mockResolvedValue([]),
    // Queue operations
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    drain: jest.fn().mockResolvedValue(undefined),
    clean: jest.fn().mockResolvedValue([]),
    obliterate: jest.fn().mockResolvedValue(undefined),
    // Connection
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    // Events
    on: jest.fn(),
    emit: jest.fn(),
    removeAllListeners: jest.fn()
});
export const createMockQueueEvents = () => ({
    on: jest.fn(),
    emit: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    removeAllListeners: jest.fn()
});
export const createMockWorker = () => ({
    on: jest.fn(),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
});
// Global test configuration
beforeEach(() => {
    jest.clearAllMocks();
});
// Increase test timeout for async operations
jest.setTimeout(10000);
//# sourceMappingURL=setup.js.map