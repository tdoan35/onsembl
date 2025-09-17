import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { authFixtures } from '../../fixtures/auth';
import { v4 as uuidv4 } from 'uuid';

describe('POST /auth/verify', () => {
  let server: FastifyInstance;
  let validMagicLinkToken: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });

    // Generate a valid magic link token for testing
    validMagicLinkToken = authFixtures.generateMagicLinkToken('test@onsembl.ai');

    // Register the auth verify route
    server.post('/auth/verify', async (request, reply) => {
      const { token } = request.body as { token: string };

      // Validate token presence
      if (!token) {
        return reply.code(401).send({
          error: 'Invalid or expired token',
        });
      }

      // Simulate token verification
      // In production, this would:
      // 1. Look up the token in the database
      // 2. Check if it's expired
      // 3. Verify it matches the user
      // 4. Generate JWT tokens
      // 5. Mark the magic link as used

      // For testing, we'll accept the valid test token
      if (token !== validMagicLinkToken && !token.startsWith('valid-')) {
        return reply.code(401).send({
          error: 'Invalid or expired token',
        });
      }

      // Extract email from token (in real implementation, this would come from DB)
      let email = 'test@onsembl.ai';
      if (token.startsWith('valid-')) {
        // Allow custom email in token for testing
        const parts = token.split('-');
        if (parts.length >= 3) {
          email = parts.slice(2).join('-');
        }
      }

      const userId = uuidv4();
      const now = Math.floor(Date.now() / 1000);

      // Generate access token
      const accessToken = server.jwt.sign({
        userId,
        email,
        type: 'access',
        iat: now,
        exp: now + (60 * 60), // 1 hour
      });

      // Generate refresh token
      const refreshToken = server.jwt.sign({
        userId,
        email,
        type: 'refresh',
        iat: now,
        exp: now + (7 * 24 * 60 * 60), // 7 days
      });

      return reply.code(200).send({
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour in seconds
        user: {
          id: userId,
          email,
          createdAt: new Date().toISOString(),
        },
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should verify valid magic link token and return auth tokens', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: validMagicLinkToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body).toHaveProperty('expiresIn');
      expect(body).toHaveProperty('user');

      // Verify token format (JWT has 3 parts separated by dots)
      expect(body.accessToken.split('.')).toHaveLength(3);
      expect(body.refreshToken.split('.')).toHaveLength(3);

      // Verify expiresIn
      expect(body.expiresIn).toBe(3600);

      // Verify user object
      expect(body.user).toHaveProperty('id');
      expect(body.user).toHaveProperty('email');
      expect(body.user).toHaveProperty('createdAt');
      expect(body.user.email).toBe('test@onsembl.ai');
    });

    it('should return different tokens for each verification', async () => {
      const response1 = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: 'valid-token-user1@example.com',
        },
      });

      const response2 = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: 'valid-token-user2@example.com',
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const body1 = response1.json();
      const body2 = response2.json();

      // Tokens should be unique
      expect(body1.accessToken).not.toBe(body2.accessToken);
      expect(body1.refreshToken).not.toBe(body2.refreshToken);

      // User IDs should be different
      expect(body1.user.id).not.toBe(body2.user.id);
    });

    it('should decode access token correctly', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: validMagicLinkToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Decode the JWT (without verification for testing)
      const [header, payload] = body.accessToken.split('.').slice(0, 2);
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());

      expect(decodedPayload).toHaveProperty('userId');
      expect(decodedPayload).toHaveProperty('email');
      expect(decodedPayload).toHaveProperty('type');
      expect(decodedPayload).toHaveProperty('iat');
      expect(decodedPayload).toHaveProperty('exp');

      expect(decodedPayload.type).toBe('access');
      expect(decodedPayload.email).toBe('test@onsembl.ai');

      // Verify expiration is 1 hour from issuance
      const expirationDiff = decodedPayload.exp - decodedPayload.iat;
      expect(expirationDiff).toBe(3600);
    });
  });

  describe('Error Cases', () => {
    it('should return 401 for missing token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Invalid or expired token',
      });
    });

    it('should return 401 for invalid token', async () => {
      const invalidTokens = [
        'invalid-token',
        'expired-token',
        '12345',
        '',
        ' ',
      ];

      for (const token of invalidTokens) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/verify',
          payload: { token },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Invalid or expired token',
        });
      }
    });

    it('should return 401 for non-string token', async () => {
      const invalidPayloads = [
        { token: 123 },
        { token: true },
        { token: null },
        { token: [] },
        { token: {} },
      ];

      for (const payload of invalidPayloads) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/verify',
          payload,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Invalid or expired token',
        });
      }
    });

    it('should return 401 for malformed token', async () => {
      const malformedTokens = [
        'a'.repeat(1000), // Very long string
        'token\nwith\nnewlines',
        'token<script>alert("XSS")</script>',
        '../../etc/passwd',
      ];

      for (const token of malformedTokens) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/verify',
          payload: { token },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Invalid or expired token',
        });
      }
    });
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for success response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: validMagicLinkToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response matches AuthResponse schema
      expect(body).toHaveProperty('accessToken');
      expect(typeof body.accessToken).toBe('string');

      expect(body).toHaveProperty('refreshToken');
      expect(typeof body.refreshToken).toBe('string');

      expect(body).toHaveProperty('expiresIn');
      expect(typeof body.expiresIn).toBe('number');

      expect(body).toHaveProperty('user');
      expect(typeof body.user).toBe('object');

      // Verify user object structure
      expect(body.user).toHaveProperty('id');
      expect(typeof body.user.id).toBe('string');

      expect(body.user).toHaveProperty('email');
      expect(typeof body.user.email).toBe('string');

      expect(body.user).toHaveProperty('createdAt');
      expect(typeof body.user.createdAt).toBe('string');
    });

    it('should match OpenAPI schema for error response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: { token: 'invalid' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();

      // Verify response matches ErrorResponse schema
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
      expect(Object.keys(body)).toEqual(['error']);
    });

    it('should not require authentication header', async () => {
      // This endpoint should work without Authorization header
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: validMagicLinkToken,
        },
        // No Authorization header
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept application/json content type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          token: validMagicLinkToken,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should not expose token in response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: validMagicLinkToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      const bodyString = JSON.stringify(body);

      // The original magic link token should not appear in response
      expect(bodyString).not.toContain(validMagicLinkToken);
    });

    it('should handle timing attacks consistently', async () => {
      // Measure response time for valid token
      const startValid = Date.now();
      const validResponse = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: validMagicLinkToken,
        },
      });
      const validTime = Date.now() - startValid;

      // Measure response time for invalid token
      const startInvalid = Date.now();
      const invalidResponse = await server.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          token: 'completely-invalid-token',
        },
      });
      const invalidTime = Date.now() - startInvalid;

      expect(validResponse.statusCode).toBe(200);
      expect(invalidResponse.statusCode).toBe(401);

      // Response times should be similar (within 100ms)
      // This prevents timing attacks to determine token validity
      const timeDiff = Math.abs(validTime - invalidTime);
      expect(timeDiff).toBeLessThan(100);
    });

    it('should not allow SQL injection in token field', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "\"; DROP TABLE users; --",
        "1' AND '1'='1' UNION SELECT * FROM users--",
      ];

      for (const token of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/verify',
          payload: { token },
        });

        // Should safely reject as invalid token
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Invalid or expired token',
        });
      }
    });
  });
});