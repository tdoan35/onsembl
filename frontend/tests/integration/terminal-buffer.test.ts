import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalBuffer } from '../../src/services/terminal-buffer';
import type { TerminalOutput } from '@onsembl/agent-protocol/websocket';

describe('Terminal Output Buffering', () => {
  let buffer: TerminalBuffer;

  beforeEach(() => {
    buffer = new TerminalBuffer({
      maxSize: 1000,
      maxAge: 3600000, // 1 hour
      flushInterval: 100
    });
  });

  it('should buffer terminal output', () => {
    const output1: TerminalOutput = {
      type: 'stdout',
      content: 'Line 1',
      timestamp: new Date().toISOString()
    };

    const output2: TerminalOutput = {
      type: 'stderr',
      content: 'Error line',
      timestamp: new Date().toISOString()
    };

    buffer.add(output1);
    buffer.add(output2);

    const all = buffer.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].content).toBe('Line 1');
    expect(all[1].content).toBe('Error line');
  });

  it('should respect max buffer size', () => {
    const smallBuffer = new TerminalBuffer({ maxSize: 3 });

    for (let i = 0; i < 5; i++) {
      smallBuffer.add({
        type: 'stdout',
        content: `Line ${i}`,
        timestamp: new Date().toISOString()
      });
    }

    const all = smallBuffer.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].content).toBe('Line 2'); // Oldest entries removed
    expect(all[2].content).toBe('Line 4');
  });

  it('should handle batch additions', () => {
    const outputs: TerminalOutput[] = Array.from({ length: 10 }, (_, i) => ({
      type: 'stdout',
      content: `Line ${i}`,
      timestamp: new Date().toISOString()
    }));

    buffer.addBatch(outputs);
    expect(buffer.getAll()).toHaveLength(10);
  });

  it('should filter by output type', () => {
    buffer.add({ type: 'stdout', content: 'stdout 1', timestamp: new Date().toISOString() });
    buffer.add({ type: 'stderr', content: 'stderr 1', timestamp: new Date().toISOString() });
    buffer.add({ type: 'stdout', content: 'stdout 2', timestamp: new Date().toISOString() });
    buffer.add({ type: 'system', content: 'system 1', timestamp: new Date().toISOString() });

    const stdoutOnly = buffer.getByType('stdout');
    expect(stdoutOnly).toHaveLength(2);
    expect(stdoutOnly.every(o => o.type === 'stdout')).toBe(true);

    const stderrOnly = buffer.getByType('stderr');
    expect(stderrOnly).toHaveLength(1);
    expect(stderrOnly[0].content).toBe('stderr 1');
  });

  it('should clear buffer', () => {
    buffer.add({ type: 'stdout', content: 'Line 1', timestamp: new Date().toISOString() });
    buffer.add({ type: 'stdout', content: 'Line 2', timestamp: new Date().toISOString() });

    expect(buffer.getAll()).toHaveLength(2);
    buffer.clear();
    expect(buffer.getAll()).toHaveLength(0);
  });

  it('should get recent outputs', () => {
    const now = Date.now();
    const old = new Date(now - 3600000).toISOString(); // 1 hour ago
    const recent = new Date(now - 60000).toISOString(); // 1 minute ago

    buffer.add({ type: 'stdout', content: 'Old', timestamp: old });
    buffer.add({ type: 'stdout', content: 'Recent', timestamp: recent });

    const recentOutputs = buffer.getRecent(300000); // Last 5 minutes
    expect(recentOutputs).toHaveLength(1);
    expect(recentOutputs[0].content).toBe('Recent');
  });

  it('should handle ANSI color codes', () => {
    const coloredOutput: TerminalOutput = {
      type: 'stdout',
      content: '\x1b[31mRed text\x1b[0m',
      timestamp: new Date().toISOString()
    };

    buffer.add(coloredOutput);
    const stripped = buffer.getStripped();
    expect(stripped[0].content).toBe('Red text');
  });

  it('should merge consecutive outputs of same type', () => {
    buffer.add({ type: 'stdout', content: 'Line 1', timestamp: new Date().toISOString() });
    buffer.add({ type: 'stdout', content: 'Line 2', timestamp: new Date().toISOString() });
    buffer.add({ type: 'stderr', content: 'Error', timestamp: new Date().toISOString() });
    buffer.add({ type: 'stdout', content: 'Line 3', timestamp: new Date().toISOString() });

    const merged = buffer.getMerged();
    expect(merged).toHaveLength(3);
    expect(merged[0].content).toBe('Line 1\nLine 2');
    expect(merged[1].content).toBe('Error');
    expect(merged[2].content).toBe('Line 3');
  });
});
