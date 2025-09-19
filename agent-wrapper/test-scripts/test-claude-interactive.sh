#!/bin/bash

echo "Testing Onsembl Agent Wrapper with Claude (Subscription Auth)"
echo "=============================================================="
echo ""
echo "This test will:"
echo "1. Use your Claude subscription (no API key needed)"
echo "2. Run in interactive mode with terminal passthrough"
echo "3. Preserve Claude's full terminal UI"
echo "4. Run without WebSocket (local only)"
echo ""
echo "Make sure you're logged into Claude CLI first:"
echo "  If not logged in, run: claude login"
echo ""
echo "Starting Claude in interactive mode..."
echo "You can use Claude normally - type your prompts and see responses!"
echo "Press Ctrl+C to exit when done."
echo ""

# Run Claude with subscription auth in interactive mode
npx tsx src/cli.ts start \
  --agent claude \
  --auth-type subscription \
  --interactive \
  --no-websocket