# AgentaOS Architecture

> A web-based operating system for personal cloud computing

## Overview

AgentaOS is a new computing paradigm that bridges the gap between simple cloud storage services (like Google Drive) and complex VPS management. It provides regular, non-technical users with their own "computer in the cloud" — a place to install and run apps that are always online, accessible from anywhere.

**AgentaOS is not:**
- A desktop OS emulator (no windows, taskbars, or desktop metaphors)
- A server management tool for sysadmins
- A container orchestration platform

**AgentaOS is:**
- A personal cloud platform for everyone
- An app runtime where users install apps like they do on phones
- A simple interface to "your place on the internet"

---

## Core Concepts

### The Two Spaces: Kernel and User

AgentaOS borrows the kernel/user space distinction from traditional operating systems, adapted for a containerized web environment.

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentaOS Container                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    KERNEL SPACE                         │ │
│  │                                                         │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │ │
│  │  │ Gateway │ │   API   │ │  App    │ │  File   │      │ │
│  │  │         │ │  Server │ │ Manager │ │ Manager │      │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │ │
│  │                                                         │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────────────┐      │ │
│  │  │ Web UI  │ │  Auth   │ │ Permission Manager  │      │ │
│  │  └─────────┘ └─────────┘ └─────────────────────┘      │ │
│  │                                                         │ │
│  │  Runs as: Direct processes in main container            │ │
│  │  Trust level: Full system access                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            │ Podman                          │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                     USER SPACE                          │ │
│  │                                                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │ │
│  │  │   App 1     │  │   App 2     │  │   App 3     │    │ │
│  │  │ (container) │  │ (container) │  │ (container) │    │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │ │
│  │                                                         │ │
│  │  Runs as: Rootless Podman containers                    │ │
│  │  Trust level: Sandboxed, permission-gated               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Kernel Space

**What it is:** The core AgentaOS services that make everything work. These run as direct processes inside the main container with full system access.

**Characteristics:**
- Trusted code (part of AgentaOS itself)
- Direct filesystem access
- Manages user space apps via Podman
- Handles authentication, routing, permissions
- Cannot be installed/uninstalled by users

**Kernel Space Components:**

| Component | Responsibility | Has UI? |
|-----------|----------------|---------|
| **Gateway** | HTTP routing, TLS termination, routes requests to apps or UI | No |
| **API Server** | REST/WebSocket API for the web UI and external integrations | No |
| **App Manager** | Installs, starts, stops, updates user apps via Podman | Yes |
| **File Manager** | Manages shared documents and app storage | Yes |
| **Permission Manager** | Enforces app permissions, handles approval flows | Yes (via App Manager) |
| **Auth** | User authentication and sessions | Yes (login screen) |
| **Process Monitor** | View system processes, resource usage, logs | Yes |
| **Dashboard** | Overview of system status and running apps | Yes |
| **Settings** | System-wide configuration | Yes |

Each kernel space app with a UI is a **view** within the AgentaOS web interface, not a separate window or application. They share navigation and common UI patterns.

### User Space

**What it is:** Apps installed by users. Each app runs in its own rootless Podman container, isolated from the system and other apps.

**Characteristics:**
- Untrusted code (from app packages)
- Sandboxed in containers
- Limited access, controlled by permissions
- Can only see what AgentaOS explicitly mounts
- Users can install, configure, start, stop, uninstall

**User Space App Examples:**
- Personal blog or website
- Discord/Telegram bot
- File sync service
- Note-taking app
- Automation scripts
- Game server
- AI agents

---

## Web Interface Model

### Philosophy: Web-Native, Not Desktop-for-Web

AgentaOS is **not** a desktop operating system rendered in a browser. There are no draggable windows, no taskbar, no desktop icons. These metaphors belong to personal computers designed for local, synchronous interaction.

Instead, AgentaOS embraces **web-native patterns** for interacting with a remote server:

| Desktop Metaphor (Avoid) | Web-Native Approach (Use) |
|--------------------------|---------------------------|
| Draggable windows | Pages/views with navigation |
| Desktop icons | Dashboard with app cards |
| File explorer with tree view | Searchable file list, breadcrumbs |
| Right-click context menus | Inline actions, action bars |
| Modal dialogs for everything | Inline editing, expandable panels |
| Synchronous operations | Async operations with progress indicators |

### Kernel Space Apps

Each kernel space component that requires user interaction exposes its own **web-based UI**. These are not "windows" but dedicated **web applications** optimized for their specific purpose.

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentaOS Web UI                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     Navigation                           ││
│  │  [Dashboard]  [Apps]  [Files]  [System]  [Settings]     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                          ││
│  │              Current View (e.g., Dashboard)              ││
│  │                                                          ││
│  │                                                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Built-in Kernel Space Apps

#### Dashboard

The landing page. Shows at-a-glance status of the system and running apps.

**Web patterns used:**
- Card-based layout for app status
- Real-time updates via WebSocket (no page refresh)
- Quick actions (start/stop) inline on each card

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  System Status                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ CPU: 12%     │ │ Memory: 45%  │ │ Disk: 23%    │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  Running Apps                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● Blog Server          Running    [Stop] [Logs]     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ● Photo Gallery        Running    [Stop] [Logs]     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ○ Discord Bot          Stopped    [Start]           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### App Manager

Browse, install, configure, and manage user space apps.

**Web patterns used:**
- List/grid views for installed apps
- Search and filter
- Expandable detail panels
- Form-based settings (not config files)
- Progress indicators for install/update operations

#### File Manager

Browse and manage the shared documents folder.

**Web patterns used:**
- List view with sortable columns (not tree view)
- Breadcrumb navigation
- Drag-and-drop upload
- Inline rename
- Multi-select with bulk actions
- Preview panel for images/documents

```
┌─────────────────────────────────────────────────────────────┐
│  Files                                                       │
├─────────────────────────────────────────────────────────────┤
│  📁 documents / photos / vacation                           │
│                                                              │
│  [Upload] [New Folder]                      🔍 Search...    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Name              Size      Modified      Actions    │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 📁 beach         —         Jan 15        [Open]      │   │
│  │ 🖼 sunset.jpg    2.4 MB    Jan 14        [···]       │   │
│  │ 🖼 hotel.jpg     1.8 MB    Jan 14        [···]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Process Monitor (System)

View running processes, resource usage, and system logs.

**Web patterns used:**
- **WebSocket-driven real-time updates** — process list updates live without polling
- Streaming log viewer (like `tail -f` but in browser)
- Filterable, searchable log output
- Resource graphs with time-series data

```
┌─────────────────────────────────────────────────────────────┐
│  System › Processes                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Process           PID     CPU    Memory   Actions    │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ gateway           12      0.5%   45 MB    [logs]     │   │
│  │ api-server        15      1.2%   120 MB   [logs]     │   │
│  │ blog-server       234     0.8%   85 MB    [logs]     │   │
│  │ photo-gallery     567     2.1%   200 MB   [logs]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Live Logs (gateway)                          [Clear] [⏸]  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 14:23:01 GET /api/apps 200 12ms                      │   │
│  │ 14:23:02 GET /apps/blog/ 200 45ms                    │   │
│  │ 14:23:05 POST /api/apps/blog/restart 200 1203ms      │   │
│  │ █                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Settings

System-wide configuration.

**Web patterns used:**
- Grouped settings in sections
- Form inputs with validation
- Immediate feedback on changes
- No "Apply" button where possible (auto-save)

### Real-Time Communication

AgentaOS uses **WebSockets** for real-time updates where appropriate:

| Feature | Protocol | Why |
|---------|----------|-----|
| App status changes | WebSocket | Instant feedback when apps start/stop |
| Process list | WebSocket | CPU/memory stats update in real-time |
| Log streaming | WebSocket | Live log output, no polling |
| File operations | REST + WebSocket | REST for actions, WebSocket for progress |
| Settings changes | REST | Simple request-response is sufficient |

**WebSocket connection:**
```
wss://my-agentaos.com/ws

Messages:
→ { "subscribe": ["apps", "processes", "logs:gateway"] }
← { "type": "app:status", "id": "blog", "status": "running" }
← { "type": "process:stats", "data": [...] }
← { "type": "log", "source": "gateway", "line": "GET /api/apps 200" }
```

### User Space App UIs

User space apps that have web interfaces are accessed through the gateway:

```
https://my-agentaos.com/apps/blog/        → Blog app's UI
https://my-agentaos.com/apps/gallery/     → Photo gallery UI
```

The AgentaOS UI provides a **launcher** or **app list** to access these, but the apps themselves render their own interfaces. AgentaOS does not wrap or modify them.

### Design Principles for AgentaOS UI

1. **Server-aware**: Always show that this is a remote system (latency indicators, connection status)
2. **Async-first**: Operations may take time; show progress, allow cancellation
3. **Resilient**: Handle disconnection gracefully, auto-reconnect
4. **Responsive**: Works on mobile devices (managing your cloud from your phone)
5. **Accessible**: Keyboard navigable, screen reader friendly
6. **Minimal chrome**: Content over decoration; the data is the interface

### What AgentaOS UI is NOT

| Avoid | Reason |
|-------|--------|
| Animated desktop backgrounds | Not a desktop |
| Window management (minimize, maximize, tile) | Not a desktop |
| System tray / notification area icons | Web has its own notification APIs |
| Start menu / app launcher dock | Use navigation, search |
| "My Computer" / drive icons | Not relevant abstraction |
| Skeuomorphic elements (folders that look like folders) | Use clear, modern iconography |

---

## Why Podman?

AgentaOS uses Podman (not Docker) for user space apps:

| Feature | Benefit for AgentaOS |
|---------|----------------------|
| **Rootless** | Apps run without root privileges. Even if an app escapes its container, it only has unprivileged access. |
| **Daemonless** | No background daemon consuming resources. Containers are direct child processes. |
| **No socket** | No Docker socket to mount, eliminating a major security concern. |
| **Pods** | Native support for multi-container apps sharing network namespace. |
| **Docker compatible** | Uses same images, similar CLI, familiar to developers. |

---

## Directory Structure

### Inside the Container

```
/agentaos/
├── core/                     # Kernel space backend services
│   ├── server/               # Main API server (Fastify)
│   │   ├── index.js          # Entry point
│   │   ├── routes/           # REST API routes
│   │   └── websocket/        # WebSocket handlers
│   │
│   ├── gateway/              # HTTP routing (Caddy config)
│   │
│   ├── services/             # Backend services for kernel apps
│   │   ├── app-manager/      # Podman orchestration
│   │   ├── file-manager/     # Storage operations
│   │   ├── process-monitor/  # System process tracking
│   │   ├── permission/       # Permission enforcement
│   │   └── auth/             # Authentication
│   │
│   └── lib/                  # Shared utilities
│
├── ui/                       # Web UI (built React app)
│   └── dist/
│       ├── index.html
│       └── assets/
│
└── bin/                      # CLI tools (optional)
```

### Persistent Data (Mounted Volume)

```
/data/
├── documents/                # User's shared documents
│   ├── photos/
│   ├── files/
│   └── ...
│
├── apps/                     # Per-app private storage
│   ├── {app-id}/
│   └── ...
│
├── system/                   # AgentaOS system data
│   ├── config.json           # System configuration
│   ├── agentaos.db           # SQLite database
│   └── logs/                 # System logs
│
└── containers/               # Podman container storage
```

### Storage Access by Space

| Path | Kernel Space | User Space |
|------|--------------|------------|
| `/data/system/` | Full access | No access |
| `/data/documents/` | Full access | Permission-gated |
| `/data/apps/{app-id}/` | Full access | Only own directory |
| `/data/containers/` | Full access | No access (Podman internal) |

---

## App Model

### App Manifest (`app.json`)

Every app package includes a manifest describing the app:

```json
{
  "id": "photo-gallery",
  "name": "Photo Gallery",
  "version": "1.0.0",
  "description": "Browse and organize your photos",
  "author": "Example Developer",
  "license": "MIT",
  
  "runtime": {
    "image": "node:20-slim",
    "command": ["node", "server.js"],
    "port": 3000,
    "healthCheck": "/health"
  },
  
  "route": "/gallery",
  
  "permissions": {
    "documents": {
      "access": "read",
      "paths": ["photos/"]
    },
    "network": {
      "outbound": false
    }
  },
  
  "settings": [
    {
      "key": "ITEMS_PER_PAGE",
      "label": "Items per page",
      "type": "number",
      "default": 20
    }
  ],
  
  "install": "npm install --production"
}
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (lowercase, hyphens) |
| `name` | Yes | Display name |
| `version` | Yes | Semantic version |
| `description` | No | Short description |
| `runtime.image` | Yes | Base container image |
| `runtime.command` | Yes | Command to start the app |
| `runtime.port` | Yes | Port the app listens on inside container |
| `runtime.healthCheck` | No | Endpoint to check app health |
| `route` | No | URL path prefix (for web apps) |
| `permissions` | No | Requested permissions |
| `settings` | No | User-configurable settings |
| `install` | No | Install command (run at install time) |

### App Package Format

Apps are distributed as `.zip` files containing:

```
my-app.zip
├── app.json              # Manifest (required)
├── Dockerfile            # Optional, for custom images
├── server.js             # App code
├── package.json          # Dependencies
└── ...
```

If no `Dockerfile` is provided, AgentaOS uses the `runtime.image` from the manifest and copies the app files into it.

---

## Permission System

### Philosophy

User space apps are untrusted. They get no access by default and must request permissions explicitly. Users approve or deny at install time and can change permissions later.

### Permission Types

#### Documents Access

Controls access to the shared documents folder.

```json
"permissions": {
  "documents": {
    "access": "read",       // "none" | "read" | "readwrite"
    "paths": ["photos/"]    // Specific paths, or ["*"] for all
  }
}
```

| Access Level | Description |
|--------------|-------------|
| `none` | No access (default) |
| `read` | Can read files |
| `readwrite` | Can read and write files |

#### Network Access

Controls outbound network access.

```json
"permissions": {
  "network": {
    "outbound": true        // Can the app make external requests?
  }
}
```

#### Future Permissions

| Permission | Purpose |
|------------|---------|
| `clipboard` | Read/write shared clipboard |
| `notifications` | Send notifications to user |
| `inter-app` | Communicate with other apps |
| `background` | Run when "stopped" (scheduled tasks) |

### Permission Enforcement

When starting a user space app, the App Manager:

1. Reads granted permissions from database
2. Constructs Podman arguments based on permissions:
   - Mounts only permitted document paths
   - Sets network mode based on network permission
3. Starts container with restricted access

```bash
# Example: App with read access to photos/
podman run -d \
  --name agentaos-photo-gallery \
  --user 1000:1000 \
  --network none \                                          # No outbound network
  -v /data/apps/photo-gallery:/app/data \                   # Private storage
  -v /data/documents/photos:/app/documents/photos:ro \      # Read-only photos
  -p 127.0.0.1:3001:3000 \                                  # Internal port only
  photo-gallery:latest
```

### Permission Approval UI

At install time:

```
┌─────────────────────────────────────────┐
│       Install "Photo Gallery"           │
├─────────────────────────────────────────┤
│                                         │
│  This app requests:                     │
│                                         │
│  📁 Read your Photos folder             │
│  🌐 No internet access                  │
│                                         │
│         [Allow]    [Deny]               │
│                                         │
└─────────────────────────────────────────┘
```

Denying a permission installs the app without that access. The app must handle this gracefully.

---

## App Lifecycle

### States

```
           ┌──────────────────────────────────────┐
           │                                      │
           ▼                                      │
┌──────────────────┐                              │
│    Available     │  (in store, not installed)   │
└────────┬─────────┘                              │
         │ install                                │
         ▼                                        │
┌──────────────────┐                              │
│    Installed     │  (on disk, not running)      │
└────────┬─────────┘                              │
         │ start          │ uninstall             │
         ▼                ▼                       │
┌──────────────────┐    ┌─────────────────┐      │
│     Running      │    │   (removed)     │      │
└────────┬─────────┘    └─────────────────┘      │
         │                                        │
         │ stop / crash                           │
         │                                        │
         └───────────► Installed ─────────────────┘
```

### Operations

| Operation | Description |
|-----------|-------------|
| **Install** | Download package, extract, create container image, request permissions |
| **Start** | Create and start Podman container |
| **Stop** | Stop and remove container (data preserved) |
| **Restart** | Stop then start |
| **Update** | Download new version, stop, replace, start |
| **Uninstall** | Stop, remove container image, delete app data (optional) |

### Health Monitoring

For apps that define a `healthCheck` endpoint:

1. App Manager periodically requests the health endpoint
2. Consecutive failures trigger status change
3. Optional: auto-restart on failure

Status values:
- `running` — Container running, health check passing
- `degraded` — Container running, health check failing
- `stopped` — Container not running
- `error` — Container failed to start

---

## Gateway and Routing

The Gateway (kernel space) routes incoming HTTP requests:

```
                    ┌─────────────────────────────────┐
                    │            Gateway              │
    HTTP/HTTPS      │                                 │
    ─────────────►  │  /              → Web UI        │
                    │  /api/*         → API Server    │
                    │  /apps/blog/*   → Blog App      │
                    │  /apps/photos/* → Gallery App   │
                    │                                 │
                    └─────────────────────────────────┘
```

### Routing Rules

1. `/` and static assets → Web UI
2. `/api/*` → API Server
3. `/apps/{app-route}/*` → User space app (via internal port)

### Internal Networking

User space apps listen on internal ports only (127.0.0.1). The Gateway proxies external requests to them. Apps cannot receive direct external traffic.

```
External request: https://my-agentaos.com/apps/blog/posts
                           │
                           ▼
               Gateway (port 443)
                           │
                           ▼
               Blog container (127.0.0.1:3001)
```

---

## Technology Stack

### Container Base

```
debian:bookworm-slim
```

Chosen for:
- Stability and wide compatibility
- glibc-based (no musl issues)
- Well-maintained security updates
- ~80MB base size

### Kernel Space

| Component | Technology |
|-----------|------------|
| API Server | Node.js + Fastify |
| Gateway | Caddy |
| Database | SQLite |
| Process management | Node.js (child_process) |

### User Space

| Component | Technology |
|-----------|------------|
| Container runtime | Podman (rootless) |
| App images | OCI-compatible |
| Storage | Bind mounts from host |

### Web UI

| Component | Technology |
|-----------|------------|
| Framework | React |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Components | shadcn/ui (recommended) |
| State management | React Query (server state) + Zustand (client state) |
| Real-time | Native WebSocket or socket.io-client |
| Routing | React Router |

---

## Docker Image Structure

```dockerfile
FROM debian:bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    podman \
    fuse-overlayfs \
    slirp4netns \
    uidmap \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Caddy
RUN curl -o /usr/bin/caddy -L \
    "https://caddyserver.com/api/download?os=linux&arch=amd64" \
    && chmod +x /usr/bin/caddy

# Create agentaos user for rootless Podman
RUN useradd -m -u 1000 agentaos \
    && echo "agentaos:100000:65536" >> /etc/subuid \
    && echo "agentaos:100000:65536" >> /etc/subgid

# Copy AgentaOS
WORKDIR /agentaos
COPY core/ ./core/
COPY ui/dist/ ./ui/

# Create data directory structure
RUN mkdir -p /data/documents /data/apps /data/system /data/containers \
    && chown -R agentaos:agentaos /data

# Podman needs this for rootless
ENV _CONTAINERS_USERNS_CONFIGURED=""

EXPOSE 80 443

# Start AgentaOS (as root, drops to agentaos for Podman operations)
CMD ["node", "core/index.js"]
```

---

## API Endpoints

### Apps

```
GET    /api/apps                    # List all installed apps
GET    /api/apps/:id                # Get app details
POST   /api/apps                    # Install app (multipart: zip upload)
DELETE /api/apps/:id                # Uninstall app

POST   /api/apps/:id/start          # Start app
POST   /api/apps/:id/stop           # Stop app
POST   /api/apps/:id/restart        # Restart app

GET    /api/apps/:id/logs           # Get app logs
GET    /api/apps/:id/status         # Get app status (running, stopped, error)

PUT    /api/apps/:id/settings       # Update app settings
PUT    /api/apps/:id/permissions    # Update app permissions (triggers restart)
```

### Documents

```
GET    /api/documents               # List root directory
GET    /api/documents/*path         # List directory or get file
POST   /api/documents/*path         # Upload file
PUT    /api/documents/*path         # Update file
DELETE /api/documents/*path         # Delete file or directory
POST   /api/documents/*path?mkdir   # Create directory
```

### System

```
GET    /api/system/info             # System info (disk, memory, version)
GET    /api/system/config           # Get system configuration
PUT    /api/system/config           # Update system configuration
```

### Auth

```
POST   /api/auth/login              # Login
POST   /api/auth/logout             # Logout
GET    /api/auth/session            # Get current session
PUT    /api/auth/password           # Change password
```

---

## Security Considerations

### User Space Isolation

- Apps run as rootless containers (no root even inside container)
- Filesystem access limited to explicit mounts
- Network access denied by default
- Apps cannot see other apps' containers or data

### Kernel Space Protection

- User space apps cannot access kernel space processes
- API requires authentication
- System data not mountable by apps

### Network Security

- Gateway terminates TLS
- Apps only accessible through Gateway
- Outbound network permission-gated

### Data Security

- Per-app data isolation
- Shared documents require explicit permission
- Permissions auditable and revocable

---

## Future Considerations

### App Distribution

1. **Phase 1 (Current):** Zip file upload
2. **Phase 2:** Git repository URLs
3. **Phase 3:** AgentaOS App Registry (curated store)
4. **Phase 4:** Third-party registries

### Multi-User Support

Currently single-user. Future versions may support:
- Multiple user accounts
- Per-user app instances
- Shared apps with different permissions per user

### Clustering

Currently single-node. Future versions may support:
- Multiple AgentaOS instances
- Shared storage backend
- Load balancing

### App Marketplace

- Curated app catalog
- Ratings and reviews
- One-click install from store
- Automatic updates

---

## Glossary

| Term | Definition |
|------|------------|
| **Kernel Space** | Core AgentaOS services running as direct processes |
| **User Space** | Apps installed by users, running in Podman containers |
| **Kernel Space App** | A built-in system component with its own web UI (e.g., File Manager, Process Monitor) |
| **User Space App** | A user-installed application running in a sandboxed container |
| **App** | A user-installable, runnable unit of software |
| **Manifest** | The `app.json` file describing an app |
| **Permission** | A capability granted to an app (documents access, network, etc.) |
| **Gateway** | The HTTP reverse proxy routing traffic to apps |
| **Documents** | The shared storage area accessible to permitted apps |
| **View** | A page/screen within the AgentaOS web UI (not a window) |
| **WebSocket** | Persistent connection for real-time updates (logs, status, processes) |
| **Dashboard** | The home view showing system overview and app status |

---

## Summary

AgentaOS provides a simple, secure platform for running personal cloud applications. By separating kernel space (trusted system services) from user space (untrusted user apps in containers), it enables users to install apps from various sources while maintaining security and isolation. Podman's rootless containers ensure that even if an app is compromised, the blast radius is limited.

The system is designed for non-technical users: install an app, grant permissions, and it runs. No terminals, no configuration files, no server administration. Just apps that work for you, 24/7.
