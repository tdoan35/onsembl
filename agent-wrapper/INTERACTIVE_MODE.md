# Interactive Mode - Command Prefix Implementation

## Overview
Interactive mode now supports **command prefixes** that allow you to control the agent wrapper without the commands being passed to the child process (Claude, etc.).

## The Problem
When running in interactive mode with a pseudo-terminal (PTY):
- Terminal is in **raw mode** - all keystrokes are passed directly to the child process
- **Ctrl+C** is sent to the child process, not the wrapper
- No way to exit the wrapper gracefully without killing the child process first

## The Solution: Command Prefixes
Commands starting with `~~` are intercepted by the wrapper before reaching the PTY.

## Available Commands

### `~~exit`
Exit interactive mode and stop the wrapper gracefully.

**Usage:**
```
~~exit<Enter>
```

**What it does:**
1. Detects the command in the input buffer
2. Clears the command from the terminal display
3. Shows "Exiting interactive mode..." message
4. Triggers graceful shutdown:
   - Disables raw mode
   - Stops resize handler
   - Kills PTY process
   - Disconnects WebSocket
   - Cleans up resources
5. Exits the wrapper

### `~~help`
Display available wrapper commands.

**Usage:**
```
~~help<Enter>
```

**What it shows:**
```
╔═══════════════════════════════════════════════════════╗
║         Onsembl Agent Wrapper - Commands             ║
╠═══════════════════════════════════════════════════════╣
║  ~~exit   Exit interactive mode and stop the wrapper ║
║  ~~help   Show this help message                     ║
╚═══════════════════════════════════════════════════════╝
```

## How It Works

### Input Buffer
- Maintains a rolling 50-character buffer of recent input
- Each keystroke is added to the buffer
- Buffer is checked for command patterns

### Command Detection
1. Input handler receives each character in raw mode
2. Character is added to input buffer
3. Buffer is checked for `~~exit\r` or `~~exit\n` (handles Windows & Unix)
4. If match found:
   - Command is handled by wrapper
   - Input is NOT passed to PTY
   - Returns `true` to prevent passthrough
5. If no match:
   - Input is passed to PTY normally
   - Returns `false`

### Startup Message
When entering interactive mode, you'll see:
```
═══════════════════════════════════════════════════════
  Interactive Mode Enabled
  Type ~~help for commands | Type ~~exit to quit
═══════════════════════════════════════════════════════
```

## Implementation Details

### Code Location
File: `src/terminal/interactive-wrapper.ts`

### Key Components

1. **Input Buffer** (Line 41)
   ```typescript
   private inputBuffer: string = '';
   ```

2. **Input Handler** (Lines 190-201)
   ```typescript
   this.inputMultiplexer.addSource('terminal', process.stdin, {
     handler: (data: string) => {
       if (this.handleInputCommand(data)) {
         return; // Command handled, don't send to PTY
       }
       this.ptyManager?.write(data);
     }
   });
   ```

3. **Command Detector** (Lines 347-405)
   ```typescript
   private handleInputCommand(data: string): boolean {
     this.inputBuffer += data;

     // Check for ~~exit
     if (this.inputBuffer.endsWith('~~exit\r') ||
         this.inputBuffer.endsWith('~~exit\n')) {
       // Handle exit...
       return true;
     }

     // Check for ~~help
     if (this.inputBuffer.endsWith('~~help\r') ||
         this.inputBuffer.endsWith('~~help\n')) {
       // Display help...
       return true;
     }

     return false; // Pass through to PTY
   }
   ```

## Testing

### Test Mock Agent
```bash
onsembl-agent start --agent mock
# Type: ~~help<Enter>
# Type: ~~exit<Enter>
```

### Test Claude Agent
```bash
onsembl-agent start --agent claude --interactive
# Type: ~~help<Enter>
# Type: ~~exit<Enter>
```

## Future Command Ideas

You can easily extend this pattern to add more commands:

- `~~pause` - Pause command execution
- `~~resume` - Resume command execution
- `~~status` - Show wrapper status
- `~~reconnect` - Reconnect WebSocket
- `~~mode local` - Switch to local mode
- `~~mode remote` - Switch to remote mode

### Adding New Commands

```typescript
// In handleInputCommand method:
if (this.inputBuffer.endsWith('~~yourcommand\r') ||
    this.inputBuffer.endsWith('~~yourcommand\n')) {
  // Clear line
  process.stdout.write('\r\x1b[K');

  // Do something
  this.yourAction();

  // Clear buffer
  this.inputBuffer = '';

  return true; // Command handled
}
```

## Notes

- Commands must be typed exactly: `~~exit` (case sensitive)
- Commands require Enter/Return to execute
- Commands are hidden from the PTY child process
- Commands work in both Windows (CR) and Unix (LF) line endings
- Input buffer is limited to 50 chars for performance
- Input buffer is cleared on shutdown

## Advantages

✓ No need to modify the child process (Claude CLI)
✓ Works in raw mode without interfering with terminal control
✓ Extensible pattern for adding more commands
✓ Clean exit without killing child process abruptly
✓ User-friendly with help system
✓ Cross-platform (Windows & Unix)
