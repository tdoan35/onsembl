import { WebSocketTestClient } from './websocket-client.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  DashboardMessage,
  WebSocketMessage,
  CommandRequest,
  CommandCancel,
  AgentControl,
  EmergencyStop,
} from '@onsembl/agent-protocol';

export class MockDashboardClient extends WebSocketTestClient {
  private commandsSent: Map<string, CommandRequest> = new Map();
  private receivedStatuses: Map<string, WebSocketMessage[]> = new Map();

  constructor(url: string, authToken?: string, connectionId?: string) {
    super({
      url,
      connectionType: 'dashboard',
      authToken,
      connectionId: connectionId || uuidv4(),
    });

    // Track command responses
    this.onMessage('COMMAND_STATUS', (msg) => {
      const commandId = (msg.payload as any)?.commandId;
      if (commandId) {
        const statuses = this.receivedStatuses.get(commandId) || [];
        statuses.push(msg);
        this.receivedStatuses.set(commandId, statuses);
      }
    });

    this.onMessage('TERMINAL_STREAM', (msg) => {
      const commandId = (msg.payload as any)?.commandId;
      if (commandId) {
        const statuses = this.receivedStatuses.get(commandId) || [];
        statuses.push(msg);
        this.receivedStatuses.set(commandId, statuses);
      }
    });
  }

  sendCommandRequest(agentId: string, command: string, args?: string[]): string {
    const commandId = uuidv4();
    const request: CommandRequest = {
      id: uuidv4(),
      type: 'COMMAND_REQUEST',
      timestamp: Date.now(),
      connectionId: this.connectionId,
      payload: {
        agentId,
        commandId,
        command,
        args: args || [],
      },
    };

    this.commandsSent.set(commandId, request);
    this.sendDashboardMessage(request);
    return commandId;
  }

  sendCommandCancel(agentId: string, commandId: string): void {
    const cancel: CommandCancel = {
      id: uuidv4(),
      type: 'COMMAND_CANCEL',
      timestamp: Date.now(),
      connectionId: this.connectionId,
      payload: {
        agentId,
        commandId,
      },
    };

    this.sendDashboardMessage(cancel);
  }

  sendAgentControl(agentId: string, action: 'start' | 'stop' | 'restart'): void {
    const control: AgentControl = {
      id: uuidv4(),
      type: 'AGENT_CONTROL',
      timestamp: Date.now(),
      connectionId: this.connectionId,
      payload: {
        agentId,
        action,
      },
    };

    this.sendDashboardMessage(control);
  }

  sendEmergencyStop(reason?: string): void {
    const stop: EmergencyStop = {
      id: uuidv4(),
      type: 'EMERGENCY_STOP',
      timestamp: Date.now(),
      connectionId: this.connectionId,
      payload: {
        reason: reason || 'Emergency stop triggered by test',
      },
    };

    this.sendDashboardMessage(stop);
  }

  async waitForCommandStatus(commandId: string, status: string, timeout = 5000): Promise<WebSocketMessage> {
    return this.waitForMessage(
      (msg) =>
        msg.type === 'COMMAND_STATUS' &&
        (msg.payload as any)?.commandId === commandId &&
        (msg.payload as any)?.status === status,
      timeout
    );
  }

  async waitForTerminalOutput(commandId: string, timeout = 5000): Promise<WebSocketMessage> {
    return this.waitForMessage(
      (msg) =>
        msg.type === 'TERMINAL_STREAM' &&
        (msg.payload as any)?.commandId === commandId,
      timeout
    );
  }

  getCommandsSent(): CommandRequest[] {
    return Array.from(this.commandsSent.values());
  }

  getResponsesForCommand(commandId: string): WebSocketMessage[] {
    return this.receivedStatuses.get(commandId) || [];
  }

  clearCommandHistory(): void {
    this.commandsSent.clear();
    this.receivedStatuses.clear();
  }
}

// Factory function for quick setup
export async function createMockDashboard(
  url: string,
  authToken?: string,
  connectionId?: string
): Promise<MockDashboardClient> {
  const client = new MockDashboardClient(url, authToken, connectionId);
  await client.connect();
  return client;
}