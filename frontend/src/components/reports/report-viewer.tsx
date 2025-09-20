'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  Download,
  Search,
  Filter,
  Eye,
  ExternalLink,
  Calendar,
  User,
  AlertCircle,
  CheckCircle,
  Info,
  Clock,
  BarChart3,
  FileJson,
  FileText as FileCsv,
  FileImage
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export interface Report {
  id: string;
  title: string;
  description: string;
  type: 'investigation' | 'performance' | 'error' | 'audit' | 'summary';
  format: 'markdown' | 'json' | 'html' | 'csv';
  status: 'generating' | 'ready' | 'failed' | 'expired';
  createdAt: string;
  createdBy: string;
  agentId?: string;
  agentName?: string;
  size: number;
  content?: string;
  metadata?: {
    commandCount?: number;
    errorCount?: number;
    duration?: number;
    startTime?: string;
    endTime?: string;
    filters?: Record<string, any>;
  };
  expiresAt?: string;
}

interface ReportViewerProps {
  reports?: Report[];
  className?: string;
  onReportGenerate?: (config: ReportGenerateConfig) => void;
  onReportDownload?: (report: Report) => void;
}

interface ReportGenerateConfig {
  type: Report['type'];
  format: Report['format'];
  agentId?: string;
  timeRange: {
    start: string;
    end: string;
  };
  filters?: Record<string, any>;
}

const reportTypeConfig = {
  investigation: {
    icon: Search,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    label: 'Investigation Report',
    description: 'Detailed analysis of agent behavior and command execution'
  },
  performance: {
    icon: BarChart3,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    label: 'Performance Report',
    description: 'Performance metrics and optimization recommendations'
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    label: 'Error Report',
    description: 'Error analysis and troubleshooting information'
  },
  audit: {
    icon: FileText,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    label: 'Audit Report',
    description: 'Compliance and activity audit trail'
  },
  summary: {
    icon: Info,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 dark:bg-gray-950/20',
    label: 'Summary Report',
    description: 'High-level summary of system activity'
  },
};

const formatIcons = {
  markdown: FileText,
  json: FileJson,
  html: ExternalLink,
  csv: FileCsv,
};

const mockReports: Report[] = [
  {
    id: 'report-1',
    title: 'Weekly Performance Analysis',
    description: 'Performance metrics and recommendations for the past week',
    type: 'performance',
    format: 'markdown',
    status: 'ready',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdBy: 'System',
    size: 245760,
    metadata: {
      commandCount: 1247,
      duration: 604800,
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date().toISOString(),
    }
  },
  {
    id: 'report-2',
    title: 'Error Investigation - Claude Agent',
    description: 'Investigation of recent errors in Claude agent operations',
    type: 'investigation',
    format: 'html',
    status: 'ready',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    createdBy: 'admin@onsembl.ai',
    agentId: 'claude-1',
    agentName: 'Claude Assistant',
    size: 128456,
    metadata: {
      errorCount: 23,
      commandCount: 456,
    }
  },
  {
    id: 'report-3',
    title: 'System Audit Trail',
    description: 'Complete audit trail for compliance review',
    type: 'audit',
    format: 'json',
    status: 'generating',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    createdBy: 'audit@onsembl.ai',
    size: 0,
  },
  {
    id: 'report-4',
    title: 'Failed Report Generation',
    description: 'Report generation failed due to insufficient data',
    type: 'summary',
    format: 'csv',
    status: 'failed',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    createdBy: 'System',
    size: 0,
  }
];

export default function ReportViewer({
  reports = mockReports,
  className,
  onReportGenerate,
  onReportDownload
}: ReportViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateConfig, setGenerateConfig] = useState<ReportGenerateConfig>({
    type: 'investigation',
    format: 'markdown',
    timeRange: {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    }
  });

  const { addNotification } = useUIStore();

  // Filter reports
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchesSearch = !searchTerm || (
        report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.createdBy.toLowerCase().includes(searchTerm.toLowerCase())
      );

      const matchesType = typeFilter === 'all' || report.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || report.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [reports, searchTerm, typeFilter, statusFilter]);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }, []);

  const formatDate = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 24 * 60) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  }, []);

  const handleDownload = useCallback(async (report: Report) => {
    if (report.status !== 'ready') {
      addNotification({
        title: 'Download Unavailable',
        description: 'Report is not ready for download',
        type: 'warning',
      });
      return;
    }

    try {
      onReportDownload?.(report);

      // Simulate download
      addNotification({
        title: 'Download Started',
        description: `Downloading ${report.title}`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Download Failed',
        description: 'Failed to download report',
        type: 'error',
      });
    }
  }, [onReportDownload, addNotification]);

  const handleGenerate = useCallback(async () => {
    try {
      onReportGenerate?.(generateConfig);

      addNotification({
        title: 'Report Generation Started',
        description: 'Your report is being generated',
        type: 'success',
      });

      setShowGenerateDialog(false);
    } catch (error) {
      addNotification({
        title: 'Generation Failed',
        description: 'Failed to start report generation',
        type: 'error',
      });
    }
  }, [generateConfig, onReportGenerate, addNotification]);

  const viewReport = useCallback((report: Report) => {
    if (report.status !== 'ready') {
      addNotification({
        title: 'Report Not Ready',
        description: 'This report is not yet available for viewing',
        type: 'warning',
      });
      return;
    }

    setSelectedReport(report);
  }, [addNotification]);

  const renderReportCard = useCallback((report: Report) => {
    const config = reportTypeConfig[report.type];
    const Icon = config.icon;
    const FormatIcon = formatIcons[report.format];

    const statusColor = {
      generating: 'text-blue-600',
      ready: 'text-green-600',
      failed: 'text-red-600',
      expired: 'text-gray-500'
    }[report.status];

    const statusBg = {
      generating: 'bg-blue-50 dark:bg-blue-950/20',
      ready: 'bg-green-50 dark:bg-green-950/20',
      failed: 'bg-red-50 dark:bg-red-950/20',
      expired: 'bg-gray-50 dark:bg-gray-950/20'
    }[report.status];

    return (
      <Card key={report.id} className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className={cn("p-2 rounded-lg", config.bgColor)}>
                <Icon className={cn("h-5 w-5", config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">{report.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {report.description}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="flex items-center space-x-1">
                <FormatIcon className="h-3 w-3" />
                <span className="uppercase">{report.format}</span>
              </Badge>
              <div className={cn("px-2 py-1 rounded-full text-xs font-medium", statusBg, statusColor)}>
                {report.status}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="flex items-center space-x-2 text-muted-foreground mb-1">
                <User className="h-3 w-3" />
                <span>Created by</span>
              </div>
              <p className="font-medium truncate">{report.createdBy}</p>
            </div>
            <div>
              <div className="flex items-center space-x-2 text-muted-foreground mb-1">
                <Calendar className="h-3 w-3" />
                <span>Created</span>
              </div>
              <p className="font-medium">{formatDate(report.createdAt)}</p>
            </div>
          </div>

          {report.agentName && (
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">{report.agentName}</Badge>
            </div>
          )}

          {report.metadata && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              {report.metadata.commandCount !== undefined && (
                <div className="text-center p-2 bg-muted rounded">
                  <p className="font-medium">{report.metadata.commandCount}</p>
                  <p className="text-muted-foreground">Commands</p>
                </div>
              )}
              {report.metadata.errorCount !== undefined && (
                <div className="text-center p-2 bg-muted rounded">
                  <p className="font-medium text-red-600">{report.metadata.errorCount}</p>
                  <p className="text-muted-foreground">Errors</p>
                </div>
              )}
              {report.metadata.duration !== undefined && (
                <div className="text-center p-2 bg-muted rounded">
                  <p className="font-medium">{Math.floor(report.metadata.duration / 3600)}h</p>
                  <p className="text-muted-foreground">Duration</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">
              {formatFileSize(report.size)}
            </span>

            <div className="flex space-x-2">
              {report.status === 'ready' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => viewReport(report)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(report)}
                disabled={report.status !== 'ready'}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }, [formatDate, formatFileSize, viewReport, handleDownload]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <CardTitle>Investigation Reports</CardTitle>
              <Badge variant="outline">{filteredReports.length} reports</Badge>
            </div>

            <Button onClick={() => setShowGenerateDialog(true)}>
              <BarChart3 className="h-4 w-4 mr-1" />
              Generate Report
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(reportTypeConfig).map(([type, config]) => (
                  <SelectItem key={type} value={type}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="generating">Generating</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Reports Grid */}
      {filteredReports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map(renderReportCard)}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Reports Found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                ? "No reports match your current filters"
                : "Get started by generating your first report"
              }
            </p>
            {(!searchTerm && typeFilter === 'all' && statusFilter === 'all') && (
              <Button onClick={() => setShowGenerateDialog(true)}>
                <BarChart3 className="h-4 w-4 mr-1" />
                Generate First Report
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generate Report Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate New Report</DialogTitle>
            <DialogDescription>
              Configure the parameters for your new investigation report
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Report Type</label>
                <Select
                  value={generateConfig.type}
                  onValueChange={(type: Report['type']) =>
                    setGenerateConfig(prev => ({ ...prev, type }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(reportTypeConfig).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center space-x-2">
                          <config.icon className="h-4 w-4" />
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Format</label>
                <Select
                  value={generateConfig.format}
                  onValueChange={(format: Report['format']) =>
                    setGenerateConfig(prev => ({ ...prev, format }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(formatIcons).map(([format, Icon]) => (
                      <SelectItem key={format} value={format}>
                        <div className="flex items-center space-x-2">
                          <Icon className="h-4 w-4" />
                          <span className="uppercase">{format}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Start Date</label>
                <Input
                  type="date"
                  value={generateConfig.timeRange.start}
                  onChange={(e) =>
                    setGenerateConfig(prev => ({
                      ...prev,
                      timeRange: { ...prev.timeRange, start: e.target.value }
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">End Date</label>
                <Input
                  type="date"
                  value={generateConfig.timeRange.end}
                  onChange={(e) =>
                    setGenerateConfig(prev => ({
                      ...prev,
                      timeRange: { ...prev.timeRange, end: e.target.value }
                    }))
                  }
                />
              </div>
            </div>

            {generateConfig.type && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">
                  {reportTypeConfig[generateConfig.type].label}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {reportTypeConfig[generateConfig.type].description}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowGenerateDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleGenerate}>
              <BarChart3 className="h-4 w-4 mr-1" />
              Generate Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report Viewer Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedReport?.title}</DialogTitle>
            <DialogDescription>
              {selectedReport?.description}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-96">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Report content would be displayed here based on the format:
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• <strong>Markdown:</strong> Rendered markdown with syntax highlighting</li>
                <li>• <strong>HTML:</strong> Embedded HTML content</li>
                <li>• <strong>JSON:</strong> Formatted JSON with collapsible sections</li>
                <li>• <strong>CSV:</strong> Tabular data view</li>
              </ul>
            </div>
          </ScrollArea>

          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => selectedReport && handleDownload(selectedReport)}
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            <Button onClick={() => setSelectedReport(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}