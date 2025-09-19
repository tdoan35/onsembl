#!/bin/bash

echo "Testing Claude Agent with Subscription Authentication"
echo "====================================================="
echo

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
echo "Checking Claude subscription authentication..."

# Check if Claude has a valid session token
if claude --version &>/dev/null; then
    echo "✅ Claude appears to have valid authentication"
else
    echo "⚠️  Claude may need authentication setup"
    echo "   Run: claude setup-token"
    echo "   to authenticate with your Claude subscription"
fi

# Set environment variables for subscription auth
export ONSEMBL_AGENT_TYPE=claude
export ONSEMBL_AUTH_TYPE=subscription
export ONSEMBL_LOG_LEVEL=debug
export ONSEMBL_SERVER_URL=ws://localhost:3001/ws

echo
echo "Starting agent wrapper with Claude (subscription auth)..."
echo "Press Ctrl+C to stop"
echo

# Run the CLI start command with subscription auth
npx tsx src/cli.ts start \
  --agent "$ONSEMBL_AGENT_TYPE" \
  --server "$ONSEMBL_SERVER_URL" \
  --auth-type "$ONSEMBL_AUTH_TYPE"