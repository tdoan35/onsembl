import { FastifyInstance } from 'fastify';
import { AgentWebSocketHandler } from './agent-handler';
import { DashboardWebSocketHandler } from './dashboard-handler';

export async function setupWebSocket(fastify: FastifyInstance) {
  const agentHandler = new AgentWebSocketHandler(fastify);
  const dashboardHandler = new DashboardWebSocketHandler(fastify);

  // Agent WebSocket endpoint
  fastify.register(async function (server) {
    server.get('/ws/agent', { websocket: true }, (connection, request) => {
      agentHandler.handleConnection(connection, request);
    });
  });

  // Dashboard WebSocket endpoint
  fastify.register(async function (server) {
    server.get('/ws/dashboard', { websocket: true }, (connection, request) => {
      dashboardHandler.handleConnection(connection, request);
    });
  });

  fastify.log.info('WebSocket handlers registered');
}