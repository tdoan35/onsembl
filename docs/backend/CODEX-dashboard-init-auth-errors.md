# Dashboard Init & Auth Log Flood – Investigation (Codex)

**Date:** 2025-11-01  
**Investigated by:** Codex assistant  
**Status:** Active debugging

## Summary
- Backend logs were flooded with repeating `Failed to initialize dashboard`, `Error handling dashboard message`, and `Fastify JWT verification failed` entries during dashboard sign-in.
- JWT verification errors are emitted on every dashboard init because Supabase-issued tokens cannot be validated with the local Fastify secret; the code falls back to Supabase but still logs the failure at `error` level.
- Dashboard initialization ultimately fails when `sendInitialData` tries to read agents from Supabase. The Supabase query throws an `AgentError` (`code: DATABASE_ERROR`), which propagates back up and closes the websocket. The UI immediately retries, creating the loop.
- The same Supabase failure also surfaces in the heartbeat monitor (`Failed to check for stale agents`), confirming a broader database connectivity/configuration problem.

## Key Observations
- Log excerpt supplied by Ty shows the repeating pattern:
  - `Fastify JWT verification failed` / `FAST_JWT_INVALID_SIGNATURE`
  - `Failed to initialize dashboard … error: {}`
  - `Error handling dashboard message … error: {}`
  - `Failed to check for stale agents … "code": "DATABASE_ERROR"`
- Only after dozens of retries do we see `Dashboard authenticated and connected`, meaning one attempt eventually succeeded after retries.
- Errors are logged as empty `{}` objects because several catch blocks log whatever was caught without normalizing it to a real `Error` instance, so Pino strips the message.

## Root Cause Details

### 1. JWT verification noise on expected Supabase tokens
- `EnhancedWebSocketAuth.validateToken` first attempts `fastify.jwt.verify(token)` ([backend/src/services/websocket-auth.ts:182-209](backend/src/services/websocket-auth.ts:190)).
- Supabase access tokens are signed with Supabase keys, so Fastify’s HMAC secret never matches; Fastify throws `FAST_JWT_INVALID_SIGNATURE`.
- The catch block logs this as an error before falling back to Supabase verification ([backend/src/services/websocket-auth.ts:247-270](backend/src/services/websocket-auth.ts:260)).
- Result: every dashboard init yields a pair of level-`error` logs even though authentication eventually succeeds.

### 2. Dashboard init fails while fetching initial data
- After auth succeeds, the handler calls `sendInitialData(connection)` to preload agent/command state ([backend/src/websocket/dashboard-handler.ts:285-314](backend/src/websocket/dashboard-handler.ts:285), [backend/src/websocket/dashboard-handler.ts:612-681](backend/src/websocket/dashboard-handler.ts:615)).
- `sendInitialData` begins by calling `agentService.listAgents({ user_id })`. That reaches `AgentModel.findAll`, which executes a Supabase query ([backend/src/models/agent.ts:144-186](backend/src/models/agent.ts:144)).
- Supabase returns an error (likely due to missing local Supabase instance or misconfigured service role key). The model wraps it in `AgentError` with `code: DATABASE_ERROR`, which bubbles up.
- The catch in `handleDashboardInit` logs the error (`{}`), sends `INIT_FAILED`, and closes the socket ([backend/src/websocket/dashboard-handler.ts:303-313](backend/src/websocket/dashboard-handler.ts:312)).
- The frontend reconnection logic immediately opens a new websocket, resends `DASHBOARD_INIT`, and the cycle repeats—hence the flood of identical log lines and repeated `Token registered for management`.

### 3. Heartbeat monitor hits the same Supabase failure
- Independent of dashboard init, the heartbeat monitor periodically checks for stale agents. That path also calls Supabase via `agentService` and hits the same failure, producing `Failed to check for stale agents` with `code: DATABASE_ERROR` ([backend/src/services/agent-heartbeat-monitor.ts:211-255](backend/src/services/agent-heartbeat-monitor.ts:255)).
- This corroborates that the underlying issue is the Supabase connectivity/configuration rather than the websocket layer itself.

### 4. Error serialization hides the real stack traces
- `handleMessage` and `handleDashboardInit` catch blocks log `{ error }` where `error` is often a non-serializable object (e.g., Supabase response), so Pino prints `{}` ([backend/src/websocket/dashboard-handler.ts:179-195](backend/src/websocket/dashboard-handler.ts:189)).
- Without the text, the logs look like “mystery” errors, making troubleshooting harder.

## Recommendations
1. **Fix Supabase connectivity/config:** ensure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` point at a reachable instance. For local dev, start the Supabase stack (`supabase start`) or switch the service into mock mode that skips DB access.
2. **Downgrade/handle expected JWT failures:**
   - Treat `FAST_JWT_INVALID_SIGNATURE` as an expected branch and log at `debug`/`info`, or short-circuit to Supabase when the token issuer isn’t local.
3. **Improve error logging:**
   - Normalize caught values to real `Error` instances before logging so messages and stacks appear (example patch already documented in `docs/backend/websocket-message-flood-root-cause.md`).
4. **Rate-limit retries once init fails:**
   - Add throttling in `handleDashboardInit` to avoid hammering the backend while the DB is unavailable.
5. **Add health checks/alerts for Supabase failures:**
   - Emit metrics when `AgentError` with `DATABASE_ERROR` occurs so the issue is visible sooner.

## Open Questions / Follow-ups
- Is Supabase expected to be running locally for this dev environment? If not, we need a mock implementation or feature flags to skip DB lookups during dashboard init.
- Are there other services (commands, traces) that will fail once Supabase is fixed, or is the schema up to date?
- Should we short-circuit dashboard init when the backend is in a degraded state (e.g., return 503 over HTTP before the websocket is attempted)?

## Attachments & References
- Dashboard handler error logging ([backend/src/websocket/dashboard-handler.ts:189](backend/src/websocket/dashboard-handler.ts:189))
- Dashboard init catch that closes the socket ([backend/src/websocket/dashboard-handler.ts:312](backend/src/websocket/dashboard-handler.ts:312))
- Initial data fetch and Supabase dependency ([backend/src/websocket/dashboard-handler.ts:615](backend/src/websocket/dashboard-handler.ts:615))
- Supabase agent query throwing `AgentError` ([backend/src/models/agent.ts:144](backend/src/models/agent.ts:144))
- Heartbeat monitor reproducing the same DB error ([backend/src/services/agent-heartbeat-monitor.ts:255](backend/src/services/agent-heartbeat-monitor.ts:255))
- JWT verification fallback logging ([backend/src/services/websocket-auth.ts:190](backend/src/services/websocket-auth.ts:190), [backend/src/services/websocket-auth.ts:260](backend/src/services/websocket-auth.ts:260))
- Prior art: `docs/backend/websocket-message-flood-root-cause.md`

