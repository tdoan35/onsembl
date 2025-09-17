'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Clock,
  User,
  MessageSquare,
  Code,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Filter,
  Search,
  Download,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export interface TraceEntry {
  id: string;
  parentId?: string;
  type: 'request' | 'response' | 'action' | 'error' | 'tool_call' | 'tool_response';
  timestamp: string;
  agentId: string;
  agentName: string;
  content: string;
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
    cost?: number;
    toolName?: string;
    parameters?: Record<string, any>;
    result?: any;
    error?: string;
  };
  children?: TraceEntry[];
  depth: number;
}

interface TraceTreeProps {
  traces: TraceEntry[];
  className?: string;
  maxHeight?: number;
  onTraceSelect?: (trace: TraceEntry) => void;
  searchable?: boolean;
  filterable?: boolean;
}

const typeConfig = {
  request: {
    icon: MessageSquare,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Request'
  },
  response: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Response'
  },
  action: {
    icon: Code,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
    label: 'Action'
  },
  error: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    borderColor: 'border-red-200 dark:border-red-800',
    label: 'Error'
  },
  tool_call: {
    icon: Code,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    label: 'Tool Call'
  },
  tool_response: {
    icon: CheckCircle,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 dark:bg-teal-950/20',
    borderColor: 'border-teal-200 dark:border-teal-800',
    label: 'Tool Response'
  },
};

export default function TraceTree({
  traces,
  className,
  maxHeight = 600,
  onTraceSelect,
  searchable = true,
  filterable = true
}: TraceTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedTrace, setSelectedTrace] = useState<TraceEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [showDetails, setShowDetails] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const { addNotification } = useUIStore();

  // Build tree structure from flat traces array
  const traceTree = useMemo(() => {
    const traceMap = new Map<string, TraceEntry>();
    const rootTraces: TraceEntry[] = [];

    // First pass: create map and initialize children arrays
    traces.forEach(trace => {
      traceMap.set(trace.id, { ...trace, children: [] });
    });

    // Second pass: build tree structure
    traces.forEach(trace => {
      const traceNode = traceMap.get(trace.id)!;
      if (trace.parentId && traceMap.has(trace.parentId)) {
        const parent = traceMap.get(trace.parentId)!;
        parent.children!.push(traceNode);
      } else {
        rootTraces.push(traceNode);
      }
    });

    return rootTraces;
  }, [traces]);

  // Filter traces based on search and filters
  const filteredTraces = useMemo(() => {
    const filterTrace = (trace: TraceEntry): TraceEntry | null => {
      // Apply filters
      if (typeFilter !== 'all' && trace.type !== typeFilter) {
        return null;
      }
      if (agentFilter !== 'all' && trace.agentId !== agentFilter) {
        return null;
      }
      if (hiddenTypes.has(trace.type)) {
        return null;
      }

      // Apply search
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matches = (
          trace.content.toLowerCase().includes(searchLower) ||
          trace.agentName.toLowerCase().includes(searchLower) ||
          trace.type.toLowerCase().includes(searchLower) ||
          (trace.metadata?.toolName?.toLowerCase().includes(searchLower))
        );

        if (!matches) {
          return null;
        }
      }

      // Recursively filter children
      const filteredChildren = trace.children
        ?.map(filterTrace)
        .filter(Boolean) as TraceEntry[] || [];

      return {
        ...trace,
        children: filteredChildren
      };
    };

    return traceTree.map(filterTrace).filter(Boolean) as TraceEntry[];
  }, [traceTree, searchTerm, typeFilter, agentFilter, hiddenTypes]);

  // Get unique agents for filter
  const uniqueAgents = useMemo(() => {
    const agents = new Set(traces.map(t => t.agentId));
    return Array.from(agents);
  }, [traces]);

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  const toggleTypeVisibility = useCallback((type: string) => {
    setHiddenTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

  const selectTrace = useCallback((trace: TraceEntry) => {
    setSelectedTrace(trace);
    onTraceSelect?.(trace);
  }, [onTraceSelect]);

  const formatDuration = useCallback((ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }, []);

  const formatTimestamp = useCallback((timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  }, []);

  const exportTraces = useCallback(() => {
    try {
      const data = JSON.stringify(filteredTraces, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `traces-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification({
        title: 'Export Complete',
        description: 'Trace data exported successfully',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Export Failed',
        description: 'Failed to export trace data',
        type: 'error',
      });
    }
  }, [filteredTraces, addNotification]);

  const renderTraceNode = useCallback((trace: TraceEntry, level: number = 0): React.ReactNode => {
    const config = typeConfig[trace.type];
    const Icon = config.icon;
    const hasChildren = trace.children && trace.children.length > 0;
    const isExpanded = expandedNodes.has(trace.id);
    const isSelected = selectedTrace?.id === trace.id;

    return (
      <div key={trace.id} className="select-none">
        <div
          className={cn(
            "flex items-start space-x-2 p-3 rounded-lg cursor-pointer transition-colors",
            "hover:bg-muted/50",
            isSelected && "bg-accent border border-accent-foreground/20",
            config.bgColor
          )}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => selectTrace(trace)}
        >
          {/* Expand/Collapse Button */}
          <div className="flex-shrink-0 w-4 h-4 mt-0.5">
            {hasChildren ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(trace.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            ) : null}
          </div>

          {/* Type Icon */}
          <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", config.color)} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-xs">
                {config.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {trace.agentName}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(trace.timestamp)}
              </span>
              {trace.metadata?.duration && (
                <Badge variant="secondary" className="text-xs">
                  {formatDuration(trace.metadata.duration)}
                </Badge>
              )}
              {trace.metadata?.tokens && (
                <Badge variant="secondary" className="text-xs">
                  {trace.metadata.tokens} tokens
                </Badge>
              )}
            </div>

            <div className="mt-1">
              <p className="text-sm line-clamp-2">{trace.content}</p>
              {trace.metadata?.toolName && (
                <p className="text-xs text-muted-foreground mt-1">
                  Tool: {trace.metadata.toolName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="ml-4">
            {trace.children!.map(child => renderTraceNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  }, [expandedNodes, selectedTrace, selectTrace, toggleExpanded, formatTimestamp, formatDuration]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    const collectIds = (traces: TraceEntry[]) => {
      traces.forEach(trace => {
        allIds.add(trace.id);
        if (trace.children) {
          collectIds(trace.children);
        }
      });
    };
    collectIds(traceTree);
    setExpandedNodes(allIds);
  }, [traceTree]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Controls */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Code className="h-5 w-5" />
              <span>LLM Trace Tree</span>
              <Badge variant="outline" className="ml-2">
                {filteredTraces.length} traces
              </Badge>
            </CardTitle>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAll}
              >
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAll}
              >
                Collapse All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportTraces}
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>

          {(searchable || filterable) && (
            <div className="flex flex-wrap gap-2">
              {searchable && (
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search traces..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              {filterable && (
                <>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {Object.entries(typeConfig).map(([type, config]) => (
                        <SelectItem key={type} value={type}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {uniqueAgents.map(agentId => (
                        <SelectItem key={agentId} value={agentId}>
                          {traces.find(t => t.agentId === agentId)?.agentName || agentId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}

          {/* Type visibility toggles */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(typeConfig).map(([type, config]) => {
              const Icon = config.icon;
              const isHidden = hiddenTypes.has(type);
              const count = traces.filter(t => t.type === type).length;

              return (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() => toggleTypeVisibility(type)}
                  className={cn(
                    "flex items-center space-x-1",
                    isHidden && "opacity-50"
                  )}
                >
                  {isHidden ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  <Icon className={cn("h-3 w-3", config.color)} />
                  <span className="text-xs">{config.label}</span>
                  <Badge variant="secondary" className="text-xs ml-1">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </CardHeader>
      </Card>

      {/* Tree Display */}
      <div className="flex gap-4">
        {/* Tree Panel */}
        <Card className="flex-1">
          <CardContent className="p-0">
            <ScrollArea className="w-full" style={{ height: maxHeight }}>
              <div className="p-4 space-y-1">
                {filteredTraces.length > 0 ? (
                  filteredTraces.map(trace => renderTraceNode(trace))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No traces match the current filters</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Details Panel */}
        {selectedTrace && (
          <Card className="w-96">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Trace Details</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedTrace(null)}
                  className="h-6 w-6"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Basic Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="outline">{typeConfig[selectedTrace.type].label}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agent:</span>
                    <span>{selectedTrace.agentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time:</span>
                    <span>{new Date(selectedTrace.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Content</h4>
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <pre className="whitespace-pre-wrap font-mono">
                    {selectedTrace.content}
                  </pre>
                </div>
              </div>

              {selectedTrace.metadata && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Metadata</h4>
                  <div className="space-y-2 text-sm">
                    {selectedTrace.metadata.model && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Model:</span>
                        <span>{selectedTrace.metadata.model}</span>
                      </div>
                    )}
                    {selectedTrace.metadata.tokens && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tokens:</span>
                        <span>{selectedTrace.metadata.tokens}</span>
                      </div>
                    )}
                    {selectedTrace.metadata.duration && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration:</span>
                        <span>{formatDuration(selectedTrace.metadata.duration)}</span>
                      </div>
                    )}
                    {selectedTrace.metadata.cost && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cost:</span>
                        <span>${selectedTrace.metadata.cost.toFixed(4)}</span>
                      </div>
                    )}
                    {selectedTrace.metadata.toolName && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tool:</span>
                        <span>{selectedTrace.metadata.toolName}</span>
                      </div>
                    )}
                  </div>

                  {selectedTrace.metadata.parameters && (
                    <div className="mt-4">
                      <h5 className="text-xs font-medium mb-2 text-muted-foreground">Parameters</h5>
                      <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(selectedTrace.metadata.parameters, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedTrace.metadata.result && (
                    <div className="mt-4">
                      <h5 className="text-xs font-medium mb-2 text-muted-foreground">Result</h5>
                      <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(selectedTrace.metadata.result, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedTrace.metadata.error && (
                    <div className="mt-4">
                      <h5 className="text-xs font-medium mb-2 text-red-600">Error</h5>
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-2 rounded text-xs">
                        {selectedTrace.metadata.error}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}