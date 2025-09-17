/**
 * CommandQueue Model Tests
 *
 * Test implementation for T077: CommandQueue model
 * Tests queue operations including enqueue, dequeue, priority management
 */

import { createClient } from '@supabase/supabase-js';
import { CommandQueueModel, CommandQueueSchema } from '../command-queue';
import { z } from 'zod';

// Mock Supabase client for testing
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  insert: jest.fn(() => mockSupabase),
  update: jest.fn(() => mockSupabase),
  delete: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  is: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
  or: jest.fn(() => mockSupabase),
  order: jest.fn(() => mockSupabase),
  limit: jest.fn(() => mockSupabase),
  single: jest.fn(),
  maybeSingle: jest.fn(),
  channel: jest.fn(() => ({
    on: jest.fn(() => ({ subscribe: jest.fn() })),
  })),
  removeChannel: jest.fn(),
} as any;

describe('CommandQueueModel', () => {
  let model: CommandQueueModel;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new CommandQueueModel(mockSupabase);
  });

  describe('Schema Validation', () => {
    it('should validate correct queue item data', () => {
      const validQueueItem = {
        command_id: '123e4567-e89b-12d3-a456-426614174000',
        agent_id: '123e4567-e89b-12d3-a456-426614174001',
        position: 1,
        priority: 75,
        estimated_duration_ms: 5000,
      };

      expect(() => CommandQueueSchema.parse(validQueueItem)).not.toThrow();
    });

    it('should reject invalid priority values', () => {
      const invalidQueueItem = {
        command_id: '123e4567-e89b-12d3-a456-426614174000',
        position: 1,
        priority: 150, // Invalid: > 100
      };

      expect(() => CommandQueueSchema.parse(invalidQueueItem)).toThrow(z.ZodError);
    });

    it('should reject invalid position values', () => {
      const invalidQueueItem = {
        command_id: '123e4567-e89b-12d3-a456-426614174000',
        position: -1, // Invalid: negative
        priority: 50,
      };

      expect(() => CommandQueueSchema.parse(invalidQueueItem)).toThrow(z.ZodError);
    });
  });

  describe('enqueue', () => {
    it('should enqueue a command with default priority', async () => {
      const mockQueueItem = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        command_id: '123e4567-e89b-12d3-a456-426614174000',
        agent_id: '123e4567-e89b-12d3-a456-426614174001',
        position: 1,
        priority: 50,
        estimated_duration_ms: null,
        created_at: new Date().toISOString(),
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockQueueItem,
        error: null,
      });

      // Mock calculateQueuePosition
      mockSupabase.single.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await model.enqueue(
        '123e4567-e89b-12d3-a456-426614174000',
        '123e4567-e89b-12d3-a456-426614174001'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('command_queue');
      expect(mockSupabase.insert).toHaveBeenCalled();
      expect(result).toEqual(mockQueueItem);
    });
  });

  describe('dequeue', () => {
    it('should dequeue the highest priority item', async () => {
      const mockQueueItem = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        command_id: '123e4567-e89b-12d3-a456-426614174000',
        agent_id: '123e4567-e89b-12d3-a456-426614174001',
        position: 1,
        priority: 75,
        estimated_duration_ms: null,
        created_at: new Date().toISOString(),
      };

      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: mockQueueItem,
        error: null,
      });

      // Mock remove operation
      mockSupabase.single.mockResolvedValueOnce({
        data: mockQueueItem,
        error: null,
      });

      mockSupabase.delete.mockResolvedValueOnce({
        error: null,
      });

      const result = await model.dequeue('123e4567-e89b-12d3-a456-426614174001');

      expect(mockSupabase.from).toHaveBeenCalledWith('command_queue');
      expect(mockSupabase.order).toHaveBeenCalledWith('priority', { ascending: false });
      expect(result).toEqual(mockQueueItem);
    });

    it('should return null when queue is empty', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await model.dequeue('123e4567-e89b-12d3-a456-426614174001');

      expect(result).toBeNull();
    });
  });

  describe('peek', () => {
    it('should return next item without removing it', async () => {
      const mockQueueItem = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        command_id: '123e4567-e89b-12d3-a456-426614174000',
        agent_id: '123e4567-e89b-12d3-a456-426614174001',
        position: 1,
        priority: 75,
        estimated_duration_ms: null,
        created_at: new Date().toISOString(),
      };

      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: mockQueueItem,
        error: null,
      });

      const result = await model.peek('123e4567-e89b-12d3-a456-426614174001');

      expect(mockSupabase.from).toHaveBeenCalledWith('command_queue');
      expect(mockSupabase.delete).not.toHaveBeenCalled();
      expect(result).toEqual(mockQueueItem);
    });
  });

  describe('getPosition', () => {
    it('should return the correct position for a command', async () => {
      const mockQueueItem = {
        position: 3,
        agent_id: '123e4567-e89b-12d3-a456-426614174001',
        priority: 50,
      };

      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: mockQueueItem,
        error: null,
      });

      // Mock count query
      mockSupabase.or.mockResolvedValueOnce({
        data: [{ id: '1' }, { id: '2' }], // 2 items ahead
        error: null,
      });

      const result = await model.getPosition('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toBe(3); // 2 ahead + 1 = position 3
    });

    it('should return null for command not in queue', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await model.getPosition('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toBeNull();
    });
  });

  describe('updatePriority', () => {
    it('should update priority and reorder queue', async () => {
      const mockQueueItem = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        command_id: '123e4567-e89b-12d3-a456-426614174000',
        agent_id: '123e4567-e89b-12d3-a456-426614174001',
        position: 1,
        priority: 75,
        estimated_duration_ms: null,
        created_at: new Date().toISOString(),
      };

      // Mock findById
      mockSupabase.single.mockResolvedValueOnce({
        data: mockQueueItem,
        error: null,
      });

      // Mock update
      mockSupabase.single.mockResolvedValueOnce({
        data: { ...mockQueueItem, priority: 90 },
        error: null,
      });

      const result = await model.updatePriority(mockQueueItem.id, 90);

      expect(mockSupabase.update).toHaveBeenCalledWith({ priority: 90 });
      expect(result.priority).toBe(90);
    });

    it('should throw error for invalid priority', async () => {
      await expect(
        model.updatePriority('123e4567-e89b-12d3-a456-426614174002', 150)
      ).rejects.toThrow('Priority must be between 0 and 100');
    });
  });

  describe('getQueueStats', () => {
    it('should return correct queue statistics', async () => {
      const mockQueueItems = [
        {
          id: '1',
          priority: 75,
          estimated_duration_ms: 5000,
          created_at: '2023-01-01T00:00:00Z',
        },
        {
          id: '2',
          priority: 50,
          estimated_duration_ms: 3000,
          created_at: '2023-01-02T00:00:00Z',
        },
      ];

      mockSupabase.order.mockResolvedValueOnce({
        data: mockQueueItems,
        error: null,
      });

      const result = await model.getQueueStats('123e4567-e89b-12d3-a456-426614174001');

      expect(result.total).toBe(2);
      expect(result.avgPriority).toBe(62.5); // (75 + 50) / 2
      expect(result.estimatedTotalDuration).toBe(8000); // 5000 + 3000
      expect(result.oldestItem).toBe('2023-01-01T00:00:00Z');
    });
  });
});