/**
 * API Client Service for Onsembl.ai Dashboard
 * Handles RESTful API communication with backend services
 */

import { Database } from '../types/database';

// Type aliases for cleaner code
type Agent = Database['public']['Tables']['agents']['Row'];
type AgentInsert = Database['public']['Tables']['agents']['Insert'];
type AgentUpdate = Database['public']['Tables']['agents']['Update'];

type Command = Database['public']['Tables']['commands']['Row'];
type CommandInsert = Database['public']['Tables']['commands']['Insert'];
type CommandUpdate = Database['public']['Tables']['commands']['Update'];

type TerminalOutput = Database['public']['Tables']['terminal_outputs']['Row'];
type CommandPreset = Database['public']['Tables']['command_presets']['Row'];
type CommandPresetInsert = Database['public']['Tables']['command_presets']['Insert'];
type CommandPresetUpdate = Database['public']['Tables']['command_presets']['Update'];

type TraceEntry = Database['public']['Tables']['trace_entries']['Row'];
type InvestigationReport = Database['public']['Tables']['investigation_reports']['Row'];
type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
type ExecutionConstraint = Database['public']['Tables']['execution_constraints']['Row'];
type ExecutionConstraintInsert = Database['public']['Tables']['execution_constraints']['Insert'];
type ExecutionConstraintUpdate = Database['public']['Tables']['execution_constraints']['Update'];

// API Response types
export interface ApiResponse<T = any> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  status?: number;
}

// Request/Response interfaces
export interface LoginRequest {
  email: string;
  password?: string; // Optional for magic link
  magicLink?: boolean;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
  };
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
}

export interface AgentAvailabilityResponse {
  agent_id: string;
  agent_name: string;
  status: string;
  queue_length: number;
}

export interface SystemStatusResponse {
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  uptime: number;
  services: {
    database: 'healthy' | 'degraded' | 'down';
    redis: 'healthy' | 'degraded' | 'down';
    websocket: 'healthy' | 'degraded' | 'down';
  };
  metrics: {
    activeAgents: number;
    queuedCommands: number;
    avgResponseTime: number;
  };
}

export interface CommandExecutionRequest {
  agentId: string;
  command: string;
  arguments?: Record<string, any>;
  priority?: number;
  executionConstraints?: {
    timeLimitMs?: number;
    tokenBudget?: number;
    maxRetries?: number;
  };
}

// API Client Configuration
export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  retryBackoffMultiplier: number;
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestConfig {
  method?: RequestMethod;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

export class ApiClient {
  private config: ApiConfig;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  private requestInterceptors: Array<(config: RequestConfig) => RequestConfig | Promise<RequestConfig>> = [];
  private responseInterceptors: Array<(response: Response) => Response | Promise<Response>> = [];
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: ApiConfig) {
    this.config = config;
    this.setupDefaultInterceptors();
  }

  private setupDefaultInterceptors(): void {
    // Request interceptor for authentication
    this.requestInterceptors.push(async (config) => {
      if (this.accessToken) {
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${this.accessToken}`
        };
      }
      return config;
    });

    // Request interceptor for content type
    this.requestInterceptors.push((config) => {
      if (config.data && !config.headers?.['Content-Type']) {
        config.headers = {
          ...config.headers,
          'Content-Type': 'application/json'
        };
      }
      return config;
    });
  }

  /**
   * Set authentication tokens
   */
  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  /**
   * Clear authentication tokens
   */
  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.refreshPromise = null;
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: (response: Response) => Response | Promise<Response>): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Make HTTP request
   */
  private async request<T>(endpoint: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, config.params);
    const requestId = this.generateRequestId();

    try {
      // Apply request interceptors
      let finalConfig = { ...config };
      for (const interceptor of this.requestInterceptors) {
        finalConfig = await interceptor(finalConfig);
      }

      // Create abort controller
      const controller = new AbortController();
      this.abortControllers.set(requestId, controller);

      const signal = config.signal || controller.signal;
      const timeout = config.timeout || this.config.timeout;

      // Set timeout
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: finalConfig.method || 'GET',
        headers: finalConfig.headers,
        signal,
        ...(finalConfig.data && { body: this.serializeData(finalConfig.data) })
      };

      // Make request with retry logic
      let lastError: Error | null = null;
      const maxAttempts = (config.retries ?? this.config.retryAttempts) + 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          let response = await fetch(url, fetchOptions);

          // Apply response interceptors
          for (const interceptor of this.responseInterceptors) {
            response = await interceptor(response);
          }

          clearTimeout(timeoutId);
          this.abortControllers.delete(requestId);

          // Handle 401 - token refresh
          if (response.status === 401 && this.refreshToken && attempt === 1) {
            try {
              await this.refreshAccessToken();
              // Update authorization header and retry
              fetchOptions.headers = {
                ...fetchOptions.headers,
                'Authorization': `Bearer ${this.accessToken}`
              };
              continue;
            } catch (refreshError) {
              throw new ApiError('auth_refresh_failed', 'Failed to refresh access token', {}, 401);
            }
          }

          if (!response.ok) {
            throw await this.createApiError(response);
          }

          const data = await this.parseResponse<T>(response);
          return {
            data,
            success: true
          };

        } catch (error) {
          lastError = error as Error;

          // Don't retry on certain errors
          if (error instanceof ApiError && [400, 401, 403, 404, 422].includes(error.status || 0)) {
            throw error;
          }

          // Don't retry on abort
          if (error instanceof Error && error.name === 'AbortError') {
            throw error;
          }

          // Wait before retry (except on last attempt)
          if (attempt < maxAttempts) {
            const delay = this.config.retryDelay * Math.pow(this.config.retryBackoffMultiplier, attempt - 1);
            await this.sleep(delay);
          }
        }
      }

      throw lastError || new Error('Request failed after retries');

    } catch (error) {
      this.abortControllers.delete(requestId);

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        'request_failed',
        error instanceof Error ? error.message : 'Unknown error',
        { endpoint, config },
        0
      );
    }
  }

  /**
   * Cancel request by ID
   */
  cancelRequest(requestId: string): void {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }

  // ============================================================================
  // Authentication endpoints
  // ============================================================================

  /**
   * Login with email/password or magic link
   */
  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      data: credentials
    });
  }

  /**
   * Logout
   */
  async logout(): Promise<ApiResponse<void>> {
    return this.request<void>('/auth/logout', {
      method: 'POST'
    });
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();

    try {
      const newToken = await this.refreshPromise;
      this.refreshPromise = null;
      return newToken;
    } catch (error) {
      this.refreshPromise = null;
      throw error;
    }
  }

  private async performTokenRefresh(): Promise<string> {
    const response = await fetch(this.buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: this.refreshToken
      })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    this.accessToken = data.accessToken;

    if (data.refreshToken) {
      this.refreshToken = data.refreshToken;
    }

    return this.accessToken;
  }

  // ============================================================================
  // Agent endpoints
  // ============================================================================

  /**
   * Get all agents
   */
  async getAgents(): Promise<ApiResponse<Agent[]>> {
    return this.request<Agent[]>('/agents');
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<ApiResponse<Agent>> {
    return this.request<Agent>(`/agents/${agentId}`);
  }

  /**
   * Register new agent
   */
  async registerAgent(agent: AgentInsert): Promise<ApiResponse<Agent>> {
    return this.request<Agent>('/agents', {
      method: 'POST',
      data: agent
    });
  }

  /**
   * Update agent
   */
  async updateAgent(agentId: string, updates: AgentUpdate): Promise<ApiResponse<Agent>> {
    return this.request<Agent>(`/agents/${agentId}`, {
      method: 'PATCH',
      data: updates
    });
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/agents/${agentId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get agent availability
   */
  async getAgentAvailability(): Promise<ApiResponse<AgentAvailabilityResponse[]>> {
    return this.request<AgentAvailabilityResponse[]>('/agents/availability');
  }

  // ============================================================================
  // Command endpoints
  // ============================================================================

  /**
   * Execute command
   */
  async executeCommand(request: CommandExecutionRequest): Promise<ApiResponse<Command>> {
    return this.request<Command>('/commands/execute', {
      method: 'POST',
      data: request
    });
  }

  /**
   * Get commands with pagination
   */
  async getCommands(page = 1, limit = 20, agentId?: string): Promise<ApiResponse<PaginatedResponse<Command>>> {
    const params: Record<string, any> = { page, limit };
    if (agentId) params.agentId = agentId;

    return this.request<PaginatedResponse<Command>>('/commands', { params });
  }

  /**
   * Get command by ID
   */
  async getCommand(commandId: string): Promise<ApiResponse<Command>> {
    return this.request<Command>(`/commands/${commandId}`);
  }

  /**
   * Cancel command
   */
  async cancelCommand(commandId: string, reason?: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/commands/${commandId}/cancel`, {
      method: 'POST',
      data: { reason }
    });
  }

  /**
   * Get command terminal output
   */
  async getCommandOutput(commandId: string): Promise<ApiResponse<TerminalOutput[]>> {
    return this.request<TerminalOutput[]>(`/commands/${commandId}/output`);
  }

  // ============================================================================
  // Command Preset endpoints
  // ============================================================================

  /**
   * Get command presets
   */
  async getCommandPresets(): Promise<ApiResponse<CommandPreset[]>> {
    return this.request<CommandPreset[]>('/presets');
  }

  /**
   * Create command preset
   */
  async createCommandPreset(preset: CommandPresetInsert): Promise<ApiResponse<CommandPreset>> {
    return this.request<CommandPreset>('/presets', {
      method: 'POST',
      data: preset
    });
  }

  /**
   * Update command preset
   */
  async updateCommandPreset(presetId: string, updates: CommandPresetUpdate): Promise<ApiResponse<CommandPreset>> {
    return this.request<CommandPreset>(`/presets/${presetId}`, {
      method: 'PATCH',
      data: updates
    });
  }

  /**
   * Delete command preset
   */
  async deleteCommandPreset(presetId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/presets/${presetId}`, {
      method: 'DELETE'
    });
  }

  // ============================================================================
  // Trace endpoints
  // ============================================================================

  /**
   * Get trace entries for command
   */
  async getTraceEntries(commandId: string): Promise<ApiResponse<TraceEntry[]>> {
    return this.request<TraceEntry[]>(`/traces/command/${commandId}`);
  }

  /**
   * Get trace entry by ID
   */
  async getTraceEntry(traceId: string): Promise<ApiResponse<TraceEntry>> {
    return this.request<TraceEntry>(`/traces/${traceId}`);
  }

  // ============================================================================
  // Investigation Report endpoints
  // ============================================================================

  /**
   * Get investigation reports
   */
  async getInvestigationReports(page = 1, limit = 20): Promise<ApiResponse<PaginatedResponse<InvestigationReport>>> {
    return this.request<PaginatedResponse<InvestigationReport>>('/reports', {
      params: { page, limit }
    });
  }

  /**
   * Get investigation report by ID
   */
  async getInvestigationReport(reportId: string): Promise<ApiResponse<InvestigationReport>> {
    return this.request<InvestigationReport>(`/reports/${reportId}`);
  }

  // ============================================================================
  // System endpoints
  // ============================================================================

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<ApiResponse<SystemStatusResponse>> {
    return this.request<SystemStatusResponse>('/system/status');
  }

  /**
   * Trigger emergency stop
   */
  async emergencyStop(reason: string): Promise<ApiResponse<void>> {
    return this.request<void>('/system/emergency-stop', {
      method: 'POST',
      data: { reason }
    });
  }

  // ============================================================================
  // Execution Constraint endpoints
  // ============================================================================

  /**
   * Get execution constraints
   */
  async getExecutionConstraints(agentId?: string): Promise<ApiResponse<ExecutionConstraint[]>> {
    const params = agentId ? { agentId } : {};
    return this.request<ExecutionConstraint[]>('/constraints', { params });
  }

  /**
   * Create execution constraint
   */
  async createExecutionConstraint(constraint: ExecutionConstraintInsert): Promise<ApiResponse<ExecutionConstraint>> {
    return this.request<ExecutionConstraint>('/constraints', {
      method: 'POST',
      data: constraint
    });
  }

  /**
   * Update execution constraint
   */
  async updateExecutionConstraint(constraintId: string, updates: ExecutionConstraintUpdate): Promise<ApiResponse<ExecutionConstraint>> {
    return this.request<ExecutionConstraint>(`/constraints/${constraintId}`, {
      method: 'PATCH',
      data: updates
    });
  }

  /**
   * Delete execution constraint
   */
  async deleteExecutionConstraint(constraintId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/constraints/${constraintId}`, {
      method: 'DELETE'
    });
  }

  // ============================================================================
  // Audit Log endpoints
  // ============================================================================

  /**
   * Get audit logs
   */
  async getAuditLogs(page = 1, limit = 20): Promise<ApiResponse<PaginatedResponse<AuditLog>>> {
    return this.request<PaginatedResponse<AuditLog>>('/audit', {
      params: { page, limit }
    });
  }

  // ============================================================================
  // File Upload/Download endpoints
  // ============================================================================

  /**
   * Upload file
   */
  async uploadFile(file: File, path?: string): Promise<ApiResponse<{ url: string; path: string }>> {
    const formData = new FormData();
    formData.append('file', file);
    if (path) formData.append('path', path);

    return this.request<{ url: string; path: string }>('/files/upload', {
      method: 'POST',
      data: formData,
      headers: {} // Let browser set Content-Type for FormData
    });
  }

  /**
   * Download file
   */
  async downloadFile(path: string): Promise<Blob> {
    const url = this.buildUrl(`/files/download`, { path });
    const response = await fetch(url, {
      headers: this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}
    });

    if (!response.ok) {
      throw await this.createApiError(response);
    }

    return response.blob();
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = new URL(endpoint, this.config.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private serializeData(data: any): string | FormData {
    if (data instanceof FormData) {
      return data;
    }
    return JSON.stringify(data);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      const json = await response.json();
      return json.data !== undefined ? json.data : json;
    }

    return response.text() as any;
  }

  private async createApiError(response: Response): Promise<ApiError> {
    let message = `HTTP ${response.status}`;
    let code = 'http_error';
    let details: Record<string, any> = {};

    try {
      const errorData = await response.json();
      message = errorData.message || errorData.error || message;
      code = errorData.code || code;
      details = errorData.details || details;
    } catch {
      // Response is not JSON, use status text
      message = response.statusText || message;
    }

    return new ApiError(code, message, details, response.status);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cancelAllRequests();
    this.clearTokens();
  }
}

// API Error class
export class ApiError extends Error {
  public readonly code: string;
  public readonly details: Record<string, any>;
  public readonly status: number;

  constructor(code: string, message: string, details: Record<string, any> = {}, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

// Import configuration
import { config } from '@/services/config';

// Default configuration
export const defaultApiConfig: ApiConfig = {
  baseUrl: config.api.baseUrl,
  timeout: config.api.timeout,
  retryAttempts: 3,
  retryDelay: 1000,
  retryBackoffMultiplier: 2
};

// Singleton instance
export const apiClient = new ApiClient(defaultApiConfig);