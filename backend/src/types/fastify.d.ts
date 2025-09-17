import { FastifyRequest, FastifyReply } from 'fastify';
import { Services } from '../server';

declare module 'fastify' {
  interface FastifyInstance {
    // Authentication decorators
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateSupabase: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateWebSocket: (connection: any, request: FastifyRequest) => Promise<any>;
    refreshToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

    // Services
    services: Services;
  }

  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role?: string;
      metadata?: any;
    };
    token?: string;
    apiKey?: string;
  }
}

export {};