import { test } from 'tap';
import { build } from '../../../src/app.js';
import { FastifyInstance } from 'fastify';

test('Protected endpoints contract tests', async (t) => {
  let app: FastifyInstance;

  t.beforeEach(async () => {
    app = await build({ logger: false });
    await app.ready();
  });

  t.afterEach(async () => {
    await app.close();
  });

  t.test('GET /agents requires authentication', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agents',
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
    t.match(body.message, /token|authentication|unauthorized/i);
  });

  t.test('GET /commands requires authentication', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/commands',
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
    t.match(body.message, /token|authentication|unauthorized/i);
  });

  t.test('filters agents by authenticated user', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Should return an array (possibly empty for new users)
    t.has(body, 'agents');
    t.type(body.agents, 'Array');

    // If there are agents, they should belong to the authenticated user
    if (body.agents.length > 0) {
      const agent = body.agents[0];
      t.has(agent, 'id');
      t.has(agent, 'user_id');
      t.has(agent, 'name');
      t.has(agent, 'type');
      t.has(agent, 'status');
      t.has(agent, 'created_at');

      // All agents should have the same user_id (the authenticated user)
      const userId = agent.user_id;
      for (const a of body.agents) {
        t.equal(a.user_id, userId, 'All agents should belong to the same user');
      }
    }
  });

  t.test('filters commands by authenticated user', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/commands',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Should return an array (possibly empty for new users)
    t.has(body, 'commands');
    t.type(body.commands, 'Array');

    // If there are commands, they should belong to the authenticated user
    if (body.commands.length > 0) {
      const command = body.commands[0];
      t.has(command, 'id');
      t.has(command, 'user_id');
      t.has(command, 'agent_id');
      t.has(command, 'type');
      t.has(command, 'status');
      t.has(command, 'created_at');

      // All commands should have the same user_id
      const userId = command.user_id;
      for (const cmd of body.commands) {
        t.equal(cmd.user_id, userId, 'All commands should belong to the same user');
      }
    }
  });

  t.test('returns empty array for new users', async (t) => {
    const newUserToken = process.env['TEST_JWT_TOKEN_NEW_USER'];
    if (!newUserToken) {
      t.skip('TEST_JWT_TOKEN_NEW_USER not set');
      return;
    }

    // Test agents endpoint
    const agentsResponse = await app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: {
        authorization: `Bearer ${newUserToken}`,
      },
    });

    t.equal(agentsResponse.statusCode, 200);
    const agentsBody = JSON.parse(agentsResponse.body);
    t.has(agentsBody, 'agents');
    t.same(agentsBody.agents, [], 'New user should have no agents');

    // Test commands endpoint
    const commandsResponse = await app.inject({
      method: 'GET',
      url: '/api/commands',
      headers: {
        authorization: `Bearer ${newUserToken}`,
      },
    });

    t.equal(commandsResponse.statusCode, 200);
    const commandsBody = JSON.parse(commandsResponse.body);
    t.has(commandsBody, 'commands');
    t.same(commandsBody.commands, [], 'New user should have no commands');
  });

  t.test('POST /agents requires authentication', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Agent',
        type: 'claude',
      }),
    });

    t.equal(response.statusCode, 401);
  });

  t.test('POST /commands requires authentication', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/commands',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: 'some-agent-id',
        type: 'execute',
        payload: {},
      }),
    });

    t.equal(response.statusCode, 401);
  });

  t.test('respects query parameters with authentication', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    // Test limit parameter
    const response = await app.inject({
      method: 'GET',
      url: '/api/commands?limit=5',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    t.has(body, 'commands');
    t.ok(body.commands.length <= 5, 'Should respect limit parameter');
  });

  t.test('rejects requests with expired tokens', async (t) => {
    const expiredToken = process.env['TEST_JWT_TOKEN_EXPIRED'];
    if (!expiredToken) {
      // Create a fake expired token for testing
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxNTE2MjM5MDIyfQ.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ';

      const response = await app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      t.equal(response.statusCode, 401);
    }
  });
});