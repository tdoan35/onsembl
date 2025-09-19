import { EventEmitter } from 'events';
import pino from 'pino';
import { DatabaseAdapter } from '../database/adapter.js';
import type { SecurityEvent } from './websocket-auth.js';

const logger = pino({ name: 'security-event-logger' });

export interface SecurityAlertRule {
  id: string;
  name: string;
  description: string;
  eventTypes: string[];
  threshold: number;
  timeWindow: number; // milliseconds
  action: 'log' | 'alert' | 'block';
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsPerType: Map<string, number>;
  suspiciousActivities: number;
  blockedTokens: number;
  revokedSessions: number;
  lastUpdated: Date;
}

export class SecurityEventLogger extends EventEmitter {
  private db: DatabaseAdapter | null;
  private events: SecurityEvent[] = [];
  private alertRules: Map<string, SecurityAlertRule> = new Map();
  private metrics: SecurityMetrics;
  private metricsUpdateInterval: NodeJS.Timeout;

  constructor(db?: DatabaseAdapter) {
    super();
    this.db = db || null;

    this.metrics = {
      totalEvents: 0,
      eventsPerType: new Map(),
      suspiciousActivities: 0,
      blockedTokens: 0,
      revokedSessions: 0,
      lastUpdated: new Date()
    };

    // Initialize default alert rules
    this.initializeDefaultRules();

    // Start metrics update interval
    this.metricsUpdateInterval = setInterval(() => this.updateMetrics(), 60000);

    logger.info('Security event logger initialized');
  }

  /**
   * Initialize default security alert rules
   */
  private initializeDefaultRules(): void {
    // Rapid authentication failures
    this.addAlertRule({
      id: 'rapid-auth-failures',
      name: 'Rapid Authentication Failures',
      description: 'Multiple authentication failures from same user',
      eventTypes: ['auth_failure'],
      threshold: 5,
      timeWindow: 300000, // 5 minutes
      action: 'alert'
    });

    // Token blacklist surge
    this.addAlertRule({
      id: 'blacklist-surge',
      name: 'Token Blacklist Surge',
      description: 'Unusual number of tokens being blacklisted',
      eventTypes: ['token_blacklisted'],
      threshold: 10,
      timeWindow: 600000, // 10 minutes
      action: 'alert'
    });

    // Rate limit violations
    this.addAlertRule({
      id: 'rate-limit-violations',
      name: 'Rate Limit Violations',
      description: 'Multiple rate limit violations',
      eventTypes: ['rate_limit_exceeded'],
      threshold: 10,
      timeWindow: 60000, // 1 minute
      action: 'block'
    });

    // Suspicious activity pattern
    this.addAlertRule({
      id: 'suspicious-pattern',
      name: 'Suspicious Activity Pattern',
      description: 'Pattern of suspicious activities detected',
      eventTypes: ['suspicious_activity'],
      threshold: 3,
      timeWindow: 300000, // 5 minutes
      action: 'block'
    });

    // Session invalidation surge
    this.addAlertRule({
      id: 'session-invalidation-surge',
      name: 'Session Invalidation Surge',
      description: 'Multiple sessions being invalidated',
      eventTypes: ['session_invalidated'],
      threshold: 10,
      timeWindow: 300000, // 5 minutes
      action: 'alert'
    });
  }

  /**
   * Add a new alert rule
   */
  addAlertRule(rule: SecurityAlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info({ ruleId: rule.id, ruleName: rule.name }, 'Alert rule added');
  }

  /**
   * Log a security event
   */
  async logEvent(event: SecurityEvent): Promise<void> {
    // Store in memory
    this.events.push(event);

    // Update metrics
    this.metrics.totalEvents++;
    const typeCount = this.metrics.eventsPerType.get(event.type) || 0;
    this.metrics.eventsPerType.set(event.type, typeCount + 1);

    // Update specific metrics
    switch (event.type) {
      case 'suspicious_activity':
        this.metrics.suspiciousActivities++;
        break;
      case 'token_blacklisted':
        this.metrics.blockedTokens++;
        break;
      case 'session_invalidated':
        this.metrics.revokedSessions++;
        break;
    }

    // Log based on severity
    const logData = {
      type: event.type,
      userId: event.userId,
      tokenId: event.tokenId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      details: event.details,
      timestamp: event.timestamp
    };

    if (this.isCriticalEvent(event.type)) {
      logger.error(logData, `CRITICAL SECURITY EVENT: ${event.type}`);
    } else if (this.isWarningEvent(event.type)) {
      logger.warn(logData, `Security warning: ${event.type}`);
    } else {
      logger.info(logData, `Security event: ${event.type}`);
    }

    // Persist to database
    if (this.db) {
      try {
        await this.db.query(
          `INSERT INTO security_events
           (event_type, user_id, token_id, session_id, ip_address, user_agent, details, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            event.type,
            event.userId || null,
            event.tokenId || null,
            event.sessionId || null,
            event.ipAddress || null,
            event.userAgent || null,
            JSON.stringify(event.details || {}),
            event.timestamp
          ]
        );
      } catch (err) {
        logger.error({ err, event }, 'Failed to persist security event to database');
      }
    }

    // Check alert rules
    await this.checkAlertRules(event);

    // Emit for real-time monitoring
    this.emit('security-event', event);

    // Cleanup old events (keep last 10000)
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000);
    }
  }

  /**
   * Check if event triggers any alert rules
   */
  private async checkAlertRules(event: SecurityEvent): Promise<void> {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.eventTypes.includes(event.type)) continue;

      // Count events matching this rule in the time window
      const windowStart = Date.now() - rule.timeWindow;
      const matchingEvents = this.events.filter(e =>
        rule.eventTypes.includes(e.type) &&
        e.timestamp.getTime() > windowStart &&
        e.userId === event.userId
      );

      if (matchingEvents.length >= rule.threshold) {
        await this.triggerAlert(rule, event, matchingEvents);
      }
    }
  }

  /**
   * Trigger a security alert
   */
  private async triggerAlert(
    rule: SecurityAlertRule,
    triggeringEvent: SecurityEvent,
    matchingEvents: SecurityEvent[]
  ): Promise<void> {
    const alert = {
      ruleId: rule.id,
      ruleName: rule.name,
      description: rule.description,
      action: rule.action,
      triggeringEvent,
      matchingEventsCount: matchingEvents.length,
      threshold: rule.threshold,
      timeWindow: rule.timeWindow,
      timestamp: new Date()
    };

    logger.error(alert, `SECURITY ALERT TRIGGERED: ${rule.name}`);

    // Emit alert
    this.emit('security-alert', alert);

    // Persist alert
    if (this.db) {
      try {
        await this.db.query(
          `INSERT INTO security_alerts
           (rule_id, rule_name, action, user_id, event_count, threshold, details, triggered_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            rule.id,
            rule.name,
            rule.action,
            triggeringEvent.userId || null,
            matchingEvents.length,
            rule.threshold,
            JSON.stringify(alert),
            new Date()
          ]
        );
      } catch (err) {
        logger.error({ err, alert }, 'Failed to persist security alert');
      }
    }

    // Take action based on rule
    switch (rule.action) {
      case 'block':
        this.emit('block-user', {
          userId: triggeringEvent.userId,
          reason: rule.name,
          alert
        });
        break;

      case 'alert':
        // Send notification (could integrate with PagerDuty, Slack, etc.)
        this.sendNotification(alert);
        break;

      case 'log':
        // Already logged above
        break;
    }
  }

  /**
   * Send security notification
   */
  private sendNotification(alert: any): void {
    // In production, integrate with notification service
    // For now, just log
    logger.warn({ alert }, 'NOTIFICATION: Security alert requires attention');

    // Could send to:
    // - PagerDuty
    // - Slack
    // - Email
    // - SMS
  }

  /**
   * Determine if event type is critical
   */
  private isCriticalEvent(type: string): boolean {
    const criticalTypes = [
      'suspicious_activity',
      'token_blacklisted',
      'session_invalidated',
      'permission_denied'
    ];
    return criticalTypes.includes(type);
  }

  /**
   * Determine if event type is warning level
   */
  private isWarningEvent(type: string): boolean {
    const warningTypes = [
      'auth_failure',
      'token_expired',
      'rate_limit_exceeded'
    ];
    return warningTypes.includes(type);
  }

  /**
   * Get security metrics
   */
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100, userId?: string): SecurityEvent[] {
    let events = [...this.events].reverse();

    if (userId) {
      events = events.filter(e => e.userId === userId);
    }

    return events.slice(0, limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: string, limit: number = 100): SecurityEvent[] {
    return this.events
      .filter(e => e.type === type)
      .slice(-limit);
  }

  /**
   * Generate security report
   */
  async generateReport(startDate: Date, endDate: Date): Promise<any> {
    const events = this.events.filter(e =>
      e.timestamp >= startDate && e.timestamp <= endDate
    );

    const report = {
      period: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalEvents: events.length,
        uniqueUsers: new Set(events.map(e => e.userId).filter(Boolean)).size,
        criticalEvents: events.filter(e => this.isCriticalEvent(e.type)).length,
        warningEvents: events.filter(e => this.isWarningEvent(e.type)).length
      },
      eventBreakdown: new Map<string, number>(),
      topUsers: new Map<string, number>(),
      alerts: []
    };

    // Event breakdown
    events.forEach(e => {
      const count = report.eventBreakdown.get(e.type) || 0;
      report.eventBreakdown.set(e.type, count + 1);

      if (e.userId) {
        const userCount = report.topUsers.get(e.userId) || 0;
        report.topUsers.set(e.userId, userCount + 1);
      }
    });

    // Get alerts from database if available
    if (this.db) {
      try {
        const result = await this.db.query(
          `SELECT * FROM security_alerts
           WHERE triggered_at >= $1 AND triggered_at <= $2
           ORDER BY triggered_at DESC`,
          [startDate, endDate]
        );
        report.alerts = result.rows;
      } catch (err) {
        logger.error({ err }, 'Failed to fetch alerts for report');
      }
    }

    return report;
  }

  /**
   * Update metrics periodically
   */
  private updateMetrics(): void {
    this.metrics.lastUpdated = new Date();

    // Persist metrics to database if available
    if (this.db) {
      this.db.query(
        `INSERT INTO security_metrics
         (total_events, suspicious_activities, blocked_tokens, revoked_sessions, metrics_json, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          this.metrics.totalEvents,
          this.metrics.suspiciousActivities,
          this.metrics.blockedTokens,
          this.metrics.revokedSessions,
          JSON.stringify({
            eventsPerType: Object.fromEntries(this.metrics.eventsPerType)
          }),
          new Date()
        ]
      ).catch(err => logger.error({ err }, 'Failed to persist security metrics'));
    }
  }

  /**
   * Cleanup old events from database
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<void> {
    if (!this.db) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const result = await this.db.query(
        `DELETE FROM security_events WHERE timestamp < $1`,
        [cutoffDate]
      );
      logger.info(
        { deletedCount: result.rowCount, retentionDays },
        'Cleaned up old security events'
      );
    } catch (err) {
      logger.error({ err }, 'Failed to cleanup old security events');
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    clearInterval(this.metricsUpdateInterval);
    this.removeAllListeners();
    logger.info('Security event logger shut down');
  }
}

// Export singleton instance
export const securityLogger = new SecurityEventLogger();

// Cleanup on process exit
process.on('beforeExit', () => {
  securityLogger.shutdown();
});