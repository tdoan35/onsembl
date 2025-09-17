import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { ConnectionManager } from '../../src/services/connection-manager.js';
import type { Connection } from '../../src/services/connection-manager.js';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

// Mock WebSocket
vi.mock('ws');

describe('ConnectionManager', () => {
  let manager: ConnectionManager;
  let mockSocket: WebSocket;

  beforeEach(() => {
    manager = new ConnectionManager();
    mockSocket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      terminate: vi.fn()
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addConnection', () => {
    it('should add a new connection', () => {
      const connectionId = 'test-conn-1';
      const connection = manager.addConnection(
        connectionId,
        mockSocket,
        'dashboard',
        { userId: 'user-1' }
      );

      expect(connection).toBeDefined();
      expect(connection.id).toBe(connectionId);
      expect(connection.type).toBe('dashboard');
      expect(connection.socket).toBe(mockSocket);
      expect(connection.metadata?.userId).toBe('user-1');
    });

    it('should track connection by type', () => {
      manager.addConnection('dash-1', mockSocket, 'dashboard');
      manager.addConnection('agent-1', mockSocket, 'agent');

      const dashboards = manager.getConnectionsByType('dashboard');
      const agents = manager.getConnectionsByType('agent');

      expect(dashboards).toHaveLength(1);
      expect(agents).toHaveLength(1);
    });

    it('should set up close handler', () => {
      const connectionId = 'test-conn-1';
      manager.addConnection(connectionId, mockSocket, 'dashboard');

      expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should update connection count', () => {
      expect(manager.getConnectionCount()).toBe(0);

      manager.addConnection('conn-1', mockSocket, 'dashboard');
      expect(manager.getConnectionCount()).toBe(1);

      manager.addConnection('conn-2', mockSocket, 'agent');
      expect(manager.getConnectionCount()).toBe(2);
    });
  });

  describe('removeConnection', () => {
    it('should remove an existing connection', () => {
      const connectionId = 'test-conn-1';
      manager.addConnection(connectionId, mockSocket, 'dashboard');

      const removed = manager.removeConnection(connectionId);
      expect(removed).toBe(true);
      expect(manager.getConnection(connectionId)).toBeUndefined();
    });

    it('should return false for non-existent connection', () => {
      const removed = manager.removeConnection('non-existent');
      expect(removed).toBe(false);
    });

    it('should update type tracking', () => {
      manager.addConnection('dash-1', mockSocket, 'dashboard');
      manager.addConnection('dash-2', mockSocket, 'dashboard');

      manager.removeConnection('dash-1');

      const dashboards = manager.getConnectionsByType('dashboard');
      expect(dashboards).toHaveLength(1);
      expect(dashboards[0].id).toBe('dash-2');
    });
  });

  describe('getConnection', () => {
    it('should return connection by ID', () => {
      const connectionId = 'test-conn-1';
      manager.addConnection(connectionId, mockSocket, 'dashboard');

      const connection = manager.getConnection(connectionId);
      expect(connection).toBeDefined();
      expect(connection?.id).toBe(connectionId);
    });

    it('should return undefined for non-existent connection', () => {
      const connection = manager.getConnection('non-existent');
      expect(connection).toBeUndefined();
    });
  });

  describe('broadcast', () => {
    it('should send message to all connections', () => {
      const socket1 = { ...mockSocket, send: vi.fn() };
      const socket2 = { ...mockSocket, send: vi.fn() };

      manager.addConnection('conn-1', socket1 as any, 'dashboard');
      manager.addConnection('conn-2', socket2 as any, 'agent');

      const message: WebSocketMessage = {
        type: 'test:broadcast',
        timestamp: new Date().toISOString()
      };

      manager.broadcast(message);

      expect(socket1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(socket2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should skip closed connections', () => {
      const closedSocket = {
        ...mockSocket,
        readyState: WebSocket.CLOSED,
        send: vi.fn()
      };

      manager.addConnection('conn-1', mockSocket, 'dashboard');
      manager.addConnection('conn-2', closedSocket as any, 'agent');

      const message: WebSocketMessage = {
        type: 'test:broadcast',
        timestamp: new Date().toISOString()
      };

      manager.broadcast(message);

      expect(mockSocket.send).toHaveBeenCalled();
      expect(closedSocket.send).not.toHaveBeenCalled();
    });

    it('should exclude specific connection', () => {
      const socket1 = { ...mockSocket, send: vi.fn() };
      const socket2 = { ...mockSocket, send: vi.fn() };

      manager.addConnection('conn-1', socket1 as any, 'dashboard');
      manager.addConnection('conn-2', socket2 as any, 'agent');

      const message: WebSocketMessage = {
        type: 'test:broadcast',
        timestamp: new Date().toISOString()
      };

      manager.broadcast(message, 'conn-1');

      expect(socket1.send).not.toHaveBeenCalled();
      expect(socket2.send).toHaveBeenCalled();
    });
  });

  describe('broadcastToType', () => {
    it('should send message only to specific type', () => {
      const dashSocket = { ...mockSocket, send: vi.fn() };
      const agentSocket = { ...mockSocket, send: vi.fn() };

      manager.addConnection('dash-1', dashSocket as any, 'dashboard');
      manager.addConnection('agent-1', agentSocket as any, 'agent');

      const message: WebSocketMessage = {
        type: 'test:type-broadcast',
        timestamp: new Date().toISOString()
      };

      manager.broadcastToType('dashboard', message);

      expect(dashSocket.send).toHaveBeenCalled();
      expect(agentSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('sendTo', () => {
    it('should send message to specific connection', () => {
      manager.addConnection('conn-1', mockSocket, 'dashboard');

      const message: WebSocketMessage = {
        type: 'test:direct',
        timestamp: new Date().toISOString()
      };

      const sent = manager.sendTo('conn-1', message);

      expect(sent).toBe(true);
      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should return false for non-existent connection', () => {
      const message: WebSocketMessage = {
        type: 'test:direct',
        timestamp: new Date().toISOString()
      };

      const sent = manager.sendTo('non-existent', message);
      expect(sent).toBe(false);
    });

    it('should return false for closed connection', () => {
      const closedSocket = {
        ...mockSocket,
        readyState: WebSocket.CLOSED
      };

      manager.addConnection('conn-1', closedSocket as any, 'dashboard');

      const message: WebSocketMessage = {
        type: 'test:direct',
        timestamp: new Date().toISOString()
      };

      const sent = manager.sendTo('conn-1', message);
      expect(sent).toBe(false);
    });
  });

  describe('getConnectionsByType', () => {
    it('should return all connections of a type', () => {
      manager.addConnection('dash-1', mockSocket, 'dashboard');
      manager.addConnection('dash-2', mockSocket, 'dashboard');
      manager.addConnection('agent-1', mockSocket, 'agent');

      const dashboards = manager.getConnectionsByType('dashboard');
      expect(dashboards).toHaveLength(2);
      expect(dashboards.every(c => c.type === 'dashboard')).toBe(true);
    });

    it('should return empty array for non-existent type', () => {
      const connections = manager.getConnectionsByType('non-existent' as any);
      expect(connections).toEqual([]);
    });
  });

  describe('getAllConnections', () => {
    it('should return all connections', () => {
      manager.addConnection('conn-1', mockSocket, 'dashboard');
      manager.addConnection('conn-2', mockSocket, 'agent');
      manager.addConnection('conn-3', mockSocket, 'dashboard');

      const all = manager.getAllConnections();
      expect(all).toHaveLength(3);
    });
  });

  describe('closeConnection', () => {
    it('should close and remove connection', () => {
      manager.addConnection('conn-1', mockSocket, 'dashboard');

      manager.closeConnection('conn-1', 1000, 'Test close');

      expect(mockSocket.close).toHaveBeenCalledWith(1000, 'Test close');
      expect(manager.getConnection('conn-1')).toBeUndefined();
    });
  });

  describe('closeAll', () => {
    it('should close all connections', () => {
      const socket1 = { ...mockSocket, close: vi.fn() };
      const socket2 = { ...mockSocket, close: vi.fn() };

      manager.addConnection('conn-1', socket1 as any, 'dashboard');
      manager.addConnection('conn-2', socket2 as any, 'agent');

      manager.closeAll();

      expect(socket1.close).toHaveBeenCalled();
      expect(socket2.close).toHaveBeenCalled();
      expect(manager.getConnectionCount()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return connection statistics', () => {
      manager.addConnection('dash-1', mockSocket, 'dashboard');
      manager.addConnection('dash-2', mockSocket, 'dashboard');
      manager.addConnection('agent-1', mockSocket, 'agent');

      const stats = manager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType.dashboard).toBe(2);
      expect(stats.byType.agent).toBe(1);
    });
  });

  describe('heartbeat', () => {
    it('should send ping to all connections', () => {
      const socket1 = { ...mockSocket, ping: vi.fn() };
      const socket2 = { ...mockSocket, ping: vi.fn() };

      manager.addConnection('conn-1', socket1 as any, 'dashboard');
      manager.addConnection('conn-2', socket2 as any, 'agent');

      manager.heartbeat();

      expect(socket1.ping).toHaveBeenCalled();
      expect(socket2.ping).toHaveBeenCalled();
    });

    it('should track unresponsive connections', () => {
      vi.useFakeTimers();

      const socket1 = {
        ...mockSocket,
        ping: vi.fn((cb: Function) => cb()),
        terminate: vi.fn()
      };

      manager.addConnection('conn-1', socket1 as any, 'dashboard');

      // First heartbeat marks as pending
      manager.heartbeat();

      // Second heartbeat without pong response should terminate
      vi.advanceTimersByTime(30000);
      manager.heartbeat();

      expect(socket1.terminate).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('cleanup', () => {
    it('should remove closed connections', () => {
      const openSocket = { ...mockSocket, readyState: WebSocket.OPEN };
      const closedSocket = { ...mockSocket, readyState: WebSocket.CLOSED };

      manager.addConnection('open-1', openSocket as any, 'dashboard');
      manager.addConnection('closed-1', closedSocket as any, 'dashboard');

      manager.cleanup();

      expect(manager.getConnection('open-1')).toBeDefined();
      expect(manager.getConnection('closed-1')).toBeUndefined();
    });
  });
});