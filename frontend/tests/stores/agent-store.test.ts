import { renderHook, act } from '@testing-library/react';
import { useAgentStore } from '@/stores/agent-store';

describe('Agent Store', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useAgentStore());
    act(() => {
      result.current.clearAgents();
    });
  });

  it('should initialize with empty agents', () => {
    const { result } = renderHook(() => useAgentStore());
    expect(result.current.agents).toEqual([]);
  });

  it('should add an agent', () => {
    const { result } = renderHook(() => useAgentStore());

    const newAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      type: 'claude' as const,
      status: 'online' as const,
      version: '1.0.0',
      capabilities: [],
      lastPing: new Date().toISOString(),
    };

    act(() => {
      result.current.addAgent(newAgent);
    });

    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0]).toEqual(newAgent);
  });

  it('should update agent status', () => {
    const { result } = renderHook(() => useAgentStore());

    const agent = {
      id: 'agent-1',
      name: 'Test Agent',
      type: 'claude' as const,
      status: 'online' as const,
      version: '1.0.0',
      capabilities: [],
      lastPing: new Date().toISOString(),
    };

    act(() => {
      result.current.addAgent(agent);
      result.current.updateAgentStatus('agent-1', 'offline');
    });

    expect(result.current.agents[0].status).toBe('offline');
  });

  it('should remove an agent', () => {
    const { result } = renderHook(() => useAgentStore());

    const agent1 = {
      id: 'agent-1',
      name: 'Agent 1',
      type: 'claude' as const,
      status: 'online' as const,
      version: '1.0.0',
      capabilities: [],
      lastPing: new Date().toISOString(),
    };

    const agent2 = {
      id: 'agent-2',
      name: 'Agent 2',
      type: 'gemini' as const,
      status: 'online' as const,
      version: '1.0.0',
      capabilities: [],
      lastPing: new Date().toISOString(),
    };

    act(() => {
      result.current.addAgent(agent1);
      result.current.addAgent(agent2);
      result.current.removeAgent('agent-1');
    });

    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].id).toBe('agent-2');
  });

  it('should get agent by id', () => {
    const { result } = renderHook(() => useAgentStore());

    const agent = {
      id: 'agent-1',
      name: 'Test Agent',
      type: 'claude' as const,
      status: 'online' as const,
      version: '1.0.0',
      capabilities: [],
      lastPing: new Date().toISOString(),
    };

    act(() => {
      result.current.addAgent(agent);
    });

    const foundAgent = result.current.getAgentById('agent-1');
    expect(foundAgent).toEqual(agent);
  });

  it('should filter agents by status', () => {
    const { result } = renderHook(() => useAgentStore());

    act(() => {
      result.current.addAgent({
        id: 'agent-1',
        name: 'Online Agent',
        type: 'claude' as const,
        status: 'online' as const,
        version: '1.0.0',
        capabilities: [],
        lastPing: new Date().toISOString(),
      });

      result.current.addAgent({
        id: 'agent-2',
        name: 'Offline Agent',
        type: 'gemini' as const,
        status: 'offline' as const,
        version: '1.0.0',
        capabilities: [],
        lastPing: new Date().toISOString(),
      });
    });

    const onlineAgents = result.current.getAgentsByStatus('online');
    expect(onlineAgents).toHaveLength(1);
    expect(onlineAgents[0].id).toBe('agent-1');

    const offlineAgents = result.current.getAgentsByStatus('offline');
    expect(offlineAgents).toHaveLength(1);
    expect(offlineAgents[0].id).toBe('agent-2');
  });
});