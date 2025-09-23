# Research: Supabase Authentication Integration

## Executive Summary
Research findings for integrating Supabase authentication into Onsembl.ai Agent Control Center, covering OAuth providers, session management, JWT validation, and RLS policies.

## Key Decisions

### 1. Authentication Strategy
**Decision**: Use Supabase client-side SDK for auth, validate JWTs on backend

**Rationale**:
- Supabase handles OAuth flows, password hashing, session refresh automatically
- Built-in email verification and password reset flows
- JWT tokens are cryptographically secure and stateless
- Reduces custom auth code and security vulnerabilities

**Alternatives considered**:
- Custom auth endpoints: Rejected - adds complexity without benefits
- Auth0/Clerk: Rejected - Supabase auth is already integrated with database
- Firebase Auth: Rejected - not compatible with PostgreSQL RLS

### 2. OAuth Provider Configuration
**Decision**: Enable Google and GitHub OAuth through Supabase dashboard

**Rationale**:
- Most common OAuth providers for developer tools
- Supabase handles OAuth flow complexity
- No custom OAuth implementation needed
- Single sign-on improves user experience

**Configuration needed**:
- Google: OAuth 2.0 client ID and secret from Google Console
- GitHub: OAuth app client ID and secret from GitHub settings
- Redirect URLs must be configured in Supabase dashboard

### 3. Session Management
**Decision**: Use Supabase's automatic session persistence with localStorage/cookies

**Rationale**:
- Automatic token refresh before expiry (default 1 hour)
- Handles tab synchronization automatically
- Works across page refreshes
- Secure httpOnly cookies option available

**Implementation details**:
- Frontend: `supabase.auth.onAuthStateChange()` listener
- Session stored in localStorage by default
- Can configure for cookies with SSR

### 4. JWT Validation Middleware
**Decision**: Create Fastify middleware using Supabase's JWT verification

**Rationale**:
- Validates token signature with Supabase JWT secret
- Extracts user ID and metadata from token
- Stateless validation (no DB calls needed)
- Can cache JWKS for performance

**Implementation approach**:
```typescript
// Pseudo-code
fastify.addHook('onRequest', async (request, reply) => {
  const token = request.headers.authorization?.replace('Bearer ', '')
  const { data: user, error } = await supabase.auth.getUser(token)
  if (error) reply.unauthorized()
  request.user = user
})
```

### 5. WebSocket Authentication
**Decision**: Pass JWT in WebSocket connection headers, validate on connection

**Rationale**:
- WebSocket connections can't use cookies after establishment
- Token passed once during handshake
- Connection closed if token invalid/expires
- Reconnect with fresh token handled by client

**Security considerations**:
- Store user ID with WebSocket connection
- Close connection on logout
- Implement heartbeat to detect stale connections

### 6. Row Level Security (RLS)
**Decision**: Enable RLS on all tables with auth.uid() policies

**Rationale**:
- Database-level security (defense in depth)
- Automatic filtering by authenticated user
- Works with Supabase client library
- No risk of data leaks in application code

**Policy examples**:
```sql
-- Users can only see their own agents
CREATE POLICY "Users can view own agents" ON agents
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create agents for themselves
CREATE POLICY "Users can insert own agents" ON agents
  FOR INSERT WITH CHECK (user_id = auth.uid());
```

### 7. Password Reset Flow
**Decision**: Use Supabase's built-in password reset with email

**Rationale**:
- Secure token generation and expiry handled
- Email templates configurable in dashboard
- No custom reset token management needed
- Follows security best practices

**Flow**:
1. User clicks "Forgot password?"
2. Enters email → `supabase.auth.resetPasswordForEmail(email)`
3. Receives email with reset link
4. Clicks link → redirected to app with token
5. App exchanges token for session
6. User enters new password → `supabase.auth.updateUser({ password })`

### 8. Error Handling
**Decision**: Comprehensive error messages with fallback options

**Rationale**:
- Clear user feedback improves experience
- Fallback to email/password if OAuth fails
- Retry logic for network errors
- Audit logging for security events

**Error scenarios**:
- Invalid credentials: "Invalid email or password"
- OAuth failure: "Could not connect to Google. Try email/password."
- Network error: "Connection failed. Please check your internet."
- Session expired: "Your session has expired. Please log in again."

## Testing Strategy

### Integration Tests
1. **Auth Flow Tests**:
   - Sign up with email/password
   - Sign in with valid/invalid credentials
   - OAuth sign in simulation
   - Password reset flow

2. **Session Tests**:
   - Session persistence across refreshes
   - Token refresh before expiry
   - Multiple tab synchronization
   - Logout clears all sessions

3. **RLS Policy Tests**:
   - Users can only see own data
   - Cannot access other users' resources
   - Proper filtering in all queries

### E2E Tests (Playwright)
1. Complete sign up flow
2. OAuth login flow
3. Password reset journey
4. Protected route access
5. WebSocket auth verification

## Security Considerations

1. **Token Storage**: Use httpOnly cookies in production
2. **CORS**: Configure allowed origins strictly
3. **Rate Limiting**: Add rate limits to auth endpoints
4. **Audit Logging**: Log all auth events with timestamps
5. **MFA**: Consider adding MFA in future phase
6. **Password Policy**: Minimum 6 chars (Supabase default), consider strengthening

## Migration Plan
Not applicable - initial implementation

## Performance Considerations

1. **JWT Caching**: Cache JWKS for faster validation
2. **Connection Pooling**: Reuse Supabase client instances
3. **Lazy Loading**: Only initialize auth on protected routes
4. **Token Refresh**: Refresh 5 minutes before expiry to avoid interruption

## Dependencies to Add

### Frontend
```json
{
  "@supabase/supabase-js": "^2.x",
  "@supabase/auth-helpers-nextjs": "^0.8.x",
  "@supabase/auth-helpers-react": "^0.4.x"
}
```

### Backend
```json
{
  "@supabase/supabase-js": "^2.x",
  "jsonwebtoken": "^9.x",
  "@types/jsonwebtoken": "^9.x"
}
```

## Environment Variables Needed

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Backend (.env)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
SUPABASE_JWT_SECRET=
```

## Next Steps
1. Configure OAuth providers in Supabase dashboard
2. Set up email templates for auth emails
3. Create RLS policies before enabling RLS
4. Generate TypeScript types from Supabase schema
5. Create auth library modules as specified in plan

## References
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Next.js Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [JWT Verification](https://supabase.com/docs/guides/auth/jwts)