# Implementation Patterns

**Purpose**: This document provides reusable code patterns, base classes, and utilities to accelerate implementation of Onsembl.ai components.

## Table of Contents
- [Configuration Patterns](#configuration-patterns)
- [Database Patterns](#database-patterns)
- [WebSocket Patterns](#websocket-patterns)
- [API Patterns](#api-patterns)
- [Testing Patterns](#testing-patterns)
- [Frontend Patterns](#frontend-patterns)
- [Agent Patterns](#agent-patterns)

## Configuration Patterns

### Environment Configuration
```typescript
// backend/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().default('3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_KEY: z.string(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

export const env = envSchema.parse(process.env);
```

### Fastify Configuration
```typescript
// backend/src/config/fastify.ts
import { FastifyServerOptions } from 'fastify';
import { env } from './env';

export const fastifyConfig: FastifyServerOptions = {
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        hostname: req.hostname,
        remoteAddress: req.ip,
      }),
    },
  },
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  trustProxy: true, // For Fly.io deployment
};
```

### WebSocket Configuration
```typescript
// backend/src/config/websocket.ts
import { WebSocketServerOptions } from 'ws';
import { validateJWT } from '../auth/jwt';

export const websocketConfig: Partial<WebSocketServerOptions> = {
  maxPayload: 1024 * 1024, // 1MB max message size
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
  },
  verifyClient: async (info, cb) => {
    try {
      const token = info.req.headers.authorization?.replace('Bearer ', '');
      const payload = await validateJWT(token);
      info.req.userId = payload.sub;
      cb(true);
    } catch (error) {
      cb(false, 401, 'Unauthorized');
    }
  },
};
```

## Database Patterns

### Supabase Model Base Class
```typescript
// backend/src/models/base.model.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

export class ModelError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message);
    this.name = 'ModelError';
  }
}

export abstract class BaseModel<T extends { id: string }> {
  protected abstract tableName: string;

  constructor(protected supabase: SupabaseClient<Database>) {}

  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new ModelError('FIND_ERROR', `Failed to find ${this.tableName}`, error);
    }

    return data;
  }

  async findAll(filters?: Partial<T>): Promise<T[]> {
    let query = this.supabase.from(this.tableName).select('*');

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    const { data, error } = await query;

    if (error) {
      throw new ModelError('FIND_ALL_ERROR', `Failed to find ${this.tableName}`, error);
    }

    return data || [];
  }

  async create(entity: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(entity)
      .select()
      .single();

    if (error) {
      throw new ModelError('CREATE_ERROR', `Failed to create ${this.tableName}`, error);
    }

    return data;
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ModelError('UPDATE_ERROR', `Failed to update ${this.tableName}`, error);
    }

    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      throw new ModelError('DELETE_ERROR', `Failed to delete ${this.tableName}`, error);
    }
  }

  // Real-time subscription helper
  subscribe(callback: (payload: T) => void) {
    return this.supabase
      .channel(`${this.tableName}_changes`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: this.tableName },
        (payload) => callback(payload.new as T)
      )
      .subscribe();
  }
}
```

### Model Implementation Example
```typescript
// backend/src/models/agent.model.ts
import { BaseModel } from './base.model';
import { Agent, AgentStatus, AgentType } from '@onsembl/agent-protocol';

export class AgentModel extends BaseModel<Agent> {
  protected tableName = 'agents';

  async updateStatus(id: string, status: AgentStatus): Promise<Agent> {
    const updates: Partial<Agent> = {
      status,
      ...(status === 'ONLINE' && { connected_at: new Date().toISOString() }),
      ...(status === 'OFFLINE' && { disconnected_at: new Date().toISOString() }),
    };

    return this.update(id, updates);
  }

  async updateHealthMetrics(id: string, metrics: Agent['health_metrics']): Promise<Agent> {
    return this.update(id, { health_metrics: metrics });
  }

  async findByType(type: AgentType): Promise<Agent[]> {
    return this.findAll({ type });
  }

  async findOnlineAgents(): Promise<Agent[]> {
    return this.findAll({ status: 'ONLINE' });
  }
}
```

## WebSocket Patterns

### Message Handler Pattern
```typescript
// backend/src/websocket/message-handler.ts
import { WebSocketMessage, MessageType } from '@onsembl/agent-protocol';
import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';

export type MessageHandler<T = any> = (
  payload: T,
  socket: WebSocket,
  request: FastifyRequest
) => Promise<void>;

export class MessageRouter {
  private handlers = new Map<MessageType, MessageHandler>();

  register<T>(type: MessageType, handler: MessageHandler<T>): void {
    this.handlers.set(type, handler);
  }

  async handle(
    message: WebSocketMessage,
    socket: WebSocket,
    request: FastifyRequest
  ): Promise<void> {
    const handler = this.handlers.get(message.type);

    if (!handler) {
      socket.send(JSON.stringify({
        type: 'ERROR',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: {
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${message.type}`,
        },
      }));
      return;
    }

    try {
      await handler(message.payload, socket, request);
    } catch (error) {
      request.log.error(error, `Error handling message ${message.type}`);
      socket.send(JSON.stringify({
        type: 'ERROR',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: {
          code: 'HANDLER_ERROR',
          message: 'Failed to process message',
          details: error.message,
        },
      }));
    }
  }
}
```

### Connection Pool Pattern
```typescript
// backend/src/websocket/connection-pool.ts
import { WebSocket } from 'ws';

export interface Connection {
  id: string;
  type: 'agent' | 'dashboard';
  socket: WebSocket;
  metadata: Record<string, any>;
  lastHeartbeat: Date;
}

export class ConnectionPool {
  private connections = new Map<string, Connection>();
  private heartbeatInterval: NodeJS.Timer;

  constructor(private heartbeatIntervalMs = 30000) {
    this.startHeartbeatMonitor();
  }

  add(connection: Connection): void {
    this.connections.set(connection.id, connection);

    connection.socket.on('close', () => {
      this.remove(connection.id);
    });

    connection.socket.on('pong', () => {
      connection.lastHeartbeat = new Date();
    });
  }

  remove(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.socket.terminate();
      this.connections.delete(id);
    }
  }

  get(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  getByType(type: 'agent' | 'dashboard'): Connection[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.type === type);
  }

  broadcast(message: any, filter?: (conn: Connection) => boolean): void {
    const messageStr = JSON.stringify(message);
    this.connections.forEach(connection => {
      if ((!filter || filter(connection)) && connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(messageStr);
      }
    });
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = this.heartbeatIntervalMs * 3; // 3 missed pings

      this.connections.forEach((connection, id) => {
        const timeSinceLastHeartbeat = now.getTime() - connection.lastHeartbeat.getTime();

        if (timeSinceLastHeartbeat > timeout) {
          console.log(`Connection ${id} timed out`);
          this.remove(id);
        } else if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.ping();
        }
      });
    }, this.heartbeatIntervalMs);
  }

  destroy(): void {
    clearInterval(this.heartbeatInterval);
    this.connections.forEach(conn => conn.socket.terminate());
    this.connections.clear();
  }
}
```

### JWT Token Rotation Pattern
```typescript
// backend/src/websocket/token-manager.ts
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { env } from '../config/env';

export class TokenManager {
  private readonly ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days
  private readonly REFRESH_WINDOW = 5 * 60; // 5 minutes before expiry

  async rotateTokenIfNeeded(socket: WebSocket, currentToken: string): Promise<void> {
    try {
      const decoded = jwt.decode(currentToken) as any;
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - now;

      if (timeUntilExpiry <= this.REFRESH_WINDOW) {
        const newToken = await this.refreshToken(decoded.sub);

        socket.send(JSON.stringify({
          type: 'TOKEN_REFRESH',
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          payload: {
            accessToken: newToken,
            expiresIn: this.ACCESS_TOKEN_EXPIRY,
          },
        }));
      }
    } catch (error) {
      console.error('Token rotation failed:', error);
    }
  }

  private async refreshToken(userId: string): Promise<string> {
    return jwt.sign(
      { sub: userId },
      env.JWT_SECRET,
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    );
  }
}
```

## API Patterns

### Route Handler Pattern
```typescript
// backend/src/api/base.route.ts
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export abstract class BaseRoute {
  constructor(protected fastify: FastifyInstance) {}

  abstract register(): void;

  protected handleError(error: any, reply: FastifyReply): void {
    if (error.name === 'ModelError') {
      reply.status(400).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    } else if (error.name === 'ValidationError') {
      reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors,
      });
    } else {
      reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  }

  protected async withErrorHandling(
    handler: () => Promise<any>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const result = await handler();
      reply.send(result);
    } catch (error) {
      this.handleError(error, reply);
    }
  }
}
```

### API Route Implementation Example
```typescript
// backend/src/api/agents.route.ts
import { BaseRoute } from './base.route';
import { AgentModel } from '../models/agent.model';
import { AgentService } from '../services/agent.service';

export class AgentsRoute extends BaseRoute {
  private agentModel: AgentModel;
  private agentService: AgentService;

  constructor(fastify: FastifyInstance) {
    super(fastify);
    this.agentModel = new AgentModel(fastify.supabase);
    this.agentService = new AgentService(this.agentModel);
  }

  register(): void {
    // GET /agents
    this.fastify.get('/agents', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['CLAUDE', 'GEMINI', 'CODEX'] },
            status: { type: 'string', enum: ['ONLINE', 'OFFLINE', 'CONNECTING', 'ERROR'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              agents: {
                type: 'array',
                items: { $ref: 'agent#' },
              },
              total: { type: 'integer' },
            },
          },
        },
      },
      preHandler: [this.fastify.authenticate],
    }, async (request, reply) => {
      await this.withErrorHandling(async () => {
        const agents = await this.agentModel.findAll(request.query);
        return { agents, total: agents.length };
      }, reply);
    });

    // POST /agents/:id/restart
    this.fastify.post('/agents/:id/restart', {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
      preHandler: [this.fastify.authenticate],
    }, async (request, reply) => {
      await this.withErrorHandling(async () => {
        await this.agentService.restart(request.params.id);
        return { message: 'Agent restart initiated' };
      }, reply);
    });
  }
}
```

## Testing Patterns

### Contract Test Pattern (RED Phase)
```typescript
// backend/tests/contract/auth/magic-link.test.ts
import { build } from '../../../src/app';
import { FastifyInstance } from 'fastify';

describe('POST /auth/magic-link', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await build({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 and send magic link', async () => {
    // This test MUST fail initially (RED phase)
    const response = await app.inject({
      method: 'POST',
      url: '/auth/magic-link',
      payload: {
        email: 'test@example.com',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: expect.stringContaining('Magic link sent'),
    });
  });

  it('should return 400 for invalid email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/magic-link',
      payload: {
        email: 'invalid-email',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error');
  });
});
```

### WebSocket Test Pattern
```typescript
// backend/tests/websocket/agent-connect.test.ts
import WebSocket from 'ws';
import { build } from '../../../src/app';

describe('Agent WebSocket Connection', () => {
  let app;
  let ws: WebSocket;

  beforeAll(async () => {
    app = await build();
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    if (ws) ws.close();
    await app.close();
  });

  it('should accept agent connection with valid token', (done) => {
    const token = 'valid-jwt-token'; // Mock or generate
    ws = new WebSocket(`ws://localhost:${app.server.address().port}/ws/agent/test-agent`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: {
          agentId: 'test-agent',
          agentType: 'CLAUDE',
          version: '1.0.0',
          hostMachine: 'test-machine',
          capabilities: {
            maxTokens: 100000,
            supportsInterrupt: true,
            supportsTrace: true,
          },
        },
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'SERVER_HEARTBEAT') {
        expect(message.payload).toHaveProperty('serverTime');
        done();
      }
    });
  });
});
```

## Frontend Patterns

### Zustand Store Pattern
```typescript
// frontend/src/stores/agent.store.ts
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { Agent } from '@onsembl/agent-protocol';

interface AgentStore {
  agents: Agent[];
  selectedAgentId: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';

  // Actions
  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  selectAgent: (id: string | null) => void;
  setConnectionStatus: (status: AgentStore['connectionStatus']) => void;

  // Computed
  selectedAgent: () => Agent | undefined;
  onlineAgents: () => Agent[];
}

export const useAgentStore = create<AgentStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      agents: [],
      selectedAgentId: null,
      connectionStatus: 'disconnected',

      setAgents: (agents) => set({ agents }),

      updateAgent: (id, updates) => set((state) => ({
        agents: state.agents.map(agent =>
          agent.id === id ? { ...agent, ...updates } : agent
        ),
      })),

      selectAgent: (id) => set({ selectedAgentId: id }),

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      selectedAgent: () => {
        const state = get();
        return state.agents.find(a => a.id === state.selectedAgentId);
      },

      onlineAgents: () => {
        return get().agents.filter(a => a.status === 'ONLINE');
      },
    })),
    { name: 'agent-store' }
  )
);
```

### shadcn/ui Component Pattern
```typescript
// frontend/src/components/agents/agent-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Play, Square, RotateCw } from "lucide-react";
import { Agent } from "@onsembl/agent-protocol";

interface AgentCardProps {
  agent: Agent;
  onRestart: (id: string) => void;
  onStop: (id: string) => void;
}

export function AgentCard({ agent, onRestart, onStop }: AgentCardProps) {
  const statusVariant = {
    ONLINE: 'success',
    OFFLINE: 'secondary',
    CONNECTING: 'warning',
    ERROR: 'destructive',
  }[agent.status] as any;

  const activityIcon = {
    IDLE: <Play className="h-4 w-4" />,
    PROCESSING: <Square className="h-4 w-4" />,
    QUEUED: <RotateCw className="h-4 w-4 animate-spin" />,
  }[agent.activity_state];

  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {agent.name}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant}>
            {agent.status}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRestart(agent.id)}>
                Restart Agent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStop(agent.id)}>
                Stop Agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Activity</span>
          <div className="flex items-center gap-1">
            {activityIcon}
            <span className="text-xs">{agent.activity_state}</span>
          </div>
        </div>

        {agent.health_metrics && (
          <>
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span>CPU</span>
                  <span>{agent.health_metrics.cpu_usage}%</span>
                </div>
                <Progress value={agent.health_metrics.cpu_usage} className="h-1" />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span>Memory</span>
                  <span>{agent.health_metrics.memory_usage} MB</span>
                </div>
                <Progress
                  value={(agent.health_metrics.memory_usage / 1024) * 100}
                  className="h-1"
                />
              </div>
            </div>

            <div className="mt-3 pt-3 border-t">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Commands</span>
                <span>{agent.health_metrics.commands_processed}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Avg Response</span>
                <span>{agent.health_metrics.average_response_time}ms</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

### WebSocket Client Service Pattern
```typescript
// frontend/src/services/websocket.service.ts
import { WebSocketMessage } from '@onsembl/agent-protocol';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageHandlers = new Map<string, (payload: any) => void>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 5000;
  private reconnectDelay = 500;

  connect(url: string, token: string): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 500;
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message.payload);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.scheduleReconnect(url, token);
    };
  }

  private scheduleReconnect(url: string, token: string): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 1.5,
        this.maxReconnectDelay
      );
      this.connect(url, token);
    }, this.reconnectDelay);
  }

  on(type: string, handler: (payload: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  off(type: string): void {
    this.messageHandlers.delete(type);
  }

  send(message: WebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, queuing message');
      // Implement message queue if needed
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

## Agent Patterns

### Agent Wrapper Pattern
```typescript
// agent-wrapper/src/agent-wrapper.ts
import { spawn, ChildProcess } from 'child_process';
import { WebSocketClient } from './websocket-client';
import { StreamCapture } from './stream-capture';

export interface AgentConfig {
  serverUrl: string;
  agentId: string;
  agentType: 'CLAUDE' | 'GEMINI' | 'CODEX';
  command: string;
  args: string[];
  authToken: string;
  autoReconnect: boolean;
  maxRetries: number;
}

export class AgentWrapper {
  private process: ChildProcess | null = null;
  private wsClient: WebSocketClient;
  private streamCapture: StreamCapture;
  private reconnectAttempts = 0;

  constructor(private config: AgentConfig) {
    this.wsClient = new WebSocketClient(config.serverUrl, config.authToken);
    this.streamCapture = new StreamCapture();
  }

  async start(): Promise<void> {
    // Connect to server
    await this.wsClient.connect();

    // Send agent connect message
    await this.wsClient.send({
      type: 'AGENT_CONNECT',
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      payload: {
        agentId: this.config.agentId,
        agentType: this.config.agentType,
        version: '1.0.0',
        hostMachine: require('os').hostname(),
        capabilities: {
          maxTokens: 100000,
          supportsInterrupt: true,
          supportsTrace: true,
        },
      },
    });

    // Start the agent process
    this.process = spawn(this.config.command, this.config.args, {
      shell: true,
      env: { ...process.env },
    });

    // Capture and forward output
    this.streamCapture.capture(this.process, (output) => {
      this.wsClient.send({
        type: 'TERMINAL_OUTPUT',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: {
          commandId: output.commandId,
          agentId: this.config.agentId,
          streamType: output.streamType,
          content: output.content,
          ansiCodes: true,
          sequence: output.sequence,
        },
      });
    });

    // Handle incoming commands
    this.wsClient.on('COMMAND_REQUEST', (payload) => {
      this.executeCommand(payload);
    });

    // Handle process exit
    this.process.on('exit', (code) => {
      console.log(`Agent process exited with code ${code}`);
      if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxRetries) {
        this.reconnectAttempts++;
        setTimeout(() => this.start(), 5000);
      }
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  private executeCommand(command: any): void {
    if (!this.process) return;

    // Send acknowledgment
    this.wsClient.send({
      type: 'COMMAND_ACK',
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      payload: {
        commandId: command.commandId,
        agentId: this.config.agentId,
        status: 'EXECUTING',
      },
    });

    // Write to process stdin
    this.process.stdin?.write(command.content + '\n');
  }

  private startHeartbeat(): void {
    setInterval(() => {
      this.wsClient.send({
        type: 'AGENT_HEARTBEAT',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: {
          agentId: this.config.agentId,
          healthMetrics: this.collectHealthMetrics(),
        },
      });
    }, 30000);
  }

  private collectHealthMetrics() {
    // Implement actual metrics collection
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      uptime: process.uptime(),
      commandsProcessed: 0,
      averageResponseTime: 250,
    };
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.wsClient.disconnect();
  }
}
```

## BullMQ Queue Pattern
```typescript
// packages/command-queue/src/queue.ts
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

export interface CommandJob {
  commandId: string;
  agentId: string;
  content: string;
  priority: number;
  userId: string;
}

export class CommandQueue {
  private queue: Queue<CommandJob>;
  private worker: Worker<CommandJob>;

  constructor(redis: Redis) {
    this.queue = new Queue('commands', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }

  async enqueue(job: CommandJob): Promise<string> {
    const result = await this.queue.add('execute', job, {
      priority: job.priority,
      jobId: `cmd-${job.commandId}`,
    });
    return result.id!;
  }

  async cancel(commandId: string): Promise<void> {
    const job = await this.queue.getJob(`cmd-${commandId}`);
    if (job) {
      await job.remove();
    }
  }

  async cancelAllForAgent(agentId: string): Promise<void> {
    const jobs = await this.queue.getJobs(['waiting', 'active']);
    const agentJobs = jobs.filter(job => job.data.agentId === agentId);
    await Promise.all(agentJobs.map(job => job.remove()));
  }

  startWorker(processor: (job: Job<CommandJob>) => Promise<void>): void {
    this.worker = new Worker<CommandJob>('commands', processor, {
      connection: redis,
      concurrency: 5,
    });

    this.worker.on('completed', (job) => {
      console.log(`Command ${job.data.commandId} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Command ${job?.data.commandId} failed:`, err);
    });
  }

  async shutdown(): Promise<void> {
    await this.queue.close();
    if (this.worker) {
      await this.worker.close();
    }
  }
}
```

## ESLint Configuration
```javascript
// .eslintrc.js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  env: {
    node: true,
    jest: true,
  },
};
```

## Prettier Configuration
```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```