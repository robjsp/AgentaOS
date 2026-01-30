import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FileManager } from '../../services/file-manager';
import { logger } from '../../lib/logger';

const fileManager = new FileManager();

export async function documentsRoutes(fastify: FastifyInstance): Promise<void> {
  // List directory or get file info
  fastify.get('/*', async (request: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => {
    try {
      const relativePath = request.params['*'] || '';
      const result = await fileManager.getPath(relativePath);
      return result;
    } catch (error) {
      logger.error('Failed to get path:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({ error: 'Path not found' });
      }
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to get path' 
      });
    }
  });

  // List root directory
  fastify.get('/', async () => {
    return fileManager.getPath('');
  });

  // Upload file
  fastify.post('/*', async (request: FastifyRequest<{ Params: { '*': string }; Querystring: { mkdir?: string } }>, reply: FastifyReply) => {
    try {
      const relativePath = request.params['*'] || '';
      
      // Create directory
      if (request.query.mkdir !== undefined) {
        await fileManager.createDirectory(relativePath);
        return { success: true, path: relativePath };
      }
      
      // Upload file
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }
      
      await fileManager.uploadFile(relativePath, data);
      return { success: true, path: relativePath };
    } catch (error) {
      logger.error('Failed to create/upload:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to create/upload' 
      });
    }
  });

  // Delete file or directory
  fastify.delete('/*', async (request: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => {
    try {
      const relativePath = request.params['*'] || '';
      if (!relativePath) {
        return reply.status(400).send({ error: 'Cannot delete root directory' });
      }
      
      await fileManager.deletePath(relativePath);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to delete' 
      });
    }
  });

  // Rename/move file or directory
  fastify.put('/*', async (
    request: FastifyRequest<{ Params: { '*': string }; Body: { newPath?: string; content?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const relativePath = request.params['*'] || '';
      const body = request.body;
      
      if (body.newPath) {
        await fileManager.movePath(relativePath, body.newPath);
        return { success: true, path: body.newPath };
      }
      
      if (body.content !== undefined) {
        await fileManager.writeFile(relativePath, body.content);
        return { success: true, path: relativePath };
      }
      
      return reply.status(400).send({ error: 'Invalid request body' });
    } catch (error) {
      logger.error('Failed to update:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to update' 
      });
    }
  });
}
