#!/bin/bash

echo "Testing Claude Agent Process Spawning"
echo "======================================"
echo

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  ANTHROPIC_API_KEY not set. Using test key (agent will spawn but API calls will fail)"
    export ONSEMBL_API_KEY="sk-test-key-for-spawning-only"
else
    echo "✅ Using ANTHROPIC_API_KEY from environment"
    export ONSEMBL_API_KEY="$ANTHROPIC_API_KEY"
fi

# Set environment variables
export ONSEMBL_AGENT_TYPE=claude
export ONSEMBL_LOG_LEVEL=debug
export ONSEMBL_SERVER_URL=ws://localhost:3001/ws

# Check if Claude is available
if command -v claude &> /dev/null; then
    echo "✅ Claude CLI found at: $(which claude)"
    echo "   Version: $(claude --version 2>&1 || echo 'unknown')"
else
    echo "❌ Claude CLI not found in PATH"
    echo "   Trying explicit path..."
    export ONSEMBL_AGENT_COMMAND=/Users/tythanhdoan/.nvm/versions/node/v22.18.0/bin/claude
    if [ -f "$ONSEMBL_AGENT_COMMAND" ]; then
        echo "✅ Found at: $ONSEMBL_AGENT_COMMAND"
    else
        echo "❌ Not found at explicit path either"
        exit 1
    fi
fi

echo
echo "Starting agent wrapper with Claude..."
echo "Press Ctrl+C to stop"
echo

# Run the CLI start command with all required parameters
npx tsx src/cli.ts start \
  --agent "$ONSEMBL_AGENT_TYPE" \
  --server "$ONSEMBL_SERVER_URL" \
  --api-key "$ONSEMBL_API_KEY"