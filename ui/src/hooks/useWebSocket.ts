import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '../stores/connection';

interface WsMessage {
  type: string;
  channel?: string;
  data?: unknown;
  timestamp?: number;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const queryClient = useQueryClient();
  const setConnected = useConnectionStore((s) => s.setConnected);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      
      // Subscribe to all events
      ws.send(JSON.stringify({
        type: 'subscribe',
        channels: ['app', 'system', 'file'],
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      wsRef.current = null;
      
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [setConnected]);

  const handleMessage = useCallback((message: WsMessage) => {
    // Handle different event types
    switch (message.type) {
      case 'app:installed':
      case 'app:uninstalled':
      case 'app:started':
      case 'app:stopped':
        // Invalidate apps query to refetch
        queryClient.invalidateQueries({ queryKey: ['apps'] });
        break;
        
      case 'file:created':
      case 'file:deleted':
      case 'file:modified':
        // Invalidate documents query
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        break;
        
      case 'system:info':
        // Could update system info in real-time
        queryClient.invalidateQueries({ queryKey: ['system'] });
        break;
    }
  }, [queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef;
}
