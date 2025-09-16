import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { pino } from 'pino';
import { v4 as uuidv4 } from 'uuid';

interface TestServerOptions {
  withAuth?: boolean;
  withCors?: boolean;
  logLevel?: string;
}

export function createTestServer(options: TestServerOptions = {}): FastifyInstance {
  const {
    withAuth = true,
    withCors = true,
    logLevel = 'silent',
  } = options;

  const server = Fastify({
    logger: pino({ level: logLevel }),
    disableRequestLogging: true,
  });

  // Register plugins
  if (withCors) {
    server.register(cors, {
      origin: true,
      credentials: true,
    });
  }

  if (withAuth) {
    server.register(jwt, {
      secret: process.env.JWT_SECRET || 'test-secret-key',
    });

    // Add authentication decorator
    server.decorate('authenticate', async function (request: any, reply: any) {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    });
  }

  return server;
}

export function generateTestToken(server: FastifyInstance, payload: any = {}): string {
  const defaultPayload = {
    userId: uuidv4(),
    email: 'test@onsembl.ai',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
  };

  return server.jwt.sign({ ...defaultPayload, ...payload });
}

export async function closeTestServer(server: FastifyInstance): Promise<void> {
  await server.close();
}