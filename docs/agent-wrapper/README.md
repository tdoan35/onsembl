# Onsembl Agent Wrapper

The Onsembl Agent Wrapper is a Node.js CLI tool that provides a standardized interface for managing and orchestrating AI coding agents (Claude, Gemini, Codex) through the Onsembl platform.

## Overview

The agent wrapper acts as a bridge between AI coding agents and the Onsembl backend, providing:

- **User Authentication**: OAuth 2.0 device flow authentication with secure credential storage
- **Agent Management**: Register, start, monitor, and control AI agents
- **Real-time Communication**: WebSocket connection for streaming terminal output and commands
- **Secure Token Storage**: Cross-platform credential storage using OS keychain with encrypted file fallback
- **Process Management**: Spawn and manage agent processes with resource limits

## Installation

### Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn package manager

### Install from npm (when published)

```bash
npm install -g @onsembl/agent-wrapper
```

### Install from source

```bash
git clone https://github.com/your-org/onsembl
cd onsembl/agent-wrapper
npm install
npm run build
npm link
```

## Quick Start

1. **Authenticate with Onsembl**:
   ```bash
   onsembl-agent auth login
   ```
   This will open your browser to complete OAuth authentication.

2. **Register a new agent**:
   ```bash
   onsembl-agent agent register --name my-claude-agent --type claude
   ```

3. **Start your agent**:
   ```bash
   onsembl-agent agent start my-claude-agent
   ```

4. **Monitor agent status**:
   ```bash
   onsembl-agent agent list
   ```

## Authentication Commands

### `auth login [options]`
Authenticate with the Onsembl platform using OAuth device flow.

**Options:**
- `--server-url <url>` - Backend server URL (default: ws://localhost:8080)
- `--no-open` - Don't automatically open browser

**Example:**
```bash
onsembl-agent auth login --server-url https://api.onsembl.ai
```

### `auth logout`
Sign out and remove stored credentials.

**Example:**
```bash
onsembl-agent auth logout
```

### `auth status`
Check authentication status and token validity.

**Example:**
```bash
onsembl-agent auth status
```

## Agent Management Commands

### `agent list [options]`
List all registered agents for the authenticated user.

**Options:**
- `--status <status>` - Filter by status (online, offline, executing, error, maintenance)
- `--type <type>` - Filter by agent type (claude, gemini, codex, custom)

**Example:**
```bash
onsembl-agent agent list --status online --type claude
```

### `agent register [options]`
Register a new agent with the platform.

**Options:**
- `--name <name>` - Agent name (required)
- `--type <type>` - Agent type: claude, gemini, codex, custom (required)
- `--description <desc>` - Agent description

**Example:**
```bash
onsembl-agent agent register \
  --name "Claude Dev Assistant" \
  --type claude \
  --description "Claude agent for development tasks"
```

### `agent start <name> [options]`
Start a registered agent and connect to the platform.

**Options:**
- `--working-directory <dir>` - Set working directory (default: current directory)
- `--log-level <level>` - Set log level: debug, info, warn, error (default: info)
- `--max-memory <mb>` - Maximum memory usage in MB (default: 1024)
- `--max-cpu <percent>` - Maximum CPU usage percentage (default: 80)

**Example:**
```bash
onsembl-agent agent start my-claude-agent \
  --working-directory /path/to/project \
  --log-level debug \
  --max-memory 2048
```

### `agent delete <name>`
Delete a registered agent.

**Example:**
```bash
onsembl-agent agent delete my-old-agent
```

### `agent restart <name>`
Restart a running agent.

**Example:**
```bash
onsembl-agent agent restart my-claude-agent
```

## Global Options

All commands support these global options:

- `--config <path>` - Path to configuration file
- `--help` - Show help information
- `--version` - Show version information

## Configuration

The agent wrapper can be configured through:

1. **Environment variables**
2. **Configuration file** (`.env` in current directory)
3. **Command-line arguments**

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ONSEMBL_SERVER_URL` | Backend server URL | `ws://localhost:8080` |
| `ONSEMBL_API_KEY` | API key (for non-OAuth auth) | - |
| `ONSEMBL_AUTH_TYPE` | Authentication type | `api-key` |
| `ONSEMBL_AGENT_TYPE` | Default agent type | `mock` |
| `ONSEMBL_MAX_MEMORY_MB` | Memory limit in MB | `1024` |
| `ONSEMBL_MAX_CPU_PERCENT` | CPU limit percentage | `80` |
| `ONSEMBL_LOG_LEVEL` | Logging level | `info` |

### Agent-Specific Configuration

#### Claude Agent
| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_MODEL` | Claude model to use | `claude-3-sonnet-20240229` |
| `CLAUDE_MAX_TOKENS` | Maximum tokens per request | `4000` |
| `CLAUDE_TEMPERATURE` | Response temperature | `0.7` |

#### Gemini Agent
| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_MODEL` | Gemini model to use | `gemini-pro` |
| `GEMINI_MAX_TOKENS` | Maximum tokens per request | `4000` |
| `GEMINI_TEMPERATURE` | Response temperature | `0.7` |

#### Codex Agent
| Variable | Description | Default |
|----------|-------------|---------|
| `CODEX_MODEL` | Codex model to use | `gpt-4` |
| `CODEX_MAX_TOKENS` | Maximum tokens per request | `4000` |
| `CODEX_TEMPERATURE` | Response temperature | `0.3` |

## Advanced Usage

### Custom Working Directory

Set a specific working directory for your agent:

```bash
onsembl-agent agent start my-agent --working-directory /path/to/project
```

### Resource Limits

Control agent resource usage:

```bash
onsembl-agent agent start my-agent --max-memory 2048 --max-cpu 50
```

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
onsembl-agent agent start my-agent --log-level debug
```

### Programmatic Usage

The agent wrapper can also be used programmatically:

```typescript
import { AgentWrapper } from '@onsembl/agent-wrapper';

const wrapper = new AgentWrapper({
  serverUrl: 'wss://api.onsembl.ai',
  agentType: 'claude',
  workingDirectory: process.cwd()
});

await wrapper.start();
```

## Troubleshooting

### Authentication Issues

1. **"Authentication failed"**
   - Ensure you're using the correct server URL
   - Try `onsembl-agent auth login` to re-authenticate
   - Check if your tokens have expired with `onsembl-agent auth status`

2. **"Browser didn't open"**
   - Use `onsembl-agent auth login --no-open` and manually visit the URL
   - Check if you have a default browser configured

### Connection Issues

1. **"WebSocket connection failed"**
   - Verify the server URL is correct
   - Check network connectivity
   - Ensure the backend server is running

2. **"Agent registration failed"**
   - Verify you're authenticated with `onsembl-agent auth status`
   - Check if an agent with the same name already exists

### Agent Issues

1. **"Agent not found"**
   - List available agents with `onsembl-agent agent list`
   - Ensure you're using the exact agent name

2. **"Agent start failed"**
   - Check if the agent command is available in PATH
   - Verify resource limits are reasonable
   - Check logs with `--log-level debug`

### Credential Storage Issues

1. **"Keychain access denied"**
   - Grant keychain access when prompted
   - Credentials will fall back to encrypted file storage

2. **"Permission denied"**
   - Check file permissions in your home directory
   - Try running with appropriate permissions

## Security

- **OAuth 2.0**: Secure authentication using industry-standard OAuth device flow
- **Token Storage**: Credentials stored securely in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Encrypted Fallback**: When keychain unavailable, credentials are encrypted and stored in `~/.onsembl/credentials`
- **Token Rotation**: Automatic token refresh to maintain security
- **No Hardcoded Secrets**: All credentials obtained through secure authentication flow

## Development

### Building from Source

```bash
git clone https://github.com/your-org/onsembl
cd onsembl/agent-wrapper
npm install
npm run build
```

### Running Tests

```bash
npm test
npm run test:watch  # Watch mode
```

### Development Mode

```bash
npm run dev  # Watch mode with hot reload
```

## Support

- **Documentation**: [docs.onsembl.ai](https://docs.onsembl.ai)
- **Issues**: [GitHub Issues](https://github.com/your-org/onsembl/issues)
- **Community**: [Discord](https://discord.gg/onsembl)

## License

MIT License - see [LICENSE](../../LICENSE) for details.