'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Clock,
  Download,
  Search,
  FileCheck,
  Activity,
  Database,
  Zap,
  Users
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import ReportViewer, { Report } from '@/components/reports/report-viewer';

import { useCommandStore } from '@/stores/command-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';

export default function ReportsPage() {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('7d');

  const { commands, history } = useCommandStore();
  const { agents } = useAgentStore();
  const { addNotification } = useUIStore();

  // Mock reports data - in real implementation, this would come from an API
  const [reports, setReports] = useState<Report[]>([
    {
      id: 'perf-weekly-001',
      title: 'Weekly Performance Summary',
      description: 'Comprehensive performance analysis for the past week including agent utilization, command success rates, and system health metrics.',
      type: 'performance',
      format: 'markdown',
      status: 'ready',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      createdBy: 'System Auto-Generate',
      size: 524288,
      metadata: {
        commandCount: 1247,
        errorCount: 23,
        duration: 604800,
        startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date().toISOString(),
      }
    },
    {
      id: 'inv-claude-002',
      title: 'Claude Agent Error Investigation',
      description: 'Deep dive investigation into recent timeout errors affecting Claude agent operations. Includes root cause analysis and remediation recommendations.',
      type: 'investigation',
      format: 'html',
      status: 'ready',
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      createdBy: 'ops@onsembl.ai',
      agentId: 'claude-1',
      agentName: 'Claude Assistant',
      size: 196608,
      metadata: {
        errorCount: 45,
        commandCount: 234,
        duration: 7200,
      }
    },
    {
      id: 'audit-compliance-003',
      title: 'Monthly Compliance Audit',
      description: 'Complete audit trail and compliance report for security review and regulatory requirements.',
      type: 'audit',
      format: 'json',
      status: 'generating',
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      createdBy: 'audit-system',
      size: 0,
      metadata: {
        commandCount: 5674,
        duration: 2592000, // 30 days
        startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date().toISOString(),
      }
    },
    {
      id: 'summary-daily-004',
      title: 'Daily Operations Summary',
      description: 'High-level summary of daily operations, key metrics, and notable events.',
      type: 'summary',
      format: 'csv',
      status: 'ready',
      createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      createdBy: 'System',
      size: 32768,
      metadata: {
        commandCount: 89,
        duration: 86400, // 24 hours
      }
    },
    {
      id: 'error-analysis-005',
      title: 'System Error Analysis',
      description: 'Analysis of system-wide errors, patterns, and impact assessment.',
      type: 'error',
      format: 'markdown',
      status: 'failed',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      createdBy: 'error-monitor',
      size: 0,
      metadata: {
        errorCount: 127,
        commandCount: 892,
      }
    }
  ]);

  // Calculate report statistics
  const reportStats = useMemo(() => {
    const total = reports.length;
    const ready = reports.filter(r => r.status === 'ready').length;
    const generating = reports.filter(r => r.status === 'generating').length;
    const failed = reports.filter(r => r.status === 'failed').length;

    const totalSize = reports
      .filter(r => r.status === 'ready')
      .reduce((sum, r) => sum + r.size, 0);

    const recentReports = reports.filter(r =>
      new Date(r.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length;

    return {
      total,
      ready,
      generating,
      failed,
      totalSize,
      recentReports,
    };
  }, [reports]);

  // Get system metrics for overview
  const systemMetrics = useMemo(() => {
    const totalCommands = commands.length;
    const recentCommands = commands.filter(c =>
      new Date(c.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    const errorRate = totalCommands > 0
      ? (commands.filter(c => c.status === 'failed').length / totalCommands) * 100
      : 0;

    const avgResponseTime = 150; // Mock value, would be calculated from actual data
    const systemUptime = 99.8; // Mock value

    return {
      totalCommands,
      recentCommands,
      errorRate,
      avgResponseTime,
      systemUptime,
      activeAgents: agents.filter(a => a.status === 'online').length,
    };
  }, [commands, agents]);

  const handleReportGenerate = useCallback(async (config: any) => {
    const newReport: Report = {
      id: `report-${Date.now()}`,
      title: `${config.type.charAt(0).toUpperCase() + config.type.slice(1)} Report`,
      description: `Generated ${config.type} report for the specified time range`,
      type: config.type,
      format: config.format,
      status: 'generating',
      createdAt: new Date().toISOString(),
      createdBy: 'user@onsembl.ai',
      size: 0,
      metadata: {
        startTime: config.timeRange.start,
        endTime: config.timeRange.end,
      }
    };

    setReports(prev => [newReport, ...prev]);

    // Simulate report generation
    setTimeout(() => {
      setReports(prev =>
        prev.map(r =>
          r.id === newReport.id
            ? { ...r, status: 'ready' as const, size: Math.floor(Math.random() * 1000000) + 100000 }
            : r
        )
      );

      addNotification({
        title: 'Report Generated',
        description: `Your ${config.type} report is now ready`,
        type: 'success',
      });
    }, 3000);
  }, [addNotification]);

  const handleReportDownload = useCallback(async (report: Report) => {
    // Simulate download
    const blob = new Blob(['Mock report content'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/\s+/g, '_')}.${report.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const filteredReports = useMemo(() => {
    return reports.filter(report =>
      !searchTerm || (
        report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.createdBy.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [reports, searchTerm]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investigation Reports</h1>
          <p className="text-muted-foreground">
            Generate and view system analysis reports
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="flex items-center space-x-1">
            <FileText className="h-3 w-3" />
            <span>{reportStats.total} Reports</span>
          </Badge>
          <Badge variant="outline" className="flex items-center space-x-1">
            <Activity className="h-3 w-3" />
            <span>{reportStats.ready} Ready</span>
          </Badge>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Reports</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportStats.ready}</div>
            <p className="text-xs text-muted-foreground">
              {reportStats.generating} generating
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatFileSize(reportStats.totalSize)}</div>
            <p className="text-xs text-muted-foreground">
              {reportStats.recentReports} created today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics.systemUptime}%</div>
            <p className="text-xs text-muted-foreground">
              Uptime this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics.errorRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reports">All Reports</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="investigations">Investigations</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent Reports */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5" />
                  <span>Recent Reports</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reports.slice(0, 5).map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{report.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {report.type} • {report.format.toUpperCase()} • {formatFileSize(report.size)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            report.status === 'ready'
                              ? 'default'
                              : report.status === 'generating'
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {report.status}
                        </Badge>
                        {report.status === 'ready' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReportDownload(report)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* System Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>System Metrics</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Commands (7d)</p>
                      <p className="text-2xl font-bold">{systemMetrics.recentCommands}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Active Agents</p>
                      <p className="text-2xl font-bold">{systemMetrics.activeAgents}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Response Time</span>
                      <span>{systemMetrics.avgResponseTime}ms avg</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '75%' }} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Error Rate</span>
                      <span>{systemMetrics.errorRate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          systemMetrics.errorRate > 5 ? 'bg-red-500' :
                          systemMetrics.errorRate > 2 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(systemMetrics.errorRate * 10, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button variant="outline" className="h-20 flex flex-col space-y-2">
                  <BarChart3 className="h-6 w-6" />
                  <span>Performance Report</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col space-y-2">
                  <Search className="h-6 w-6" />
                  <span>Error Investigation</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col space-y-2">
                  <FileCheck className="h-6 w-6" />
                  <span>Audit Report</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col space-y-2">
                  <Activity className="h-6 w-6" />
                  <span>System Summary</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <ReportViewer
            reports={reports}
            onReportGenerate={handleReportGenerate}
            onReportDownload={handleReportDownload}
          />
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <ReportViewer
            reports={reports.filter(r => r.type === 'performance')}
            onReportGenerate={handleReportGenerate}
            onReportDownload={handleReportDownload}
          />
        </TabsContent>

        {/* Investigations Tab */}
        <TabsContent value="investigations" className="space-y-4">
          <ReportViewer
            reports={reports.filter(r => r.type === 'investigation' || r.type === 'error')}
            onReportGenerate={handleReportGenerate}
            onReportDownload={handleReportDownload}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}