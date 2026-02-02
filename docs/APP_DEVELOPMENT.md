# AgentaOS App Development Guide

> How to build apps that run on AgentaOS

## Overview

AgentaOS apps are containerized web services. You package your app as a zip file with a manifest, upload it, and AgentaOS handles building, running, and routing to your app.

**Key concepts:**
- Apps run in isolated Podman containers
- Apps are sandboxed with restricted permissions by default
- Apps can request access to user documents and network
- Apps are accessed via `/apps/{route}/` URLs

---

## Quick Start

### 1. Create your app files

```
my-app/
├── app.json        # Required: manifest
├── server.js       # Your app code
└── package.json    # Optional: dependencies
```

### 2. Write the manifest (`app.json`)

```json
{
  "id": "my-app",
  "name": "My App",
  "version": "1.0.0",
  "runtime": {
    "image": "node:20-slim",
    "command": ["node", "server.js"],
    "port": 3000
  },
  "route": "/my-app"
}
```

### 3. Write your server

Your app must be a web server that listens on the port specified in `runtime.port`.

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from my app!');
});

server.listen(process.env.PORT || 3000);
```

### 4. Package and upload

```bash
zip -r my-app.zip app.json server.js package.json
curl -X POST http://localhost:8888/api/apps -F "file=@my-app.zip"
```

### 5. Start and access

```bash
curl -X POST http://localhost:8888/api/apps/my-app/start
curl http://localhost:8888/apps/my-app/
```

---

## App Manifest Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier. Lowercase alphanumeric with hyphens. 1-64 chars. |
| `name` | string | Display name shown in UI |
| `version` | string | Semantic version (e.g., "1.0.0") |

### Runtime Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `runtime.image` | string | `node:20-slim` | Base Docker/OCI image |
| `runtime.command` | string[] | `["node", "index.js"]` | Command to start the app |
| `runtime.port` | number | `3000` | Port the app listens on inside container |
| `runtime.healthCheck` | string | - | Optional health check endpoint (e.g., "/health") |

### Routing

| Field | Type | Description |
|-------|------|-------------|
| `route` | string | URL path prefix. App is accessed at `/apps{route}/`. Example: `"/gallery"` → `/apps/gallery/` |

### Optional Metadata

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Short description of the app |
| `author` | string | Author name or email |
| `license` | string | License identifier (e.g., "MIT") |

---

## Permissions

Apps are sandboxed by default with no access to user data or external network. Request permissions in your manifest.

### Document Access

Access the user's shared documents folder.

```json
{
  "permissions": {
    "documents": {
      "access": "read",
      "paths": ["photos/", "music/"]
    }
  }
}
```

| Access Level | Description |
|--------------|-------------|
| `"none"` | No access (default) |
| `"read"` | Read files only |
| `"readwrite"` | Read and write files |

**Paths:**
- `["*"]` - Access all documents
- `["photos/", "videos/"]` - Access specific folders only

**Inside your container:** Documents are mounted at `/app/documents/`

### Network Access

Allow outbound internet connections.

```json
{
  "permissions": {
    "network": {
      "outbound": true
    }
  }
}
```

By default, apps can only communicate within the AgentaOS internal network (to reach the API). Set `outbound: true` to allow external API calls, fetching resources, etc.

---

## User Settings

Define settings that users can configure through the UI.

```json
{
  "settings": [
    {
      "key": "ITEMS_PER_PAGE",
      "label": "Items per page",
      "type": "number",
      "default": 20
    },
    {
      "key": "THEME",
      "label": "Color theme",
      "type": "select",
      "options": ["light", "dark", "auto"],
      "default": "auto"
    },
    {
      "key": "API_KEY",
      "label": "External API Key",
      "type": "password"
    }
  ]
}
```

**Setting types:** `string`, `number`, `boolean`, `select`, `password`

Settings are passed to your app as environment variables with the key name.

---

## Custom Dockerfile

By default, AgentaOS generates a Dockerfile:

```dockerfile
FROM {runtime.image}
WORKDIR /app
COPY . .
RUN if [ -f package.json ]; then npm install --omit=dev; fi
EXPOSE {runtime.port}
CMD {runtime.command}
```

For more control, include your own `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000
CMD ["python", "app.py"]
```

---

## Environment Variables

These environment variables are available to your app:

| Variable | Description |
|----------|-------------|
| `PORT` | Port your app should listen on |
| `APP_ID` | Your app's ID |
| `APP_DATA` | Path to persistent data directory (`/app/data`) |
| User settings | Each setting key from your manifest |

---

## Persistent Data

Your app has a private data directory at `/app/data` that persists across restarts.

```javascript
const fs = require('fs');
const dataPath = process.env.APP_DATA || '/app/data';

// Save data
fs.writeFileSync(`${dataPath}/config.json`, JSON.stringify(config));

// Load data
const config = JSON.parse(fs.readFileSync(`${dataPath}/config.json`));
```

---

## Example Apps

### Node.js Web Server

```json
{
  "id": "hello-node",
  "name": "Hello Node",
  "version": "1.0.0",
  "runtime": {
    "image": "node:20-slim",
    "command": ["node", "server.js"],
    "port": 3000
  },
  "route": "/hello"
}
```

```javascript
// server.js
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello!', path: req.url }));
}).listen(3000);
```

### Python Flask App

```json
{
  "id": "flask-app",
  "name": "Flask Example",
  "version": "1.0.0",
  "runtime": {
    "image": "python:3.11-slim",
    "command": ["python", "app.py"],
    "port": 5000
  },
  "route": "/flask"
}
```

```python
# app.py
from flask import Flask
app = Flask(__name__)

@app.route('/')
def hello():
    return {'message': 'Hello from Flask!'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

```
# requirements.txt
flask
```

```dockerfile
# Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["python", "app.py"]
```

### Static Website

```json
{
  "id": "my-site",
  "name": "My Website",
  "version": "1.0.0",
  "runtime": {
    "image": "nginx:alpine",
    "port": 80
  },
  "route": "/site"
}
```

```dockerfile
# Dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

### Photo Gallery (with document access)

```json
{
  "id": "gallery",
  "name": "Photo Gallery",
  "version": "1.0.0",
  "runtime": {
    "image": "node:20-slim",
    "command": ["node", "server.js"],
    "port": 3000
  },
  "route": "/gallery",
  "permissions": {
    "documents": {
      "access": "read",
      "paths": ["photos/"]
    }
  }
}
```

---

## API Reference

### Install App
```
POST /api/apps
Content-Type: multipart/form-data

file: <app.zip>
```

### List Apps
```
GET /api/apps
```

### Get App Details
```
GET /api/apps/:id
```

### Start App
```
POST /api/apps/:id/start
```

### Stop App
```
POST /api/apps/:id/stop
```

### Restart App
```
POST /api/apps/:id/restart
```

### Get App Logs
```
GET /api/apps/:id/logs
```

### Update Settings
```
PUT /api/apps/:id/settings
Content-Type: application/json

{ "ITEMS_PER_PAGE": 50, "THEME": "dark" }
```

### Uninstall App
```
DELETE /api/apps/:id
```

---

## Security Model

Apps run with these restrictions:

| Restriction | Description |
|-------------|-------------|
| `--cap-drop=ALL` | No Linux capabilities |
| `--read-only` | Read-only root filesystem |
| `--security-opt=no-new-privileges` | Cannot escalate privileges |
| `--memory=512m` | 512MB memory limit |
| `--cpus=1` | 1 CPU core limit |
| `--pids-limit=100` | Max 100 processes |
| Network isolation | Internal network only (unless `network.outbound: true`) |

Your app can write to:
- `/app/data` - Persistent storage
- `/tmp` - Temporary files (cleared on restart)

---

## Troubleshooting

### App won't start
- Check logs: `curl http://localhost:8888/api/apps/{id}/logs`
- Verify `runtime.port` matches what your app listens on
- Ensure `runtime.command` is correct

### Can't access app
- Verify app is running: `curl http://localhost:8888/api/apps/{id}`
- Check the `route` in your manifest
- Access at `/apps{route}/` (note: route should start with `/`)

### Permission denied for documents
- Check if permission was granted (currently auto-granted, UI coming)
- Verify paths in manifest match actual document folders

### Build fails
- Check if base image exists and is pullable
- For custom Dockerfile, test locally first with `podman build`
