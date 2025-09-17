'use client';

import { useState, useCallback } from 'react';
import {
  BookOpen,
  Play,
  Filter,
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  Command
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import PresetManager from '@/components/presets/preset-manager';
import CommandInput from '@/components/command/command-input';

import { useCommandStore, CommandPreset } from '@/stores/command-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';

export default function PresetsPage() {
  const [selectedTab, setSelectedTab] = useState('manage');
  const [selectedPreset, setSelectedPreset] = useState<CommandPreset | null>(null);

  const {
    presets,
    history,
    addCommand,
    getRecentHistory,
    getPresetsByCategory,
  } = useCommandStore();

  const { agents, getOnlineAgents } = useAgentStore();
  const { addNotification } = useUIStore();

  const onlineAgents = getOnlineAgents();
  const recentHistory = getRecentHistory(10);

  // Get preset statistics
  const getPresetStats = useCallback(() => {
    const categories = presets.reduce((acc, preset) => {
      acc[preset.category] = (acc[preset.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostUsedCategory = Object.entries(categories).reduce(
      (max, [category, count]) => count > max.count ? { category, count } : max,
      { category: '', count: 0 }
    );

    const agentTypeUsage = presets.reduce((acc, preset) => {
      if (preset.agentTypes) {
        preset.agentTypes.forEach(type => {
          acc[type] = (acc[type] || 0) + 1;
        });
      }
      return acc;
    }, {} as Record<string, number>);

    const recentUsage = history.slice(0, 50).reduce((acc, entry) => {
      const preset = presets.find(p => p.command === entry.command);
      if (preset) {
        acc[preset.id] = (acc[preset.id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const mostUsedPreset = presets.find(p =>
      p.id === Object.entries(recentUsage).reduce(
        (max, [id, count]) => count > max.count ? { id, count } : max,
        { id: '', count: 0 }
      ).id
    );

    return {
      totalPresets: presets.length,
      categories: Object.keys(categories).length,
      mostUsedCategory: mostUsedCategory.category,
      mostUsedPreset,
      agentTypeUsage,
      recentUsageCount: Object.values(recentUsage).reduce((sum, count) => sum + count, 0),
    };
  }, [presets, history]);

  const stats = getPresetStats();

  const handlePresetSelect = useCallback((preset: CommandPreset) => {
    setSelectedPreset(preset);
    setSelectedTab('execute');
  }, []);

  const handleCommandSubmit = useCallback(async (command: string, agentId: string, priority: any) => {
    const newCommand = {
      id: `cmd-${Date.now()}`,
      agentId,
      content: command,
      status: 'pending' as const,
      priority,
      createdAt: new Date().toISOString(),
    };

    addCommand(newCommand);

    addNotification({
      title: 'Preset Executed',
      description: `Command "${command}" sent to agent`,
      type: 'success',
    });

    // Reset selected preset after execution
    setTimeout(() => setSelectedPreset(null), 1000);
  }, [addCommand, addNotification]);

  const getCategoryStats = useCallback(() => {
    const categoryStats = presets.reduce((acc, preset) => {
      const category = preset.category;
      if (!acc[category]) {
        acc[category] = {
          count: 0,
          recent: 0,
        };
      }
      acc[category].count += 1;

      // Count recent usage
      const recentUsage = history.slice(0, 30).filter(h =>
        presets.find(p => p.command === h.command && p.category === category)
      ).length;
      acc[category].recent = recentUsage;

      return acc;
    }, {} as Record<string, { count: number; recent: number }>);

    return Object.entries(categoryStats)
      .map(([category, stats]) => ({
        category,
        ...stats,
        usage: stats.recent > 0 ? (stats.recent / Math.min(history.length, 30)) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [presets, history]);

  const categoryStats = getCategoryStats();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Presets</h1>
          <p className="text-muted-foreground">
            Manage and execute reusable command templates
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="flex items-center space-x-1">
            <BookOpen className="h-3 w-3" />
            <span>{stats.totalPresets} Presets</span>
          </Badge>
          <Badge variant="outline" className="flex items-center space-x-1">
            <Filter className="h-3 w-3" />
            <span>{stats.categories} Categories</span>
          </Badge>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Presets</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPresets}</div>
            <p className="text-xs text-muted-foreground">
              Across {stats.categories} categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Usage</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentUsageCount}</div>
            <p className="text-xs text-muted-foreground">
              Executions this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Used Category</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.mostUsedCategory || 'None'}</div>
            <p className="text-xs text-muted-foreground">
              Popular category
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{onlineAgents.length}</div>
            <p className="text-xs text-muted-foreground">
              Available for execution
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="manage">Manage Presets</TabsTrigger>
          <TabsTrigger value="execute">Execute</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Manage Presets Tab */}
        <TabsContent value="manage" className="space-y-4">
          <PresetManager
            onPresetSelect={handlePresetSelect}
            selectedPresetId={selectedPreset?.id}
          />
        </TabsContent>

        {/* Execute Tab */}
        <TabsContent value="execute" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Command Execution */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Play className="h-5 w-5" />
                    <span>Execute Preset</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedPreset ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-medium">{selectedPreset.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {selectedPreset.description}
                        </p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Command
                        </label>
                        <pre className="text-sm bg-muted p-3 rounded mt-1 overflow-x-auto">
                          <code>{selectedPreset.command}</code>
                        </pre>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{selectedPreset.category}</Badge>
                        {selectedPreset.agentTypes?.map(type => (
                          <Badge key={type} variant="secondary">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Command className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-medium mb-2">No Preset Selected</h3>
                      <p className="text-sm text-muted-foreground">
                        Select a preset from the Manage tab to execute it
                      </p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setSelectedTab('manage')}
                      >
                        Browse Presets
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Command Input */}
              {selectedPreset && (
                <CommandInput
                  onCommandSubmit={handleCommandSubmit}
                />
              )}
            </div>

            {/* Quick Access */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Access</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {presets.slice(0, 8).map((preset) => (
                      <Button
                        key={preset.id}
                        variant={selectedPreset?.id === preset.id ? 'default' : 'ghost'}
                        className="w-full justify-start"
                        onClick={() => setSelectedPreset(preset)}
                      >
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <span className="truncate">{preset.name}</span>
                          <Badge variant="outline" className="ml-auto text-xs">
                            {preset.category}
                          </Badge>
                        </div>
                      </Button>
                    ))}
                    {presets.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No presets available
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent History */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Executions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {recentHistory.slice(0, 5).map((entry, index) => {
                      const preset = presets.find(p => p.command === entry.command);
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 border rounded text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono">
                              {preset?.name || entry.command}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {agents.find(a => a.id === entry.agentId)?.name || entry.agentId}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      );
                    })}
                    {recentHistory.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No recent executions
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-6">
            {/* Category Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>Category Statistics</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryStats.map(({ category, count, recent, usage }) => (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{category}</span>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{count} presets</Badge>
                          <Badge variant="secondary">{recent} recent</Badge>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${usage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {categoryStats.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No usage data available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Agent Type Compatibility */}
            {Object.keys(stats.agentTypeUsage).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Agent Type Compatibility</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(stats.agentTypeUsage).map(([type, count]) => (
                      <div key={type} className="text-center">
                        <div className="text-2xl font-bold">{count}</div>
                        <p className="text-sm text-muted-foreground capitalize">
                          {type} compatible
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Execution History</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentHistory.map((entry, index) => {
                  const preset = presets.find(p => p.command === entry.command);
                  const agent = agents.find(a => a.id === entry.agentId);

                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium truncate">
                            {preset?.name || 'Custom Command'}
                          </h4>
                          {preset && (
                            <Badge variant="outline" className="text-xs">
                              {preset.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground font-mono truncate">
                          {entry.command}
                        </p>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-xs text-muted-foreground">
                            Agent: {agent?.name || entry.agentId}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {preset && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPreset(preset)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {recentHistory.length === 0 && (
                  <div className="text-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No History</h3>
                    <p className="text-muted-foreground">
                      Command execution history will appear here
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}