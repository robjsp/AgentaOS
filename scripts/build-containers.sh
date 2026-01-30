#!/bin/bash
# Build AgentaOS system containers
# Run from repository root: ./scripts/build-containers.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Building AgentaOS Containers ==="
echo "Root directory: $ROOT_DIR"

# Build core
echo ""
echo "=== Building core ==="
cd "$ROOT_DIR/core"
npm install
npm run build

# Build UI
echo ""
echo "=== Building UI ==="
cd "$ROOT_DIR/ui"
npm install
npm run build

# Build Init
echo ""
echo "=== Building Init ==="
cd "$ROOT_DIR/init"
npm install
npm run build

# Build API container
echo ""
echo "=== Building API container ==="
cd "$ROOT_DIR"
podman build \
    -f containers/api/Dockerfile \
    -t agentaos-api:latest \
    .

# Build Gateway container
echo ""
echo "=== Building Gateway container ==="
podman build \
    -f containers/gateway/Dockerfile \
    -t agentaos-gateway:latest \
    .

echo ""
echo "=== Build complete ==="
echo "Images built:"
podman images | grep agentaos
