'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Shield,
  Activity,
  AlertTriangle,
  TrendingUp,
  Clock,
  Users,
  FileText,
  BarChart3,
  Download,
  RefreshCw,
  Eye
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import AuditViewer, { AuditLogEntry } from '@/components/audit/audit-viewer';

import { useCommandStore } from '@/stores/command-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';

export default function AuditPage() {
  const [selectedTab, setSelectedTab] = useState('logs');
  const [refreshing, setRefreshing] = useState(false);

  const { commands, history } = useCommandStore();
  const { agents } = useAgentStore();
  const { addNotification } = useUIStore();

  // Mock audit data - in real implementation, this would come from an API
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([
    {
      id: 'audit-001',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      userId: 'user-123',
      userName: 'John Doe',
      userEmail: 'john.doe@onsembl.ai',
      action: 'agent.start',
      resource: 'agent',
      resourceId: 'claude-1',
      resourceName: 'Claude Assistant',
      details: {
        previousStatus: 'offline',
        newStatus: 'online',
        startupTime: 2341
      },
      result: 'success',
      severity: 'low',
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      sessionId: 'session-abc123',
      agentId: 'claude-1',
      agentName: 'Claude Assistant'
    },
    {
      id: 'audit-002',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      userId: 'user-456',
      userName: 'Jane Smith',
      userEmail: 'jane.smith@onsembl.ai',
      action: 'command.execute',
      resource: 'command',
      resourceId: 'cmd-789',
      details: {
        command: 'npm install @types/node',
        agentId: 'claude-1',
        priority: 'normal',
        duration: 8754,
        exitCode: 0
      },
      result: 'success',
      severity: 'low',
      ip: '192.168.1.101',
      sessionId: 'session-def456'
    },
    {
      id: 'audit-003',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      userId: 'system',
      userName: 'System',
      action: 'system.emergency_stop',
      resource: 'system',
      details: {
        triggeredBy: 'user-123',
        reason: 'Manual emergency stop',
        agentsAffected: ['claude-1', 'gemini-1'],
        commandsCancelled: 7,
        stopTime: 1523
      },
      result: 'success',
      severity: 'critical',
      ip: '192.168.1.100',
      sessionId: 'session-abc123'
    },
    {
      id: 'audit-004',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      userId: 'user-123',
      userName: 'John Doe',
      userEmail: 'john.doe@onsembl.ai',
      action: 'config.update',
      resource: 'configuration',
      resourceId: 'agent-config-claude-1',
      details: {
        configType: 'agent_settings',
        changes: {
          maxConcurrentCommands: { from: 5, to: 10 },
          timeout: { from: 30000, to: 60000 }
        },
        validationPassed: true
      },
      result: 'success',
      severity: 'medium',
      ip: '192.168.1.100',
      sessionId: 'session-abc123'
    },
    {
      id: 'audit-005',
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      userId: 'user-789',
      userName: 'Admin User',
      userEmail: 'admin@onsembl.ai',
      action: 'agent.delete',
      resource: 'agent',
      resourceId: 'old-agent-99',
      resourceName: 'Legacy Agent',
      details: {
        reason: 'End of lifecycle',
        dataRetention: 'archived',
        approvalId: 'approval-xyz789'
      },
      result: 'failure',
      severity: 'high',
      ip: '192.168.1.50',
      sessionId: 'session-admin-001'
    },
    {
      id: 'audit-006',
      timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      userId: 'user-456',
      userName: 'Jane Smith',
      userEmail: 'jane.smith@onsembl.ai',
      action: 'user.login',
      resource: 'authentication',
      details: {
        method: 'email_password',
        mfaUsed: true,
        loginAttempt: 1,
        sessionCreated: true
      },
      result: 'success',
      severity: 'low',
      ip: '192.168.1.101',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      sessionId: 'session-def456'
    },
    {
      id: 'audit-007',
      timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      userId: 'unknown',
      userName: 'Unknown User',
      action: 'user.login',
      resource: 'authentication',
      details: {
        method: 'email_password',
        email: 'attacker@malicious.com',
        loginAttempt: 5,
        failureReason: 'invalid_credentials',
        blocked: true
      },
      result: 'failure',
      severity: 'high',
      ip: '203.0.113.42',
      userAgent: 'curl/7.68.0'
    }
  ]);

  // Calculate audit statistics
  const auditStats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayEntries = auditEntries.filter(e => new Date(e.timestamp) >= today);
    const weekEntries = auditEntries.filter(e => new Date(e.timestamp) >= thisWeek);
    const monthEntries = auditEntries.filter(e => new Date(e.timestamp) >= thisMonth);

    const criticalEntries = auditEntries.filter(e => e.severity === 'critical');
    const highEntries = auditEntries.filter(e => e.severity === 'high');
    const failedEntries = auditEntries.filter(e => e.result === 'failure' || e.result === 'error');

    const userActions = auditEntries.filter(e => e.userId !== 'system').length;
    const systemActions = auditEntries.filter(e => e.userId === 'system').length;

    const uniqueUsers = new Set(auditEntries.filter(e => e.userId !== 'system').map(e => e.userId)).size;
    const uniqueIPs = new Set(auditEntries.map(e => e.ip).filter(Boolean)).size;

    return {
      total: auditEntries.length,
      today: todayEntries.length,
      week: weekEntries.length,
      month: monthEntries.length,
      critical: criticalEntries.length,
      high: highEntries.length,
      failed: failedEntries.length,
      userActions,
      systemActions,
      uniqueUsers,
      uniqueIPs,
      averagePerDay: weekEntries.length / 7,
      riskScore: Math.min(100, (criticalEntries.length * 10) + (highEntries.length * 5) + (failedEntries.length * 3))
    };
  }, [auditEntries]);

  // Get activity breakdown
  const activityBreakdown = useMemo(() => {
    const actions = auditEntries.reduce((acc, entry) => {
      acc[entry.action] = (acc[entry.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(actions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));
  }, [auditEntries]);

  // Get user activity
  const userActivity = useMemo(() => {
    const users = auditEntries
      .filter(e => e.userId !== 'system')
      .reduce((acc, entry) => {
        if (!acc[entry.userId]) {
          acc[entry.userId] = {
            userId: entry.userId,
            userName: entry.userName,
            actions: 0,
            lastActivity: entry.timestamp,
            failedActions: 0
          };
        }
        acc[entry.userId].actions += 1;
        if (entry.result === 'failure' || entry.result === 'error') {
          acc[entry.userId].failedActions += 1;
        }
        if (new Date(entry.timestamp) > new Date(acc[entry.userId].lastActivity)) {
          acc[entry.userId].lastActivity = entry.timestamp;
        }
        return acc;
      }, {} as Record<string, any>);

    return Object.values(users)
      .sort((a: any, b: any) => b.actions - a.actions)
      .slice(0, 5);
  }, [auditEntries]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      addNotification({
        title: 'Audit Log Refreshed',
        description: 'Latest audit entries have been loaded',
        type: 'success',
      });

      // In real implementation, this would fetch from API
      // setAuditEntries(await fetchAuditEntries());
    } catch (error) {
      addNotification({
        title: 'Refresh Failed',
        description: 'Failed to refresh audit log',
        type: 'error',
      });
    } finally {
      setRefreshing(false);
    }
  }, [addNotification]);

  const handleExport = useCallback((filters: any) => {
    addNotification({
      title: 'Export Started',
      description: 'Audit log export is being prepared',
      type: 'info',
    });
  }, [addNotification]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getRiskLevel = (score: number) => {
    if (score >= 70) return { level: 'High', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950/20' };
    if (score >= 40) return { level: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-950/20' };
    return { level: 'Low', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950/20' };
  };

  const riskLevel = getRiskLevel(auditStats.riskScore);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-muted-foreground">
            Monitor security events and system activities
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="flex items-center space-x-1">
            <Shield className="h-3 w-3" />
            <span>{auditStats.total} Events</span>
          </Badge>
          <Badge
            variant="outline"
            className={`flex items-center space-x-1 ${riskLevel.color}`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>{riskLevel.level} Risk</span>
          </Badge>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditStats.today}</div>
            <p className="text-xs text-muted-foreground">
              {auditStats.week} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditStats.riskScore}</div>
            <p className={`text-xs ${riskLevel.color}`}>
              {riskLevel.level} risk level
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditStats.uniqueUsers}</div>
            <p className="text-xs text-muted-foreground">
              {auditStats.uniqueIPs} unique IPs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Actions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditStats.failed}</div>
            <p className="text-xs text-muted-foreground">
              {((auditStats.failed / auditStats.total) * 100).toFixed(1)}% failure rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="logs">Audit Logs</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        {/* Audit Logs Tab */}
        <TabsContent value="logs">
          <AuditViewer
            entries={auditEntries}
            onRefresh={handleRefresh}
            onExport={handleExport}
          />
        </TabsContent>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Activity Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>Top Activities</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activityBreakdown.map(({ action, count }) => (
                    <div key={action} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{action.replace('.', ' ')}</span>
                        <span className="text-sm text-muted-foreground">{count} events</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${(count / auditStats.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* User Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Most Active Users</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {userActivity.map((user: any) => (
                    <div key={user.userId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium">{user.userName}</h4>
                        <p className="text-sm text-muted-foreground">
                          Last active: {formatDate(user.lastActivity)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{user.actions} actions</p>
                        {user.failedActions > 0 && (
                          <p className="text-sm text-red-600">{user.failedActions} failed</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Critical Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5" />
                <span>Recent Critical Events</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditEntries
                  .filter(e => e.severity === 'critical' || e.severity === 'high')
                  .slice(0, 5)
                  .map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${entry.severity === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`} />
                        <div>
                          <p className="font-medium">{entry.action.replace('.', ' ')}</p>
                          <p className="text-sm text-muted-foreground">
                            by {entry.userName} • {formatDate(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={entry.result === 'success' ? 'default' : 'destructive'}
                        >
                          {entry.result}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={entry.severity === 'critical' ? 'text-red-600' : 'text-orange-600'}
                        >
                          {entry.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                {auditEntries.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">All Clear</h3>
                    <p className="text-muted-foreground">No critical security events detected</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="grid gap-6">
            {/* Security Metrics */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Authentication Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {auditEntries.filter(e => e.action.includes('login')).length}
                  </div>
                  <p className="text-sm text-muted-foreground">Login attempts today</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Failed Logins</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {auditEntries.filter(e => e.action.includes('login') && e.result === 'failure').length}
                  </div>
                  <p className="text-sm text-muted-foreground">Suspicious attempts</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">IP Addresses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{auditStats.uniqueIPs}</div>
                  <p className="text-sm text-muted-foreground">Unique sources</p>
                </CardContent>
              </Card>
            </div>

            {/* Security Events */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Security Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {auditEntries
                    .filter(e =>
                      e.action.includes('login') ||
                      e.action.includes('emergency') ||
                      e.result === 'failure'
                    )
                    .slice(0, 10)
                    .map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <AlertTriangle className={`h-4 w-4 ${
                            entry.result === 'failure' ? 'text-red-500' : 'text-yellow-500'
                          }`} />
                          <div>
                            <p className="font-medium">{entry.action}</p>
                            <p className="text-sm text-muted-foreground">
                              {entry.ip} • {formatDate(entry.timestamp)}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={entry.result === 'success' ? 'default' : 'destructive'}
                        >
                          {entry.result}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="space-y-6">
          <div className="grid gap-6">
            {/* Compliance Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center space-x-2">
                    <FileText className="h-4 w-4" />
                    <span>Retention Period</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">30 days</div>
                  <p className="text-sm text-muted-foreground">Current retention</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Archived Entries</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">2,547</div>
                  <p className="text-sm text-muted-foreground">Long-term storage</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Backup Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">✓</div>
                  <p className="text-sm text-muted-foreground">Last backup: 2h ago</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Compliance Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">98%</div>
                  <p className="text-sm text-muted-foreground">Meeting requirements</p>
                </CardContent>
              </Card>
            </div>

            {/* Compliance Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Compliance Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button variant="outline" className="h-20 flex flex-col space-y-2">
                    <Download className="h-6 w-6" />
                    <span>Export Logs</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col space-y-2">
                    <FileText className="h-6 w-6" />
                    <span>Generate Report</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col space-y-2">
                    <Shield className="h-6 w-6" />
                    <span>Verify Integrity</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col space-y-2">
                    <RefreshCw className="h-6 w-6" />
                    <span>Archive Old Data</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Regulatory Information */}
            <Card>
              <CardHeader>
                <CardTitle>Regulatory Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">GDPR Compliance</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Data retention and user privacy requirements
                      </p>
                      <Badge variant="default" className="text-xs">Compliant</Badge>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">SOX Compliance</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Financial reporting and audit trail requirements
                      </p>
                      <Badge variant="default" className="text-xs">Compliant</Badge>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">Audit Trail Requirements</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>✓ All user actions are logged with timestamps</li>
                      <li>✓ IP addresses and session information captured</li>
                      <li>✓ Failed authentication attempts monitored</li>
                      <li>✓ System changes tracked with approval workflows</li>
                      <li>✓ Data integrity verified with checksums</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}