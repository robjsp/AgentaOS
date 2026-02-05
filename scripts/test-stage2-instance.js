#!/usr/bin/env node
/**
 * Test Stage 2: Instance-aware container naming
 */

const net = require('net');
const SOCKET_PATH = process.env.INIT_SOCKET_PATH || '/run/agentaos/init.sock';

function sendRequest(request) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      client.write(JSON.stringify(request) + '\n');
    });

    let data = '';
    client.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\n')) {
        client.end();
        try {
          resolve(JSON.parse(data.trim()));
        } catch (e) {
          resolve({ raw: data });
        }
      }
    });

    client.on('error', reject);
    
    // Timeout after 5 seconds
    setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout'));
    }, 5000);
  });
}

async function runTests() {
  console.log('=== Stage 2 Tests: Instance-Aware Container Naming ===\n');

  // Test 1: Health check
  console.log('Test 1: System health check');
  try {
    const health = await sendRequest({ id: 'test-health', op: 'system:health' });
    console.log('Response:', JSON.stringify(health, null, 2));
    console.log(health.success ? '✓ PASS\n' : '✗ FAIL\n');
  } catch (e) {
    console.log('✗ FAIL:', e.message, '\n');
  }

  // Test 2: Container status WITHOUT instanceId (backward compatible)
  console.log('Test 2: Container status (no instanceId - backward compatible)');
  try {
    const status1 = await sendRequest({
      id: 'test-status-1',
      op: 'container:status',
      appId: 'hello'
    });
    console.log('Response:', JSON.stringify(status1, null, 2));
    // Should return container name: agentaos-hello
    const expectedName = 'agentaos-hello';
    const pass = status1.success && status1.containerId === expectedName;
    console.log(`Expected containerId: ${expectedName}`);
    console.log(pass ? '✓ PASS\n' : '✗ FAIL (containerId mismatch)\n');
  } catch (e) {
    console.log('✗ FAIL:', e.message, '\n');
  }

  // Test 3: Container status WITH instanceId (new Stage 2 feature)
  console.log('Test 3: Container status WITH instanceId (new Stage 2 feature)');
  try {
    const status2 = await sendRequest({
      id: 'test-status-2',
      op: 'container:status',
      appId: 'hello',
      instanceId: 'hello-1'
    });
    console.log('Response:', JSON.stringify(status2, null, 2));
    // Should return container name: agentaos-hello-1
    const expectedName = 'agentaos-hello-1';
    const pass = status2.success && status2.containerId === expectedName;
    console.log(`Expected containerId: ${expectedName}`);
    console.log(pass ? '✓ PASS\n' : '✗ FAIL (containerId mismatch)\n');
  } catch (e) {
    console.log('✗ FAIL:', e.message, '\n');
  }

  // Test 4: Invalid instanceId should be rejected
  console.log('Test 4: Invalid instanceId should be rejected');
  try {
    const status3 = await sendRequest({
      id: 'test-status-3',
      op: 'container:status',
      appId: 'hello',
      instanceId: 'invalid!!!'  // Invalid format
    });
    console.log('Response:', JSON.stringify(status3, null, 2));
    const pass = !status3.success && status3.error === 'Invalid instance ID';
    console.log(pass ? '✓ PASS\n' : '✗ FAIL (should have rejected invalid instanceId)\n');
  } catch (e) {
    console.log('✗ FAIL:', e.message, '\n');
  }

  // Test 5: Container status with instance 2
  console.log('Test 5: Container status with instanceId hello-2');
  try {
    const status4 = await sendRequest({
      id: 'test-status-4',
      op: 'container:status',
      appId: 'hello',
      instanceId: 'hello-2'
    });
    console.log('Response:', JSON.stringify(status4, null, 2));
    // Should return container name: agentaos-hello-2
    const expectedName = 'agentaos-hello-2';
    const pass = status4.success && status4.containerId === expectedName;
    console.log(`Expected containerId: ${expectedName}`);
    console.log(pass ? '✓ PASS\n' : '✗ FAIL (containerId mismatch)\n');
  } catch (e) {
    console.log('✗ FAIL:', e.message, '\n');
  }

  console.log('=== Stage 2 Tests Complete ===');
}

runTests().catch(console.error);
