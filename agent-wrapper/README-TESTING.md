# Testing Agent Process Spawning

## Prerequisites

The agent wrapper can spawn three types of AI CLI tools:
- **Claude** - Claude Code CLI
- **Gemini** - Gemini CLI
- **Codex** - OpenAI Codex CLI

## Testing with Real Agents

### 1. Start the Agent Wrapper with Claude

Since you have Claude Code installed (`/Users/tythanhdoan/.nvm/versions/node/v22.18.0/bin/claude`), you can test with it:

```bash
# From agent-wrapper directory
cd /Users/tythanhdoan/Desktop/onsembl/agent-wrapper

# Start with Claude agent
ONSEMBL_AGENT_TYPE=claude \
ONSEMBL_API_KEY=your-api-key \
ONSEMBL_SERVER_URL=ws://localhost:8080 \
npm start
```

### 2. Test Standalone Agent Spawning

Run the test script to verify agent spawning:

```bash
# Test all agents (will skip those not installed)
npx tsx test-agent-spawn.ts

# Test only Claude (if installed)
ONSEMBL_AGENT_TYPE=claude npx tsx test-agent-spawn.ts
```

### 3. Manual Testing with Environment Variables

```bash
# Test Claude agent directly
ONSEMBL_AGENT_TYPE=claude \
ONSEMBL_AGENT_COMMAND=/Users/tythanhdoan/.nvm/versions/node/v22.18.0/bin/claude \
ONSEMBL_API_KEY=test-key \
npx tsx src/cli.ts
```

## What Happens When You Run an Agent

1. **Validation**: The agent checks if the CLI tool exists
2. **Process Spawn**: Uses Node.js `spawn()` to create a child process
3. **Command Arguments**:
   - Claude: Uses `--print --output-format stream-json` for programmatic interaction
   - Gemini: Uses `--approval-mode yolo` for non-interactive mode
   - Codex: Uses `proto` subcommand for protocol stream mode
4. **I/O Handling**: Captures stdout/stderr and sends via WebSocket
5. **Health Monitoring**: Periodic health checks every 10 seconds
6. **Graceful Shutdown**: Sends SIGTERM, waits, then SIGKILL if needed

## Troubleshooting

### "CLI tool not found in PATH"
The agent can't find the CLI. Solutions:
1. Install the CLI tool globally
2. Provide full path via `ONSEMBL_AGENT_COMMAND` env var
3. Ensure the tool is in your PATH

### "Agent fails to start"
Check the debug output:
```bash
ONSEMBL_LOG_LEVEL=debug npm start
```

### Testing without Real CLIs
Use the mock agent for testing without installing actual CLI tools:
```bash
ONSEMBL_AGENT_TYPE=mock npm start
```

## Current Implementation Status

✅ **Completed:**
- Process spawning logic for all agents
- Proper command-line arguments for each CLI
- Stream capture and WebSocket forwarding
- Health checking and auto-restart
- Graceful shutdown handling

⚠️ **Note:**
- Claude Code with `--print` mode requires API authentication
- Gemini and Codex CLIs must be installed separately
- Mock agent works without any external dependencies