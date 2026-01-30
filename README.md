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
├── core/                 # Backend (Fastify + TypeScript)
│   ├── src/
│   │   ├── server/       # HTTP server and routes
│   │   ├── services/     # Business logic (app-manager, file-manager)
│   │   └── lib/          # Utilities (database, logger, events)
│   └── package.json
│
├── ui/                   # Frontend (React + Vite + TypeScript)
│   ├── src/
│   │   ├── views/        # Page components
│   │   ├── components/   # Shared components
│   │   ├── hooks/        # React hooks
│   │   ├── stores/       # Zustand stores
│   │   └── lib/          # Utilities and API client
│   └── package.json
│
├── Dockerfile            # Production container image
├── docker-compose.yml    # Docker Compose for deployment
└── ARCHITECTURE.md       # Detailed architecture documentation
```

## Docker

### Build the image

```bash
docker build -t agentaos .
```

### Run with Docker

```bash
docker run -d \
  -p 8080:80 \
  -v agentaos-data:/data \
  --name agentaos \
  agentaos
```

### Run with Docker Compose

```bash
docker compose up -d
```

Access AgentaOS at http://localhost:8080

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation on:

- Kernel space vs. user space
- App model and permissions
- WebSocket communication
- Security considerations

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

## License

MIT
