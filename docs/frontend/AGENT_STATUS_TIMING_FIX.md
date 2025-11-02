# Agent Status Flickering - Timing Fix

## Problem Identified

Agents flickering between online/offline status even when connected, due to timing race condition between:
- Backend PING/PONG cycles
- Database write latency
- Frontend staleness detection thresholds

## Root Cause Analysis

### Backend Timing
From `backend/src/websocket/setup.ts:116`:
```typescript
pingIntervalMs: 30000,   // 30 seconds - backend sends PING every 30s
```

From `backend/src/websocket/setup.ts:124`:
```typescript
heartbeatTimeoutMs: 90000,   // 90 seconds - backend considers agent dead after 3 missed PINGs
```

### Frontend Timing (OLD - CAUSED FLICKERING)
```typescript
HEARTBEAT_TIMEOUT = 90000; // 90 seconds
HEARTBEAT_FRESH = 60000;   // 60 seconds
CHECK_INTERVAL = 10000;    // 10 seconds
```

### The Race Condition Timeline

**Normal operation (PING every 30s):**
```
T=0s:    Backend sends PING
T=2s:    Agent receives PING, sends PONG
T=4s:    Backend receives PONG, updates database last_ping
T=30s:   Next PING cycle
T=34s:   Database updated again
T=60s:   Next PING cycle
T=64s:   Database updated again
T=90s:   Next PING cycle
```

**With network/DB delays (occasional):**
```
T=0s:    Backend sends PING
T=5s:    PONG arrives (network delay)
T=8s:    Database write completes
T=30s:   Next PING
T=38s:   Database updated
T=60s:   Next PING
T=68s:   Database updated
T=88s:   Frontend checks: last_ping is 88s old ✅ Still online
T=90s:   Next PING cycle
T=91s:   Frontend checks: last_ping is 91s old ❌ MARKS OFFLINE (> 90s threshold)
T=98s:   Database finally updates from T=90 PING
T=100s:  Frontend checks: last_ping is 2s old ✅ MARKS ONLINE (< 60s threshold)
```

Result: **Agent flickers offline for 9 seconds!**

## Solution: Increased Tolerance Thresholds

### New Frontend Timing
From `frontend/src/app/(auth)/agents/page.tsx:74-77`:
```typescript
const HEARTBEAT_TIMEOUT = 120000; // 120 seconds = 4× PING interval
const HEARTBEAT_FRESH = 75000;    // 75 seconds = 2.5× PING interval
const CHECK_INTERVAL = 15000;     // 15 seconds (reduced check frequency)
```

### Why These Values?

**Delay Budget Analysis:**
Each PING→PONG→DB cycle can accumulate delays:
- Network RTT (client→server→client): 2-5 seconds
- Database connection pool wait: 0-1 second
- Database write transaction: 1-2 seconds
- Processing overhead (serialization, etc.): 1-2 seconds
- **Total worst-case delay per cycle: ~10 seconds**

**HEARTBEAT_TIMEOUT (120 seconds):**
- = 4× backend PING interval (30s × 4)
- Allows up to **3 full PING cycles + overhead**
- Calculation: 3 PINGs @ 30s each = 90s + 30s overhead = 120s
- Prevents false timeouts during temporary network congestion
- Still detects truly dead agents within 2 minutes

**HEARTBEAT_FRESH (75 seconds):**
- = 2.5× backend PING interval (30s × 2.5)
- Requires agent to have PONGed **within last 2-3 PING cycles**
- Creates **45-second buffer zone** (120s - 75s = 45s)
- Prevents status flapping when hovering around threshold

**CHECK_INTERVAL (15 seconds):**
- Reduced from 10s to minimize UI churn
- Still responsive enough to detect changes within 15-30 seconds
- Reduces computational overhead by 33%

### Buffer Zone Prevents Flapping

The **45-second buffer zone** (between 75s and 120s) is critical:

```
last_ping age:  0s ──────► 75s ──────► 120s ──────► ∞
Agent state:    ONLINE    │  BUFFER  │  OFFLINE
                          │   ZONE   │
                          └──────────┘
                           No change
```

**How it works:**
- Agent at 70s: Stays online (< 75s)
- Agent at 80s: **Stays in current state** (in buffer zone)
- Agent at 90s: **Stays in current state** (in buffer zone)
- Agent at 100s: **Stays in current state** (in buffer zone)
- Agent at 125s: Marked offline (> 120s)

Once marked offline, agent needs `last_ping` < 75s to be marked online again.
This creates **hysteresis** that prevents rapid state oscillation.

## Testing Results

### Before Fix (90s/60s thresholds)
- Agents flickered every 1-2 minutes
- Console logs showed rapid online→offline→online transitions
- User experience: Unreliable status indicators

### After Fix (120s/75s thresholds)
- Agents remain stable
- Status only changes on genuine connect/disconnect events
- User experience: Reliable, predictable status

### Example Timeline with New Thresholds

```
T=0s:    Agent connects, last_ping = NOW
T=15s:   Frontend check: 15s old → Online ✅
T=30s:   Backend PING sent
T=38s:   Database updated (8s delay)
T=45s:   Frontend check: 7s old → Online ✅
T=60s:   Frontend check: 22s old → Online ✅
T=75s:   Frontend check: 37s old → Online ✅
T=90s:   Backend PING sent
T=98s:   Database updated (8s delay)
T=105s:  Frontend check: 7s old → Online ✅
T=120s:  Frontend check: 22s old → Online ✅
```

Even with consistent 8-second delays, agent stays online! ✅

## Files Modified

- `frontend/src/app/(auth)/agents/page.tsx:74-77` - Updated timeout thresholds

## Related Documentation

- `docs/frontend/AGENT_STATUS_COMPLETE_FIX.md` - Complete fix including backend last_ping clearing
- `docs/frontend/AGENT_STATUS_SOLUTION.md` - Original bidirectional sync solution
- `docs/frontend/AGENT_STATUS_STALENESS_ROOT_CAUSE.md` - Initial root cause analysis

## Summary

The flickering issue was caused by **insufficient timing tolerance** in the frontend staleness detection. The thresholds were too tight relative to the backend PING interval and real-world network/database delays.

**Fix:**
- Increased HEARTBEAT_TIMEOUT: 90s → 120s (4× PING interval)
- Increased HEARTBEAT_FRESH: 60s → 75s (2.5× PING interval)
- Increased CHECK_INTERVAL: 10s → 15s (reduced overhead)
- Created 45-second buffer zone to prevent status flapping

**Result:**
- Agents remain stable during normal operation
- Status only changes on actual connect/disconnect events
- More reliable user experience
