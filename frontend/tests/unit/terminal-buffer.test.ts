import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalBuffer } from '../../src/services/terminal-buffer';
import type { TerminalOutput } from '@onsembl/agent-protocol/websocket';

describe('TerminalBuffer', () => {
  let buffer: TerminalBuffer;

  beforeEach(() => {
    buffer = new TerminalBuffer();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const options = buffer.getOptions();
      expect(options.maxSize).toBe(1000);
      expect(options.maxAge).toBe(3600000);
      expect(options.flushInterval).toBe(100);
    });

    it('should accept custom options', () => {
      buffer = new TerminalBuffer({
        maxSize: 500,
        maxAge: 60000,
        flushInterval: 50
      });

      const options = buffer.getOptions();
      expect(options.maxSize).toBe(500);
      expect(options.maxAge).toBe(60000);
      expect(options.flushInterval).toBe(50);
    });
  });

  describe('add', () => {
    it('should add output to buffer', () => {
      const output: TerminalOutput = {
        type: 'stdout',
        content: 'Test output',
        timestamp: new Date().toISOString()
      };

      buffer.add(output);
      expect(buffer.getAll()).toHaveLength(1);
      expect(buffer.getAll()[0]).toEqual(output);
    });

    it('should maintain insertion order', () => {
      const output1: TerminalOutput = {
        type: 'stdout',
        content: 'First',
        timestamp: new Date().toISOString()
      };

      const output2: TerminalOutput = {
        type: 'stderr',
        content: 'Second',
        timestamp: new Date().toISOString()
      };

      buffer.add(output1);
      buffer.add(output2);

      const all = buffer.getAll();
      expect(all[0].content).toBe('First');
      expect(all[1].content).toBe('Second');
    });

    it('should respect max size limit', () => {
      buffer = new TerminalBuffer({ maxSize: 3 });

      for (let i = 0; i < 5; i++) {
        buffer.add({
          type: 'stdout',
          content: `Line ${i}`,
          timestamp: new Date().toISOString()
        });
      }

      const all = buffer.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].content).toBe('Line 2'); // Oldest entries removed
      expect(all[2].content).toBe('Line 4');
    });
  });

  describe('addBatch', () => {
    it('should add multiple outputs at once', () => {
      const outputs: TerminalOutput[] = [
        { type: 'stdout', content: 'Line 1', timestamp: new Date().toISOString() },
        { type: 'stdout', content: 'Line 2', timestamp: new Date().toISOString() },
        { type: 'stderr', content: 'Error', timestamp: new Date().toISOString() }
      ];

      buffer.addBatch(outputs);
      expect(buffer.getAll()).toHaveLength(3);
    });

    it('should trim batch to respect max size', () => {
      buffer = new TerminalBuffer({ maxSize: 2 });

      const outputs: TerminalOutput[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'stdout' as const,
        content: `Line ${i}`,
        timestamp: new Date().toISOString()
      }));

      buffer.addBatch(outputs);
      expect(buffer.getAll()).toHaveLength(2);
      expect(buffer.getAll()[0].content).toBe('Line 3');
      expect(buffer.getAll()[1].content).toBe('Line 4');
    });
  });

  describe('getByType', () => {
    beforeEach(() => {
      buffer.add({ type: 'stdout', content: 'Out 1', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stderr', content: 'Err 1', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stdout', content: 'Out 2', timestamp: new Date().toISOString() });
      buffer.add({ type: 'system', content: 'Sys 1', timestamp: new Date().toISOString() });
    });

    it('should filter by output type', () => {
      const stdout = buffer.getByType('stdout');
      expect(stdout).toHaveLength(2);
      expect(stdout.every(o => o.type === 'stdout')).toBe(true);

      const stderr = buffer.getByType('stderr');
      expect(stderr).toHaveLength(1);
      expect(stderr[0].content).toBe('Err 1');
    });

    it('should return empty array for non-existent type', () => {
      const command = buffer.getByType('command');
      expect(command).toEqual([]);
    });
  });

  describe('getRecent', () => {
    it('should return outputs within time window', () => {
      const now = Date.now();
      const old = new Date(now - 3600000).toISOString(); // 1 hour ago
      const recent1 = new Date(now - 60000).toISOString(); // 1 minute ago
      const recent2 = new Date(now - 30000).toISOString(); // 30 seconds ago

      buffer.add({ type: 'stdout', content: 'Old', timestamp: old });
      buffer.add({ type: 'stdout', content: 'Recent 1', timestamp: recent1 });
      buffer.add({ type: 'stdout', content: 'Recent 2', timestamp: recent2 });

      // Get outputs from last 2 minutes
      const recentOutputs = buffer.getRecent(120000);
      expect(recentOutputs).toHaveLength(2);
      expect(recentOutputs[0].content).toBe('Recent 1');
      expect(recentOutputs[1].content).toBe('Recent 2');
    });

    it('should return all outputs if window is large enough', () => {
      buffer.add({ type: 'stdout', content: 'Test', timestamp: new Date().toISOString() });

      const recentOutputs = buffer.getRecent(Number.MAX_SAFE_INTEGER);
      expect(recentOutputs).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should remove all outputs', () => {
      buffer.add({ type: 'stdout', content: 'Test 1', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stdout', content: 'Test 2', timestamp: new Date().toISOString() });

      expect(buffer.getAll()).toHaveLength(2);
      buffer.clear();
      expect(buffer.getAll()).toHaveLength(0);
    });
  });

  describe('getStripped', () => {
    it('should remove ANSI escape codes', () => {
      const outputs: TerminalOutput[] = [
        { type: 'stdout', content: '\x1b[31mRed text\x1b[0m', timestamp: new Date().toISOString() },
        { type: 'stdout', content: '\x1b[1;32mBold green\x1b[0m', timestamp: new Date().toISOString() },
        { type: 'stdout', content: 'Plain text', timestamp: new Date().toISOString() }
      ];

      buffer.addBatch(outputs);
      const stripped = buffer.getStripped();

      expect(stripped[0].content).toBe('Red text');
      expect(stripped[1].content).toBe('Bold green');
      expect(stripped[2].content).toBe('Plain text');
    });

    it('should handle complex ANSI sequences', () => {
      const output: TerminalOutput = {
        type: 'stdout',
        content: '\x1b[2J\x1b[H\x1b[?25lLoading...\x1b[?25h',
        timestamp: new Date().toISOString()
      };

      buffer.add(output);
      const stripped = buffer.getStripped();

      expect(stripped[0].content).toBe('Loading...');
    });
  });

  describe('getMerged', () => {
    it('should merge consecutive outputs of same type', () => {
      const now = Date.now();

      buffer.add({ type: 'stdout', content: 'Line 1', timestamp: new Date(now).toISOString() });
      buffer.add({ type: 'stdout', content: 'Line 2', timestamp: new Date(now + 10).toISOString() });
      buffer.add({ type: 'stderr', content: 'Error', timestamp: new Date(now + 20).toISOString() });
      buffer.add({ type: 'stdout', content: 'Line 3', timestamp: new Date(now + 30).toISOString() });

      const merged = buffer.getMerged();
      expect(merged).toHaveLength(3);
      expect(merged[0].content).toBe('Line 1\nLine 2');
      expect(merged[0].type).toBe('stdout');
      expect(merged[1].content).toBe('Error');
      expect(merged[1].type).toBe('stderr');
      expect(merged[2].content).toBe('Line 3');
      expect(merged[2].type).toBe('stdout');
    });

    it('should not merge if timestamps are far apart', () => {
      const now = Date.now();

      buffer.add({ type: 'stdout', content: 'Line 1', timestamp: new Date(now).toISOString() });
      buffer.add({ type: 'stdout', content: 'Line 2', timestamp: new Date(now + 200).toISOString() }); // 200ms apart

      const merged = buffer.getMerged();
      expect(merged).toHaveLength(2);
      expect(merged[0].content).toBe('Line 1');
      expect(merged[1].content).toBe('Line 2');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      buffer.add({ type: 'stdout', content: 'Hello world', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stdout', content: 'Test message', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stderr', content: 'Error: file not found', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stdout', content: 'Another test', timestamp: new Date().toISOString() });
    });

    it('should find outputs containing search term', () => {
      const results = buffer.search('test');
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain('Test');
      expect(results[1].content).toContain('test');
    });

    it('should be case insensitive by default', () => {
      const results = buffer.search('ERROR');
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('Error');
    });

    it('should support case sensitive search', () => {
      const results = buffer.search('Error', { caseSensitive: true });
      expect(results).toHaveLength(1);

      const noResults = buffer.search('error', { caseSensitive: true });
      expect(noResults).toHaveLength(0);
    });

    it('should support regex search', () => {
      const results = buffer.search(/^Error:/, { regex: true });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Error: file not found');
    });
  });

  describe('getStats', () => {
    it('should return buffer statistics', () => {
      buffer.add({ type: 'stdout', content: 'Out 1', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stderr', content: 'Err 1', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stdout', content: 'Out 2', timestamp: new Date().toISOString() });

      const stats = buffer.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.stdout).toBe(2);
      expect(stats.byType.stderr).toBe(1);
      expect(stats.byType.system).toBe(0);
      expect(stats.byType.command).toBe(0);
      expect(stats.oldestTimestamp).toBeDefined();
      expect(stats.newestTimestamp).toBeDefined();
    });

    it('should return empty stats for empty buffer', () => {
      const stats = buffer.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byType.stdout).toBe(0);
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });
  });

  describe('toArray', () => {
    it('should export all outputs as array', () => {
      const outputs: TerminalOutput[] = [
        { type: 'stdout', content: 'Line 1', timestamp: new Date().toISOString() },
        { type: 'stderr', content: 'Error', timestamp: new Date().toISOString() }
      ];

      buffer.addBatch(outputs);
      const array = buffer.toArray();

      expect(array).toEqual(outputs);
      expect(array).not.toBe(buffer.getAll()); // Should be a copy
    });
  });

  describe('toText', () => {
    it('should export as plain text', () => {
      buffer.add({ type: 'stdout', content: 'Line 1', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stderr', content: 'Error message', timestamp: new Date().toISOString() });
      buffer.add({ type: 'stdout', content: 'Line 2', timestamp: new Date().toISOString() });

      const text = buffer.toText();
      expect(text).toBe('Line 1\nError message\nLine 2');
    });

    it('should handle ANSI codes in text export', () => {
      buffer.add({
        type: 'stdout',
        content: '\x1b[31mRed text\x1b[0m',
        timestamp: new Date().toISOString()
      });

      const text = buffer.toText({ stripAnsi: true });
      expect(text).toBe('Red text');

      const textWithAnsi = buffer.toText({ stripAnsi: false });
      expect(textWithAnsi).toContain('\x1b[31m');
    });
  });

  describe('automatic cleanup', () => {
    it('should remove old entries beyond maxAge', () => {
      buffer = new TerminalBuffer({ maxAge: 1000 }); // 1 second

      const oldTimestamp = new Date(Date.now() - 2000).toISOString(); // 2 seconds ago
      const recentTimestamp = new Date().toISOString();

      buffer.add({ type: 'stdout', content: 'Old', timestamp: oldTimestamp });
      buffer.add({ type: 'stdout', content: 'Recent', timestamp: recentTimestamp });

      buffer.cleanup();

      const all = buffer.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].content).toBe('Recent');
    });
  });
});