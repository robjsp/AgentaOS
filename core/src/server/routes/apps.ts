import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppManager } from '../../services/app-manager';
import { logger } from '../../lib/logger';

const appManager = new AppManager();

export async function appsRoutes(fastify: FastifyInstance): Promise<void> {
  // List all apps
  fastify.get('/', async (): Promise<object> => {
    const apps = appManager.listApps();
    return { apps };
  });

  // Get single app
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const app = appManager.getApp(request.params.id);
    if (!app) {
      return reply.status(404).send({ error: 'App not found' });
    }
    return { app };
  });

  // Install app (upload zip)
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const app = await appManager.installApp(data);
      return reply.status(201).send({ app });
    } catch (error) {
      logger.error('Failed to install app:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to install app' 
      });
    }
  });

  // Uninstall app
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await appManager.uninstallApp(request.params.id);
      return { success: true };
    } catch (error) {
      logger.error('Failed to uninstall app:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to uninstall app' 
      });
    }
  });

  // Start app
  fastify.post('/:id/start', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const app = await appManager.startApp(request.params.id);
      return { app };
    } catch (error) {
      logger.error('Failed to start app:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to start app' 
      });
    }
  });

  // Stop app
  fastify.post('/:id/stop', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const app = await appManager.stopApp(request.params.id);
      return { app };
    } catch (error) {
      logger.error('Failed to stop app:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to stop app' 
      });
    }
  });

  // Restart app
  fastify.post('/:id/restart', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await appManager.stopApp(request.params.id);
      const app = await appManager.startApp(request.params.id);
      return { app };
    } catch (error) {
      logger.error('Failed to restart app:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to restart app' 
      });
    }
  });

  // Get app logs
  fastify.get('/:id/logs', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const logs = await appManager.getAppLogs(request.params.id);
      return { logs };
    } catch (error) {
      logger.error('Failed to get app logs:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to get logs' 
      });
    }
  });

  // Update app settings
  fastify.put('/:id/settings', async (
    request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
    reply: FastifyReply
  ) => {
    try {
      const app = await appManager.updateAppSettings(request.params.id, request.body);
      return { app };
    } catch (error) {
      logger.error('Failed to update app settings:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to update settings' 
      });
    }
  });

  // Get app ports
  fastify.get('/:id/ports', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const ports = appManager.getAppPorts(request.params.id);
      return { ports };
    } catch (error) {
      logger.error('Failed to get app ports:', error);
      if ((error as Error).message.includes('not found')) {
        return reply.status(404).send({ error: 'App not found' });
      }
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to get ports' 
      });
    }
  });

  // Toggle app port
  fastify.put('/:id/ports/:containerPort', async (
    request: FastifyRequest<{ 
      Params: { id: string; containerPort: string }; 
      Body: { protocol: 'tcp' | 'udp'; enabled: boolean } 
    }>,
    reply: FastifyReply
  ) => {
    try {
      const containerPort = parseInt(request.params.containerPort, 10);
      if (isNaN(containerPort)) {
        return reply.status(400).send({ error: 'Invalid container port' });
      }

      const { protocol, enabled } = request.body;
      if (!protocol || typeof enabled !== 'boolean') {
        return reply.status(400).send({ error: 'protocol and enabled are required' });
      }

      const app = appManager.getApp(request.params.id);
      const port = appManager.toggleAppPort(request.params.id, containerPort, protocol, enabled);
      
      return { 
        port,
        restartRequired: app?.status === 'running',
      };
    } catch (error) {
      logger.error('Failed to toggle app port:', error);
      if ((error as Error).message.includes('not found')) {
        return reply.status(404).send({ error: 'App or port not found' });
      }
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to toggle port' 
      });
    }
  });
}
