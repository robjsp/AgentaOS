import path from 'path';

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  
  // Paths
  dataDir: process.env.DATA_DIR || '/data',
  get documentsDir() { return path.join(this.dataDir, 'documents'); },
  get appsDir() { return path.join(this.dataDir, 'apps'); },
  get systemDir() { return path.join(this.dataDir, 'system'); },
  get dbPath() { return path.join(this.systemDir, 'agentaos.db'); },
  
  // UI
  uiDir: process.env.UI_DIR || path.join(process.cwd(), '../ui/dist'),
  
  // Auth
  sessionSecret: process.env.SESSION_SECRET || 'agentaos-dev-secret-change-in-production',
  
  // Development
  isDev: process.env.NODE_ENV !== 'production',
};
