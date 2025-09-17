'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css';

import { useTerminalStore } from '@/stores/terminal.store';
import { useWebSocketStore } from '@/stores/websocket.store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Trash2,
  Terminal as TerminalIcon,
  Loader2
} from 'lucide-react';

export interface TerminalProps {
  agentId: string;
  className?: string;
  height?: number | string;
  onCommand?: (command: string) => void;
  showHeader?: boolean;
  enableInput?: boolean;
}

export function Terminal({
  agentId,
  className,
  height = 400,
  onCommand,
  showHeader = true,
  enableInput = true
}: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const { outputs, getAgentOutputs, clearTerminal } = useTerminalStore();
  const { isConnected } = useWebSocketStore();

  const agentOutputs = getAgentOutputs(agentId);
  const lastProcessedIndex = useRef(0);

  const initTerminal = useCallback(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selection: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowTransparency: false,
      windowsMode: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      allowProposedApi: true
    });

    // Initialize addons
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(webLinksAddon);

    // Try to use WebGL for better performance
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      xterm.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon not supported, falling back to canvas renderer');
    }

    // Open terminal in the DOM
    xterm.open(terminalRef.current);
    fitAddon.fit();

    // Handle input if enabled
    if (enableInput) {
      let currentLine = '';

      xterm.onData((data) => {
        // Handle special keys
        if (data === '\r') { // Enter key
          if (currentLine.trim() && onCommand) {
            onCommand(currentLine.trim());
            xterm.writeln('');
            currentLine = '';
          }
        } else if (data === '\u007F') { // Backspace
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            xterm.write('\b \b');
          }
        } else if (data === '\u0003') { // Ctrl+C
          xterm.writeln('^C');
          currentLine = '';
        } else if (data.charCodeAt(0) >= 32) { // Printable characters
          currentLine += data;
          xterm.write(data);
        }
      });
    }

    // Store refs
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    setIsInitialized(true);

    // Welcome message
    xterm.writeln(`\x1b[1;32mTerminal connected to agent: ${agentId}\x1b[0m`);
    xterm.writeln(`\x1b[2mType commands and press Enter to execute.\x1b[0m`);
    xterm.writeln('');
  }, [agentId, enableInput, onCommand]);

  // Initialize terminal on mount
  useEffect(() => {
    initTerminal();

    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, [initTerminal]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Process new outputs
  useEffect(() => {
    if (!xtermRef.current || !agentOutputs.length) return;

    const newOutputs = agentOutputs.slice(lastProcessedIndex.current);

    newOutputs.forEach((output) => {
      const timestamp = new Date(output.timestamp).toLocaleTimeString();
      const prefix = `[${timestamp}] `;

      if (output.type === 'stdout') {
        xtermRef.current!.writeln(`\x1b[0m${output.content}`);
      } else if (output.type === 'stderr') {
        xtermRef.current!.writeln(`\x1b[31m${output.content}\x1b[0m`);
      } else if (output.type === 'system') {
        xtermRef.current!.writeln(`\x1b[33m${prefix}${output.content}\x1b[0m`);
      } else if (output.type === 'command') {
        xtermRef.current!.writeln(`\x1b[36m$ ${output.content}\x1b[0m`);
      }
    });

    lastProcessedIndex.current = agentOutputs.length;
  }, [agentOutputs]);

  const handleCopyAll = () => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      } else {
        // Copy all buffer
        const buffer = xtermRef.current.buffer.active;
        let text = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            text += line.translateToString() + '\n';
          }
        }
        navigator.clipboard.writeText(text);
      }
    }
  };

  const handleDownload = () => {
    if (xtermRef.current) {
      const buffer = xtermRef.current.buffer.active;
      let text = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          text += line.translateToString() + '\n';
        }
      }

      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terminal-${agentId}-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      clearTerminal(agentId);
      lastProcessedIndex.current = 0;
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 100);
  };

  return (
    <Card
      className={cn(
        'relative',
        isFullscreen && 'fixed inset-4 z-50',
        className
      )}
    >
      {showHeader && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="h-5 w-5" />
            <CardTitle className="text-base">Terminal Output</CardTitle>
            {isConnected ? (
              <Badge variant="default" className="h-5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400 mr-1 animate-pulse" />
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="h-5">
                Offline
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopyAll}
              title="Copy terminal content"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDownload}
              title="Download terminal log"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClear}
              title="Clear terminal"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
      )}

      <CardContent className="p-0">
        <div
          ref={terminalRef}
          className="bg-[#1e1e1e] rounded-b-lg overflow-hidden"
          style={{
            height: isFullscreen ? 'calc(100vh - 120px)' :
                   typeof height === 'number' ? `${height}px` : height
          }}
        />

        {!isInitialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Initializing terminal...</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default Terminal;