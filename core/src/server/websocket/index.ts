import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { logger } from '../../lib/logger';
import { eventBus, SystemEvent } from '../../lib/events';

interface WsMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  channels?: string[];
}

interface WsClient {
  socket: SocketStream;
  subscriptions: Set<string>;
}

const clients = new Set<WsClient>();

// Broadcast to all clients subscribed to a channel
function broadcast(channel: string, event: SystemEvent): void {
  const message = JSON.stringify({
    channel,
    ...event,
  });

  for (const client of clients) {
    if (client.subscriptions.has(channel) || client.subscriptions.has('*')) {
      try {
        client.socket.socket.send(message);
      } catch (error) {
        logger.error('Failed to send to client:', error);
      }
    }
  }
}

// Subscribe to system events and broadcast
eventBus.on('*', (event: SystemEvent) => {
  const channel = event.type.split(':')[0]; // e.g., 'app' from 'app:started'
  broadcast(channel, event);
  broadcast('*', event); // Also broadcast to wildcard subscribers
});

export function websocketHandler(connection: SocketStream, _request: FastifyRequest): void {
  const client: WsClient = {
    socket: connection,
    subscriptions: new Set(),
  };
  
  clients.add(client);
  logger.info(`WebSocket client connected (${clients.size} total)`);

  connection.socket.on('message', (data: Buffer) => {
    try {
      const message: WsMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          if (message.channels) {
            for (const channel of message.channels) {
              client.subscriptions.add(channel);
            }
            connection.socket.send(JSON.stringify({
              type: 'subscribed',
              channels: Array.from(client.subscriptions),
            }));
          }
          break;
          
        case 'unsubscribe':
          if (message.channels) {
            for (const channel of message.channels) {
              client.subscriptions.delete(channel);
            }
            connection.socket.send(JSON.stringify({
              type: 'unsubscribed',
              channels: message.channels,
            }));
          }
          break;
          
        case 'ping':
          connection.socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
      }
    } catch (error) {
      logger.error('Invalid WebSocket message:', error);
    }
  });

  connection.socket.on('close', () => {
    clients.delete(client);
    logger.info(`WebSocket client disconnected (${clients.size} remaining)`);
  });

  connection.socket.on('error', (error) => {
    logger.error('WebSocket error:', error);
    clients.delete(client);
  });

  // Send welcome message
  connection.socket.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AgentaOS',
    timestamp: Date.now(),
  }));
}

export function getConnectedClients(): number {
  return clients.size;
}
