# Feature Specification: Fix Command Routing - Commands Never Reach Agents

**Feature Branch**: `004-fix-ons-5`
**Created**: 2025-09-17
**Status**: Draft
**Input**: User description: "Fix ONS-5: Command Routing Not Implemented - Commands Never Reach Agents"

## Execution Flow (main)
```
1. Parse user description from Input
   ’ Extracted: WebSocket command routing failure between dashboard and agents
2. Extract key concepts from description
   ’ Actors: Dashboard users, AI agents (Claude, Gemini, Codex), Control backend
   ’ Actions: Send commands, route messages, queue offline commands, broadcast emergency stops
   ’ Data: Commands, terminal output, status updates, trace events
   ’ Constraints: Real-time routing, message queuing for offline agents, correct dashboard isolation
3. For each unclear aspect:
   ’ No major ambiguities - existing infrastructure is documented
4. Fill User Scenarios & Testing section
   ’ User flows clearly defined for command execution
5. Generate Functional Requirements
   ’ Each requirement maps to specific routing behavior
6. Identify Key Entities
   ’ Commands, Agents, Dashboards, Messages
7. Run Review Checklist
   ’ All sections complete, requirements testable
8. Return: SUCCESS (spec ready for planning)
```

---

## ¡ Quick Guidelines
-  Focus on WHAT users need and WHY
- L Avoid HOW to implement (no tech stack, APIs, code structure)
- =e Written for business stakeholders, not developers

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a dashboard user controlling AI coding agents, I need my commands to reliably reach the target agents and receive their responses back, so that I can effectively orchestrate multiple agents and see their execution results in real-time.

### Acceptance Scenarios
1. **Given** a dashboard user is connected and an agent is online, **When** the user sends a command to that agent, **Then** the agent receives the command and the dashboard receives acknowledgment
2. **Given** multiple dashboards are connected, **When** Dashboard A sends a command to Agent X, **Then** only Dashboard A receives the terminal output and status updates from Agent X
3. **Given** a dashboard sends a command to an offline agent, **When** the agent comes online, **Then** the queued command is delivered to the agent
4. **Given** an agent is executing a command, **When** a dashboard issues an emergency stop, **Then** all agents receive the stop signal immediately
5. **Given** an agent is processing a command from Dashboard A, **When** the agent sends terminal output, **Then** the output streams only to Dashboard A in real-time

### Edge Cases
- What happens when a dashboard disconnects while waiting for command response? (Response should be queued or logged)
- How does system handle when target agent goes offline mid-command? (Dashboard should receive offline notification)
- What happens when message queue is full? (Oldest low-priority messages should be dropped)
- How does system handle multiple dashboards controlling the same agent? (Each dashboard tracks its own commands)

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST route COMMAND_REQUEST messages from any authenticated dashboard to the specified target agent
- **FR-002**: System MUST route agent responses (status, output, traces) back to the originating dashboard that sent the command
- **FR-003**: System MUST queue commands for offline agents and deliver them when the agent reconnects
- **FR-004**: System MUST broadcast EMERGENCY_STOP messages from any dashboard to all connected agents immediately
- **FR-005**: System MUST maintain isolation between different dashboard sessions (Dashboard A cannot see Dashboard B's command outputs)
- **FR-006**: System MUST support COMMAND_CANCEL messages to abort specific commands on target agents
- **FR-007**: System MUST support AGENT_CONTROL messages for starting/stopping/restarting specific agents
- **FR-008**: System MUST stream terminal output in real-time from agents to the dashboards that initiated the commands
- **FR-009**: System MUST notify dashboards when their target agent goes offline or comes online
- **FR-010**: System MUST handle message routing for multiple concurrent dashboard-to-agent connections

### Key Entities *(include if feature involves data)*
- **Command**: A user-initiated instruction sent from dashboard to agent, includes command ID, target agent ID, command text, and originating dashboard ID
- **Dashboard Connection**: Represents a user's browser session controlling agents, tracks subscribed agents and initiated commands
- **Agent Connection**: Represents an AI agent's WebSocket connection, includes agent ID, status, and current command queue
- **Message**: WebSocket protocol message with type, payload, and routing information for dashboard-agent communication
- **Message Queue**: Temporary storage for messages when target is offline or busy, with priority ordering

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---