import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type AgentStatus = 'online' | 'offline' | 'error' | 'connecting';
export type AgentType = 'claude' | 'gemini' | 'codex';

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  version: string;
  capabilities: string[];
  lastPing: string;
  metrics?: {
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  error?: string;
}

interface AgentStore {
  agents: Agent[];
  selectedAgentId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  addAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  updateAgentMetrics: (agentId: string, metrics: Agent['metrics']) => void;
  selectAgent: (agentId: string | null) => void;
  clearAgents: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selectors
  getAgentById: (agentId: string) => Agent | undefined;
  getAgentsByStatus: (status: AgentStatus) => Agent[];
  getOnlineAgents: () => Agent[];
  getSelectedAgent: () => Agent | null;
}

export const useAgentStore = create<AgentStore>()(
  devtools(
    (set, get) => ({
      agents: [],
      selectedAgentId: null,
      isLoading: false,
      error: null,

      addAgent: (agent) =>
        set((state) => ({
          agents: [...state.agents.filter((a) => a.id !== agent.id), agent],
        })),

      removeAgent: (agentId) =>
        set((state) => ({
          agents: state.agents.filter((agent) => agent.id !== agentId),
          selectedAgentId:
            state.selectedAgentId === agentId ? null : state.selectedAgentId,
        })),

      updateAgent: (agentId, updates) =>
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === agentId ? { ...agent, ...updates } : agent
          ),
        })),

      updateAgentStatus: (agentId, status) =>
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === agentId
              ? { ...agent, status, lastPing: new Date().toISOString() }
              : agent
          ),
        })),

      updateAgentMetrics: (agentId, metrics) =>
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === agentId ? { ...agent, metrics: metrics || undefined } : agent
          ),
        })),

      selectAgent: (agentId) =>
        set(() => ({
          selectedAgentId: agentId,
        })),

      clearAgents: () =>
        set(() => ({
          agents: [],
          selectedAgentId: null,
        })),

      setLoading: (loading) =>
        set(() => ({
          isLoading: loading,
        })),

      setError: (error) =>
        set(() => ({
          error,
        })),

      // Selectors
      getAgentById: (agentId) => {
        const state = get();
        return state.agents.find((agent) => agent.id === agentId);
      },

      getAgentsByStatus: (status) => {
        const state = get();
        return state.agents.filter((agent) => agent.status === status);
      },

      getOnlineAgents: () => {
        const state = get();
        return state.agents.filter((agent) => agent.status === 'online');
      },

      getSelectedAgent: () => {
        const state = get();
        return state.selectedAgentId
          ? state.agents.find((agent) => agent.id === state.selectedAgentId) || null
          : null;
      },
    }),
    {
      name: 'agent-store',
    }
  )
);