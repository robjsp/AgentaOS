# AgentaOS Progress Report #2

## Current Status: ~~APP INSTALL FLOW IMPLEMENTED, NEEDS TESTING~~ COMPLETE ✓

> **For app development:** See [docs/APP_DEVELOPMENT.md](docs/APP_DEVELOPMENT.md)
>
> **Next:** See [PROGRESS-3.md](PROGRESS-3.md) for full app lifecycle test results

## What Was Built This Session

### 1. Image Building at Install Time

**Files modified:**

- `shared/protocol.ts` - Added `image:build`, `image:remove` operations
- `init/src/index.ts` - Added `buildImage()`, `removeImage()` handlers
- `core/src/lib/init-client.ts` - Added `buildImage()`, `removeImage()` client methods
- `core/src/services/app-manager/index.ts` - Calls build on install, remove on uninstall

**How it works:**

1. User uploads app.zip via `POST /api/apps`
2. API extracts to `/data/apps/{app-id}/`
3. API calls Init via socket: `image:build`
4. Init checks for Dockerfile, generates default if missing
5. Init runs `podman build -t agentaos-{app-id}:latest`
6. App record saved to database

**Default Dockerfile generated:**

```dockerfile
FROM {runtime.image}
WORKDIR /app
COPY . .
RUN if [ -f package.json ]; then npm install --omit=dev; fi
EXPOSE {runtime.port}
CMD {runtime.command}
```

### 2. API as App Proxy

**Files added:**

- `core/src/server/routes/app-proxy.ts` - Proxy handler

**Files modified:**

- `core/src/server/index.ts` - Registered `/apps` route
- `containers/gateway/Caddyfile` - Updated comments

**How it works:**

1. Request comes to Gateway: `GET /apps/my-app/some/path`
2. Gateway forwards to API (all `/apps/*` → API)
3. API looks up app by route in database
4. API proxies request to container: `http://agentaos-my-app:3000/some/path`
5. Response flows back through

---

## Next Objective: Test the Full App Lifecycle

### Test Steps

1. **Rebuild & restart services in VM:**

   ```bash
   vagrant ssh
   cd /vagrant
   npm run build
   ./scripts/build-containers.sh
   ./scripts/start-agentaos.sh
   ```

2. **Create a test app** (in project):

   ```bash
   mkdir -p sample-apps/hello
   cd sample-apps/hello
   ```

   Create `app.json`:

   ```json
   {
     "id": "hello",
     "name": "Hello World",
     "version": "1.0.0",
     "runtime": {
       "image": "node:20-slim",
       "command": ["node", "server.js"],
       "port": 3000
     },
     "route": "/hello"
   }
   ```

   Create `server.js`:

   ```javascript
   const http = require("http");
   const server = http.createServer((req, res) => {
     res.writeHead(200, { "Content-Type": "application/json" });
     res.end(
       JSON.stringify({ message: "Hello from AgentaOS app!", path: req.url }),
     );
   });
   server.listen(3000, () => console.log("Hello app running on port 3000"));
   ```

   Zip it:

   ```bash
   zip -r hello-app.zip app.json server.js
   ```

3. **Upload the app:**

   ```bash
   curl -X POST http://localhost:8888/api/apps \
     -F "file=@sample-apps/hello/hello-app.zip"
   ```

4. **Start the app:**

   ```bash
   curl -X POST http://localhost:8888/api/apps/hello/start
   ```

5. **Access the app:**
   ```bash
   curl http://localhost:8888/apps/hello/
   ```

### Expected Results

- Install should return app record with status "stopped"
- Start should return app record with status "running"
- Access should return `{"message": "Hello from AgentaOS app!", "path": "/"}`

---

## Known Issues / Things to Watch

1. **Container networking**: App containers need to be on `agentaos-internal` network to be reachable by API
2. **Image build timeout**: First build pulls base image, may take a while
3. **Permission errors**: If `/data/apps` has wrong ownership, build will fail

## Architecture Reminder

```
┌─────────────────────────────────────────────────────────────────┐
│                         HOST (Vagrant VM)                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    INIT (microkernel)                     │   │
│  │  - Runs on host                                           │   │
│  │  - Unix socket at /run/agentaos/init.sock                │   │
│  │  - Handles: container start/stop, image build/remove     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              │ Podman                            │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   CONTAINER NETWORK                       │   │
│  │                                                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │   │
│  │  │   Gateway   │  │     API     │  │  User Apps  │       │   │
│  │  │   (Caddy)   │──│  (Fastify)  │──│ (sandboxed) │       │   │
│  │  │   :8080     │  │   :3000     │  │   :3000+    │       │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Files Changed This Session

| File                                     | Change                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| `shared/protocol.ts`                     | Added image:build, image:remove operations               |
| `init/src/index.ts`                      | Added buildImage, removeImage, generateDefaultDockerfile |
| `core/src/lib/init-client.ts`            | Added buildImage, removeImage methods                    |
| `core/src/services/app-manager/index.ts` | Build image on install, remove on uninstall              |
| `core/src/server/routes/app-proxy.ts`    | **NEW** - Proxy handler for /apps/\*                     |
| `core/src/server/index.ts`               | Registered app-proxy routes                              |
| `containers/gateway/Caddyfile`           | Updated comments                                         |
