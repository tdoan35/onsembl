/**
 * Agent API Service
 *
 * Handles agent-specific API calls with proper type transformation
 * between backend API responses and frontend Agent types.
 *
 * Backend returns: agent_id, agent_type, status (uppercase), last_heartbeat, last_metrics
 * Frontend expects: id, type (lowercase), status (lowercase), lastPing, metrics
 */

import { apiClient } from './api.service';
import { Agent, AgentType, AgentStatus } from '@/stores/agent-store';

/**
 * Backend API response type (matches backend alignment plan)
 *
 * @see docs/backend/frontend-backend-alignment-plan.md
 */
export interface AgentApiResponse {
  agent_id: string;
  name: string;
  agent_type: string;
  status: string;
  version: string;
  capabilities: string[];
  last_heartbeat: string | null;
  last_metrics: {
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  } | null;
  created_at: string;
  updated_at: string;
}

/**
 * Transform backend API response to frontend Agent type
 *
 * Handles:
 * - Field name conversion (agent_id -> id, last_heartbeat -> lastPing)
 * - Case conversion (CLAUDE -> claude, ONLINE -> online)
 * - Null handling for optional fields
 *
 * @param apiAgent - Raw agent data from backend API
 * @returns Transformed agent for frontend store
 */
export function transformApiAgent(apiAgent: AgentApiResponse): Agent {
  // Map uppercase type to lowercase with fallback
  let type: AgentType = 'claude';
  const normalizedType = apiAgent.agent_type?.toLowerCase();
  if (normalizedType === 'claude' || normalizedType === 'gemini' || normalizedType === 'codex') {
    type = normalizedType;
  }

  // Map status values with fallback
  let status: AgentStatus = 'offline';
  const normalizedStatus = apiAgent.status?.toLowerCase();

  // Map database status values to frontend status values
  if (normalizedStatus === 'online' || normalizedStatus === 'connected') {
    status = 'online';
  } else if (normalizedStatus === 'offline' || normalizedStatus === 'disconnected') {
    status = 'offline';
  } else if (normalizedStatus === 'error') {
    status = 'error';
  } else if (normalizedStatus === 'connecting' || normalizedStatus === 'executing') {
    status = 'connecting';
  }

  const agent: Agent = {
    id: apiAgent.agent_id,
    name: apiAgent.name,
    type,
    status,
    version: apiAgent.version,
    capabilities: apiAgent.capabilities || [],
    lastPing: apiAgent.last_heartbeat || new Date().toISOString(),
  };

  // Only add metrics if they exist (optional property)
  if (apiAgent.last_metrics) {
    agent.metrics = apiAgent.last_metrics;
  }

  return agent;
}

/**
 * Fetch all agents from backend API
 *
 * @returns Array of transformed agents
 * @throws Error if API call fails
 */
export async function fetchAgents(): Promise<Agent[]> {
  try {
    const response = await apiClient.request<{ agents: AgentApiResponse[]; total: number; limit: number; offset: number }>('/api/agents');

    if (!response.success || !response.data) {
      throw new Error('Failed to fetch agents: Invalid response');
    }

    // Transform each agent from API format to frontend format
    return response.data.agents.map(transformApiAgent);
  } catch (error) {
    console.error('Error fetching agents:', error);
    throw error;
  }
}

/**
 * Fetch single agent by ID
 *
 * @param agentId - Agent identifier
 * @returns Transformed agent
 * @throws Error if agent not found or API call fails
 */
export async function fetchAgent(agentId: string): Promise<Agent> {
  try {
    const response = await apiClient.request<AgentApiResponse>(`/api/agents/${agentId}`);

    if (!response.success || !response.data) {
      throw new Error(`Failed to fetch agent ${agentId}: Invalid response`);
    }

    return transformApiAgent(response.data);
  } catch (error) {
    console.error(`Error fetching agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Delete an agent from the system
 *
 * Removes the agent and all associated data (commands, traces, logs).
 * Users can only delete their own agents.
 *
 * @param agentId - Agent identifier
 * @throws Error if agent not found, unauthorized, or API call fails
 */
export async function deleteAgent(agentId: string): Promise<void> {
  try {
    const response = await apiClient.request<null>(`/api/agents/${agentId}`, {
      method: 'DELETE',
    });

    if (!response.success) {
      throw new Error(`Failed to delete agent ${agentId}`);
    }
  } catch (error) {
    console.error(`Error deleting agent ${agentId}:`, error);
    throw error;
  }
}
