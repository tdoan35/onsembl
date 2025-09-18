/**
 * Clear error messages with setup instructions for database issues
 */

export interface DatabaseError {
  code: string;
  message: string;
  details?: string;
  solution: string;
  documentation?: string;
}

export class DatabaseErrorMessages {
  private static readonly BASE_DOCS_URL = 'https://github.com/yourusername/onsembl/docs';

  /**
   * Get error message for specific error code
   */
  static getError(code: string, context?: Record<string, any>): DatabaseError {
    const errors = this.getErrorMap();
    const error = errors.get(code);

    if (!error) {
      return this.getGenericError(code);
    }

    // Replace placeholders in messages
    if (context) {
      error.message = this.replacePlaceholders(error.message, context);
      if (error.details) {
        error.details = this.replacePlaceholders(error.details, context);
      }
    }

    return error;
  }

  /**
   * Get all error definitions
   */
  private static getErrorMap(): Map<string, DatabaseError> {
    return new Map([
      ['DB_NOT_CONFIGURED', {
        code: 'DB_NOT_CONFIGURED',
        message: 'Database not configured',
        details: 'No database configuration found. The application is running without persistence.',
        solution: `Please configure your database:

Option 1: Local Supabase (Recommended for development)
1. Install Supabase CLI: npm install -g supabase
2. Initialize: supabase init
3. Start local instance: supabase start
4. Add to .env:
   SUPABASE_URL=http://localhost:54321
   SUPABASE_ANON_KEY=<your-anon-key>

Option 2: Cloud Supabase
1. Create project at https://supabase.com
2. Get credentials from Settings > API
3. Add to .env:
   SUPABASE_URL=https://[project].supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>`,
        documentation: `${this.BASE_DOCS_URL}/database-setup.md`
      }],

      ['SUPABASE_URL_MISSING', {
        code: 'SUPABASE_URL_MISSING',
        message: 'SUPABASE_URL environment variable not set',
        details: 'The Supabase project URL is required for database connection.',
        solution: `Add SUPABASE_URL to your .env file:
SUPABASE_URL=http://localhost:54321  # For local
# OR
SUPABASE_URL=https://[project].supabase.co  # For cloud`,
        documentation: `${this.BASE_DOCS_URL}/environment-variables.md`
      }],

      ['SUPABASE_KEY_MISSING', {
        code: 'SUPABASE_KEY_MISSING',
        message: 'SUPABASE_ANON_KEY environment variable not set',
        details: 'The Supabase anonymous key is required for authentication.',
        solution: `Add SUPABASE_ANON_KEY to your .env file:
SUPABASE_ANON_KEY=<your-anon-key>

Get this from:
- Local: Run 'supabase status' after 'supabase start'
- Cloud: Settings > API in Supabase dashboard`,
        documentation: `${this.BASE_DOCS_URL}/environment-variables.md`
      }],

      ['INVALID_SUPABASE_URL', {
        code: 'INVALID_SUPABASE_URL',
        message: 'Invalid Supabase URL format',
        details: 'The provided SUPABASE_URL does not match expected format.',
        solution: `Check your SUPABASE_URL format:
Valid formats:
- http://localhost:54321 (local)
- https://[project-ref].supabase.co (cloud)
- https://[project-ref].supabase.in (self-hosted)

Current value: {{url}}`,
        documentation: `${this.BASE_DOCS_URL}/troubleshooting.md#invalid-url`
      }],

      ['CONNECTION_FAILED', {
        code: 'CONNECTION_FAILED',
        message: 'Failed to connect to database',
        details: 'Could not establish connection to Supabase.',
        solution: `Check the following:
1. Supabase is running (for local: 'supabase status')
2. Network connectivity
3. Correct URL and credentials
4. Firewall/proxy settings

Error: {{error}}`,
        documentation: `${this.BASE_DOCS_URL}/troubleshooting.md#connection-failed`
      }],

      ['AUTH_FAILED', {
        code: 'AUTH_FAILED',
        message: 'Database authentication failed',
        details: 'Invalid credentials or expired token.',
        solution: `Verify your Supabase keys:
1. Check SUPABASE_ANON_KEY is correct
2. For admin operations, set SUPABASE_SERVICE_ROLE_KEY
3. Regenerate keys if compromised

Error: {{error}}`,
        documentation: `${this.BASE_DOCS_URL}/security.md#authentication`
      }],

      ['PERMISSION_DENIED', {
        code: 'PERMISSION_DENIED',
        message: 'Database permission denied',
        details: 'Operation not allowed with current credentials.',
        solution: `Check Row Level Security (RLS) policies:
1. Ensure RLS is configured correctly
2. Use service role key for admin operations
3. Check user permissions

Table: {{table}}
Operation: {{operation}}`,
        documentation: `${this.BASE_DOCS_URL}/security.md#rls`
      }],

      ['TABLE_NOT_FOUND', {
        code: 'TABLE_NOT_FOUND',
        message: 'Database table not found',
        details: 'Required table does not exist in the database.',
        solution: `Run database migrations:
1. Check migrations folder: supabase/migrations
2. Apply migrations: supabase db push
3. Or reset database: supabase db reset

Missing table: {{table}}`,
        documentation: `${this.BASE_DOCS_URL}/migrations.md`
      }],

      ['MIGRATION_FAILED', {
        code: 'MIGRATION_FAILED',
        message: 'Database migration failed',
        details: 'Could not apply database schema changes.',
        solution: `Fix migration issues:
1. Check migration files for errors
2. Review migration logs
3. Consider rolling back: supabase db reset

Error: {{error}}`,
        documentation: `${this.BASE_DOCS_URL}/migrations.md#troubleshooting`
      }],

      ['RATE_LIMITED', {
        code: 'RATE_LIMITED',
        message: 'Database rate limit exceeded',
        details: 'Too many requests to the database.',
        solution: `Reduce request frequency:
1. Implement caching
2. Batch operations
3. Use connection pooling
4. Upgrade Supabase plan if needed`,
        documentation: `${this.BASE_DOCS_URL}/performance.md#rate-limits`
      }],

      ['TIMEOUT', {
        code: 'TIMEOUT',
        message: 'Database operation timeout',
        details: 'Operation took too long to complete.',
        solution: `Optimize the operation:
1. Add database indexes
2. Optimize queries
3. Check network latency
4. Increase timeout settings if needed`,
        documentation: `${this.BASE_DOCS_URL}/performance.md#timeouts`
      }]
    ]);
  }

  /**
   * Get generic error for unknown codes
   */
  private static getGenericError(code: string): DatabaseError {
    return {
      code,
      message: 'Database error occurred',
      details: `An unexpected database error occurred with code: ${code}`,
      solution: `Please check:
1. Database connection and credentials
2. Application logs for more details
3. Supabase dashboard for service status

If the issue persists, please report it with the error code.`,
      documentation: `${this.BASE_DOCS_URL}/troubleshooting.md`
    };
  }

  /**
   * Replace placeholders in message templates
   */
  private static replacePlaceholders(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key]?.toString() || match;
    });
  }

  /**
   * Format error for API response
   */
  static formatForApi(error: DatabaseError): {
    error: string;
    code: string;
    message: string;
    solution: string;
    documentation?: string;
  } {
    return {
      error: error.message,
      code: error.code,
      message: error.details || error.message,
      solution: error.solution,
      documentation: error.documentation
    };
  }

  /**
   * Format error for logging
   */
  static formatForLog(error: DatabaseError, additionalContext?: Record<string, any>): Record<string, any> {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      ...additionalContext
    };
  }

  /**
   * Get setup instructions based on current state
   */
  static getSetupInstructions(hasSupabaseUrl: boolean, hasSupabaseKey: boolean): string {
    if (!hasSupabaseUrl && !hasSupabaseKey) {
      return `No database configured. To get started:

1. Install Supabase CLI:
   npm install -g supabase

2. Initialize Supabase:
   supabase init

3. Start local Supabase:
   supabase start

4. Copy the displayed credentials to your .env file:
   SUPABASE_URL=http://localhost:54321
   SUPABASE_ANON_KEY=<anon-key-from-output>

5. Restart the application`;
    }

    if (!hasSupabaseUrl) {
      return `SUPABASE_URL is missing. Add it to your .env file:
SUPABASE_URL=http://localhost:54321  # For local development
# OR
SUPABASE_URL=https://[your-project].supabase.co  # For cloud`;
    }

    if (!hasSupabaseKey) {
      return `SUPABASE_ANON_KEY is missing. Get it from:

Local Supabase:
1. Run: supabase status
2. Copy the 'anon key' value
3. Add to .env: SUPABASE_ANON_KEY=<key>

Cloud Supabase:
1. Go to Settings > API in dashboard
2. Copy the 'anon public' key
3. Add to .env: SUPABASE_ANON_KEY=<key>`;
    }

    return 'Database configuration appears complete. If you\'re having issues, check the connection and credentials.';
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverable(code: string): boolean {
    const recoverableCodes = [
      'CONNECTION_FAILED',
      'TIMEOUT',
      'RATE_LIMITED'
    ];
    return recoverableCodes.includes(code);
  }

  /**
   * Get retry advice for recoverable errors
   */
  static getRetryAdvice(code: string, attemptNumber: number): string | null {
    if (!this.isRecoverable(code)) {
      return null;
    }

    if (attemptNumber <= 3) {
      return `Temporary issue detected. Retrying... (Attempt ${attemptNumber}/3)`;
    }

    return 'Multiple retry attempts failed. Please check your connection and try again later.';
  }
}