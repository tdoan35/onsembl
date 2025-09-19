import { Transform } from 'stream';
import stripAnsi from 'strip-ansi';

export class OutputMultiplexer extends Transform {
  constructor(options = {}) {
    super();
    this.mode = options.mode || 'headless';
    this.logger = options.logger;
    this.destinations = new Map();
    this.preserveAnsi = options.preserveAnsi !== false;
    this.bufferSize = options.bufferSize || 65536;
    this.buffer = '';
  }

  addDestination(name, handler, options = {}) {
    this.destinations.set(name, {
      handler,
      stripAnsi: options.stripAnsi || false,
      format: options.format || 'raw',
      active: options.active !== false
    });

    this.logger?.debug('Added output destination', { name, options });
  }

  removeDestination(name) {
    this.destinations.delete(name);
    this.logger?.debug('Removed output destination', { name });
  }

  toggleDestination(name, active) {
    const dest = this.destinations.get(name);
    if (dest) {
      dest.active = active;
      this.logger?.debug('Toggled output destination', { name, active });
    }
  }

  _transform(chunk, encoding, callback) {
    const data = chunk.toString();
    this.buffer += data;

    if (this.buffer.length > this.bufferSize) {
      this.buffer = this.buffer.slice(-this.bufferSize);
    }

    for (const [name, dest] of this.destinations) {
      if (!dest.active) continue;

      try {
        let processedData = data;

        if (dest.stripAnsi) {
          processedData = stripAnsi(data);
        }

        if (dest.format === 'json') {
          processedData = {
            type: 'terminal_output',
            data: processedData,
            timestamp: Date.now(),
            hasAnsi: data !== stripAnsi(data)
          };
        }

        dest.handler(processedData);
      } catch (error) {
        this.logger?.error('Error in output destination handler', {
          name,
          error: error.message
        });
      }
    }

    if (this.mode === 'interactive' && this.preserveAnsi) {
      this.push(chunk);
    } else if (this.mode === 'headless') {
      this.push(stripAnsi(data));
    }

    callback();
  }

  getBuffer() {
    return this.buffer;
  }

  clearBuffer() {
    this.buffer = '';
  }
}