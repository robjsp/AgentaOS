# AgentaOS Microkernel Architecture

> Security-focused architecture upgrade: isolating all web-facing components in containers

## Overview

This document describes an architectural upgrade to AgentaOS that moves from a monolithic kernel to a **microkernel architecture**. The primary motivation is **security**: isolating all components that receive untrusted input (HTTP requests) in Podman containers, preventing privilege escalation even if those components are compromised.

## The Problem with the Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AgentaOS (current)                   │
│                                                         │
│   Internet ──► Gateway ──► API ──► Services            │
│                                                         │
│   Everything runs directly on host with full access    │
└─────────────────────────────────────────────────────────┘
```

**Risk:** If an attacker exploits a vulnerability in the web-facing components (Gateway, API Server), they gain direct access to the host system.

Attack vectors:
- Node.js zero-day vulnerability
- Fastify framework vulnerability  
- Dependency supply chain attack
- Application logic bug

Any of these could lead to **remote code execution on the host**.

---

## Microkernel Architecture

### Design Principle

> The only code running on the host should have **zero attack surface**.

All components that:
- Receive network input
- Parse untrusted data
- Have complex dependencies

...must run inside Podman containers.

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                           HOST / VM                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    INIT (microkernel)                     │  │
│  │                                                           │  │
│  │  • No network exposure                                    │  │
│  │  • No untrusted input parsing                            │  │
│  │  • Minimal code (~200 lines)                             │  │
│  │  • Only manages container lifecycle                       │  │
│  │  • Exposes privileged socket to App Manager              │  │
│  │                                                           │  │
│  └─────────────────────────┬────────────────────────────────┘  │
│                            │                                    │
│                            │ manages via Podman                 │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   PODMAN CONTAINERS                       │  │
│  │                                                           │  │
│  │  SYSTEM SERVICES (privileged user space)                 │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐            │  │
│  │  │  Gateway  │  │    API    │  │    App    │            │  │
│  │  │  (Caddy)  │  │  Server   │  │  Manager  │            │  │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘            │  │
│  │        │              │              │                    │  │
│  │        │              │              │ Init socket        │  │
│  │        │              │              │ (privileged)       │  │
│  │        │              │              │                    │  │
│  │  ┌─────┴──────────────┴──────────────┴─────┐            │  │
│  │  │           Internal Network               │            │  │
│  │  └─────┬──────────────┬──────────────┬─────┘            │  │
│  │        │              │              │                    │  │
│  │  USER APPS (unprivileged user space)                     │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐            │  │
│  │  │  User     │  │  User     │  │  User     │            │  │
│  │  │  App 1    │  │  App 2    │  │  App 3    │            │  │
│  │  └───────────┘  └───────────┘  └───────────┘            │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Runs On | Network Exposed | Trust Level |
|-----------|---------|-----------------|-------------|
| **Init** | Host | No | Highest (kernel) |
| **Gateway** | Podman | Yes (80/443) | System |
| **API Server** | Podman | Via Gateway | System |
| **App Manager** | Podman | Via API | System (+ Init socket) |
| **File Manager** | Podman | Via API | System |
| **User Apps** | Podman | Via Gateway | Untrusted |

---

## Init (The Microkernel)

### Responsibilities

Init is the **only code running on the host**. It must be:
- **Minimal**: ~200 lines, no complex dependencies
- **Isolated**: No network exposure whatsoever
- **Auditable**: Small enough to manually verify

```
INIT responsibilities:
├── Start system service containers on boot
├── Monitor and restart crashed containers
├── Expose privileged socket for App Manager
├── Enforce container security policies
└── Nothing else
```

### What Init Does NOT Do

- ❌ Parse HTTP requests
- ❌ Handle authentication
- ❌ Serve files
- ❌ Process user input
- ❌ Complex business logic

All of these run in containers.

### Init Implementation (Conceptual)

```typescript
// init.ts - The entire microkernel (~200 lines)
import { spawn } from 'child_process';
import { createServer } from 'net';
import { existsSync } from 'fs';

const SOCKET_PATH = '/run/agentaos/init.sock';
const APPS_DIR = '/data/apps';

// Security: Fixed container options, cannot be overridden
const MANDATORY_SECURITY = [
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges',
  '--read-only',
  '--network=agentaos-internal',
];

// Allowed operations (whitelist)
type Operation = 'start' | 'stop' | 'status' | 'logs';

// Validate app ID strictly
function isValidAppId(id: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(id);
}

// Handle requests from App Manager
function handleRequest(op: Operation, appId: string): Result {
  if (!isValidAppId(appId)) {
    return { error: 'invalid app id' };
  }
  
  if (!existsSync(`${APPS_DIR}/${appId}`)) {
    return { error: 'app not found' };
  }
  
  switch (op) {
    case 'start':
      return startContainer(appId);
    case 'stop':
      return stopContainer(appId);
    // ...
  }
}

// Start container with ENFORCED security
function startContainer(appId: string) {
  const args = [
    'run', '-d',
    '--name', `agentaos-app-${appId}`,
    ...MANDATORY_SECURITY,  // Always applied
    '-v', `${APPS_DIR}/${appId}/data:/app/data`,
    `agentaos-apps/${appId}:latest`,
  ];
  
  // No shell, no injection possible
  return spawn('podman', args, { shell: false });
}

// Start socket server
const server = createServer((socket) => {
  socket.on('data', (data) => {
    const { op, appId } = JSON.parse(data.toString());
    const result = handleRequest(op, appId);
    socket.write(JSON.stringify(result));
  });
});

server.listen(SOCKET_PATH);
```

---

## Init Socket Protocol

### Security Design

The socket between Init and App Manager is a **critical security boundary**. The protocol must be designed to prevent privilege escalation.

#### Principles

1. **Fixed Command Set**: Only predefined operations allowed
2. **Parameterized Execution**: No string concatenation, no shell
3. **Strict Validation**: Reject anything unexpected
4. **Capability Limits**: Init enforces container restrictions

### Protocol Specification

#### Request Format

```typescript
interface InitRequest {
  op: 'container:start' | 'container:stop' | 'container:status' | 'container:logs';
  appId: string;  // Must match /^[a-z0-9-]{1,64}$/
}
```

That's it. No additional parameters. Init looks up everything else from the app's manifest.

#### Response Format

```typescript
interface InitResponse {
  success: boolean;
  error?: string;
  data?: {
    containerId?: string;
    status?: 'running' | 'stopped' | 'error';
    logs?: string[];
  };
}
```

#### Validation Rules

| Field | Validation |
|-------|------------|
| `op` | Must be in allowed set, else reject |
| `appId` | Must match `/^[a-z0-9-]{1,64}$/`, else reject |
| Any other field | Reject entire request |

### What Init Enforces (Not Negotiable)

When starting any container, Init **always** adds these flags:

```bash
podman run \
  --cap-drop=ALL \                          # No Linux capabilities
  --security-opt=no-new-privileges \        # Cannot escalate
  --read-only \                             # Read-only root filesystem
  --network=agentaos-internal \             # Internal network only
  --memory=512m \                           # Memory limit
  --cpus=1 \                                # CPU limit
  # ... app-specific mounts determined by Init, not App Manager
```

App Manager **cannot** request:
- `--privileged`
- `--cap-add=*`
- `--pid=host`
- `--network=host`
- Arbitrary volume mounts

---

## Security Analysis

### Attack Scenarios

#### Scenario 1: API Server Compromised

```
Attacker exploits Node.js vulnerability in API Server
                    │
                    ▼
         Attacker has shell in API container
                    │
                    ▼
         Container is sandboxed:
         • No capabilities
         • Read-only filesystem
         • No host network
         • Cannot reach Init socket
                    │
                    ▼
         Attacker STUCK - cannot escape container
```

**Result:** Compromise contained.

#### Scenario 2: App Manager Compromised

```
Attacker exploits App Manager
                    │
                    ▼
         Attacker has shell + access to Init socket
                    │
                    ▼
         Attacker tries: {"op": "start", "appId": "../../etc"}
         Init validates: REJECTED (invalid app ID)
                    │
                    ▼
         Attacker tries: {"op": "run", "args": ["--privileged"]}
         Init validates: REJECTED (invalid operation)
                    │
                    ▼
         Attacker can only: start/stop legitimate apps
         Those apps are ALSO sandboxed
                    │
                    ▼
         Attacker STUCK - started apps are also contained
```

**Result:** Limited impact - can disrupt user apps but cannot escape.

#### Scenario 3: Init Vulnerability

```
Attacker finds bug in Init's JSON parser
                    │
                    ▼
         ... this is bad
```

**Mitigation:**
- Init is ~200 lines, manually auditable
- Use safe JSON parser with limits
- Consider writing Init in memory-safe language (Rust, Go)
- Regular security audits

### Trust Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                    TRUST LEVELS                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  KERNEL (Init)          ████████████████████  Highest  │
│  - No attack surface                                    │
│  - Full host access                                     │
│                                                         │
│  SYSTEM (API, Gateway)  ██████████████        Medium   │
│  - Web-facing (attack surface)                          │
│  - Sandboxed in containers                              │
│  - App Manager has Init socket                          │
│                                                         │
│  USER APPS              ██████                Lowest   │
│  - Untrusted code                                       │
│  - Fully sandboxed                                      │
│  - No special access                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Container Security Enforcement

### Capability Restrictions

Linux capabilities that are **always dropped**:

| Capability | Why Dangerous |
|------------|---------------|
| `CAP_SYS_ADMIN` | Mount filesystems, namespace ops, escape routes |
| `CAP_NET_ADMIN` | Modify network, sniff traffic |
| `CAP_SYS_PTRACE` | Debug other processes, read memory |
| `CAP_DAC_OVERRIDE` | Bypass file permissions |
| `ALL` | We drop everything, add back nothing |

### Forbidden Container Options

Init **never** allows these, regardless of request:

```typescript
const FORBIDDEN = [
  '--privileged',      // Full host access
  '--cap-add',         // Add capabilities
  '--pid=host',        // Host PID namespace
  '--network=host',    // Host network
  '--ipc=host',        // Host IPC namespace
  '--uts=host',        // Host UTS namespace
  '-v /:/host',        // Mount host root
  '-v /etc',           // Mount host /etc
  '-v /var',           // Mount host /var
  '-v /root',          // Mount host /root
  '-v /home',          // Mount host /home
  '--device',          // Access host devices
];
```

### Defense in Depth Layers

```
Layer 1: Input Validation
         └── Reject malformed requests
         
Layer 2: Operation Whitelist  
         └── Only allow predefined operations
         
Layer 3: Parameter Validation
         └── Strict regex on app IDs
         
Layer 4: Capability Enforcement
         └── Containers always sandboxed
         
Layer 5: Podman Rootless
         └── Even container escape = unprivileged user
         
Layer 6: Host Filesystem
         └── Minimal attack surface
```

---

## Implementation Plan

### Phase 1: Init Development

1. Create minimal Init process in TypeScript/Go/Rust
2. Implement socket server
3. Implement container lifecycle commands
4. Add strict validation
5. Security audit (~200 lines, manual review)

### Phase 2: Containerize System Services

1. Create Dockerfiles for:
   - Gateway (Caddy)
   - API Server
   - App Manager
   - File Manager
2. Configure internal network
3. Mount Init socket into App Manager

### Phase 3: Integration

1. Update boot sequence (Init starts first)
2. Init starts system service containers
3. App Manager uses Init socket for user apps
4. Test all scenarios

### Phase 4: Security Hardening

1. Implement rate limiting on Init socket
2. Add audit logging
3. Regular security testing
4. Consider memory-safe rewrite of Init

---

## Directory Structure (Updated)

```
/agentaos/
├── init/                    # Init microkernel (runs on host)
│   ├── init.ts              # Main init process (~200 lines)
│   └── package.json         # Minimal dependencies
│
├── containers/              # Container images
│   ├── gateway/
│   │   └── Dockerfile
│   ├── api/
│   │   └── Dockerfile
│   ├── app-manager/
│   │   └── Dockerfile
│   └── file-manager/
│       └── Dockerfile
│
└── shared/                  # Shared types/protocols
    └── protocol.ts          # Init socket protocol types

/data/                       # Persistent data
├── documents/
├── apps/
└── system/

/run/agentaos/
└── init.sock                # Privileged socket (App Manager only)
```

---

## Comparison: Before and After

| Aspect | Before (Monolithic) | After (Microkernel) |
|--------|---------------------|---------------------|
| Web server compromise | Host access | Container sandbox |
| API server compromise | Host access | Container sandbox |
| Attack surface on host | Large (all services) | Minimal (Init only) |
| Privilege escalation | Possible | Blocked by layers |
| Container escape | N/A | Limited to unprivileged user |
| Code to audit for host security | Thousands of lines | ~200 lines |

---

## Summary

The microkernel architecture provides **defense in depth**:

1. **Minimal Kernel**: Init has no attack surface (no network, no input parsing)
2. **Containerized Services**: All web-facing code runs in sandboxed containers
3. **Secure IPC**: Init socket has strict protocol, validation, and capability enforcement
4. **Defense Layers**: Multiple independent security barriers

Even if an attacker compromises a web-facing service, they are trapped in a sandboxed container with no capabilities, no host filesystem access, and no path to privilege escalation.

The only way to compromise the host is to find a bug in ~200 lines of carefully audited Init code, or a container escape vulnerability in Podman itself.
