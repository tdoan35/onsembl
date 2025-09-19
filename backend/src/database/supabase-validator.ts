/**
 * Supabase connection validator
 * Validates and tests Supabase configuration
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';

export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

export interface ValidationResult {
  valid: boolean;
  configured: boolean;
  environment: 'production' | 'local' | 'none';
  errors: string[];
  warnings: string[];
  connectionString?: string;
}

export class SupabaseValidator {
  private logger: FastifyInstance['log'];
  private config: SupabaseConfig;
  private client: SupabaseClient | null = null;

  constructor(logger: FastifyInstance['log']) {
    this.logger = logger;
    this.config = {
      url: process.env['SUPABASE_URL'],
      anonKey: process.env['SUPABASE_ANON_KEY'],
      serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SERVICE_KEY']
    };
  }

  /**
   * Validate Supabase configuration
   */
  async validate(): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: false,
      configured: false,
      environment: 'none',
      errors: [],
      warnings: []
    };

    // Check if any configuration exists
    if (!this.config.url && !this.config.anonKey) {
      result.errors.push('Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
      result.errors.push('To set up Supabase locally: npx supabase init && npx supabase start');
      return result;
    }

    // Validate URL
    if (!this.config.url) {
      result.errors.push('SUPABASE_URL environment variable is not set.');
    } else if (!this.isValidUrl(this.config.url)) {
      result.errors.push(`Invalid Supabase URL format: ${this.config.url}`);
      result.errors.push('Expected format: https://[project-ref].supabase.co or http://localhost:54321');
    }

    // Validate anon key
    if (!this.config.anonKey) {
      result.errors.push('SUPABASE_ANON_KEY environment variable is not set.');
    } else if (!this.isValidKey(this.config.anonKey)) {
      result.warnings.push('SUPABASE_ANON_KEY appears to be invalid (not a valid JWT format).');
    }

    // Check for service role key (optional but recommended)
    if (!this.config.serviceRoleKey) {
      result.warnings.push('SUPABASE_SERVICE_ROLE_KEY not set. Some operations may be limited.');
    }

    // If basic validation passed, try to create client
    if (this.config.url && this.config.anonKey) {
      result.configured = true;
      result.environment = this.detectEnvironment(this.config.url);

      try {
        const clientKey = this.config.serviceRoleKey || this.config.anonKey;
        this.client = createClient(this.config.url, clientKey!);

        // Test connection with a simple query
        const testResult = await this.testConnection();

        if (testResult.success) {
          result.valid = true;
          result.connectionString = this.config.url;
          this.logger.info({
            environment: result.environment,
            url: this.config.url
          }, 'Supabase connection validated successfully');
        } else {
          result.errors.push(`Failed to connect to Supabase: ${testResult.error}`);
          result.warnings.push('Please check your network connection and Supabase project status.');
        }
      } catch (error) {
        const err = error as Error;
        result.errors.push(`Failed to initialize Supabase client: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Test actual connection to Supabase
   */
  private async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      return { success: false, error: 'Client not initialized' };
    }

    try {
      // Try a simple health check query on a known table
      const { error } = await this.client
        .from('agents')  // Use a real table from our schema
        .select('id')
        .limit(1);

      // Check various error conditions
      if (error) {
        // Table doesn't exist - need to run migrations
        if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          return { success: true };  // Connection works, just needs migrations
        }
        // Permission denied - RLS might be enabled
        if (error.code === '42501' || error.message?.includes('permission denied')) {
          return { success: true };  // Connection works, just RLS blocking
        }
        // Real connection error
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message };
    }
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Check for valid Supabase URLs
      const validPatterns = [
        /^https:\/\/[a-z0-9-]+\.supabase\.co$/,  // Production
        /^http:\/\/localhost:\d+$/,               // Local
        /^http:\/\/127\.0\.0\.1:\d+$/,           // Local IP
        /^https:\/\/[a-z0-9-]+\.supabase\.in$/   // Self-hosted
      ];

      return validPatterns.some(pattern => pattern.test(parsed.origin));
    } catch {
      return false;
    }
  }

  /**
   * Validate JWT key format
   */
  private isValidKey(key: string): boolean {
    // Basic JWT format validation
    const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    return jwtPattern.test(key);
  }

  /**
   * Detect environment type from URL
   */
  private detectEnvironment(url: string): 'production' | 'local' | 'none' {
    if (!url) return 'none';

    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return 'local';
    }

    if (url.includes('.supabase.co') || url.includes('.supabase.in')) {
      return 'production';
    }

    return 'none';
  }

  /**
   * Get Supabase client instance
   */
  getClient(): SupabaseClient | null {
    return this.client;
  }

  /**
   * Get helpful setup instructions
   */
  static getSetupInstructions(environment?: 'local' | 'production'): string {
    if (environment === 'local') {
      return `
To set up Supabase locally:
1. Install Supabase CLI: npm install -g supabase
2. Initialize project: supabase init
3. Start local instance: supabase start
4. Copy the API URL and anon key to your .env file:
   SUPABASE_URL=http://localhost:54321
   SUPABASE_ANON_KEY=<your-anon-key>
`;
    }

    return `
To set up Supabase:

Option 1 - Local Development (Recommended):
1. Install Supabase CLI: npm install -g supabase
2. Initialize project: supabase init
3. Start local instance: supabase start
4. Copy credentials to .env file

Option 2 - Cloud Project:
1. Create project at https://supabase.com
2. Go to Settings > API
3. Copy the Project URL and anon key to your .env file:
   SUPABASE_URL=https://[project-ref].supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
`;
  }

  /**
   * Check if Supabase is configured (doesn't validate connection)
   */
  static isConfigured(): boolean {
    return !!(process.env['SUPABASE_URL'] && process.env['SUPABASE_ANON_KEY']);
  }

  /**
   * Quick environment detection without full validation
   */
  static getEnvironment(): 'production' | 'local' | 'none' {
    const url = process.env['SUPABASE_URL'];
    if (!url) return 'none';

    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return 'local';
    }

    if (url.includes('.supabase.co') || url.includes('.supabase.in')) {
      return 'production';
    }

    return 'none';
  }
}
