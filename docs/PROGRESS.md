# AgentaOS Progress Report

## Current Status: WORKING ✓

The microkernel architecture is implemented. Container startup issues have been diagnosed and fixed.

## What's Been Built

### Architecture

- Microkernel design with Init process on host
- System services (API, Gateway) run in Podman containers
- Unix socket IPC between Init and App Manager
- Security model: **User apps** get strict sandboxing, **system services** run with normal privileges

### Components Created

- `init/` - Microkernel process (runs on host)
- `core/` - API server (Fastify + SQLite)
- `ui/` - React frontend
- `containers/api/Dockerfile` - API container
- `containers/gateway/Dockerfile` - Caddy reverse proxy
- `scripts/start-agentaos.sh` - Startup script
- `scripts/build-containers.sh` - Build script

### Test Environment

- Vagrant VM with Debian + Podman (rootless)
- Port forwarding: guest 8080 → host 8888

## Issues Fixed (2026-01-30)

### 1. SQLite Permission Error

**Problem**: `SQLITE_CANTOPEN` - container couldn't write to /data
**Root cause**: `sudo mkdir` created /data as root-owned, but rootless Podman with `--userns=keep-id` runs as vagrant (UID 1000)
**Fix**: Removed `sudo` from mkdir commands in start-agentaos.sh

### 2. Caddy "Operation not permitted"

**Problem**: `exec container process: Operation not permitted`
**Root cause**: Over-applied security restrictions (`--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`) to trusted system services
**Fix**: Removed excessive restrictions from system service containers. These are trusted code - strict sandboxing is for **user apps**, not system services.

### 3. Security Model Clarification

The microkernel security boundary:

- **Init** → runs on host, minimal attack surface, no network
- **System services (API, Gateway)** → trusted code, normal privileges, containerized for isolation not restriction
- **User apps** → untrusted, get full sandbox treatment (`--cap-drop=ALL`, `--read-only`, etc.)

## Verified Working (2026-01-30)

- ✓ Init microkernel starts and creates socket
- ✓ API container starts, SQLite database created
- ✓ Gateway container starts, Caddy serving UI
- ✓ UI served at http://localhost:8080 (guest) / http://localhost:8888 (host)
- ✓ API responding at /api/system/info

## App Install & Proxy Flow Implemented (2026-01-30)

### Image Building at Install Time

- Added `image:build` and `image:remove` operations to Init protocol
- Init generates a default Dockerfile if app doesn't provide one
- AppManager calls `initClient.buildImage()` after extracting app
- On uninstall, image is removed via `initClient.removeImage()`

### API as App Proxy

- Added `/apps/*` route to API server
- API looks up app by route in database
- Proxies request to the correct container on internal network
- Returns friendly errors if app not found or not running

### Default Dockerfile Template

When an app doesn't include a Dockerfile, Init generates:

```dockerfile
FROM {runtime.image}
WORKDIR /app
COPY . .
RUN if [ -f package.json ]; then npm install --omit=dev; fi
EXPOSE {runtime.port}
CMD {runtime.command}
```

### Files Added/Modified

- `shared/protocol.ts` - Added image:build, image:remove operations
- `init/src/index.ts` - Added buildImage, removeImage handlers
- `core/src/lib/init-client.ts` - Added buildImage, removeImage methods
- `core/src/services/app-manager/index.ts` - Build image on install, remove on uninstall
- `core/src/server/routes/app-proxy.ts` - New proxy route for user apps
- `core/src/server/index.ts` - Registered proxy route
- `containers/gateway/Caddyfile` - Updated comments

## Next Steps

~~1. Create a sample app and test the full install → start → access flow~~ ✓ Done - see PROGRESS-3.md 2. Build out the UI Apps view with install/start/stop buttons 3. Add permissions UI (grant/deny document access, network)

---

**Latest progress:** [PROGRESS-3.md](PROGRESS-3.md) - Full app lifecycle verified working
