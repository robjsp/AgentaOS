import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  appId: string;
  onClose?: () => void;
  onError?: (message: string) => void;
}

interface ServerMessage {
  type: 'ready' | 'data' | 'exit' | 'error';
  sessionId?: string;
  data?: string;
  exitCode?: number;
  message?: string;
}

export function Terminal({ appId, onClose: _onClose, onError }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'input',
        data: btoa(data),  // Base64 encode
      }));
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'resize',
        cols,
        rows,
      }));
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#3b82f680',
        black: '#1a1a2e',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
    });

    terminalRef.current = terminal;

    // Add fit addon for auto-resize
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    // Add web links addon for clickable URLs
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(webLinksAddon);

    // Open terminal in container
    terminal.open(containerRef.current);
    fitAddon.fit();

    // Handle terminal input
    terminal.onData((data) => {
      sendInput(data);
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
        sendResize(terminalRef.current.cols, terminalRef.current.rows);
      }
    };

    terminal.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    // Window resize listener
    window.addEventListener('resize', handleResize);

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal/${appId}`;
    
    terminal.writeln('Connecting to terminal...');
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      terminal.writeln('Connected. Starting shell...');
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'ready':
            sessionIdRef.current = message.sessionId || null;
            terminal.clear();
            // Send initial size
            sendResize(terminal.cols, terminal.rows);
            break;

          case 'data':
            if (message.data) {
              // Decode base64 data
              const decoded = atob(message.data);
              terminal.write(decoded);
            }
            break;

          case 'exit':
            terminal.writeln(`\r\n\x1b[33mShell exited with code ${message.exitCode}\x1b[0m`);
            sessionIdRef.current = null;
            break;

          case 'error':
            terminal.writeln(`\r\n\x1b[31mError: ${message.message}\x1b[0m`);
            onError?.(message.message || 'Unknown error');
            break;
        }
      } catch (err) {
        console.error('Failed to parse terminal message:', err);
      }
    };

    ws.onclose = () => {
      terminal.writeln('\r\n\x1b[33mConnection closed\x1b[0m');
      sessionIdRef.current = null;
    };

    ws.onerror = (error) => {
      console.error('Terminal WebSocket error:', error);
      terminal.writeln('\r\n\x1b[31mConnection error\x1b[0m');
      onError?.('Connection error');
    };

    // Focus terminal
    terminal.focus();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      terminal.dispose();
    };
  }, [appId, sendInput, sendResize, onError]);

  // Handle fit on visibility change (for when modal opens)
  useEffect(() => {
    const timer = setTimeout(() => {
      fitAddonRef.current?.fit();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full bg-[#1a1a2e] rounded-lg overflow-hidden"
      style={{ minHeight: '300px' }}
    />
  );
}
