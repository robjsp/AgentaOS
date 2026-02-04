/**
 * Terminal WebSocket Handler
 * 
 * Bridges browser WebSocket connections to container exec sessions via Init.
 */

import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { logger } from '../../lib/logger';
import { getInitClient } from '../../lib/init-client';
import { getDb } from '../../lib/database';

interface TerminalParams {
  appId: string;
}

interface ClientMessage {
  type: 'input' | 'resize';
  data?: string;  // Base64 encoded for input
  cols?: number;
  rows?: number;
}

export async function terminalHandler(
  connection: SocketStream,
  request: FastifyRequest<{ Params: TerminalParams }>
): Promise<void> {
  const { appId } = request.params;
  
  logger.info(`Terminal WebSocket connection for app: ${appId}`);

  // Validate app exists and is running
  const db = getDb();
  const app = db.prepare('SELECT status FROM apps WHERE id = ?').get(appId) as { status: string } | undefined;

  if (!app) {
    logger.warn(`Terminal connection rejected: app ${appId} not found`);
    connection.socket.send(JSON.stringify({
      type: 'error',
      message: 'App not found',
    }));
    connection.socket.close();
    return;
  }

  if (app.status !== 'running') {
    logger.warn(`Terminal connection rejected: app ${appId} is not running`);
    connection.socket.send(JSON.stringify({
      type: 'error',
      message: 'App is not running',
    }));
    connection.socket.close();
    return;
  }

  const initClient = getInitClient();
  let sessionId: string | null = null;

  try {
    // Start exec session with Init
    sessionId = await initClient.startExec(appId, {
      onData: (data: string) => {
        // Forward PTY output to browser
        try {
          connection.socket.send(JSON.stringify({
            type: 'data',
            data,
          }));
        } catch (err) {
          logger.error('Failed to send terminal data to client:', err);
        }
      },
      onExit: (exitCode: number) => {
        logger.info(`Terminal session ${sessionId} exited with code ${exitCode}`);
        try {
          connection.socket.send(JSON.stringify({
            type: 'exit',
            exitCode,
          }));
          connection.socket.close();
        } catch {
          // Socket may already be closed
        }
      },
      onError: (error: string) => {
        logger.error(`Terminal session ${sessionId} error: ${error}`);
        try {
          connection.socket.send(JSON.stringify({
            type: 'error',
            message: error,
          }));
        } catch {
          // Socket may already be closed
        }
      },
    });

    logger.info(`Terminal session ${sessionId} started for app ${appId}`);

    // Send session ready message
    connection.socket.send(JSON.stringify({
      type: 'ready',
      sessionId,
    }));

  } catch (err) {
    logger.error(`Failed to start terminal session for ${appId}:`, err);
    connection.socket.send(JSON.stringify({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to start terminal',
    }));
    connection.socket.close();
    return;
  }

  // Handle messages from browser
  connection.socket.on('message', (rawData: Buffer | string) => {
    if (!sessionId) return;

    try {
      const message: ClientMessage = JSON.parse(
        typeof rawData === 'string' ? rawData : rawData.toString()
      );

      switch (message.type) {
        case 'input':
          if (message.data) {
            initClient.sendTerminalInput(sessionId, message.data);
          }
          break;
        case 'resize':
          if (message.cols && message.rows) {
            initClient.sendTerminalResize(sessionId, message.cols, message.rows);
          }
          break;
        default:
          logger.warn(`Unknown terminal message type: ${(message as { type: string }).type}`);
      }
    } catch (err) {
      logger.error('Failed to parse terminal message:', err);
    }
  });

  // Handle disconnect
  connection.socket.on('close', () => {
    logger.info(`Terminal WebSocket closed for app ${appId}`);
    if (sessionId) {
      initClient.closeTerminalSession(sessionId);
    }
  });

  connection.socket.on('error', (err) => {
    logger.error(`Terminal WebSocket error for app ${appId}:`, err);
    if (sessionId) {
      initClient.closeTerminalSession(sessionId);
    }
  });
}
