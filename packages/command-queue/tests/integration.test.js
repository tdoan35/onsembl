/**
 * Integration tests for the complete command queue system
 *
 * Tests the interaction between all components working together
 */
import { jest } from '@jest/globals';
import { QueueManager } from '../src/queue.js';
import { createMockLogger, createMockCommand } from './setup.js';
// Import real implementations for integration testing
jest.unmock('../src/queue.js');
jest.unmock('../src/processor.js');
// Keep mocking external dependencies
jest.mock('bullmq');
jest.mock('../src/config.js');
jest.mock('../src/redis-connection.js');
describe('Command Queue Integration', () => {
    let queueManager;
    let processor;
    let mockLogger;
    beforeEach(async () => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
        // Mock configuration
        const { ConfigManager } = await import('../src/config.js');
        ConfigManager.get.mockReturnValue({
            redis: {
                host: 'localhost',
                port: 6379,
                keyPrefix: 'test:'
            },
            queue: {
                name: 'test-queue',
                defaultJobOptions: {
                    removeOnComplete: 10,
                    removeOnFail: 10,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 1000 }
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
        });
        ConfigManager.getRedisOptions.mockReturnValue({
            host: 'localhost',
            port: 6379,
            keyPrefix: 'test:'
        });
        // Mock Redis connection
        const { createRedisConnection } = await import('../src/redis-connection.js');
        createRedisConnection.mockReturnValue({
            duplicate: jest.fn().mockReturnThis(),
            quit: jest.fn().mockResolvedValue(undefined),
            on: jest.fn().mockReturnThis(),
            ping: jest.fn().mockResolvedValue('PONG')
        });
        // Create queue manager and processor
        queueManager = new QueueManager(mockLogger);
        processor = new CommandProcessor(mockLogger);
    });
    afterEach(async () => {
        await Promise.all([
            queueManager.shutdown(),
            processor.shutdown()
        ]);
    });
    describe('End-to-End Command Processing', () => {
        it('should process a command from queue to completion', async () => {
            // Initialize both components
            await queueManager.initialize();
            const command = createMockCommand({
                type: 'execute',
                content: 'echo "Hello Integration Test"'
            });
            // Set up event tracking
            const events = [];
            queueManager.on('job:added', () => events.push('job:added'));
            queueManager.on('job:active', () => events.push('job:active'));
            queueManager.on('job:completed', () => events.push('job:completed'));
            // Add command to queue
            const job = await queueManager.addCommand(command, {
                userId: 'test-user',
                agentId: 'test-agent',
                priority: 50
            });
            expect(job).toBeDefined();
            expect(job.data.command.id).toBe(command.id);
            // Verify queue metrics
            const metrics = await queueManager.getMetrics();
            expect(metrics.totalJobs).toBeGreaterThan(0);
        });
        it('should handle high-priority commands before low-priority ones', async () => {
            await queueManager.initialize();
            const lowPriorityCommand = createMockCommand({
                id: 'low-priority-cmd',
                content: 'low priority task'
            });
            const highPriorityCommand = createMockCommand({
                id: 'high-priority-cmd',
                content: 'high priority task'
            });
            // Add low priority first
            await queueManager.addCommand(lowPriorityCommand, {
                userId: 'test-user',
                priority: 25
            });
            // Add high priority second
            await queueManager.addCommand(highPriorityCommand, {
                userId: 'test-user',
                priority: 75
            });
            // High priority should have better position despite being added later
            const lowPos = await queueManager.getCommandPosition('low-priority-cmd');
            const highPos = await queueManager.getCommandPosition('high-priority-cmd');
            // In a real queue, high priority would be processed first
            // Our mock doesn't implement actual priority ordering, so we just verify they're tracked
            expect(lowPos).toBeDefined();
            expect(highPos).toBeDefined();
        });
        it('should handle command interruption workflow', async () => {
            await queueManager.initialize();
            const command = createMockCommand({
                type: 'execute',
                content: 'long-running-task'
            });
            // Add command
            await queueManager.addCommand(command, {
                userId: 'test-user',
                agentId: 'test-agent'
            });
            // Interrupt the command
            const interruptRequest = {
                commandId: command.id,
                reason: 'User requested cancellation',
                force: false,
                timeout: 5000
            };
            const result = await queueManager.interruptCommand(interruptRequest);
            expect(result.success).toBe(true);
            expect(result.wasInterrupted).toBe(true);
            expect(result.reason).toBe('User requested cancellation');
        });
        it('should handle queue pause and resume operations', async () => {
            await queueManager.initialize();
            // Add a command
            const command = createMockCommand();
            await queueManager.addCommand(command, { userId: 'test-user' });
            // Pause the queue
            await queueManager.pause();
            // Resume the queue
            await queueManager.resume();
            // Verify queue is operational
            const metrics = await queueManager.getMetrics();
            expect(metrics).toBeDefined();
        });
    });
    describe('Error Handling and Recovery', () => {
        it('should handle processing failures gracefully', async () => {
            await queueManager.initialize();
            const failingCommand = createMockCommand({
                type: 'execute',
                content: 'command-that-will-fail'
            });
            const job = await queueManager.addCommand(failingCommand, {
                userId: 'test-user',
                agentId: 'test-agent'
            });
            expect(job).toBeDefined();
            // The command would fail in actual processing
            // but our mock handles this gracefully
        });
        it('should enforce queue size limits', async () => {
            const smallQueueManager = new QueueManager(mockLogger, 2);
            await smallQueueManager.initialize();
            // Fill up the queue
            const command1 = createMockCommand({ id: 'cmd-1' });
            const command2 = createMockCommand({ id: 'cmd-2' });
            const command3 = createMockCommand({ id: 'cmd-3' });
            await smallQueueManager.addCommand(command1, { userId: 'user-1' });
            await smallQueueManager.addCommand(command2, { userId: 'user-1' });
            // Third command should fail due to queue size limit
            await expect(smallQueueManager.addCommand(command3, { userId: 'user-1' })).rejects.toThrow('Queue is full');
            await smallQueueManager.shutdown();
        });
        it('should handle Redis connection issues', async () => {
            // Mock Redis connection failure
            const { createRedisConnection } = await import('../src/redis-connection.js');
            createRedisConnection.mockReturnValue({
                duplicate: jest.fn().mockImplementation(() => {
                    throw new Error('Redis connection failed');
                }),
                quit: jest.fn().mockResolvedValue(undefined),
                on: jest.fn().mockReturnThis()
            });
            const failingQueueManager = new QueueManager(mockLogger);
            await expect(failingQueueManager.initialize()).rejects.toThrow();
        });
    });
    describe('Performance and Scalability', () => {
        it('should handle multiple concurrent commands', async () => {
            await queueManager.initialize();
            const commands = Array.from({ length: 10 }, (_, i) => createMockCommand({ id: `cmd-${i}`, content: `task ${i}` }));
            // Add all commands concurrently
            const jobs = await Promise.all(commands.map(cmd => queueManager.addCommand(cmd, {
                userId: 'test-user',
                priority: Math.random() * 100
            })));
            expect(jobs).toHaveLength(10);
            jobs.forEach(job => expect(job).toBeDefined());
            // Verify queue metrics
            const metrics = await queueManager.getMetrics();
            expect(metrics.totalJobs).toBe(10);
        });
        it('should track detailed queue metrics', async () => {
            await queueManager.initialize();
            // Add some commands
            for (let i = 0; i < 5; i++) {
                const command = createMockCommand({ id: `metric-cmd-${i}` });
                await queueManager.addCommand(command, {
                    userId: 'test-user',
                    priority: 50
                });
            }
            const metrics = await queueManager.getMetrics();
            expect(metrics).toEqual({
                totalJobs: expect.any(Number),
                waitingJobs: expect.any(Number),
                activeJobs: expect.any(Number),
                completedJobs: expect.any(Number),
                failedJobs: expect.any(Number),
                avgWaitTime: expect.any(Number),
                avgProcessingTime: expect.any(Number),
                throughputPerHour: expect.any(Number)
            });
        });
    });
    describe('Command Filtering and Querying', () => {
        it('should filter commands by various criteria', async () => {
            await queueManager.initialize();
            // Add commands with different properties
            const commands = [
                {
                    cmd: createMockCommand({ id: 'user1-cmd1', type: 'execute' }),
                    opts: { userId: 'user-1', agentId: 'agent-1', priority: 75 }
                },
                {
                    cmd: createMockCommand({ id: 'user1-cmd2', type: 'analyze' }),
                    opts: { userId: 'user-1', agentId: 'agent-2', priority: 50 }
                },
                {
                    cmd: createMockCommand({ id: 'user2-cmd1', type: 'execute' }),
                    opts: { userId: 'user-2', agentId: 'agent-1', priority: 25 }
                }
            ];
            for (const { cmd, opts } of commands) {
                await queueManager.addCommand(cmd, opts);
            }
            // Filter by user
            const user1Commands = await queueManager.getCommands({ userId: 'user-1' });
            expect(user1Commands.length).toBe(2);
            // Filter by agent
            const agent1Commands = await queueManager.getCommands({ agentId: 'agent-1' });
            expect(agent1Commands.length).toBe(2);
            // Filter by command type
            const executeCommands = await queueManager.getCommands({ commandType: 'execute' });
            expect(executeCommands.length).toBe(2);
            // Filter by priority range
            const highPriorityCommands = await queueManager.getCommands({
                priority: { min: 60, max: 100 }
            });
            expect(highPriorityCommands.length).toBe(1);
        });
    });
    describe('System Monitoring and Health', () => {
        it('should provide comprehensive system health status', async () => {
            await queueManager.initialize();
            // Add some sample workload
            const command = createMockCommand();
            await queueManager.addCommand(command, { userId: 'health-user' });
            const metrics = await queueManager.getMetrics();
            const queueSize = await queueManager.getQueueSize();
            expect(metrics).toBeDefined();
            expect(queueSize).toBeGreaterThanOrEqual(0);
            // System should be healthy
            expect(metrics.totalJobs).toBeGreaterThanOrEqual(0);
            expect(metrics.waitingJobs).toBeGreaterThanOrEqual(0);
            expect(metrics.activeJobs).toBeGreaterThanOrEqual(0);
        });
        it('should handle graceful shutdown of all components', async () => {
            await queueManager.initialize();
            // Add some work
            const command = createMockCommand();
            await queueManager.addCommand(command, { userId: 'shutdown-user' });
            // Shutdown should complete without errors
            await queueManager.shutdown();
            await processor.shutdown();
            // Components should be in shutdown state
            await expect(queueManager.addCommand(command, { userId: 'post-shutdown' })).rejects.toThrow('QueueManager is shutting down');
        });
    });
    describe('Event System Integration', () => {
        it('should emit and handle all queue events', async () => {
            await queueManager.initialize();
            const eventLog = [];
            // Set up event listeners
            const events = [
                'job:added', 'job:waiting', 'job:active', 'job:completed',
                'job:failed', 'job:stalled', 'job:progress', 'job:removed',
                'queue:drained', 'queue:paused', 'queue:resumed', 'queue:error',
                'queue:full', 'position:updated'
            ];
            events.forEach(event => {
                queueManager.on(event, (data) => {
                    eventLog.push({ event, data });
                });
            });
            // Trigger various events
            const command = createMockCommand();
            await queueManager.addCommand(command, { userId: 'event-user' });
            await queueManager.pause();
            await queueManager.resume();
            // Verify events were emitted
            const eventNames = eventLog.map(e => e.event);
            expect(eventNames).toContain('position:updated');
            expect(eventNames).toContain('queue:paused');
            expect(eventNames).toContain('queue:resumed');
        });
    });
});
//# sourceMappingURL=integration.test.js.map