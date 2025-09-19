#!/bin/bash

echo "Testing Onsembl Agent Wrapper Interactive Mode"
echo "================================================"

# Build the project first
echo "Building the project..."
npm run build

if [ $? -ne 0 ]; then
  echo "Build failed. Please fix compilation errors first."
  exit 1
fi

echo ""
echo "Build successful!"
echo ""
echo "Testing interactive mode with mock agent..."
echo "Run: npm run start -- start --agent mock --interactive --no-websocket"
echo ""
echo "This will:"
echo "1. Start in interactive mode with terminal passthrough"
echo "2. Use mock agent for testing"
echo "3. Disable WebSocket connection (local only)"
echo ""
echo "Press Ctrl+C to exit when ready."
echo ""

# Run the interactive mode test
npm run start -- start --agent mock --interactive --no-websocket