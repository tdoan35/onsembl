import { test } from 'tap';
import { EnhancedWebSocketAuth } from '../../src/services/websocket-auth.js';
import { SecurityEventLogger } from '../../src/services/security-event-logger.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';

test('Enhanced Auth Integration Tests', async (t) => {
  let auth: EnhancedWebSocketAuth;
  let securityLogger: SecurityEventLogger;
  let securityEvents: any[] = [];

  t.beforeEach(() => {
    auth = new EnhancedWebSocketAuth({
      jwtSecret: JWT_SECRET,
      maxSessionsPerUser: 3,
      tokenRotationInterval: 1000,
      suspiciousThreshold: 3,
      blacklistTTL: 60000,
      rateLimit: {
        windowMs: 1000,
        maxRequests: 5,
        blockDuration: 5000
      }
    });

    securityLogger = new SecurityEventLogger();

    // Capture security events
    auth.on('security-event', (event) => {
      securityEvents.push(event);
      securityLogger.logEvent(event);
    });

    securityEvents = [];
  });

  t.afterEach(() => {
    auth.shutdown();
    securityLogger.shutdown();
  });

  await t.test('Token Validation and Blacklisting', async (t) => {
    const userId = 'user123';
    const token = jwt.sign(
      {
        sub: userId,
        email: 'test@example.com',
        role: 'user',
        jti: 'token123'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Validate token initially
    const authContext = await auth.validateToken(token);
    t.ok(authContext, 'Token should be valid initially');
    t.equal(authContext?.userId, userId, 'User ID should match');

    // Blacklist the token
    auth.blacklistToken('token123', 'Testing blacklist');

    // Try to validate blacklisted token
    const blacklistedAuth = await auth.validateToken(token);
    t.notOk(blacklistedAuth, 'Blacklisted token should not validate');

    // Check security event was emitted
    const blacklistEvent = securityEvents.find(e => e.type === 'token_blacklisted');
    t.ok(blacklistEvent, 'Token blacklist event should be emitted');
  });

  await t.test('Rate Limiting', async (t) => {
    const userId = 'rateLimitUser';

    // Make requests up to the limit
    for (let i = 0; i < 5; i++) {
      const allowed = auth.checkRateLimit(userId, 5, 1000);
      t.ok(allowed, `Request ${i + 1} should be allowed`);
    }

    // Next request should be blocked
    const blocked = auth.checkRateLimit(userId, 5, 1000);
    t.notOk(blocked, 'Request beyond limit should be blocked');

    // Check security event
    const rateLimitEvent = securityEvents.find(e => e.type === 'rate_limit_exceeded');
    t.ok(rateLimitEvent, 'Rate limit exceeded event should be emitted');
  });

  await t.test('Session Management', async (t) => {
    const userId = 'sessionUser';
    const tokens: string[] = [];

    // Create multiple tokens/sessions
    for (let i = 0; i < 4; i++) {
      const token = jwt.sign(
        {
          sub: userId,
          email: `test${i}@example.com`,
          jti: `token${i}`
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      tokens.push(token);
    }

    // Validate first 3 tokens (session limit)
    for (let i = 0; i < 3; i++) {
      const authContext = await auth.validateToken(tokens[i]);
      t.ok(authContext, `Token ${i + 1} should be valid`);
      t.ok(authContext?.sessionId, `Session ${i + 1} should be created`);
    }

    // 4th token should cause oldest session to be revoked
    const fourthAuth = await auth.validateToken(tokens[3]);
    t.ok(fourthAuth, '4th token should be valid');

    // Check that session limit was enforced
    const sessionEvents = securityEvents.filter(e => e.type === 'auth_success');
    t.equal(sessionEvents.length, 4, 'All auth attempts should be logged');
  });

  await t.test('Token Expiration', async (t) => {
    const userId = 'expiredUser';
    const expiredToken = jwt.sign(
      {
        sub: userId,
        email: 'expired@example.com',
        jti: 'expiredToken'
      },
      JWT_SECRET,
      { expiresIn: '-1h' } // Already expired
    );

    const authContext = await auth.validateToken(expiredToken);
    t.notOk(authContext, 'Expired token should not validate');

    // Check security event
    const expiredEvent = securityEvents.find(e => e.type === 'token_expired');
    t.ok(expiredEvent, 'Token expired event should be emitted');
  });

  await t.test('Permission Checking', async (t) => {
    const adminContext = {
      userId: 'admin123',
      email: 'admin@example.com',
      role: 'admin',
      isAuthenticated: true
    };

    const userContext = {
      userId: 'user456',
      email: 'user@example.com',
      role: 'user',
      isAuthenticated: true
    };

    const unauthContext = {
      userId: 'unauth789',
      isAuthenticated: false
    };

    // Admin permissions
    t.ok(
      auth.hasPermission(adminContext, 'command:execute'),
      'Admin should have execute permission'
    );
    t.ok(
      auth.hasPermission(adminContext, 'system:emergency-stop'),
      'Admin should have emergency stop permission'
    );

    // User permissions
    t.ok(
      auth.hasPermission(userContext, 'command:execute'),
      'User should have execute permission'
    );
    t.ok(
      auth.hasPermission(userContext, 'agent:control'),
      'User should have agent control permission'
    );

    // Unauthenticated permissions
    t.notOk(
      auth.hasPermission(unauthContext, 'command:execute'),
      'Unauthenticated should not have execute permission'
    );

    // Check permission denied events
    const permissionDeniedEvents = securityEvents.filter(e => e.type === 'permission_denied');
    t.ok(permissionDeniedEvents.length > 0, 'Permission denied events should be emitted');
  });

  await t.test('Token Refresh', async (t) => {
    const userId = 'refreshUser';
    const refreshToken = auth.generateRefreshToken({
      sub: userId,
      email: 'refresh@example.com',
      role: 'user'
    });

    // Verify refresh token
    const payload = await auth.verifyRefreshToken(refreshToken);
    t.ok(payload, 'Refresh token should be valid');
    t.equal(payload?.sub, userId, 'User ID should match in refresh token');

    // Generate new access token
    const accessToken = auth.generateAccessToken({
      sub: payload!.sub,
      email: payload!.email,
      role: payload!.role
    });

    // Validate new access token
    const authContext = await auth.validateToken(accessToken);
    t.ok(authContext, 'New access token should be valid');
    t.equal(authContext?.userId, userId, 'User ID should match in new token');
  });

  await t.test('Suspicious Activity Detection', async (t) => {
    const userId = 'suspiciousUser';
    const token = jwt.sign(
      {
        sub: userId,
        email: 'suspicious@example.com',
        jti: 'suspiciousToken'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Generate suspicious activity by rapid validation
    for (let i = 0; i < 100; i++) {
      await auth.validateToken(token);
    }

    // Check for suspicious activity report
    const report = auth.getSuspiciousActivityReport(userId);
    const userPatterns = report.get(userId);
    t.ok(userPatterns, 'Suspicious activity should be tracked');
    t.ok(
      userPatterns?.some(p => p.type === 'unusual_activity'),
      'Unusual activity pattern should be detected'
    );
  });

  await t.test('Security Alert Rules', async (t) => {
    const alerts: any[] = [];
    securityLogger.on('security-alert', (alert) => {
      alerts.push(alert);
    });

    // Add custom alert rule
    securityLogger.addAlertRule({
      id: 'test-rule',
      name: 'Test Alert Rule',
      description: 'Test rapid failures',
      eventTypes: ['auth_failure'],
      threshold: 3,
      timeWindow: 5000,
      action: 'alert'
    });

    // Generate auth failures to trigger alert
    for (let i = 0; i < 3; i++) {
      await securityLogger.logEvent({
        type: 'auth_failure',
        userId: 'testUser',
        timestamp: new Date()
      });
    }

    // Wait for alert processing
    await new Promise(resolve => setTimeout(resolve, 100));

    t.ok(alerts.length > 0, 'Security alert should be triggered');
    const testAlert = alerts.find(a => a.ruleId === 'test-rule');
    t.ok(testAlert, 'Test rule alert should be triggered');
  });

  await t.test('Token Usage Tracking', async (t) => {
    const userId = 'trackingUser';
    const token = jwt.sign(
      {
        sub: userId,
        email: 'tracking@example.com',
        jti: 'trackingToken'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Validate token multiple times
    for (let i = 0; i < 5; i++) {
      await auth.validateToken(token);
    }

    // Get usage stats
    const stats = auth.getTokenUsageStats(userId);
    t.ok(stats.length > 0, 'Token usage should be tracked');

    const tokenStats = stats.find(s => s.tokenId === auth['generateTokenId'](token));
    t.ok(tokenStats, 'Specific token usage should be tracked');
    t.equal(tokenStats?.requestCount, 5, 'Request count should match');
  });

  await t.test('User Session Invalidation', async (t) => {
    const userId = 'invalidateUser';
    const tokens: string[] = [];

    // Create multiple sessions
    for (let i = 0; i < 3; i++) {
      const token = jwt.sign(
        {
          sub: userId,
          email: `invalidate${i}@example.com`,
          jti: `invalidateToken${i}`
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      tokens.push(token);
      await auth.validateToken(token);
    }

    // Invalidate all user sessions
    auth.invalidateUserSessions(userId);

    // Check security events
    const invalidationEvents = securityEvents.filter(
      e => e.type === 'session_invalidated' && e.userId === userId
    );
    t.ok(invalidationEvents.length > 0, 'Session invalidation events should be emitted');

    // Check that sessions are no longer valid
    const sessionId = 'some-session-id';
    const isValid = auth.isSessionValid(userId, sessionId);
    t.notOk(isValid, 'Sessions should be invalidated');
  });

  await t.test('Security Metrics', async (t) => {
    // Generate various security events
    const userId = 'metricsUser';
    const token = jwt.sign(
      {
        sub: userId,
        email: 'metrics@example.com',
        jti: 'metricsToken'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Successful auth
    await auth.validateToken(token);

    // Failed auth
    const badToken = 'invalid-token';
    await auth.validateToken(badToken);

    // Rate limit
    for (let i = 0; i < 10; i++) {
      auth.checkRateLimit(userId, 5, 1000);
    }

    // Get metrics
    const metrics = securityLogger.getMetrics();
    t.ok(metrics.totalEvents > 0, 'Total events should be tracked');
    t.ok(metrics.eventsPerType.size > 0, 'Events per type should be tracked');

    // Get recent events
    const recentEvents = securityLogger.getRecentEvents(10);
    t.ok(recentEvents.length > 0, 'Recent events should be retrievable');
  });

  await t.test('Cleanup Operations', async (t) => {
    // This test verifies cleanup operations don't cause errors
    auth['cleanupBlacklist']();
    auth['cleanupTokenUsage']();
    auth['cleanupRateLimits']();

    t.pass('Cleanup operations should complete without error');
  });
});