#!/usr/bin/env node
/**
 * Test Stage 3: App Manager Instance CRUD Operations
 * 
 * This script tests the instance management methods directly via the database
 * since Stage 4 (API routes) isn't implemented yet.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/data/system/agentaos.db';

// Test helper
function test(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    return true;
  } catch (err) {
    console.log(`✗ FAIL: ${name}`);
    console.log(`  Error: ${err.message}`);
    return false;
  }
}

async function runTests() {
  console.log('=== Stage 3 Tests: App Manager Instance CRUD ===\n');
  console.log(`Database: ${DB_PATH}\n`);

  const db = new Database(DB_PATH);
  let passed = 0;
  let failed = 0;

  // Check if app_instances table exists
  test('app_instances table exists', () => {
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_instances'"
    ).get();
    if (!table) throw new Error('Table not found');
  }) ? passed++ : failed++;

  // Check table schema
  test('app_instances has correct columns', () => {
    const columns = db.prepare("PRAGMA table_info(app_instances)").all();
    const colNames = columns.map(c => c.name);
    const required = ['id', 'app_id', 'instance_number', 'status', 'container_id', 'created_at', 'updated_at'];
    for (const col of required) {
      if (!colNames.includes(col)) {
        throw new Error(`Missing column: ${col}`);
      }
    }
  }) ? passed++ : failed++;

  // Clean up any existing test data
  db.prepare("DELETE FROM app_instances WHERE app_id = 'test-app'").run();
  db.prepare("DELETE FROM apps WHERE id = 'test-app'").run();

  // Create a temporary test app (required for foreign key constraint)
  test('Setup: Create test app', () => {
    db.prepare(`
      INSERT INTO apps (id, name, version, status)
      VALUES ('test-app', 'Test App', '1.0.0', 'stopped')
    `).run();
    const app = db.prepare("SELECT * FROM apps WHERE id = 'test-app'").get();
    if (!app) throw new Error('Failed to create test app');
    console.log(`  Created test app: ${app.id}`);
  }) ? passed++ : failed++;

  // Test: Create instance (simulating AppManager.createInstance)
  test('Create instance - first instance gets number 1', () => {
    const appId = 'test-app';
    const maxResult = db
      .prepare("SELECT MAX(instance_number) as max_num FROM app_instances WHERE app_id = ?")
      .get(appId);
    const nextNumber = (maxResult.max_num || 0) + 1;
    const instanceId = `${appId}-${nextNumber}`;
    
    db.prepare(`
      INSERT INTO app_instances (id, app_id, instance_number, status)
      VALUES (?, ?, ?, 'stopped')
    `).run(instanceId, appId, nextNumber);
    
    const instance = db.prepare("SELECT * FROM app_instances WHERE id = ?").get(instanceId);
    if (!instance) throw new Error('Instance not created');
    if (instance.instance_number !== 1) throw new Error(`Expected instance_number=1, got ${instance.instance_number}`);
    if (instance.status !== 'stopped') throw new Error(`Expected status=stopped, got ${instance.status}`);
    console.log(`  Created: ${instanceId}`);
  }) ? passed++ : failed++;

  // Test: Create second instance
  test('Create instance - second instance gets number 2', () => {
    const appId = 'test-app';
    const maxResult = db
      .prepare("SELECT MAX(instance_number) as max_num FROM app_instances WHERE app_id = ?")
      .get(appId);
    const nextNumber = (maxResult.max_num || 0) + 1;
    const instanceId = `${appId}-${nextNumber}`;
    
    db.prepare(`
      INSERT INTO app_instances (id, app_id, instance_number, status)
      VALUES (?, ?, ?, 'stopped')
    `).run(instanceId, appId, nextNumber);
    
    const instance = db.prepare("SELECT * FROM app_instances WHERE id = ?").get(instanceId);
    if (instance.instance_number !== 2) throw new Error(`Expected instance_number=2, got ${instance.instance_number}`);
    console.log(`  Created: ${instanceId}`);
  }) ? passed++ : failed++;

  // Test: List instances
  test('List instances - returns all instances for app', () => {
    const instances = db
      .prepare("SELECT * FROM app_instances WHERE app_id = ? ORDER BY instance_number")
      .all('test-app');
    if (instances.length !== 2) throw new Error(`Expected 2 instances, got ${instances.length}`);
    console.log(`  Found ${instances.length} instances: ${instances.map(i => i.id).join(', ')}`);
  }) ? passed++ : failed++;

  // Test: Get specific instance
  test('Get instance - returns correct instance', () => {
    const instance = db
      .prepare("SELECT * FROM app_instances WHERE app_id = ? AND id = ?")
      .get('test-app', 'test-app-1');
    if (!instance) throw new Error('Instance not found');
    if (instance.id !== 'test-app-1') throw new Error(`Wrong instance returned: ${instance.id}`);
  }) ? passed++ : failed++;

  // Test: Update instance status (simulating start)
  test('Start instance - updates status to running', () => {
    db.prepare(
      "UPDATE app_instances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run('running', 'test-app-1');
    
    const instance = db.prepare("SELECT * FROM app_instances WHERE id = ?").get('test-app-1');
    if (instance.status !== 'running') throw new Error(`Expected status=running, got ${instance.status}`);
  }) ? passed++ : failed++;

  // Test: Update instance status (simulating stop)
  test('Stop instance - updates status to stopped', () => {
    db.prepare(
      "UPDATE app_instances SET status = ?, container_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run('stopped', 'test-app-1');
    
    const instance = db.prepare("SELECT * FROM app_instances WHERE id = ?").get('test-app-1');
    if (instance.status !== 'stopped') throw new Error(`Expected status=stopped, got ${instance.status}`);
  }) ? passed++ : failed++;

  // Test: Delete instance
  test('Delete instance - removes from database', () => {
    db.prepare("DELETE FROM app_instances WHERE id = ?").run('test-app-2');
    const instance = db.prepare("SELECT * FROM app_instances WHERE id = ?").get('test-app-2');
    if (instance) throw new Error('Instance was not deleted');
  }) ? passed++ : failed++;

  // Test: Unique constraint on (app_id, instance_number)
  test('Unique constraint - prevents duplicate instance numbers', () => {
    try {
      db.prepare(`
        INSERT INTO app_instances (id, app_id, instance_number, status)
        VALUES (?, ?, ?, 'stopped')
      `).run('test-app-1-dup', 'test-app', 1);
      throw new Error('Should have thrown unique constraint error');
    } catch (err) {
      if (!err.message.includes('UNIQUE constraint')) {
        throw err;
      }
      // Expected error
    }
  }) ? passed++ : failed++;

  // Cleanup
  db.prepare("DELETE FROM app_instances WHERE app_id = 'test-app'").run();
  db.prepare("DELETE FROM apps WHERE id = 'test-app'").run();
  db.close();

  console.log('\n=== Stage 3 Tests Complete ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
