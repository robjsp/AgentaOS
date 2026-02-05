# Implementation Plan: Dockerfile-Based App Deployment

## Overview

Replace the current zip-with-source approach with a Dockerfile-first model. Apps will be uploaded as a build context directory (zipped) containing a **required Dockerfile**, and AgentaOS will build and run the resulting image via Podman.

## Current State

**How it works now:**
1. User uploads `.zip` containing `app.json`, source files, `package.json`
2. App Manager extracts to `/data/apps/{appId}/`
3. Init generates a Dockerfile on-the-fly from `app.json` manifest fields
4. Podman builds image `agentaos-app-{appId}:latest`
5. Container runs with built image

**Key insight:** Init already checks for a Dockerfile first and only generates one if missing. This allows incremental implementation.

**Key files:**
- `core/src/services/app-manager/index.ts` - `installApp()` handles zip extraction
- `init/src/index.ts` - `buildImage()` generates Dockerfile if missing, runs `podman build`
- `core/src/server/routes/apps.ts` - REST endpoint `POST /apps`

## Target State

**How it will work:**
1. User uploads `.zip` containing **Dockerfile** (required), `app.json`, and build context files
2. App Manager extracts to `/data/apps/{appId}/`
3. App Manager validates Dockerfile exists
4. Init runs `podman build` using the provided Dockerfile
5. Container runs with built image

**Key changes:**
- Dockerfile is **required** (no auto-generation)
- `app.json` simplified (no `runtime.image` or `runtime.command`)
- Build context = entire extracted directory

---

## Implementation Stages

Each stage is independently testable. You can stop after any stage and have a working system.

| Stage | Description | Can Stop Here? |
|-------|-------------|----------------|
| 1 | Add Dockerfile to sample app | ✅ Yes - proves concept works |
| 2 | Remove auto-generation in Init | ✅ Yes - feature complete |
| 3 | Add early validation in App Manager | ✅ Yes - better UX |
| 4 | Cleanup manifest | ✅ Yes - cleanup |
| 5 | Update documentation | ✅ Done |

---

## Stage 1: Add Dockerfile to Sample App

**Goal:** Prove the system works with user-provided Dockerfiles (no code changes)

**What:** Create `sample-apps/hello/Dockerfile`

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy app files
COPY package*.json ./
COPY server.js ./
COPY app.json ./

# No dependencies to install for this simple app

EXPOSE 3000

CMD ["node", "server.js"]
```

**Why this works:** Init already checks for Dockerfile first; it only generates one if missing.

### Stage 1 Test

```bash
# Uninstall existing hello app if present
curl -X POST http://localhost:8888/api/apps/hello/stop 2>/dev/null
curl -X DELETE http://localhost:8888/api/apps/hello 2>/dev/null

# Create zip WITH Dockerfile
cd sample-apps/hello
zip -r hello.zip Dockerfile app.json server.js

# Install
curl -X POST http://localhost:8888/api/apps -F "file=@hello.zip"
# Expected: {"app": {"id": "hello", "status": "stopped", ...}}

# Start
curl -X POST http://localhost:8888/api/apps/hello/start
# Expected: {"app": {"status": "running", ...}}

# Access
curl http://localhost:8888/apps/hello/
# Expected: {"message": "Hello from AgentaOS app!"}

# Verify image was built from YOUR Dockerfile (not auto-generated)
# Check init logs - should NOT see "generating default"
```

**Success criteria:** App works. Init logs show it used the provided Dockerfile.

---

## Stage 2: Remove Auto-Generation in Init

**Goal:** Make Dockerfile required (apps without Dockerfile fail)

**File:** `init/src/index.ts`

### Changes

**Remove `generateDefaultDockerfile()` function (~lines 325-349):**
```typescript
// DELETE THIS ENTIRE FUNCTION
function generateDefaultDockerfile(manifest: {
  runtime?: { image?: string; command?: string[]; port?: number };
}): string {
  // ...
}
```

**Update `buildImage()` to require Dockerfile (~line 373-401):**

**Before:**
```typescript
// Check if Dockerfile exists, generate default if not
const dockerfilePath = `${appDir}/Dockerfile`;
let generatedDockerfile = false;

if (!existsSync(dockerfilePath)) {
  log('info', `No Dockerfile found for ${appId}, generating default`);
  const dockerfile = generateDefaultDockerfile(manifest);
  writeFileSync(dockerfilePath, dockerfile);
  generatedDockerfile = true;
}
```

**After:**
```typescript
// Dockerfile is required
const dockerfilePath = `${appDir}/Dockerfile`;

if (!existsSync(dockerfilePath)) {
  log('error', `No Dockerfile found for ${appId}`);
  return { id: '', success: false, error: 'Dockerfile not found. Apps must include a Dockerfile.' };
}
```

**Also remove cleanup logic (~lines 395-401):**
```typescript
// DELETE THIS BLOCK
if (generatedDockerfile) {
  try {
    unlinkSync(dockerfilePath);
  } catch {
    // Ignore cleanup errors
  }
}
```

### Stage 2 Test

```bash
# Test 1: App WITH Dockerfile still works (re-run Stage 1 test)
cd sample-apps/hello
zip -r hello.zip Dockerfile app.json server.js
curl -X DELETE http://localhost:8888/api/apps/hello 2>/dev/null
curl -X POST http://localhost:8888/api/apps -F "file=@hello.zip"
curl -X POST http://localhost:8888/api/apps/hello/start
curl http://localhost:8888/apps/hello/
# Expected: Works

# Test 2: App WITHOUT Dockerfile fails
zip -r hello-no-docker.zip app.json server.js  # No Dockerfile!
curl -X DELETE http://localhost:8888/api/apps/hello 2>/dev/null
curl -X POST http://localhost:8888/api/apps -F "file=@hello-no-docker.zip"
# Expected: Error about missing Dockerfile
```

**Success criteria:** Apps with Dockerfile work. Apps without Dockerfile fail with clear error.

---

## Stage 3: Add Early Validation in App Manager

**Goal:** Fail faster with better error messages (validation before Init is called)

**File:** `core/src/services/app-manager/index.ts`

### Changes

**Add validation in `installApp()` after app.json check (~line 117):**

```typescript
// After: if (!manifest.id || !manifest.name || !manifest.version) { ... }

// Validate Dockerfile exists
const dockerfilePath = path.join(extractDir, 'Dockerfile');
if (!fs.existsSync(dockerfilePath)) {
  throw new Error('Dockerfile not found in zip file. Apps must include a Dockerfile.');
}
```

### Stage 3 Test

```bash
# Same as Stage 2 Test 2, but error should come faster (before Init is called)
zip -r hello-no-docker.zip app.json server.js
curl -X POST http://localhost:8888/api/apps -F "file=@hello-no-docker.zip"
# Expected: Error from App Manager (check logs - should NOT reach Init)
```

**Success criteria:** Error occurs in App Manager, not Init. Faster failure, cleaner logs.

---

## Stage 4: Cleanup Manifest

**Goal:** Remove deprecated fields from app.json

### Changes

**Update `sample-apps/hello/app.json`:**

**Before:**
```json
{
  "id": "hello",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A simple hello world app",
  "runtime": {
    "image": "node:20-slim",
    "command": ["node", "server.js"],
    "port": 3000
  },
  "route": "/hello",
  "ports": [{ "container": 3000, "protocol": "tcp" }]
}
```

**After:**
```json
{
  "id": "hello",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A simple hello world app",
  "runtime": {
    "port": 3000
  },
  "route": "/hello",
  "ports": [{ "container": 3000, "protocol": "tcp" }]
}
```

**Optionally update `AppManifest` interface** in `core/src/services/app-manager/index.ts` to document that `image` and `command` are no longer used.

### Stage 4 Test

```bash
# Full lifecycle with simplified manifest
cd sample-apps/hello
zip -r hello.zip Dockerfile app.json server.js
curl -X DELETE http://localhost:8888/api/apps/hello 2>/dev/null
curl -X POST http://localhost:8888/api/apps -F "file=@hello.zip"
curl -X POST http://localhost:8888/api/apps/hello/start
curl http://localhost:8888/apps/hello/
curl -X POST http://localhost:8888/api/apps/hello/stop
```

**Success criteria:** App works with simplified manifest.

---

## Stage 5: Update Documentation

**Goal:** Update README to reflect new requirements

**File:** `README.md`

Update the "App Development" section:

```markdown
## App Development

Apps are packaged as `.zip` files containing:

```
my-app.zip
├── Dockerfile        # Container build instructions (REQUIRED)
├── app.json          # Manifest (required)
├── server.js         # App entry point
├── package.json      # Dependencies
└── ...
```

### Dockerfile (Required)

Every app must include a Dockerfile that builds the app image:

```dockerfile
FROM node:20-slim

WORKDIR /app
COPY . .
RUN npm ci --omit=dev

EXPOSE 3000
CMD ["node", "server.js"]
```

### app.json (Manifest)

```json
{
  "id": "my-app",
  "name": "My App",
  "version": "1.0.0",
  "description": "A sample app",
  "runtime": {
    "port": 3000
  },
  "route": "/my-app"
}
```
```

### Stage 5 Test

Manual review of documentation accuracy.

---

## Files to Modify

| File | Stage | Change |
|------|-------|--------|
| `sample-apps/hello/Dockerfile` | 1 | **NEW** - Add Dockerfile |
| `init/src/index.ts` | 2 | Remove `generateDefaultDockerfile()`, require Dockerfile |
| `core/src/services/app-manager/index.ts` | 3 | Add early Dockerfile validation |
| `sample-apps/hello/app.json` | 4 | Remove `runtime.image` and `runtime.command` |
| `README.md` | 5 | Update App Development section |

---

## Rollback Plan

**From any stage**, you can rollback by:

| From Stage | Rollback Action |
|------------|-----------------|
| 1 | Delete `sample-apps/hello/Dockerfile` |
| 2 | Restore `generateDefaultDockerfile()` in `init/src/index.ts` |
| 3 | Remove validation in `app-manager/index.ts` |
| 4 | Restore `runtime.image` and `runtime.command` in `app.json` |
| 5 | Revert README changes |

After Stage 2 rollback, apps without Dockerfiles will work again via auto-generation.

---

## Future Considerations (Out of Scope)

- **Build caching:** Podman already caches layers, no changes needed
- **Build progress streaming:** Could add WebSocket updates for build progress
- **Multi-stage builds:** Already supported by Podman
- **`.dockerignore` support:** Already supported by Podman
- **Pre-built images:** Could add support for pulling images from registry

---

## Estimated Effort

| Stage | Task | Effort |
|-------|------|--------|
| 1 | Add Dockerfile to sample app | 10 min |
| 1 | Test Stage 1 | 10 min |
| 2 | Remove auto-generation in Init | 15 min |
| 2 | Test Stage 2 | 10 min |
| 3 | Add App Manager validation | 10 min |
| 3 | Test Stage 3 | 5 min |
| 4 | Cleanup manifest | 5 min |
| 4 | Test Stage 4 | 5 min |
| 5 | Update README | 20 min |
| | **Total** | **~90 min** |

**Minimum viable:** Stages 1-2 (~45 min) = feature complete
**Full implementation:** All stages (~90 min) = polished
