# Testing Interactive Mode

## Quick Start

### Test with Claude (Subscription Auth)
```bash
# Run directly in your terminal (not through a script!)
npx tsx src/cli.ts start --agent claude --auth-type subscription --interactive --no-websocket
```

### Test with Mock Agent
```bash
npx tsx src/cli.ts start --agent mock --interactive --no-websocket
```

## Test Scripts

Pre-made test scripts are available in `test-scripts/`:
- `test-scripts/test-interactive-dev.sh` - Primary test script using tsx
- `test-scripts/test-claude-interactive.sh` - Test with real Claude
- See `test-scripts/README.md` for complete list

## What You Should See

When successful with Claude:
1. Mode detection logs showing "interactive" mode
2. Claude's welcome banner with the Claude Code UI
3. An interactive prompt where you can type normally
4. Full color and formatting preservation

## Requirements

- Claude CLI installed and logged in (`claude login`)
- Node.js 18+ with npm/npx
- Terminal with TTY support (most modern terminals)

## Troubleshooting

If Claude exits immediately:
- Make sure you're running the command directly in terminal (not via script)
- Verify Claude is logged in: `claude status`
- Test Claude works: `echo "What is 2+2?" | claude`

## Technical Details

The interactive mode uses:
- **node-pty** for pseudo-terminal emulation
- **TTY passthrough** to preserve Claude's full UI
- **Raw mode** for proper keyboard input handling
- **ANSI preservation** for colors and formatting