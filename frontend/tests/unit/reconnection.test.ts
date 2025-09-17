import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconnectionManager } from '../../src/services/reconnection';

describe('ReconnectionManager', () => {
  let manager: ReconnectionManager;
  let mockConnect: () => Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockConnect = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (manager) {
      manager.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      manager = new ReconnectionManager(mockConnect);

      expect(manager.getOptions()).toEqual({
        maxRetries: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        factor: 2,
        jitter: true
      });
    });

    it('should accept custom options', () => {
      manager = new ReconnectionManager(mockConnect, {
        maxRetries: 3,
        initialDelay: 500,
        maxDelay: 10000,
        factor: 1.5,
        jitter: false
      });

      const options = manager.getOptions();
      expect(options.maxRetries).toBe(3);
      expect(options.initialDelay).toBe(500);
      expect(options.maxDelay).toBe(10000);
      expect(options.factor).toBe(1.5);
      expect(options.jitter).toBe(false);
    });
  });

  describe('start', () => {
    it('should attempt connection immediately', async () => {
      mockConnect = vi.fn().mockResolvedValue(undefined);
      manager = new ReconnectionManager(mockConnect);

      const promise = manager.start();
      await vi.runAllTimersAsync();
      await promise;

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(manager.getAttempts()).toBe(0); // Reset after success
    });

    it('should retry on failure', async () => {
      mockConnect = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      manager = new ReconnectionManager(mockConnect, {
        initialDelay: 1000,
        maxRetries: 3
      });

      const promise = manager.start();

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(mockConnect).toHaveBeenCalledTimes(1);

      // Wait for retry delay and second attempt
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(manager.getAttempts()).toBe(0); // Reset after success
    });

    it('should throw after max retries', async () => {
      mockConnect = vi.fn().mockRejectedValue(new Error('Failed'));

      manager = new ReconnectionManager(mockConnect, {
        maxRetries: 2,
        initialDelay: 100
      });

      const promise = manager.start();

      // First attempt
      await vi.advanceTimersByTimeAsync(0);
      expect(mockConnect).toHaveBeenCalledTimes(1);

      // Second attempt
      await vi.advanceTimersByTimeAsync(100);
      expect(mockConnect).toHaveBeenCalledTimes(2);

      // Third attempt
      await vi.advanceTimersByTimeAsync(200);
      expect(mockConnect).toHaveBeenCalledTimes(3);

      await expect(promise).rejects.toThrow('Max reconnection attempts reached');
    });

    it('should not start if already running', async () => {
      mockConnect = vi.fn().mockResolvedValue(undefined);
      manager = new ReconnectionManager(mockConnect);

      const promise1 = manager.start();
      const promise2 = manager.start();

      await vi.runAllTimersAsync();

      expect(promise1).toBe(promise2); // Same promise returned
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should cancel ongoing reconnection', async () => {
      mockConnect = vi.fn().mockRejectedValue(new Error('Failed'));

      manager = new ReconnectionManager(mockConnect, {
        maxRetries: 10,
        initialDelay: 1000
      });

      const promise = manager.start();

      // First attempt
      await vi.advanceTimersByTimeAsync(0);
      expect(mockConnect).toHaveBeenCalledTimes(1);

      // Stop before second attempt
      manager.stop();

      // Advance time to when second attempt would happen
      await vi.advanceTimersByTimeAsync(1000);

      // No second attempt should be made
      expect(mockConnect).toHaveBeenCalledTimes(1);
      await expect(promise).rejects.toThrow('Reconnection cancelled');
    });
  });

  describe('exponential backoff', () => {
    it('should increase delay exponentially', async () => {
      mockConnect = vi.fn().mockRejectedValue(new Error('Failed'));

      manager = new ReconnectionManager(mockConnect, {
        initialDelay: 1000,
        factor: 2,
        maxDelay: 10000,
        maxRetries: 5,
        jitter: false // Disable jitter for predictable delays
      });

      const promise = manager.start();

      // First attempt - immediate
      await vi.advanceTimersByTimeAsync(0);
      expect(mockConnect).toHaveBeenCalledTimes(1);

      // Second attempt - 1000ms delay
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockConnect).toHaveBeenCalledTimes(2);

      // Third attempt - 2000ms delay
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockConnect).toHaveBeenCalledTimes(3);

      // Fourth attempt - 4000ms delay
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockConnect).toHaveBeenCalledTimes(4);

      // Fifth attempt - 8000ms delay
      await vi.advanceTimersByTimeAsync(8000);
      expect(mockConnect).toHaveBeenCalledTimes(5);

      // Cleanup
      manager.stop();
      try {
        await promise;
      } catch {}
    });

    it('should respect max delay', async () => {
      mockConnect = vi.fn().mockRejectedValue(new Error('Failed'));

      manager = new ReconnectionManager(mockConnect, {
        initialDelay: 1000,
        factor: 10,
        maxDelay: 5000,
        maxRetries: 3,
        jitter: false
      });

      const promise = manager.start();

      // First attempt
      await vi.advanceTimersByTimeAsync(0);

      // Second attempt - 1000ms
      await vi.advanceTimersByTimeAsync(1000);

      // Third attempt - should be capped at 5000ms, not 10000ms
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockConnect).toHaveBeenCalledTimes(3);

      // Cleanup
      manager.stop();
      try {
        await promise;
      } catch {}
    });
  });

  describe('jitter', () => {
    it('should add jitter to delays when enabled', () => {
      manager = new ReconnectionManager(mockConnect, {
        initialDelay: 1000,
        jitter: true
      });

      const delays: number[] = [];
      for (let i = 0; i < 10; i++) {
        manager.reset();
        delays.push(manager.getNextDelay());
      }

      // Check that delays vary (with jitter)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // Check delays are within expected range (±10%)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(900);
        expect(delay).toBeLessThanOrEqual(1100);
      });
    });

    it('should not add jitter when disabled', () => {
      manager = new ReconnectionManager(mockConnect, {
        initialDelay: 1000,
        jitter: false
      });

      const delays: number[] = [];
      for (let i = 0; i < 5; i++) {
        manager.reset();
        delays.push(manager.getNextDelay());
      }

      // All delays should be identical
      expect(new Set(delays).size).toBe(1);
      expect(delays[0]).toBe(1000);
    });
  });

  describe('reset', () => {
    it('should reset attempt counter and delay', async () => {
      mockConnect = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      manager = new ReconnectionManager(mockConnect, {
        initialDelay: 1000,
        factor: 2,
        jitter: false
      });

      // Start and fail twice
      const promise = manager.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

      expect(manager.getAttempts()).toBe(2);
      expect(manager.getCurrentDelay()).toBe(2000);

      // Manual reset
      manager.reset();
      expect(manager.getAttempts()).toBe(0);
      expect(manager.getCurrentDelay()).toBe(1000);

      // Cleanup
      manager.stop();
      try {
        await promise;
      } catch {}
    });
  });

  describe('isRunning', () => {
    it('should return correct running state', async () => {
      mockConnect = vi.fn().mockResolvedValue(undefined);
      manager = new ReconnectionManager(mockConnect);

      expect(manager.isRunning()).toBe(false);

      const promise = manager.start();
      expect(manager.isRunning()).toBe(true);

      await vi.runAllTimersAsync();
      await promise;

      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', async () => {
      mockConnect = vi.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      manager = new ReconnectionManager(mockConnect, {
        initialDelay: 1000,
        jitter: false
      });

      const initialStats = manager.getStats();
      expect(initialStats).toEqual({
        attempts: 0,
        currentDelay: 1000,
        isRunning: false,
        lastError: null
      });

      const promise = manager.start();

      // After first failure
      await vi.advanceTimersByTimeAsync(0);

      const statsAfterFailure = manager.getStats();
      expect(statsAfterFailure.attempts).toBe(1);
      expect(statsAfterFailure.currentDelay).toBe(1000);
      expect(statsAfterFailure.isRunning).toBe(true);
      expect(statsAfterFailure.lastError).toBeInstanceOf(Error);

      // Complete successfully
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      const finalStats = manager.getStats();
      expect(finalStats.attempts).toBe(0); // Reset after success
      expect(finalStats.isRunning).toBe(false);
    });
  });
});