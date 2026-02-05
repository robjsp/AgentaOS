# AgentaOS

A web-based operating system for personal cloud computing.

## Overview

AgentaOS bridges the gap between simple cloud storage services (like Google Drive) and complex VPS management. It provides regular, non-technical users with their own "computer in the cloud" — a place to install and run apps that are always online, accessible from anywhere.

## Features

- **App Management**: Install, start, stop, and manage applications through a web interface
- **File Manager**: Browse and manage your documents
- **System Monitor**: View resource usage in real-time
- **WebSocket Updates**: Real-time status updates without page refreshes
- **Container Isolation**: Apps run in isolated Podman containers (user space)
- **Direct Port Mapping**: Expose TCP/UDP ports for non-HTTP services (game servers, databases, etc.)

## Architecture: Microkernel with Podman

AgentaOS uses a **microkernel architecture** for security. The only code running directly on the host is a minimal Init process (~200 lines) with zero network exposure.

```
┌─────────────────────────────────────────────────────────────────┐
│                           HOST / VM                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    INIT (microkernel)                       │ │
│  │  • No network exposure                                      │ │
│  │  • No untrusted input parsing                               │ │
│  │  • Minimal code (~200 lines)                                │ │
│  │  • Only manages container lifecycle via Unix socket         │ │
│  └──────────────────────────┬─────────────────────────────────┘ │
│                             │ Podman                             │
│                             ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   PODMAN CONTAINERS                         │ │
│  │                                                             │ │
│  │  SYSTEM SERVICES                    USER APPS               │ │
│  │  ┌─────────┐ ┌─────────┐           ┌─────────┐             │ │
│  │  │ Gateway │ │   API   │           │  App 1  │             │ │
│  │  │ (Caddy) │ │(Fastify)│           │(sandbox)│             │ │
│  │  └────┬────┘ └────┬────┘           └─────────┘             │ │
│  │       └─────┬─────┘                                         │ │
│  │             │                                               │ │
│  │       Internal Network (agentaos-internal)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Why Podman?

| Feature            | Benefit                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| **Rootless**       | Containers run without root privileges. Even container escape = unprivileged user |
| **Daemonless**     | No background daemon. Containers are direct child processes                       |
| **No socket**      | No Docker socket to mount, eliminating a major attack vector                      |
| **OCI-compatible** | Uses standard Docker images                                                       |

### Security Model

**Init (Microkernel)**

- Runs on host with full access
- Zero attack surface (no network, no input parsing)
- Communicates via Unix socket only
- Enforces container security policies

**System Services (Gateway, API)**

- Run in Podman containers
- Trusted code, normal privileges
- Web-facing but isolated from host

**User Apps**

- Fully sandboxed with strict restrictions:
  - `--cap-drop=ALL` (no Linux capabilities)
  - `--read-only` (read-only root filesystem)
  - `--security-opt=no-new-privileges`
  - Memory/CPU limits
  - Network isolation by default

### Running with Vagrant (Development)

```bash
# Start the VM
vagrant up

# SSH into the VM
vagrant ssh

# Inside the VM:
cd /vagrant

# Build everything
npm run build

# Build container images
./scripts/build-containers.sh

# Start AgentaOS
./scripts/start-agentaos.sh
```

**Access:**

- **Web UI**: http://localhost:8888
- **Direct ports**: `localhost:10000-10099` (for apps with port mappings)

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Start development servers (API + UI)
npm run dev

# Or start them separately:
npm run dev:core    # API server at http://localhost:3000
npm run dev:ui      # UI dev server at http://localhost:5173
```

### Build

```bash
# Build both core and UI
npm run build
```

### Project Structure

```
agentaos/
├── init/                 # Microkernel (runs on host)
│   └── src/index.ts      # ~200 lines, manages containers via Unix socket
│
├── core/                 # API Server (runs in container)
│   └── src/
│       ├── server/       # HTTP server and routes
│       ├── services/     # Business logic (app-manager, file-manager)
│       └── lib/          # Utilities (database, logger, init-client)
│
├── ui/                   # Frontend (React + Vite + TypeScript)
│   └── src/
│       ├── views/        # Page components
│       ├── components/   # Shared components
│       ├── hooks/        # React hooks (WebSocket, etc.)
│       └── lib/          # Utilities and API client
│
├── containers/           # Container definitions
│   ├── api/Dockerfile    # API server container
│   └── gateway/          # Caddy reverse proxy + UI
│
├── shared/               # Shared types between init and core
│   └── protocol.ts       # Init socket protocol definitions
│
├── scripts/              # Helper scripts
│   ├── build-containers.sh
│   └── start-agentaos.sh
│
├── docs/                 # Documentation
└── Vagrantfile           # Development VM with Podman
```

## Production Deployment

> **Note:** Production deployment is still in development. The microkernel architecture requires a host with Podman installed.

For development, use the Vagrant VM which has Podman pre-configured. See "Running with Vagrant" above.

## Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Full architecture documentation
- [MICROKERNEL_ARCHITECTURE.md](./docs/MICROKERNEL_ARCHITECTURE.md) - Security model deep-dive
- [APP_DEVELOPMENT.md](./docs/APP_DEVELOPMENT.md) - How to build apps for AgentaOS

## App Development

Apps are packaged as `.zip` files containing:

```
my-app.zip
├── app.json          # Manifest (required)
├── server.js         # App entry point
├── package.json      # Dependencies
└── ...
```

### app.json (Manifest)

```json
{
  "id": "my-app",
  "name": "My App",
  "version": "1.0.0",
  "description": "A sample app",
  "runtime": {
    "image": "node:20-slim",
    "command": ["node", "server.js"],
    "port": 3000
  },
  "route": "/my-app",
  "permissions": {
    "documents": {
      "access": "read",
      "paths": ["photos/"]
    }
  }
}
```

### Direct Port Mapping

For non-HTTP services (game servers, databases, SSH), apps can expose ports directly:

```json
{
  "id": "minecraft",
  "name": "Minecraft Server",
  "version": "1.0.0",
  "runtime": {
    "image": "itzg/minecraft-server",
    "port": 25565
  },
  "ports": [{ "container": 25565, "protocol": "tcp" }]
}
```

- Host ports are auto-assigned from `10000-20000`
- Toggle ports on/off via the UI (requires app restart)
- Access via `your-server:10001` (or assigned port)

## License

MIT
