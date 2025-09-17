/**
 * Tests for trace aggregation logic
 */

const { pino } = require('pino');
const { TraceAggregator } = require('../src/aggregator');

// Mock types based on the aggregator's local types
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

interface TraceTree {
  commandId: string;
  agentId: string;
  rootTraces: TraceEntry[];
  totalDuration: number;
  totalTokens: number;
  createdAt: number;
  updatedAt: number;
}

describe('TraceAggregator', () => {
  let aggregator: TraceAggregator;
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

  const mockTraceTree = (traces: TraceEntry[]): TraceTree => ({
    commandId: traces[0]?.commandId || 'cmd-123',
    agentId: traces[0]?.agentId || 'agent-456',
    rootTraces: traces.filter(t => !t.parentId),
    totalDuration: traces.reduce((sum, t) => sum + (t.durationMs || 0), 0),
    totalTokens: traces.reduce((sum, t) => sum + (t.tokensUsed || 0), 0),
    createdAt: Math.min(...traces.map(t => t.startedAt)),
    updatedAt: Date.now()
  });

  beforeEach(() => {
    logger = pino({ level: 'silent' });
    aggregator = new TraceAggregator(logger);
  });

  describe('constructor', () => {
    it('should create aggregator with default options', () => {
      const defaultAggregator = new TraceAggregator(logger);
      expect(defaultAggregator).toBeInstanceOf(TraceAggregator);
    });

    it('should create aggregator with custom options', () => {
      const options: AggregationOptions = {
        includePercentiles: false,
        calculateHotPaths: false,
        groupByType: false,
        timeWindowMs: 30000,
        minSampleSize: 5
      };
      const customAggregator = new TraceAggregator(logger, options);
      expect(customAggregator).toBeInstanceOf(TraceAggregator);
    });
  });

  describe('aggregateTrees', () => {
    it('should throw error for empty tree array', () => {
      expect(() => aggregator.aggregateTrees([])).toThrow('Cannot aggregate empty tree array');
    });

    it('should aggregate single tree with one trace', () => {
      const trace = mockTrace();
      const tree = mockTraceTree([trace]);

      const result = aggregator.aggregateTrees([tree]);

      expect(result.metrics.totalTraces).toBe(1);
      expect(result.metrics.totalDuration).toBe(1000);
      expect(result.metrics.totalTokens).toBe(100);
      expect(result.metrics.averageDuration).toBe(1000);
      expect(result.metrics.averageTokens).toBe(100);
      expect(result.metrics.errorRate).toBe(0);
      expect(result.summary.totalCommands).toBe(1);
      expect(result.summary.totalAgents).toBe(1);
    });

    it('should aggregate multiple trees with various trace types', () => {
      const traces1 = [
        mockTrace({ type: 'LLM_PROMPT', durationMs: 500, tokensUsed: 50 }),
        mockTrace({ type: 'TOOL_CALL', durationMs: 300, tokensUsed: 30 }),
        mockTrace({ type: 'RESPONSE', durationMs: 200, tokensUsed: 20 })
      ];
      const traces2 = [
        mockTrace({ commandId: 'cmd-456', type: 'LLM_PROMPT', durationMs: 400, tokensUsed: 40 }),
        mockTrace({ commandId: 'cmd-456', type: 'TOOL_CALL', durationMs: 600, tokensUsed: 60 })
      ];

      const tree1 = mockTraceTree(traces1);
      const tree2 = mockTraceTree(traces2);

      const result = aggregator.aggregateTrees([tree1, tree2]);

      expect(result.metrics.totalTraces).toBe(5);
      expect(result.metrics.totalDuration).toBe(2000);
      expect(result.metrics.totalTokens).toBe(200);
      expect(result.metrics.tracesByType['LLM_PROMPT']).toBe(2);
      expect(result.metrics.tracesByType['TOOL_CALL']).toBe(2);
      expect(result.metrics.tracesByType['RESPONSE']).toBe(1);
      expect(result.summary.totalCommands).toBe(2);
    });

    it('should calculate error metrics correctly', () => {
      const traces = [
        mockTrace({ completedAt: Date.now() + 1000 }), // Success
        mockTrace({ completedAt: undefined, durationMs: 1000 }), // Error
        mockTrace({ completedAt: Date.now() + 500 }), // Success
        mockTrace({ completedAt: undefined, durationMs: 0 }) // Incomplete
      ];

      const tree = mockTraceTree(traces);
      const result = aggregator.aggregateTrees([tree]);

      expect(result.metrics.totalTraces).toBe(4);
      expect(result.metrics.successCount).toBe(2);
      expect(result.metrics.errorCount).toBe(1);
      expect(result.metrics.incompleteCount).toBe(1);
      expect(result.metrics.errorRate).toBe(0.25);
    });

    it('should include hot paths when enabled', () => {
      const options: AggregationOptions = { calculateHotPaths: true };
      const customAggregator = new TraceAggregator(logger, options);

      const rootTrace = mockTrace({ name: 'root' });
      const childTrace = mockTrace({ parentId: rootTrace.id, name: 'child' });
      rootTrace.children = [childTrace];

      const tree = mockTraceTree([rootTrace]);
      const result = customAggregator.aggregateTrees([tree]);

      expect(result.hotPaths).toBeDefined();
      expect(result.hotPaths!.length).toBeGreaterThan(0);
    });

    it('should include type groupings when enabled', () => {
      const options: AggregationOptions = { groupByType: true };
      const customAggregator = new TraceAggregator(logger, options);

      const traces = [
        mockTrace({ type: 'LLM_PROMPT' }),
        mockTrace({ type: 'LLM_PROMPT' }),
        mockTrace({ type: 'TOOL_CALL' })
      ];

      const tree = mockTraceTree(traces);
      const result = customAggregator.aggregateTrees([tree]);

      expect(result.typeGroupings).toBeDefined();
      expect(result.typeGroupings!.length).toBe(2);
      expect(result.typeGroupings!.find(g => g.type === 'LLM_PROMPT')?.count).toBe(2);
      expect(result.typeGroupings!.find(g => g.type === 'TOOL_CALL')?.count).toBe(1);
    });

    it('should calculate percentiles when sample size is sufficient', () => {
      const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      const traces = durations.map(duration => mockTrace({ durationMs: duration }));

      const tree = mockTraceTree(traces);
      const result = aggregator.aggregateTrees([tree]);

      expect(result.metrics.durationPercentiles).toBeDefined();
      expect(result.metrics.durationPercentiles!.p50).toBe(500);
      expect(result.metrics.durationPercentiles!.p90).toBe(900);
      expect(result.metrics.durationPercentiles!.p95).toBe(950);
      expect(result.metrics.durationPercentiles!.p99).toBe(990);
    });

    it('should calculate top bottlenecks', () => {
      const traces = [
        mockTrace({ name: 'slow-trace-1', durationMs: 5000 }),
        mockTrace({ name: 'fast-trace', durationMs: 100 }),
        mockTrace({ name: 'slow-trace-2', durationMs: 3000 }),
        mockTrace({ name: 'medium-trace', durationMs: 1000 })
      ];

      const tree = mockTraceTree(traces);
      const result = aggregator.aggregateTrees([tree]);

      expect(result.summary.topBottlenecks).toBeDefined();
      expect(result.summary.topBottlenecks.length).toBeLessThanOrEqual(5);
      expect(result.summary.topBottlenecks[0].name).toBe('slow-trace-1');
      expect(result.summary.topBottlenecks[0].duration).toBe(5000);
      expect(result.summary.topBottlenecks[0].percentOfTotal).toBeCloseTo(55.56, 1);
    });
  });

  describe('aggregateTree', () => {
    it('should aggregate single tree', () => {
      const trace = mockTrace();
      const tree = mockTraceTree([trace]);

      const result = aggregator.aggregateTree(tree);

      expect(result.metrics.totalTraces).toBe(1);
      expect(result.metrics.totalDuration).toBe(1000);
    });
  });

  describe('updateMetrics', () => {
    it('should merge existing metrics with new traces', () => {
      const existingMetrics: TraceMetrics = {
        totalTraces: 2,
        tracesByType: { 'LLM_PROMPT': 1, 'TOOL_CALL': 1, 'RESPONSE': 0 },
        errorCount: 0,
        successCount: 2,
        incompleteCount: 0,
        totalDuration: 1000,
        averageDuration: 500,
        minDuration: 400,
        maxDuration: 600,
        totalTokens: 100,
        averageTokens: 50,
        minTokens: 40,
        maxTokens: 60,
        tokensByType: { 'LLM_PROMPT': 50, 'TOOL_CALL': 50, 'RESPONSE': 0 },
        maxDepth: 1,
        averageDepth: 1,
        totalLeafNodes: 2,
        averageBranchingFactor: 0,
        errorRate: 0,
        throughputPerSecond: 2,
        concurrencyLevel: 1
      };

      const newTraces = [
        mockTrace({ type: 'RESPONSE', durationMs: 300, tokensUsed: 30 })
      ];

      const updatedMetrics = aggregator.updateMetrics(existingMetrics, newTraces);

      expect(updatedMetrics.totalTraces).toBe(3);
      expect(updatedMetrics.totalDuration).toBe(1300);
      expect(updatedMetrics.totalTokens).toBe(130);
      expect(updatedMetrics.averageDuration).toBeCloseTo(433.33, 1);
      expect(updatedMetrics.averageTokens).toBeCloseTo(43.33, 1);
      expect(updatedMetrics.minDuration).toBe(300);
      expect(updatedMetrics.maxDuration).toBe(600);
      expect(updatedMetrics.tracesByType['RESPONSE']).toBe(1);
    });

    it('should return existing metrics when no new traces', () => {
      const existingMetrics: TraceMetrics = {
        totalTraces: 1,
        tracesByType: { 'LLM_PROMPT': 1, 'TOOL_CALL': 0, 'RESPONSE': 0 },
        errorCount: 0,
        successCount: 1,
        incompleteCount: 0,
        totalDuration: 500,
        averageDuration: 500,
        minDuration: 500,
        maxDuration: 500,
        totalTokens: 50,
        averageTokens: 50,
        minTokens: 50,
        maxTokens: 50,
        tokensByType: { 'LLM_PROMPT': 50, 'TOOL_CALL': 0, 'RESPONSE': 0 },
        maxDepth: 1,
        averageDepth: 1,
        totalLeafNodes: 1,
        averageBranchingFactor: 0,
        errorRate: 0,
        throughputPerSecond: 1,
        concurrencyLevel: 1
      };

      const updatedMetrics = aggregator.updateMetrics(existingMetrics, []);

      expect(updatedMetrics).toEqual(existingMetrics);
    });
  });

  describe('calculateTrends', () => {
    it('should return stable trends with insufficient data', () => {
      const historicalResults = [
        { timestamp: Date.now(), result: { metrics: { averageDuration: 1000, errorRate: 0.1, throughputPerSecond: 10, averageTokens: 100 } } as any }
      ];

      const trends = aggregator.calculateTrends(historicalResults);

      expect(trends.durationTrend).toBe('stable');
      expect(trends.errorRateTrend).toBe('stable');
      expect(trends.throughputTrend).toBe('stable');
      expect(trends.tokenEfficiencyTrend).toBe('stable');
    });

    it('should detect improving trends', () => {
      const historicalResults = [
        // Older data
        { timestamp: Date.now() - 300000, result: { metrics: { averageDuration: 2000, errorRate: 0.2, throughputPerSecond: 5, averageTokens: 200 } } as any },
        { timestamp: Date.now() - 240000, result: { metrics: { averageDuration: 1900, errorRate: 0.18, throughputPerSecond: 6, averageTokens: 190 } } as any },
        { timestamp: Date.now() - 180000, result: { metrics: { averageDuration: 1800, errorRate: 0.16, throughputPerSecond: 7, averageTokens: 180 } } as any },
        // Recent data (improved)
        { timestamp: Date.now() - 120000, result: { metrics: { averageDuration: 1000, errorRate: 0.05, throughputPerSecond: 15, averageTokens: 100 } } as any },
        { timestamp: Date.now() - 60000, result: { metrics: { averageDuration: 900, errorRate: 0.04, throughputPerSecond: 16, averageTokens: 90 } } as any },
        { timestamp: Date.now(), result: { metrics: { averageDuration: 800, errorRate: 0.03, throughputPerSecond: 17, averageTokens: 80 } } as any }
      ];

      const trends = aggregator.calculateTrends(historicalResults);

      expect(trends.durationTrend).toBe('improving');
      expect(trends.errorRateTrend).toBe('improving');
      expect(trends.throughputTrend).toBe('improving');
    });

    it('should detect degrading trends', () => {
      const historicalResults = [
        // Older data (better)
        { timestamp: Date.now() - 300000, result: { metrics: { averageDuration: 800, errorRate: 0.02, throughputPerSecond: 20, averageTokens: 80 } } as any },
        { timestamp: Date.now() - 240000, result: { metrics: { averageDuration: 850, errorRate: 0.03, throughputPerSecond: 19, averageTokens: 85 } } as any },
        { timestamp: Date.now() - 180000, result: { metrics: { averageDuration: 900, errorRate: 0.04, throughputPerSecond: 18, averageTokens: 90 } } as any },
        // Recent data (degraded)
        { timestamp: Date.now() - 120000, result: { metrics: { averageDuration: 1500, errorRate: 0.15, throughputPerSecond: 8, averageTokens: 150 } } as any },
        { timestamp: Date.now() - 60000, result: { metrics: { averageDuration: 1600, errorRate: 0.16, throughputPerSecond: 7, averageTokens: 160 } } as any },
        { timestamp: Date.now(), result: { metrics: { averageDuration: 1700, errorRate: 0.17, throughputPerSecond: 6, averageTokens: 170 } } as any }
      ];

      const trends = aggregator.calculateTrends(historicalResults);

      expect(trends.durationTrend).toBe('degrading');
      expect(trends.errorRateTrend).toBe('degrading');
      expect(trends.throughputTrend).toBe('degrading');
    });
  });

  describe('edge cases', () => {
    it('should handle traces with missing duration', () => {
      const traces = [
        mockTrace({ durationMs: undefined }),
        mockTrace({ durationMs: 0 }),
        mockTrace({ durationMs: 500 })
      ];

      const tree = mockTraceTree(traces);
      const result = aggregator.aggregateTrees([tree]);

      expect(result.metrics.totalDuration).toBe(500);
      expect(result.metrics.averageDuration).toBe(500);
      expect(result.metrics.minDuration).toBe(500);
      expect(result.metrics.maxDuration).toBe(500);
    });

    it('should handle traces with missing tokens', () => {
      const traces = [
        mockTrace({ tokensUsed: undefined }),
        mockTrace({ tokensUsed: 0 }),
        mockTrace({ tokensUsed: 100 })
      ];

      const tree = mockTraceTree(traces);
      const result = aggregator.aggregateTrees([tree]);

      expect(result.metrics.totalTokens).toBe(100);
      expect(result.metrics.averageTokens).toBeCloseTo(33.33, 1);
    });

    it('should handle concurrent traces correctly', () => {
      const baseTime = Date.now();
      const traces = [
        mockTrace({ startedAt: baseTime, completedAt: baseTime + 1000 }),
        mockTrace({ startedAt: baseTime + 500, completedAt: baseTime + 1500 }),
        mockTrace({ startedAt: baseTime + 200, completedAt: baseTime + 800 })
      ];

      const tree = mockTraceTree(traces);
      const result = aggregator.aggregateTrees([tree]);

      expect(result.metrics.concurrencyLevel).toBeGreaterThan(1);
    });

    it('should handle very large trace trees', () => {
      // Create a large number of traces
      const traces = Array.from({ length: 1000 }, (_, i) =>
        mockTrace({
          id: `trace-${i}`,
          durationMs: Math.random() * 1000,
          tokensUsed: Math.floor(Math.random() * 100)
        })
      );

      const tree = mockTraceTree(traces);
      const result = aggregator.aggregateTrees([tree]);

      expect(result.metrics.totalTraces).toBe(1000);
      expect(result.metrics.totalDuration).toBeGreaterThan(0);
      expect(result.metrics.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('time window aggregation', () => {
    it('should create time windows when enabled', () => {
      const options: AggregationOptions = { timeWindowMs: 10000 }; // 10 second windows
      const customAggregator = new TraceAggregator(logger, options);

      const baseTime = Date.now();
      const traces = [
        mockTrace({ startedAt: baseTime }),
        mockTrace({ startedAt: baseTime + 5000 }),
        mockTrace({ startedAt: baseTime + 15000 }),
        mockTrace({ startedAt: baseTime + 25000 })
      ];

      const tree = mockTraceTree(traces);
      const result = customAggregator.aggregateTrees([tree]);

      expect(result.timeWindows).toBeDefined();
      expect(result.timeWindows!.length).toBeGreaterThan(1);
    });
  });
});

// Prevent TypeScript from generating export statement
(global as any).exports = exports;