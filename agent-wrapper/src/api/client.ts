/**
 * HTTP API Client for Onsembl Backend
 *
 * Handles authenticated requests to the Onsembl backend API
 */

import AuthManager from '../auth/auth-manager.js';

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  type: 'claude' | 'gemini' | 'codx' | 'custom';
  status: 'online' | 'offline' | 'executing' | 'error' | 'maintenance';
  version: string;
  capabilities: string[];
  last_ping: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRequest {
  name: string;
  type: 'claude' | 'gemini' | 'codex' | 'custom';
  description?: string;
  capabilities?: string[];
  metadata?: any;
}

export interface UpdateAgentRequest {
  name?: string;
  type?: 'claude' | 'gemini' | 'codex' | 'custom';
  status?: 'online' | 'offline' | 'executing' | 'error' | 'maintenance';
  capabilities?: string[];
  metadata?: any;
}

export interface ListAgentsOptions {
  status?: string;
  type?: string;
  connected?: boolean;
}

export class APIClient {
  private baseUrl: string;
  private authManager: AuthManager;

  constructor(serverUrl?: string) {
    this.baseUrl = serverUrl || process.env['ONSEMBL_SERVER_URL'] || 'http://localhost:3010';
    this.authManager = new AuthManager({ serverUrl: this.baseUrl });
  }

  /**
   * Make authenticated HTTP request
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = await this.authManager.getAccessToken();

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        errorMessage = await response.text() || errorMessage;
      }
      throw new Error(`API request failed: ${errorMessage}`);
    }

    // Handle 204 No Content responses
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * List all agents for the authenticated user
   */
  async listAgents(options: ListAgentsOptions = {}): Promise<{ agents: Agent[]; total: number }> {
    const queryParams = new URLSearchParams();

    if (options.status) queryParams.set('status', options.status);
    if (options.type) queryParams.set('type', options.type);
    if (options.connected !== undefined) queryParams.set('connected', String(options.connected));

    const query = queryParams.toString();
    const path = `/api/agents${query ? `?${query}` : ''}`;

    return this.request<{ agents: Agent[]; total: number }>(path, {
      method: 'GET'
    });
  }

  /**
   * Get agent by ID
   */
  async getAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/api/agents/${id}`, {
      method: 'GET'
    });
  }

  /**
   * Get agent by name
   */
  async getAgentByName(name: string): Promise<Agent> {
    return this.request<Agent>(`/api/agents/name/${encodeURIComponent(name)}`, {
      method: 'GET'
    });
  }

  /**
   * Register a new agent
   */
  async createAgent(agentData: CreateAgentRequest): Promise<Agent> {
    return this.request<Agent>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        ...agentData,
        version: '1.0.0',
        capabilities: agentData.capabilities || []
      })
    });
  }

  /**
   * Update an existing agent
   */
  async updateAgent(id: string, updates: UpdateAgentRequest): Promise<Agent> {
    return this.request<Agent>(`/api/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<void> {
    return this.request<void>(`/api/agents/${id}`, {
      method: 'DELETE'
    });
  }

  /**
   * Restart an agent
   */
  async restartAgent(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/agents/${id}/restart`, {
      method: 'POST'
    });
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return this.authManager.isAuthenticated();
  }

  /**
   * Get authentication status
   */
  async getAuthStatus() {
    return this.authManager.getAuthStatus();
  }
}

export default APIClient;