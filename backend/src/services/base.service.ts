/**
 * Base service class with database connection validation
 * All services that need database access should extend this
 */

import { FastifyInstance } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseErrorMessages } from '../database/error-messages.js';
import { SupabaseValidator } from '../database/supabase-validator.js';

export abstract class BaseService {
  protected fastify: FastifyInstance;
  protected supabase: SupabaseClient | null;
  private isConfigured: boolean;

  constructor(
    fastify: FastifyInstance,
    supabase?: SupabaseClient | null
  ) {
    this.fastify = fastify;
    this.supabase = supabase || null;
    this.isConfigured = SupabaseValidator.isConfigured();
  }

  /**
   * Validate database connection before operations
   * @throws Error if database is not available
   */
  protected async validateConnection(): Promise<void> {
    if (!this.supabase) {
      const error = DatabaseErrorMessages.getError('DB_NOT_CONFIGURED');
      this.fastify.log.error(
        DatabaseErrorMessages.formatForLog(error),
        'Database operation attempted without connection'
      );

      throw new Error(error.message);
    }

    // Check if connection is still alive
    try {
      const { error } = await this.supabase
        .from('_connection_check')
        .select('count')
        .limit(1)
        .single();

      // Table doesn't exist error is OK (connection works)
      if (error && error.code !== 'PGRST116') {
        const dbError = DatabaseErrorMessages.getError('CONNECTION_FAILED', {
          error: error.message
        });

        this.fastify.log.error(
          DatabaseErrorMessages.formatForLog(dbError),
          'Database connection check failed'
        );

        throw new Error(dbError.message);
      }
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('DB_NOT_CONFIGURED') ||
          error.message.includes('CONNECTION_FAILED')) {
        throw error;
      }

      const dbError = DatabaseErrorMessages.getError('CONNECTION_FAILED', {
        error: error.message
      });

      this.fastify.log.error(
        DatabaseErrorMessages.formatForLog(dbError),
        'Unexpected database connection error'
      );

      throw new Error(dbError.message);
    }
  }

  /**
   * Check if database is configured (doesn't validate connection)
   */
  protected isDatabaseConfigured(): boolean {
    return this.isConfigured && this.supabase !== null;
  }

  /**
   * Execute database operation with validation
   */
  protected async withDatabase<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      await this.validateConnection();
      return await operation();
    } catch (error) {
      const err = error as Error;

      // Check if error is recoverable
      const errorCode = this.extractErrorCode(err);
      if (DatabaseErrorMessages.isRecoverable(errorCode)) {
        const retryAdvice = DatabaseErrorMessages.getRetryAdvice(errorCode, 1);
        if (retryAdvice) {
          this.fastify.log.info(retryAdvice);
        }
      }

      this.fastify.log.error(
        {
          operation: operationName,
          error: err.message
        },
        'Database operation failed'
      );

      throw error;
    }
  }

  /**
   * Execute database operation with retries
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.withDatabase(operation, operationName);
      } catch (error) {
        lastError = error as Error;
        const errorCode = this.extractErrorCode(lastError);

        if (!DatabaseErrorMessages.isRecoverable(errorCode)) {
          throw lastError;
        }

        const retryAdvice = DatabaseErrorMessages.getRetryAdvice(errorCode, attempt);
        if (retryAdvice) {
          this.fastify.log.info(retryAdvice);
        }

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get mock response when database is not available
   */
  protected getMockResponse<T>(defaultValue: T, message?: string): T {
    const msg = message || 'Returning mock data - database not configured';
    this.fastify.log.debug(msg);
    return defaultValue;
  }

  /**
   * Handle database errors consistently
   */
  protected handleDatabaseError(error: any, context: Record<string, any>): void {
    const err = error as Error;
    const errorCode = this.extractErrorCode(err);
    const dbError = DatabaseErrorMessages.getError(errorCode, {
      ...context,
      error: err.message
    });

    this.fastify.log.error(
      DatabaseErrorMessages.formatForLog(dbError, context),
      'Database error occurred'
    );

    // Return formatted error for API response
    const apiError = DatabaseErrorMessages.formatForApi(dbError);
    throw apiError;
  }

  /**
   * Extract error code from error object
   */
  private extractErrorCode(error: Error): string {
    // Check for known Supabase error patterns
    if (error.message.includes('Failed to connect')) {
      return 'CONNECTION_FAILED';
    }
    if (error.message.includes('permission denied')) {
      return 'PERMISSION_DENIED';
    }
    if (error.message.includes('does not exist')) {
      return 'TABLE_NOT_FOUND';
    }
    if (error.message.includes('timeout')) {
      return 'TIMEOUT';
    }
    if (error.message.includes('rate limit')) {
      return 'RATE_LIMITED';
    }
    if (error.message.includes('authentication')) {
      return 'AUTH_FAILED';
    }
    if (error.message.includes('DB_NOT_CONFIGURED')) {
      return 'DB_NOT_CONFIGURED';
    }

    // Check for error code property
    if ('code' in error && typeof error.code === 'string') {
      return error.code;
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Log service operation
   */
  protected logOperation(operation: string, details?: Record<string, any>): void {
    this.fastify.log.debug(
      {
        service: this.constructor.name,
        operation,
        ...details
      },
      `Service operation: ${operation}`
    );
  }
}