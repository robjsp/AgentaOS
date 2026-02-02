/**
 * Port Allocator Service
 * 
 * Manages port allocations for user apps that need direct TCP/UDP access.
 * Ports are allocated from a configurable range (default: 10000-20000).
 */

import { getDb } from '../../lib/database';
import { logger } from '../../lib/logger';
import { PORT_RANGE, PortMapping } from '../../../../shared/protocol';

export interface PortAllocation {
  id: number;
  appId: string;
  containerPort: number;
  hostPort: number;
  protocol: 'tcp' | 'udp';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortRequest {
  containerPort: number;
  protocol: 'tcp' | 'udp';
  hostPort?: number;  // Optional: auto-assign if not specified
}

// Helper to transform snake_case DB row to camelCase
interface DbPortRow {
  id: number;
  app_id: string;
  container_port: number;
  host_port: number;
  protocol: 'tcp' | 'udp';
  enabled: number;
  created_at: string;
  updated_at: string;
}

function toPortAllocation(row: DbPortRow): PortAllocation {
  return {
    id: row.id,
    appId: row.app_id,
    containerPort: row.container_port,
    hostPort: row.host_port,
    protocol: row.protocol,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PortAllocator {
  private portRange = PORT_RANGE;

  /**
   * Allocate ports for an app based on manifest requests
   */
  allocatePortsForApp(appId: string, requests: PortRequest[]): PortAllocation[] {
    const db = getDb();
    const allocations: PortAllocation[] = [];

    for (const request of requests) {
      // Check if this app already has this port/protocol allocated
      const existingRow = db.prepare(`
        SELECT * FROM port_allocations 
        WHERE app_id = ? AND container_port = ? AND protocol = ?
      `).get(appId, request.containerPort, request.protocol) as DbPortRow | undefined;

      if (existingRow) {
        allocations.push(toPortAllocation(existingRow));
        continue;
      }

      // Determine host port
      let hostPort: number;
      if (request.hostPort && this.isPortAvailable(request.hostPort, request.protocol)) {
        hostPort = request.hostPort;
      } else {
        const availablePort = this.findAvailablePort(request.protocol);
        if (!availablePort) {
          throw new Error(`No available ports in range ${this.portRange.min}-${this.portRange.max}`);
        }
        hostPort = availablePort;
      }

      // Insert allocation
      const result = db.prepare(`
        INSERT INTO port_allocations (app_id, container_port, host_port, protocol, enabled)
        VALUES (?, ?, ?, ?, 1)
      `).run(appId, request.containerPort, hostPort, request.protocol);

      const row = db.prepare(`
        SELECT * FROM port_allocations WHERE id = ?
      `).get(result.lastInsertRowid) as DbPortRow;

      allocations.push(toPortAllocation(row));
      logger.info(`Allocated port ${hostPort}/${request.protocol} -> ${appId}:${request.containerPort}`);
    }

    return allocations;
  }

  /**
   * Release all ports for an app
   */
  releasePortsForApp(appId: string): void {
    const db = getDb();
    const ports = this.getPortsForApp(appId);
    
    db.prepare('DELETE FROM port_allocations WHERE app_id = ?').run(appId);
    
    for (const port of ports) {
      logger.info(`Released port ${port.hostPort}/${port.protocol} from ${appId}`);
    }
  }

  /**
   * Get all port allocations for an app
   */
  getPortsForApp(appId: string): PortAllocation[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM port_allocations WHERE app_id = ? ORDER BY container_port, protocol
    `).all(appId) as DbPortRow[];
    return rows.map(toPortAllocation);
  }

  /**
   * Get enabled port mappings for an app (for starting container)
   */
  getEnabledPortMappings(appId: string): PortMapping[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM port_allocations WHERE app_id = ? AND enabled = 1
    `).all(appId) as DbPortRow[];

    return rows.map(row => ({
      containerPort: row.container_port,
      hostPort: row.host_port,
      protocol: row.protocol,
      enabled: true,
    }));
  }

  /**
   * Toggle a port mapping on/off
   */
  togglePort(appId: string, containerPort: number, protocol: 'tcp' | 'udp', enabled: boolean): PortAllocation {
    const db = getDb();
    
    db.prepare(`
      UPDATE port_allocations 
      SET enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE app_id = ? AND container_port = ? AND protocol = ?
    `).run(enabled ? 1 : 0, appId, containerPort, protocol);

    const row = db.prepare(`
      SELECT * FROM port_allocations 
      WHERE app_id = ? AND container_port = ? AND protocol = ?
    `).get(appId, containerPort, protocol) as DbPortRow | undefined;

    if (!row) {
      throw new Error(`Port allocation not found: ${appId}:${containerPort}/${protocol}`);
    }

    const allocation = toPortAllocation(row);
    logger.info(`Port ${allocation.hostPort}/${protocol} for ${appId} ${enabled ? 'enabled' : 'disabled'}`);
    return allocation;
  }

  /**
   * Check if a host port is available
   */
  isPortAvailable(port: number, protocol: 'tcp' | 'udp'): boolean {
    if (port < this.portRange.min || port > this.portRange.max) {
      return false;
    }

    const db = getDb();
    const existing = db.prepare(`
      SELECT id FROM port_allocations WHERE host_port = ? AND protocol = ?
    `).get(port, protocol);

    return !existing;
  }

  /**
   * Find the next available port in the range
   */
  private findAvailablePort(protocol: 'tcp' | 'udp'): number | null {
    const db = getDb();
    
    // Get all allocated ports for this protocol
    const allocated = db.prepare(`
      SELECT host_port FROM port_allocations WHERE protocol = ? ORDER BY host_port
    `).all(protocol) as { host_port: number }[];

    const allocatedSet = new Set(allocated.map(a => a.host_port));

    // Find first available port in range
    for (let port = this.portRange.min; port <= this.portRange.max; port++) {
      if (!allocatedSet.has(port)) {
        return port;
      }
    }

    return null;
  }

  /**
   * Get allocation by host port
   */
  getAllocationByHostPort(hostPort: number, protocol: 'tcp' | 'udp'): PortAllocation | undefined {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM port_allocations WHERE host_port = ? AND protocol = ?
    `).get(hostPort, protocol) as DbPortRow | undefined;
    return row ? toPortAllocation(row) : undefined;
  }

  /**
   * Get port usage statistics
   */
  getStats(): { total: number; allocated: number; available: number } {
    const db = getDb();
    const total = this.portRange.max - this.portRange.min + 1;
    
    // Count unique host ports (TCP and UDP on same port count as 1)
    const allocated = db.prepare(`
      SELECT COUNT(DISTINCT host_port) as count FROM port_allocations
    `).get() as { count: number };

    return {
      total,
      allocated: allocated.count,
      available: total - allocated.count,
    };
  }
}

// Singleton instance
let portAllocator: PortAllocator | null = null;

export function getPortAllocator(): PortAllocator {
  if (!portAllocator) {
    portAllocator = new PortAllocator();
  }
  return portAllocator;
}
