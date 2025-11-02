# WebSocket Message Flood - Root Cause Analysis

**Date**: November 1, 2025
**Severity**: High
**Status**: Investigated
**Impact**: Backend server log flooding, potential performance degradation

## Executive Summary

The backend server is experiencing periodic floods of WebSocket-related error logs, specifically:
- "Error handling dashboard message" with empty error objects
- "Failed to initialize dashboard" with empty error objects
- Repeated "Token registered for management" messages
- Duplicate "websocket_message_received" debug logs

This analysis identifies multiple contributing factors leading to a message processing loop.

## Symptoms Observed

```
[19:17:57 UTC] ERROR: Error handling dashboard message
    connectionId: "dashboard-1762024676801-2fehlvgvq"
    error: {}
[19:17:57 UTC] DEBUG: Token registered for management
    connectionId: "dashboard-1762024676801-2fehlvgvq"
    userId: "7378612a-5c3c-4728-81fb-f573f45bd239"
    expiresAt: "2025-11-01T20:17:57.000Z"
[19:17:57 UTC] ERROR: Failed to initialize dashboard
    userId: "7378612a-5c3c-4728-81fb-f573f45bd239"
    error: {}
[19:17:57 UTC] DEBUG: websocket_message_received
    connectionId: "5bd8cb9b-4a4b-4e8c-94bf-650e9e9540e5"
    messageSize: 251
```

The pattern repeats dozens of times within the same second, with the same connection ID.

## Root Causes Identified

### 1. Empty Error Object Logging (Pino Serialization Issue)

**Location**: `backend/src/websocket/dashboard-handler.ts:186-191`, `311-315`

**Issue**: Errors are being logged but appear as empty objects `{}` in the output.

**Why This Happens**:
- Pino's default error serializer expects Error objects with standard properties (message, stack, name)
- If an error is thrown that doesn't have these properties, or if the error is not a proper Error instance, Pino serializes it as `{}`
- The code catches all errors with `catch (error)` but doesn't validate that `error` is an Error instance

**Evidence**:
```typescript
} catch (error) {
  this.server.log.error({
    error,  // This might not be an Error instance
    connectionId: connection.connectionId
  }, 'Error handling dashboard message');
  this.sendError(connection.socket, 'INTERNAL_ERROR', 'Failed to process message');
}
```

**Impact**:
- Impossible to debug what's actually failing
- No stack traces or error messages visible
- Developers are blind to the actual failure

**Likely Causes of Non-Error Throws**:
1. Promise rejections with non-Error values
2. Async/await errors that aren't properly wrapped
3. Service method failures that return error codes instead of throwing Errors
4. JSON parsing errors or type validation failures

### 2. DASHBOARD_INIT Message Loop

**Location**: `backend/src/websocket/dashboard-handler.ts:197-316`

**Issue**: The dashboard initialization process is failing repeatedly for the same connection, but the connection remains open and continues processing messages.

**Sequence of Events**:
1. Dashboard WebSocket connects successfully
2. Connection is added to connection pool (`addConnection`)
3. `DASHBOARD_INIT` message is received from frontend
4. Token validation succeeds → "Token registered for management" log appears
5. Something fails silently in `handleDashboardInit` after token registration
6. Error is caught, logged as `{}`, and `INIT_FAILED` error sent to frontend
7. **Connection is closed** (line 314: `connection.socket.close()`)
8. Frontend receives error and... what happens next?

**The Missing Piece**:
The frontend has aggressive reconnection logic in `frontend/src/services/websocket.service.ts` and `reconnection.service.ts`:
- Circuit breaker allows 5 failures before opening (line 79)
- In development mode, rate limits are set very high (100,000 requests/min)
- Exponential backoff with base delay, but rapid initial retries

**What's Actually Failing**:
Looking at `handleDashboardInit` (lines 197-316), after token validation these steps occur:
1. Token registration (line 226-234) ✅ SUCCEEDS (we see logs)
2. Subscription setup (lines 237-275) - Could fail silently
3. Connection pool update (lines 278-282) - Could fail silently
4. Heartbeat monitoring start (line 285) - Could fail silently
5. **`sendInitialData`** (line 288) - **Most Likely Culprit**
6. Send ACK (lines 291-301) - Could fail if sendInitialData fails

**Why `sendInitialData` is suspect** (lines 612-681):
- Calls `agentService.listAgents()` - Database query that could fail
- Calls `commandService.getActiveCommands()` - Database query that could fail
- Sends multiple WebSocket messages - Any could fail
- Wrapped in try-catch that logs `{}` on error

### 3. Connection Pool Message Monitoring Loop

**Location**: `backend/src/websocket/connection-pool.ts:601-605`

**Issue**: The connection pool sets up a message listener that increments activity counters but doesn't prevent duplicate message processing.

**Evidence**:
```typescript
// Monitor message activity
connection.socket.socket.on('message', (data) => {
  connection.lastActivity = Date.now();
  connection.messageCount++;
  connection.bytesTransferred += data.length;
});
```

This listener is separate from the actual message handler, so every message triggers:
1. Connection pool's message listener (activity tracking)
2. Dashboard handler's message listener (actual processing)

If the same message is in a queue or being retried, both listeners fire multiple times.

### 4. Message Router Queue Processing

**Location**: `backend/src/websocket/message-router.ts:418-466`

**Issue**: Messages are queued and processed in a loop (every 100ms), with retry logic on failures.

**Retry Logic**:
- Failed messages are retried up to `config.retryAttempts` times (line 573)
- Exponential backoff with 1-30 second delays (line 589)
- Messages stay in queue until successfully delivered or max attempts reached

**The Problem**:
If a message fails to deliver (returns false from `deliverMessage`), it stays in the queue and is retried. If the connection is still technically "open" but failing to process messages, the router keeps trying to deliver to it.

### 5. Multiple Connection IDs for Same Dashboard

**Observation**: Logs show two different connection IDs:
- `dashboard-1762024676801-2fehlvgvq` (dashboard connection with errors)
- `5bd8cb9b-4a4b-4e8c-94bf-650e9e9540e5` (receiving websocket messages)

This suggests:
- Either the connection ID is being regenerated
- Or there are actually two connections from the same dashboard
- Or one is the raw socket connection ID and the other is the dashboard handler connection ID

This mismatch could be causing routing issues.

## Why The Flood Happens

1. **Initial Trigger**: Dashboard connects and sends `DASHBOARD_INIT`
2. **Partial Success**: Token validation succeeds, gets logged
3. **Silent Failure**: `sendInitialData` or another step fails, throws non-Error
4. **Poor Error Handling**: Error logged as `{}`, no useful information
5. **Connection Closes**: Dashboard connection is terminated
6. **Frontend Retry**: Reconnection logic kicks in immediately (circuit breaker allows 5 attempts)
7. **Repeat**: Steps 1-6 happen rapidly, creating log flood
8. **Message Queue**: Failed messages stay in router queue, processing loop attempts redelivery
9. **Compound Effect**: Multiple subsystems trying to process/retry same messages

## Recommendations

### Immediate Fixes (P0 - Stop the Bleeding)

1. **Fix Error Serialization**
   ```typescript
   // In dashboard-handler.ts
   } catch (err) {
     const error = err instanceof Error ? err : new Error(String(err));
     this.server.log.error({
       error: {
         message: error.message,
         stack: error.stack,
         name: error.name,
         cause: error.cause
       },
       connectionId: connection.connectionId
     }, 'Error handling dashboard message');
   }
   ```

2. **Add Debug Logging to sendInitialData**
   ```typescript
   private async sendInitialData(connection: DashboardConnection): Promise<void> {
     try {
       this.server.log.debug({ connectionId: connection.connectionId }, 'Fetching initial agents');
       const agents = await this.services.agentService.listAgents({
         user_id: connection.userId
       });
       this.server.log.debug({ connectionId: connection.connectionId, count: agents.length }, 'Agents fetched');

       // ... rest of function with more debug logs
     } catch (error) {
       this.server.log.error({
         error: error instanceof Error ? error : new Error(String(error)),
         connectionId: connection.connectionId,
         step: 'sendInitialData'  // <-- Add context
       }, 'Failed to send initial data');
       throw error;  // Re-throw to be caught by parent
     }
   }
   ```

3. **Rate Limit Dashboard Initialization Attempts**
   ```typescript
   // Add to DashboardWebSocketHandler
   private initAttempts = new Map<string, { count: number, lastAttempt: number }>();

   private async handleDashboardInit(...) {
     const key = `${connection.metadata.remoteAddress}-${userId}`;
     const attempts = this.initAttempts.get(key) || { count: 0, lastAttempt: 0 };

     // Allow max 3 attempts per minute
     if (attempts.count >= 3 && Date.now() - attempts.lastAttempt < 60000) {
       this.server.log.warn({ userId, attempts: attempts.count }, 'Dashboard init rate limit exceeded');
       this.sendError(connection.socket, 'RATE_LIMIT', 'Too many initialization attempts');
       connection.socket.close();
       return;
     }

     attempts.count++;
     attempts.lastAttempt = Date.now();
     this.initAttempts.set(key, attempts);

     // ... rest of init logic
   }
   ```

### Short-term Fixes (P1 - Prevent Recurrence)

4. **Circuit Breaker for Dashboard Init**
   - Implement circuit breaker pattern specifically for dashboard initialization
   - After 3 consecutive failures, stop accepting new DASHBOARD_INIT for 30 seconds
   - Send 503 SERVICE_UNAVAILABLE to clients during circuit breaker open state

5. **Message Queue Limits**
   - Add TTL to queued messages (e.g., 30 seconds)
   - Drop messages older than TTL instead of retrying forever
   - Limit queue size per connection

6. **Connection Cleanup**
   - Ensure failed dashboard connections are fully cleaned up from all subsystems
   - Clear message router command tracking
   - Remove from heartbeat manager
   - Remove from token manager

### Long-term Improvements (P2 - Architectural)

7. **Structured Error Handling**
   - Create custom error classes that extend Error
   - Use error codes for different failure scenarios
   - Always include context (userId, connectionId, operation) in errors

8. **Observability**
   - Add metrics for dashboard connection success/failure rates
   - Track time spent in each phase of initialization
   - Alert on repeated failures from same user/IP

9. **Graceful Degradation**
   - If `sendInitialData` fails, allow connection but send empty initial state
   - Client can request data lazily after connection established
   - Don't fail entire connection if one data fetch fails

10. **Message Deduplication**
    - Add message IDs and track processed messages
    - Reject duplicate messages within time window
    - Prevents processing same message multiple times

## Testing Recommendations

1. **Reproduce the Issue**:
   - Simulate database unavailability during dashboard connection
   - Inject errors into `agentService.listAgents()`
   - Monitor log output for flood pattern

2. **Verify Fixes**:
   - Confirm errors now show meaningful messages and stack traces
   - Verify rate limiting prevents rapid reconnection
   - Check that circuit breaker opens after failures

3. **Load Testing**:
   - Connect 10+ dashboards simultaneously
   - Intentionally fail database queries
   - Ensure system degrades gracefully

## Related Files

- `backend/src/websocket/dashboard-handler.ts` - Main dashboard WebSocket handler
- `backend/src/websocket/message-router.ts` - Message queuing and routing
- `backend/src/websocket/connection-pool.ts` - Connection lifecycle management
- `backend/src/services/websocket-auth.ts` - Authentication and rate limiting
- `frontend/src/services/websocket.service.ts` - Client-side connection management
- `frontend/src/services/reconnection.service.ts` - Client-side reconnection logic

## Monitoring Queries

After fixes are deployed, monitor these metrics:

1. **Error Rate**: Dashboard init errors per minute
   ```
   rate(dashboard_init_errors_total[1m])
   ```

2. **Connection Success Rate**:
   ```
   dashboard_connections_successful / dashboard_connections_attempted
   ```

3. **Average Init Time**:
   ```
   avg(dashboard_init_duration_seconds)
   ```

4. **Circuit Breaker State**:
   ```
   dashboard_circuit_breaker_open{endpoint="dashboard"}
   ```

## Conclusion

The root cause is a **combination of poor error handling, aggressive retry logic, and silent failures** creating a feedback loop:

1. Something fails silently in `sendInitialData` (likely database query)
2. Error is logged as `{}` providing no debug information
3. Connection closes, frontend retries immediately
4. Cycle repeats rapidly, flooding logs
5. Message router queue compounds the problem by retrying failed messages

**The immediate priority** is fixing error serialization to understand what's actually failing, then implementing rate limiting to prevent the flood. Once we can see the actual errors, we can fix the underlying cause (likely database query or permission issue).
