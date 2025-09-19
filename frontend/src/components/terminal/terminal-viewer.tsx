'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import {
  Maximize2,
  Minimize2,
  Search,
  Copy,
  Download,
  Trash2,
  Settings,
  X
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { useUIStore } from '@/stores/ui-store';
import { useTerminalStore } from '@/stores/terminal.store';
import { cn } from '@/lib/utils';
import 'xterm/css/xterm.css';

interface TerminalViewerProps {
  agentId?: string;
  className?: string;
  height?: number;
  readOnly?: boolean;
  onCommand?: (command: string) => void;
  initialContent?: string;
}

interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

const darkTheme: TerminalTheme = {
  background: '#0f0f0f',
  foreground: '#ffffff',
  cursor: '#ffffff',
  selection: '#3b4252',
  black: '#2e3440',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#d08770',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
};

const lightTheme: TerminalTheme = {
  background: '#fafafa',
  foreground: '#2e3440',
  cursor: '#2e3440',
  selection: '#d8dee9',
  black: '#2e3440',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#d08770',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
};

export default function TerminalViewer({
  agentId,
  className,
  height = 400,
  readOnly = false,
  onCommand,
  initialContent
}: TerminalViewerProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const webLinksAddon = useRef<WebLinksAddon | null>(null);
  const lastProcessedLine = useRef<number>(0);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCommand, setCurrentCommand] = useState('');

  const { theme, addNotification } = useUIStore();
  const { activeSessionId, getActiveSessionOutput } = useTerminalStore();

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const currentTheme = theme === 'dark' ? darkTheme : lightTheme;

    terminal.current = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, "Liberation Mono", Menlo, Courier, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: currentTheme,
      cursorBlink: !readOnly,
      cursorStyle: 'block',
      scrollback: 10000,
      tabStopWidth: 4,
      allowProposedApi: true,
    });

    fitAddon.current = new FitAddon();
    webLinksAddon.current = new WebLinksAddon();

    terminal.current.loadAddon(fitAddon.current);
    terminal.current.loadAddon(webLinksAddon.current);

    terminal.current.open(terminalRef.current);
    fitAddon.current.fit();

    // Reset line counter
    lastProcessedLine.current = 0;

    // Handle initial content
    if (initialContent) {
      terminal.current.write(initialContent);
    } else if (!readOnly) {
      terminal.current.write('\r\n$ ');
    }

    // Handle input for interactive mode
    if (!readOnly) {
      terminal.current.onData((data) => {
        const code = data.charCodeAt(0);

        if (code === 13) { // Enter
          if (currentCommand.trim()) {
            setCommandHistory(prev => [...prev, currentCommand]);
            setHistoryIndex(-1);
            onCommand?.(currentCommand);
            setCurrentCommand('');
          }
          terminal.current?.write('\r\n$ ');
        } else if (code === 127) { // Backspace
          if (currentCommand.length > 0) {
            setCurrentCommand(prev => prev.slice(0, -1));
            terminal.current?.write('\b \b');
          }
        } else if (code === 27) { // Escape sequences (arrow keys)
          const sequence = data.slice(1);
          if (sequence === '[A' && commandHistory.length > 0) { // Up arrow
            const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
            if (newIndex !== historyIndex) {
              setHistoryIndex(newIndex);
              const command = commandHistory[commandHistory.length - 1 - newIndex];
              // Clear current line and write historical command
              terminal.current?.write('\r$ ' + ' '.repeat(currentCommand.length) + '\r$ ');
              terminal.current?.write(command);
              setCurrentCommand(command);
            }
          } else if (sequence === '[B' && historyIndex > -1) { // Down arrow
            const newIndex = Math.max(historyIndex - 1, -1);
            setHistoryIndex(newIndex);
            if (newIndex === -1) {
              terminal.current?.write('\r$ ' + ' '.repeat(currentCommand.length) + '\r$ ');
              setCurrentCommand('');
            } else {
              const command = commandHistory[commandHistory.length - 1 - newIndex];
              terminal.current?.write('\r$ ' + ' '.repeat(currentCommand.length) + '\r$ ');
              terminal.current?.write(command);
              setCurrentCommand(command);
            }
          }
        } else if (code >= 32 && code <= 126) { // Printable characters
          setCurrentCommand(prev => prev + data);
          terminal.current?.write(data);
        }
      });
    }

    return () => {
      terminal.current?.dispose();
    };
  }, [theme, readOnly, onCommand, initialContent]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      fitAddon.current?.fit();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle fullscreen changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fitAddon.current?.fit();
    }, 100);

    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Subscribe to terminal output from store
  useEffect(() => {
    if (!terminal.current || !activeSessionId) return;

    const updateInterval = setInterval(() => {
      const terminalLines = getActiveSessionOutput();

      // Only process new lines
      if (terminalLines.length > lastProcessedLine.current) {
        const newLines = terminalLines.slice(lastProcessedLine.current);

        newLines.forEach(line => {
          // Apply ANSI codes if present
          let outputText = line.content;

          if (line.ansiCodes && line.ansiCodes.length > 0) {
            // Wrap content with ANSI codes
            outputText = line.ansiCodes.join('') + outputText + '\x1b[0m';
          }

          // Add color based on stream type
          if (line.type === 'stderr') {
            outputText = '\x1b[31m' + outputText + '\x1b[0m'; // Red for stderr
          }

          terminal.current?.write(outputText + '\r\n');
        });

        lastProcessedLine.current = terminalLines.length;

        // Auto-scroll to bottom
        terminal.current?.scrollToBottom();
      }
    }, 50); // Check every 50ms for new output

    return () => {
      clearInterval(updateInterval);
    };
  }, [activeSessionId, getActiveSessionOutput]);

  // Handle scroll to bottom event
  useEffect(() => {
    const handleScrollToBottom = () => {
      terminal.current?.scrollToBottom();
    };

    window.addEventListener('terminal:scrollToBottom', handleScrollToBottom);
    return () => {
      window.removeEventListener('terminal:scrollToBottom', handleScrollToBottom);
    };
  }, []);

  const writeToTerminal = useCallback((data: string) => {
    terminal.current?.write(data);
  }, []);

  const clearTerminal = useCallback(() => {
    terminal.current?.clear();
    if (!readOnly) {
      terminal.current?.write('$ ');
      setCurrentCommand('');
    }
  }, [readOnly]);

  const copyContent = useCallback(async () => {
    if (!terminal.current) return;

    try {
      const selection = terminal.current.getSelection();
      if (selection) {
        await navigator.clipboard.writeText(selection);
        addNotification({
          title: 'Copied',
          description: 'Terminal content copied to clipboard',
          type: 'success',
        });
      } else {
        addNotification({
          title: 'No Selection',
          description: 'Please select text to copy',
          type: 'warning',
        });
      }
    } catch (error) {
      addNotification({
        title: 'Copy Failed',
        description: 'Failed to copy to clipboard',
        type: 'error',
      });
    }
  }, [addNotification]);

  const downloadLog = useCallback(() => {
    if (!terminal.current) return;

    try {
      // Get terminal content (this is a simplified version)
      const content = 'Terminal log export functionality would be implemented here';
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terminal-${agentId || 'session'}-${Date.now()}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification({
        title: 'Download Started',
        description: 'Terminal log download started',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Download Failed',
        description: 'Failed to download terminal log',
        type: 'error',
      });
    }
  }, [agentId, addNotification]);

  const handleSearch = useCallback((term: string) => {
    // Search functionality would be implemented here
    // This is a placeholder for the search feature
    addNotification({
      title: 'Search',
      description: `Searching for: ${term}`,
      type: 'info',
    });
  }, [addNotification]);

  const TerminalContent = () => (
    <div className="flex flex-col h-full">
      {/* Terminal Header */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/50">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-sm font-medium">
            {agentId ? `Agent: ${agentId}` : 'Terminal'}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {searchVisible && (
            <div className="flex items-center space-x-1">
              <Input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch(searchTerm);
                  }
                  if (e.key === 'Escape') {
                    setSearchVisible(false);
                    setSearchTerm('');
                  }
                }}
                className="w-32 h-6 text-xs"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearchVisible(false);
                  setSearchTerm('');
                }}
                className="h-6 w-6"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {!searchVisible && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchVisible(true)}
                className="h-6 w-6"
              >
                <Search className="h-3 w-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={copyContent}
                className="h-6 w-6"
              >
                <Copy className="h-3 w-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={downloadLog}
                className="h-6 w-6"
              >
                <Download className="h-3 w-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={clearTerminal}
                className="h-6 w-6"
              >
                <Trash2 className="h-3 w-3" />
              </Button>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Settings className="h-3 w-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Terminal Settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Terminal configuration options would be available here.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>

              {!isFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFullscreen(true)}
                  className="h-6 w-6"
                >
                  <Maximize2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={terminalRef}
          className="w-full h-full"
          style={{ height: isFullscreen ? 'calc(100vh - 120px)' : `${height}px` }}
        />
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">Terminal - Full Screen</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(false)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1">
            <TerminalContent />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      <TerminalContent />
    </div>
  );
}

// Export additional hook for external control
export function useTerminal(terminalId: string) {
  const [terminal, setTerminal] = useState<{
    write: (data: string) => void;
    clear: () => void;
  } | null>(null);

  return {
    terminal,
    setTerminal,
    write: (data: string) => terminal?.write(data),
    clear: () => terminal?.clear(),
  };
}