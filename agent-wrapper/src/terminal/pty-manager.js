import * as pty from 'node-pty';
import EventEmitter from 'events';
import { Transform } from 'stream';

export class PTYManager extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.ptyProcess = null;
    this.isInteractive = false;
    this.dimensions = {
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24
    };
  }

  spawn(command, args = [], options = {}) {
    // Extract env from options to handle separately
    const { env: optionEnv, ...otherOptions } = options;

    const ptyOptions = {
      name: 'xterm-256color',
      cols: this.dimensions.cols,
      rows: this.dimensions.rows,
      cwd: process.cwd(),
      env: { ...process.env, ...(optionEnv || {}) },
      ...otherOptions
    };

    this.logger.info('Spawning PTY process', {
      command,
      args,
      dimensions: this.dimensions,
      cwd: ptyOptions.cwd,
      envKeys: Object.keys(ptyOptions.env || {}).slice(0, 10) // Log first 10 env keys for debugging
    });

    try {
      this.ptyProcess = pty.spawn(command, args, ptyOptions);
      this.isInteractive = true;

      this.ptyProcess.onData((data) => {
        this.emit('data', data);
      });

      this.ptyProcess.onExit(({ exitCode, signal }) => {
        this.logger.info('PTY process exited', { exitCode, signal });
        this.emit('exit', { exitCode, signal });
        this.isInteractive = false;
      });

      // Also capture any error output
      this.ptyProcess.on('error', (error) => {
        this.logger.error('PTY process error', error);
        this.emit('error', error);
      });

      return this.ptyProcess;
    } catch (error) {
      this.logger.error('Failed to spawn PTY process', error);
      throw error;
    }
  }

  write(data) {
    if (!this.ptyProcess) {
      throw new Error('PTY process not spawned');
    }
    this.ptyProcess.write(data);
  }

  resize(cols, rows) {
    if (!this.ptyProcess) {
      this.logger.warn('Cannot resize: PTY process not spawned');
      return;
    }

    this.dimensions = { cols, rows };
    this.ptyProcess.resize(cols, rows);
    this.logger.debug('PTY resized', { cols, rows });
    this.emit('resize', { cols, rows });
  }

  kill(signal = 'SIGTERM') {
    if (!this.ptyProcess) {
      return;
    }

    this.logger.info('Killing PTY process', { signal });
    this.ptyProcess.kill(signal);
    this.ptyProcess = null;
    this.isInteractive = false;
  }

  createOutputMultiplexer() {
    const multiplexer = new Transform({
      transform(chunk, encoding, callback) {
        this.push(chunk);
        callback();
      }
    });

    multiplexer.on('data', (data) => {
      this.emit('multiplexed-output', data);
    });

    return multiplexer;
  }

  createInputMultiplexer() {
    const multiplexer = new Transform({
      transform(chunk, encoding, callback) {
        this.push(chunk);
        callback();
      }
    });

    multiplexer.on('data', (data) => {
      this.emit('multiplexed-input', data);
    });

    return multiplexer;
  }
}