'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Shield,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  Activity,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  resourceName?: string;
  details: Record<string, any>;
  result: 'success' | 'failure' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  agentId?: string;
  agentName?: string;
}

interface AuditViewerProps {
  entries?: AuditLogEntry[];
  className?: string;
  onRefresh?: () => void;
  onExport?: (filters: AuditFilters) => void;
}

interface AuditFilters {
  search: string;
  action: string;
  result: string;
  severity: string;
  dateRange: {
    start: string;
    end: string;
  };
  userId?: string;
}

const actionConfig = {
  'agent.create': { icon: User, color: 'text-blue-600', label: 'Agent Created' },
  'agent.update': { icon: User, color: 'text-yellow-600', label: 'Agent Updated' },
  'agent.delete': { icon: User, color: 'text-red-600', label: 'Agent Deleted' },
  'agent.start': { icon: Activity, color: 'text-green-600', label: 'Agent Started' },
  'agent.stop': { icon: Activity, color: 'text-orange-600', label: 'Agent Stopped' },
  'command.execute': { icon: Activity, color: 'text-blue-600', label: 'Command Executed' },
  'command.cancel': { icon: XCircle, color: 'text-red-600', label: 'Command Cancelled' },
  'config.update': { icon: Shield, color: 'text-purple-600', label: 'Config Updated' },
  'user.login': { icon: User, color: 'text-green-600', label: 'User Login' },
  'user.logout': { icon: User, color: 'text-gray-600', label: 'User Logout' },
  'system.emergency_stop': { icon: AlertTriangle, color: 'text-red-600', label: 'Emergency Stop' },
};

const severityConfig = {
  low: { color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/20', label: 'Low' },
  medium: { color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-950/20', label: 'Medium' },
  high: { color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950/20', label: 'High' },
  critical: { color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950/20', label: 'Critical' },
};

const resultConfig = {
  success: { icon: CheckCircle, color: 'text-green-600', label: 'Success' },
  failure: { icon: XCircle, color: 'text-red-600', label: 'Failure' },
  error: { icon: AlertTriangle, color: 'text-red-600', label: 'Error' },
};

// Mock audit log data
const mockAuditEntries: AuditLogEntry[] = [
  {
    id: 'audit-1',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    userId: 'user-1',
    userName: 'John Doe',
    userEmail: 'john@onsembl.ai',
    action: 'agent.start',
    resource: 'agent',
    resourceId: 'claude-1',
    resourceName: 'Claude Assistant',
    details: { previousStatus: 'offline', newStatus: 'online' },
    result: 'success',
    severity: 'low',
    ip: '192.168.1.100',
    sessionId: 'session-123',
    agentId: 'claude-1',
    agentName: 'Claude Assistant'
  },
  {
    id: 'audit-2',
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    userId: 'user-2',
    userName: 'Jane Smith',
    userEmail: 'jane@onsembl.ai',
    action: 'command.execute',
    resource: 'command',
    resourceId: 'cmd-456',
    details: {
      command: 'npm install',
      agentId: 'claude-1',
      priority: 'normal',
      duration: 12500
    },
    result: 'success',
    severity: 'low',
    ip: '192.168.1.101',
    sessionId: 'session-456'
  },
  {
    id: 'audit-3',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    userId: 'system',
    userName: 'System',
    action: 'system.emergency_stop',
    resource: 'system',
    details: {
      reason: 'Manual trigger',
      agentsAffected: ['claude-1', 'gemini-1'],
      commandsCancelled: 5
    },
    result: 'success',
    severity: 'critical',
    ip: '192.168.1.100',
    sessionId: 'session-123'
  },
  {
    id: 'audit-4',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    userId: 'user-1',
    userName: 'John Doe',
    userEmail: 'john@onsembl.ai',
    action: 'agent.delete',
    resource: 'agent',
    resourceId: 'old-agent-1',
    resourceName: 'Old Agent',
    details: { reason: 'Decommissioned' },
    result: 'failure',
    severity: 'medium',
    ip: '192.168.1.100',
    sessionId: 'session-789'
  }
];

export default function AuditViewer({
  entries = mockAuditEntries,
  className,
  onRefresh,
  onExport
}: AuditViewerProps) {
  const [filters, setFilters] = useState<AuditFilters>({
    search: '',
    action: 'all',
    result: 'all',
    severity: 'all',
    dateRange: {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    }
  });

  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<keyof AuditLogEntry>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const { addNotification } = useUIStore();

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    let filtered = entries.filter(entry => {
      const matchesSearch = !filters.search || (
        entry.userName.toLowerCase().includes(filters.search.toLowerCase()) ||
        entry.action.toLowerCase().includes(filters.search.toLowerCase()) ||
        entry.resource.toLowerCase().includes(filters.search.toLowerCase()) ||
        (entry.resourceName?.toLowerCase().includes(filters.search.toLowerCase())) ||
        JSON.stringify(entry.details).toLowerCase().includes(filters.search.toLowerCase())
      );

      const matchesAction = filters.action === 'all' || entry.action === filters.action;
      const matchesResult = filters.result === 'all' || entry.result === filters.result;
      const matchesSeverity = filters.severity === 'all' || entry.severity === filters.severity;

      const entryDate = new Date(entry.timestamp);
      const startDate = new Date(filters.dateRange.start);
      const endDate = new Date(filters.dateRange.end);
      endDate.setHours(23, 59, 59, 999); // Include full end day

      const matchesDateRange = entryDate >= startDate && entryDate <= endDate;

      return matchesSearch && matchesAction && matchesResult && matchesSeverity && matchesDateRange;
    });

    // Sort entries
    filtered.sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === 'timestamp') {
        aValue = new Date(aValue as string).getTime();
        bValue = new Date(bValue as string).getTime();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [entries, filters, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredEntries.slice(startIndex, startIndex + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  // Get unique values for filters
  const uniqueActions = useMemo(() => {
    return Array.from(new Set(entries.map(e => e.action))).sort();
  }, [entries]);

  const formatTimestamp = useCallback((timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  }, []);

  const handleSort = useCallback((field: keyof AuditLogEntry) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const handleExport = useCallback(() => {
    try {
      onExport?.(filters);

      const data = filteredEntries.map(entry => ({
        timestamp: entry.timestamp,
        user: entry.userName,
        action: entry.action,
        resource: entry.resource,
        result: entry.result,
        severity: entry.severity,
        details: JSON.stringify(entry.details)
      }));

      const csvContent = [
        Object.keys(data[0]).join(','),
        ...data.map(row => Object.values(row).map(val => `"${val}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification({
        title: 'Export Complete',
        description: `Exported ${filteredEntries.length} audit log entries`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Export Failed',
        description: 'Failed to export audit log',
        type: 'error',
      });
    }
  }, [filteredEntries, filters, onExport, addNotification]);

  const renderActionCell = useCallback((entry: AuditLogEntry) => {
    const config = actionConfig[entry.action as keyof typeof actionConfig];
    if (!config) {
      return (
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span>{entry.action}</span>
        </div>
      );
    }

    const Icon = config.icon;
    return (
      <div className="flex items-center space-x-2">
        <Icon className={cn("h-4 w-4", config.color)} />
        <span>{config.label}</span>
      </div>
    );
  }, []);

  const renderResultCell = useCallback((result: AuditLogEntry['result']) => {
    const config = resultConfig[result];
    const Icon = config.icon;

    return (
      <Badge variant={result === 'success' ? 'default' : 'destructive'} className="flex items-center space-x-1 w-fit">
        <Icon className="h-3 w-3" />
        <span>{config.label}</span>
      </Badge>
    );
  }, []);

  const renderSeverityCell = useCallback((severity: AuditLogEntry['severity']) => {
    const config = severityConfig[severity];

    return (
      <div className={cn("px-2 py-1 rounded-full text-xs font-medium w-fit", config.bgColor, config.color)}>
        {config.label}
      </div>
    );
  }, []);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Audit Log</CardTitle>
              <Badge variant="outline">{filteredEntries.length} entries</Badge>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={filteredEntries.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search audit logs..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>

            <Select
              value={filters.action}
              onValueChange={(action) => setFilters(prev => ({ ...prev, action }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map(action => (
                  <SelectItem key={action} value={action}>
                    {actionConfig[action as keyof typeof actionConfig]?.label || action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.result}
              onValueChange={(result) => setFilters(prev => ({ ...prev, result }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Results" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.severity}
              onValueChange={(severity) => setFilters(prev => ({ ...prev, severity }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Date Range:</span>
            </div>
            <Input
              type="date"
              value={filters.dateRange.start}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                dateRange: { ...prev.dateRange, start: e.target.value }
              }))}
              className="w-auto"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={filters.dateRange.end}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                dateRange: { ...prev.dateRange, end: e.target.value }
              }))}
              className="w-auto"
            />
          </div>
        </CardHeader>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('timestamp')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Timestamp</span>
                      {sortField === 'timestamp' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('userName')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>User</span>
                      {sortField === 'userName' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('action')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Action</span>
                      {sortField === 'action' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('result')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Result</span>
                      {sortField === 'result' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('severity')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Severity</span>
                      {sortField === 'severity' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">
                      {formatTimestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{entry.userName}</p>
                        {entry.userEmail && (
                          <p className="text-sm text-muted-foreground">{entry.userEmail}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{renderActionCell(entry)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="capitalize">{entry.resource}</p>
                        {entry.resourceName && (
                          <p className="text-sm text-muted-foreground">{entry.resourceName}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{renderResultCell(entry.result)}</TableCell>
                    <TableCell>{renderSeverityCell(entry.severity)}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Audit Log Details</DialogTitle>
                            <DialogDescription>
                              Complete information for this audit log entry
                            </DialogDescription>
                          </DialogHeader>

                          <ScrollArea className="max-h-96">
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Timestamp</h4>
                                  <p className="font-mono text-sm">{formatTimestamp(entry.timestamp)}</p>
                                </div>
                                <div>
                                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Session ID</h4>
                                  <p className="font-mono text-sm">{entry.sessionId || 'N/A'}</p>
                                </div>
                                <div>
                                  <h4 className="font-medium text-sm text-muted-foreground mb-1">User</h4>
                                  <p>{entry.userName}</p>
                                  {entry.userEmail && <p className="text-sm text-muted-foreground">{entry.userEmail}</p>}
                                </div>
                                <div>
                                  <h4 className="font-medium text-sm text-muted-foreground mb-1">IP Address</h4>
                                  <p className="font-mono text-sm">{entry.ip || 'N/A'}</p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="font-medium text-sm text-muted-foreground">Action Details</h4>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm"><strong>Action:</strong> {renderActionCell(entry)}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm"><strong>Result:</strong> {renderResultCell(entry.result)}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm"><strong>Resource:</strong> {entry.resource}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm"><strong>Severity:</strong> {renderSeverityCell(entry.severity)}</p>
                                  </div>
                                </div>
                              </div>

                              {entry.agentName && (
                                <div>
                                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Agent</h4>
                                  <p>{entry.agentName}</p>
                                </div>
                              )}

                              <div>
                                <h4 className="font-medium text-sm text-muted-foreground mb-2">Details</h4>
                                <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-48">
                                  {JSON.stringify(entry.details, null, 2)}
                                </pre>
                              </div>

                              {entry.userAgent && (
                                <div>
                                  <h4 className="font-medium text-sm text-muted-foreground mb-1">User Agent</h4>
                                  <p className="text-xs font-mono bg-muted p-2 rounded">{entry.userAgent}</p>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {paginatedEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Audit Entries Found</h3>
                <p className="text-muted-foreground text-center">
                  No entries match your current filters. Try adjusting your search criteria.
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Show</span>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(value) => {
                    setPageSize(parseInt(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({filteredEntries.length} total entries)
                </span>

                <div className="flex space-x-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}