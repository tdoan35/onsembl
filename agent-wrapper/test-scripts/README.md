# Test Scripts

This directory contains test scripts for the agent wrapper terminal passthrough feature.

## Important Test Scripts

### Interactive Mode Testing

#### `test-interactive-dev.sh`
**Primary test script** - Uses `tsx` to run in development mode (bypasses TypeScript compilation)
```bash
./test-interactive-dev.sh  # Tests with mock agent
```

#### `test-claude-interactive.sh`
Tests interactive mode with real Claude CLI using subscription authentication
```bash
./test-claude-interactive.sh  # Requires Claude CLI login
```

### Debug Scripts

#### `test-claude-pty.js`
Direct PTY test that successfully launches Claude - useful for debugging PTY issues
```bash
node test-claude-pty.js
```

#### `debug-wrapper.js`
Minimal debug version of the wrapper for isolating issues
```bash
node debug-wrapper.js
```

### Other Scripts

- `test-claude-diagnostic.sh` - Diagnostic checks for Claude CLI
- `test-claude-direct.js` - Direct Claude spawning test
- `test-claude-tty-check.js` - TTY detection tests
- `test-interactive.sh` - Original test script (requires build)
- `test-real-claude.sh` - Alternative Claude testing script

## Running Tests

For most testing, use:
```bash
# Test with mock agent
./test-interactive-dev.sh

# Test with real Claude (requires login)
./test-claude-interactive.sh
```