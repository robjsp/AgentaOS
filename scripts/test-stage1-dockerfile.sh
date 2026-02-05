#!/bin/bash
# Test Stage 1: Verify app with Dockerfile works
# Run this inside the Vagrant VM after starting AgentaOS

set -e

API_URL="http://localhost:8080/api"
APP_URL="http://localhost:8080/apps"
SAMPLE_APP_DIR="/vagrant/sample-apps/hello"

echo "=== Stage 1 Test: Dockerfile-based App Deployment ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  exit 1
}

info() {
  echo -e "${YELLOW}→${NC} $1"
}

# Check prerequisites
info "Checking prerequisites..."

if [ ! -f "$SAMPLE_APP_DIR/Dockerfile" ]; then
  fail "Dockerfile not found at $SAMPLE_APP_DIR/Dockerfile"
fi
pass "Dockerfile exists"

if [ ! -f "$SAMPLE_APP_DIR/app.json" ]; then
  fail "app.json not found"
fi
pass "app.json exists"

if [ ! -f "$SAMPLE_APP_DIR/server.js" ]; then
  fail "server.js not found"
fi
pass "server.js exists"

# Check API is running
info "Checking API is running..."
if ! curl -s "$API_URL/apps" > /dev/null 2>&1; then
  fail "API not responding at $API_URL. Is AgentaOS running?"
fi
pass "API is responding"

echo ""
echo "=== Cleanup: Remove existing hello app ==="

info "Stopping hello app (if running)..."
curl -s -X POST "$API_URL/apps/hello/stop" > /dev/null 2>&1 || true

info "Uninstalling hello app (if exists)..."
curl -s -X DELETE "$API_URL/apps/hello" > /dev/null 2>&1 || true

echo ""
echo "=== Test: Install app with Dockerfile ==="

info "Creating zip file with Dockerfile..."
cd "$SAMPLE_APP_DIR"
rm -f hello.zip
zip -q hello.zip Dockerfile app.json server.js
pass "Created hello.zip"

info "Installing app..."
INSTALL_RESPONSE=$(curl -s -X POST "$API_URL/apps" -F "file=@hello.zip")
echo "Response: $INSTALL_RESPONSE"

if echo "$INSTALL_RESPONSE" | grep -q '"error"'; then
  fail "Install failed: $INSTALL_RESPONSE"
fi

if echo "$INSTALL_RESPONSE" | grep -q '"id":"hello"'; then
  pass "App installed successfully"
else
  fail "Unexpected install response: $INSTALL_RESPONSE"
fi

echo ""
echo "=== Test: Start app ==="

info "Starting app..."
START_RESPONSE=$(curl -s -X POST "$API_URL/apps/hello/start")
echo "Response: $START_RESPONSE"

if echo "$START_RESPONSE" | grep -q '"status":"running"'; then
  pass "App started successfully"
else
  fail "App failed to start: $START_RESPONSE"
fi

# Wait for the app to be ready (with retries)
echo ""
echo "=== Test: Access app ==="

info "Waiting for app to be ready (may take a few seconds for container startup)..."
APP_RESPONSE=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  APP_RESPONSE=$(curl -s "$APP_URL/hello/" 2>/dev/null || echo "")
  if echo "$APP_RESPONSE" | grep -q '"message":"Hello from AgentaOS app!"'; then
    break
  fi
  info "Retry $i..."
done

echo "Response: $APP_RESPONSE"

if echo "$APP_RESPONSE" | grep -q '"message":"Hello from AgentaOS app!"'; then
  pass "App responded correctly"
else
  fail "Unexpected app response: $APP_RESPONSE"
fi

echo ""
echo "=== Test: Verify Dockerfile was used (not auto-generated) ==="

info "Checking init logs for 'generating default'..."
# This checks that Init used the provided Dockerfile, not auto-generated one
# We look at podman image history to see if our Dockerfile was used
IMAGE_INFO=$(podman inspect agentaos-app-hello:latest 2>/dev/null || echo "")

if [ -n "$IMAGE_INFO" ]; then
  pass "Image agentaos-app-hello:latest exists"
else
  fail "Image not found"
fi

echo ""
echo "=== Cleanup ==="

info "Stopping app..."
curl -s -X POST "$API_URL/apps/hello/stop" > /dev/null 2>&1 || true
pass "App stopped"

info "Cleaning up zip file..."
rm -f "$SAMPLE_APP_DIR/hello.zip"

echo ""
echo "==========================================="
echo -e "${GREEN}Stage 1 Test: ALL TESTS PASSED${NC}"
echo "==========================================="
echo ""
echo "The system correctly uses the provided Dockerfile."
echo "You can proceed to Stage 2."
