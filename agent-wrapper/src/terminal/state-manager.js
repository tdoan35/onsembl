import EventEmitter from 'events';

export class StateManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.state = {
      mode: 'headless',
      controlMode: 'local',
      agent: {
        type: null,
        pid: null,
        status: 'disconnected',
        startTime: null,
        lastActivity: null
      },
      terminal: {
        dimensions: { cols: 80, rows: 24 },
        hasOutput: false,
        isInteractive: false
      },
      firstOutputReceived: false,
      websocket: {
        connected: false,
        connectionId: null,
        lastHeartbeat: null
      },
      queue: {
        localCommands: [],
        remoteCommands: [],
        activeCommand: null
      },
      performance: {
        latency: 0,
        messagesProcessed: 0,
        bytesTransferred: 0
      }
    };

    this.stateHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;
    this.subscribers = new Map();
  }

  updateState(path, value) {
    const oldValue = this.getState(path);

    if (oldValue === value) {
      return;
    }

    const pathParts = path.split('.');
    let current = this.state;

    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }

    current[pathParts[pathParts.length - 1]] = value;

    const change = {
      path,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    };

    this.addToHistory(change);
    this.emit('state-change', change);
    this.notifySubscribers(path, change);

    this.logger?.debug('State updated', { path, oldValue, newValue: value });
  }

  getState(path = null) {
    if (!path) {
      return { ...this.state };
    }

    const pathParts = path.split('.');
    let current = this.state;

    for (const part of pathParts) {
      if (current[part] === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  batchUpdate(updates) {
    const changes = [];

    for (const [path, value] of Object.entries(updates)) {
      const oldValue = this.getState(path);
      if (oldValue !== value) {
        this.updateState(path, value);
        changes.push({ path, oldValue, newValue: value });
      }
    }

    if (changes.length > 0) {
      this.emit('batch-update', { changes, timestamp: Date.now() });
    }

    return changes;
  }

  subscribe(path, callback) {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }

    this.subscribers.get(path).add(callback);

    const unsubscribe = () => {
      const callbacks = this.subscribers.get(path);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(path);
        }
      }
    };

    return unsubscribe;
  }

  notifySubscribers(path, change) {
    const exactSubscribers = this.subscribers.get(path) || new Set();

    for (const callback of exactSubscribers) {
      try {
        callback(change);
      } catch (error) {
        this.logger?.error('Subscriber callback error', { path, error: error.message });
      }
    }

    for (const [subscribedPath, callbacks] of this.subscribers) {
      if (path.startsWith(subscribedPath + '.') || subscribedPath.startsWith(path + '.')) {
        for (const callback of callbacks) {
          try {
            callback(change);
          } catch (error) {
            this.logger?.error('Subscriber callback error', { subscribedPath, error: error.message });
          }
        }
      }
    }
  }

  addToHistory(change) {
    this.stateHistory.push(change);

    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  getHistory(limit = 10) {
    return this.stateHistory.slice(-limit);
  }

  clearHistory() {
    this.stateHistory = [];
  }

  createSnapshot() {
    return {
      state: JSON.parse(JSON.stringify(this.state)),
      timestamp: Date.now(),
      id: this.generateSnapshotId()
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || !snapshot.state) {
      throw new Error('Invalid snapshot');
    }

    const previousState = this.state;
    this.state = JSON.parse(JSON.stringify(snapshot.state));

    this.emit('snapshot-restored', {
      snapshot,
      previousState,
      timestamp: Date.now()
    });

    this.logger?.info('State restored from snapshot', { snapshotId: snapshot.id });
  }

  generateSnapshotId() {
    return `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  switchControlMode(newMode) {
    const validModes = ['local', 'remote', 'shared'];

    if (!validModes.includes(newMode)) {
      throw new Error(`Invalid control mode: ${newMode}`);
    }

    const oldMode = this.state.controlMode;

    if (oldMode === newMode) {
      return false;
    }

    this.updateState('controlMode', newMode);

    this.emit('control-mode-switch', {
      oldMode,
      newMode,
      timestamp: Date.now()
    });

    this.logger?.info('Control mode switched', { oldMode, newMode });

    return true;
  }

  isRemoteControlActive() {
    return this.state.controlMode === 'remote' || this.state.controlMode === 'shared';
  }

  isLocalControlActive() {
    return this.state.controlMode === 'local' || this.state.controlMode === 'shared';
  }

  getPerformanceMetrics() {
    return {
      ...this.state.performance,
      uptime: this.state.agent.startTime
        ? Date.now() - this.state.agent.startTime
        : 0,
      stateHistorySize: this.stateHistory.length,
      subscriberCount: this.subscribers.size
    };
  }
}