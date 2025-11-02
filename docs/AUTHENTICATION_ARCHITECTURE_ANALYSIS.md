# Authentication Architecture Analysis & Unified Solution Proposal

## Current State Analysis

### Existing Infrastructure

#### 1. **Database Schema**
- ✅ `cli_tokens` table exists (migration: `20250924051103_add_cli_tokens_table.sql`)
- ✅ `user_id` column exists on `agents` and `commands` tables
- ✅ RLS policies enforce `user_id = auth.uid()` for all user-owned resources
- ✅ Service role policy exists for backend operations

#### 2. **Backend Authentication Endpoints**
Located in `backend/src/api/auth.ts`:

**OAuth Device Flow (Lines 618-1043):**
- ✅ `POST /api/auth/device/authorize` - Start device flow
- ✅ `POST /api/auth/device/confirm` - User confirms device
- ✅ `POST /api/auth/device/token` - Exchange device code for tokens
- ✅ `POST /api/auth/cli/refresh` - Refresh CLI tokens
- ✅ `POST /api/auth/cli/validate` - Validate CLI tokens
- ✅ `POST /api/auth/cli/revoke` - Revoke CLI tokens

**Token Generation:**
- Access tokens: 1 hour expiry, signed with `JWT_SECRET`
- Refresh tokens: 30 days expiry
- Tokens include: `{ sub: user_id, scope: 'agent:manage', type: 'cli' }`

#### 3. **Agent-Wrapper CLI Authentication**
Located in `agent-wrapper/src/auth/`:

**CLIAuth** (`cli-auth.ts`):
- ✅ Implements OAuth device flow
- ✅ Polls `/api/auth/device/token` endpoint
- ✅ Stores tokens in credential store (keytar/XDG)
- ✅ Validates and refreshes tokens

**AuthManager** (`auth-manager.ts`):
- ✅ High-level auth interface
- ✅ Manages credential storage
- ✅ Handles token refresh

**CredentialStore** (`credential-store.ts`):
- ✅ Secure storage using keytar (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- ✅ XDG fallback for Linux without Secret Service

#### 4. **WebSocket Authentication Service**
Located in `backend/src/services/websocket-auth.ts`:

**EnhancedWebSocketAuth** (Lines 786-790):
- ✅ Validates both Supabase JWT and local JWT tokens
- ✅ Uses `JWT_SECRET` from environment
- ✅ Returns `AuthContext` with `userId`

---

## The Problem

### Architecture Mismatch

#### Current Agent Connection Flow:
```
Agent-Wrapper                    Backend                     Supabase
     |                              |                             |
     | 1. Generate JWT token        |                             |
     |    (simple, agent-only)      |                             |
     |----------------------------->|                             |
     |                              | 2. Validate JWT             |
     |                              |    (WebSocketAuth.validateToken)|
     |                              | ✅ TOKEN VALID               |
     |                              | ❌ NO USER_ID in context    |
     |                              |                             |
     |                              | 3. Create agent in DB       |
     |                              |----------------------------->|
     |                              |                             | ❌ RLS BLOCKS
     |                              |                             | user_id required!
     |                              |<----------------------------|
     |                              | ERROR: Failed to create agent
```

### Root Causes:

1. **Token Type Mismatch:**
   - Agent-wrapper generates: `{ sub: agentId, role: 'agent', iss: 'onsembl-agent-wrapper' }`
   - Backend expects CLI tokens: `{ sub: userId, scope: 'agent:manage', type: 'cli' }`

2. **Missing OAuth Flow:**
   - Agent-wrapper bypasses device flow authentication
   - No user context associated with agent tokens

3. **RLS Policy Conflict:**
   - Database enforces `user_id = auth.uid()`
   - Agent tokens don't have Supabase `auth.uid()`
   - Service role workaround requires backend to use service role client

4. **WebSocket Handler Expectations:**
   - `agent-handler.ts:204` expects `authContext.userId`
   - `agent-handler.ts:224` passes `userId` to `registerAgent()`
   - But simple JWT tokens don't provide this

---

## Proposed Unified Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI/Agent Authentication Flow                  │
└─────────────────────────────────────────────────────────────────────┘

1. User Authentication (One-time setup)
   ┌─────────────┐         ┌──────────┐         ┌──────────┐
   │ Agent-Wrapper│         │ Backend  │         │ Supabase │
   │  CLI         │         │          │         │          │
   └──────┬───────┘         └────┬─────┘         └────┬─────┘
          │                      │                     │
          │ POST /device/authorize                    │
          ├─────────────────────>│                     │
          │                      │ Create device_code  │
          │                      ├────────────────────>│
          │ {device_code,        │                     │
          │  user_code,          │                     │
          │  verification_uri}   │                     │
          │<─────────────────────┤                     │
          │                      │                     │
          │ Open browser         │                     │
          │ (user authorizes)    │                     │
          │                      │                     │
          │                      │<-User confirms via  │
          │                      │  Supabase auth      │
          │                      │                     │
          │ POST /device/token   │                     │
          ├─────────────────────>│                     │
          │                      │ Check authorization │
          │                      ├────────────────────>│
          │ {access_token,       │                     │
          │  refresh_token}      │                     │
          │<─────────────────────┤                     │
          │                      │                     │
          │ Store in keychain    │                     │
          │                      │                     │

2. Agent Connection (Using stored tokens)
   ┌─────────────┐         ┌──────────┐         ┌──────────┐
   │ Agent       │         │ Backend  │         │ Supabase │
   │  Process    │         │ WebSocket│         │ Database │
   └──────┬───────┘         └────┬─────┘         └────┬─────┘
          │                      │                     │
          │ WS /ws/agent?token=  │                     │
          │  {CLI_ACCESS_TOKEN}  │                     │
          ├─────────────────────>│                     │
          │                      │ Validate JWT        │
          │                      │ Extract user_id     │
          │                      │                     │
          │                      │ Create agent        │
          │                      │ WITH user_id        │
          │                      ├────────────────────>│
          │                      │                  ✅ RLS allows
          │                      │<─────────────────────┤
          │ ACK                  │                     │
          │<─────────────────────┤                     │
          │                      │                     │
```

### Implementation Changes Required

#### Phase 1: Agent-Wrapper Authentication Integration

**File: `agent-wrapper/src/cli.ts`**

**Change 1.1:** Update `start` command to require authentication first
```typescript
// Before starting agent, check for valid credentials
if (!await authManager.getAuthStatus().authenticated) {
  console.error('Not authenticated. Please run: onsembl-agent auth login');
  process.exit(1);
}
```

**Change 1.2:** Update WebSocket token generation
```typescript
// agent-wrapper/src/websocket-client.ts:640-661
private async getAuthToken(): Promise<string> {
  // Use stored CLI token instead of generating new JWT
  const credentials = await this.credentialStore.retrieve();

  if (!credentials || !credentials.access_token) {
    throw new Error('No valid authentication. Run: onsembl-agent auth login');
  }

  // Check if token needs refresh
  if (credentials.expires_at && Date.now() / 1000 > credentials.expires_at) {
    const newTokens = await this.cliAuth.refreshToken(credentials.refresh_token);
    await this.credentialStore.store({
      ...credentials,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in
    });
    return newTokens.access_token;
  }

  return credentials.access_token;
}
```

#### Phase 2: Backend WebSocket Handler Updates

**File: `backend/src/websocket/agent-handler.ts`**

**Change 2.1:** Update token validation to extract userId
```typescript
// Line 204: Already validates token correctly
const authContext = await this.services.authService.validateToken(token);

// authContext should contain:
// { userId: string, expiresAt: number, refreshToken?: string }
```

**Change 2.2:** Pass userId to agent registration
```typescript
// Line 224: Already passes authContext.userId ✅
const created = await this.services.agentService.registerAgent({
  name: agentId,
  type: mappedType,
  version: version || 'unknown',
  user_id: authContext.userId, // CRITICAL: Must include user_id
  capabilities: [],
  metadata: { hostMachine, capabilities: capabilities || {} },
  status: 'offline',
});
```

#### Phase 3: Agent Service Updates

**File: `backend/src/services/agent.service.ts`**

**Change 3.1:** Ensure registerAgent includes user_id
```typescript
async registerAgent(
  data: AgentInsert,
  userId?: string,  // Make required instead of optional
  requestMetadata?: { ip_address?: string; user_agent?: string }
) {
  // Validate user_id is provided
  if (!data.user_id && !userId) {
    throw new Error('user_id is required for agent registration');
  }

  const agentData = {
    ...data,
    user_id: data.user_id || userId,
    status: 'offline',
    created_at: new Date().toISOString(),
  };

  const agent = await this.agentModel.create(agentData);
  // ... rest of implementation
}
```

**Change 3.2:** Use service role client for database operations
```typescript
// backend/src/models/agent.ts:242
async create(agent: AgentInsert): Promise<AgentRow> {
  // IMPORTANT: When called from backend, use service role client
  // to bypass RLS and allow user_id to be set
  const { data, error } = await this.supabase
    .from('agents')
    .insert({
      ...agent,
      user_id: agent.user_id, // Critical: include user_id
    })
    .select()
    .single();

  if (error) throw new AgentError(error.message, 'CREATE_FAILED');
  return data;
}
```

#### Phase 4: AuthService Integration

**File: `backend/src/services/auth.service.ts`**

**Change 4.1:** Update validateToken to work with CLI tokens
```typescript
async validateToken(token: string): Promise<{
  userId: string;
  expiresAt: number;
  refreshToken?: string;
} | null> {
  try {
    // Try WebSocketAuth validation first (handles both Supabase and CLI tokens)
    const enhancedAuth = new EnhancedWebSocketAuth({
      jwtSecret: this.jwtSecret,
      supabaseUrl: this.supabaseUrl,
      supabaseAnonKey: this.supabaseAnonKey
    });

    const authContext = await enhancedAuth.validateToken(token);
    if (!authContext) return null;

    return {
      userId: authContext.userId,
      expiresAt: authContext.expiresAt || 0,
      refreshToken: undefined // CLI tokens use separate refresh endpoint
    };
  } catch (error) {
    this.fastify.log.error({ error }, 'Token validation failed');
    return null;
  }
}
```

---

## Migration Path

### Step 1: Update Agent-Wrapper (Breaking Change)

1. Update `websocket-client.ts` to use stored CLI tokens
2. Update `cli.ts` to check authentication before starting
3. Update `.env.example` to document authentication requirement

### Step 2: Update Backend Services

1. Update `AuthService.validateToken()` to use `EnhancedWebSocketAuth`
2. Ensure `registerAgent()` includes `user_id`
3. Update agent model to use service role client

### Step 3: Update Testing Guide

1. Document OAuth device flow requirement
2. Add authentication step before agent connection
3. Update mock agent test to use real authentication

### Step 4: Database Verification

1. Verify RLS policies are in place
2. Confirm service role policy exists
3. Test agent creation with user_id

---

## Testing Strategy

### Unit Tests

1. **Agent-Wrapper:**
   - Test CLI authentication flow
   - Test token refresh mechanism
   - Test credential storage

2. **Backend:**
   - Test CLI token validation
   - Test agent registration with user_id
   - Test RLS policy enforcement

### Integration Tests

1. **End-to-End Flow:**
   - User authenticates via device flow
   - Agent connects with CLI token
   - Agent is registered with correct user_id
   - RLS policies allow agent operations

2. **Multi-User Isolation:**
   - User A cannot see User B's agents
   - User A cannot control User B's agents
   - Database queries properly scoped

---

## Security Considerations

### ✅ Improvements

1. **User Association:** Every agent is tied to a Supabase user
2. **RLS Enforcement:** Database enforces user isolation
3. **Token Lifecycle:** Proper refresh and revocation
4. **Audit Trail:** All agent operations logged with user_id

### ⚠️ Risks to Mitigate

1. **Token Storage:** Ensure keychain security on all platforms
2. **Token Refresh:** Handle refresh failures gracefully
3. **Revocation:** Implement token revocation on logout
4. **Rate Limiting:** Prevent abuse of authentication endpoints

---

## Alternative Approaches Considered

### ❌ Option 1: Keep Simple JWT Tokens
**Rejected because:**
- Cannot associate agents with users
- RLS policies would need to be disabled
- No audit trail for agent operations

### ❌ Option 2: Create Service Accounts
**Rejected because:**
- Adds complexity (user + service account model)
- Doesn't align with Supabase auth model
- Still requires OAuth flow

### ✅ Option 3: Use CLI OAuth Device Flow (Proposed)
**Advantages:**
- Aligns with Supabase authentication
- Industry-standard pattern (like `gh auth login`)
- Proper user association
- RLS policies work correctly
- Full audit trail

---

## Implementation Verification

### Backend Authentication Services
- `backend/src/api/auth.ts:720` issues CLI access/refresh tokens during `POST /api/auth/device/confirm`, storing `user_id` and scopes in `cli_tokens`, matching the proposed device flow contract.
- `backend/src/api/auth.ts:801` serves the polling exchange with the persisted CLI tokens, while `backend/src/api/auth.ts:852` refreshes tokens and `backend/src/api/auth.ts:886` validates them, all through Fastify JWT using `type: 'cli'` payloads.
- `backend/src/server.ts:94` registers `@fastify/jwt` and calls `initializeEnhancedAuth` so the WebSocket layer verifies exactly the tokens minted by the device flow.

### CLI & Agent Wrapper Integration
- `agent-wrapper/src/auth/cli-auth.ts:59` drives the OAuth device flow (authorise, poll, refresh, validate, revoke) against the new backend endpoints.
- `agent-wrapper/src/auth/auth-manager.ts:26` validates issued tokens, persists `{access, refresh, user_id, scopes}`, refreshes them automatically, and exposes `getAccessToken()` for other subsystems.
- `agent-wrapper/src/cli.ts:418` blocks `start`/`restart` workflows until `AuthManager` confirms an authenticated session, guiding operators to `onsembl-agent auth login`.
- `agent-wrapper/src/websocket-client.ts:657` now injects the stored CLI token into the WebSocket `Authorization` header, surfacing actionable guidance if authentication is missing.

### Frontend Device Confirmation
- `frontend/src/app/auth/device/page.tsx:68` handles Supabase OAuth sign-in, and `frontend/src/app/auth/device/page.tsx:102` posts the user-entered code to `POST /api/auth/device/confirm` with the user’s Supabase access token, completing the device flow.

### WebSocket Session Enforcement
- `backend/src/services/websocket-auth.ts:167` verifies CLI JWTs with Fastify’s signer, enforces expiry/blacklist checks, and falls back to Supabase sessions when needed.
- `backend/src/websocket/agent-handler.ts:200` requires a valid auth context, reuses the `userId` when reconnecting, and injects it into `registerAgent` for new agent records.
- `backend/src/services/auth.service.ts:280` delegates token validation to the enhanced WebSocket auth singleton so all transports share the same verification path.

### Database & RLS Alignment
- `supabase/migrations/20250924051405_create_cli_tokens_table.sql:1` provisions the `cli_tokens` table with service-role policies and user-scoped RLS, forming the persistence layer for device flow state.
- `supabase/migrations/20250922194156_agents_rls.sql:4` enforces `auth.uid()` ownership on `agents`, and `backend/src/websocket/agent-handler.ts:289` satisfies it by supplying `user_id` from the CLI token.
- `supabase/migrations/20250922194157_commands_audit_rls.sql:4` extends the user ownership model to `commands` and `audit_logs`.
- `backend/src/server.ts:176` instantiates `AgentService` with the service-role client (`supabaseAdmin`), allowing the backend to bridge RLS when acting on behalf of authenticated users.

### Outstanding Gaps & Follow-ups
- `backend/src/services/command.service.ts:121` still inserts commands without a `user_id`, and `backend/src/models/command.ts` lacks user-aware schema handling; once RLS is fully enforced this will block command creation unless the service role is used.
- `supabase/migrations/20250924051405_create_cli_tokens_table.sql:10` retains `expires_at` as the device-code expiry; consider persisting the CLI access-token expiry or updating `last_used_at` on successful exchanges for richer auditing.
- Audit the CLI logout flow once revocation endpoints are integrated with token blacklisting to ensure `EnhancedWebSocketAuth` honours revoked refresh tokens end-to-end.

---

## Implementation Checklist

### Phase 1: Agent-Wrapper
- [ ] Update `websocket-client.ts` to use CLI tokens
- [ ] Add authentication check in `cli.ts start` command
- [ ] Update `.env.example` and documentation
- [ ] Test authentication flow end-to-end

### Phase 2: Backend
- [ ] Update `AuthService.validateToken()`
- [ ] Ensure `agent-handler.ts` extracts userId correctly
- [ ] Update `agent.service.ts` to require user_id
- [ ] Use service role client in agent model
- [ ] Test with RLS policies enabled

### Phase 3: Testing
- [ ] Update end-to-end testing guide
- [ ] Add authentication step to Phase 4
- [ ] Test multi-user isolation
- [ ] Verify audit logs include user_id

### Phase 4: Documentation
- [ ] Update CLAUDE.md with authentication architecture
- [ ] Document device flow for users
- [ ] Add troubleshooting guide for auth issues
- [ ] Create migration guide for existing users

---

## Timeline Estimate

- **Phase 1 (Agent-Wrapper):** 2-3 hours
- **Phase 2 (Backend):** 2-3 hours
- **Phase 3 (Testing):** 1-2 hours
- **Phase 4 (Documentation):** 1 hour

**Total:** 6-9 hours

---

## Conclusion

The proposed solution unifies authentication across the entire stack by:

1. Requiring users to authenticate via OAuth device flow
2. Using CLI tokens (with user_id) for agent connections
3. Properly associating agents with users in the database
4. Enabling RLS policies for multi-user isolation
5. Maintaining a complete audit trail

This approach aligns with the existing infrastructure (`cli_tokens` table, device flow endpoints) and follows industry best practices for CLI authentication.
