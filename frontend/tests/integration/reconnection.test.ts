import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconnectionManager } from '../../src/services/reconnection';

describe('Reconnection with Exponential Backoff', () => {
  let reconnectionManager: ReconnectionManager;
  let mockConnect: () => Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockConnect = vi.fn().mockResolvedValue(undefined);
    reconnectionManager = new ReconnectionManager(mockConnect, {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    reconnectionManager.stop();
  });

  it('should apply exponential backoff on reconnection attempts', async () => {
    mockConnect = vi.fn().mockRejectedValue(new Error('Connection failed'));
    reconnectionManager = new ReconnectionManager(mockConnect, {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      factor: 2
    });

    const attemptPromise = reconnectionManager.start();

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

    await expect(attemptPromise).rejects.toThrow('Max reconnection attempts reached');
  });

  it('should reset delay on successful connection', async () => {
    let attemptCount = 0;
    mockConnect = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount <= 2) {
        return Promise.reject(new Error('Connection failed'));
      }
      return Promise.resolve();
    });

    reconnectionManager = new ReconnectionManager(mockConnect, {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 10000,
      factor: 2
    });

    await reconnectionManager.start();

    expect(mockConnect).toHaveBeenCalledTimes(3);
    expect(reconnectionManager.getCurrentDelay()).toBe(1000); // Reset to initial
  });

  it('should respect max delay limit', async () => {
    mockConnect = vi.fn().mockRejectedValue(new Error('Connection failed'));
    reconnectionManager = new ReconnectionManager(mockConnect, {
      maxRetries: 10,
      initialDelay: 1000,
      maxDelay: 5000,
      factor: 2
    });

    const attemptPromise = reconnectionManager.start();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000); // 1000ms
    await vi.advanceTimersByTimeAsync(2000); // 2000ms
    await vi.advanceTimersByTimeAsync(4000); // 4000ms
    await vi.advanceTimersByTimeAsync(5000); // Should cap at 5000ms
    await vi.advanceTimersByTimeAsync(5000); // Should stay at 5000ms

    expect(reconnectionManager.getCurrentDelay()).toBeLessThanOrEqual(5000);
  });

  it('should handle jitter in delays', () => {
    reconnectionManager = new ReconnectionManager(mockConnect, {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2,
      jitter: true
    });

    const delay1 = reconnectionManager.getNextDelay();
    const delay2 = reconnectionManager.getNextDelay();

    // With jitter, delays should vary slightly
    expect(delay1).toBeGreaterThanOrEqual(900);
    expect(delay1).toBeLessThanOrEqual(1100);
    expect(delay2).toBeGreaterThanOrEqual(1800);
    expect(delay2).toBeLessThanOrEqual(2200);
  });
});
