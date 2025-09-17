/**
 * Type definition tests
 *
 * Tests the TypeScript types and interfaces used throughout the system
 */

import type {
  QueuedCommand,
  CommandJobData,
  CommandJobResult,
  QueueMetrics,
  AgentAvailability,
  QueueConfiguration,
  CommandFilter,
  InterruptRequest,
  InterruptResult
} from '../src/types.js';

describe('Type Definitions', () => {
  describe('QueuedCommand', () => {
    it('should extend base Command with queue-specific properties', () => {
      const queuedCommand: QueuedCommand = {
        id: 'test-cmd',
        type: 'execute',
        content: 'test content',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3,
        estimatedDuration: 5000,
        lastError: 'Previous error message'
      };

      expect(queuedCommand.id).toBe('test-cmd');
      expect(queuedCommand.queuedAt).toBeDefined();
      expect(queuedCommand.attemptCount).toBe(0);
      expect(queuedCommand.maxAttempts).toBe(3);
      expect(queuedCommand.estimatedDuration).toBe(5000);
      expect(queuedCommand.lastError).toBe('Previous error message');
    });

    it('should support optional properties', () => {
      const minimalCommand: QueuedCommand = {
        id: 'minimal-cmd',
        type: 'execute',
        content: 'minimal content',
        createdAt: Date.now(),
        status: 'pending',
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      expect(minimalCommand.estimatedDuration).toBeUndefined();
      expect(minimalCommand.lastError).toBeUndefined();
    });
  });

  describe('CommandJobData', () => {
    it('should contain all required job data properties', () => {
      const jobData: CommandJobData = {
        command: {
          id: 'test-cmd',
          type: 'execute',
          content: 'test content',
          createdAt: Date.now(),
          status: 'pending',
          queuedAt: Date.now(),
          attemptCount: 0,
          maxAttempts: 3
        },
        agentId: 'test-agent',
        userId: 'test-user',
        priority: 75,
        executionConstraints: {
          timeLimitMs: 30000,
          tokenBudget: 1000
        }
      };

      expect(jobData.command).toBeDefined();
      expect(jobData.agentId).toBe('test-agent');
      expect(jobData.userId).toBe('test-user');
      expect(jobData.priority).toBe(75);
      expect(jobData.executionConstraints?.timeLimitMs).toBe(30000);
      expect(jobData.executionConstraints?.tokenBudget).toBe(1000);
    });

    it('should support optional properties', () => {
      const minimalJobData: CommandJobData = {
        command: {
          id: 'test-cmd',
          type: 'execute',
          content: 'test content',
          createdAt: Date.now(),
          status: 'pending',
          queuedAt: Date.now(),
          attemptCount: 0,
          maxAttempts: 3
        },
        agentId: undefined,
        userId: 'test-user',
        priority: 50,
        executionConstraints: undefined
      };

      expect(minimalJobData.agentId).toBeUndefined();
      expect(minimalJobData.executionConstraints).toBeUndefined();
    });

    it('should support interruption data', () => {
      const interruptedJobData: CommandJobData = {
        command: {
          id: 'test-cmd',
          type: 'execute',
          content: 'test content',
          createdAt: Date.now(),
          status: 'pending',
          queuedAt: Date.now(),
          attemptCount: 0,
          maxAttempts: 3
        },
        agentId: 'test-agent',
        userId: 'test-user',
        priority: 50,
        executionConstraints: undefined,
        interruptReason: 'User cancelled operation'
      };

      expect(interruptedJobData.interruptReason).toBe('User cancelled operation');
    });
  });

  describe('CommandJobResult', () => {
    it('should contain all required result properties', () => {
      const successResult: CommandJobResult = {
        success: true,
        commandId: 'test-cmd',
        agentId: 'test-agent',
        executionTime: 2500,
        tokensUsed: 150,
        output: 'Command executed successfully'
      };

      expect(successResult.success).toBe(true);
      expect(successResult.commandId).toBe('test-cmd');
      expect(successResult.agentId).toBe('test-agent');
      expect(successResult.executionTime).toBe(2500);
      expect(successResult.tokensUsed).toBe(150);
      expect(successResult.output).toBe('Command executed successfully');
    });

    it('should support error results', () => {
      const errorResult: CommandJobResult = {
        success: false,
        commandId: 'failed-cmd',
        agentId: 'test-agent',
        executionTime: 1000,
        tokensUsed: 50,
        error: 'Command execution failed'
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toBe('Command execution failed');
      expect(errorResult.output).toBeUndefined();
    });
  });

  describe('QueueMetrics', () => {
    it('should contain comprehensive queue statistics', () => {
      const metrics: QueueMetrics = {
        totalJobs: 100,
        waitingJobs: 15,
        activeJobs: 5,
        completedJobs: 75,
        failedJobs: 5,
        avgWaitTime: 2500,
        avgProcessingTime: 5000,
        throughputPerHour: 120
      };

      expect(metrics.totalJobs).toBe(100);
      expect(metrics.waitingJobs).toBe(15);
      expect(metrics.activeJobs).toBe(5);
      expect(metrics.completedJobs).toBe(75);
      expect(metrics.failedJobs).toBe(5);
      expect(metrics.avgWaitTime).toBe(2500);
      expect(metrics.avgProcessingTime).toBe(5000);
      expect(metrics.throughputPerHour).toBe(120);
    });
  });

  describe('AgentAvailability', () => {
    it('should track agent status and health', () => {
      const availability: AgentAvailability = {
        agentId: 'agent-1',
        isAvailable: true,
        currentCommandId: 'active-cmd',
        queuedCommands: 3,
        healthScore: 95,
        lastSeen: Date.now()
      };

      expect(availability.agentId).toBe('agent-1');
      expect(availability.isAvailable).toBe(true);
      expect(availability.currentCommandId).toBe('active-cmd');
      expect(availability.queuedCommands).toBe(3);
      expect(availability.healthScore).toBe(95);
      expect(availability.lastSeen).toBeDefined();
    });

    it('should support unavailable agents', () => {
      const unavailable: AgentAvailability = {
        agentId: 'agent-2',
        isAvailable: false,
        queuedCommands: 0,
        healthScore: 0,
        lastSeen: Date.now() - 60000
      };

      expect(unavailable.isAvailable).toBe(false);
      expect(unavailable.currentCommandId).toBeUndefined();
      expect(unavailable.queuedCommands).toBe(0);
    });
  });

  describe('QueueConfiguration', () => {
    it('should define complete configuration structure', () => {
      const config: QueueConfiguration = {
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret',
          db: 1,
          keyPrefix: 'test:'
        },
        queue: {
          name: 'test-queue',
          defaultJobOptions: {
            removeOnComplete: 10,
            removeOnFail: 5,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          },
          concurrency: 5,
          maxStalledCount: 1,
          stalledInterval: 30000
        },
        priorities: {
          emergency: 100,
          high: 75,
          normal: 50,
          low: 25
        }
      };

      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);
      expect(config.queue.name).toBe('test-queue');
      expect(config.queue.defaultJobOptions.attempts).toBe(3);
      expect(config.queue.defaultJobOptions.backoff.type).toBe('exponential');
      expect(config.priorities.emergency).toBe(100);
    });

    it('should support optional configuration properties', () => {
      const minimalConfig: QueueConfiguration = {
        redis: {
          host: 'localhost',
          port: 6379
        },
        queue: {
          name: 'minimal-queue',
          defaultJobOptions: {
            removeOnComplete: 10,
            removeOnFail: 5,
            attempts: 3,
            backoff: {
              type: 'fixed',
              delay: 1000
            }
          }
        },
        priorities: {
          emergency: 100,
          high: 75,
          normal: 50,
          low: 25
        }
      };

      expect(minimalConfig.redis.password).toBeUndefined();
      expect(minimalConfig.redis.db).toBeUndefined();
      expect(minimalConfig.queue.concurrency).toBeUndefined();
    });
  });

  describe('CommandFilter', () => {
    it('should support comprehensive filtering options', () => {
      const filter: CommandFilter = {
        agentId: 'agent-1',
        userId: 'user-1',
        commandType: 'execute',
        status: 'completed',
        priority: {
          min: 50,
          max: 100
        },
        dateRange: {
          from: Date.now() - 86400000, // 24 hours ago
          to: Date.now()
        }
      };

      expect(filter.agentId).toBe('agent-1');
      expect(filter.userId).toBe('user-1');
      expect(filter.commandType).toBe('execute');
      expect(filter.status).toBe('completed');
      expect(filter.priority?.min).toBe(50);
      expect(filter.priority?.max).toBe(100);
      expect(filter.dateRange?.from).toBeDefined();
      expect(filter.dateRange?.to).toBeDefined();
    });

    it('should support partial filtering', () => {
      const partialFilter: CommandFilter = {
        userId: 'user-1',
        priority: {
          min: 75
        }
      };

      expect(partialFilter.agentId).toBeUndefined();
      expect(partialFilter.commandType).toBeUndefined();
      expect(partialFilter.priority?.max).toBeUndefined();
      expect(partialFilter.dateRange).toBeUndefined();
    });
  });

  describe('InterruptRequest', () => {
    it('should define interrupt request structure', () => {
      const request: InterruptRequest = {
        commandId: 'cmd-to-interrupt',
        reason: 'User requested cancellation',
        force: false,
        timeout: 5000
      };

      expect(request.commandId).toBe('cmd-to-interrupt');
      expect(request.reason).toBe('User requested cancellation');
      expect(request.force).toBe(false);
      expect(request.timeout).toBe(5000);
    });

    it('should support forced interruption', () => {
      const forcedRequest: InterruptRequest = {
        commandId: 'cmd-to-force-stop',
        reason: 'Emergency shutdown',
        force: true
      };

      expect(forcedRequest.force).toBe(true);
      expect(forcedRequest.timeout).toBeUndefined();
    });
  });

  describe('InterruptResult', () => {
    it('should define successful interrupt result', () => {
      const successResult: InterruptResult = {
        success: true,
        commandId: 'interrupted-cmd',
        wasInterrupted: true,
        reason: 'User cancelled operation'
      };

      expect(successResult.success).toBe(true);
      expect(successResult.commandId).toBe('interrupted-cmd');
      expect(successResult.wasInterrupted).toBe(true);
      expect(successResult.reason).toBe('User cancelled operation');
      expect(successResult.error).toBeUndefined();
    });

    it('should define failed interrupt result', () => {
      const failedResult: InterruptResult = {
        success: false,
        commandId: 'failed-interrupt-cmd',
        wasInterrupted: false,
        error: 'Command not found'
      };

      expect(failedResult.success).toBe(false);
      expect(failedResult.wasInterrupted).toBe(false);
      expect(failedResult.error).toBe('Command not found');
      expect(failedResult.reason).toBeUndefined();
    });
  });

  describe('Type Compatibility', () => {
    it('should ensure command types are compatible across interfaces', () => {
      const baseCommand = {
        id: 'compatibility-test',
        type: 'execute' as const,
        content: 'test content',
        createdAt: Date.now(),
        status: 'pending' as const
      };

      const queuedCommand: QueuedCommand = {
        ...baseCommand,
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: 3
      };

      const jobData: CommandJobData = {
        command: queuedCommand,
        agentId: 'test-agent',
        userId: 'test-user',
        priority: 50,
        executionConstraints: undefined
      };

      // Types should be compatible
      expect(jobData.command.id).toBe(baseCommand.id);
      expect(jobData.command.type).toBe(baseCommand.type);
      expect(jobData.command.status).toBe(baseCommand.status);
    });

    it('should ensure priority values are numbers', () => {
      const priorities = {
        emergency: 100,
        high: 75,
        normal: 50,
        low: 25
      };

      // TypeScript should enforce these as numbers
      expect(typeof priorities.emergency).toBe('number');
      expect(typeof priorities.high).toBe('number');
      expect(typeof priorities.normal).toBe('number');
      expect(typeof priorities.low).toBe('number');

      // Should maintain ordering
      expect(priorities.emergency).toBeGreaterThan(priorities.high);
      expect(priorities.high).toBeGreaterThan(priorities.normal);
      expect(priorities.normal).toBeGreaterThan(priorities.low);
    });

    it('should ensure execution constraints are properly typed', () => {
      const constraints = {
        timeLimitMs: 30000,
        tokenBudget: 1000
      };

      // Both should be optional numbers
      expect(typeof constraints.timeLimitMs).toBe('number');
      expect(typeof constraints.tokenBudget).toBe('number');

      const optionalConstraints: { timeLimitMs?: number; tokenBudget?: number } = {
        timeLimitMs: 5000
      };

      expect(optionalConstraints.timeLimitMs).toBe(5000);
      expect(optionalConstraints.tokenBudget).toBeUndefined();
    });
  });
});