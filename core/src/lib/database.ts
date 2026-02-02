import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { logger } from './logger';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  // Ensure system directory exists
  if (!fs.existsSync(config.systemDir)) {
    fs.mkdirSync(config.systemDir, { recursive: true });
  }
  
  // Ensure documents directory exists
  if (!fs.existsSync(config.documentsDir)) {
    fs.mkdirSync(config.documentsDir, { recursive: true });
  }
  
  // Ensure apps directory exists
  if (!fs.existsSync(config.appsDir)) {
    fs.mkdirSync(config.appsDir, { recursive: true });
  }
  
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  
  logger.info(`Database opened at ${config.dbPath}`);
  
  // Create tables
  db.exec(`
    -- Apps table
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      author TEXT,
      status TEXT DEFAULT 'stopped',
      route TEXT,
      port INTEGER,
      container_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- App settings table
    CREATE TABLE IF NOT EXISTS app_settings (
      app_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (app_id, key),
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );
    
    -- App permissions table
    CREATE TABLE IF NOT EXISTS app_permissions (
      app_id TEXT NOT NULL,
      permission_type TEXT NOT NULL,
      config TEXT,
      granted INTEGER DEFAULT 0,
      granted_at TEXT,
      PRIMARY KEY (app_id, permission_type),
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );
    
    -- Port allocations table
    CREATE TABLE IF NOT EXISTS port_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      container_port INTEGER NOT NULL,
      host_port INTEGER NOT NULL,
      protocol TEXT NOT NULL CHECK(protocol IN ('tcp', 'udp')),
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
      UNIQUE(host_port, protocol),
      UNIQUE(app_id, container_port, protocol)
    );
    
    -- Index for quick lookups
    CREATE INDEX IF NOT EXISTS idx_port_allocations_app_id ON port_allocations(app_id);
    CREATE INDEX IF NOT EXISTS idx_port_allocations_host_port ON port_allocations(host_port, protocol);
    
    -- System config table
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    
    -- Initialize default config if not exists
    INSERT OR IGNORE INTO system_config (key, value) VALUES 
      ('initialized', 'true'),
      ('version', '0.1.0');
  `);
  
  logger.info('Database schema initialized');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    logger.info('Database closed');
  }
}
