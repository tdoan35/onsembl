/**
 * Service Configuration for Onsembl.ai Dashboard
 * Centralized configuration for all services
 */

import { WebSocketConfig } from './websocket.service';
import { ApiConfig } from './api.service';
import { AuthConfig } from './auth.service';

export interface ServiceConfig {
  api: ApiConfig;
  websocket: WebSocketConfig;
  auth: AuthConfig;
  environment: {
    backendUrl: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    environment: 'development' | 'staging' | 'production';
  };
}

/**
 * Get service configuration from environment variables
 */
export function getServiceConfig(): ServiceConfig {
  const backendUrl = process.env['NEXT_PUBLIC_BACKEND_URL'] || 'http://localhost:3001';
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
  const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';
  const environment = (process.env['NODE_ENV'] as 'development' | 'staging' | 'production') || 'development';

  return {
    environment: {
      backendUrl,
      supabaseUrl,
      supabaseAnonKey,
      environment
    },
    api: {
      baseUrl: backendUrl,
      timeout: environment === 'development' ? 60000 : 30000, // Longer timeout in dev
      retryAttempts: environment === 'production' ? 3 : 2,
      retryDelay: 1000,
      retryBackoffMultiplier: 2
    },
    websocket: {
      baseUrl: backendUrl,
      endpoints: {
        agent: '/ws/agent',
        dashboard: '/ws/dashboard'
      },
      reconnect: {
        maxAttempts: environment === 'production' ? 10 : 5,
        backoffMultiplier: 2,
        baseDelay: 1000,
        maxDelay: environment === 'production' ? 60000 : 30000
      },
      heartbeat: {
        interval: 30000, // 30 seconds
        timeout: 10000   // 10 seconds
      }
    },
    auth: {
      autoRefresh: true,
      refreshBuffer: environment === 'production' ? 5 : 2, // Minutes before expiry
      persistSession: true,
      storageKey: `onsembl_auth_session_${environment}`
    }
  };
}

/**
 * Validate service configuration
 */
export function validateServiceConfig(config: ServiceConfig): void {
  const errors: string[] = [];

  // Validate environment
  if (!config.environment.backendUrl) {
    errors.push('Backend URL is required');
  }

  if (!config.environment.supabaseUrl) {
    errors.push('Supabase URL is required');
  }

  if (!config.environment.supabaseAnonKey) {
    errors.push('Supabase anonymous key is required');
  }

  // Validate API config
  if (config.api.timeout <= 0) {
    errors.push('API timeout must be positive');
  }

  if (config.api.retryAttempts < 0) {
    errors.push('API retry attempts must be non-negative');
  }

  // Validate WebSocket config
  if (config.websocket.reconnect.maxAttempts < 0) {
    errors.push('WebSocket max reconnect attempts must be non-negative');
  }

  if (config.websocket.heartbeat.interval <= 0) {
    errors.push('WebSocket heartbeat interval must be positive');
  }

  if (config.websocket.heartbeat.timeout <= 0) {
    errors.push('WebSocket heartbeat timeout must be positive');
  }

  // Validate Auth config
  if (config.auth.refreshBuffer < 0) {
    errors.push('Auth refresh buffer must be non-negative');
  }

  if (!config.auth.storageKey) {
    errors.push('Auth storage key is required');
  }

  if (errors.length > 0) {
    throw new Error(`Service configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Development configuration overrides
 */
export function getDevelopmentOverrides(): Partial<ServiceConfig> {
  return {
    api: {
      timeout: 60000, // Longer timeout for debugging
      retryAttempts: 1 // Fewer retries to fail fast
    },
    websocket: {
      reconnect: {
        maxAttempts: 3,
        baseDelay: 500, // Faster reconnect for dev
        maxDelay: 5000
      }
    },
    auth: {
      refreshBuffer: 1 // Refresh token sooner in dev
    }
  };
}

/**
 * Production configuration overrides
 */
export function getProductionOverrides(): Partial<ServiceConfig> {
  return {
    api: {
      retryAttempts: 5, // More retries in production
      retryDelay: 2000  // Longer delay between retries
    },
    websocket: {
      reconnect: {
        maxAttempts: 15, // More aggressive reconnection
        maxDelay: 120000 // Up to 2 minutes delay
      }
    }
  };
}

/**
 * Apply configuration overrides
 */
export function applyConfigOverrides(
  baseConfig: ServiceConfig,
  overrides: Partial<ServiceConfig>
): ServiceConfig {
  return {
    ...baseConfig,
    api: { ...baseConfig.api, ...overrides.api },
    websocket: {
      ...baseConfig.websocket,
      ...overrides.websocket,
      reconnect: {
        ...baseConfig.websocket.reconnect,
        ...overrides.websocket?.reconnect
      },
      heartbeat: {
        ...baseConfig.websocket.heartbeat,
        ...overrides.websocket?.heartbeat
      },
      endpoints: {
        ...baseConfig.websocket.endpoints,
        ...overrides.websocket?.endpoints
      }
    },
    auth: { ...baseConfig.auth, ...overrides.auth },
    environment: { ...baseConfig.environment, ...overrides.environment }
  };
}

/**
 * Get complete service configuration with environment-specific overrides
 */
export function getCompleteServiceConfig(): ServiceConfig {
  const baseConfig = getServiceConfig();

  let overrides: Partial<ServiceConfig> = {};

  switch (baseConfig.environment.environment) {
    case 'development':
      overrides = getDevelopmentOverrides();
      break;
    case 'production':
      overrides = getProductionOverrides();
      break;
    case 'staging':
      // Use base config for staging
      break;
  }

  const finalConfig = applyConfigOverrides(baseConfig, overrides);
  validateServiceConfig(finalConfig);

  return finalConfig;
}