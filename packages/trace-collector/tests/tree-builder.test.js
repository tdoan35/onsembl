/**
 * Tests for trace tree construction and traversal
 */
const { pino } = require('pino');
const { TreeBuilder } = require('../src/tree-builder');
describe('TreeBuilder', () => {
    let treeBuilder;
    let logger;
    const mockTrace = (overrides = {}) => ({
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
        logger = pino({ level: 'silent' });
        treeBuilder = new TreeBuilder(logger);
    });
    describe('buildTree', () => {
        it('should throw error for empty trace array', () => {
            expect(() => treeBuilder.buildTree([])).toThrow('Cannot build tree from empty trace array');
        });
        it('should build tree with single root trace', () => {
            const trace = mockTrace({ name: 'root-trace' });
            const tree = treeBuilder.buildTree([trace]);
            expect(tree.commandId).toBe(trace.commandId);
            expect(tree.agentId).toBe(trace.agentId);
            expect(tree.rootTraces).toHaveLength(1);
            expect(tree.rootTraces[0].name).toBe('root-trace');
            expect(tree.totalDuration).toBe(1000);
            expect(tree.totalTokens).toBe(100);
        });
        it('should build tree with parent-child relationships', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const childTrace1 = mockTrace({ id: 'child1', parentId: 'root', name: 'child1' });
            const childTrace2 = mockTrace({ id: 'child2', parentId: 'root', name: 'child2' });
            const grandchildTrace = mockTrace({ id: 'grandchild', parentId: 'child1', name: 'grandchild' });
            const traces = [rootTrace, childTrace1, childTrace2, grandchildTrace];
            const tree = treeBuilder.buildTree(traces);
            expect(tree.rootTraces).toHaveLength(1);
            expect(tree.rootTraces[0].children).toHaveLength(2);
            expect(tree.rootTraces[0].children[0].children).toHaveLength(1);
            expect(tree.rootTraces[0].children[0].children[0].name).toBe('grandchild');
        });
        it('should sort children by start time', () => {
            const baseTime = Date.now();
            const rootTrace = mockTrace({ id: 'root', startedAt: baseTime });
            const childTrace1 = mockTrace({ id: 'child1', parentId: 'root', startedAt: baseTime + 2000 });
            const childTrace2 = mockTrace({ id: 'child2', parentId: 'root', startedAt: baseTime + 1000 });
            const childTrace3 = mockTrace({ id: 'child3', parentId: 'root', startedAt: baseTime + 3000 });
            const traces = [rootTrace, childTrace1, childTrace2, childTrace3];
            const tree = treeBuilder.buildTree(traces);
            const children = tree.rootTraces[0].children;
            expect(children[0].id).toBe('child2'); // Earliest
            expect(children[1].id).toBe('child1'); // Middle
            expect(children[2].id).toBe('child3'); // Latest
        });
        it('should handle multiple root traces', () => {
            const rootTrace1 = mockTrace({ id: 'root1', name: 'root1' });
            const rootTrace2 = mockTrace({ id: 'root2', name: 'root2' });
            const childTrace = mockTrace({ id: 'child', parentId: 'root1', name: 'child' });
            const traces = [rootTrace1, rootTrace2, childTrace];
            const tree = treeBuilder.buildTree(traces);
            expect(tree.rootTraces).toHaveLength(2);
            expect(tree.rootTraces[0].children).toHaveLength(1);
            expect(tree.rootTraces[1].children).toBeUndefined();
        });
        it('should handle orphaned traces (parent not found)', () => {
            const orphanTrace = mockTrace({ id: 'orphan', parentId: 'non-existent', name: 'orphan' });
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const traces = [orphanTrace, rootTrace];
            const tree = treeBuilder.buildTree(traces);
            expect(tree.rootTraces).toHaveLength(2); // Both treated as roots
            expect(tree.rootTraces.some(t => t.id === 'orphan')).toBe(true);
            expect(tree.rootTraces.some(t => t.id === 'root')).toBe(true);
        });
        it('should calculate total duration and tokens correctly', () => {
            const trace1 = mockTrace({ durationMs: 500, tokensUsed: 50 });
            const trace2 = mockTrace({ durationMs: 300, tokensUsed: 30 });
            const trace3 = mockTrace({ durationMs: 200, tokensUsed: 20 });
            const tree = treeBuilder.buildTree([trace1, trace2, trace3]);
            expect(tree.totalDuration).toBe(1000);
            expect(tree.totalTokens).toBe(100);
        });
        it('should use first trace as root when no valid roots found', () => {
            // Create circular reference scenario
            const trace1 = mockTrace({ id: 'trace1', parentId: 'trace2' });
            const trace2 = mockTrace({ id: 'trace2', parentId: 'trace1' });
            const originalWarn = console.warn;
            console.warn = jest.fn();
            const tree = treeBuilder.buildTree([trace1, trace2]);
            expect(tree.rootTraces).toHaveLength(1);
            expect(tree.rootTraces[0].id).toBe('trace1');
            console.warn = originalWarn;
        });
    });
    describe('toFlameGraph', () => {
        it('should convert simple tree to flamegraph', () => {
            const rootTrace = mockTrace({
                name: 'root',
                type: 'LLM_PROMPT',
                durationMs: 1000,
                tokensUsed: 100
            });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const flameGraph = treeBuilder.toFlameGraph(tree);
            expect(flameGraph.name).toBe('root');
            expect(flameGraph.value).toBe(1000);
            expect(flameGraph.color).toBe('#3b82f6'); // Blue for LLM_PROMPT
            expect(flameGraph.metadata?.traceId).toBe(rootTrace.id);
            expect(flameGraph.metadata?.type).toBe('LLM_PROMPT');
            expect(flameGraph.metadata?.tokens).toBe(100);
        });
        it('should handle tree with children in flamegraph', () => {
            const rootTrace = mockTrace({
                id: 'root',
                name: 'root',
                type: 'LLM_PROMPT',
                durationMs: 1000
            });
            const childTrace = mockTrace({
                id: 'child',
                parentId: 'root',
                name: 'child',
                type: 'TOOL_CALL',
                durationMs: 500
            });
            rootTrace.children = [childTrace];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1500,
                totalTokens: 200,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const flameGraph = treeBuilder.toFlameGraph(tree);
            expect(flameGraph.children).toHaveLength(1);
            expect(flameGraph.children[0].name).toBe('child');
            expect(flameGraph.children[0].value).toBe(500);
            expect(flameGraph.children[0].color).toBe('#10b981'); // Green for TOOL_CALL
        });
        it('should use error color for incomplete traces', () => {
            const errorTrace = mockTrace({
                name: 'error',
                completedAt: undefined,
                startedAt: Date.now() - 5000,
                durationMs: 1000
            });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [errorTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const flameGraph = treeBuilder.toFlameGraph(tree);
            expect(flameGraph.color).toBe('#dc2626'); // Red for errors
            expect(flameGraph.metadata?.error).toBe(true);
        });
    });
    describe('toTimeline', () => {
        it('should convert tree to timeline events', () => {
            const baseTime = Date.now();
            const rootTrace = mockTrace({
                name: 'root',
                startedAt: baseTime,
                completedAt: baseTime + 1000,
                durationMs: 1000
            });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: baseTime,
                updatedAt: Date.now()
            };
            const timeline = treeBuilder.toTimeline(tree);
            expect(timeline).toHaveLength(1);
            expect(timeline[0].name).toBe('root');
            expect(timeline[0].start).toBe(baseTime);
            expect(timeline[0].end).toBe(baseTime + 1000);
            expect(timeline[0].duration).toBe(1000);
            expect(timeline[0].level).toBe(0);
        });
        it('should handle nested timeline events', () => {
            const baseTime = Date.now();
            const rootTrace = mockTrace({
                id: 'root',
                name: 'root',
                startedAt: baseTime,
                completedAt: baseTime + 1000
            });
            const childTrace = mockTrace({
                id: 'child',
                parentId: 'root',
                name: 'child',
                startedAt: baseTime + 100,
                completedAt: baseTime + 600
            });
            rootTrace.children = [childTrace];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: baseTime,
                updatedAt: Date.now()
            };
            const timeline = treeBuilder.toTimeline(tree);
            expect(timeline[0].children).toHaveLength(1);
            expect(timeline[0].children[0].name).toBe('child');
            expect(timeline[0].children[0].level).toBe(1);
            expect(timeline[0].children[0].start).toBe(baseTime + 100);
            expect(timeline[0].children[0].end).toBe(baseTime + 600);
        });
    });
    describe('getCriticalPath', () => {
        it('should find critical path through tree', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root', durationMs: 1000 });
            const fastChild = mockTrace({ id: 'fast', parentId: 'root', name: 'fast', durationMs: 200 });
            const slowChild = mockTrace({ id: 'slow', parentId: 'root', name: 'slow', durationMs: 800 });
            const grandchild = mockTrace({ id: 'grandchild', parentId: 'slow', name: 'grandchild', durationMs: 300 });
            rootTrace.children = [fastChild, slowChild];
            slowChild.children = [grandchild];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 2300,
                totalTokens: 400,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const criticalPath = treeBuilder.getCriticalPath(tree);
            expect(criticalPath).toHaveLength(3);
            expect(criticalPath[0].name).toBe('root');
            expect(criticalPath[1].name).toBe('slow'); // Chosen over 'fast' due to longer duration
            expect(criticalPath[2].name).toBe('grandchild');
        });
        it('should handle tree with no children', () => {
            const rootTrace = mockTrace({ name: 'root' });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const criticalPath = treeBuilder.getCriticalPath(tree);
            expect(criticalPath).toHaveLength(1);
            expect(criticalPath[0].name).toBe('root');
        });
    });
    describe('getTreeDepth', () => {
        it('should calculate depth of simple tree', () => {
            const rootTrace = mockTrace({ name: 'root' });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const depth = treeBuilder.getTreeDepth(tree);
            expect(depth).toBe(0); // Single node has depth 0
        });
        it('should calculate depth of nested tree', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const childTrace = mockTrace({ id: 'child', parentId: 'root', name: 'child' });
            const grandchildTrace = mockTrace({ id: 'grandchild', parentId: 'child', name: 'grandchild' });
            rootTrace.children = [childTrace];
            childTrace.children = [grandchildTrace];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 3000,
                totalTokens: 300,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const depth = treeBuilder.getTreeDepth(tree);
            expect(depth).toBe(2); // Root -> child -> grandchild = depth 2
        });
        it('should find maximum depth across multiple branches', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const shallowChild = mockTrace({ id: 'shallow', parentId: 'root', name: 'shallow' });
            const deepChild = mockTrace({ id: 'deep', parentId: 'root', name: 'deep' });
            const deepGrandchild = mockTrace({ id: 'deep-grand', parentId: 'deep', name: 'deep-grand' });
            const deepGreatGrandchild = mockTrace({ id: 'deep-great', parentId: 'deep-grand', name: 'deep-great' });
            rootTrace.children = [shallowChild, deepChild];
            deepChild.children = [deepGrandchild];
            deepGrandchild.children = [deepGreatGrandchild];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 5000,
                totalTokens: 500,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const depth = treeBuilder.getTreeDepth(tree);
            expect(depth).toBe(3); // Root -> deep -> deep-grand -> deep-great = depth 3
        });
    });
    describe('getLeafNodes', () => {
        it('should find leaf nodes in tree', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const childTrace1 = mockTrace({ id: 'child1', parentId: 'root', name: 'child1' });
            const childTrace2 = mockTrace({ id: 'child2', parentId: 'root', name: 'child2' });
            const grandchildTrace = mockTrace({ id: 'grandchild', parentId: 'child1', name: 'grandchild' });
            rootTrace.children = [childTrace1, childTrace2];
            childTrace1.children = [grandchildTrace];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 4000,
                totalTokens: 400,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const leafNodes = treeBuilder.getLeafNodes(tree);
            expect(leafNodes).toHaveLength(2);
            expect(leafNodes.map(n => n.name)).toContain('child2');
            expect(leafNodes.map(n => n.name)).toContain('grandchild');
        });
        it('should return root when tree has single node', () => {
            const rootTrace = mockTrace({ name: 'root' });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const leafNodes = treeBuilder.getLeafNodes(tree);
            expect(leafNodes).toHaveLength(1);
            expect(leafNodes[0].name).toBe('root');
        });
    });
    describe('findTraces', () => {
        it('should find traces matching predicate', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root', type: 'LLM_PROMPT' });
            const childTrace1 = mockTrace({ id: 'child1', parentId: 'root', name: 'child1', type: 'TOOL_CALL' });
            const childTrace2 = mockTrace({ id: 'child2', parentId: 'root', name: 'child2', type: 'LLM_PROMPT' });
            rootTrace.children = [childTrace1, childTrace2];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 3000,
                totalTokens: 300,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const llmTraces = treeBuilder.findTraces(tree, trace => trace.type === 'LLM_PROMPT');
            expect(llmTraces).toHaveLength(2);
            expect(llmTraces.map(t => t.name)).toContain('root');
            expect(llmTraces.map(t => t.name)).toContain('child2');
        });
        it('should return empty array when no traces match', () => {
            const rootTrace = mockTrace({ name: 'root', type: 'LLM_PROMPT' });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const responseTraces = treeBuilder.findTraces(tree, trace => trace.type === 'RESPONSE');
            expect(responseTraces).toHaveLength(0);
        });
    });
    describe('getTracePath', () => {
        it('should find path to specific trace', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const childTrace = mockTrace({ id: 'child', parentId: 'root', name: 'child' });
            const grandchildTrace = mockTrace({ id: 'grandchild', parentId: 'child', name: 'grandchild' });
            rootTrace.children = [childTrace];
            childTrace.children = [grandchildTrace];
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 3000,
                totalTokens: 300,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const path = treeBuilder.getTracePath(tree, 'grandchild');
            expect(path).toHaveLength(3);
            expect(path[0].name).toBe('root');
            expect(path[1].name).toBe('child');
            expect(path[2].name).toBe('grandchild');
        });
        it('should return null when trace not found', () => {
            const rootTrace = mockTrace({ name: 'root' });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const path = treeBuilder.getTracePath(tree, 'non-existent');
            expect(path).toBeNull();
        });
        it('should find path to root trace', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const tree = {
                commandId: 'cmd-123',
                agentId: 'agent-456',
                rootTraces: [rootTrace],
                totalDuration: 1000,
                totalTokens: 100,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            const path = treeBuilder.getTracePath(tree, 'root');
            expect(path).toHaveLength(1);
            expect(path[0].name).toBe('root');
        });
    });
    describe('color coding', () => {
        it('should assign correct colors for different trace types', () => {
            const traces = [
                mockTrace({ type: 'LLM_PROMPT' }),
                mockTrace({ type: 'TOOL_CALL' }),
                mockTrace({ type: 'RESPONSE' })
            ];
            traces.forEach(trace => {
                const tree = {
                    commandId: 'cmd-123',
                    agentId: 'agent-456',
                    rootTraces: [trace],
                    totalDuration: 1000,
                    totalTokens: 100,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                const flameGraph = treeBuilder.toFlameGraph(tree);
                const timeline = treeBuilder.toTimeline(tree);
                switch (trace.type) {
                    case 'LLM_PROMPT':
                        expect(flameGraph.color).toBe('#3b82f6'); // Blue
                        expect(timeline[0].color).toBe('#93c5fd'); // Light blue
                        break;
                    case 'TOOL_CALL':
                        expect(flameGraph.color).toBe('#10b981'); // Green
                        expect(timeline[0].color).toBe('#6ee7b7'); // Light green
                        break;
                    case 'RESPONSE':
                        expect(flameGraph.color).toBe('#f59e0b'); // Yellow
                        expect(timeline[0].color).toBe('#fcd34d'); // Light yellow
                        break;
                }
            });
        });
    });
    describe('edge cases', () => {
        it('should handle trace with missing duration', () => {
            const trace = mockTrace({ durationMs: undefined });
            const tree = treeBuilder.buildTree([trace]);
            expect(tree.totalDuration).toBe(0);
        });
        it('should handle trace with missing tokens', () => {
            const trace = mockTrace({ tokensUsed: undefined });
            const tree = treeBuilder.buildTree([trace]);
            expect(tree.totalTokens).toBe(0);
        });
        it('should handle deeply nested trees', () => {
            let currentTrace = mockTrace({ id: 'root', name: 'root' });
            const allTraces = [currentTrace];
            // Create a deep chain of 100 traces
            for (let i = 1; i < 100; i++) {
                const childTrace = mockTrace({
                    id: `trace-${i}`,
                    parentId: currentTrace.id,
                    name: `trace-${i}`
                });
                allTraces.push(childTrace);
                currentTrace.children = [childTrace];
                currentTrace = childTrace;
            }
            const tree = treeBuilder.buildTree(allTraces);
            const depth = treeBuilder.getTreeDepth(tree);
            const criticalPath = treeBuilder.getCriticalPath(tree);
            expect(tree.rootTraces).toHaveLength(1);
            expect(depth).toBe(99);
            expect(criticalPath).toHaveLength(100);
        });
        it('should handle very wide trees', () => {
            const rootTrace = mockTrace({ id: 'root', name: 'root' });
            const children = [];
            const allTraces = [rootTrace];
            // Create 1000 direct children
            for (let i = 0; i < 1000; i++) {
                const childTrace = mockTrace({
                    id: `child-${i}`,
                    parentId: 'root',
                    name: `child-${i}`
                });
                children.push(childTrace);
                allTraces.push(childTrace);
            }
            rootTrace.children = children;
            const tree = treeBuilder.buildTree(allTraces);
            const leafNodes = treeBuilder.getLeafNodes(tree);
            expect(tree.rootTraces).toHaveLength(1);
            expect(tree.rootTraces[0].children).toHaveLength(1000);
            expect(leafNodes).toHaveLength(1000);
        });
    });
});
// Prevent TypeScript from generating export statement
global.exports = exports;
export {};
//# sourceMappingURL=tree-builder.test.js.map