# Implementation Plan: Multi-Instance App Support

## Overview

Enable running multiple container instances of the same app image. This allows scaling apps horizontally and running multiple isolated copies of the same application.

## Current State

**Architecture (1:1:1 relationship):**
```
App ID ("hello")
    ↓
One Image: agentaos-app-hello:latest
    ↓
One Container: agentaos-hello
```

**Limitations:**
- One container per app
- Starting an already-running app is a no-op
- No horizontal scaling
- No isolation between "copies" of the same app

**Key files:**
- `init/src/index.ts` - Container naming: `agentaos-{appId}`
- `core/src/services/app-manager/index.ts` - App lifecycle, single `container_id`
- `core/src/server/routes/apps.ts` - REST endpoints
- `core/src/services/port-allocator/index.ts` - Port allocation per app
- Database schema - `apps` table with single container reference

## Target State

**Architecture (1:1:N relationship):**
```
App ID ("hello")
    ↓
One Image: agentaos-app-hello:latest
    ↓
Multiple Containers:
  - agentaos-hello-1
  - agentaos-hello-2
  - agentaos-hello-N
```

**Capabilities:**
- Multiple instances per app
- Each instance has its own container, ports, and data
- Instances can be started/stopped independently
- Each instance accessed directly via its own port (no load balancing needed)

---

## Prerequisites for Implementers

Before starting implementation, ensure familiarity with the following files and concepts.

### Key Files to Understand

| File | Purpose | Must Read |
|------|---------|-----------|
| `core/src/lib/database.ts` | SQLite database setup, migrations, schema | Yes - for Stage 1 |
| `core/src/services/app-manager/index.ts` | App lifecycle management (install, start, stop, delete) | Yes - for Stage 3, 6 |
| `init/src/index.ts` | Privileged Init service that manages Podman containers | Yes - for Stage 2 |
| `shared/protocol.ts` | TypeScript interfaces for Core↔Init communication | Yes - for Stage 2 |
| `core/src/lib/init-client.ts` | Client library that Core uses to talk to Init via Unix socket | Helpful |
| `core/src/server/routes/apps.ts` | REST API endpoints for apps | Yes - for Stage 4 |
| `core/src/services/port-allocator/index.ts` | Dynamic port allocation for app containers | Yes - for Stage 5 |

### Key Concepts to Understand

#### 1. Core ↔ Init Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    agentaOS Host (Vagrant VM)               │
│                                                             │
│  ┌─────────────┐    Unix Socket    ┌─────────────────────┐  │
│  │    Core     │◄──────────────────│        Init         │  │
│  │  (Express)  │  /tmp/init.sock   │  (Privileged Node)  │  │
│  │  Port 8080  │                   │                     │  │
│  └─────────────┘                   └─────────────────────┘  │
│        │                                    │               │
│        │ REST API                           │ Podman        │
│        ▼                                    ▼               │
│   HTTP Clients                        Containers            │
└─────────────────────────────────────────────────────────────┘
```

- **Init** runs as root, manages Podman containers directly
- **Core** is unprivileged, sends commands to Init via Unix socket
- Communication protocol defined in `shared/protocol.ts`

#### 2. Current Container Lifecycle

```
Install App (zip upload)
    │
    ├── Extract zip to /data/apps/{appId}/
    ├── Build image: podman build → agentaos-app-{appId}:latest
    └── Insert into SQLite `apps` table
    
Start App
    │
    ├── Allocate port from port pool
    ├── Init creates container: agentaos-{appId}
    └── Container runs on allocated port
    
Stop App
    │
    ├── Init stops container
    └── Release port back to pool
```

#### 3. Database Schema (Current)

```sql
-- Main apps table
apps (id, name, version, status, container_id, ...)

-- Ports allocated to apps
app_ports (id, app_id, host_port, container_port, protocol, enabled)

-- Port allocation pool
port_allocations (id, port, status, app_id, ...)
```

#### 4. Naming Conventions

| Entity | Current Pattern | New Pattern (with instances) |
|--------|-----------------|------------------------------|
| Image | `agentaos-app-{appId}:latest` | (unchanged) |
| Container | `agentaos-{appId}` | `agentaos-{appId}-{instanceNum}` |
| Instance ID | N/A | `{appId}-{instanceNum}` |

#### 5. Port Allocation Flow

1. App requests ports (from `Dockerfile` EXPOSE or config)
2. `PortAllocator` finds available ports in configured range
3. Ports stored in `app_ports` table
4. Passed to Init for container creation (`-p hostPort:containerPort`)

### How to Test Changes

The system runs in a Vagrant VM. Development workflow:

```bash
# Start the VM
vagrant up

# SSH into VM
vagrant ssh

# View Core logs
journalctl -u agentaos-core -f

# View Init logs  
journalctl -u agentaos-init -f

# Database inspection
sqlite3 /data/system/agentaos.db ".tables"
sqlite3 /data/system/agentaos.db "SELECT * FROM apps;"

# Check running containers
podman ps

# Test API
curl http://localhost:8080/api/apps
```

### Dependencies Between Components

```
Stage 1 (Database)
    │
    ▼
Stage 2 (Init) ────────────────┐
    │                          │
    ▼                          ▼
Stage 3 (App Manager) ◄─── Stage 5 (Port Allocator)
    │
    ▼
Stage 4 (API Routes)
    │
    ▼
Stage 6 (Integration)
    │
    ▼
Stage 7 (Docs)
```

---

## Implementation Stages

| Stage | Description | Status |
|-------|-------------|--------|
| 1 | Database schema for instances | ✅ Complete |
| 2 | Init: Instance-aware container naming | ✅ Complete |
| 3 | App Manager: Instance CRUD operations | Pending |
| 4 | API routes for instances | Pending |
| 5 | Port allocation per instance | Pending |
| 6 | Update start/stop to use instances | Pending |
| 7 | Documentation | Pending |

---

## Stage 1: Database Schema for Instances

**Goal:** Add `app_instances` table to track individual container instances.

### Schema Changes

**New table: `app_instances`**
```sql
CREATE TABLE app_instances (
  id TEXT PRIMARY KEY,              -- UUID or "appId-1", "appId-2"
  app_id TEXT NOT NULL,             -- Foreign key to apps.id
  instance_number INTEGER NOT NULL, -- 1, 2, 3...
  status TEXT DEFAULT 'stopped',    -- stopped, starting, running, error
  container_id TEXT,                -- Podman container ID
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  UNIQUE(app_id, instance_number)
);
```

**New table: `instance_ports`**
```sql
CREATE TABLE instance_ports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  host_port INTEGER NOT NULL UNIQUE,
  container_port INTEGER NOT NULL,
  protocol TEXT DEFAULT 'tcp',
  enabled INTEGER DEFAULT 1,
  FOREIGN KEY (instance_id) REFERENCES app_instances(id) ON DELETE CASCADE
);
```

### Migration

**File:** `core/src/lib/database.ts`

Add migration to create new tables and optionally migrate existing apps to have a default instance.

### Stage 1 Test

```bash
# Verify tables exist
sqlite3 /data/system/agentaos.db ".schema app_instances"
sqlite3 /data/system/agentaos.db ".schema instance_ports"
```

---

## Stage 2: Init - Instance-Aware Container Naming

**Goal:** Update Init to accept instance ID and use it in container naming.

### Changes

**File:** `init/src/index.ts`

**Current:**
```typescript
function getContainerName(appId: string): string {
  return `${CONTAINER_NAME_PREFIX}-${appId}`;
}
```

**New:**
```typescript
function getContainerName(appId: string, instanceId?: string): string {
  if (instanceId) {
    return `${CONTAINER_NAME_PREFIX}-${appId}-${instanceId}`;
  }
  return `${CONTAINER_NAME_PREFIX}-${appId}`;
}
```

**Update `startContainer`:**
```typescript
async function startContainer(
  appId: string,
  appType: "user" | "system",
  instanceId?: string,  // NEW
  portMappings?: PortMappingParam[],
): Promise<InitResponse>
```

**Update protocol** (`shared/protocol.ts`):
```typescript
interface ContainerStartRequest {
  op: 'container:start';
  appId: string;
  instanceId?: string;  // NEW
  appType?: 'user' | 'system';
  portMappings?: PortMapping[];
}
```

### Stage 2 Implementation Summary

**Files modified:**
- `shared/protocol.ts`: Added `instanceId?: string` to all container request types, added `isValidInstanceId()` validator
- `init/src/index.ts`: Updated all container functions to accept optional `instanceId`

**Container naming:**
- Without instanceId: `agentaos-{appId}` (backward compatible)
- With instanceId: `agentaos-{appId}-{instanceNumber}` (e.g., `agentaos-hello-1`)

### Stage 2 Test

```bash
# Manual test: Start container with instance ID
# Via socket or test script

# Test backward compatibility (no instanceId):
echo '{"id":"test1","op":"container:start","appId":"hello","appType":"user"}' | nc -U /run/agentaos/init.sock
# Creates container: agentaos-hello

# Test with instanceId:
echo '{"id":"test2","op":"container:start","appId":"hello","instanceId":"hello-1","appType":"user"}' | nc -U /run/agentaos/init.sock
# Creates container: agentaos-hello-1

# Test status with instanceId:
echo '{"id":"test3","op":"container:status","appId":"hello","instanceId":"hello-1"}' | nc -U /run/agentaos/init.sock
```

---

## Stage 3: App Manager - Instance CRUD Operations

**Goal:** Add methods to create, list, start, stop, and delete instances.

### Changes

**File:** `core/src/services/app-manager/index.ts`

**New interface:**
```typescript
export interface AppInstance {
  id: string;
  app_id: string;
  instance_number: number;
  status: 'stopped' | 'starting' | 'running' | 'error';
  container_id: string | null;
  created_at: string;
  updated_at: string;
}
```

**New methods:**
```typescript
// List all instances for an app
listInstances(appId: string): AppInstance[]

// Create a new instance
createInstance(appId: string): Promise<AppInstance>

// Delete an instance
deleteInstance(appId: string, instanceId: string): Promise<void>

// Start a specific instance
startInstance(appId: string, instanceId: string): Promise<AppInstance>

// Stop a specific instance
stopInstance(appId: string, instanceId: string): Promise<AppInstance>

// Get instance logs
getInstanceLogs(appId: string, instanceId: string, tail?: number): Promise<string[]>
```

### Stage 3 Test

```bash
# Unit test instance creation
curl -X POST /api/apps/hello/instances
# Should create instance "hello-1"
```

---

## Stage 4: API Routes for Instances

**Goal:** Add REST endpoints for instance management.

### New Endpoints

**File:** `core/src/server/routes/apps.ts` (or new `instances.ts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/apps/:id/instances` | List all instances |
| POST | `/api/apps/:id/instances` | Create new instance |
| GET | `/api/apps/:id/instances/:instanceId` | Get instance details |
| DELETE | `/api/apps/:id/instances/:instanceId` | Delete instance |
| POST | `/api/apps/:id/instances/:instanceId/start` | Start instance |
| POST | `/api/apps/:id/instances/:instanceId/stop` | Stop instance |
| GET | `/api/apps/:id/instances/:instanceId/logs` | Get instance logs |

### Example Responses

**GET /api/apps/hello/instances**
```json
{
  "instances": [
    {
      "id": "hello-1",
      "app_id": "hello",
      "instance_number": 1,
      "status": "running",
      "container_id": "abc123...",
      "ports": [
        { "host": 10001, "container": 3000, "protocol": "tcp" }
      ]
    },
    {
      "id": "hello-2",
      "app_id": "hello",
      "instance_number": 2,
      "status": "running",
      "container_id": "def456...",
      "ports": [
        { "host": 10002, "container": 3000, "protocol": "tcp" }
      ]
    }
  ]
}
```

Each instance is accessed directly via its assigned port:
- Instance 1: `http://your-server:10001`
- Instance 2: `http://your-server:10002`

**POST /api/apps/hello/instances**
```json
{
  "instance": {
    "id": "hello-3",
    "app_id": "hello",
    "instance_number": 3,
    "status": "stopped"
  }
}
```

### Stage 4 Test

```bash
# Create instance
curl -X POST http://localhost:8080/api/apps/hello/instances

# List instances
curl http://localhost:8080/api/apps/hello/instances

# Start instance
curl -X POST http://localhost:8080/api/apps/hello/instances/hello-1/start

# Stop instance
curl -X POST http://localhost:8080/api/apps/hello/instances/hello-1/stop
```

---

## Stage 5: Port Allocation per Instance

**Goal:** Allocate ports per instance, not per app.

### Changes

**File:** `core/src/services/port-allocator/index.ts`

**Current:** Ports are allocated to `app_id`
**New:** Ports are allocated to `instance_id`

**Update methods:**
```typescript
// Change from app-based to instance-based
allocatePortsForInstance(instanceId: string, requests: PortRequest[]): PortAllocation[]
releasePortsForInstance(instanceId: string): void
getPortsForInstance(instanceId: string): PortAllocation[]
```

### Migration

- Move existing `app_ports` data to `instance_ports`
- Or keep both tables during transition

### Stage 5 Test

```bash
# Create two instances, verify different ports
curl -X POST /api/apps/hello/instances  # Gets port 10001
curl -X POST /api/apps/hello/instances  # Gets port 10002
```

---

## Stage 6: Update Start/Stop to Use Instances

**Goal:** Modify existing start/stop to work with instances.

### Behavior Options

**Option A: Default Instance (Recommended)**
- `POST /api/apps/hello/start` → Starts instance "hello-1" (creates if needed)
- `POST /api/apps/hello/stop` → Stops all instances
- Backward compatible with existing API

**Option B: Explicit Instances Only**
- `POST /api/apps/hello/start` → Error: "Use /instances endpoint"
- Breaking change, cleaner API

### Recommended: Option A

```typescript
async startApp(id: string): Promise<App> {
  // Get or create default instance
  let instances = this.listInstances(id);
  if (instances.length === 0) {
    await this.createInstance(id);
    instances = this.listInstances(id);
  }
  
  // Start the first instance
  const instance = instances[0];
  await this.startInstance(id, instance.id);
  
  return this.getApp(id);
}
```

### Stage 6 Test

```bash
# Existing API still works
curl -X POST /api/apps/hello/start  # Creates and starts hello-1
curl -X POST /api/apps/hello/stop   # Stops all instances

# New API for multiple instances
curl -X POST /api/apps/hello/instances          # Create hello-2
curl -X POST /api/apps/hello/instances/hello-2/start
```

---

## Stage 7: Documentation

**Goal:** Update README and API docs.

### Updates

- README.md: Add section on scaling with instances
- API docs: Document new endpoints
- Example: Running multiple instances

---

## Files to Modify

| File | Stage | Change |
|------|-------|--------|
| `core/src/lib/database.ts` | 1 | Add migration for new tables |
| `shared/protocol.ts` | 2 | Add `instanceId` to requests |
| `init/src/index.ts` | 2 | Instance-aware container naming |
| `core/src/services/app-manager/index.ts` | 3, 6 | Instance CRUD methods |
| `core/src/server/routes/apps.ts` | 4 | New instance endpoints |
| `core/src/services/port-allocator/index.ts` | 5 | Per-instance port allocation |
| `README.md` | 7 | Documentation |

---

## Data Model

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    apps     │       │  app_instances  │       │ instance_ports  │
├─────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)     │──┐    │ id (PK)         │──┐    │ id (PK)         │
│ name        │  │    │ app_id (FK)     │  │    │ instance_id(FK) │
│ version     │  └───>│ instance_number │  └───>│ host_port       │
│ status      │       │ status          │       │ container_port  │
│ ...         │       │ container_id    │       │ protocol        │
└─────────────┘       └─────────────────┘       └─────────────────┘
```

---

## API Design

### Instance Lifecycle

```
App Installed (no instances)
        │
        ▼
   POST /instances
        │
        ▼
Instance Created (stopped)
        │
        ▼
   POST /instances/:id/start
        │
        ▼
Instance Running
        │
        ├──── POST /instances/:id/stop ────► Instance Stopped
        │                                          │
        │                                          ▼
        │                                   DELETE /instances/:id
        │                                          │
        │                                          ▼
        └──────────────────────────────────► Instance Deleted
```

### Backward Compatibility

| Old API | Behavior |
|---------|----------|
| `POST /apps/:id/start` | Creates default instance if needed, starts it |
| `POST /apps/:id/stop` | Stops all instances |
| `GET /apps/:id` | Returns app with aggregated instance info |

---

## Rollback Plan

**Per stage:**

| Stage | Rollback |
|-------|----------|
| 1 | Drop new tables |
| 2 | Revert Init changes (ignore instanceId) |
| 3 | Remove instance methods from App Manager |
| 4 | Remove API routes |
| 5 | Revert port allocator changes |
| 6 | Revert start/stop changes |

---

## Future Considerations (Out of Scope)

- **Auto-scaling:** Scale based on CPU/memory
- **Health checks:** Restart unhealthy instances
- **Shared vs isolated data:** Options for instance data storage

---

## Estimated Effort

| Stage | Task | Effort |
|-------|------|--------|
| 1 | Database schema | 30 min |
| 2 | Init instance naming | 30 min |
| 3 | App Manager methods | 1-2 hours |
| 4 | API routes | 1 hour |
| 5 | Port allocator | 1 hour |
| 6 | Start/stop integration | 1 hour |
| 7 | Documentation | 30 min |
| | Testing | 1-2 hours |
| **Total** | | **6-9 hours** |

---

## Open Questions

1. **Instance naming:** Use `{appId}-{number}` or UUIDs?
2. **Default instance:** Auto-create on app install, or on first start?
3. **Instance limits:** Max instances per app? (Resource protection)
4. **Data isolation:** Shared `/app/data` or per-instance directories?
