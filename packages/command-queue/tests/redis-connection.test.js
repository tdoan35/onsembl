/**
 * Redis connection management tests
 */
import { jest } from '@jest/globals';
import { createRedisConnection, getRedisClient } from '../src/redis-connection.js';
// Mock ioredis
jest.mock('ioredis');
// Mock config
jest.mock('../src/config.js');
import Redis from 'ioredis';
const MockedRedis = Redis;
describe('Redis Connection Management', () => {
    let mockRedis;
    beforeEach(async () => {
        jest.clearAllMocks();
        // Create mock Redis instance
        mockRedis = {
            ping: jest.fn().mockResolvedValue('PONG'),
            quit: jest.fn().mockResolvedValue('OK'),
            disconnect: jest.fn(),
            duplicate: jest.fn().mockReturnThis(),
            on: jest.fn().mockReturnThis(),
            once: jest.fn().mockReturnThis(),
            off: jest.fn().mockReturnThis(),
            removeAllListeners: jest.fn().mockReturnThis(),
            status: 'ready'
        };
        MockedRedis.mockImplementation(() => mockRedis);
        // Mock config
        const { ConfigManager } = await import('../src/config.js');
        ConfigManager.getRedisOptions.mockReturnValue({
            host: 'localhost',
            port: 6379,
            keyPrefix: 'test:',
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            lazyConnect: true
        });
    });
    describe('createRedisConnection', () => {
        it('should create Redis connection with correct options', () => {
            const connection = createRedisConnection();
            expect(MockedRedis).toHaveBeenCalledWith({
                host: 'localhost',
                port: 6379,
                keyPrefix: 'test:',
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
            expect(connection).toBe(mockRedis);
        });
        it('should set up connection event handlers', () => {
            createRedisConnection();
            expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('close', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
        });
        it('should handle connection events correctly', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            createRedisConnection();
            // Find and trigger event handlers
            const onCalls = mockRedis.on.mock.calls;
            // Trigger connect event
            const connectHandler = onCalls.find(call => call[0] === 'connect')?.[1];
            connectHandler?.();
            expect(consoleSpy).toHaveBeenCalledWith('Redis connecting...');
            // Trigger ready event
            const readyHandler = onCalls.find(call => call[0] === 'ready')?.[1];
            readyHandler?.();
            expect(consoleSpy).toHaveBeenCalledWith('Redis connection ready');
            // Trigger error event
            const errorHandler = onCalls.find(call => call[0] === 'error')?.[1];
            const testError = new Error('Connection failed');
            errorHandler?.(testError);
            expect(consoleErrorSpy).toHaveBeenCalledWith('Redis connection error:', testError);
            // Trigger close event
            const closeHandler = onCalls.find(call => call[0] === 'close')?.[1];
            closeHandler?.();
            expect(consoleSpy).toHaveBeenCalledWith('Redis connection closed');
            // Trigger reconnecting event
            const reconnectingHandler = onCalls.find(call => call[0] === 'reconnecting')?.[1];
            reconnectingHandler?.();
            expect(consoleSpy).toHaveBeenCalledWith('Redis reconnecting...');
            consoleSpy.mockRestore();
            consoleErrorSpy.mockRestore();
        });
        it('should create multiple independent connections', () => {
            const connection1 = createRedisConnection();
            const connection2 = createRedisConnection();
            expect(MockedRedis).toHaveBeenCalledTimes(2);
            expect(connection1).not.toBe(connection2);
        });
    });
    describe('getRedisClient', () => {
        it('should return singleton Redis client', () => {
            const client1 = getRedisClient();
            const client2 = getRedisClient();
            expect(client1).toBe(client2);
            expect(MockedRedis).toHaveBeenCalledTimes(1);
        });
        it('should create new client with correct options', () => {
            const client = getRedisClient();
            expect(MockedRedis).toHaveBeenCalledWith({
                host: 'localhost',
                port: 6379,
                keyPrefix: 'test:',
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
            expect(client).toBe(mockRedis);
        });
        it('should set up event handlers for singleton client', () => {
            getRedisClient();
            expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('close', expect.any(Function));
            expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
        });
    });
    describe('Connection Configuration', () => {
        it('should handle configuration with password', async () => {
            const { ConfigManager } = await import('../src/config.js');
            ConfigManager.getRedisOptions.mockReturnValue({
                host: 'redis.example.com',
                port: 6380,
                password: 'secret123',
                keyPrefix: 'prod:',
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
            createRedisConnection();
            expect(MockedRedis).toHaveBeenCalledWith({
                host: 'redis.example.com',
                port: 6380,
                password: 'secret123',
                keyPrefix: 'prod:',
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
        });
        it('should handle configuration with database selection', async () => {
            const { ConfigManager } = await import('../src/config.js');
            ConfigManager.getRedisOptions.mockReturnValue({
                host: 'localhost',
                port: 6379,
                db: 2,
                keyPrefix: 'test:',
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
            createRedisConnection();
            expect(MockedRedis).toHaveBeenCalledWith({
                host: 'localhost',
                port: 6379,
                db: 2,
                keyPrefix: 'test:',
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
        });
    });
    describe('Connection Health', () => {
        it('should successfully ping Redis connection', async () => {
            const connection = createRedisConnection();
            mockRedis.ping.mockResolvedValue('PONG');
            const result = await connection.ping();
            expect(result).toBe('PONG');
            expect(mockRedis.ping).toHaveBeenCalled();
        });
        it('should handle ping failures', async () => {
            const connection = createRedisConnection();
            mockRedis.ping.mockRejectedValue(new Error('Connection timeout'));
            await expect(connection.ping()).rejects.toThrow('Connection timeout');
        });
        it('should properly close connections', async () => {
            const connection = createRedisConnection();
            mockRedis.quit.mockResolvedValue('OK');
            const result = await connection.quit();
            expect(result).toBe('OK');
            expect(mockRedis.quit).toHaveBeenCalled();
        });
    });
    describe('Connection Duplication', () => {
        it('should support connection duplication', () => {
            const connection = createRedisConnection();
            const duplicatedConnection = connection.duplicate();
            expect(mockRedis.duplicate).toHaveBeenCalled();
            expect(duplicatedConnection).toBe(mockRedis); // Mock returns itself
        });
        it('should create independent duplicated connections', () => {
            const connection = createRedisConnection();
            // Setup duplicate to return a new mock
            const mockDuplicate = {
                ping: jest.fn().mockResolvedValue('PONG'),
                quit: jest.fn().mockResolvedValue('OK')
            };
            mockRedis.duplicate.mockReturnValue(mockDuplicate);
            const duplicate1 = connection.duplicate();
            const duplicate2 = connection.duplicate();
            expect(mockRedis.duplicate).toHaveBeenCalledTimes(2);
            expect(duplicate1).toBe(mockDuplicate);
            expect(duplicate2).toBe(mockDuplicate);
        });
    });
    describe('Error Handling', () => {
        it('should handle Redis constructor errors', () => {
            MockedRedis.mockImplementation(() => {
                throw new Error('Redis construction failed');
            });
            expect(() => createRedisConnection()).toThrow('Redis construction failed');
        });
        it('should handle configuration errors gracefully', async () => {
            const { ConfigManager } = await import('../src/config.js');
            ConfigManager.getRedisOptions.mockImplementation(() => {
                throw new Error('Config error');
            });
            expect(() => createRedisConnection()).toThrow('Config error');
        });
    });
    describe('Connection Lifecycle', () => {
        it('should handle connection state changes', () => {
            const connection = createRedisConnection();
            // Initially ready
            expect(connection.status).toBe('ready');
            // Simulate status changes
            connection.status = 'connecting';
            expect(connection.status).toBe('connecting');
            connection.status = 'ready';
            expect(connection.status).toBe('ready');
        });
        it('should clean up event listeners', () => {
            const connection = createRedisConnection();
            connection.removeAllListeners();
            expect(mockRedis.removeAllListeners).toHaveBeenCalled();
        });
        it('should support manual disconnect', () => {
            const connection = createRedisConnection();
            connection.disconnect();
            expect(mockRedis.disconnect).toHaveBeenCalled();
        });
    });
    describe('Singleton Reset', () => {
        it('should allow singleton reset in test environments', () => {
            // Get the singleton instance
            const client1 = getRedisClient();
            // Reset the singleton (this would be exposed for testing)
            // In actual implementation, you might expose a reset method for testing
            global.__resetRedisClient = () => {
                getRedisClient.instance = null;
            };
            if (global.__resetRedisClient) {
                global.__resetRedisClient();
            }
            // Get a new instance
            const client2 = getRedisClient();
            // Should have created a new Redis instance
            expect(MockedRedis).toHaveBeenCalledTimes(2);
        });
    });
});
//# sourceMappingURL=redis-connection.test.js.map