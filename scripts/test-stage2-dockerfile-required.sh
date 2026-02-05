#!/bin/bash
# Test Stage 2: Verify Dockerfile is now REQUIRED
# Run this inside the Vagrant VM after rebuilding Init and starting AgentaOS

set -e

API_URL="http://localhost:8080/api"
APP_URL="http://localhost:8080/apps"
SAMPLE_APP_DIR="/vagrant/sample-apps/hello"

echo "=== Stage 2 Test: Dockerfile Required ==="
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
info "Checking API is running..."
if ! curl -s "$API_URL/apps" > /dev/null 2>&1; then
  fail "API not responding at $API_URL. Is AgentaOS running?"
fi
pass "API is responding"

echo ""
echo "=== Test 1: App WITH Dockerfile should succeed ==="

info "Cleaning up existing hello app..."
curl -s -X POST "$API_URL/apps/hello/stop" > /dev/null 2>&1 || true
curl -s -X DELETE "$API_URL/apps/hello" > /dev/null 2>&1 || true

info "Creating zip WITH Dockerfile..."
cd "$SAMPLE_APP_DIR"
rm -f hello.zip hello-no-docker.zip
zip -q hello.zip Dockerfile app.json server.js
pass "Created hello.zip with Dockerfile"

info "Installing app with Dockerfile..."
INSTALL_RESPONSE=$(curl -s -X POST "$API_URL/apps" -F "file=@hello.zip")
echo "Response: $INSTALL_RESPONSE"

if echo "$INSTALL_RESPONSE" | grep -q '"error"'; then
  fail "Install with Dockerfile failed: $INSTALL_RESPONSE"
fi
pass "App with Dockerfile installed successfully"

info "Starting app..."
START_RESPONSE=$(curl -s -X POST "$API_URL/apps/hello/start")

if echo "$START_RESPONSE" | grep -q '"status":"running"'; then
  pass "App started successfully"
else
  fail "App failed to start: $START_RESPONSE"
fi

info "Waiting for app to be ready..."
APP_RESPONSE=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  APP_RESPONSE=$(curl -s "$APP_URL/hello/" 2>/dev/null || echo "")
  if echo "$APP_RESPONSE" | grep -q '"message":"Hello from AgentaOS app!"'; then
    break
  fi
  info "Retry $i..."
done

if echo "$APP_RESPONSE" | grep -q '"message":"Hello from AgentaOS app!"'; then
  pass "App responded correctly"
else
  fail "App did not respond: $APP_RESPONSE"
fi

info "Stopping and uninstalling app..."
curl -s -X POST "$API_URL/apps/hello/stop" > /dev/null 2>&1 || true
curl -s -X DELETE "$API_URL/apps/hello" > /dev/null 2>&1 || true
pass "Cleanup complete"

echo ""
echo "=== Test 2: App WITHOUT Dockerfile should FAIL ==="

info "Creating zip WITHOUT Dockerfile..."
cd "$SAMPLE_APP_DIR"
zip -q hello-no-docker.zip app.json server.js
pass "Created hello-no-docker.zip (no Dockerfile)"

info "Installing app without Dockerfile (should fail)..."
INSTALL_RESPONSE=$(curl -s -X POST "$API_URL/apps" -F "file=@hello-no-docker.zip")
echo "Response: $INSTALL_RESPONSE"

if echo "$INSTALL_RESPONSE" | grep -q '"error"'; then
  if echo "$INSTALL_RESPONSE" | grep -qi 'dockerfile'; then
    pass "Install correctly rejected: missing Dockerfile error"
  else
    fail "Got error but not about Dockerfile: $INSTALL_RESPONSE"
  fi
else
  fail "Install should have failed but succeeded: $INSTALL_RESPONSE"
fi

echo ""
echo "=== Cleanup ==="

info "Removing test zip files..."
rm -f "$SAMPLE_APP_DIR/hello.zip" "$SAMPLE_APP_DIR/hello-no-docker.zip"
pass "Cleanup complete"

echo ""
echo "==========================================="
echo -e "${GREEN}Stage 2 Test: ALL TESTS PASSED${NC}"
echo "==========================================="
echo ""
echo "Dockerfile is now REQUIRED for all apps."
echo "You can proceed to Stage 3 (optional: early validation in App Manager)."
