/**
 * AuditService for comprehensive audit logging - T081 Implementation
 *
 * Centralized audit logging service for Onsembl.ai Agent Control Center.
 * Provides specialized methods for different event types, automatic user context
 * capture, batch logging support for performance, and audit trail retrieval.
 *
 * Features:
 * - Service class with dependency injection for AuditLogModel
 * - Specialized methods for different event types (agent, command, system, auth)
 * - Automatic user context capture from request objects
 * - Batch logging support for high-volume events
 * - Query methods for audit trail retrieval with filtering
 * - 30-day retention cleanup functionality
 * - Error handling that doesn't disrupt main application flow
 * - Event emission for real-time audit monitoring
 * - Performance optimizations for high-throughput logging
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { EventEmitter } from 'events';
import {
  AuditLogModel,
  AuditEventType,
  AuditEntityType,
  AuditLogEntry,
  AuditLogFilters
} from '../models/audit-log';
import { AuthenticatedRequest } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { config } from '../config';

// Request context interface for capturing metadata
export interface RequestContext {
  ip_address?: string;
  user_agent?: string;
  user_id?: string;
  session_id?: string;
  request_id?: string;
}

// Batch logging entry interface
export interface BatchLogEntry {
  event_type: AuditEventType;
  entity_type: AuditEntityType;
  entity_id?: string | null;
  user_id?: string | null;
  action?: string;
  details?: Record<string, any>;
  context?: RequestContext;
}

// Audit service configuration
export interface AuditServiceConfig {
  batchSize?: number;
  batchTimeout?: number;
  enableBatching?: boolean;
  retentionDays?: number;
  maxRetries?: number;
}

// Audit service events for real-time monitoring
export interface AuditServiceEvents {
  'audit:event-logged': (entry: AuditLogEntry) => void;
  'audit:batch-processed': (count: number, duration: number) => void;
  'audit:error': (error: Error, context?: any) => void;
  'audit:cleanup-completed': (deletedCount: number) => void;
  'audit:metrics-updated': (metrics: AuditMetrics) => void;
}

// Audit metrics interface
export interface AuditMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByEntity: Record<string, number>;
  eventsPerMinute: number;
  batchedEvents: number;
  failedEvents: number;
  avgProcessingTime: number;
}

/**
 * AuditService - Comprehensive audit logging service
 *
 * Centralizes all audit logging functionality across the application with
 * specialized methods for different event types, automatic context capture,
 * batch processing, and comprehensive error handling.
 */
export class AuditService extends EventEmitter {
  private auditLogModel: AuditLogModel;
  private batchQueue: BatchLogEntry[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private metrics: AuditMetrics = {
    totalEvents: 0,
    eventsByType: {},
    eventsByEntity: {},
    eventsPerMinute: 0,
    batchedEvents: 0,
    failedEvents: 0,
    avgProcessingTime: 0,
  };
  private processingTimes: number[] = [];
  private metricsTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private fastify: FastifyInstance,
    private serviceConfig: AuditServiceConfig = {},
    supabaseClient?: ReturnType<typeof createClient<Database>>
  ) {
    super();

    // Initialize configuration with defaults
    this.serviceConfig = {
      batchSize: 10,
      batchTimeout: 5000, // 5 seconds
      enableBatching: true,
      retentionDays: 30,
      maxRetries: 3,
      ...serviceConfig,
    };

    // Initialize Supabase client and AuditLogModel
    const supabase = supabaseClient || createClient<Database>(
      config.supabaseUrl || process.env['SUPABASE_URL']!,
      config.supabaseServiceKey || process.env['SUPABASE_SERVICE_ROLE_KEY']!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    this.auditLogModel = new AuditLogModel(supabase);

    this.setupMetricsCollection();
    this.setupCleanupSchedule();

    this.fastify.log.info({
      config: this.serviceConfig
    }, 'AuditService initialized with comprehensive logging capabilities');
  }

  /**
   * Log a generic audit event with automatic context capture
   * @param eventType Type of audit event
   * @param entityType Type of entity involved
   * @param entityId ID of the entity
   * @param details Additional event details
   * @param request Optional Fastify request for context capture
   * @returns Promise resolving to the created audit log entry
   */
  async logEvent(
    eventType: AuditEventType,
    entityType: AuditEntityType,
    entityId?: string | null,
    details?: Record<string, any>,
    request?: FastifyRequest | AuthenticatedRequest
  ): Promise<AuditLogEntry | null> {
    const startTime = Date.now();

    try {
      const context = request ? this.extractRequestContext(request) : undefined;

      const entry: BatchLogEntry = {
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        user_id: context?.user_id,
        action: eventType,
        details: details || {},
        context,
      };

      let result: AuditLogEntry | null;

      if (this.serviceConfig.enableBatching) {
        result = await this.addToBatch(entry);
      } else {
        result = await this.logSingle(entry);
      }

      // Update metrics
      this.updateMetrics(eventType, entityType, Date.now() - startTime);

      if (result) {
        this.emit('audit:event-logged', result);
      }

      return result;
    } catch (error) {
      this.handleLoggingError(error, {
        eventType,
        entityType,
        entityId,
        details,
      });
      return null;
    }
  }

  /**
   * Log agent-specific events with specialized context
   * @param eventType Agent event type
   * @param agentId ID of the agent
   * @param details Agent-specific details (status, version, config, etc.)
   * @param request Optional request context
   * @returns Promise resolving to the created audit log entry
   */
  async logAgentEvent(
    eventType: 'AGENT_CONNECTED' | 'AGENT_DISCONNECTED' | AuditEventType,
    agentId: string,
    details?: {
      agentType?: string;
      version?: string;
      status?: string;
      capabilities?: string[];
      config?: Record<string, any>;
      error?: string;
      reason?: string;
      duration?: number;
    },
    request?: FastifyRequest | AuthenticatedRequest
  ): Promise<AuditLogEntry | null> {
    const enhancedDetails = {
      ...details,
      timestamp: new Date().toISOString(),
      component: 'agent',
    };

    return this.logEvent(
      eventType,
      'AGENT',
      agentId,
      enhancedDetails,
      request
    );
  }

  /**
   * Log command execution events with comprehensive context
   * @param eventType Command event type
   * @param commandId ID of the command
   * @param details Command-specific details
   * @param request Optional request context
   * @returns Promise resolving to the created audit log entry
   */
  async logCommandEvent(
    eventType: 'COMMAND_EXECUTED' | 'COMMAND_QUEUED' | 'COMMAND_COMPLETED' | 'COMMAND_FAILED' | 'COMMAND_CANCELLED' | 'EMERGENCY_STOP' | AuditEventType,
    commandId: string,
    details?: {
      command?: string;
      agentId?: string;
      priority?: number;
      status?: string;
      exitCode?: number;
      duration?: number;
      output?: string;
      error?: string;
      queuePosition?: number;
      executedBy?: string;
      cancelledBy?: string;
    },
    request?: FastifyRequest | AuthenticatedRequest
  ): Promise<AuditLogEntry | null> {
    const enhancedDetails = {
      ...details,
      timestamp: new Date().toISOString(),
      component: 'command',
    };

    return this.logEvent(
      eventType,
      'COMMAND',
      commandId,
      enhancedDetails,
      request
    );
  }

  /**
   * Log system-level events (startup, shutdown, configuration changes)
   * @param eventType System event type
   * @param systemComponent Component or service name
   * @param details System-specific details
   * @param request Optional request context
   * @returns Promise resolving to the created audit log entry
   */
  async logSystemEvent(
    eventType: 'SYSTEM_STARTED' | 'SYSTEM_STOPPED' | 'CONFIG_UPDATED' | AuditEventType,
    systemComponent: string,
    details?: {
      version?: string;
      config?: Record<string, any>;
      previousConfig?: Record<string, any>;
      updatedBy?: string;
      reason?: string;
      uptime?: number;
      memoryUsage?: number;
      error?: string;
    },
    request?: FastifyRequest | AuthenticatedRequest
  ): Promise<AuditLogEntry | null> {
    const enhancedDetails = {
      ...details,
      timestamp: new Date().toISOString(),
      component: 'system',
      hostname: process.env['HOSTNAME'] || 'unknown',
      nodeVersion: process.version,
      platform: process.platform,
    };

    return this.logEvent(
      eventType,
      'SYSTEM',
      systemComponent,
      enhancedDetails,
      request
    );
  }

  /**
   * Log authentication events with security context
   * @param eventType Auth event type
   * @param userId User ID or email
   * @param details Authentication-specific details
   * @param request Optional request context
   * @returns Promise resolving to the created audit log entry
   */
  async logAuthEvent(
    eventType: 'USER_LOGIN' | 'USER_LOGOUT' | AuditEventType,
    userId: string,
    details?: {
      email?: string;
      method?: string;
      success?: boolean;
      error?: string;
      sessionDuration?: number;
      tokenType?: string;
      deviceInfo?: string;
      location?: string;
      riskScore?: number;
    },
    request?: FastifyRequest | AuthenticatedRequest
  ): Promise<AuditLogEntry | null> {
    const enhancedDetails = {
      ...details,
      timestamp: new Date().toISOString(),
      component: 'auth',
      securityContext: {
        ipAddress: this.extractRequestContext(request)?.ip_address,
        userAgent: this.extractRequestContext(request)?.user_agent,
        sessionId: this.extractRequestContext(request)?.session_id,
      },
    };

    return this.logEvent(
      eventType,
      'USER',
      userId,
      enhancedDetails,
      request
    );
  }

  /**
   * Process multiple audit events in a single batch
   * @param entries Array of batch log entries
   * @returns Promise resolving to array of created audit log entries
   */
  async logBatch(entries: BatchLogEntry[]): Promise<AuditLogEntry[]> {
    const startTime = Date.now();
    const results: AuditLogEntry[] = [];

    try {
      this.fastify.log.debug({ batchSize: entries.length }, 'Processing audit log batch');

      // Process entries in parallel with retry logic
      const promises = entries.map(async (entry, index) => {
        try {
          return await this.logSingleWithRetry(entry);
        } catch (error) {
          this.fastify.log.error({ error, entryIndex: index }, 'Failed to log batch entry');
          this.metrics.failedEvents++;
          return null;
        }
      });

      const batchResults = await Promise.allSettled(promises);

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      });

      const duration = Date.now() - startTime;
      this.metrics.batchedEvents += results.length;
      this.emit('audit:batch-processed', results.length, duration);

      this.fastify.log.info({
        batchSize: entries.length,
        successful: results.length,
        failed: entries.length - results.length,
        duration
      }, 'Audit log batch processed');

      return results;
    } catch (error) {
      this.fastify.log.error({ error }, 'Batch logging failed');
      throw error;
    }
  }

  /**
   * Search audit logs with advanced filtering
   * @param filters Search filters
   * @returns Promise resolving to matching audit log entries
   */
  async searchAuditLogs(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    try {
      return await this.auditLogModel.search(filters);
    } catch (error) {
      this.fastify.log.error({ error, filters }, 'Audit log search failed');
      throw error;
    }
  }

  /**
   * Get audit logs for a specific entity
   * @param entityType Type of entity
   * @param entityId Optional specific entity ID
   * @param limit Number of results to return
   * @returns Promise resolving to audit log entries
   */
  async getEntityAuditTrail(
    entityType: AuditEntityType | string,
    entityId?: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    try {
      return await this.auditLogModel.findByEntity(entityType, entityId, limit);
    } catch (error) {
      this.fastify.log.error({ error, entityType, entityId }, 'Failed to get entity audit trail');
      throw error;
    }
  }

  /**
   * Get audit logs for a specific user
   * @param userId User ID
   * @param limit Number of results to return
   * @returns Promise resolving to audit log entries
   */
  async getUserAuditTrail(
    userId: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    try {
      return await this.auditLogModel.findByUser(userId, limit);
    } catch (error) {
      this.fastify.log.error({ error, userId }, 'Failed to get user audit trail');
      throw error;
    }
  }

  /**
   * Get audit logs within a date range
   * @param startDate Start date (ISO string)
   * @param endDate End date (ISO string)
   * @param filters Optional additional filters
   * @returns Promise resolving to audit log entries
   */
  async getAuditLogsByDateRange(
    startDate: string,
    endDate: string,
    filters?: Omit<AuditLogFilters, 'start_date' | 'end_date'>
  ): Promise<AuditLogEntry[]> {
    try {
      return await this.auditLogModel.findByDateRange(startDate, endDate, filters);
    } catch (error) {
      this.fastify.log.error({ error, startDate, endDate }, 'Failed to get audit logs by date range');
      throw error;
    }
  }

  /**
   * Get audit statistics and metrics
   * @param filters Optional filters to apply
   * @returns Promise resolving to statistics object
   */
  async getAuditStatistics(filters?: {
    user_id?: string;
    entity_type?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    total: number;
    by_action: Record<string, number>;
    by_entity_type: Record<string, number>;
    unique_users: number;
  }> {
    try {
      return await this.auditLogModel.getStatistics(filters);
    } catch (error) {
      this.fastify.log.error({ error, filters }, 'Failed to get audit statistics');
      throw error;
    }
  }

  /**
   * Get real-time audit metrics for monitoring
   * @returns Current audit service metrics
   */
  getMetrics(): AuditMetrics {
    return { ...this.metrics };
  }

  /**
   * Clean up old audit logs according to retention policy
   * @param retentionDays Number of days to retain (default from config)
   * @returns Promise resolving to number of deleted records
   */
  async cleanupOldLogs(retentionDays?: number): Promise<number> {
    try {
      const retention = retentionDays || this.serviceConfig.retentionDays!;

      this.fastify.log.info({ retentionDays: retention }, 'Starting audit log cleanup');

      const deletedCount = await this.auditLogModel.prune();

      this.emit('audit:cleanup-completed', deletedCount);

      this.fastify.log.info({ deletedCount, retentionDays: retention }, 'Audit log cleanup completed');

      return deletedCount;
    } catch (error) {
      this.fastify.log.error({ error }, 'Audit log cleanup failed');
      throw error;
    }
  }

  /**
   * Get count of logs that would be pruned
   * @param retentionDays Number of days for retention
   * @returns Promise resolving to count of pruneable logs
   */
  async getPruneableLogCount(retentionDays?: number): Promise<number> {
    try {
      const retention = retentionDays || this.serviceConfig.retentionDays!;
      return await this.auditLogModel.getPruneableCount(retention);
    } catch (error) {
      this.fastify.log.error({ error }, 'Failed to get pruneable log count');
      throw error;
    }
  }

  /**
   * Flush any pending batched entries immediately
   * @returns Promise resolving when flush is complete
   */
  async flush(): Promise<void> {
    if (this.batchQueue.length > 0) {
      const entriesToProcess = [...this.batchQueue];
      this.batchQueue = [];

      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      await this.logBatch(entriesToProcess);
    }
  }

  /**
   * Health check for audit service
   * @returns Service health status
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    queueSize: number;
    metrics: AuditMetrics;
    details?: string;
  }> {
    try {
      return {
        healthy: true,
        queueSize: this.batchQueue.length,
        metrics: this.getMetrics(),
        details: 'All systems operational',
      };
    } catch (error) {
      return {
        healthy: false,
        queueSize: this.batchQueue.length,
        metrics: this.getMetrics(),
        details: `Health check failed: ${error}`,
      };
    }
  }

  /**
   * Cleanup resources when service is shutting down
   */
  async cleanup(): Promise<void> {
    try {
      // Flush any pending batch entries
      await this.flush();

      // Clear timers
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = null;
      }

      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      // Log cleanup event
      await this.logSystemEvent(
        'SYSTEM_STOPPED',
        'audit-service',
        {
          component: 'AuditService',
          totalEventsLogged: this.metrics.totalEvents,
          batchedEvents: this.metrics.batchedEvents,
          failedEvents: this.metrics.failedEvents,
        }
      );

      this.removeAllListeners();

      this.fastify.log.info('AuditService cleanup completed');
    } catch (error) {
      this.fastify.log.error({ error }, 'Error during AuditService cleanup');
    }
  }

  /**
   * Extract request context from Fastify request
   * @param request Fastify request object
   * @returns Request context object
   */
  private extractRequestContext(request?: FastifyRequest | AuthenticatedRequest): RequestContext {
    if (!request) return {};

    const authenticatedRequest = request as AuthenticatedRequest;

    return {
      ip_address: request.ip || request.headers['x-forwarded-for'] as string || 'unknown',
      user_agent: request.headers['user-agent'] || 'unknown',
      user_id: authenticatedRequest.user?.id,
      session_id: request.headers['x-session-id'] as string,
      request_id: request.id,
    };
  }

  /**
   * Add entry to batch queue or process immediately
   * @param entry Batch log entry
   * @returns Promise resolving to audit log entry if processed immediately
   */
  private async addToBatch(entry: BatchLogEntry): Promise<AuditLogEntry | null> {
    this.batchQueue.push(entry);

    if (this.batchQueue.length >= this.serviceConfig.batchSize!) {
      // Process batch immediately when it reaches the configured size
      const entriesToProcess = [...this.batchQueue];
      this.batchQueue = [];

      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      const results = await this.logBatch(entriesToProcess);
      return results[results.length - 1] || null;
    } else if (!this.batchTimer) {
      // Set timeout to process batch after configured delay
      this.batchTimer = setTimeout(async () => {
        if (this.batchQueue.length > 0) {
          const entriesToProcess = [...this.batchQueue];
          this.batchQueue = [];
          this.batchTimer = null;

          await this.logBatch(entriesToProcess);
        }
      }, this.serviceConfig.batchTimeout!);
    }

    return null; // Entry added to batch, will be processed later
  }

  /**
   * Log a single entry immediately
   * @param entry Batch log entry
   * @returns Promise resolving to audit log entry
   */
  private async logSingle(entry: BatchLogEntry): Promise<AuditLogEntry> {
    return await this.auditLogModel.create({
      event_type: entry.event_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      user_id: entry.user_id,
      action: entry.action,
      details: entry.details,
      ip_address: entry.context?.ip_address,
      user_agent: entry.context?.user_agent,
    });
  }

  /**
   * Log a single entry with retry logic
   * @param entry Batch log entry
   * @returns Promise resolving to audit log entry
   */
  private async logSingleWithRetry(entry: BatchLogEntry): Promise<AuditLogEntry> {
    let lastError: Error;
    const maxRetries = this.serviceConfig.maxRetries!;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.logSingle(entry);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));

          this.fastify.log.warn({
            error: error,
            attempt,
            maxRetries,
            nextRetryIn: delay
          }, 'Audit log attempt failed, retrying...');
        }
      }
    }

    throw lastError!;
  }

  /**
   * Handle logging errors without disrupting main application flow
   * @param error Error that occurred
   * @param context Context information
   */
  private handleLoggingError(error: any, context: any): void {
    this.metrics.failedEvents++;
    this.emit('audit:error', error, context);

    // Log error but don't throw to avoid disrupting main application
    this.fastify.log.error({
      error,
      context,
      failedEvents: this.metrics.failedEvents
    }, 'Audit logging error - main application flow not affected');
  }

  /**
   * Update internal metrics
   * @param eventType Event type
   * @param entityType Entity type
   * @param processingTime Processing time in milliseconds
   */
  private updateMetrics(eventType: AuditEventType, entityType: AuditEntityType, processingTime: number): void {
    this.metrics.totalEvents++;
    this.metrics.eventsByType[eventType] = (this.metrics.eventsByType[eventType] || 0) + 1;
    this.metrics.eventsByEntity[entityType] = (this.metrics.eventsByEntity[entityType] || 0) + 1;

    // Track processing times for average calculation
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift(); // Keep only last 100 measurements
    }

    this.metrics.avgProcessingTime = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  /**
   * Setup metrics collection and periodic emission
   */
  private setupMetricsCollection(): void {
    let lastEventCount = 0;

    this.metricsTimer = setInterval(() => {
      const currentEventCount = this.metrics.totalEvents;
      this.metrics.eventsPerMinute = currentEventCount - lastEventCount;
      lastEventCount = currentEventCount;

      this.emit('audit:metrics-updated', this.getMetrics());
    }, 60000); // Every minute
  }

  /**
   * Setup automatic cleanup schedule
   */
  private setupCleanupSchedule(): void {
    // Run cleanup once per day at 2 AM
    const now = new Date();
    const tomorrow2AM = new Date(now);
    tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
    tomorrow2AM.setHours(2, 0, 0, 0);

    const timeUntil2AM = tomorrow2AM.getTime() - now.getTime();

    setTimeout(() => {
      this.cleanupOldLogs().catch(error => {
        this.fastify.log.error({ error }, 'Scheduled audit log cleanup failed');
      });

      // Schedule daily cleanup
      this.cleanupTimer = setInterval(async () => {
        try {
          await this.cleanupOldLogs();
        } catch (error) {
          this.fastify.log.error({ error }, 'Scheduled audit log cleanup failed');
        }
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, timeUntil2AM);

    this.fastify.log.info({
      nextCleanup: tomorrow2AM.toISOString(),
      retentionDays: this.serviceConfig.retentionDays
    }, 'Scheduled daily audit log cleanup');
  }
}