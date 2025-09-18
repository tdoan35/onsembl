/**
 * Configuration Service for Onsembl.ai Dashboard
 * Centralizes environment-based configuration for different deployment environments
 */

export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  websocket: {
    baseUrl: string;
    endpoints: {
      agent: string;
      dashboard: string;
    };
  };
  environment: 'development' | 'staging' | 'production';
  features: {
    debugMode: boolean;
  };
}

/**
 * Get the current environment
 */
function getEnvironment(): AppConfig['environment'] {
  const env = process.env['NODE_ENV'];
  const publicEnv = process.env['NEXT_PUBLIC_ENV'];

  if (publicEnv === 'production' || env === 'production') {
    return 'production';
  }
  if (publicEnv === 'staging') {
    return 'staging';
  }
  return 'development';
}

/**
 * Get API base URL based on environment
 */
function getApiBaseUrl(): string {
  // First check for explicit API URL
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'];
  if (apiUrl) {
    return apiUrl;
  }

  // Fallback to backend URL for backward compatibility
  const backendUrl = process.env['NEXT_PUBLIC_BACKEND_URL'];
  if (backendUrl) {
    return backendUrl;
  }

  // Default to localhost for development
  return 'http://localhost:3001';
}

/**
 * Get WebSocket base URL based on environment
 */
function getWebSocketBaseUrl(): string {
  // First check for explicit WebSocket URL
  const wsUrl = process.env['NEXT_PUBLIC_WS_URL'];
  if (wsUrl) {
    return wsUrl;
  }

  // Derive from API URL if not explicitly set
  const apiUrl = getApiBaseUrl();

  // Convert http/https to ws/wss
  if (apiUrl.startsWith('https://')) {
    return apiUrl.replace('https://', 'wss://');
  } else if (apiUrl.startsWith('http://')) {
    return apiUrl.replace('http://', 'ws://');
  }

  // If it's already a WebSocket URL, use as is
  if (apiUrl.startsWith('ws://') || apiUrl.startsWith('wss://')) {
    return apiUrl;
  }

  // Default fallback
  return 'ws://localhost:3001';
}

/**
 * Get API timeout based on environment
 */
function getApiTimeout(): number {
  const timeout = process.env['NEXT_PUBLIC_API_TIMEOUT'];
  if (timeout) {
    const parsed = parseInt(timeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // Default timeouts per environment
  const environment = getEnvironment();
  switch (environment) {
    case 'production':
      return 30000; // 30 seconds
    case 'staging':
      return 45000; // 45 seconds
    default:
      return 60000; // 60 seconds for development
  }
}

/**
 * Check if debug mode is enabled
 */
function isDebugMode(): boolean {
  const debug = process.env['NEXT_PUBLIC_DEBUG'];
  return debug === 'true' || debug === '1';
}

/**
 * Application configuration singleton
 */
export const config: AppConfig = {
  api: {
    baseUrl: getApiBaseUrl(),
    timeout: getApiTimeout(),
  },
  websocket: {
    baseUrl: getWebSocketBaseUrl(),
    endpoints: {
      agent: '/ws/agent',
      dashboard: '/ws/dashboard',
    },
  },
  environment: getEnvironment(),
  features: {
    debugMode: isDebugMode(),
  },
};

/**
 * Validate configuration on startup
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Check for required configuration in production
  if (config.environment === 'production') {
    if (!process.env['NEXT_PUBLIC_API_URL']) {
      errors.push('NEXT_PUBLIC_API_URL is required in production');
    }

    if (config.api.baseUrl.includes('localhost')) {
      errors.push('API URL cannot use localhost in production');
    }

    if (config.websocket.baseUrl.includes('localhost')) {
      errors.push('WebSocket URL cannot use localhost in production');
    }
  }

  // Check for secure connections in production
  if (config.environment === 'production') {
    if (!config.api.baseUrl.startsWith('https://')) {
      console.warn('Warning: API URL should use HTTPS in production');
    }

    if (!config.websocket.baseUrl.startsWith('wss://')) {
      console.warn('Warning: WebSocket URL should use WSS in production');
    }
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:', errors);
    if (config.environment === 'production') {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  // Log configuration in debug mode
  if (config.features.debugMode) {
    console.log('Application Configuration:', {
      environment: config.environment,
      apiUrl: config.api.baseUrl,
      wsUrl: config.websocket.baseUrl,
      apiTimeout: config.api.timeout,
    });
  }
}

// Freeze configuration to prevent runtime modifications
Object.freeze(config);
Object.freeze(config.api);
Object.freeze(config.websocket);
Object.freeze(config.features);

export default config;