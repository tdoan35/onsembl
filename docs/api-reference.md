# Onsembl.ai Control Center API Reference

## Overview

The Onsembl.ai Control Center REST API provides endpoints for managing AI agents, commands, and system operations. This API follows RESTful conventions and uses JSON for request and response payloads.

**Base URLs:**
- Production: `https://api.onsembl.ai/v1`
- Local Development: `http://localhost:3000/v1`

**API Version:** 0.1.0

## Authentication

The API uses JWT Bearer token authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Authentication Flow

1. **Request Magic Link** - Send an email address to receive a magic link
2. **Verify Token** - Exchange the magic link token for JWT tokens

## Endpoints

### Authentication

#### POST /auth/magic-link

Request a magic link for authentication.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Magic link sent successfully"
}
```

**Error Responses:**
- `400` - Bad request (invalid email format)
- `429` - Too many requests (rate limited)

---

#### POST /auth/verify

Verify magic link token and receive JWT tokens.

**Request Body:**
```json
{
  "token": "magic-link-token-here"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `401` - Unauthorized (invalid or expired token)

### Agents

#### GET /agents

List all agents with optional filtering.

**Query Parameters:**
- `type` (optional): Filter by agent type (`CLAUDE`, `GEMINI`, `CODEX`)
- `status` (optional): Filter by status (`ONLINE`, `OFFLINE`, `CONNECTING`, `ERROR`)

**Response (200):**
```json
{
  "agents": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Claude Agent 1",
      "type": "CLAUDE",
      "status": "ONLINE",
      "activityState": "IDLE",
      "hostMachine": "agent-server-01",
      "connectedAt": "2024-01-15T10:30:00Z",
      "disconnectedAt": null,
      "healthMetrics": {
        "cpuUsage": 25.5,
        "memoryUsage": 512.0,
        "uptime": 86400,
        "commandsProcessed": 42,
        "averageResponseTime": 1250.5
      },
      "config": {
        "serverUrl": "https://api.onsembl.ai",
        "autoReconnect": true,
        "maxRetries": 3
      },
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

#### GET /agents/{agentId}

Get details for a specific agent.

**Path Parameters:**
- `agentId` (required): UUID of the agent

**Response (200):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Claude Agent 1",
  "type": "CLAUDE",
  "status": "ONLINE",
  "activityState": "PROCESSING",
  "hostMachine": "agent-server-01",
  "connectedAt": "2024-01-15T10:30:00Z",
  "disconnectedAt": null,
  "healthMetrics": {
    "cpuUsage": 45.2,
    "memoryUsage": 768.0,
    "uptime": 86400,
    "commandsProcessed": 42,
    "averageResponseTime": 1250.5
  },
  "config": {
    "serverUrl": "https://api.onsembl.ai",
    "autoReconnect": true,
    "maxRetries": 3
  },
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:45:00Z"
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Agent not found

---

#### POST /agents/{agentId}/restart

Restart a specific agent.

**Path Parameters:**
- `agentId` (required): UUID of the agent

**Response (200):**
```json
{
  "message": "Agent restart initiated"
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Agent not found

---

#### POST /agents/{agentId}/stop

Stop a specific agent.

**Path Parameters:**
- `agentId` (required): UUID of the agent

**Response (200):**
```json
{
  "message": "Agent stopped successfully"
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Agent not found

### Commands

#### GET /commands

List commands with optional filtering and pagination.

**Query Parameters:**
- `status` (optional): Filter by status (`PENDING`, `QUEUED`, `EXECUTING`, `COMPLETED`, `FAILED`, `CANCELLED`)
- `agentId` (optional): Filter by agent UUID
- `limit` (optional): Maximum number of results (default: 50, max: 100)
- `offset` (optional): Number of results to skip (default: 0)

**Response (200):**
```json
{
  "commands": [
    {
      "id": "456e7890-e89b-12d3-a456-426614174001",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "content": "Analyze the codebase and suggest improvements",
      "type": "INVESTIGATE",
      "targetAgents": ["789e0123-e89b-12d3-a456-426614174002"],
      "broadcast": false,
      "status": "EXECUTING",
      "priority": 75,
      "executionConstraints": {
        "timeLimitMs": 300000,
        "tokenBudget": 10000
      },
      "startedAt": "2024-01-15T11:00:00Z",
      "completedAt": null,
      "error": null,
      "createdAt": "2024-01-15T10:55:00Z",
      "updatedAt": "2024-01-15T11:00:00Z"
    }
  ],
  "total": 1
}
```

---

#### POST /commands

Create and queue a new command.

**Request Body:**
```json
{
  "content": "Review the authentication module for security vulnerabilities",
  "type": "REVIEW",
  "targetAgents": ["789e0123-e89b-12d3-a456-426614174002"],
  "broadcast": false,
  "priority": 80,
  "executionConstraints": {
    "timeLimitMs": 600000,
    "tokenBudget": 15000
  }
}
```

**Response (201):**
```json
{
  "id": "456e7890-e89b-12d3-a456-426614174001",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "content": "Review the authentication module for security vulnerabilities",
  "type": "REVIEW",
  "targetAgents": ["789e0123-e89b-12d3-a456-426614174002"],
  "broadcast": false,
  "status": "QUEUED",
  "priority": 80,
  "executionConstraints": {
    "timeLimitMs": 600000,
    "tokenBudget": 15000
  },
  "startedAt": null,
  "completedAt": null,
  "error": null,
  "createdAt": "2024-01-15T11:05:00Z",
  "updatedAt": "2024-01-15T11:05:00Z"
}
```

**Error Responses:**
- `400` - Bad request (invalid command data)
- `401` - Unauthorized

---

#### GET /commands/{commandId}

Get details for a specific command.

**Path Parameters:**
- `commandId` (required): UUID of the command

**Response (200):**
```json
{
  "id": "456e7890-e89b-12d3-a456-426614174001",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "content": "Analyze the codebase and suggest improvements",
  "type": "INVESTIGATE",
  "targetAgents": ["789e0123-e89b-12d3-a456-426614174002"],
  "broadcast": false,
  "status": "COMPLETED",
  "priority": 75,
  "executionConstraints": {
    "timeLimitMs": 300000,
    "tokenBudget": 10000
  },
  "startedAt": "2024-01-15T11:00:00Z",
  "completedAt": "2024-01-15T11:15:00Z",
  "error": null,
  "createdAt": "2024-01-15T10:55:00Z",
  "updatedAt": "2024-01-15T11:15:00Z"
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Command not found

---

#### POST /commands/{commandId}/cancel

Cancel a command execution.

**Path Parameters:**
- `commandId` (required): UUID of the command

**Request Body (optional):**
```json
{
  "reason": "User requested cancellation"
}
```

**Response (200):**
```json
{
  "message": "Command cancelled successfully"
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Command not found

---

#### GET /commands/{commandId}/output

Get terminal output for a command.

**Path Parameters:**
- `commandId` (required): UUID of the command

**Query Parameters:**
- `agentId` (optional): Filter by agent UUID
- `streamType` (optional): Filter by stream type (`STDOUT`, `STDERR`)

**Response (200):**
```json
{
  "outputs": [
    {
      "id": "789e0123-e89b-12d3-a456-426614174003",
      "commandId": "456e7890-e89b-12d3-a456-426614174001",
      "agentId": "789e0123-e89b-12d3-a456-426614174002",
      "streamType": "STDOUT",
      "content": "Starting analysis of authentication module...",
      "ansiCodes": true,
      "timestamp": "2024-01-15T11:00:30Z",
      "sequence": 1
    }
  ]
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Command not found

---

#### GET /commands/{commandId}/traces

Get LLM trace tree for a command.

**Path Parameters:**
- `commandId` (required): UUID of the command

**Response (200):**
```json
{
  "traces": [
    {
      "id": "abc1234-e89b-12d3-a456-426614174004",
      "commandId": "456e7890-e89b-12d3-a456-426614174001",
      "agentId": "789e0123-e89b-12d3-a456-426614174002",
      "parentId": null,
      "type": "LLM_PROMPT",
      "name": "Initial Analysis",
      "content": {
        "prompt": "Analyze this authentication module...",
        "model": "claude-3-sonnet",
        "temperature": 0.7
      },
      "startedAt": "2024-01-15T11:00:00Z",
      "completedAt": "2024-01-15T11:00:45Z",
      "durationMs": 45000,
      "tokensUsed": 2500,
      "error": null,
      "metadata": {
        "modelVersion": "claude-3-sonnet-20240229"
      },
      "children": [
        {
          "id": "def5678-e89b-12d3-a456-426614174005",
          "type": "TOOL_CALL",
          "name": "File Reader",
          "content": {
            "tool": "read_file",
            "parameters": {
              "path": "/src/auth/middleware.ts"
            }
          },
          "startedAt": "2024-01-15T11:00:15Z",
          "completedAt": "2024-01-15T11:00:20Z",
          "durationMs": 5000,
          "tokensUsed": null,
          "error": null,
          "metadata": null,
          "children": []
        }
      ]
    }
  ]
}
```

**Error Responses:**
- `401` - Unauthorized
- `404` - Command not found

### System Operations

#### POST /emergency-stop

Emergency stop all agents immediately.

**Request Body (optional):**
```json
{
  "reason": "Security incident detected"
}
```

**Response (200):**
```json
{
  "message": "Emergency stop executed successfully",
  "agentsStopped": 3
}
```

**Error Responses:**
- `401` - Unauthorized

### Command Presets

#### GET /presets

List all command presets.

**Response (200):**
```json
{
  "presets": [
    {
      "id": "preset-123-456-789",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Security Review",
      "description": "Comprehensive security analysis of code modules",
      "content": "Review the {{module_name}} for security vulnerabilities including {{vulnerability_types}}",
      "type": "REVIEW",
      "targetAgentTypes": ["CLAUDE", "GEMINI"],
      "variables": [
        {
          "name": "module_name",
          "description": "Name of the module to review",
          "default": "authentication"
        },
        {
          "name": "vulnerability_types",
          "description": "Types of vulnerabilities to check for",
          "default": "SQL injection, XSS, CSRF"
        }
      ],
      "usageCount": 15,
      "lastUsedAt": "2024-01-15T09:30:00Z",
      "createdAt": "2024-01-10T14:20:00Z",
      "updatedAt": "2024-01-15T09:30:00Z"
    }
  ]
}
```

---

#### POST /presets

Create a new command preset.

**Request Body:**
```json
{
  "name": "Code Quality Check",
  "description": "Automated code quality analysis",
  "content": "Analyze {{file_path}} for code quality issues focusing on {{focus_areas}}",
  "type": "INVESTIGATE",
  "targetAgentTypes": ["CLAUDE"],
  "variables": [
    {
      "name": "file_path",
      "description": "Path to the file to analyze",
      "default": ""
    },
    {
      "name": "focus_areas",
      "description": "Areas to focus analysis on",
      "default": "performance, maintainability, readability"
    }
  ]
}
```

**Response (201):**
```json
{
  "id": "preset-789-012-345",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Code Quality Check",
  "description": "Automated code quality analysis",
  "content": "Analyze {{file_path}} for code quality issues focusing on {{focus_areas}}",
  "type": "INVESTIGATE",
  "targetAgentTypes": ["CLAUDE"],
  "variables": [
    {
      "name": "file_path",
      "description": "Path to the file to analyze",
      "default": ""
    },
    {
      "name": "focus_areas",
      "description": "Areas to focus analysis on",
      "default": "performance, maintainability, readability"
    }
  ],
  "usageCount": 0,
  "lastUsedAt": null,
  "createdAt": "2024-01-15T12:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

**Error Responses:**
- `400` - Bad request (invalid preset data)
- `401` - Unauthorized

---

#### GET /presets/{presetId}

Get details for a specific preset.

**Path Parameters:**
- `presetId` (required): UUID of the preset

**Response (200):**
Same as individual preset object in the list response.

**Error Responses:**
- `401` - Unauthorized
- `404` - Preset not found

---

#### PUT /presets/{presetId}

Update an existing preset.

**Path Parameters:**
- `presetId` (required): UUID of the preset

**Request Body:**
```json
{
  "name": "Updated Security Review",
  "description": "Enhanced security analysis with additional checks",
  "content": "Perform comprehensive security review of {{module_name}} including {{security_checks}}",
  "type": "REVIEW",
  "targetAgentTypes": ["CLAUDE", "GEMINI"],
  "variables": [
    {
      "name": "module_name",
      "description": "Name of the module to review",
      "default": "authentication"
    },
    {
      "name": "security_checks",
      "description": "Security checks to perform",
      "default": "authentication, authorization, input validation, output encoding"
    }
  ]
}
```

**Response (200):**
Returns the updated preset object.

**Error Responses:**
- `400` - Bad request (invalid preset data)
- `401` - Unauthorized
- `404` - Preset not found

---

#### DELETE /presets/{presetId}

Delete a preset.

**Path Parameters:**
- `presetId` (required): UUID of the preset

**Response (204):**
No content (successful deletion).

**Error Responses:**
- `401` - Unauthorized
- `404` - Preset not found

### Investigation Reports

#### GET /reports

List investigation reports with optional filtering.

**Query Parameters:**
- `agentId` (optional): Filter by agent UUID
- `status` (optional): Filter by status (`DRAFT`, `IN_PROGRESS`, `COMPLETE`)

**Response (200):**
```json
{
  "reports": [
    {
      "id": "report-123-456-789",
      "commandId": "456e7890-e89b-12d3-a456-426614174001",
      "agentId": "789e0123-e89b-12d3-a456-426614174002",
      "title": "Authentication Module Security Analysis",
      "summary": "Comprehensive security review identified 3 vulnerabilities and 5 improvement opportunities",
      "status": "COMPLETE",
      "content": {
        "sections": [
          {
            "title": "Executive Summary",
            "content": "The authentication module review revealed...",
            "type": "summary",
            "order": 1
          }
        ],
        "findings": [
          {
            "description": "Potential SQL injection vulnerability in login function",
            "severity": "HIGH",
            "evidence": [
              "Line 45: Direct string concatenation in SQL query",
              "No parameterized queries used"
            ]
          }
        ],
        "recommendations": [
          {
            "action": "Implement parameterized queries",
            "priority": "HIGH",
            "rationale": "Prevents SQL injection attacks"
          }
        ]
      },
      "attachments": [],
      "createdAt": "2024-01-15T11:00:00Z",
      "updatedAt": "2024-01-15T11:30:00Z",
      "completedAt": "2024-01-15T11:30:00Z"
    }
  ]
}
```

---

#### GET /reports/{reportId}

Get details for a specific report.

**Path Parameters:**
- `reportId` (required): UUID of the report

**Response (200):**
Same as individual report object in the list response.

**Error Responses:**
- `401` - Unauthorized
- `404` - Report not found

---

#### GET /reports/{reportId}/export

Export a report in various formats.

**Path Parameters:**
- `reportId` (required): UUID of the report

**Query Parameters:**
- `format` (optional): Export format (`json`, `markdown`, `pdf`) - default: `json`

**Response (200):**
- `application/json` - JSON format
- `text/markdown` - Markdown format
- `application/pdf` - PDF format (binary)

**Error Responses:**
- `401` - Unauthorized
- `404` - Report not found

### Audit Logs

#### GET /audit-logs

Query audit logs with filtering and pagination.

**Query Parameters:**
- `eventType` (optional): Filter by event type
- `userId` (optional): Filter by user UUID
- `agentId` (optional): Filter by agent UUID
- `from` (optional): Start date (ISO 8601 format)
- `to` (optional): End date (ISO 8601 format)
- `limit` (optional): Maximum results (default: 100, max: 1000)

**Response (200):**
```json
{
  "logs": [
    {
      "id": "log-123-456-789",
      "eventType": "COMMAND_EXECUTED",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "agentId": "789e0123-e89b-12d3-a456-426614174002",
      "commandId": "456e7890-e89b-12d3-a456-426614174001",
      "details": {
        "commandType": "INVESTIGATE",
        "executionTime": 45000,
        "tokensUsed": 2500
      },
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
      "createdAt": "2024-01-15T11:15:00Z"
    }
  ],
  "total": 1
}
```

**Error Responses:**
- `401` - Unauthorized

### Execution Constraints

#### GET /constraints

List execution constraints.

**Response (200):**
```json
{
  "constraints": [
    {
      "id": "constraint-123-456-789",
      "name": "Standard Execution",
      "description": "Default constraints for regular commands",
      "timeLimitMs": 300000,
      "tokenBudget": 10000,
      "memoryLimitMb": 512,
      "cpuLimitPercent": 50,
      "isDefault": true,
      "createdAt": "2024-01-10T10:00:00Z",
      "updatedAt": "2024-01-10T10:00:00Z"
    }
  ]
}
```

**Error Responses:**
- `401` - Unauthorized

## Data Types

### Enums

**AgentType:**
- `CLAUDE` - Anthropic Claude agents
- `GEMINI` - Google Gemini agents
- `CODEX` - OpenAI Codex agents

**AgentStatus:**
- `ONLINE` - Agent is connected and available
- `OFFLINE` - Agent is disconnected
- `CONNECTING` - Agent is in the process of connecting
- `ERROR` - Agent has encountered an error

**AgentActivity:**
- `IDLE` - Agent is not currently processing commands
- `PROCESSING` - Agent is actively executing a command
- `QUEUED` - Agent has queued commands waiting

**CommandType:**
- `NATURAL` - Natural language command
- `INVESTIGATE` - Investigation and analysis task
- `REVIEW` - Code or document review
- `PLAN` - Planning and strategy task
- `SYNTHESIZE` - Data synthesis and summary

**CommandStatus:**
- `PENDING` - Command created but not yet queued
- `QUEUED` - Command is in the queue waiting for execution
- `EXECUTING` - Command is currently being processed
- `COMPLETED` - Command completed successfully
- `FAILED` - Command failed with an error
- `CANCELLED` - Command was cancelled by user or system

**StreamType:**
- `STDOUT` - Standard output stream
- `STDERR` - Standard error stream

**TraceType:**
- `LLM_PROMPT` - Large Language Model prompt/response
- `TOOL_CALL` - Tool or function call
- `RESPONSE` - Agent response or output

**ReportStatus:**
- `DRAFT` - Report is being drafted
- `IN_PROGRESS` - Report is actively being generated
- `COMPLETE` - Report generation is finished

## Error Handling

The API uses standard HTTP status codes and returns error details in JSON format:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid command type specified",
  "details": {
    "field": "type",
    "allowedValues": ["NATURAL", "INVESTIGATE", "REVIEW", "PLAN", "SYNTHESIZE"]
  }
}
```

**Common Error Codes:**
- `400` - Bad Request (validation errors, malformed requests)
- `401` - Unauthorized (missing or invalid authentication)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limiting)
- `500` - Internal Server Error (server-side errors)

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Default Limit:** 100 requests per minute per user
- **Rate Limit Headers:**
  - `X-RateLimit-Limit` - Total requests allowed per window
  - `X-RateLimit-Remaining` - Requests remaining in current window
  - `X-RateLimit-Reset` - Time when the rate limit window resets

When rate limited, the API returns a `429` status with a `Retry-After` header indicating when to retry.

## WebSocket Integration

While this document covers the REST API, real-time features like terminal output streaming and agent status updates are handled via WebSocket connections. See the WebSocket Protocol documentation for details on real-time communication.

## SDKs and Examples

For code examples and SDK documentation, see:
- [JavaScript/TypeScript SDK](./sdk-javascript.md)
- [Python SDK](./sdk-python.md)
- [cURL Examples](./examples-curl.md)