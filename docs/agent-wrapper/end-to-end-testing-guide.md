# End-to-End User Testing Guide

This guide provides a comprehensive plan for testing the Onsembl.ai Agent Control Center from an end-user perspective, covering the complete workflow from authentication to command execution.

## Overview

This testing plan simulates the full user experience of:
1. Creating an account and authenticating
2. Installing and configuring the agent-wrapper CLI
3. Connecting agents to the control center
4. Executing commands and monitoring real-time output
5. Testing multi-user isolation and error handling

---

## Phase 1: Environment Preparation

### Prerequisites Check

**Required Services:**
1. Verify all services are configured:
   - Supabase project with authentication enabled (Google/GitHub OAuth + Email/Password)
   - Redis instance (Upstash or local) for BullMQ
   - PostgreSQL database (Supabase or local) with schema migrated
   - Environment variables set for all services

2. Confirm what's already running:
   - Check if database migrations are applied
   - Verify Supabase RLS policies are active
   - Confirm Redis is accessible

### Decision Points

Before starting, decide:
- **Database**: Use Supabase production or local PostgreSQL?
- **Auth**: Which OAuth providers to enable for testing?
- **Agent Type**: Test with Claude, Mock, or both?

---

## Phase 2: Service Startup Sequence

### Recommended Startup Order

**1. Backend Server (Port 8080)**
```bash
cd backend
npm run dev
```

**Verify:**
- WebSocket endpoint ready at `ws://localhost:8080/ws/agent`
- Health endpoint accessible: `http://localhost:8080/health`
- Database connection successful
- No errors in startup logs

**2. Frontend Dashboard (Port 3000)**
```bash
cd frontend
npm run dev
```

**Verify:**
- Loads at `http://localhost:3000`
- Supabase client configured
- Environment variables loaded
- No console errors

**3. Keep Terminals Open**
- Monitor logs in real-time for both services
- Watch for WebSocket connections, auth attempts, errors

---

## Phase 3: User Registration & Authentication Flow

### Test Scenario 1: New User Signup

1. Navigate to `http://localhost:3000` (should redirect to login)
2. Click "Sign Up" or "Create Account"
3. Test one authentication method:
   - **Email/Password**: Register with test email, verify email flow
   - **OAuth (Google)**: Test Google sign-in flow
   - **OAuth (GitHub)**: Test GitHub sign-in flow

**Verify:**
- ✅ User profile created in `user_profiles` table
- ✅ JWT token issued and stored in browser
- ✅ Redirect to dashboard after successful auth
- ✅ User can see empty state (no agents yet)

### Test Scenario 2: Returning User Login

1. Log out from dashboard
2. Log back in with same credentials
3. Verify session persistence and token refresh

**Verify:**
- ✅ Login successful with existing credentials
- ✅ Previous session data persists (if any)
- ✅ Token automatically refreshes on expiry

---

## Phase 4: Agent Wrapper Setup

### Installation

**1. Build Agent Wrapper:**
```bash
cd agent-wrapper
npm run build
npm link  # Make `onsembl-agent` command available globally
```

**2. Verify CLI Accessibility:**
```bash
onsembl-agent --version
onsembl-agent --help
```

**Verify:**
- ✅ CLI commands are recognized
- ✅ Help text displays available commands
- ✅ Version matches package.json

### Authentication

**1. Authenticate Agent Wrapper:**
```bash
onsembl-agent auth login
```

**Expected Flow:**
- Browser opens for OAuth device flow
- Device code displayed in terminal
- User authorizes in browser
- Token stored securely (keytar/XDG)

**2. Check Auth Status:**
```bash
onsembl-agent auth status
```

**Verify:**
- ✅ Shows "Authenticated" status
- ✅ Displays user email/info
- ✅ Token expiry shown

### Decision Point

Choose which agent type to test first:
- **Mock Agent**: No external dependencies, simple testing
- **Claude Agent**: Requires Claude CLI installed, realistic scenario

---

## Phase 5: Agent Registration & Connection

### Test Scenario: Register and Start Agent

**Option A - Mock Agent (Recommended First)**
```bash
onsembl-agent start --agent-type=mock --agent-name="Test Mock Agent"
```

**Option B - Claude Agent**
```bash
onsembl-agent start --agent-type=claude --agent-name="My Claude Agent"
```

### Verify in Terminal

**Expected Log Output:**
```
[INFO] Authenticating with Onsembl...
[INFO] WebSocket connecting to ws://localhost:8080/ws/agent
[INFO] Agent registered: mock-agent-xyz123
[INFO] Heartbeat sent
[INFO] Agent status: idle
```

**Verify:**
- ✅ WebSocket connection established
- ✅ Agent registered with backend
- ✅ Heartbeat messages every 30 seconds
- ✅ No error messages in logs

### Verify in Dashboard

**Refresh browser at `http://localhost:3000`**

**Verify:**
- ✅ New agent appears in agent list
- ✅ Status shows "idle" or "ready"
- ✅ Agent card displays: name, type, status, last seen
- ✅ Green indicator for connected status

---

## Phase 6: Command Execution Testing

### Test Scenario 1: Simple Command

**Steps:**
1. From dashboard, click on agent card
2. Enter command: `echo "Hello from Onsembl"`
3. Click "Execute" or press Enter

**Verify:**
- ✅ Command appears in terminal output area
- ✅ Output streams in real-time (< 200ms latency)
- ✅ Terminal colors/formatting preserved
- ✅ Command completes with success status
- ✅ Command appears in command history

### Test Scenario 2: Long-Running Command

**Steps:**
1. Execute: `sleep 5 && echo "Done waiting"`
2. Observe status changes to "busy"
3. Watch output stream after 5 seconds
4. Verify status returns to "idle"

**Verify:**
- ✅ Agent status updates to "busy" immediately
- ✅ Output appears after delay
- ✅ Status returns to "idle" when complete
- ✅ Timestamp accurate

### Test Scenario 3: Command with Error

**Steps:**
1. Execute invalid command: `nonexistent-command`
2. Verify error output appears
3. Check error logged in audit log

**Verify:**
- ✅ Error message displayed in terminal
- ✅ Error styling (red text) applied
- ✅ Exit code captured
- ✅ Audit log records failure

### Test Scenario 4: Multiple Commands (Queue)

**Steps:**
1. Send multiple commands rapidly:
   ```
   echo "First"
   echo "Second"
   echo "Third"
   ```
2. Verify they queue and execute in order
3. Check BullMQ dashboard (if accessible)

**Verify:**
- ✅ Commands execute in FIFO order
- ✅ No command lost or skipped
- ✅ Queue status visible
- ✅ Each completes before next starts

---

## Phase 7: Real-Time Features Testing

### Test Scenario 1: Multi-Dashboard Sync

**Steps:**
1. Open dashboard in two browser tabs
2. Send command from Tab 1
3. Watch Tab 2 for real-time updates

**Verify:**
- ✅ Output appears simultaneously in both tabs
- ✅ Agent status syncs across tabs
- ✅ Command history updates in both
- ✅ No lag or delay between tabs

### Test Scenario 2: Agent Reconnection

**Steps:**
1. While agent running, kill agent-wrapper process (Ctrl+C)
2. Observe dashboard status change
3. Restart agent-wrapper
4. Verify reconnection

**Verify:**
- ✅ Dashboard shows "disconnected" status
- ✅ Reconnection indicator appears
- ✅ Agent reconnects automatically
- ✅ Previous state restored
- ✅ Exponential backoff visible in logs

### Test Scenario 3: Emergency Stop

**Steps:**
1. Execute long command: `sleep 30`
2. Click "Stop" or "Kill" button in dashboard
3. Verify termination

**Verify:**
- ✅ Command terminates immediately
- ✅ Agent remains connected
- ✅ Status returns to "idle"
- ✅ Partial output visible

---

## Phase 8: Advanced Features Testing

### Test Scenario 1: Command Presets

**Steps:**
1. Create command preset from dashboard
2. Name: "Test Preset", Command: `echo "Preset test"`
3. Execute the preset

**Verify:**
- ✅ Preset saved to database
- ✅ Preset appears in list
- ✅ Execution runs saved command
- ✅ User can edit/delete preset

### Test Scenario 2: LLM Trace Viewing

**Steps:**
1. Execute command generating LLM traces
2. Navigate to traces view
3. Inspect trace tree

**Verify:**
- ✅ Trace tree visualization appears
- ✅ Nested traces shown correctly
- ✅ Timing information displayed
- ✅ Token counts visible

### Test Scenario 3: Audit Log

**Steps:**
1. Navigate to audit log view
2. Review executed commands
3. Filter by date/agent

**Verify:**
- ✅ All commands logged with timestamps
- ✅ User ID correctly associated
- ✅ Exit codes recorded
- ✅ Filters work correctly
- ✅ 30-day retention enforced

---

## Phase 9: Multi-User Isolation Testing

### Test Scenario: Data Isolation (RLS Verification)

**Steps:**
1. Create second user account (different email/OAuth)
2. Log in with User 2 in incognito window
3. Start agent-wrapper with User 2's credentials
4. Attempt cross-user access

**Verify:**
- ✅ User 2 cannot see User 1's agents
- ✅ User 2 cannot send commands to User 1's agents
- ✅ Database queries scoped by `user_id`
- ✅ WebSocket messages filtered by user
- ✅ No data leakage between users

**Database Verification:**
```sql
-- Should only return User 1's agents when auth.uid() = user1_id
SELECT * FROM agents;

-- Should only return User 2's commands when auth.uid() = user2_id
SELECT * FROM commands;
```

---

## Phase 10: Error Handling & Edge Cases

### Test Scenarios

**1. Token Expiry**
- Wait for token to expire (or manually invalidate)
- Verify auto-refresh occurs
- Check no interruption to active connections

**2. Backend Restart**
- Restart backend while agent connected
- Verify agent reconnects automatically
- Check message queue preserves pending commands

**3. Network Interruption**
- Disconnect WiFi/network briefly
- Verify circuit breaker activates
- Check reconnection after network restored

**4. Invalid Commands**
- Send malformed commands
- Verify graceful error messages
- Check no crashes or hung processes

**5. Resource Limits**
- Send command with large output: `cat large-file.txt`
- Verify output chunking works
- Check memory usage remains stable

**6. Concurrent Agents**
- Start 3+ agents simultaneously
- Execute commands on each
- Verify isolation and no interference

**Verify All Scenarios:**
- ✅ No unhandled exceptions
- ✅ Graceful error messages
- ✅ System remains stable
- ✅ User experience not degraded

---

## Phase 11: Cleanup & State Verification

### Final Checks

**1. Graceful Shutdown**
```bash
# In agent-wrapper terminal
Ctrl+C
```

**Verify:**
- ✅ Agent unregisters from backend
- ✅ WebSocket closes cleanly
- ✅ No orphaned processes
- ✅ Logs show graceful shutdown

**2. Dashboard Cleanup**
- Stop all agents via dashboard
- Log out from all sessions
- Close all browser tabs

**3. Database Verification**
```sql
-- Check for orphaned records
SELECT * FROM agents WHERE last_seen < NOW() - INTERVAL '5 minutes';

-- Verify audit logs complete
SELECT COUNT(*) FROM audit_log WHERE user_id = 'your-user-id';
```

**Verify:**
- ✅ No orphaned agent records
- ✅ All commands logged
- ✅ Timestamps accurate
- ✅ No data corruption

---

## Expected Deliverables

After completing this testing plan, you should confidently answer:

| Area | Question | Status |
|------|----------|--------|
| **Auth** | Does signup/login work smoothly? | ⬜ |
| **Connection** | Can agent-wrapper connect and stay connected? | ⬜ |
| **Streaming** | Is terminal output truly < 200ms? | ⬜ |
| **Execution** | Do commands execute reliably? | ⬜ |
| **Errors** | Are errors handled gracefully? | ⬜ |
| **Multi-User** | Is data properly isolated between users? | ⬜ |
| **Reconnection** | Does auto-reconnect work after failures? | ⬜ |
| **UI/UX** | Is the dashboard intuitive for users? | ⬜ |

---

## Risks & Considerations

### Potential Blockers

1. **Missing Environment Variables**
   - Solution: Check all `.env` files in backend, frontend, agent-wrapper

2. **Database Migrations Not Applied**
   - Solution: Run `npm run migrate` in backend

3. **RLS Policies Preventing Operations**
   - Solution: Review policies in Supabase dashboard

4. **WebSocket CORS Issues**
   - Solution: Verify CORS configuration in backend

5. **Agent-Wrapper Auth Not Working**
   - Solution: Check Supabase API keys and OAuth config

6. **Claude CLI Not Installed**
   - Solution: Install Claude CLI or test with Mock agent first

### Mitigation Strategies

- Start with Mock agent to eliminate external dependencies
- Check backend logs for detailed error messages
- Use browser DevTools to inspect WebSocket messages
- Check Supabase dashboard for auth issues
- Review network tab for failed requests

---

## Questions Before Starting

Before executing this plan, answer:

1. **Environment**: Supabase (production) or local PostgreSQL?
2. **Agent Type**: Start with Mock (simple) or Claude (realistic)?
3. **OAuth Providers**: Which OAuth to enable? (Google, GitHub, both?)
4. **Scope**: Full test (all phases) or focused test (specific features)?
5. **Current State**: Are services already running, or starting from scratch?

---

## Troubleshooting Guide

### Common Issues

**Issue: Agent-wrapper can't authenticate**
```
Error: Failed to authenticate with Onsembl
```
- Check backend is running
- Verify Supabase API keys in `.env`
- Confirm OAuth device flow endpoint accessible

**Issue: WebSocket connection fails**
```
Error: WebSocket connection refused
```
- Verify backend running on port 8080
- Check firewall/antivirus blocking connections
- Confirm WebSocket endpoint: `ws://localhost:8080/ws/agent`

**Issue: Commands don't execute**
```
Error: Command timeout
```
- Check agent process is running
- Verify command is valid
- Review agent-wrapper logs for errors

**Issue: Dashboard doesn't show agent**
```
No agents found
```
- Verify WebSocket connection in browser DevTools
- Check agent registered in database: `SELECT * FROM agents;`
- Confirm user_id matches between agent and dashboard

---

## Reporting Issues

When reporting issues found during testing, include:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Screenshots/logs**
5. **Environment details** (OS, Node version, browser)
6. **Backend logs** (agent-wrapper, backend server)

Create issues at: `https://github.com/yourusername/onsembl/issues`

---

## Next Steps

After successful testing:

1. Document any bugs found
2. Create user-facing documentation
3. Record demo video of complete workflow
4. Prepare for beta user testing
5. Set up monitoring and analytics

---

**Last Updated**: 2025-10-27
**Version**: 1.0.0
**Maintainer**: Onsembl.ai Team
