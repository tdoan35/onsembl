/**
 * Tests for trace collection and storage operations
 */

const { EventEmitter } = require('events');
const { pino } = require('pino');
const { TraceCollector } = require('../src/collector');

// Mock types based on agent-protocol
type TraceType = 'LLM_PROMPT' | 'TOOL_CALL' | 'RESPONSE';

interface TraceEntry {
  id: string;
  commandId: string;
  agentId: string;
  parentId: string | null;
  type: TraceType;
  name: string;
  content: Record<string, any>;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  tokensUsed?: number;
  children?: TraceEntry[];
}

// Mock storage implementation for testing
class MockTraceStorage implements TraceStorage {
  private traces = new Map<string, TraceEntry>();
  private commandTraces = new Map<string, TraceEntry[]>();
  private agentTraces = new Map<string, TraceEntry[]>();

  async store(trace: TraceEntry): Promise<void> {
    this.traces.set(trace.id, trace);

    // Update command index
    if (!this.commandTraces.has(trace.commandId)) {
      this.commandTraces.set(trace.commandId, []);
    }
    const cmdTraces = this.commandTraces.get(trace.commandId)!;
    const existingIndex = cmdTraces.findIndex(t => t.id === trace.id);
    if (existingIndex >= 0) {
      cmdTraces[existingIndex] = trace;
    } else {
      cmdTraces.push(trace);
    }

    // Update agent index
    if (!this.agentTraces.has(trace.agentId)) {
      this.agentTraces.set(trace.agentId, []);
    }
    const agentTraceList = this.agentTraces.get(trace.agentId)!;
    const agentIndex = agentTraceList.findIndex(t => t.id === trace.id);
    if (agentIndex >= 0) {
      agentTraceList[agentIndex] = trace;
    } else {
      agentTraceList.push(trace);
    }
  }

  async get(traceId: string): Promise<TraceEntry | null> {
    return this.traces.get(traceId) || null;
  }

  async getByCommand(commandId: string): Promise<TraceEntry[]> {
    return this.commandTraces.get(commandId) || [];
  }

  async getByAgent(agentId: string, limit?: number): Promise<TraceEntry[]> {
    const traces = this.agentTraces.get(agentId) || [];
    return limit ? traces.slice(0, limit) : traces;
  }

  async search(filter: TraceFilter, limit = 50, offset = 0): Promise<TraceEntry[]> {
    let results = Array.from(this.traces.values());

    // Apply filters
    if (filter.commandId) {
      results = results.filter(t => t.commandId === filter.commandId);
    }
    if (filter.agentId) {
      results = results.filter(t => t.agentId === filter.agentId);
    }
    if (filter.traceType) {
      results = results.filter(t => t.type === filter.traceType);
    }
    if (filter.name) {
      results = results.filter(t => t.name.includes(filter.name!));
    }
    if (filter.dateRange) {
      results = results.filter(t =>
        t.startedAt >= filter.dateRange!.from && t.startedAt <= filter.dateRange!.to
      );
    }
    if (filter.durationRange) {
      results = results.filter(t =>
        (t.durationMs || 0) >= filter.durationRange!.min &&
        (t.durationMs || 0) <= filter.durationRange!.max
      );
    }
    if (filter.hasError !== undefined) {
      results = results.filter(t => {
        const hasError = !t.completedAt && (t.durationMs || 0) > 0;
        return hasError === filter.hasError;
      });
    }
    if (filter.parentId) {
      results = results.filter(t => t.parentId === filter.parentId);
    }

    // Apply pagination
    return results.slice(offset, offset + limit);
  }

  async delete(traceId: string): Promise<boolean> {
    const trace = this.traces.get(traceId);
    if (!trace) return false;

    this.traces.delete(traceId);

    // Remove from command index
    const cmdTraces = this.commandTraces.get(trace.commandId);
    if (cmdTraces) {
      const index = cmdTraces.findIndex(t => t.id === traceId);
      if (index >= 0) {
        cmdTraces.splice(index, 1);
      }
    }

    // Remove from agent index
    const agentTraceList = this.agentTraces.get(trace.agentId);
    if (agentTraceList) {
      const index = agentTraceList.findIndex(t => t.id === traceId);
      if (index >= 0) {
        agentTraceList.splice(index, 1);
      }
    }

    return true;
  }

  async cleanup(olderThanMs: number): Promise<number> {
    let cleanedCount = 0;
    const cutoffTime = Date.now() - olderThanMs;

    for (const [traceId, trace] of this.traces.entries()) {
      if (trace.startedAt < cutoffTime) {
        await this.delete(traceId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  clear(): void {
    this.traces.clear();
    this.commandTraces.clear();
    this.agentTraces.clear();
  }
}

describe('TraceCollector', () => {
  let collector: TraceCollector;
  let storage: MockTraceStorage;
  let logger: ReturnType<typeof pino>;

  const mockTrace = (overrides: Partial<TraceEntry> = {}): TraceEntry => ({
    id: `trace-${Math.random().toString(36).substr(2, 9)}`,
    commandId: 'cmd-123',
    agentId: 'agent-456',
    parentId: null,
    type: 'LLM_PROMPT',
    name: 'test-trace',
    content: { prompt: 'test prompt' },
    startedAt: Date.now(),
    completedAt: Date.now() + 1000,
    durationMs: 1000,
    tokensUsed: 100,
    ...overrides
  });

  beforeEach(() => {
    storage = new MockTraceStorage();
    logger = pino({ level: 'silent' });
    collector = new TraceCollector(storage, logger);
  });

  afterEach(() => {
    storage.clear();
    collector.removeAllListeners();
  });

  describe('constructor', () => {
    it('should create collector with default config', () => {
      expect(collector).toBeInstanceOf(TraceCollector);
      expect(collector).toBeInstanceOf(EventEmitter);
    });

    it('should create collector with custom config', () => {
      const config: Partial<TraceCollectorConfig> = {
        maxTraceDepth: 10,
        maxTracesPerCommand: 500,
        retentionPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
        enableRealTimeAnalysis: false
      };

      const customCollector = new TraceCollector(storage, logger, config);
      expect(customCollector).toBeInstanceOf(TraceCollector);
    });
  });

  describe('addTrace', () => {
    it('should add trace successfully', async () => {
      const trace = mockTrace();
      const traceAddedPromise = new Promise<EnhancedTraceEntry>((resolve) => {
        collector.once('trace:added', resolve);
      });

      await collector.addTrace(trace);

      const storedTrace = await storage.get(trace.id);
      expect(storedTrace).toEqual(trace);

      const addedTrace = await traceAddedPromise;
      expect(addedTrace.id).toBe(trace.id);
      expect(addedTrace.depth).toBe(0);
      expect(addedTrace.isRoot).toBe(true);
      expect(addedTrace.childCount).toBe(0);
    });

    it('should handle parent-child relationships', async () => {
      const parentTrace = mockTrace({ id: 'parent', name: 'parent' });
      const childTrace = mockTrace({ id: 'child', parentId: 'parent', name: 'child' });

      await collector.addTrace(parentTrace);
      await collector.addTrace(childTrace);

      const storedChild = await storage.get('child');
      expect(storedChild?.parentId).toBe('parent');
    });

    it('should calculate trace depth correctly', async () => {
      const rootTrace = mockTrace({ id: 'root', name: 'root' });
      const childTrace = mockTrace({ id: 'child', parentId: 'root', name: 'child' });
      const grandchildTrace = mockTrace({ id: 'grandchild', parentId: 'child', name: 'grandchild' });

      await collector.addTrace(rootTrace);
      await collector.addTrace(childTrace);

      const childAddedPromise = new Promise<EnhancedTraceEntry>((resolve) => {
        collector.once('trace:added', resolve);
      });

      await collector.addTrace(grandchildTrace);

      const addedGrandchild = await childAddedPromise;
      expect(addedGrandchild.depth).toBe(2);
    });

    it('should reject traces exceeding max depth', async () => {
      const config: Partial<TraceCollectorConfig> = { maxTraceDepth: 2 };
      const limitedCollector = new TraceCollector(storage, logger, config);

      const rootTrace = mockTrace({ id: 'root' });
      const childTrace = mockTrace({ id: 'child', parentId: 'root' });
      const grandchildTrace = mockTrace({ id: 'grandchild', parentId: 'child' });
      const greatGrandchildTrace = mockTrace({ id: 'great-grandchild', parentId: 'grandchild' });

      await limitedCollector.addTrace(rootTrace);
      await limitedCollector.addTrace(childTrace);
      await limitedCollector.addTrace(grandchildTrace);

      // This should be rejected due to depth limit
      await limitedCollector.addTrace(greatGrandchildTrace);

      const stored = await storage.get('great-grandchild');
      expect(stored).toBeNull();
    });

    it('should enforce max traces per command limit', async () => {
      const config: Partial<TraceCollectorConfig> = { maxTracesPerCommand: 3 };
      const limitedCollector = new TraceCollector(storage, logger, config);

      const traces = [
        mockTrace({ id: 'trace1', name: 'trace1' }),
        mockTrace({ id: 'trace2', name: 'trace2' }),
        mockTrace({ id: 'trace3', name: 'trace3' }),
        mockTrace({ id: 'trace4', name: 'trace4' })
      ];

      for (const trace of traces) {
        await limitedCollector.addTrace(trace);
      }

      const commandTraces = await storage.getByCommand('cmd-123');
      expect(commandTraces).toHaveLength(3); // Should not exceed limit
      expect(commandTraces.find(t => t.id === 'trace1')).toBeUndefined(); // First trace should be removed
      expect(commandTraces.find(t => t.id === 'trace4')).toBeDefined(); // Latest trace should be kept
    });

    it('should setup command timer for first trace', async () => {
      const trace = mockTrace();

      await collector.addTrace(trace);

      // Verify timer is set (indirectly by checking active commands)
      const aggregation = await collector.getCommandAggregation('cmd-123');
      expect(aggregation).toBeDefined();
    });

    it('should emit error event on failure', async () => {
      const errorStorage: TraceStorage = {
        store: jest.fn().mockRejectedValue(new Error('Storage error')),
        get: jest.fn(),
        getByCommand: jest.fn(),
        getByAgent: jest.fn(),
        search: jest.fn(),
        delete: jest.fn(),
        cleanup: jest.fn()
      };

      const errorCollector = new TraceCollector(errorStorage, logger);
      const errorPromise = new Promise<Error>((resolve) => {
        errorCollector.once('trace:error', resolve);
      });

      const trace = mockTrace();
      await expect(errorCollector.addTrace(trace)).rejects.toThrow('Storage error');

      const error = await errorPromise;
      expect(error.message).toBe('Storage error');
    });
  });

  describe('updateTrace', () => {
    it('should update existing trace', async () => {
      const trace = mockTrace({ name: 'original' });
      await collector.addTrace(trace);

      const updatePromise = new Promise<EnhancedTraceEntry>((resolve) => {
        collector.once('trace:updated', resolve);
      });

      await collector.updateTrace(trace.id, { name: 'updated', durationMs: 2000 });

      const updatedTrace = await storage.get(trace.id);
      expect(updatedTrace?.name).toBe('updated');
      expect(updatedTrace?.durationMs).toBe(2000);

      const emittedUpdate = await updatePromise;
      expect(emittedUpdate.name).toBe('updated');
    });

    it('should throw error for non-existent trace', async () => {
      await expect(collector.updateTrace('non-existent', { name: 'updated' }))
        .rejects.toThrow('Trace non-existent not found');
    });

    it('should preserve trace ID during update', async () => {
      const trace = mockTrace();
      await collector.addTrace(trace);

      await collector.updateTrace(trace.id, { id: 'different-id' as any });

      const updatedTrace = await storage.get(trace.id);
      expect(updatedTrace?.id).toBe(trace.id); // Should not change
    });

    it('should check command completion after update', async () => {
      const trace = mockTrace({ completedAt: undefined });
      await collector.addTrace(trace);

      const completionPromise = new Promise<TraceAggregation>((resolve) => {
        collector.once('trace:completed', resolve);
      });

      await collector.updateTrace(trace.id, { completedAt: Date.now() });

      const aggregation = await completionPromise;
      expect(aggregation.commandId).toBe(trace.commandId);
    });
  });

  describe('getCommandAggregation', () => {
    it('should return null for non-existent command', async () => {
      const aggregation = await collector.getCommandAggregation('non-existent');
      expect(aggregation).toBeNull();
    });

    it('should return aggregation for existing command', async () => {
      const trace1 = mockTrace({ id: 'trace1', durationMs: 500, tokensUsed: 50 });
      const trace2 = mockTrace({ id: 'trace2', durationMs: 300, tokensUsed: 30 });

      await collector.addTrace(trace1);
      await collector.addTrace(trace2);

      const aggregation = await collector.getCommandAggregation('cmd-123');

      expect(aggregation).toBeDefined();
      expect(aggregation!.commandId).toBe('cmd-123');
      expect(aggregation!.tree.totalDuration).toBe(800);
      expect(aggregation!.tree.totalTokens).toBe(80);
      expect(aggregation!.stats.totalTraces).toBe(2);
    });

    it('should include performance analysis when enabled', async () => {
      const config: Partial<TraceCollectorConfig> = { enableRealTimeAnalysis: true };
      const analyticCollector = new TraceCollector(storage, logger, config);

      const trace = mockTrace();
      await analyticCollector.addTrace(trace);

      const aggregation = await analyticCollector.getCommandAggregation('cmd-123');

      expect(aggregation?.analysis).toBeDefined();
    });
  });

  describe('searchTraces', () => {
    beforeEach(async () => {
      const traces = [
        mockTrace({ id: 'trace1', name: 'fast-trace', type: 'LLM_PROMPT', durationMs: 100 }),
        mockTrace({ id: 'trace2', name: 'slow-trace', type: 'TOOL_CALL', durationMs: 2000 }),
        mockTrace({ id: 'trace3', name: 'error-trace', type: 'RESPONSE', completedAt: undefined, durationMs: 1000 }),
        mockTrace({ id: 'trace4', commandId: 'cmd-456', name: 'other-command', type: 'LLM_PROMPT' })
      ];

      for (const trace of traces) {
        await collector.addTrace(trace);
      }
    });

    it('should search by command ID', async () => {
      const results = await collector.searchTraces({ commandId: 'cmd-456' });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('other-command');
    });

    it('should search by trace type', async () => {
      const results = await collector.searchTraces({ traceType: 'LLM_PROMPT' });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.type === 'LLM_PROMPT')).toBe(true);
    });

    it('should search by name', async () => {
      const results = await collector.searchTraces({ name: 'slow' });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('slow-trace');
    });

    it('should search by duration range', async () => {
      const results = await collector.searchTraces({
        durationRange: { min: 500, max: 1500 }
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('error-trace');
    });

    it('should search by error status', async () => {
      const errorResults = await collector.searchTraces({ hasError: true });
      const successResults = await collector.searchTraces({ hasError: false });

      expect(errorResults).toHaveLength(1);
      expect(errorResults[0].name).toBe('error-trace');
      expect(successResults).toHaveLength(3);
    });

    it('should apply limit and offset', async () => {
      const firstPage = await collector.searchTraces({}, 2, 0);
      const secondPage = await collector.searchTraces({}, 2, 2);

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
    });
  });

  describe('getAgentStats', () => {
    it('should return stats for agent', async () => {
      const traces = [
        mockTrace({ durationMs: 100, tokensUsed: 10 }),
        mockTrace({ durationMs: 200, tokensUsed: 20 }),
        mockTrace({ durationMs: 300, tokensUsed: 30 })
      ];

      for (const trace of traces) {
        await collector.addTrace(trace);
      }

      const stats = await collector.getAgentStats('agent-456');

      expect(stats.totalTraces).toBe(3);
      expect(stats.totalDuration).toBe(600);
      expect(stats.totalTokens).toBe(60);
      expect(stats.averageDuration).toBe(200);
      expect(stats.averageTokens).toBe(20);
    });

    it('should respect limit parameter', async () => {
      const traces = Array.from({ length: 10 }, (_, i) =>
        mockTrace({ id: `trace-${i}` })
      );

      for (const trace of traces) {
        await collector.addTrace(trace);
      }

      const stats = await collector.getAgentStats('agent-456', 5);

      expect(stats.totalTraces).toBe(5); // Limited to 5
    });
  });

  describe('cleanup', () => {
    it('should clean up old traces', async () => {
      const oldTime = Date.now() - 1000000; // Very old
      const recentTime = Date.now() - 1000; // Recent

      const oldTrace = mockTrace({ id: 'old', startedAt: oldTime });
      const recentTrace = mockTrace({ id: 'recent', startedAt: recentTime });

      await collector.addTrace(oldTrace);
      await collector.addTrace(recentTrace);

      const cleanedCount = await collector.cleanup();

      expect(cleanedCount).toBe(1);
      expect(await storage.get('old')).toBeNull();
      expect(await storage.get('recent')).toBeDefined();
    });

    it('should return count of cleaned traces', async () => {
      const oldTraces = Array.from({ length: 5 }, (_, i) =>
        mockTrace({ id: `old-${i}`, startedAt: Date.now() - 100000000 })
      );

      for (const trace of oldTraces) {
        await collector.addTrace(trace);
      }

      const cleanedCount = await collector.cleanup();

      expect(cleanedCount).toBe(5);
    });
  });

  describe('subscribeToCommand', () => {
    it('should emit updates for specific command', async () => {
      const subscription = collector.subscribeToCommand('cmd-123');
      const updates: any[] = [];

      subscription.on('update', (update) => {
        updates.push(update);
      });

      const trace = mockTrace();
      await collector.addTrace(trace);

      expect(updates).toHaveLength(1);
      expect(updates[0].type).toBe('ADDED');
      expect(updates[0].commandId).toBe('cmd-123');
      expect(updates[0].traceEntry.id).toBe(trace.id);
    });

    it('should emit completion event', async () => {
      const subscription = collector.subscribeToCommand('cmd-123');
      const completionPromise = new Promise<TraceAggregation>((resolve) => {
        subscription.on('completed', resolve);
      });

      const trace = mockTrace({ completedAt: Date.now() });
      await collector.addTrace(trace);

      const aggregation = await completionPromise;
      expect(aggregation.commandId).toBe('cmd-123');
    });

    it('should not emit updates for other commands', async () => {
      const subscription = collector.subscribeToCommand('cmd-456');
      const updates: any[] = [];

      subscription.on('update', (update) => {
        updates.push(update);
      });

      const trace = mockTrace({ commandId: 'cmd-123' });
      await collector.addTrace(trace);

      expect(updates).toHaveLength(0);
    });

    it('should allow unsubscribing', async () => {
      const subscription = collector.subscribeToCommand('cmd-123');
      const updates: any[] = [];

      subscription.on('update', (update) => {
        updates.push(update);
      });

      // Unsubscribe
      subscription.emit('unsubscribe');

      const trace = mockTrace();
      await collector.addTrace(trace);

      expect(updates).toHaveLength(0); // No updates after unsubscribe
    });
  });

  describe('command completion detection', () => {
    it('should detect completion when all traces are completed', async () => {
      const completionPromise = new Promise<string>((resolve) => {
        collector.once('command:completed', resolve);
      });

      const trace1 = mockTrace({ id: 'trace1', completedAt: Date.now() });
      const trace2 = mockTrace({ id: 'trace2', completedAt: Date.now() });

      await collector.addTrace(trace1);
      await collector.addTrace(trace2);

      const completedCommandId = await completionPromise;
      expect(completedCommandId).toBe('cmd-123');
    });

    it('should handle force completion via timer', async () => {
      jest.useFakeTimers();

      const completionPromise = new Promise<string>((resolve) => {
        collector.once('command:completed', resolve);
      });

      const trace = mockTrace({ completedAt: undefined }); // Not completed
      await collector.addTrace(trace);

      // Fast-forward timer to trigger completion
      jest.advanceTimersByTime(30000);

      const completedCommandId = await completionPromise;
      expect(completedCommandId).toBe('cmd-123');

      jest.useRealTimers();
    });

    it('should clean up active commands and timers on completion', async () => {
      const trace = mockTrace({ completedAt: Date.now() });
      await collector.addTrace(trace);

      // Wait for completion
      await new Promise<void>((resolve) => {
        collector.once('command:completed', () => resolve());
      });

      // Subsequent aggregation should still work but won't find active command
      const aggregation = await collector.getCommandAggregation('cmd-123');
      expect(aggregation).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      const errorStorage: TraceStorage = {
        store: jest.fn().mockRejectedValue(new Error('Storage error')),
        get: jest.fn(),
        getByCommand: jest.fn(),
        getByAgent: jest.fn(),
        search: jest.fn(),
        delete: jest.fn(),
        cleanup: jest.fn()
      };

      const errorCollector = new TraceCollector(errorStorage, logger);

      const errorPromise = new Promise<Error>((resolve) => {
        errorCollector.once('trace:error', resolve);
      });

      const trace = mockTrace();
      await expect(errorCollector.addTrace(trace)).rejects.toThrow();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
    });

    it('should emit error events with trace ID when available', async () => {
      const errorStorage: TraceStorage = {
        store: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockRejectedValue(new Error('Get error')),
        getByCommand: jest.fn(),
        getByAgent: jest.fn(),
        search: jest.fn(),
        delete: jest.fn(),
        cleanup: jest.fn()
      };

      const errorCollector = new TraceCollector(errorStorage, logger);

      const errorPromise = new Promise<{ error: Error; traceId?: string }>((resolve) => {
        errorCollector.once('trace:error', (error, traceId) => resolve({ error, traceId }));
      });

      await expect(errorCollector.updateTrace('test-id', { name: 'updated' }))
        .rejects.toThrow();

      const { error, traceId } = await errorPromise;
      expect(error.message).toBe('Get error');
      expect(traceId).toBe('test-id');
    });
  });

  describe('enhanced trace properties', () => {
    it('should calculate trace path correctly', async () => {
      const rootTrace = mockTrace({ id: 'root', name: 'root' });
      const childTrace = mockTrace({ id: 'child', parentId: 'root', name: 'child' });
      const grandchildTrace = mockTrace({ id: 'grandchild', parentId: 'child', name: 'grandchild' });

      await collector.addTrace(rootTrace);
      await collector.addTrace(childTrace);

      const traceAddedPromise = new Promise<EnhancedTraceEntry>((resolve) => {
        collector.once('trace:added', resolve);
      });

      await collector.addTrace(grandchildTrace);

      const enhancedGrandchild = await traceAddedPromise;
      expect(enhancedGrandchild.path).toBe('root → child → grandchild');
    });

    it('should count children correctly', async () => {
      const parentTrace = mockTrace({ id: 'parent', name: 'parent' });
      const child1 = mockTrace({ id: 'child1', parentId: 'parent', name: 'child1' });
      const child2 = mockTrace({ id: 'child2', parentId: 'parent', name: 'child2' });

      await collector.addTrace(parentTrace);
      await collector.addTrace(child1);

      const traceAddedPromise = new Promise<EnhancedTraceEntry>((resolve) => {
        collector.once('trace:added', resolve);
      });

      await collector.addTrace(child2);

      // The enhanced parent should show updated child count
      const enhancedChild2 = await traceAddedPromise;
      expect(enhancedChild2.childCount).toBe(0); // child2 has no children
    });

    it('should identify root traces correctly', async () => {
      const rootTrace = mockTrace({ parentId: null });
      const childTrace = mockTrace({ parentId: rootTrace.id });

      const rootAddedPromise = new Promise<EnhancedTraceEntry>((resolve) => {
        collector.once('trace:added', resolve);
      });

      await collector.addTrace(rootTrace);
      const enhancedRoot = await rootAddedPromise;

      const childAddedPromise = new Promise<EnhancedTraceEntry>((resolve) => {
        collector.once('trace:added', resolve);
      });

      await collector.addTrace(childTrace);
      const enhancedChild = await childAddedPromise;

      expect(enhancedRoot.isRoot).toBe(true);
      expect(enhancedChild.isRoot).toBe(false);
    });
  });
});

// Prevent TypeScript from generating export statement
(global as any).exports = exports;