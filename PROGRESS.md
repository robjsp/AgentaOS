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

## Next Steps

1. Implement user app installation flow
2. Add strict sandboxing for user apps (--cap-drop=ALL, --read-only, etc.)
3. Build out the UI dashboard

## Files Modified

- `scripts/start-agentaos.sh` - Fixed mkdir (no sudo), removed excessive security flags from system services
