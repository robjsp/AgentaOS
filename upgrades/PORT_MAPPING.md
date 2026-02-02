# Port Mapping Feature Implementation Plan

> **STATUS: IMPLEMENTED** ✓

> Direct TCP/UDP port mapping for non-HTTP services (game servers, databases, SSH, etc.)

## Overview

Currently, all app traffic flows through the HTTP proxy (Gateway → API → Container). This feature adds **direct port mapping** as an alternative, allowing apps to expose TCP/UDP ports directly to the host.

**Use cases:**
- Game servers (Minecraft, Valheim, etc.)
- Database servers (PostgreSQL, Redis)
- SSH/SFTP servers
- Custom TCP/UDP protocols
- High-performance services that need to bypass HTTP overhead

## Architecture

### Current Flow (HTTP Proxy)
```
Browser → Gateway:80 → API:3000 → Container:3000
         (Caddy)      (Fastify)   (app)
```

### New Flow (Port Mapping)
```
Client → Host:10001 → Container:25565
         (direct)     (app)
```

Both approaches coexist. An app can use HTTP proxy, port mapping, or both.

---

## Implementation Phases

### Phase 1: Protocol & Schema Updates

**Files to modify:**
- `shared/protocol.ts`
- `docs/APP_DEVELOPMENT.md`

**Tasks:**

1. Add port mapping types to protocol:
```typescript
interface PortMapping {
  container: number;       // Port inside container
  host?: number;          // Host port (optional, auto-assigned if not specified)
  protocol: 'tcp' | 'udp';
  enabled: boolean;       // Can be toggled on/off
}

interface ContainerStartRequest {
  // ... existing fields
  portMappings?: PortMapping[];
}
```

2. Update app manifest schema:
```json
{
  "ports": [
    { "container": 25565, "protocol": "tcp" },
    { "container": 25565, "protocol": "udp" }
  ]
}
```

3. Document the new manifest field in APP_DEVELOPMENT.md

---

### Phase 2: Port Allocator Service

**Files to create:**
- `core/src/services/port-allocator/index.ts`

**Files to modify:**
- `core/src/lib/database.ts` (add port_allocations table)

**Tasks:**

1. Create port allocation table in SQLite:
```sql
CREATE TABLE port_allocations (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  container_port INTEGER NOT NULL,
  host_port INTEGER NOT NULL,
  protocol TEXT NOT NULL,  -- 'tcp' or 'udp'
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id) REFERENCES apps(id),
  UNIQUE(host_port, protocol)
);
```

2. Implement PortAllocator service:
```typescript
class PortAllocator {
  private portRange = { min: 10000, max: 20000 };
  
  allocatePort(appId: string, containerPort: number, protocol: string): number;
  releasePort(appId: string, containerPort: number, protocol: string): void;
  getPortsForApp(appId: string): PortMapping[];
  isPortAvailable(port: number, protocol: string): boolean;
  togglePort(appId: string, containerPort: number, enabled: boolean): void;
}
```

3. Port allocation strategy:
   - Auto-assign from available range if `host` not specified
   - Check for conflicts before assigning
   - Release ports when app is uninstalled

---

### Phase 3: Init Socket Updates

**Files to modify:**
- `init/src/index.ts`
- `shared/protocol.ts`

**Tasks:**

1. Update `startContainer` to accept port mappings:
```typescript
async function startContainer(
  appId: string, 
  appType: 'user' | 'system',
  portMappings?: PortMapping[]
): Promise<InitResponse>
```

2. Add `-p` flags to podman run command:
```typescript
if (portMappings) {
  for (const mapping of portMappings) {
    if (mapping.enabled) {
      args.push('-p', `${mapping.host}:${mapping.container}/${mapping.protocol}`);
    }
  }
}
```

3. Handle port mapping changes (requires container restart):
   - Stop container
   - Start with new port configuration

---

### Phase 4: App Manager Updates

**Files to modify:**
- `core/src/services/app-manager/index.ts`
- `core/src/server/routes/apps.ts`

**Tasks:**

1. On app install:
   - Parse `ports` from manifest
   - Allocate host ports for each requested mapping
   - Store in port_allocations table

2. On app start:
   - Fetch enabled port mappings from database
   - Pass to Init with start request

3. On app uninstall:
   - Release all allocated ports

4. Add new API endpoints:
```
GET    /api/apps/:id/ports           # List port mappings for app
PUT    /api/apps/:id/ports/:port     # Toggle port mapping on/off
```

5. Update existing endpoints:
   - `GET /api/apps/:id` - include port mappings in response
   - `GET /api/apps` - include port mappings in list

---

### Phase 5: UI Updates

**Files to modify:**
- `ui/src/views/Apps.tsx`
- `ui/src/lib/api.ts`

**Files to create:**
- `ui/src/components/PortMappingPanel.tsx`

**Tasks:**

1. Add API client methods:
```typescript
export const appsApi = {
  // ... existing methods
  
  getPorts: (id: string) => 
    request<{ ports: PortMapping[] }>(`/apps/${id}/ports`),
  
  togglePort: (id: string, containerPort: number, enabled: boolean) =>
    request<{ port: PortMapping }>(`/apps/${id}/ports/${containerPort}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
};
```

2. Create PortMappingPanel component:
```tsx
function PortMappingPanel({ app }: { app: App }) {
  // Show list of port mappings
  // Toggle switch for each port
  // Display connection info: "Connect to: hostname:10001"
  // Warning about restart required when changing
}
```

3. Update AppCard or App detail view:
   - Show port mappings section
   - Toggle switches for each port
   - Copy-to-clipboard for connection strings
   - Status indicator (port open/closed)

4. UI mockup:
```
┌─────────────────────────────────────────────────────────────┐
│  Minecraft Server                              [Stop] [···] │
│  v1.0.0 • Running                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Port Mappings                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● TCP 25565 → :10001    [Toggle ON]  [Copy]         │   │
│  │ ● UDP 25565 → :10001    [Toggle ON]  [Copy]         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ⚠️ Changing port mappings requires app restart             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 6: WebSocket Events

**Files to modify:**
- `core/src/lib/events.ts`
- `core/src/server/websocket/index.ts`
- `ui/src/hooks/useWebSocket.ts`

**Tasks:**

1. Add new event types:
```typescript
export const Events = {
  // ... existing events
  PORT_ENABLED: 'port:enabled',
  PORT_DISABLED: 'port:disabled',
};
```

2. Emit events when port mappings change

3. UI subscribes to port events to update in real-time

---

## Database Schema

```sql
-- New table for port allocations
CREATE TABLE port_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  container_port INTEGER NOT NULL,
  host_port INTEGER NOT NULL,
  protocol TEXT NOT NULL CHECK(protocol IN ('tcp', 'udp')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  UNIQUE(host_port, protocol),
  UNIQUE(app_id, container_port, protocol)
);

-- Index for quick lookups
CREATE INDEX idx_port_allocations_app_id ON port_allocations(app_id);
CREATE INDEX idx_port_allocations_host_port ON port_allocations(host_port, protocol);
```

---

## API Endpoints

### List Port Mappings
```
GET /api/apps/:id/ports

Response:
{
  "ports": [
    {
      "containerPort": 25565,
      "hostPort": 10001,
      "protocol": "tcp",
      "enabled": true
    },
    {
      "containerPort": 25565,
      "hostPort": 10001,
      "protocol": "udp",
      "enabled": false
    }
  ]
}
```

### Toggle Port Mapping
```
PUT /api/apps/:id/ports/:containerPort

Body:
{
  "protocol": "tcp",
  "enabled": false
}

Response:
{
  "port": {
    "containerPort": 25565,
    "hostPort": 10001,
    "protocol": "tcp",
    "enabled": false
  },
  "restartRequired": true
}
```

---

## Security Considerations

1. **No authentication on mapped ports**
   - Direct ports bypass AgentaOS auth entirely
   - Apps must handle their own authentication
   - Document this clearly in UI and docs

2. **Localhost binding option**
   - Option to bind to `127.0.0.1` only vs `0.0.0.0`
   - Default to `0.0.0.0` for game servers, but warn user

3. **Port range restrictions**
   - Only allow allocation within configured range
   - Prevent allocation of system ports (< 1024)
   - Prevent conflicts with AgentaOS ports (80, 443, 3000, 8080)

4. **Firewall recommendations**
   - Document firewall rules for production
   - Consider integrating with ufw/firewalld

---

## Testing Plan

### Unit Tests
- Port allocator: allocation, release, conflict detection
- Protocol parsing: valid/invalid port configs

### Integration Tests
- Install app with ports → ports allocated
- Start app → podman run includes -p flags
- Toggle port off → restart shows warning
- Uninstall app → ports released

### Manual Tests
- Install Minecraft server, connect from game client
- Toggle port off, verify connection refused
- Toggle port on, restart, verify connection works
- Multiple apps with ports, verify no conflicts

---

## Future Enhancements

1. **Dynamic port display in UI**
   - Show whether port is actually open (health check)
   - Show connection count if possible

2. **Port forwarding rules**
   - Map different host and container ports
   - Multiple host ports to same container port (load balancing)

3. **Bandwidth monitoring**
   - Track data usage per port
   - Display in UI

4. **Access control**
   - IP whitelist for specific ports
   - Rate limiting

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Protocol & Schema | 2 hours | None |
| Phase 2: Port Allocator | 4 hours | Phase 1 |
| Phase 3: Init Updates | 3 hours | Phase 1 |
| Phase 4: App Manager | 4 hours | Phase 2, 3 |
| Phase 5: UI Updates | 6 hours | Phase 4 |
| Phase 6: WebSocket Events | 2 hours | Phase 4, 5 |
| **Total** | **~21 hours** | |

---

## References

- Podman port mapping: `podman run -p host:container/protocol`
- [Podman networking docs](https://docs.podman.io/en/latest/markdown/podman-run.1.html#publish-p-ip-hostport-containerport-protocol)
