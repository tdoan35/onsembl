'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import '@/styles/terminal-fix.css';

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

// Simple Terminal Component
interface SimpleTerminalProps {
  agentId?: string;
  onCommand?: (command: string) => void;
  readOnly?: boolean;
  height?: number;
  onSwitchToXterm?: () => void;
}

function SimpleTerminal({
  agentId,
  onCommand,
  readOnly = false,
  height = 400,
  onSwitchToXterm
}: SimpleTerminalProps) {
  const [currentInput, setCurrentInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { getActiveSessionOutput, addOutput, activeSessionId } = useTerminalStore();
  const { addNotification } = useUIStore();

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [getActiveSessionOutput()]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentInput.trim()) {
      // Add command to history
      setCommandHistory(prev => [...prev, currentInput]);
      setHistoryIndex(-1);

      // Display command in output (immediate feedback)
      if (activeSessionId) {
        addOutput(activeSessionId, `$ ${currentInput}`, 'stdout', undefined, true); // Mark as command
      }

      // Send command to agent
      if (onCommand) {
        try {
          await onCommand(currentInput);
        } catch (error) {
          console.error('[SimpleTerminal] Error executing command:', error);
          addNotification({
            title: 'Command Error',
            description: 'Failed to execute command',
            type: 'error',
          });
        }
      }

      // Clear input
      setCurrentInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Navigate command history up
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Navigate command history down
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentInput('');
      }
    }
  };

  const terminalLines = getActiveSessionOutput();

  return (
    <div
      className="simple-terminal-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#1a1b26',
        color: '#a9b1d6',
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        fontSize: '14px',
        lineHeight: '1.5'
      }}
    >
      {/* Terminal Output Area */}
      <div
        ref={outputRef}
        className="terminal-output"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {/* Debug/Testing Controls */}
        {onSwitchToXterm && (
          <div style={{ marginBottom: '10px' }}>
            <button
              onClick={onSwitchToXterm}
              style={{
                background: '#7aa2f7',
                color: '#1a1b26',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                marginBottom: '10px'
              }}
            >
              Switch to xterm.js (Debug)
            </button>
          </div>
        )}

        {/* Welcome Message */}
        {terminalLines.length === 0 && (
          <div style={{ color: '#73daca' }}>
            Welcome to Onsembl Agent Terminal
            <br />
            {agentId ? `Connected to: ${agentId}` : 'No agent selected'}
            <br />
            Type a command and press Enter...
          </div>
        )}

        {/* Terminal Lines */}
        {terminalLines.map((line, index) => {
          return (
            <div
              key={index}
              className="terminal-line"
              style={{
                color: line.type === 'stderr'
                  ? '#f7768e' // Red for errors
                  : line.isCommand
                    ? '#7aa2f7' // Blue for commands
                    : '#a9b1d6', // Default color
                marginBottom: '2px'
              }}
            >
              {/* Apply ANSI codes if present */}
              {line.ansiCodes && line.ansiCodes.length > 0 ? (
                <span dangerouslySetInnerHTML={{
                  __html: line.content
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\x1b\[(\d+)m/g, (match, code) => {
                      // Simple ANSI code to style mapping
                      const styles: { [key: string]: string } = {
                        '31': 'color: #f7768e', // Red
                        '32': 'color: #73daca', // Green
                        '33': 'color: #e0af68', // Yellow
                        '34': 'color: #7aa2f7', // Blue
                        '35': 'color: #bb9af7', // Magenta
                        '36': 'color: #7dcfff', // Cyan
                        '37': 'color: #a9b1d6', // White
                        '0': '', // Reset
                      };
                      return styles[code] ? `<span style="${styles[code]}">` : '</span>';
                    })
                }} />
              ) : (
                line.content
              )}
            </div>
          );
        })}
      </div>

      {/* Terminal Input Area */}
      {!readOnly && (
        <div
          className="terminal-input"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px',
            borderTop: '1px solid #3b4261',
            backgroundColor: '#16161e'
          }}
        >
          <span style={{ color: '#7aa2f7', fontWeight: 'bold', marginRight: '8px' }}>
            $
          </span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command and press Enter..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#a9b1d6',
              fontFamily: 'inherit',
              fontSize: 'inherit'
            }}
            autoFocus
          />
        </div>
      )}

      {/* Status Bar */}
      <div
        style={{
          padding: '5px 10px',
          backgroundColor: '#1a1b26',
          borderTop: '1px solid #3b4261',
          fontSize: '12px',
          color: '#565f89',
          display: 'flex',
          justifyContent: 'space-between'
        }}
      >
        <span>
          {terminalLines.length} lines | {commandHistory.length} commands in history
        </span>
        {activeSessionId && (
          <span>Session: {activeSessionId}</span>
        )}
      </div>
    </div>
  );
}

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
  const onCommandRef = useRef(onCommand);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCommand, setCurrentCommand] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false); // Prevent multiple initialization attempts
  const [useSimpleTerminal, setUseSimpleTerminal] = useState(true); // Use simple terminal while debugging xterm
  const [terminalKey, setTerminalKey] = useState(0); // Force re-mount when switching

  const { theme, addNotification } = useUIStore();
  const { activeSessionId, getActiveSessionOutput } = useTerminalStore();

  // Initialize terminal
  useEffect(() => {
    console.log('[Terminal] useEffect triggered, useSimpleTerminal:', useSimpleTerminal, 'has ref:', !!terminalRef.current);

    if (useSimpleTerminal) {
      // Clean up xterm when switching to simple terminal
      if (terminal.current) {
        try {
          console.log('[Terminal] Disposing xterm for simple terminal mode');
          terminal.current.dispose();
        } catch (e) {
          console.warn('[Terminal] Error disposing terminal:', e);
        }
        terminal.current = null;
        fitAddon.current = null;
        webLinksAddon.current = null;
        setIsInitialized(false);
      }
      return;
    }

    if (!terminalRef.current) {
      console.log('[Terminal] No ref available, waiting...');
      return;
    }

    // Always clean up existing terminal before creating new one
    if (terminal.current) {
      try {
        console.log('[Terminal] Cleaning up existing terminal');
        terminal.current.dispose();
      } catch (e) {
        console.warn('[Terminal] Error disposing terminal:', e);
      }
      terminal.current = null;
      fitAddon.current = null;
      webLinksAddon.current = null;
      setIsInitialized(false);
    }

    // Defer initialization until next frame to ensure layout is complete
    const initializeTerminal = () => {
      if (!terminalRef.current) return;

      // Prevent multiple initialization attempts
      if (isInitializing || terminal.current) {
        console.log('[Terminal] Already initializing or initialized, skipping');
        return;
      }

      const rect = terminalRef.current.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(terminalRef.current);
      const parentRect = terminalRef.current.parentElement?.getBoundingClientRect();

      // Ensure container has dimensions before initializing
      if (rect.width === 0 || rect.height === 0) {
        console.error('[Terminal] Container has no dimensions, retrying in 100ms...', {
          width: rect.width,
          height: rect.height
        });
        setTimeout(() => {
          if (terminalRef.current && !terminal.current) {
            initializeTerminal();
          }
        }, 100);
        return;
      }

      // Set initializing flag
      setIsInitializing(true);

      console.log('[Terminal] Container debugging:', {
        container: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          offsetWidth: terminalRef.current.offsetWidth,
          offsetHeight: terminalRef.current.offsetHeight,
          clientWidth: terminalRef.current.clientWidth,
          clientHeight: terminalRef.current.clientHeight,
        },
        styles: {
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          opacity: computedStyle.opacity,
          position: computedStyle.position,
          backgroundColor: computedStyle.backgroundColor,
          color: computedStyle.color,
          overflow: computedStyle.overflow,
          width: computedStyle.width,
          height: computedStyle.height,
          minHeight: computedStyle.minHeight,
          maxHeight: computedStyle.maxHeight,
        },
        parent: parentRect ? {
          width: parentRect.width,
          height: parentRect.height,
        } : null,
        className: terminalRef.current.className,
        id: terminalRef.current.id,
      });

      // Create new terminal instance with minimal configuration
      console.log('[Terminal] Creating Terminal instance, Terminal constructor:', Terminal);

      if (!Terminal) {
        console.error('[Terminal] ERROR: Terminal constructor is undefined! xterm.js may not be loaded');
        throw new Error('Terminal constructor not available');
      }

      let term;
      try {
        term = new Terminal({
          fontSize: 14,
          fontFamily: 'Consolas, "Courier New", monospace',
          theme: {
            background: '#1e1e1e',
            foreground: '#ffffff',
          },
          cursorBlink: true,
          scrollback: 10000,
        });
        console.log('[Terminal] Terminal instance created:', term);
      } catch (e) {
        console.error('[Terminal] Failed to create Terminal instance:', e);
        throw e;
      }

      try {
        console.log('[Terminal] About to open terminal in container:', terminalRef.current);

        // Defer opening the terminal to ensure container is ready
        setTimeout(() => {
          if (!terminalRef.current || !term) {
            console.error('[Terminal] Container or terminal lost during deferred open');
            setIsInitializing(false);
            return;
          }

          try {
            // Open the terminal in the container
            term.open(terminalRef.current);

            console.log('[Terminal] Terminal opened, checking DOM...');

            // Verify xterm created elements
            const xtermEl = terminalRef.current.querySelector('.xterm');
            if (!xtermEl) {
              console.error('[Terminal] ERROR: xterm did not create DOM elements!');
              throw new Error('xterm failed to create DOM elements');
            }

            console.log('[Terminal] Terminal DOM verified, creating addons...');

            // Create addons AFTER opening to ensure terminal is ready
            const fit = new FitAddon();
            const webLinks = new WebLinksAddon();

            // Load addons
            term.loadAddon(webLinks);

            // Store refs after successful initialization
            terminal.current = term;
            webLinksAddon.current = webLinks;
            setIsInitialized(true);
            setIsInitializing(false);

            console.log('[Terminal] Terminal opened successfully');

            // Delay loading FitAddon to ensure container is ready
            setTimeout(() => {
              try {
                console.log('[Terminal] Loading FitAddon...');
                term.loadAddon(fit);

                // Fit terminal after a small delay to ensure dimensions are available
                setTimeout(() => {
                  try {
                    console.log('[Terminal] Fitting terminal to container...');
                    fit.fit();
                    console.log('[Terminal] Fit successful, terminal dimensions:', {
                      cols: term.cols,
                      rows: term.rows
                    });
                  } catch (fitError) {
                    console.error('[Terminal] Error fitting terminal:', fitError);
                    // Continue anyway - terminal will work without perfect fit
                  }
                }, 50);

                fitAddon.current = fit;
              } catch (fitAddonError) {
                console.error('[Terminal] Error loading FitAddon:', fitAddonError);
                // Continue without fit addon - terminal will still work
              }
            }, 100); // Give container time to settle

            // Test write to verify terminal is working
            try {
              term.write('\x1b[36m==== Terminal Test ====\x1b[0m\r\n');
              term.write('If you can see this, the terminal is working!\r\n');
              term.write('\x1b[32m✓ Terminal initialized successfully\x1b[0m\r\n');
              term.write('----------------------------------------\r\n');
              console.log('[Terminal] Test write successful');

              // Check buffer state after write
              const buffer = term.buffer.active;
              console.log('[Terminal] Buffer state after test write:', {
            cursorY: buffer.cursorY,
            cursorX: buffer.cursorX,
            length: buffer.length,
            viewportY: buffer.viewportY,
            baseY: buffer.baseY,
            hasContent: buffer.length > 0,
            // Get first few lines to verify content
            lines: Array.from({ length: Math.min(5, buffer.length) }, (_, i) => {
              const line = buffer.getLine(i);
              return line ? line.translateToString() : null;
            }).filter(Boolean),
            cols: term.cols,
            rows: term.rows,
          });

          // Also check the DOM element that was created
          const xtermElement = terminalRef.current.querySelector('.xterm');
          const xtermScreen = terminalRef.current.querySelector('.xterm-screen');
          const xtermViewport = terminalRef.current.querySelector('.xterm-viewport');

          console.log('[Terminal] DOM elements created:', {
            hasXtermElement: !!xtermElement,
            hasXtermScreen: !!xtermScreen,
            hasXtermViewport: !!xtermViewport,
            xtermDimensions: xtermElement ? {
              width: (xtermElement as HTMLElement).offsetWidth,
              height: (xtermElement as HTMLElement).offsetHeight,
              style: window.getComputedStyle(xtermElement as HTMLElement).cssText,
            } : null,
            screenDimensions: xtermScreen ? {
              width: (xtermScreen as HTMLElement).offsetWidth,
              height: (xtermScreen as HTMLElement).offsetHeight,
              style: window.getComputedStyle(xtermScreen as HTMLElement).cssText,
            } : null,
          });

            } catch (e) {
              console.error('[Terminal] Test write failed:', e);
            }

            // Reset line counter
            lastProcessedLine.current = 0;

            // Handle initial content - use local variable to avoid dependency
            const initContent = initialContent;
            if (initContent) {
              term.write(initContent);
            } else if (!readOnly) {
              term.write('\r\n$ ');
            }

            // Handle input for interactive mode
            if (!readOnly) {
              term.onData((data) => {
            const code = data.charCodeAt(0);

            if (code === 13) { // Enter
              if (currentCommand.trim()) {
                setCommandHistory(prev => [...prev, currentCommand]);
                setHistoryIndex(-1);
                onCommandRef.current?.(currentCommand);
                setCurrentCommand('');
              }
              term.write('\r\n$ ');
            } else if (code === 127) { // Backspace
              if (currentCommand.length > 0) {
                setCurrentCommand(prev => prev.slice(0, -1));
                term.write('\b \b');
              }
            } else if (code === 27) { // Escape sequences (arrow keys)
              const sequence = data.slice(1);
              if (sequence === '[A' && commandHistory.length > 0) { // Up arrow
                const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
                if (newIndex !== historyIndex) {
                  setHistoryIndex(newIndex);
                  const command = commandHistory[commandHistory.length - 1 - newIndex] || '';
                  // Clear current line and write historical command
                  term.write('\r$ ' + ' '.repeat(currentCommand.length) + '\r$ ');
                  if (command) {
                    term.write(command);
                  }
                  setCurrentCommand(command);
                }
              } else if (sequence === '[B' && historyIndex > -1) { // Down arrow
                const newIndex = Math.max(historyIndex - 1, -1);
                setHistoryIndex(newIndex);
                if (newIndex === -1) {
                  term.write('\r$ ' + ' '.repeat(currentCommand.length) + '\r$ ');
                  setCurrentCommand('');
                } else {
                  const command = commandHistory[commandHistory.length - 1 - newIndex] || '';
                  term.write('\r$ ' + ' '.repeat(currentCommand.length) + '\r$ ');
                  if (command) {
                    term.write(command);
                  }
                  setCurrentCommand(command);
                }
              }
            } else if (code >= 32 && code <= 126) { // Printable characters
              setCurrentCommand(prev => prev + data);
              term.write(data);
                }
              });
            }
          } catch (e) {
            console.error('[Terminal] CRITICAL ERROR opening terminal:', e);
            console.error('[Terminal] Stack trace:', (e as Error).stack);
            setIsInitialized(false);
            setIsInitializing(false);

            // Try fallback to simple terminal on error
            addNotification({
              title: 'Terminal Error',
              description: 'xterm.js failed to initialize. Using simple terminal as fallback.',
              type: 'error',
            });
            setUseSimpleTerminal(true);
          }
        }, 50); // Defer opening terminal by 50ms to ensure container is ready
      } catch (e) {
        console.error('[Terminal] Failed during initialization setup:', e);
        setIsInitializing(false);
      }
    };

    // Wait for layout to complete
    const rafId = requestAnimationFrame(() => {
      try {
        initializeTerminal();
      } catch (e) {
        console.error('[Terminal] Error in requestAnimationFrame:', e);
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (terminal.current) {
        try {
          terminal.current.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
        terminal.current = null;
      }
      fitAddon.current = null;
      webLinksAddon.current = null;
      setIsInitialized(false);
    };
  }, [theme, readOnly, useSimpleTerminal, terminalKey]); // Added terminalKey to force re-init

  // Keep onCommand ref updated without triggering terminal re-initialization
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (terminal.current && fitAddon.current) {
        try {
          // Check if terminal is still attached to DOM
          const terminalElement = terminalRef.current?.querySelector('.xterm');
          if (terminalElement) {
            fitAddon.current.fit();
          }
        } catch (e) {
          console.warn('[Terminal] Error during resize fit:', e);
          // Ignore fit errors during disposal
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle fullscreen changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (terminal.current && fitAddon.current) {
        try {
          // Check if terminal is still attached to DOM
          const terminalElement = terminalRef.current?.querySelector('.xterm');
          if (terminalElement) {
            fitAddon.current.fit();
          }
        } catch (e) {
          // Ignore fit errors during disposal
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Subscribe to terminal output from store
  useEffect(() => {
    if (!terminal.current || !activeSessionId || !isInitialized) {
      console.log('[TerminalViewer] Polling not started:', {
        hasTerminal: !!terminal.current,
        activeSessionId,
        isInitialized
      });
      return;
    }

    console.log('[TerminalViewer] Starting polling for session:', activeSessionId);
    let pollCount = 0;

    const updateInterval = setInterval(() => {
      if (!terminal.current) return; // Double-check terminal still exists

      pollCount++;

      try {
        const terminalLines = getActiveSessionOutput();

        // Log polling activity every 20 polls (every second)
        if (pollCount % 20 === 0) {
          console.log('[TerminalViewer] Polling status:', {
            activeSessionId,
            totalLines: terminalLines.length,
            lastProcessed: lastProcessedLine.current,
            newLines: terminalLines.length - lastProcessedLine.current
          });
        }

        // Only process new lines
        if (terminalLines.length > lastProcessedLine.current) {
          const newLines = terminalLines.slice(lastProcessedLine.current);

          console.log('[TerminalViewer] Processing new lines:', {
            activeSessionId,
            newLineCount: newLines.length,
            totalLines: terminalLines.length
          });

          newLines.forEach((line, index) => {
            if (!terminal.current) return; // Check before each write

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

            try {
              console.log(`[TerminalViewer] Writing line ${index + 1}/${newLines.length}:`, {
                content: line.content.substring(0, 50),
                type: line.type,
                outputText: outputText,
                hasContent: !!outputText
              });

              // Only write if there's actual content
              if (outputText) {
                terminal.current.write(outputText + '\r\n');
                // Force refresh after write
                terminal.current.refresh(0, terminal.current.rows - 1);
              }
            } catch (e) {
              console.error('[TerminalViewer] Error writing to terminal:', e);
            }
          });

          lastProcessedLine.current = terminalLines.length;

          // Auto-scroll to bottom
          if (terminal.current) {
            try {
              terminal.current.scrollToBottom();
            } catch (e) {
              // Ignore scroll errors during disposal
            }
          }
        }
      } catch (e) {
        console.error('[TerminalViewer] Error in polling loop:', e);
      }
    }, 50); // Check every 50ms for new output

    return () => {
      console.log('[TerminalViewer] Stopping polling for session:', activeSessionId);
      clearInterval(updateInterval);
    };
  }, [activeSessionId, getActiveSessionOutput, isInitialized]);

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
      <div className="flex-1 overflow-hidden relative" style={{ minHeight: `${height}px` }}>
        {useSimpleTerminal ? (
          // Simple Terminal Implementation with Input
          <SimpleTerminal
            agentId={agentId}
            onCommand={onCommand}
            readOnly={readOnly}
            height={height}
            onSwitchToXterm={() => {
              console.log('[Terminal] Switching to xterm.js...');
              setTerminalKey(prev => prev + 1); // Force re-mount
              setIsInitialized(false); // Reset initialized state
              setIsInitializing(false); // Reset initializing flag
              setUseSimpleTerminal(false);
            }}
          />
        ) : (
          // xterm.js Terminal - use key to force remount
          <div key={`xterm-${terminalKey}`} style={{ position: 'relative', height: '100%' }}>
            <button
              onClick={() => setUseSimpleTerminal(true)}
              style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                background: '#7aa2f7',
                color: '#1a1b26',
                border: 'none',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                zIndex: 1000,
                fontSize: '12px'
              }}
            >
              Use Simple Terminal
            </button>
            <div
              ref={(el) => {
                // Force ref to be set when switching
                terminalRef.current = el;
                if (el && !useSimpleTerminal) {
                  console.log('[Terminal] Container ref set, triggering initialization');
                  // Force re-initialization by clearing the terminal reference
                  if (terminal.current) {
                    terminal.current.dispose();
                    terminal.current = null;
                    setIsInitialized(false);
                  }
                }
              }}
              className="xterm-container"
              style={{
                backgroundColor: '#1e1e1e',
                minHeight: `${height}px`,
                height: `${height}px`,
                width: '100%',
                position: 'relative',
                overflow: 'hidden',
                // Force visibility
                opacity: 1,
                visibility: 'visible',
                display: 'block'
              }}
            >
              {/* Fallback text to test visibility */}
              {!isInitialized && (
                <div style={{ color: '#00ff00', fontSize: '14px', fontFamily: 'monospace', padding: '10px' }}>
                  Terminal container is visible. Initializing xterm...
                </div>
              )}
            </div>
          </div>
        )}
        {!useSimpleTerminal && !isInitialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="text-sm text-muted-foreground">Initializing terminal...</div>
          </div>
        )}
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