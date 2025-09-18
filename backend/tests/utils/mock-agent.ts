import { WebSocketTestClient } from './websocket-client.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentMessage,
  WebSocketMessage,
  CommandStatus,
  TerminalStream,
  AgentStatus,
  TraceEvent,
} from '@onsembl/agent-protocol';

export class MockAgentClient extends WebSocketTestClient {
  private receivedCommands: Map<string, WebSocketMessage> = new Map();
  private executingCommands: Set<string> = new Set();

  constructor(url: string, agentId: string, authToken?: string, connectionId?: string) {
    super({
      url,
      connectionType: 'agent',
      agentId,
      authToken,
      connectionId: connectionId || uuidv4(),
    });

    // Track received commands
    this.onMessage('COMMAND_REQUEST', (msg) => {
      const commandId = (msg.payload as any)?.commandId;
      if (commandId) {
        this.receivedCommands.set(commandId, msg);
      }
    });

    this.onMessage('COMMAND_CANCEL', (msg) => {
      const commandId = (msg.payload as any)?.commandId;
      if (commandId && this.executingCommands.has(commandId)) {
        this.executingCommands.delete(commandId);
      }
    });

    this.onMessage('EMERGENCY_STOP', () => {
      // Clear all executing commands on emergency stop
      this.executingCommands.clear();
    });
  }

  sendCommandStatus(
    commandId: string,
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
    error?: string
  ): void {
    if (status === 'running') {
      this.executingCommands.add(commandId);
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      this.executingCommands.delete(commandId);
    }

    const statusMsg: CommandStatus = {
      id: uuidv4(),
      type: 'COMMAND_STATUS',
      timestamp: Date.now(),
      agentId: this.agentId!,
      connectionId: this.connectionId,
      payload: {
        commandId,
        status,
        error,
      },
    };

    this.sendAgentMessage(statusMsg);
  }

  sendTerminalOutput(commandId: string, content: string, isError = false): void {
    const output: TerminalStream = {
      id: uuidv4(),
      type: 'TERMINAL_STREAM',
      timestamp: Date.now(),
      agentId: this.agentId!,
      connectionId: this.connectionId,
      payload: {
        commandId,
        content,
        isError,
        timestamp: Date.now(),
      },
    };

    this.sendAgentMessage(output);
  }

  sendAgentStatus(
    status: 'idle' | 'busy' | 'executing' | 'error',
    currentCommand?: string
  ): void {
    const statusMsg: AgentStatus = {
      id: uuidv4(),
      type: 'AGENT_STATUS',
      timestamp: Date.now(),
      agentId: this.agentId!,
      connectionId: this.connectionId,
      payload: {
        status,
        currentCommand,
        queueLength: 0,
        uptime: 1000,
      },
    };

    this.sendAgentMessage(statusMsg);
  }

  sendTraceEvent(
    commandId: string,
    eventType: string,
    data: Record<string, any>
  ): void {
    const trace: TraceEvent = {
      id: uuidv4(),
      type: 'TRACE_EVENT',
      timestamp: Date.now(),
      agentId: this.agentId!,
      connectionId: this.connectionId,
      payload: {
        commandId,
        eventType,
        data,
        timestamp: Date.now(),
      },
    };

    this.sendAgentMessage(trace);
  }

  async simulateCommandExecution(
    commandId: string,
    output: string[],
    duration = 100
  ): Promise<void> {
    // Send status: running
    this.sendCommandStatus(commandId, 'running');

    // Send output lines
    for (const line of output) {
      this.sendTerminalOutput(commandId, line + '\n');
      await new Promise(resolve => setTimeout(resolve, duration / output.length));
    }

    // Send status: completed
    this.sendCommandStatus(commandId, 'completed');
  }

  async waitForCommand(timeout = 5000): Promise<WebSocketMessage> {
    return this.waitForMessage(
      (msg) => msg.type === 'COMMAND_REQUEST',
      timeout
    );
  }

  async waitForEmergencyStop(timeout = 5000): Promise<WebSocketMessage> {
    return this.waitForMessage(
      (msg) => msg.type === 'EMERGENCY_STOP',
      timeout
    );
  }

  async waitForAgentControl(action: string, timeout = 5000): Promise<WebSocketMessage> {
    return this.waitForMessage(
      (msg) =>
        msg.type === 'AGENT_CONTROL' &&
        (msg.payload as any)?.action === action,
      timeout
    );
  }

  getReceivedCommands(): WebSocketMessage[] {
    return Array.from(this.receivedCommands.values());
  }

  getExecutingCommands(): string[] {
    return Array.from(this.executingCommands);
  }

  clearCommandHistory(): void {
    this.receivedCommands.clear();
    this.executingCommands.clear();
  }
}

// Factory function for quick setup
export async function createMockAgent(
  url: string,
  agentId: string,
  authToken?: string,
  connectionId?: string
): Promise<MockAgentClient> {
  const client = new MockAgentClient(url, agentId, authToken, connectionId);
  await client.connect();
  return client;
}