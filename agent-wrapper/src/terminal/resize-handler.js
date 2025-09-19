import EventEmitter from 'events';

export class ResizeHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.ptyManager = options.ptyManager;
    this.stateManager = options.stateManager;
    this.debounceDelay = options.debounceDelay || 100;
    this.resizeTimeout = null;
    this.lastDimensions = {
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24
    };
    this.isListening = false;
  }

  start() {
    if (this.isListening) {
      return;
    }

    if (!process.stdout.isTTY) {
      this.logger?.warn('Cannot listen for resize events: stdout is not a TTY');
      return;
    }

    process.stdout.on('resize', () => this.handleResize());
    process.on('SIGWINCH', () => this.handleResize());

    this.isListening = true;
    this.logger?.info('Terminal resize handler started', {
      initialDimensions: this.lastDimensions
    });

    this.handleResize();
  }

  stop() {
    if (!this.isListening) {
      return;
    }

    process.stdout.removeAllListeners('resize');
    process.removeAllListeners('SIGWINCH');

    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    this.isListening = false;
    this.logger?.info('Terminal resize handler stopped');
  }

  handleResize() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      this.performResize();
    }, this.debounceDelay);
  }

  performResize() {
    const newDimensions = {
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24
    };

    if (
      newDimensions.cols === this.lastDimensions.cols &&
      newDimensions.rows === this.lastDimensions.rows
    ) {
      return;
    }

    const oldDimensions = { ...this.lastDimensions };
    this.lastDimensions = newDimensions;

    if (this.ptyManager && this.ptyManager.ptyProcess) {
      try {
        this.ptyManager.resize(newDimensions.cols, newDimensions.rows);
      } catch (error) {
        this.logger?.error('Failed to resize PTY', {
          error: error.message,
          dimensions: newDimensions
        });
      }
    }

    if (this.stateManager) {
      this.stateManager.updateState('terminal.dimensions', newDimensions);
    }

    this.emit('resize', {
      oldDimensions,
      newDimensions,
      timestamp: Date.now()
    });

    this.logger?.info('Terminal resized', {
      old: oldDimensions,
      new: newDimensions
    });
  }

  getDimensions() {
    return { ...this.lastDimensions };
  }

  forceDimensions(cols, rows) {
    const dimensions = { cols, rows };

    this.lastDimensions = dimensions;

    if (this.ptyManager && this.ptyManager.ptyProcess) {
      this.ptyManager.resize(cols, rows);
    }

    if (this.stateManager) {
      this.stateManager.updateState('terminal.dimensions', dimensions);
    }

    this.emit('resize', {
      oldDimensions: this.lastDimensions,
      newDimensions: dimensions,
      forced: true,
      timestamp: Date.now()
    });

    this.logger?.info('Terminal dimensions forced', dimensions);
  }
}