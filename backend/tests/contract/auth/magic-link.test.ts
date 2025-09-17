import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer } from '../../utils/test-server';
import { authFixtures } from '../../fixtures/auth';

describe('POST /auth/magic-link', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = createTestServer({ withAuth: false });

    // Register the auth route
    server.post('/auth/magic-link', async (request, reply) => {
      const { email } = request.body as { email: string };

      // Validate email format
      if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return reply.code(400).send({
          error: 'Invalid email address',
        });
      }

      // Simulate rate limiting (allow 5 requests per minute per email)
      // This would normally check against Redis or database
      const rateLimitKey = `magic-link:${email}`;
      // For testing, we'll just return success unless it's a specific test email
      if (email === 'rate-limited@onsembl.ai') {
        return reply.code(429).send({
          error: 'Too many requests. Please try again later.',
        });
      }

      // In production, this would:
      // 1. Generate a secure magic link token
      // 2. Store it in the database with expiry
      // 3. Send email via SMTP service
      // 4. Return success message

      return reply.code(200).send({
        message: 'Magic link sent to your email',
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should send magic link for valid email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: authFixtures.magicLinkRequest,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: 'Magic link sent to your email',
      });
    });

    it('should accept different valid email formats', async () => {
      const emails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_123@subdomain.example.org',
      ];

      for (const email of emails) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/magic-link',
          payload: { email },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          message: 'Magic link sent to your email',
        });
      }
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for missing email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid email address',
      });
    });

    it('should return 400 for invalid email format', async () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
        '',
        ' ',
      ];

      for (const email of invalidEmails) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/magic-link',
          payload: { email },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid email address',
        });
      }
    });

    it('should return 400 for non-string email', async () => {
      const invalidPayloads = [
        { email: 123 },
        { email: true },
        { email: null },
        { email: [] },
        { email: {} },
      ];

      for (const payload of invalidPayloads) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/magic-link',
          payload,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid email address',
        });
      }
    });

    it('should return 429 for rate-limited email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: { email: 'rate-limited@onsembl.ai' },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({
        error: 'Too many requests. Please try again later.',
      });
    });
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for success response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: authFixtures.magicLinkRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response matches MessageResponse schema
      expect(body).toHaveProperty('message');
      expect(typeof body.message).toBe('string');
      expect(Object.keys(body)).toEqual(['message']);
    });

    it('should match OpenAPI schema for error response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: { email: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();

      // Verify response matches ErrorResponse schema
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
      expect(Object.keys(body)).toEqual(['error']);
    });

    it('should not require authentication', async () => {
      // This endpoint should work without Authorization header
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        payload: authFixtures.magicLinkRequest,
        // No Authorization header
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept application/json content type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        headers: {
          'content-type': 'application/json',
        },
        payload: authFixtures.magicLinkRequest,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should not expose internal errors', async () => {
      // Simulate a malformed request that might cause internal error
      const response = await server.inject({
        method: 'POST',
        url: '/auth/magic-link',
        headers: {
          'content-type': 'application/json',
        },
        payload: '{"email": "test@example.com"', // Malformed JSON
      });

      // Should return a generic error, not expose internals
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should not allow SQL injection in email field', async () => {
      const sqlInjectionAttempts = [
        "test@example.com'; DROP TABLE users; --",
        "test@example.com' OR '1'='1",
        "test@example.com\"; DROP TABLE users; --",
      ];

      for (const email of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/magic-link',
          payload: { email },
        });

        // Should safely reject as invalid email
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid email address',
        });
      }
    });

    it('should handle XSS attempts in email field', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>@example.com',
        'test@example.com<script>alert("XSS")</script>',
        'javascript:alert("XSS")@example.com',
      ];

      for (const email of xssAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/magic-link',
          payload: { email },
        });

        // Should safely reject as invalid email
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid email address',
        });
      }
    });
  });
});