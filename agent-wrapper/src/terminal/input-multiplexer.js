import EventEmitter from 'events';
import readline from 'readline';

export class InputMultiplexer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mode = options.mode || 'headless';
    this.logger = options.logger;
    this.sources = new Map();
    this.commandQueue = [];
    this.activeSource = null;
    this.lockOwner = null;
    this.lockTimeout = null;
    this.defaultPriority = {
      terminal: 10,
      dashboard: 5,
      api: 3
    };
  }

  addSource(name, stream, options = {}) {
    const priority = options.priority || this.defaultPriority[name] || 1;

    const source = {
      name,
      stream,
      priority,
      active: options.active !== false,
      canInterrupt: options.canInterrupt || false,
      handler: options.handler
    };

    this.sources.set(name, source);

    if (stream && typeof stream.on === 'function') {
      stream.on('data', (data) => this.handleInput(name, data));
    }

    this.logger?.info('Added input source', { name, priority });
  }

  removeSource(name) {
    const source = this.sources.get(name);
    if (source && source.stream) {
      source.stream.removeAllListeners('data');
    }
    this.sources.delete(name);

    if (this.lockOwner === name) {
      this.releaseLock();
    }

    this.logger?.info('Removed input source', { name });
  }

  handleInput(sourceName, data) {
    const source = this.sources.get(sourceName);
    if (!source || !source.active) {
      this.logger?.debug('Input from inactive source ignored', { sourceName });
      return;
    }

    const command = {
      source: sourceName,
      data,
      priority: source.priority,
      timestamp: Date.now(),
      id: this.generateCommandId()
    };

    if (this.lockOwner && this.lockOwner !== sourceName) {
      const lockSource = this.sources.get(this.lockOwner);
      if (!source.canInterrupt || source.priority <= lockSource.priority) {
        this.queueCommand(command);
        this.logger?.debug('Command queued due to active lock', {
          command: command.id,
          lockOwner: this.lockOwner
        });
        return;
      }

      this.logger?.info('Higher priority source interrupting', {
        interruptor: sourceName,
        interrupted: this.lockOwner
      });
      this.releaseLock();
    }

    this.processCommand(command);
  }

  queueCommand(command) {
    this.commandQueue.push(command);
    this.commandQueue.sort((a, b) => b.priority - a.priority);

    this.emit('command-queued', {
      command,
      queueLength: this.commandQueue.length
    });

    this.logger?.debug('Command queue updated', {
      queueLength: this.commandQueue.length,
      topPriority: this.commandQueue[0]?.priority
    });
  }

  processCommand(command) {
    this.activeSource = command.source;
    const source = this.sources.get(command.source);

    if (source.handler) {
      source.handler(command.data);
    }

    this.emit('input', {
      source: command.source,
      data: command.data,
      priority: command.priority,
      timestamp: command.timestamp
    });

    if (this.mode === 'interactive' && command.source === 'terminal') {
      this.acquireLock(command.source, 5000);
    }
  }

  acquireLock(sourceName, duration = 0) {
    this.lockOwner = sourceName;

    if (duration > 0) {
      this.lockTimeout = setTimeout(() => {
        this.releaseLock();
      }, duration);
    }

    this.logger?.debug('Lock acquired', { owner: sourceName, duration });
    this.emit('lock-acquired', { owner: sourceName });
  }

  releaseLock() {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }

    const previousOwner = this.lockOwner;
    this.lockOwner = null;

    this.logger?.debug('Lock released', { previousOwner });
    this.emit('lock-released', { previousOwner });

    this.processNextInQueue();
  }

  processNextInQueue() {
    if (this.commandQueue.length === 0) {
      return;
    }

    const nextCommand = this.commandQueue.shift();
    this.logger?.debug('Processing queued command', {
      command: nextCommand.id,
      remainingQueue: this.commandQueue.length
    });

    this.processCommand(nextCommand);
  }

  getQueueStatus() {
    return {
      queueLength: this.commandQueue.length,
      lockOwner: this.lockOwner,
      activeSource: this.activeSource,
      queue: this.commandQueue.map(cmd => ({
        id: cmd.id,
        source: cmd.source,
        priority: cmd.priority,
        age: Date.now() - cmd.timestamp
      }))
    };
  }

  clearQueue(sourceName = null) {
    if (sourceName) {
      this.commandQueue = this.commandQueue.filter(
        cmd => cmd.source !== sourceName
      );
    } else {
      this.commandQueue = [];
    }

    this.logger?.info('Command queue cleared', {
      source: sourceName,
      remainingCommands: this.commandQueue.length
    });
  }

  generateCommandId() {
    return `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  setupRawMode() {
    if (!process.stdin.isTTY) {
      this.logger?.warn('Cannot setup raw mode: stdin is not a TTY');
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
      if (key && key.ctrl && key.name === 'c') {
        this.emit('interrupt');
      } else if (key && key.ctrl && key.name === 'r') {
        this.emit('mode-switch-request');
      }
    });

    this.logger?.info('Raw mode enabled for terminal input');
  }

  disableRawMode() {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
      this.logger?.info('Raw mode disabled');
    }
  }
}