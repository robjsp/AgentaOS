import { FastifyInstance } from 'fastify';
import os from 'os';
import fs from 'fs';
import { config } from '../../lib/config';
import { getDb } from '../../lib/database';

export async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  // Get system info
  fastify.get('/info', async () => {
    const db = getDb();
    const versionRow = db.prepare('SELECT value FROM system_config WHERE key = ?').get('version') as { value: string } | undefined;
    
    return {
      version: versionRow?.value || '0.1.0',
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usedPercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
      },
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'Unknown',
        loadAvg: os.loadavg(),
      },
      disk: getDiskInfo(),
    };
  });

  // Get system config
  fastify.get('/config', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM system_config').all() as { key: string; value: string }[];
    const configMap: Record<string, string> = {};
    for (const row of rows) {
      configMap[row.key] = row.value;
    }
    return { config: configMap };
  });

  // Update system config
  fastify.put('/config', async (request) => {
    const body = request.body as Record<string, string>;
    const db = getDb();
    
    const stmt = db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(body)) {
      stmt.run(key, value);
    }
    
    return { success: true };
  });

  // Get running processes (kernel space apps)
  fastify.get('/processes', async () => {
    // Return kernel space process info
    const processes = [
      {
        name: 'gateway',
        pid: process.pid,
        cpu: process.cpuUsage(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      },
    ];
    
    return { processes };
  });
}

function getDiskInfo(): { total: number; free: number; used: number; usedPercent: number } {
  try {
    // Try to get disk info for the data directory
    const stats = fs.statfsSync(config.dataDir);
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    
    return {
      total,
      free,
      used,
      usedPercent: Math.round((used / total) * 100),
    };
  } catch {
    // Fallback if statfs not available
    return {
      total: 0,
      free: 0,
      used: 0,
      usedPercent: 0,
    };
  }
}
