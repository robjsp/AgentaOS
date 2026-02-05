#!/bin/bash
# Test Stage 3 & 4: Early validation in App Manager + Simplified manifest
# Run this inside the Vagrant VM after rebuilding core and restarting AgentaOS

set -e

API_URL="http://localhost:8080/api"
APP_URL="http://localhost:8080/apps"
SAMPLE_APP_DIR="/vagrant/sample-apps/hello"

echo "=== Stage 3 & 4 Test: Early Validation + Simplified Manifest ==="
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
echo "=== Test 1: Simplified manifest (no runtime.image/command) works ==="

info "Checking app.json has simplified format..."
if grep -q '"image"' "$SAMPLE_APP_DIR/app.json"; then
  fail "app.json still contains 'image' field - should be removed"
fi
if grep -q '"command"' "$SAMPLE_APP_DIR/app.json"; then
  fail "app.json still contains 'command' field - should be removed"
fi
pass "app.json has simplified format (no image/command)"

info "Cleaning up existing hello app..."
curl -s -X POST "$API_URL/apps/hello/stop" > /dev/null 2>&1 || true
curl -s -X DELETE "$API_URL/apps/hello" > /dev/null 2>&1 || true

info "Creating zip with simplified manifest..."
cd "$SAMPLE_APP_DIR"
rm -f hello.zip hello-no-docker.zip
zip -q hello.zip Dockerfile app.json server.js
pass "Created hello.zip"

info "Installing app with simplified manifest..."
INSTALL_RESPONSE=$(curl -s -X POST "$API_URL/apps" -F "file=@hello.zip")
echo "Response: $INSTALL_RESPONSE"

if echo "$INSTALL_RESPONSE" | grep -q '"error"'; then
  fail "Install failed: $INSTALL_RESPONSE"
fi
pass "App installed with simplified manifest"

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
echo "=== Test 2: Early validation catches missing Dockerfile ==="

info "Creating zip WITHOUT Dockerfile..."
cd "$SAMPLE_APP_DIR"
zip -q hello-no-docker.zip app.json server.js
pass "Created hello-no-docker.zip (no Dockerfile)"

info "Installing app without Dockerfile (should fail early in App Manager)..."
INSTALL_RESPONSE=$(curl -s -X POST "$API_URL/apps" -F "file=@hello-no-docker.zip")
echo "Response: $INSTALL_RESPONSE"

# Check that error mentions Dockerfile
if echo "$INSTALL_RESPONSE" | grep -q '"error"'; then
  if echo "$INSTALL_RESPONSE" | grep -qi 'dockerfile'; then
    pass "Install rejected with Dockerfile error"
  else
    fail "Got error but not about Dockerfile: $INSTALL_RESPONSE"
  fi
else
  fail "Install should have failed but succeeded: $INSTALL_RESPONSE"
fi

# Verify the app was NOT installed (early validation should prevent this)
info "Verifying app was not installed..."
APP_CHECK=$(curl -s "$API_URL/apps/hello" 2>/dev/null || echo "not found")
if echo "$APP_CHECK" | grep -q '"error"'; then
  pass "App was not installed (early validation worked)"
elif echo "$APP_CHECK" | grep -q "not found"; then
  pass "App was not installed (early validation worked)"
else
  fail "App was partially installed despite validation failure"
fi

echo ""
echo "=== Cleanup ==="

info "Removing test zip files..."
rm -f "$SAMPLE_APP_DIR/hello.zip" "$SAMPLE_APP_DIR/hello-no-docker.zip"
pass "Cleanup complete"

echo ""
echo "==========================================="
echo -e "${GREEN}Stage 3 & 4 Test: ALL TESTS PASSED${NC}"
echo "==========================================="
echo ""
echo "- Stage 3: Early validation in App Manager ✓"
echo "- Stage 4: Simplified manifest (no image/command) ✓"
echo ""
echo "You can proceed to Stage 5 (update documentation)."
