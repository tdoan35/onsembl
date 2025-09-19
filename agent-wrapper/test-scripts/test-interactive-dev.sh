#!/bin/bash

echo "Testing Onsembl Agent Wrapper Interactive Mode (Development)"
echo "============================================================="
echo ""
echo "Running in development mode with tsx (bypassing TypeScript build)..."
echo ""
echo "Testing interactive mode with mock agent..."
echo ""
echo "This will:"
echo "1. Start in interactive mode with terminal passthrough"
echo "2. Use mock agent for testing"
echo "3. Disable WebSocket connection (local only)"
echo ""
echo "Press Ctrl+C to exit when ready."
echo ""

# Run using tsx in development mode (no build needed)
# Set a dummy API key for mock agent to bypass validation
ONSEMBL_API_KEY=mock-api-key npx tsx src/cli.ts start --agent mock --interactive --no-websocket