/**
 * Agent Store for Onsembl.ai Dashboard
 * State management for agent data and operations
 */

import { create } from 'zustand';
import { Database } from '@/types/database';

// Type aliases
type Agent = Database['public']['Tables']['agents']['Row'];
type AgentStatus = Database['public']['Enums']['agent_status'];

interface AgentState {
  agents: Map<string, Agent>;
  selectedAgentId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  removeAgent: (agentId: string) => void;
  selectAgent: (agentId: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: new Map(),
  selectedAgentId: null,
  isLoading: false,
  error: null,

  setAgents: (agents) => set({
    agents: new Map(agents.map(agent => [agent.id, agent]))
  }),

  addAgent: (agent) => set((state) => ({
    agents: new Map(state.agents).set(agent.id, agent)
  })),

  updateAgent: (agentId, updates) => set((state) => {
    const newAgents = new Map(state.agents);
    const existingAgent = newAgents.get(agentId);
    if (existingAgent) {
      newAgents.set(agentId, { ...existingAgent, ...updates });
    }
    return { agents: newAgents };
  }),

  removeAgent: (agentId) => set((state) => {
    const newAgents = new Map(state.agents);
    newAgents.delete(agentId);
    return {
      agents: newAgents,
      selectedAgentId: state.selectedAgentId === agentId ? null : state.selectedAgentId
    };
  }),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  reset: () => set({
    agents: new Map(),
    selectedAgentId: null,
    isLoading: false,
    error: null
  })
}));

// Selectors
export const selectAgentById = (agentId: string) => (state: AgentState) =>
  state.agents.get(agentId);

export const selectAllAgents = (state: AgentState) =>
  Array.from(state.agents.values());

export const selectSelectedAgent = (state: AgentState) =>
  state.selectedAgentId ? state.agents.get(state.selectedAgentId) : null;

export const selectActiveAgents = (state: AgentState) =>
  Array.from(state.agents.values()).filter(agent => agent.status === 'idle' || agent.status === 'busy');

export const selectAgentsByStatus = (status: AgentStatus) => (state: AgentState) =>
  Array.from(state.agents.values()).filter(agent => agent.status === status);