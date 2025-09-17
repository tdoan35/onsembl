import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface WebSocketMessage {
  type: string;
  id?: string;
  timestamp?: number;
  payload: any;
}

export function createWebSocketClient(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);

    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
  });
}

export function sendWebSocketMessage(ws: WebSocket, message: WebSocketMessage): void {
  const fullMessage = {
    id: message.id || uuidv4(),
    timestamp: message.timestamp || Date.now(),
    ...message,
  };

  ws.send(JSON.stringify(fullMessage));
}

export function waitForMessage(
  ws: WebSocket,
  predicate: (message: WebSocketMessage) => boolean,
  timeout = 5000
): Promise<WebSocketMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      reject(new Error('Timeout waiting for message'));
    }, timeout);

    const messageHandler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (predicate(message)) {
          clearTimeout(timer);
          ws.removeListener('message', messageHandler);
          resolve(message);
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    ws.on('message', messageHandler);
  });
}

export function collectMessages(
  ws: WebSocket,
  count: number,
  timeout = 5000
): Promise<WebSocketMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: WebSocketMessage[] = [];
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      reject(new Error(`Timeout collecting messages. Got ${messages.length}/${count}`));
    }, timeout);

    const messageHandler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        messages.push(message);

        if (messages.length >= count) {
          clearTimeout(timer);
          ws.removeListener('message', messageHandler);
          resolve(messages);
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    ws.on('message', messageHandler);
  });
}

export async function closeWebSocket(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    ws.on('close', () => resolve());
    ws.close();

    // Force close after 1 second
    setTimeout(() => {
      ws.terminate();
      resolve();
    }, 1000);
  });
}