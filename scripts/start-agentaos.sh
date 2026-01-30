#!/bin/bash
# Start AgentaOS in microkernel mode
# This script starts Init first, then the containers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
DATA_DIR="${DATA_DIR:-/data}"
SOCKET_DIR="/run/agentaos"
NETWORK_NAME="agentaos-internal"

echo "=== Starting AgentaOS ==="

# Ensure directories exist (owned by current user for rootless Podman)
mkdir -p "$DATA_DIR/documents"
mkdir -p "$DATA_DIR/apps"
mkdir -p "$DATA_DIR/system"
mkdir -p "$SOCKET_DIR"

# Create Podman network if it doesn't exist
if ! podman network exists "$NETWORK_NAME" 2>/dev/null; then
    echo "Creating network: $NETWORK_NAME"
    podman network create "$NETWORK_NAME"
fi

# Stop any existing containers and Init
echo "Stopping existing services..."
pkill -f "node.*init/dist/index.js" 2>/dev/null || true
podman stop agentaos-api agentaos-gateway 2>/dev/null || true
podman rm agentaos-api agentaos-gateway 2>/dev/null || true
rm -f "$SOCKET_DIR/init.sock"

# Start Init FIRST (creates the socket)
echo "Starting Init microkernel..."
cd "$ROOT_DIR/init"
export INIT_SOCKET_PATH="$SOCKET_DIR/init.sock"
export APPS_DIR="$DATA_DIR/apps"
export LOG_LEVEL="info"

node dist/index.js &
INIT_PID=$!
echo "Init PID: $INIT_PID"

# Wait for Init socket to be ready
echo "Waiting for Init socket..."
for i in {1..30}; do
    if [ -S "$SOCKET_DIR/init.sock" ]; then
        echo "Init socket ready"
        break
    fi
    if ! kill -0 $INIT_PID 2>/dev/null; then
        echo "ERROR: Init process died"
        exit 1
    fi
    sleep 1
done

if [ ! -S "$SOCKET_DIR/init.sock" ]; then
    echo "ERROR: Init socket not created after 30 seconds"
    kill $INIT_PID 2>/dev/null || true
    exit 1
fi

# Now start containers (after socket exists)
# Note: System services (API, Gateway) are trusted code and run with normal privileges.
# Only USER APPS get strict sandboxing (--cap-drop=ALL, --read-only, etc.)
echo "Starting API container..."
podman run -d \
    --name agentaos-api \
    --network "$NETWORK_NAME" \
    --userns=keep-id \
    -v "$SOCKET_DIR:/run/agentaos:rw" \
    -v "$DATA_DIR:/data:rw" \
    -e USE_INIT_SOCKET=true \
    -e DATA_DIR=/data \
    agentaos-api:latest

echo "Starting Gateway container..."
podman run -d \
    --name agentaos-gateway \
    --network "$NETWORK_NAME" \
    --userns=keep-id \
    -p 8080:80 \
    agentaos-gateway:latest

echo ""
echo "=== AgentaOS Started ==="
echo "Init PID: $INIT_PID"
echo "API container: agentaos-api"
echo "Gateway container: agentaos-gateway"
echo ""
echo "Access AgentaOS at: http://localhost:8080"
echo ""
echo "To stop: kill $INIT_PID && podman stop agentaos-api agentaos-gateway"
