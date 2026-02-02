import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { request as httpRequest } from 'http';
import { getDb } from '../../lib/database';
import { logger } from '../../lib/logger';
import { CONTAINER_NAME_PREFIX } from '../../../../shared/protocol';

interface App {
  id: string;
  name: string;
  status: string;
  route: string | null;
  port: number | null;
}

/**
 * Get app by its route prefix
 */
function getAppByRoute(routePrefix: string): App | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM apps WHERE route = ?').get(routePrefix) as App | undefined;
}

/**
 * Proxy a request to a user app container
 */
async function proxyToApp(
  app: App,
  request: FastifyRequest,
  reply: FastifyReply,
  pathSuffix: string
): Promise<void> {
  const containerName = `${CONTAINER_NAME_PREFIX}-${app.id}`;
  const port = app.port || 3000;
  
  // In the container network, we can reach the container by name
  const targetHost = containerName;
  const targetPath = pathSuffix || '/';
  
  logger.debug(`Proxying to ${targetHost}:${port}${targetPath}`);

  return new Promise((resolve, reject) => {
    const proxyReq = httpRequest(
      {
        hostname: targetHost,
        port: port,
        path: targetPath,
        method: request.method,
        headers: {
          ...request.headers,
          host: `${targetHost}:${port}`,
          'x-forwarded-for': request.ip,
          'x-forwarded-proto': request.protocol,
          'x-forwarded-host': request.hostname,
          'x-app-id': app.id,
        },
      },
      (proxyRes) => {
        // Forward status code
        reply.status(proxyRes.statusCode || 502);
        
        // Forward headers
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value && !['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
            reply.header(key, value);
          }
        }
        
        // Stream the response body
        reply.send(proxyRes);
        resolve();
      }
    );

    proxyReq.on('error', (err) => {
      logger.error(`Proxy error for app ${app.id}:`, err.message);
      reject(err);
    });

    // Forward request body if present
    if (request.body) {
      if (typeof request.body === 'string' || Buffer.isBuffer(request.body)) {
        proxyReq.write(request.body);
      } else {
        proxyReq.write(JSON.stringify(request.body));
      }
    }

    // Pipe incoming request to proxy request for streaming bodies
    request.raw.pipe(proxyReq);
  });
}

export async function appProxyRoutes(fastify: FastifyInstance): Promise<void> {
  // Handle all requests to /apps/*
  fastify.all('/:appRoute/*', async (request: FastifyRequest<{
    Params: { appRoute: string; '*': string };
  }>, reply: FastifyReply) => {
    const { appRoute } = request.params;
    const pathSuffix = '/' + (request.params['*'] || '');
    
    // Find app by route
    const app = getAppByRoute(`/${appRoute}`);
    
    if (!app) {
      return reply.status(404).send({
        error: 'App not found',
        message: `No app is registered for route /${appRoute}`,
      });
    }

    if (app.status !== 'running') {
      return reply.status(503).send({
        error: 'App not running',
        message: `The app "${app.name}" is not currently running`,
        appId: app.id,
        status: app.status,
      });
    }

    try {
      await proxyToApp(app, request, reply, pathSuffix);
    } catch (err) {
      logger.error(`Failed to proxy request to app ${app.id}:`, err);
      return reply.status(502).send({
        error: 'Bad Gateway',
        message: `Failed to connect to app "${app.name}"`,
        appId: app.id,
      });
    }
  });

  // Also handle requests to /apps/:appRoute (without trailing path)
  fastify.all('/:appRoute', async (request: FastifyRequest<{
    Params: { appRoute: string };
  }>, reply: FastifyReply) => {
    const { appRoute } = request.params;
    
    const app = getAppByRoute(`/${appRoute}`);
    
    if (!app) {
      return reply.status(404).send({
        error: 'App not found',
        message: `No app is registered for route /${appRoute}`,
      });
    }

    if (app.status !== 'running') {
      return reply.status(503).send({
        error: 'App not running',
        message: `The app "${app.name}" is not currently running`,
        appId: app.id,
        status: app.status,
      });
    }

    try {
      await proxyToApp(app, request, reply, '/');
    } catch (err) {
      logger.error(`Failed to proxy request to app ${app.id}:`, err);
      return reply.status(502).send({
        error: 'Bad Gateway',
        message: `Failed to connect to app "${app.name}"`,
        appId: app.id,
      });
    }
  });
}
