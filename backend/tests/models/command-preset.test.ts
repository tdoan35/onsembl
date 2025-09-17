/**
 * CommandPreset Model Tests
 *
 * Test suite for T072: CommandPreset model implementation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import {
  CommandPresetModel,
  CommandPresetError,
  CommandPresetNotFoundError,
  CommandPresetValidationError,
  TemplateExecutionError,
  type CommandPresetInsert,
  type TemplateExecutionContext,
  type VariableDefinition
} from '../../src/models/command-preset';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  channel: jest.fn(),
  removeChannel: jest.fn(),
} as any;

describe('CommandPresetModel', () => {
  let model: CommandPresetModel;
  let mockQuery: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock query chain
    mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      single: jest.fn(),
      not: jest.fn().mockReturnThis(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);
    model = new CommandPresetModel(mockSupabase);
  });

  afterEach(() => {
    model.unsubscribeAll();
  });

  describe('findAll', () => {
    it('should return all presets without filters', async () => {
      const mockData = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test Preset',
          category: 'Development',
          type: 'NATURAL',
          prompt_template: 'Hello {{name}}',
          variables: [],
          priority: 50,
          is_public: true,
          usage_count: 0,
          created_by: '123e4567-e89b-12d3-a456-426614174001',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        }
      ];

      mockQuery.order
        .mockReturnValueOnce(mockQuery) // First call returns mockQuery for chaining
        .mockResolvedValueOnce({ data: mockData, error: null }); // Second call returns result

      const result = await model.findAll();

      expect(mockSupabase.from).toHaveBeenCalledWith('command_presets');
      expect(mockQuery.select).toHaveBeenCalledWith('*');
      expect(result).toEqual(mockData);
    });

    it('should apply category filter', async () => {
      mockQuery.order
        .mockReturnValueOnce(mockQuery)
        .mockResolvedValueOnce({ data: [], error: null });

      await model.findAll({ category: 'Development' });

      expect(mockQuery.eq).toHaveBeenCalledWith('category', 'Development');
    });

    it('should apply search filter', async () => {
      mockQuery.order
        .mockReturnValueOnce(mockQuery)
        .mockResolvedValueOnce({ data: [], error: null });

      await model.findAll({ search: 'test' });

      expect(mockQuery.or).toHaveBeenCalledWith('name.ilike.%test%,description.ilike.%test%');
    });
  });

  describe('create', () => {
    it('should create a preset with valid data', async () => {
      const presetData: CommandPresetInsert = {
        name: 'Test Preset',
        description: 'A test preset',
        category: 'Development',
        type: 'NATURAL',
        prompt_template: 'Hello {{name}}',
        variables: [
          {
            name: 'name',
            type: 'string',
            description: 'User name',
            required: true
          } as VariableDefinition
        ],
        created_by: '123e4567-e89b-12d3-a456-426614174001'
      };

      const mockCreated = { ...presetData, id: '123e4567-e89b-12d3-a456-426614174000' };
      mockQuery.single.mockResolvedValue({ data: mockCreated, error: null });

      const result = await model.create(presetData);

      expect(mockSupabase.from).toHaveBeenCalledWith('command_presets');
      expect(mockQuery.insert).toHaveBeenCalled();
      expect(result).toEqual(mockCreated);
    });

    it('should throw validation error for invalid data', async () => {
      const invalidData = {
        name: '', // Invalid: empty name
        type: 'INVALID_TYPE',
        prompt_template: 'Hello',
        created_by: 'invalid-uuid'
      } as CommandPresetInsert;

      await expect(model.create(invalidData)).rejects.toThrow(CommandPresetValidationError);
    });
  });

  describe('execute', () => {
    it('should execute preset with valid variables', async () => {
      const mockPreset = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Preset',
        prompt_template: 'Hello {{name}}, you are {{age}} years old',
        variables: [
          {
            name: 'name',
            type: 'string',
            required: true
          },
          {
            name: 'age',
            type: 'number',
            required: true
          }
        ] as VariableDefinition[],
        usage_count: 5
      };

      // Mock findById call
      mockQuery.single.mockResolvedValueOnce({ data: mockPreset, error: null });

      // Mock update call for usage count increment
      mockQuery.update.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: { ...mockPreset, usage_count: 6 },
        error: null
      });

      const context: TemplateExecutionContext = {
        variables: {
          name: 'John',
          age: 30
        },
        agent_id: '123e4567-e89b-12d3-a456-426614174002'
      };

      const result = await model.execute('123e4567-e89b-12d3-a456-426614174000', context);

      expect(result.rendered_prompt).toBe('Hello John, you are 30 years old');
      expect(result.preset).toEqual(mockPreset);
      expect(result.execution_metadata.variables_used).toEqual(['name', 'age']);
    });

    it('should throw error for missing required variables', async () => {
      const mockPreset = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        variables: [
          {
            name: 'required_var',
            type: 'string',
            required: true
          }
        ] as VariableDefinition[]
      };

      mockQuery.single.mockResolvedValue({ data: mockPreset, error: null });

      const context: TemplateExecutionContext = {
        variables: {} // Missing required variable
      };

      await expect(
        model.execute('123e4567-e89b-12d3-a456-426614174000', context)
      ).rejects.toThrow(TemplateExecutionError);
    });
  });

  describe('validateTemplate', () => {
    it('should validate string variables correctly', () => {
      const preset = {
        variables: [
          {
            name: 'username',
            type: 'string',
            required: true,
            validation: {
              min_length: 3,
              max_length: 20
            }
          }
        ] as VariableDefinition[]
      } as any;

      const validResult = model.validateTemplate(preset, { username: 'john_doe' });
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      const invalidResult = model.validateTemplate(preset, { username: 'a' }); // Too short
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain("Variable 'username' must be at least 3 characters");
    });

    it('should validate number variables correctly', () => {
      const preset = {
        variables: [
          {
            name: 'age',
            type: 'number',
            required: true,
            validation: {
              min_value: 0,
              max_value: 150
            }
          }
        ] as VariableDefinition[]
      } as any;

      const validResult = model.validateTemplate(preset, { age: 25 });
      expect(validResult.valid).toBe(true);

      const invalidResult = model.validateTemplate(preset, { age: 200 }); // Too high
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain("Variable 'age' must be at most 150");
    });

    it('should validate select variables correctly', () => {
      const preset = {
        variables: [
          {
            name: 'priority',
            type: 'select',
            required: true,
            options: ['low', 'medium', 'high']
          }
        ] as VariableDefinition[]
      } as any;

      const validResult = model.validateTemplate(preset, { priority: 'medium' });
      expect(validResult.valid).toBe(true);

      const invalidResult = model.validateTemplate(preset, { priority: 'urgent' }); // Not in options
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain("Variable 'priority' must be one of: low, medium, high");
    });
  });

  describe('getCategories', () => {
    it('should return unique categories', async () => {
      const mockData = [
        { category: 'Development' },
        { category: 'Testing' },
        { category: 'Development' }, // Duplicate
        { category: 'Deployment' }
      ];

      mockQuery.not.mockResolvedValue({ data: mockData, error: null });

      const result = await model.getCategories();

      expect(result).toEqual(['Deployment', 'Development', 'Testing']); // Sorted and unique
    });
  });

  describe('error handling', () => {
    it('should throw CommandPresetNotFoundError when preset not found', async () => {
      mockQuery.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });

      await expect(model.findById('nonexistent')).rejects.toThrow(CommandPresetNotFoundError);
    });

    it('should throw CommandPresetError for database errors', async () => {
      mockQuery.order.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      await expect(model.findAll()).rejects.toThrow(CommandPresetError);
    });
  });
});