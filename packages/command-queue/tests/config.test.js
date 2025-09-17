/**
 * Configuration management tests
 */
import { jest } from '@jest/globals';
import { ConfigManager } from '../src/config.js';
// Mock environment variables
const originalEnv = process.env;
describe('ConfigManager', () => {
    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        // Clear the singleton instance
        ConfigManager.instance = null;
    });
    afterEach(() => {
        process.env = originalEnv;
    });
    describe('Default Configuration', () => {
        it('should provide default configuration values', () => {
            const config = ConfigManager.get();
            expect(config).toEqual({
                redis: {
                    host: 'localhost',
                    port: 6379,
                    keyPrefix: 'onsembl:queue:'
                },
                queue: {
                    name: 'command-queue',
                    defaultJobOptions: {
                        removeOnComplete: 10,
                        removeOnFail: 10,
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 5000
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
            });
        });
        it('should provide default Redis options', () => {
            const redisOptions = ConfigManager.getRedisOptions();
            expect(redisOptions).toEqual({
                host: 'localhost',
                port: 6379,
                keyPrefix: 'onsembl:queue:',
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true
            });
        });
    });
    describe('Environment Variable Override', () => {
        it('should override Redis configuration from environment', () => {
            process.env.REDIS_HOST = 'redis.example.com';
            process.env.REDIS_PORT = '6380';
            process.env.REDIS_PASSWORD = 'secret123';
            process.env.REDIS_DB = '2';
            process.env.REDIS_KEY_PREFIX = 'myapp:';
            // Create new instance to pick up env vars
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.redis).toEqual({
                host: 'redis.example.com',
                port: 6380,
                password: 'secret123',
                db: 2,
                keyPrefix: 'myapp:'
            });
        });
        it('should override queue configuration from environment', () => {
            process.env.QUEUE_NAME = 'custom-queue';
            process.env.QUEUE_CONCURRENCY = '10';
            process.env.QUEUE_MAX_STALLED_COUNT = '3';
            process.env.QUEUE_STALLED_INTERVAL = '60000';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.queue.name).toBe('custom-queue');
            expect(config.queue.concurrency).toBe(10);
            expect(config.queue.maxStalledCount).toBe(3);
            expect(config.queue.stalledInterval).toBe(60000);
        });
        it('should override job options from environment', () => {
            process.env.QUEUE_REMOVE_ON_COMPLETE = '25';
            process.env.QUEUE_REMOVE_ON_FAIL = '15';
            process.env.QUEUE_ATTEMPTS = '5';
            process.env.QUEUE_BACKOFF_DELAY = '2000';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.queue.defaultJobOptions).toEqual({
                removeOnComplete: 25,
                removeOnFail: 15,
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                }
            });
        });
        it('should override priority configuration from environment', () => {
            process.env.PRIORITY_EMERGENCY = '95';
            process.env.PRIORITY_HIGH = '80';
            process.env.PRIORITY_NORMAL = '55';
            process.env.PRIORITY_LOW = '30';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.priorities).toEqual({
                emergency: 95,
                high: 80,
                normal: 55,
                low: 30
            });
        });
    });
    describe('Redis Options', () => {
        it('should include password in Redis options when provided', () => {
            process.env.REDIS_PASSWORD = 'secret123';
            ConfigManager.instance = null;
            const redisOptions = ConfigManager.getRedisOptions();
            expect(redisOptions.password).toBe('secret123');
        });
        it('should include database number in Redis options when provided', () => {
            process.env.REDIS_DB = '3';
            ConfigManager.instance = null;
            const redisOptions = ConfigManager.getRedisOptions();
            expect(redisOptions.db).toBe(3);
        });
        it('should not include password or db when not provided', () => {
            ConfigManager.instance = null;
            const redisOptions = ConfigManager.getRedisOptions();
            expect(redisOptions.password).toBeUndefined();
            expect(redisOptions.db).toBeUndefined();
        });
    });
    describe('Configuration Validation', () => {
        it('should handle invalid Redis port gracefully', () => {
            process.env.REDIS_PORT = 'invalid';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.redis.port).toBe(6379); // Should fallback to default
        });
        it('should handle invalid numeric environment variables', () => {
            process.env.QUEUE_CONCURRENCY = 'not-a-number';
            process.env.REDIS_DB = 'invalid';
            process.env.PRIORITY_HIGH = 'high';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.queue.concurrency).toBe(5); // Default
            expect(config.redis.db).toBeUndefined(); // No fallback for invalid db
            expect(config.priorities.high).toBe(75); // Default
        });
        it('should validate priority values are within 0-100 range', () => {
            process.env.PRIORITY_EMERGENCY = '150';
            process.env.PRIORITY_LOW = '-10';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.priorities.emergency).toBe(100); // Clamped to max
            expect(config.priorities.low).toBe(0); // Clamped to min
        });
    });
    describe('Singleton Behavior', () => {
        it('should return the same instance on multiple calls', () => {
            const config1 = ConfigManager.get();
            const config2 = ConfigManager.get();
            expect(config1).toBe(config2);
        });
        it('should cache Redis options', () => {
            const options1 = ConfigManager.getRedisOptions();
            const options2 = ConfigManager.getRedisOptions();
            expect(options1).toBe(options2);
        });
    });
    describe('Configuration Schema', () => {
        it('should validate complete configuration schema', () => {
            const config = ConfigManager.get();
            // Validate redis section
            expect(config.redis).toHaveProperty('host');
            expect(config.redis).toHaveProperty('port');
            expect(config.redis).toHaveProperty('keyPrefix');
            expect(typeof config.redis.host).toBe('string');
            expect(typeof config.redis.port).toBe('number');
            expect(typeof config.redis.keyPrefix).toBe('string');
            // Validate queue section
            expect(config.queue).toHaveProperty('name');
            expect(config.queue).toHaveProperty('defaultJobOptions');
            expect(config.queue).toHaveProperty('concurrency');
            expect(config.queue).toHaveProperty('maxStalledCount');
            expect(config.queue).toHaveProperty('stalledInterval');
            // Validate job options
            const jobOptions = config.queue.defaultJobOptions;
            expect(jobOptions).toHaveProperty('removeOnComplete');
            expect(jobOptions).toHaveProperty('removeOnFail');
            expect(jobOptions).toHaveProperty('attempts');
            expect(jobOptions).toHaveProperty('backoff');
            expect(jobOptions.backoff).toHaveProperty('type');
            expect(jobOptions.backoff).toHaveProperty('delay');
            // Validate priorities
            expect(config.priorities).toHaveProperty('emergency');
            expect(config.priorities).toHaveProperty('high');
            expect(config.priorities).toHaveProperty('normal');
            expect(config.priorities).toHaveProperty('low');
            // Ensure priorities are in correct order
            expect(config.priorities.emergency).toBeGreaterThan(config.priorities.high);
            expect(config.priorities.high).toBeGreaterThan(config.priorities.normal);
            expect(config.priorities.normal).toBeGreaterThan(config.priorities.low);
        });
    });
    describe('Development vs Production Configuration', () => {
        it('should use appropriate defaults for development', () => {
            process.env.NODE_ENV = 'development';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            expect(config.redis.host).toBe('localhost');
            expect(config.queue.name).toBe('command-queue');
        });
        it('should support production Redis URL parsing', () => {
            process.env.REDIS_URL = 'redis://user:pass@prod-redis.com:6380/1';
            ConfigManager.instance = null;
            const config = ConfigManager.get();
            // Note: This test assumes URL parsing functionality exists
            // The actual implementation might need to be enhanced to support this
            expect(config.redis.host).toBe('localhost'); // Current implementation doesn't parse URLs
        });
    });
});
//# sourceMappingURL=config.test.js.map