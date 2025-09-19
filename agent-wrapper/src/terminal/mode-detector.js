export class ModeDetector {
  constructor(logger) {
    this.logger = logger;
  }

  detectMode(options = {}) {
    const isTTY = process.stdin.isTTY && process.stdout.isTTY;
    const forceMode = options.interactive || options.headless;

    let mode = 'headless';
    let reason = 'default';

    if (forceMode) {
      if (options.interactive) {
        mode = 'interactive';
        reason = 'forced via --interactive flag';
      } else if (options.headless) {
        mode = 'headless';
        reason = 'forced via --headless flag';
      }
    } else if (isTTY) {
      mode = 'interactive';
      reason = 'TTY detected';
    } else {
      mode = 'headless';
      reason = 'no TTY detected (piped/redirected)';
    }

    this.logger.info('Mode detection complete', { mode, reason, isTTY });

    return {
      mode,
      reason,
      isTTY,
      capabilities: this.getCapabilities(mode)
    };
  }

  getCapabilities(mode) {
    const capabilities = {
      interactive: {
        terminalPassthrough: true,
        preserveANSI: true,
        cursorControl: true,
        resizeEvents: true,
        rawInput: true,
        statusBar: true,
        localPriority: true
      },
      headless: {
        terminalPassthrough: false,
        preserveANSI: false,
        cursorControl: false,
        resizeEvents: false,
        rawInput: false,
        statusBar: false,
        localPriority: false
      }
    };

    return capabilities[mode] || capabilities.headless;
  }

  canSwitchModes(currentMode, targetMode) {
    if (currentMode === targetMode) {
      return { canSwitch: false, reason: 'Already in target mode' };
    }

    if (targetMode === 'interactive' && !process.stdin.isTTY) {
      return { canSwitch: false, reason: 'Cannot switch to interactive mode without TTY' };
    }

    return { canSwitch: true, reason: 'Mode switch allowed' };
  }
}