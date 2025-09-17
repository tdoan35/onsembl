/**
 * Services Index - Onsembl.ai Dashboard
 * Exports all service instances and types for easy importing
 */

// WebSocket Service
export {
  WebSocketService,
  webSocketService,
  defaultWebSocketConfig,
  type WebSocketConfig,
  type WebSocketConnectionState,
  type QueuedMessage,
  type WebSocketEventCallback,
  type ConnectionStateCallback
} from './websocket.service';

// API Service
export {
  ApiClient,
  apiClient,
  defaultApiConfig,
  ApiError,
  type ApiConfig,
  type ApiResponse,
  type PaginatedResponse,
  type ApiError as IApiError,
  type LoginRequest,
  type LoginResponse,
  type AgentAvailabilityResponse,
  type SystemStatusResponse,
  type CommandExecutionRequest,
  type RequestMethod,
  type RequestConfig
} from './api.service';

// Auth Service
export {
  AuthService,
  authService,
  defaultAuthConfig,
  type AuthConfig,
  type AuthUser,
  type AuthSession,
  type AuthState,
  type AuthError,
  type MagicLinkOptions,
  type SignUpOptions,
  type SignInOptions,
  type AuthEventType,
  type AuthEventCallback
} from './auth.service';

// Re-export common types from database
export type {
  Database
} from '../types/database';