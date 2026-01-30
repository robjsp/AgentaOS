import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';

import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { appsRoutes } from './routes/apps';
import { documentsRoutes } from './routes/documents';
import { systemRoutes } from './routes/system';
import { websocketHandler } from './websocket';

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false, // We use our own logger
  });

  // Register plugins
  await server.register(cors, {
    origin: config.isDev ? true : false,
  });

  await server.register(fastifyMultipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB max file size
    },
  });

  await server.register(fastifyWebsocket);

  // API routes
  await server.register(appsRoutes, { prefix: '/api/apps' });
  await server.register(documentsRoutes, { prefix: '/api/documents' });
  await server.register(systemRoutes, { prefix: '/api/system' });

  // WebSocket endpoint
  server.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, websocketHandler);
  });

  // Serve static UI files (in production)
  if (fs.existsSync(config.uiDir)) {
    await server.register(fastifyStatic, {
      root: config.uiDir,
      prefix: '/',
    });

    // SPA fallback - serve index.html for all non-API routes
    server.setNotFoundHandler((request, reply) => {
      if (!request.url.startsWith('/api') && !request.url.startsWith('/ws')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  } else if (config.isDev) {
    // In dev, just return a message pointing to the Vite dev server
    server.get('/', async () => {
      return { 
        message: 'AgentaOS API', 
        ui: 'Run the UI dev server with: npm run dev:ui',
        docs: '/api/system/info'
      };
    });
  }

  // Request logging
  server.addHook('onRequest', async (request) => {
    logger.debug(`${request.method} ${request.url}`);
  });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    logger.error(`Error handling ${request.method} ${request.url}:`, error.message);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal server error',
    });
  });

  return server;
}
