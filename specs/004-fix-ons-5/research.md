# Research: Fix Command Routing - Commands Never Reach Agents

## Executive Summary
Research conducted to resolve WebSocket message routing implementation details. All technical decisions are based on existing codebase analysis and established patterns.

## Key Findings

### 1. WebSocket Architecture Analysis
**Decision**: Use existing MessageRouter with singleton pattern across handlers
**Rationale**: MessageRouter class already implements all routing logic with queuing, priority, and retry mechanisms
**Alternatives considered**:
- Direct handler-to-handler communication: Rejected due to tight coupling
- Event bus pattern: Rejected as MessageRouter already provides this functionality

### 2. Message Flow Pattern
**Decision**: Dashboard → Backend (route via MessageRouter) → Agent
**Rationale**: Centralized routing provides single point for monitoring, queuing, and debugging
**Alternatives considered**:
- Direct WebSocket forwarding: Rejected due to loss of message tracking
- Database-backed queue: Rejected as overkill for real-time messaging

### 3. Connection Tracking Strategy
**Decision**: Map command IDs to originating dashboard connection IDs
**Rationale**: Enables precise response routing back to correct dashboard
**Alternatives considered**:
- Session-based tracking: Rejected as connections may reconnect with new sessions
- User-based routing: Rejected as single user may have multiple dashboards open

### 4. Handler Dependency Injection
**Decision**: Share single MessageRouter instance between all handlers via WebSocketDependencies
**Rationale**: Ensures consistent message routing and connection pool access
**Alternatives considered**:
- Per-handler routers: Rejected due to fragmented connection state
- Global singleton: Rejected in favor of explicit dependency injection

### 5. Offline Agent Handling
**Decision**: Queue messages in MessageRouter with configurable TTL and priority
**Rationale**: Built-in queuing with automatic retry and timeout handling
**Alternatives considered**:
- Redis queue: Already using BullMQ for other queuing, but WebSocket needs immediate in-memory
- Database persistence: Rejected for real-time messages, only persist if needed for audit

### 6. Testing Approach
**Decision**: Integration tests with real WebSocket connections using ws client
**Rationale**: Tests actual message flow through real connections
**Alternatives considered**:
- Mock WebSocket: Rejected as it wouldn't test actual protocol handling
- Unit tests only: Insufficient for testing message routing between connections

## Technical Specifications

### Message Types to Route
From analysis of existing types in agent-protocol:
- `COMMAND_REQUEST`: Dashboard → Agent (via router)
- `COMMAND_CANCEL`: Dashboard → Agent (via router)
- `AGENT_CONTROL`: Dashboard → Agent (via router)
- `EMERGENCY_STOP`: Dashboard → All Agents (broadcast)
- `COMMAND_STATUS`: Agent → Dashboard (via router)
- `TERMINAL_STREAM`: Agent → Dashboard (via router)
- `TRACE_STREAM`: Agent → Dashboard (via router)

### Connection Metadata Requirements
- Dashboard: `connectionId`, `userId`, `initiatedCommands: Set<commandId>`
- Agent: `connectionId`, `agentId`, `processingCommands: Map<commandId, dashboardConnectionId>`

### Performance Considerations
- Message routing latency: <10ms for in-memory routing
- Queue processing interval: 100ms (configurable)
- Max queued messages: 1000 per agent
- Message timeout: 30 seconds (configurable)

## Implementation Strategy

### Phase 1: Wire MessageRouter
1. Update dashboard-handler to inject command messages into router
2. Update agent-handler to receive routed messages
3. Ensure responses route back via command ID mapping

### Phase 2: Add Command Tracking
1. Track command-to-dashboard mapping in MessageRouter
2. Update connection metadata to include command associations
3. Implement cleanup on disconnect

### Phase 3: Test Coverage
1. Integration test: Single dashboard to single agent
2. Integration test: Multiple dashboards to different agents
3. Integration test: Offline agent message queuing
4. Integration test: Emergency stop broadcast

## Risk Analysis

### Identified Risks
1. **Memory leak**: Untracked command mappings
   - Mitigation: Cleanup on disconnect, TTL on mappings

2. **Message ordering**: Out-of-order delivery
   - Mitigation: Sequence numbers already in protocol

3. **Connection state sync**: Reconnection handling
   - Mitigation: Connection pool tracks state, heartbeat manager monitors

## Conclusion
All technical unknowns have been resolved through codebase analysis. The existing MessageRouter provides all required functionality and only needs to be wired into the WebSocket handlers with appropriate message type handling.