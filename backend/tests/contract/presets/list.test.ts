import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { presetFixtures } from '../../fixtures/presets';
import { v4 as uuidv4 } from 'uuid';

describe('GET /presets', () => {
  let server: FastifyInstance;
  let authToken: string;
  let mockPresets: any[];
  let currentUserId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);
    currentUserId = uuidv4();

    // Create mock presets with different properties
    mockPresets = [
      presetFixtures.createPreset({
        userId: currentUserId,
        name: 'My Code Review',
        isGlobal: false,
        tags: ['review', 'code-quality'],
      }),
      presetFixtures.createPreset({
        userId: currentUserId,
        name: 'My Bug Investigation',
        type: 'INVESTIGATE',
        isGlobal: false,
        tags: ['debug', 'investigation'],
      }),
      presetFixtures.createPreset({
        userId: uuidv4(),
        name: 'Global Security Scan',
        type: 'INVESTIGATE',
        isGlobal: true,
        tags: ['security', 'global'],
      }),
      presetFixtures.createPreset({
        userId: uuidv4(),
        name: 'Global Performance Analysis',
        type: 'REVIEW',
        isGlobal: true,
        tags: ['performance', 'global'],
      }),
      presetFixtures.createPreset({
        userId: uuidv4(),
        name: 'Other User Preset',
        isGlobal: false,
        tags: ['private'],
      }),
    ];

    // Register the list presets route
    server.get('/presets', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      // In production, this would:
      // 1. Get userId from JWT token
      // 2. Query database for user's presets and global presets
      // 3. Filter out other users' private presets
      // 4. Return filtered list

      // Filter presets (user's own + global ones)
      const visiblePresets = mockPresets.filter(preset =>
        preset.userId === currentUserId || preset.isGlobal
      );

      return reply.code(200).send({
        presets: visiblePresets,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should list all visible presets', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('presets');
      expect(Array.isArray(body.presets)).toBe(true);

      // Should include user's presets and global presets, but not other users' private presets
      const visibleCount = mockPresets.filter(p => p.userId === currentUserId || p.isGlobal).length;
      expect(body.presets.length).toBe(visibleCount);
    });

    it('should return empty array when no presets exist', async () => {
      // Temporarily clear presets
      const tempPresets = [...mockPresets];
      mockPresets.length = 0;

      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.presets).toEqual([]);

      // Restore presets
      mockPresets.push(...tempPresets);
    });

    it('should include both user and global presets', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const userPresets = body.presets.filter((p: any) => p.userId === currentUserId);
      const globalPresets = body.presets.filter((p: any) => p.isGlobal);

      expect(userPresets.length).toBeGreaterThan(0);
      expect(globalPresets.length).toBeGreaterThan(0);
    });

    it('should not include other users private presets', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const otherUserPrivatePresets = body.presets.filter((p: any) =>
        p.userId !== currentUserId && !p.isGlobal
      );

      expect(otherUserPrivatePresets.length).toBe(0);
    });

    it('should include all preset types', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const types = new Set(body.presets.map((p: any) => p.type));
      expect(types.size).toBeGreaterThan(1);
    });
  });

  describe('Error Cases', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 401 with invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 401 with malformed authorization header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: 'NotBearer token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('presets');
      expect(Array.isArray(body.presets)).toBe(true);

      // Verify preset structure
      if (body.presets.length > 0) {
        const preset = body.presets[0];

        // Required fields
        expect(preset).toHaveProperty('id');
        expect(typeof preset.id).toBe('string');

        expect(preset).toHaveProperty('userId');
        expect(typeof preset.userId).toBe('string');

        expect(preset).toHaveProperty('name');
        expect(typeof preset.name).toBe('string');

        expect(preset).toHaveProperty('content');
        expect(typeof preset.content).toBe('string');

        expect(preset).toHaveProperty('type');
        expect(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']).toContain(preset.type);

        // Optional fields
        if (preset.description !== undefined) {
          expect(typeof preset.description).toBe('string');
        }

        if (preset.targetAgentTypes !== undefined) {
          expect(Array.isArray(preset.targetAgentTypes)).toBe(true);
        }

        if (preset.variables !== undefined) {
          expect(Array.isArray(preset.variables)).toBe(true);
        }

        expect(preset).toHaveProperty('createdAt');
        expect(typeof preset.createdAt).toBe('string');
      }
    });

    it('should return valid preset objects', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.presets.forEach((preset: any) => {
        // Validate UUIDs
        expect(preset.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(preset.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        // Validate variables structure if present
        if (preset.variables && preset.variables.length > 0) {
          preset.variables.forEach((variable: any) => {
            expect(variable).toHaveProperty('name');
            expect(typeof variable.name).toBe('string');

            if (variable.description !== undefined) {
              expect(typeof variable.description).toBe('string');
            }

            if (variable.default !== undefined) {
              expect(typeof variable.default).toBe('string');
            }
          });
        }

        // Validate dates
        expect(new Date(preset.createdAt).toISOString()).toBe(preset.createdAt);
        if (preset.updatedAt) {
          expect(new Date(preset.updatedAt).toISOString()).toBe(preset.updatedAt);
        }
      });
    });
  });

  describe('Security', () => {
    it('should not expose sensitive preset data', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.presets.forEach((preset: any) => {
        // Should not include internal fields
        expect(preset).not.toHaveProperty('_internalId');
        expect(preset).not.toHaveProperty('deletedAt');
        expect(preset).not.toHaveProperty('encryptedData');
      });
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(5).fill(null).map(() =>
        server.inject({
          method: 'GET',
          url: '/presets',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveProperty('presets');
      });
    });
  });

  describe('Business Logic', () => {
    it('should sort presets by creation date', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      if (body.presets.length > 1) {
        for (let i = 1; i < body.presets.length; i++) {
          const prevDate = new Date(body.presets[i - 1].createdAt);
          const currDate = new Date(body.presets[i].createdAt);
          expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
        }
      }
    });

    it('should handle presets with template variables', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const presetsWithVariables = body.presets.filter((p: any) =>
        p.variables && p.variables.length > 0
      );

      expect(presetsWithVariables.length).toBeGreaterThan(0);

      presetsWithVariables.forEach((preset: any) => {
        // Content should contain variable placeholders
        preset.variables.forEach((variable: any) => {
          const placeholder = `{{${variable.name}}}`;
          expect(preset.content).toContain(placeholder);
        });
      });
    });

    it('should filter presets by visibility rules', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // All returned presets should be either:
      // 1. Owned by current user
      // 2. Global presets
      body.presets.forEach((preset: any) => {
        const isOwned = preset.userId === currentUserId;
        const isGlobal = preset.isGlobal === true;
        expect(isOwned || isGlobal).toBe(true);
      });
    });
  });
});