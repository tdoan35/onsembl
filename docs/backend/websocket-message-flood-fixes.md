# WebSocket Message Flood - Immediate Fixes

**Date**: November 1, 2025
**Related**: `websocket-message-flood-root-cause.md`

## Quick Patches

These fixes can be applied immediately to:
1. See what's actually failing (fix empty error logs)
2. Stop the log flood (rate limiting)
3. Gather better debugging information

## Patch 1: Fix Error Serialization

**File**: `backend/src/websocket/dashboard-handler.ts`

**Issue**: Errors appear as empty objects `{}` in logs

**Fix**: Ensure errors are properly serialized by Pino

### Change 1: handleMessage error handler (line 185-191)

```typescript
// BEFORE:
} catch (error) {
  this.server.log.error({
    error,
    connectionId: connection.connectionId
  }, 'Error handling dashboard message');
  this.sendError(connection.socket, 'INTERNAL_ERROR', 'Failed to process message');
}

// AFTER:
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  this.server.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...(error.cause && { cause: error.cause })
    },
    rawError: err,
    connectionId: connection.connectionId,
    messageType: (message as any)?.type
  }, 'Error handling dashboard message');
  this.sendError(connection.socket, 'INTERNAL_ERROR', 'Failed to process message');
}
```

### Change 2: handleDashboardInit error handler (line 311-315)

```typescript
// BEFORE:
} catch (error) {
  this.server.log.error({ error, userId }, 'Failed to initialize dashboard');
  this.sendError(connection.socket, 'INIT_FAILED', 'Dashboard initialization failed');
  connection.socket.close();
}

// AFTER:
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  this.server.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...(error.cause && { cause: error.cause })
    },
    rawError: err,
    userId,
    connectionId: connection.connectionId
  }, 'Failed to initialize dashboard');
  this.sendError(connection.socket, 'INIT_FAILED', `Dashboard initialization failed: ${error.message}`);
  connection.socket.close();
}
```

### Change 3: handleDashboardSubscribe error handler (line 382-385)

```typescript
// BEFORE:
} catch (error) {
  this.server.log.error({ error, type, id }, 'Failed to handle dashboard subscription');
  this.sendError(connection.socket, 'SUBSCRIPTION_FAILED', 'Failed to add subscription');
}

// AFTER:
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  this.server.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    type,
    id,
    connectionId: connection.connectionId
  }, 'Failed to handle dashboard subscription');
  this.sendError(connection.socket, 'SUBSCRIPTION_FAILED', `Failed to add subscription: ${error.message}`);
}
```

### Change 4: handleDashboardUnsubscribe error handler (line 444-447)

```typescript
// BEFORE:
} catch (error) {
  this.server.log.error({ error, type, id }, 'Failed to handle dashboard unsubscription');
  this.sendError(connection.socket, 'UNSUBSCRIPTION_FAILED', 'Failed to remove subscription');
}

// AFTER:
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  this.server.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    type,
    id,
    connectionId: connection.connectionId
  }, 'Failed to handle dashboard unsubscription');
  this.sendError(connection.socket, 'UNSUBSCRIPTION_FAILED', `Failed to remove subscription: ${error.message}`);
}
```

## Patch 2: Add Debug Logging to sendInitialData

**File**: `backend/src/websocket/dashboard-handler.ts`

**Issue**: Can't see where initialization is failing

**Fix**: Add step-by-step debug logging

```typescript
// Add after line 612 (beginning of sendInitialData)
private async sendInitialData(connection: DashboardConnection): Promise<void> {
  try {
    // Step 1: Fetch agents
    this.server.log.debug({
      connectionId: connection.connectionId,
      userId: connection.userId,
      step: 'fetch_agents'
    }, 'sendInitialData: Fetching agents for user');

    const agents = await this.services.agentService.listAgents({
      user_id: connection.userId
    });

    this.server.log.debug({
      connectionId: connection.connectionId,
      agentCount: agents.length,
      step: 'fetch_agents_complete'
    }, 'sendInitialData: Agents fetched successfully');

    // Step 2: Build agent list
    this.server.log.debug({
      connectionId: connection.connectionId,
      step: 'build_agent_list'
    }, 'sendInitialData: Building agent list');

    const agentList = agents.map(agent => ({
      agentId: agent.id,
      name: agent.name,
      type: agent.type?.toUpperCase() || 'UNKNOWN',
      status: agent.status?.toUpperCase() || 'OFFLINE',
      version: agent.version || 'unknown',
      capabilities: agent.capabilities || [],
      lastHeartbeat: agent.last_ping,
    }));

    // Step 3: Send dashboard:connected message
    this.server.log.debug({
      connectionId: connection.connectionId,
      step: 'send_connected_message',
      agentCount: agentList.length
    }, 'sendInitialData: Sending dashboard:connected message');

    const dashboardConnectedMessage = {
      type: 'dashboard:connected',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        agents: agentList,
        timestamp: Date.now()
      }
    };

    connection.socket.socket.send(JSON.stringify(dashboardConnectedMessage));

    this.server.log.debug({
      connectionId: connection.connectionId,
      step: 'send_connected_message_complete'
    }, 'sendInitialData: dashboard:connected message sent');

    // Step 4: Send agent statuses
    this.server.log.debug({
      connectionId: connection.connectionId,
      step: 'send_agent_statuses',
      subscribedAgents: Array.from(connection.subscriptions.agents)
    }, 'sendInitialData: Sending agent statuses');

    agents.forEach(agent => {
      if (connection.subscriptions.agents.has(agent.id)) {
        this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
          agentId: agent.id,
          status: agent.status,
          activityState: agent.activityState || 'IDLE',
          healthMetrics: agent.healthMetrics,
          currentCommand: agent.currentCommand,
          queuedCommands: agent.queuedCommands || 0
        });
      }
    });

    // Step 5: Send command statuses
    this.server.log.debug({
      connectionId: connection.connectionId,
      step: 'fetch_commands'
    }, 'sendInitialData: Fetching active commands');

    const commands = await this.services.commandService.getActiveCommands();

    this.server.log.debug({
      connectionId: connection.connectionId,
      commandCount: commands.length,
      step: 'fetch_commands_complete'
    }, 'sendInitialData: Active commands fetched');

    commands.forEach(command => {
      if (connection.subscriptions.commands.has(command.id)) {
        this.sendMessage(connection.socket, MessageType.COMMAND_STATUS, {
          commandId: command.id,
          agentId: command.agentId,
          status: command.status,
          progress: command.progress,
          startedAt: command.startedAt?.getTime(),
          completedAt: command.completedAt?.getTime()
        });
      }
    });

    this.server.log.info({
      connectionId: connection.connectionId,
      userId: connection.userId,
      agentCount: agents.length,
      commandCount: commands.length
    }, 'sendInitialData: Complete - Sent initial data to dashboard');

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    this.server.log.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      connectionId: connection.connectionId,
      userId: connection.userId
    }, 'sendInitialData: Failed to send initial data');
    throw error;  // Re-throw to be caught by parent handler
  }
}
```

## Patch 3: Rate Limit Dashboard Initialization

**File**: `backend/src/websocket/dashboard-handler.ts`

**Issue**: Frontend can retry initialization too rapidly

**Fix**: Add rate limiting to prevent flood

### Step 1: Add rate limiting Map to class

```typescript
// Add after line 35 (after class declaration)
export class DashboardWebSocketHandler extends EventEmitter {
  private connections = new Map<string, DashboardConnection>();

  // ADD THIS:
  private initAttempts = new Map<string, { count: number; firstAttempt: number; lastAttempt: number }>();
  private readonly INIT_RATE_LIMIT = 5; // Max 5 attempts
  private readonly INIT_RATE_WINDOW = 60000; // Per 1 minute
```

### Step 2: Add rate limiting check in handleDashboardInit

```typescript
// Add after line 201 (start of handleDashboardInit, before extracting payload)
private async handleDashboardInit(
  connection: DashboardConnection,
  message: TypedWebSocketMessage<MessageType.DASHBOARD_INIT>
): Promise<void> {
  const { userId, subscriptions } = message.payload;

  // ADD THIS BLOCK:
  // Rate limit dashboard initialization attempts
  const rateLimitKey = `${connection.metadata.remoteAddress}-${userId}`;
  const now = Date.now();
  const attempts = this.initAttempts.get(rateLimitKey);

  if (attempts) {
    // Reset counter if outside time window
    if (now - attempts.firstAttempt > this.INIT_RATE_WINDOW) {
      this.initAttempts.delete(rateLimitKey);
    } else if (attempts.count >= this.INIT_RATE_LIMIT) {
      this.server.log.warn({
        userId,
        connectionId: connection.connectionId,
        attempts: attempts.count,
        timeWindow: this.INIT_RATE_WINDOW,
        remoteAddress: connection.metadata.remoteAddress
      }, 'Dashboard initialization rate limit exceeded');

      this.sendError(
        connection.socket,
        'RATE_LIMIT_EXCEEDED',
        `Too many initialization attempts. Please wait ${Math.ceil((this.INIT_RATE_WINDOW - (now - attempts.firstAttempt)) / 1000)} seconds.`
      );
      connection.socket.close();
      return;
    }
  }

  // Track this attempt
  const attemptRecord = attempts || { count: 0, firstAttempt: now, lastAttempt: now };
  attemptRecord.count++;
  attemptRecord.lastAttempt = now;
  this.initAttempts.set(rateLimitKey, attemptRecord);

  this.server.log.debug({
    userId,
    connectionId: connection.connectionId,
    attemptNumber: attemptRecord.count,
    rateLimitKey
  }, 'Dashboard initialization attempt recorded');

  // ... rest of handleDashboardInit logic
```

### Step 3: Clear rate limit on successful init

```typescript
// Add after line 309 (after successful emit)
this.emit('dashboardConnected', { userId, connectionId: connection.connectionId });

// ADD THIS:
// Clear rate limit on successful initialization
this.initAttempts.delete(rateLimitKey);

this.server.log.info({
  userId,
  connectionId: connection.connectionId
}, 'Dashboard authenticated and connected');
```

### Step 4: Add cleanup timer for stale rate limit entries

```typescript
// Add to setupEventListeners() method (after line 1007)
private setupEventListeners(): void {
  // Listen for token refresh events
  this.dependencies.tokenManager.on('tokenRefreshed', ({ connectionId, token }) => {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.sendMessage(connection.socket, MessageType.TOKEN_REFRESH, token);
    }
  });

  // Listen for heartbeat timeout events
  this.dependencies.heartbeatManager.on('connectionTimeout', (connectionId) => {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.server.log.warn({ connectionId, userId: connection.userId }, 'Dashboard connection timed out');
      connection.socket.socket.close();
    }
  });

  // ADD THIS:
  // Cleanup stale rate limit entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, attempts] of this.initAttempts.entries()) {
      if (now - attempts.lastAttempt > this.INIT_RATE_WINDOW * 2) {
        this.initAttempts.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.server.log.debug({
        cleanedCount,
        remainingEntries: this.initAttempts.size
      }, 'Cleaned up stale rate limit entries');
    }
  }, 300000); // Every 5 minutes
}
```

## Patch 4: Add Pino Error Serializer

**File**: `backend/src/server.ts`

**Issue**: Pino doesn't properly serialize all error types

**Fix**: Add custom error serializer

```typescript
// Find the logger configuration (around line 66)
// Add serializers option

logger:
  config.nodeEnv === 'development'
    ? {
        level: config.logLevel,
        // ADD THIS:
        serializers: {
          error: (err: any) => {
            if (err instanceof Error) {
              return {
                type: err.name,
                message: err.message,
                stack: err.stack,
                ...(err.cause && { cause: err.cause }),
                ...Object.getOwnPropertyNames(err).reduce((acc, key) => {
                  if (!['name', 'message', 'stack', 'cause'].includes(key)) {
                    acc[key] = (err as any)[key];
                  }
                  return acc;
                }, {} as Record<string, any>)
              };
            }
            // Not an Error object - serialize whatever it is
            return {
              type: 'NonError',
              value: String(err),
              raw: err
            };
          }
        },
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            colorize: true
          }
        }
      }
    : {
        level: config.logLevel,
        // ADD THIS:
        serializers: {
          error: (err: any) => {
            if (err instanceof Error) {
              return {
                type: err.name,
                message: err.message,
                stack: err.stack,
                ...(err.cause && { cause: err.cause })
              };
            }
            return {
              type: 'NonError',
              value: String(err)
            };
          }
        }
      },
```

## Testing the Fixes

After applying these patches:

1. **Restart the backend server**
2. **Connect a dashboard client**
3. **Watch the logs** for:
   - Actual error messages instead of `{}`
   - Debug logs showing each step of `sendInitialData`
   - Rate limit warnings if too many attempts
4. **If errors still occur**, you'll now see:
   - Which step is failing
   - The actual error message
   - Stack trace for debugging

## Expected Outcome

After these fixes:

### Before:
```
[19:17:57 UTC] ERROR: Failed to initialize dashboard
    userId: "7378612a-5c3c-4728-81fb-f573f45bd239"
    error: {}
```

### After:
```
[19:17:57 UTC] DEBUG: sendInitialData: Fetching agents for user
    connectionId: "dashboard-1762024676801-2fehlvgvq"
    userId: "7378612a-5c3c-4728-81fb-f573f45bd239"
    step: "fetch_agents"

[19:17:57 UTC] ERROR: sendInitialData: Failed to send initial data
    connectionId: "dashboard-1762024676801-2fehlvgvq"
    userId: "7378612a-5c3c-4728-81fb-f573f45bd239"
    error: {
      "type": "DatabaseError",
      "message": "relation \"agents\" does not exist",
      "stack": "DatabaseError: relation \"agents\" does not exist\n    at..."
    }

[19:17:57 UTC] ERROR: Failed to initialize dashboard
    userId: "7378612a-5c3c-4728-81fb-f573f45bd239"
    connectionId: "dashboard-1762024676801-2fehlvgvq"
    error: {
      "type": "DatabaseError",
      "message": "relation \"agents\" does not exist",
      "stack": "DatabaseError: relation \"agents\" does not exist\n    at..."
    }

[19:17:58 UTC] WARN: Dashboard initialization rate limit exceeded
    userId: "7378612a-5c3c-4728-81fb-f573f45bd239"
    connectionId: "dashboard-1762024676802-3gfimxhwr"
    attempts: 5
    timeWindow: 60000
```

Now you can see:
1. **What's failing**: Database query for "agents" table
2. **Why it's failing**: Table doesn't exist (or permissions issue)
3. **When it stops**: After 5 attempts, rate limiter kicks in

## Next Steps

Once you can see the actual errors, you can:

1. Fix the underlying issue (e.g., run migrations, fix permissions)
2. Add better error handling for specific error types
3. Implement graceful degradation (allow connection even if initial data fails)
4. Add health checks to prevent connections when services are unavailable
