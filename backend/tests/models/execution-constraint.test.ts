/**
 * ExecutionConstraint Model Tests
 *
 * Test suite for T076: ExecutionConstraint model implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import {
  ExecutionConstraintModel,
  ExecutionConstraintSchema,
  ExecutionConstraintError,
  ExecutionConstraintNotFoundError,
  ExecutionConstraintValidationError,
  ExecutionConstraintViolationError,
  type ConstraintType,
  type ConstraintEvaluationContext,
  type ConstraintEvaluationResult
} from '../../src/models/execution-constraint';
import { Database } from '../../src/types/database';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      })),
      order: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn()
    }))
  })),
  channel: jest.fn(() => ({
    on: jest.fn(() => ({
      subscribe: jest.fn()
    }))
  })),
  removeChannel: jest.fn()
} as any;

describe('ExecutionConstraintModel', () => {
  let model: ExecutionConstraintModel;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new ExecutionConstraintModel(mockSupabaseClient);
  });

  describe('ExecutionConstraintSchema', () => {
    it('should validate valid constraint data', () => {
      const validConstraint = {
        name: 'Test Constraint',
        description: 'A test constraint',
        time_limit_ms: 300000,
        token_budget: 1000,
        memory_limit_mb: 512,
        cpu_limit_percent: 80,
        is_default: false
      };

      const result = ExecutionConstraintSchema.safeParse(validConstraint);
      expect(result.success).toBe(true);
    });

    it('should reject invalid constraint data', () => {
      const invalidConstraint = {
        name: '', // Empty name should fail
        time_limit_ms: -100, // Negative value should fail
        cpu_limit_percent: 150 // >100% should fail
      };

      const result = ExecutionConstraintSchema.safeParse(invalidConstraint);
      expect(result.success).toBe(false);
    });
  });

  describe('create', () => {
    it('should create a new execution constraint', async () => {
      const mockData = {
        id: 'test-id',
        agent_id: null,
        max_execution_time_ms: 300000,
        max_memory_mb: 512,
        max_cpu_percent: 80,
        environment_variables: {
          name: 'Test Constraint',
          description: 'A test constraint',
          token_budget: 1000,
          is_default: false
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Mock successful insertion
      const mockSingle = jest.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      mockSupabaseClient.from.mockReturnValue({ insert: mockInsert });

      const constraintData = {
        name: 'Test Constraint',
        description: 'A test constraint',
        time_limit_ms: 300000,
        token_budget: 1000,
        memory_limit_mb: 512,
        cpu_limit_percent: 80,
        is_default: false
      };

      const result = await model.create(constraintData);

      expect(result.name).toBe('Test Constraint');
      expect(result.time_limit_ms).toBe(300000);
      expect(result.token_budget).toBe(1000);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('execution_constraints');
    });

    it('should handle database errors during creation', async () => {
      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      mockSupabaseClient.from.mockReturnValue({ insert: mockInsert });

      const constraintData = {
        name: 'Test Constraint',
        time_limit_ms: 300000
      };

      await expect(model.create(constraintData)).rejects.toThrow('Failed to create execution constraint');
    });
  });

  describe('evaluate', () => {
    it('should evaluate constraints correctly', async () => {
      const mockConstraint = {
        id: 'test-id',
        name: 'Test Constraint',
        time_limit_ms: 300000,
        token_budget: 1000,
        memory_limit_mb: 512,
        cpu_limit_percent: 80
      };

      // Mock findById
      jest.spyOn(model, 'findById').mockResolvedValue(mockConstraint);

      const context = {
        execution_time_ms: 250000, // Within limit
        current_tokens: 1200,      // Exceeds limit
        memory_usage_mb: 400,      // Within limit
        cpu_usage_percent: 90      // Exceeds limit
      };

      const result = await model.evaluate('test-id', context);

      expect(result.isValid).toBe(false);
      expect(result.violations).toHaveLength(2);

      // Check token violation
      const tokenViolation = result.violations.find(v => v.type === 'MAX_TOKENS');
      expect(tokenViolation).toBeDefined();
      expect(tokenViolation?.current).toBe(1200);
      expect(tokenViolation?.limit).toBe(1000);

      // Check CPU violation
      const cpuViolation = result.violations.find(v => v.type === 'CPU_LIMIT');
      expect(cpuViolation).toBeDefined();
      expect(cpuViolation?.current).toBe(90);
      expect(cpuViolation?.limit).toBe(80);
    });

    it('should pass evaluation when all constraints are met', async () => {
      const mockConstraint = {
        id: 'test-id',
        name: 'Test Constraint',
        time_limit_ms: 300000,
        token_budget: 1000,
        memory_limit_mb: 512,
        cpu_limit_percent: 80
      };

      jest.spyOn(model, 'findById').mockResolvedValue(mockConstraint);

      const context = {
        execution_time_ms: 250000, // Within limit
        current_tokens: 800,       // Within limit
        memory_usage_mb: 400,      // Within limit
        cpu_usage_percent: 70      // Within limit
      };

      const result = await model.evaluate('test-id', context);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('validateConstraint', () => {
    it('should validate constraint with at least one limit', () => {
      const constraint = {
        name: 'Test',
        time_limit_ms: 300000
      };

      const result = model.validateConstraint(constraint);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject constraint with no limits', () => {
      const constraint = {
        name: 'Test'
      };

      const result = model.validateConstraint(constraint);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one constraint limit must be specified');
    });

    it('should reject constraint with invalid CPU percentage', () => {
      const constraint = {
        name: 'Test',
        cpu_limit_percent: 150
      };

      const result = model.validateConstraint(constraint);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CPU limit must be between 1 and 100 percent');
    });

    it('should reject constraint with negative values', () => {
      const constraint = {
        name: 'Test',
        time_limit_ms: -1000,
        memory_limit_mb: -512
      };

      const result = model.validateConstraint(constraint);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Time limit must be positive');
      expect(result.errors).toContain('Memory limit must be positive');
    });
  });

  describe('findByType', () => {
    it('should filter constraints by type', async () => {
      const mockConstraints = [
        {
          id: '1',
          name: 'Time Constraint',
          time_limit_ms: 300000,
          token_budget: null,
          memory_limit_mb: null,
          cpu_limit_percent: null
        },
        {
          id: '2',
          name: 'Memory Constraint',
          time_limit_ms: null,
          token_budget: null,
          memory_limit_mb: 512,
          cpu_limit_percent: null
        },
        {
          id: '3',
          name: 'Token Constraint',
          time_limit_ms: null,
          token_budget: 1000,
          memory_limit_mb: null,
          cpu_limit_percent: null
        }
      ];

      jest.spyOn(model, 'findActive').mockResolvedValue(mockConstraints);

      const timeConstraints = await model.findByType('TIME_LIMIT');
      expect(timeConstraints).toHaveLength(1);
      expect(timeConstraints[0].name).toBe('Time Constraint');

      const memoryConstraints = await model.findByType('MEMORY_LIMIT');
      expect(memoryConstraints).toHaveLength(1);
      expect(memoryConstraints[0].name).toBe('Memory Constraint');

      const tokenConstraints = await model.findByType('MAX_TOKENS');
      expect(tokenConstraints).toHaveLength(1);
      expect(tokenConstraints[0].name).toBe('Token Constraint');
    });
  });
});