'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  History,
  BookOpen,
  ChevronDown,
  Clock,
  User,
  Terminal,
  X,
  AlertCircle
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useCommandStore, CommandPriority } from '@/stores/command-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

interface CommandInputProps {
  defaultAgentId?: string;
  onCommandSubmit?: (command: string, agentId: string, priority: CommandPriority) => void;
  className?: string;
  disabled?: boolean;
}

const priorityColors: Record<CommandPriority, string> = {
  low: 'text-primary',
  normal: 'text-success',
  high: 'text-secondary',
  urgent: 'text-destructive',
};

const priorityLabels: Record<CommandPriority, string> = {
  low: 'Low Priority',
  normal: 'Normal Priority',
  high: 'High Priority',
  urgent: 'Urgent',
};

export default function CommandInput({
  defaultAgentId,
  onCommandSubmit,
  className,
  disabled = false
}: CommandInputProps) {
  const [command, setCommand] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId || '');
  const [priority, setPriority] = useState<CommandPriority>('normal');
  const [showHistory, setShowHistory] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const {
    presets,
    history,
    isExecuting,
    addToHistory,
    getRecentHistory
  } = useCommandStore();

  const { agents, getOnlineAgents } = useAgentStore();
  const { addNotification, setLoading } = useUIStore();

  const onlineAgents = getOnlineAgents();
  const recentHistory = getRecentHistory(50);

  // Common command suggestions
  const commonCommands = [
    'ls -la',
    'cd ',
    'npm install',
    'npm run build',
    'npm test',
    'git status',
    'git add .',
    'git commit -m ""',
    'git push',
    'docker ps',
    'docker build .',
    'python --version',
    'node --version',
    'pwd',
    'mkdir ',
    'rm -rf ',
    'cp ',
    'mv ',
    'grep -r "" .',
    'find . -name ""',
    'tail -f ',
  ];

  // Generate suggestions based on input
  useEffect(() => {
    if (!command.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const commandLower = command.toLowerCase();
    const historySuggestions = recentHistory
      .map(h => h.command)
      .filter((cmd, index, self) =>
        self.indexOf(cmd) === index && // Remove duplicates
        cmd.toLowerCase().includes(commandLower) &&
        cmd !== command
      )
      .slice(0, 5);

    const presetSuggestions = presets
      .filter(p =>
        p.command.toLowerCase().includes(commandLower) ||
        p.name.toLowerCase().includes(commandLower)
      )
      .map(p => p.command)
      .slice(0, 3);

    const commonSuggestions = commonCommands
      .filter(cmd =>
        cmd.toLowerCase().includes(commandLower) &&
        cmd !== command
      )
      .slice(0, 5);

    const allSuggestions = [
      ...historySuggestions,
      ...presetSuggestions,
      ...commonSuggestions
    ].slice(0, 8);

    setSuggestions(allSuggestions);
    setShowSuggestions(allSuggestions.length > 0);
    setSelectedSuggestionIndex(-1);
  }, [command, recentHistory, presets]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!command.trim()) {
      addNotification({
        title: 'Empty Command',
        description: 'Please enter a command to execute',
        type: 'warning',
      });
      return;
    }

    if (!selectedAgentId) {
      addNotification({
        title: 'No Agent Selected',
        description: 'Please select an agent to execute the command',
        type: 'warning',
      });
      return;
    }

    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent || agent.status !== 'online') {
      addNotification({
        title: 'Agent Unavailable',
        description: 'Selected agent is not online',
        type: 'error',
      });
      return;
    }

    try {
      setLoading('command-submit', true);

      // Add to history
      addToHistory({
        command: command.trim(),
        agentId: selectedAgentId,
        timestamp: new Date().toISOString(),
      });

      // Submit command
      onCommandSubmit?.(command.trim(), selectedAgentId, priority);

      addNotification({
        title: 'Command Submitted',
        description: `Command sent to ${agent.name}`,
        type: 'success',
      });

      // Reset form
      setCommand('');
      setShowSuggestions(false);
    } catch (error) {
      addNotification({
        title: 'Submission Failed',
        description: 'Failed to submit command',
        type: 'error',
      });
    } finally {
      setLoading('command-submit', false);
    }
  }, [command, selectedAgentId, priority, agents, addToHistory, onCommandSubmit, addNotification, setLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Enter':
          if (selectedSuggestionIndex >= 0) {
            e.preventDefault();
            setCommand(suggestions[selectedSuggestionIndex]);
            setShowSuggestions(false);
            return;
          }
          handleSubmit(e);
          break;
        case 'Escape':
          setShowSuggestions(false);
          setSelectedSuggestionIndex(-1);
          break;
        case 'Tab':
          if (selectedSuggestionIndex >= 0) {
            e.preventDefault();
            setCommand(suggestions[selectedSuggestionIndex]);
            setShowSuggestions(false);
          }
          break;
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, handleSubmit]);

  const selectSuggestion = useCallback((suggestion: string) => {
    setCommand(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, []);

  const usePreset = useCallback((presetCommand: string) => {
    setCommand(presetCommand);
    setShowPresets(false);
    inputRef.current?.focus();
  }, []);

  const filteredHistory = recentHistory.filter(entry =>
    !historyFilter ||
    entry.command.toLowerCase().includes(historyFilter.toLowerCase()) ||
    entry.agentId.toLowerCase().includes(historyFilter.toLowerCase())
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Command Input */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Terminal className="h-5 w-5" />
            <span>Command Center</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Agent and Priority Selection */}
          <div className="flex space-x-2">
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground">Agent</label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {onlineAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-success"></div>
                        <span>{agent.name}</span>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {agent.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-sm font-medium text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={(value: CommandPriority) => setPriority(value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      <div className={cn("flex items-center space-x-2", priorityColors[key as CommandPriority])}>
                        <span>{label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Command Input with Suggestions */}
          <div className="relative">
            <label className="text-sm font-medium text-muted-foreground">Command</label>
            <div className="relative mt-1">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Enter command to execute..."
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  // Delay hiding suggestions to allow for clicks
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                disabled={disabled || isExecuting}
                className="pr-24"
              />

              {/* Action Buttons */}
              <div className="absolute right-1 top-1 flex space-x-1">
                <Dialog open={showHistory} onOpenChange={setShowHistory}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={disabled}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Command History</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Input
                        placeholder="Filter history..."
                        value={historyFilter}
                        onChange={(e) => setHistoryFilter(e.target.value)}
                      />
                      <ScrollArea className="h-96">
                        <div className="space-y-2">
                          {filteredHistory.map((entry, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                              onClick={() => {
                                setCommand(entry.command);
                                setShowHistory(false);
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-mono text-sm truncate">{entry.command}</p>
                                <div className="flex items-center space-x-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {agents.find(a => a.id === entry.agentId)?.name || entry.agentId}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(entry.timestamp).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={showPresets} onOpenChange={setShowPresets}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={disabled}
                    >
                      <BookOpen className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Command Presets</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-96">
                      <div className="space-y-2">
                        {presets.map((preset) => (
                          <div
                            key={preset.id}
                            className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                            onClick={() => usePreset(preset.command)}
                          >
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium">{preset.name}</h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                {preset.description}
                              </p>
                              <code className="text-xs bg-muted px-2 py-1 rounded mt-2 block">
                                {preset.command}
                              </code>
                              <div className="flex items-center space-x-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {preset.category}
                                </Badge>
                                {preset.agentTypes && preset.agentTypes.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    Compatible: {preset.agentTypes.join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>

                <Button
                  type="submit"
                  size="icon"
                  className="h-8 w-8"
                  disabled={disabled || isExecuting || !command.trim() || !selectedAgentId}
                  onClick={handleSubmit}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-auto"
                >
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={cn(
                        "px-3 py-2 cursor-pointer text-sm hover:bg-accent",
                        selectedSuggestionIndex === index && "bg-accent"
                      )}
                      onClick={() => selectSuggestion(suggestion)}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                    >
                      <code className="text-sm">{suggestion}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Status Messages */}
          {(!onlineAgents.length) && (
            <div className="flex items-center space-x-2 p-3 bg-secondary/10 border border-secondary/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-secondary" />
              <span className="text-sm text-secondary/80">
                No agents are currently online. Commands cannot be executed.
              </span>
            </div>
          )}

          {isExecuting && (
            <div className="flex items-center space-x-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <Clock className="h-4 w-4 text-primary animate-spin" />
              <span className="text-sm text-primary/80">
                Command is being executed...
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}