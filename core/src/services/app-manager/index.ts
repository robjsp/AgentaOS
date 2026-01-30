import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import unzipper from 'unzipper';
import { MultipartFile } from '@fastify/multipart';
import { getDb } from '../../lib/database';
import { config } from '../../lib/config';
import { logger } from '../../lib/logger';
import { emitEvent, Events } from '../../lib/events';
import { getInitClient } from '../../lib/init-client';

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  runtime?: {
    image?: string;
    command?: string[];
    port?: number;
    healthCheck?: string;
  };
  route?: string;
  permissions?: {
    documents?: {
      access: 'none' | 'read' | 'readwrite';
      paths?: string[];
    };
    network?: {
      outbound: boolean;
    };
  };
  settings?: Array<{
    key: string;
    label: string;
    type: string;
    default?: unknown;
  }>;
  install?: string;
}

export interface App {
  id: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  status: 'stopped' | 'running' | 'error' | 'starting';
  route: string | null;
  port: number | null;
  container_id: string | null;
  created_at: string;
  updated_at: string;
}

export class AppManager {
  private useInitSocket: boolean;

  constructor() {
    // Check if Init socket is available (microkernel mode)
    this.useInitSocket = process.env.USE_INIT_SOCKET === 'true';
    if (this.useInitSocket) {
      logger.info('App Manager running in microkernel mode (using Init socket)');
    } else {
      logger.info('App Manager running in standalone mode (direct process management)');
    }
  }

  listApps(): App[] {
    const db = getDb();
    return db.prepare('SELECT * FROM apps ORDER BY name').all() as App[];
  }

  getApp(id: string): App | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as App | undefined;
  }

  async installApp(file: MultipartFile): Promise<App> {
    // Create temp directory for extraction
    const tempDir = path.join(config.systemDir, 'temp', `install-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Extract zip file
      const zipPath = path.join(tempDir, 'app.zip');
      await pipeline(file.file, fs.createWriteStream(zipPath));
      
      const extractDir = path.join(tempDir, 'extracted');
      fs.mkdirSync(extractDir, { recursive: true });
      
      await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .promise();

      // Read manifest
      const manifestPath = path.join(extractDir, 'app.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('app.json not found in zip file');
      }

      const manifest: AppManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      
      if (!manifest.id || !manifest.name || !manifest.version) {
        throw new Error('Invalid app.json: id, name, and version are required');
      }

      // Validate ID format
      if (!/^[a-z0-9-]+$/.test(manifest.id)) {
        throw new Error('Invalid app id: must be lowercase alphanumeric with hyphens');
      }

      // Check if app already exists
      const existing = this.getApp(manifest.id);
      if (existing) {
        throw new Error(`App ${manifest.id} is already installed`);
      }

      // Move to apps directory
      const appDir = path.join(config.appsDir, manifest.id);
      if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true });
      }
      fs.renameSync(extractDir, appDir);

      // Create app data directory
      const appDataDir = path.join(appDir, 'data');
      fs.mkdirSync(appDataDir, { recursive: true });

      // Insert into database
      const db = getDb();
      db.prepare(`
        INSERT INTO apps (id, name, version, description, author, status, route, port)
        VALUES (?, ?, ?, ?, ?, 'stopped', ?, ?)
      `).run(
        manifest.id,
        manifest.name,
        manifest.version,
        manifest.description || null,
        manifest.author || null,
        manifest.route || null,
        manifest.runtime?.port || null
      );

      // Store permissions
      if (manifest.permissions) {
        const permStmt = db.prepare(`
          INSERT INTO app_permissions (app_id, permission_type, config, granted)
          VALUES (?, ?, ?, 0)
        `);
        
        if (manifest.permissions.documents) {
          permStmt.run(manifest.id, 'documents', JSON.stringify(manifest.permissions.documents));
        }
        if (manifest.permissions.network) {
          permStmt.run(manifest.id, 'network', JSON.stringify(manifest.permissions.network));
        }
      }

      // Store default settings
      if (manifest.settings) {
        const settingsStmt = db.prepare(`
          INSERT INTO app_settings (app_id, key, value)
          VALUES (?, ?, ?)
        `);
        
        for (const setting of manifest.settings) {
          if (setting.default !== undefined) {
            settingsStmt.run(manifest.id, setting.key, JSON.stringify(setting.default));
          }
        }
      }

      const app = this.getApp(manifest.id)!;
      
      logger.info(`Installed app: ${manifest.name} (${manifest.id})`);
      emitEvent(Events.APP_INSTALLED, { app });

      return app;
    } finally {
      // Cleanup temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    }
  }

  async uninstallApp(id: string): Promise<void> {
    const app = this.getApp(id);
    if (!app) {
      throw new Error(`App ${id} not found`);
    }

    // Stop if running
    if (app.status === 'running') {
      await this.stopApp(id);
    }

    // Remove from database
    const db = getDb();
    db.prepare('DELETE FROM app_settings WHERE app_id = ?').run(id);
    db.prepare('DELETE FROM app_permissions WHERE app_id = ?').run(id);
    db.prepare('DELETE FROM apps WHERE id = ?').run(id);

    // Remove app directory
    const appDir = path.join(config.appsDir, id);
    if (fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true });
    }

    logger.info(`Uninstalled app: ${app.name} (${id})`);
    emitEvent(Events.APP_UNINSTALLED, { app });
  }

  async startApp(id: string): Promise<App> {
    const app = this.getApp(id);
    if (!app) {
      throw new Error(`App ${id} not found`);
    }

    if (app.status === 'running') {
      return app;
    }

    // Update status
    const db = getDb();
    db.prepare('UPDATE apps SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('starting', id);

    try {
      if (this.useInitSocket) {
        // Microkernel mode: Use Init socket to start container
        const initClient = getInitClient();
        const result = await initClient.startContainer(id, 'user');
        
        db.prepare('UPDATE apps SET status = ?, container_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('running', result.containerId || null, id);
      } else {
        // Standalone mode: Start as direct process (for development)
        const manifestPath = path.join(config.appsDir, id, 'app.json');
        const manifest: AppManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        if (manifest.runtime?.command) {
          const { spawn } = await import('child_process');
          const appDir = path.join(config.appsDir, id);
          
          const proc = spawn(manifest.runtime.command[0], manifest.runtime.command.slice(1), {
            cwd: appDir,
            env: {
              ...process.env,
              PORT: String(manifest.runtime.port || 3000),
              APP_DATA: path.join(appDir, 'data'),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
          });

          proc.stdout?.on('data', (data: Buffer) => {
            emitEvent(Events.APP_LOG, { appId: id, stream: 'stdout', data: data.toString() });
          });

          proc.stderr?.on('data', (data: Buffer) => {
            emitEvent(Events.APP_LOG, { appId: id, stream: 'stderr', data: data.toString() });
          });

          proc.on('exit', (code) => {
            const status = code === 0 ? 'stopped' : 'error';
            db.prepare('UPDATE apps SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(status, id);
            emitEvent(Events.APP_STOPPED, { appId: id, exitCode: code });
          });

          // Store PID as container_id in standalone mode
          db.prepare('UPDATE apps SET status = ?, container_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('running', String(proc.pid), id);
        } else {
          db.prepare('UPDATE apps SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('running', id);
        }
      }

      const updatedApp = this.getApp(id)!;
      logger.info(`Started app: ${app.name} (${id})`);
      emitEvent(Events.APP_STARTED, { app: updatedApp });

      return updatedApp;
    } catch (error) {
      db.prepare('UPDATE apps SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('error', id);
      throw error;
    }
  }

  async stopApp(id: string): Promise<App> {
    const app = this.getApp(id);
    if (!app) {
      throw new Error(`App ${id} not found`);
    }

    if (this.useInitSocket) {
      // Microkernel mode: Use Init socket to stop container
      const initClient = getInitClient();
      await initClient.stopContainer(id);
    } else {
      // Standalone mode: Kill the process if we have a PID
      if (app.container_id) {
        try {
          const pid = parseInt(app.container_id, 10);
          if (!isNaN(pid)) {
            process.kill(pid, 'SIGTERM');
          }
        } catch {
          // Process may already be dead
        }
      }
    }

    const db = getDb();
    db.prepare('UPDATE apps SET status = ?, container_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('stopped', id);

    const updatedApp = this.getApp(id)!;
    logger.info(`Stopped app: ${app.name} (${id})`);
    emitEvent(Events.APP_STOPPED, { app: updatedApp });

    return updatedApp;
  }

  async getAppLogs(id: string, tail: number = 100): Promise<string[]> {
    const app = this.getApp(id);
    if (!app) {
      throw new Error(`App ${id} not found`);
    }

    if (this.useInitSocket) {
      // Microkernel mode: Get logs from container via Init
      const initClient = getInitClient();
      return await initClient.getContainerLogs(id, tail);
    }

    // Standalone mode: Return empty logs (could read from log file in future)
    return [];
  }

  async updateAppSettings(id: string, settings: Record<string, unknown>): Promise<App> {
    const app = this.getApp(id);
    if (!app) {
      throw new Error(`App ${id} not found`);
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO app_settings (app_id, key, value)
      VALUES (?, ?, ?)
    `);

    for (const [key, value] of Object.entries(settings)) {
      stmt.run(id, key, JSON.stringify(value));
    }

    db.prepare('UPDATE apps SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    return this.getApp(id)!;
  }

  getAppSettings(id: string): Record<string, unknown> {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM app_settings WHERE app_id = ?').all(id) as { key: string; value: string }[];
    
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    
    return settings;
  }
}
