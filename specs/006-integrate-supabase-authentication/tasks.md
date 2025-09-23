# Implementation Tasks: Integrate Supabase Authentication

**Feature**: Supabase Authentication Integration
**Branch**: `006-integrate-supabase-authentication`
**Estimated**: 30-35 tasks

## Task Organization

### Execution Guidelines
- Tasks marked with `[P]` can be executed in parallel
- Tasks without `[P]` must be executed sequentially
- Each task includes the specific file(s) to modify
- Follow TDD: Write tests before implementation

### Parallel Execution Example
```bash
# Run parallel contract tests (T006-T010)
Task agent --parallel \
  "T006: Write contract test for GET /auth/session" \
  "T007: Write contract test for GET /auth/profile" \
  "T008: Write contract test for PUT /auth/profile" \
  "T009: Write contract test for POST /auth/validate" \
  "T010: Write contract test for protected endpoints"
```

## Phase 1: Database Setup (T001-T005)

### T001: Create database migration for user_profiles table
**File**: `backend/migrations/001_create_user_profiles.sql`
- Create user_profiles table with id, username, avatar_url, full_name, bio, preferences
- Add foreign key to auth.users(id) with CASCADE delete
- Add created_at and updated_at timestamps
- Create unique index on username

### T002: Create migration to add user_id columns
**File**: `backend/migrations/002_add_user_id_columns.sql`
- Add user_id column to agents table with foreign key to auth.users(id)
- Add user_id column to commands table with foreign key to auth.users(id)
- Add user_id column to audit_logs table with foreign key to auth.users(id)
- Create indexes on all user_id columns for performance

### T003: Create RLS policies for user_profiles
**File**: `backend/migrations/003_user_profiles_rls.sql`
- Enable RLS on user_profiles table
- Create policy for users to SELECT own profile
- Create policy for users to UPDATE own profile
- Create policy for users to INSERT own profile

### T004: Create RLS policies for agents table
**File**: `backend/migrations/004_agents_rls.sql`
- Enable RLS on agents table
- Create policy for SELECT using user_id = auth.uid()
- Create policy for INSERT with CHECK user_id = auth.uid()
- Create policy for UPDATE using user_id = auth.uid()
- Create policy for DELETE using user_id = auth.uid()

### T005: Create RLS policies for commands and audit_logs [P]
**File**: `backend/migrations/005_commands_audit_rls.sql`
- Enable RLS on commands table
- Create SELECT policy for commands where user_id = auth.uid()
- Create INSERT policy with CHECK for own agents
- Enable RLS on audit_logs table
- Create SELECT policy for audit_logs where user_id = auth.uid()

## Phase 2: Backend Auth Setup (T006-T015)

### T006: Write contract test for GET /auth/session [P]
**File**: `backend/tests/contract/auth/session.test.ts`
- Test returns 401 without token
- Test returns 200 with valid token
- Test returns user data in correct format
- Test expires_at and expires_in fields

### T007: Write contract test for GET /auth/profile [P]
**File**: `backend/tests/contract/auth/profile-get.test.ts`
- Test returns 401 without token
- Test returns 404 if profile doesn't exist
- Test returns 200 with profile data
- Validate response schema matches OpenAPI spec

### T008: Write contract test for PUT /auth/profile [P]
**File**: `backend/tests/contract/auth/profile-update.test.ts`
- Test returns 401 without token
- Test validates username format (alphanumeric + underscore)
- Test updates profile successfully
- Test handles duplicate username error

### T009: Write contract test for POST /auth/validate [P]
**File**: `backend/tests/contract/auth/validate.test.ts`
- Test returns 401 for invalid token
- Test returns 200 for valid token
- Test returns user_id and email in response
- Test handles expired tokens correctly

### T010: Write contract test for protected endpoints [P]
**File**: `backend/tests/contract/auth/protected.test.ts`
- Test GET /agents requires authentication
- Test GET /commands requires authentication
- Test filters results by authenticated user
- Test returns empty array for new users

### T011: Create Supabase client library
**File**: `backend/src/lib/supabase.ts`
- Initialize Supabase client with service role key
- Export client instance for backend use
- Add helper functions for admin operations
- Configure with environment variables

### T012: Implement JWT validation middleware
**File**: `backend/src/middleware/auth.ts`
- Extract Bearer token from Authorization header
- Validate JWT signature with Supabase secret
- Call supabase.auth.getUser() to verify token
- Attach user to request context
- Return 401 for invalid/missing tokens

### T013: Implement auth endpoints controller
**File**: `backend/src/routes/auth.ts`
- Implement GET /auth/session endpoint
- Implement GET /auth/profile endpoint
- Implement PUT /auth/profile endpoint
- Implement POST /auth/validate endpoint
- Apply auth middleware to all routes

### T014: Update agents and commands routes
**File**: `backend/src/routes/agents.ts`, `backend/src/routes/commands.ts`
- Add auth middleware to all endpoints
- Filter queries by request.user.id
- Add user_id to INSERT operations
- Verify ownership before UPDATE/DELETE

### T015: Add auth event logging
**File**: `backend/src/services/audit-logger.ts`
- Create audit logger service
- Log successful authentications
- Log failed authentication attempts
- Log profile updates and security events
- Include IP address and user agent

## Phase 3: Frontend Auth Setup (T016-T023)

### T016: Install and configure Supabase client [P]
**File**: `frontend/src/lib/supabase.ts`
- Install @supabase/supabase-js and auth helpers
- Create Supabase client with anon key
- Configure for browser environment
- Export typed client instance

### T017: Create auth Zustand store [P]
**File**: `frontend/src/stores/auth-store.ts`
- Define auth state interface (user, session, loading, error)
- Create signUp method using supabase.auth.signUp()
- Create signIn method using supabase.auth.signInWithPassword()
- Create signOut method using supabase.auth.signOut()
- Create OAuth methods for Google and GitHub
- Add session refresh logic

### T018: Implement auth state listener
**File**: `frontend/src/components/providers/AuthProvider.tsx`
- Set up supabase.auth.onAuthStateChange listener
- Update auth store on state changes
- Handle initial session on mount
- Auto-refresh tokens before expiry
- Clean up listener on unmount

### T019: Create protected route wrapper
**File**: `frontend/src/components/auth/ProtectedRoute.tsx`
- Check for valid session
- Redirect to login if not authenticated
- Show loading state during session check
- Pass through to children if authenticated
- Preserve intended destination for post-login redirect

### T020: Update auth modal with Supabase integration
**File**: `frontend/src/components/auth/AuthModal.tsx`
- Connect sign up form to auth store
- Connect sign in form to auth store
- Implement Google OAuth button
- Implement GitHub OAuth button
- Add password reset flow
- Display auth errors to user

### T021: Implement password reset flow
**File**: `frontend/src/components/auth/ForgotPassword.tsx`
- Create forgot password form
- Call supabase.auth.resetPasswordForEmail()
- Show success message after email sent
- Handle reset token from email link
- Create new password form

### T022: Add user info to header/nav
**File**: `frontend/src/components/layout/Header.tsx`
- Display user email or username when logged in
- Show avatar if available
- Add sign out button
- Hide auth modal when authenticated
- Show loading state during auth checks

### T023: Update data fetching with auth context
**File**: `frontend/src/hooks/useAgents.ts`, `frontend/src/hooks/useCommands.ts`
- Add Authorization header to all API calls
- Handle 401 responses by refreshing session
- Clear local data on logout
- Refetch data on user change

## Phase 4: WebSocket Authentication (T024-T027)

### T024: Write WebSocket auth test [P]
**File**: `backend/tests/integration/websocket-auth.test.ts`
- Test connection rejected without token
- Test connection accepted with valid token
- Test AUTH_SUCCESS message sent
- Test connection closed on invalid token
- Test session expiry handling

### T025: Implement WebSocket JWT validation
**File**: `backend/src/websocket/auth-handler.ts`
- Extract token from connection headers
- Validate token with Supabase
- Store user context with connection
- Send AUTH_SUCCESS or AUTH_ERROR message
- Close connection with code 1008 for auth failures

### T026: Update message router for user filtering
**File**: `backend/src/websocket/message-router.ts`
- Add user_id to connection tracking Map
- Filter agent status by user ownership
- Filter commands by user ownership
- Prevent cross-user message routing
- Clean up user connections on disconnect

### T027: Update frontend WebSocket client
**File**: `frontend/src/lib/websocket-client.ts`
- Pass auth token in connection headers
- Handle AUTH_SUCCESS message
- Handle SESSION_EXPIRED message
- Implement reconnection with token refresh
- Clear connection on logout

## Phase 5: Integration Tests (T028-T032)

### T028: Write E2E test for sign up flow [P]
**File**: `e2e/tests/auth/signup.spec.ts`
- Navigate to app
- Open auth modal
- Fill sign up form
- Submit and verify redirect to dashboard
- Verify user can see their profile

### T029: Write E2E test for sign in flow [P]
**File**: `e2e/tests/auth/signin.spec.ts`
- Test email/password sign in
- Test Google OAuth sign in
- Test GitHub OAuth sign in
- Verify session persistence
- Test invalid credentials error

### T030: Write E2E test for password reset [P]
**File**: `e2e/tests/auth/password-reset.spec.ts`
- Click forgot password link
- Enter email and submit
- Verify success message
- Test with invalid email
- Mock email link click and password update

### T031: Write E2E test for data isolation [P]
**File**: `e2e/tests/auth/data-isolation.spec.ts`
- Sign in as User A and create agent
- Sign out and sign in as User B
- Verify User B cannot see User A's agent
- Create agent as User B
- Verify each user only sees own data

### T032: Write E2E test for protected routes [P]
**File**: `e2e/tests/auth/protected-routes.spec.ts`
- Try accessing /dashboard while logged out
- Verify redirect to login
- Sign in and verify redirect back to dashboard
- Test API endpoints return 401 without auth
- Verify WebSocket requires authentication

## Phase 6: Polish & Documentation (T033-T035)

### T033: Add auth-related TypeScript types [P]
**File**: `frontend/src/types/auth.ts`, `backend/src/types/auth.ts`
- Generate types from Supabase schema
- Define User, Session, Profile interfaces
- Add auth-specific error types
- Export for use across codebase

### T034: Create auth library documentation [P]
**File**: `packages/auth-client/README.md`, `packages/auth-guard/README.md`
- Document auth client library usage
- Document auth guard middleware
- Add code examples
- Include troubleshooting section

### T035: Update CLAUDE.md with auth details
**File**: `/CLAUDE.md`
- Add authentication section
- Document auth flow
- Include environment variables needed
- Add common auth-related commands

## Summary

### Parallel Execution Groups

**Group 1 (Database)**: T005 can run alone
**Group 2 (Contract Tests)**: T006-T010 can run in parallel
**Group 3 (Frontend Setup)**: T016-T017 can run in parallel
**Group 4 (Integration Tests)**: T028-T032 can run in parallel
**Group 5 (Documentation)**: T033-T034 can run in parallel

### Critical Path
1. Database migrations (T001-T005) - Must complete first
2. Backend middleware (T011-T012) - Blocks all backend work
3. Frontend auth store (T017) - Blocks all frontend auth work
4. WebSocket auth (T025) - Blocks WebSocket functionality

### Validation Checklist
- [ ] All database migrations applied successfully
- [ ] Contract tests pass (proving API compliance)
- [ ] Auth flow works end-to-end
- [ ] Data isolation verified between users
- [ ] WebSocket connections require authentication
- [ ] Session persistence across refreshes
- [ ] OAuth providers functional
- [ ] Password reset flow complete

---
*Total Tasks: 35 | Parallel: 18 | Sequential: 17*