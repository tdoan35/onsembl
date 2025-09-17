import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { pino } from 'pino';

export interface TestServerOptions {
  withAuth?: boolean;
  withWebSocket?: boolean;
  withCors?: boolean;
}

export async function createTestServer(options: TestServerOptions = {}) {
  const server = Fastify({
    logger: pino({ level: 'silent' }),
  });

  // Register CORS if needed
  if (options.withCors !== false) {
    await server.register(cors, {
      origin: true,
      credentials: true,
    });
  }

  // Register WebSocket if needed
  if (options.withWebSocket) {
    await server.register(websocket, {
      options: {
        maxPayload: 1024 * 1024, // 1MB
      },
    });
  }

  // Start server on random port
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  const port = (server.server.address() as any).port;

  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    close: async () => {
      await server.close();
    },
  };
}

export async function withTestServer<T>(
  options: TestServerOptions,
  callback: (ctx: Awaited<ReturnType<typeof createTestServer>>) => Promise<T>
): Promise<T> {
  const ctx = await createTestServer(options);
  try {
    return await callback(ctx);
  } finally {
    await ctx.close();
  }
}