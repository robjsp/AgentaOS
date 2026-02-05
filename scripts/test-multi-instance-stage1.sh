#!/bin/bash
# Test Stage 1: Multi-Instance Database Schema
# Run this inside the Vagrant VM after rebuilding core and restarting AgentaOS

set -e

DB_PATH="/data/system/agentaos.db"

echo "=== Stage 1 Test: Multi-Instance Database Schema ==="
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

# Helper function to run SQL queries via the API container
run_sql() {
  podman exec agentaos-api node -e "
    const Database = require('better-sqlite3');
    const db = new Database('$DB_PATH');
    const result = db.prepare(\`$1\`).all();
    console.log(JSON.stringify(result));
  " 2>/dev/null
}

run_sql_exec() {
  podman exec agentaos-api node -e "
    const Database = require('better-sqlite3');
    const db = new Database('$DB_PATH');
    db.exec(\`$1\`);
    console.log('OK');
  " 2>/dev/null
}

# Check database exists
info "Checking database exists..."
if [ ! -f "$DB_PATH" ]; then
  fail "Database not found at $DB_PATH"
fi
pass "Database exists"

echo ""
echo "=== Test 1: app_instances table exists ==="

info "Checking app_instances table..."
TABLES=$(run_sql "SELECT name FROM sqlite_master WHERE type='table' AND name='app_instances'")

if echo "$TABLES" | grep -q "app_instances"; then
  pass "app_instances table exists"
else
  fail "app_instances table does not exist"
fi

info "Verifying table structure..."
COLUMNS=$(run_sql "PRAGMA table_info(app_instances)")

if echo "$COLUMNS" | grep -q '"name":"id"'; then
  pass "Has id column"
else
  fail "Missing id column"
fi

if echo "$COLUMNS" | grep -q '"name":"app_id"'; then
  pass "Has app_id column"
else
  fail "Missing app_id column"
fi

if echo "$COLUMNS" | grep -q '"name":"instance_number"'; then
  pass "Has instance_number column"
else
  fail "Missing instance_number column"
fi

if echo "$COLUMNS" | grep -q '"name":"status"'; then
  pass "Has status column"
else
  fail "Missing status column"
fi

if echo "$COLUMNS" | grep -q '"name":"container_id"'; then
  pass "Has container_id column"
else
  fail "Missing container_id column"
fi

echo ""
echo "=== Test 2: port_allocations has instance_id column ==="

info "Checking instance_id column in port_allocations..."
COLUMNS=$(run_sql "PRAGMA table_info(port_allocations)")

if echo "$COLUMNS" | grep -q '"name":"instance_id"'; then
  pass "port_allocations has instance_id column"
else
  fail "port_allocations missing instance_id column"
fi

echo ""
echo "=== Test 3: Indexes exist ==="

info "Checking indexes..."
INDEXES=$(run_sql "SELECT name FROM sqlite_master WHERE type='index'")

if echo "$INDEXES" | grep -q "idx_app_instances_app_id"; then
  pass "Index idx_app_instances_app_id exists"
else
  fail "Missing index idx_app_instances_app_id"
fi

if echo "$INDEXES" | grep -q "idx_port_allocations_instance_id"; then
  pass "Index idx_port_allocations_instance_id exists"
else
  fail "Missing index idx_port_allocations_instance_id"
fi

echo ""
echo "=== Test 4: Can insert and query instances ==="

info "Inserting test data..."
run_sql_exec "INSERT OR IGNORE INTO apps (id, name, version) VALUES ('test-app', 'Test App', '1.0.0')"
run_sql_exec "INSERT OR REPLACE INTO app_instances (id, app_id, instance_number, status) VALUES ('test-app-1', 'test-app', 1, 'stopped')"
pass "Inserted test instance"

info "Querying test instance..."
RESULT=$(run_sql "SELECT id, app_id, instance_number, status FROM app_instances WHERE id = 'test-app-1'")
if echo "$RESULT" | grep -q "test-app-1"; then
  pass "Query returned instance data"
else
  fail "Query returned no results: $RESULT"
fi

info "Cleaning up test data..."
run_sql_exec "DELETE FROM app_instances WHERE app_id = 'test-app'"
run_sql_exec "DELETE FROM apps WHERE id = 'test-app'"
pass "Cleanup complete"

echo ""
echo "==========================================="
echo -e "${GREEN}Stage 1 Test: ALL TESTS PASSED${NC}"
echo "==========================================="
echo ""
echo "Database schema for multi-instance support is ready."
echo "You can proceed to Stage 2."
