/**
 * Environment detection for database configuration
 * Detects whether we're running locally or in cloud
 */

export type DatabaseEnvironment = 'local-supabase' | 'cloud-supabase' | 'local-postgres' | 'none';

export interface EnvironmentInfo {
  type: DatabaseEnvironment;
  isLocal: boolean;
  isCloud: boolean;
  isConfigured: boolean;
  connectionUrl?: string;
  details: {
    host?: string;
    port?: number;
    database?: string;
    projectRef?: string;
  };
}

export class EnvironmentDetector {
  /**
   * Detect current database environment
   */
  static detect(): EnvironmentInfo {
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_ANON_KEY'];
    const databaseUrl = process.env['DATABASE_URL'];

    // Check for Supabase configuration
    if (supabaseUrl && supabaseKey) {
      return this.detectSupabaseEnvironment(supabaseUrl);
    }

    // Check for direct PostgreSQL connection
    if (databaseUrl) {
      return this.detectPostgresEnvironment(databaseUrl);
    }

    // No configuration found
    return {
      type: 'none',
      isLocal: false,
      isCloud: false,
      isConfigured: false,
      details: {}
    };
  }

  /**
   * Detect Supabase environment type
   */
  private static detectSupabaseEnvironment(url: string): EnvironmentInfo {
    try {
      const parsed = new URL(url);

      // Local Supabase CLI
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return {
          type: 'local-supabase',
          isLocal: true,
          isCloud: false,
          isConfigured: true,
          connectionUrl: url,
          details: {
            host: parsed.hostname,
            port: parseInt(parsed.port) || 54321,
            database: 'postgres'
          }
        };
      }

      // Cloud Supabase
      const projectRefMatch = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.(co|in)$/);
      if (projectRefMatch) {
        return {
          type: 'cloud-supabase',
          isLocal: false,
          isCloud: true,
          isConfigured: true,
          connectionUrl: url,
          details: {
            host: parsed.hostname,
            projectRef: projectRefMatch[1]
          }
        };
      }

      // Unknown Supabase format
      return {
        type: 'cloud-supabase',
        isLocal: false,
        isCloud: true,
        isConfigured: true,
        connectionUrl: url,
        details: {
          host: parsed.hostname
        }
      };
    } catch {
      return {
        type: 'none',
        isLocal: false,
        isCloud: false,
        isConfigured: false,
        details: {}
      };
    }
  }

  /**
   * Detect PostgreSQL environment
   */
  private static detectPostgresEnvironment(connectionString: string): EnvironmentInfo {
    try {
      const parsed = new URL(connectionString);

      const isLocal = parsed.hostname === 'localhost' ||
                     parsed.hostname === '127.0.0.1' ||
                     parsed.hostname.endsWith('.local');

      return {
        type: 'local-postgres',
        isLocal,
        isCloud: !isLocal,
        isConfigured: true,
        connectionUrl: connectionString,
        details: {
          host: parsed.hostname,
          port: parseInt(parsed.port) || 5432,
          database: parsed.pathname.substring(1) || 'postgres'
        }
      };
    } catch {
      return {
        type: 'none',
        isLocal: false,
        isCloud: false,
        isConfigured: false,
        details: {}
      };
    }
  }

  /**
   * Get recommended configuration based on environment
   */
  static getRecommendedConfig(): {
    environment: DatabaseEnvironment;
    config: Record<string, string>;
    instructions: string;
  } {
    // Check if running in Docker
    if (process.env['DOCKER_ENV'] === 'true') {
      return {
        environment: 'local-postgres',
        config: {
          DATABASE_URL: 'postgresql://postgres:postgres@db:5432/onsembl'
        },
        instructions: 'Using Docker PostgreSQL configuration'
      };
    }

    // Check if running in CI/CD
    if (process.env['CI'] === 'true') {
      return {
        environment: 'local-postgres',
        config: {
          DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/onsembl_test'
        },
        instructions: 'Using CI/CD test database configuration'
      };
    }

    // Default to local Supabase for development
    return {
      environment: 'local-supabase',
      config: {
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_ANON_KEY: 'your-anon-key-here'
      },
      instructions: `
Recommended: Use Supabase CLI for local development

1. Install Supabase CLI:
   npm install -g supabase

2. Initialize Supabase in your project:
   supabase init

3. Start Supabase locally:
   supabase start

4. Copy the displayed credentials to your .env file
`
    };
  }

  /**
   * Check if current environment matches expected
   */
  static isEnvironment(expected: DatabaseEnvironment): boolean {
    const current = this.detect();
    return current.type === expected;
  }

  /**
   * Check if running locally
   */
  static isLocal(): boolean {
    const info = this.detect();
    return info.isLocal;
  }

  /**
   * Check if running in cloud
   */
  static isCloud(): boolean {
    const info = this.detect();
    return info.isCloud;
  }

  /**
   * Get connection details for logging
   */
  static getConnectionSummary(): string {
    const info = this.detect();

    if (!info.isConfigured) {
      return 'No database configured';
    }

    switch (info.type) {
      case 'local-supabase':
        return `Local Supabase at ${info.details.host}:${info.details.port}`;

      case 'cloud-supabase':
        return `Cloud Supabase (${info.details.projectRef || info.details.host})`;

      case 'local-postgres':
        return `PostgreSQL at ${info.details.host}:${info.details.port}/${info.details.database}`;

      default:
        return 'Unknown database configuration';
    }
  }

  /**
   * Validate environment variables
   */
  static validateEnvironment(): {
    valid: boolean;
    missing: string[];
    warnings: string[];
  } {
    const result = {
      valid: true,
      missing: [] as string[],
      warnings: [] as string[]
    };

    const info = this.detect();

    if (!info.isConfigured) {
      result.valid = false;
      result.missing.push('SUPABASE_URL', 'SUPABASE_ANON_KEY');
      result.warnings.push('No database configuration found. Please configure Supabase or PostgreSQL.');
    }

    // Check for optional but recommended variables
    if (info.type === 'cloud-supabase' && !process.env['SUPABASE_SERVICE_ROLE_KEY']) {
      result.warnings.push('SUPABASE_SERVICE_ROLE_KEY not set. Some admin operations may be limited.');
    }

    // Check for JWT secret in production
    if (info.isCloud && !process.env['JWT_SECRET']) {
      result.warnings.push('JWT_SECRET not set. Using default secret is insecure in production.');
    }

    return result;
  }
}