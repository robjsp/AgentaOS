/**
 * AgentaOS Init Microkernel
 * 
 * SECURITY CRITICAL - This is the only code running directly on the host.
 * Keep this file minimal, auditable, and free of complex dependencies.
 * 
 * Responsibilities:
 * - Start/stop/manage Podman containers
 * - Enforce container security policies
 * - Expose socket for App Manager communication
 * 
 * Non-responsibilities (these run in containers):
 * - HTTP handling
 * - Authentication
 * - Business logic
 * - File serving
 */

import { createServer, Server, Socket } from 'net';
import { spawn, SpawnOptions } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import * as pty from 'node-pty';
import {
  InitRequest,
  InitResponse,
  ContainerStatus,
  isValidAppId,
  isValidOperation,
  isValidTailParam,
  INIT_SOCKET_PATH,
  CONTAINER_NAME_PREFIX,
  ImageBuildResponse,
  ContainerExecResponse,
  TerminalMessage,
  TerminalDataMessage,
  TerminalInputMessage,
  TerminalResizeMessage,
} from '../../shared/protocol';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  socketPath: process.env.INIT_SOCKET_PATH || INIT_SOCKET_PATH,
  appsDir: process.env.APPS_DIR || '/data/apps',
  systemAppsDir: process.env.SYSTEM_APPS_DIR || '/agentaos/system',
  internalNetwork: 'agentaos-internal',
  logLevel: process.env.LOG_LEVEL || 'info',
};

// ============================================================
// SECURITY: Container options enforced by Init
// These CANNOT be overridden by App Manager requests
// ============================================================

const MANDATORY_SECURITY_FLAGS = [
  '--cap-drop=ALL',                     // Drop all capabilities
  '--security-opt=no-new-privileges',   // Cannot escalate privileges
  '--read-only',                        // Read-only root filesystem
];

const USER_APP_SECURITY_FLAGS = [
  ...MANDATORY_SECURITY_FLAGS,
  '--memory=512m',                      // Memory limit
  '--cpus=1',                           // CPU limit
  '--pids-limit=100',                   // Process limit
];

const SYSTEM_APP_SECURITY_FLAGS = [
  ...MANDATORY_SECURITY_FLAGS,
  '--memory=1g',                        // Higher memory for system apps
  '--cpus=2',                           // More CPU for system apps
];

// ============================================================
// LOGGING (minimal, no dependencies)
// ============================================================

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configLevel = levels[CONFIG.logLevel as keyof typeof levels] ?? 1;
  
  if (levels[level] >= configLevel) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [INIT] [${level.toUpperCase()}]`;
    console.log(prefix, message, ...args);
  }
}

// ============================================================
// PODMAN EXECUTION (no shell, parameterized)
// ============================================================

function execPodman(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('podman', args, {
      shell: false,  // SECURITY: Never use shell
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 1 });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, code: 1 });
    });
  });
}

// ============================================================
// CONTAINER MANAGEMENT
// ============================================================

function getContainerName(appId: string): string {
  // SECURITY: appId already validated, safe to use
  return `${CONTAINER_NAME_PREFIX}-${appId}`;
}

async function ensureNetwork(): Promise<boolean> {
  const { code } = await execPodman(['network', 'exists', CONFIG.internalNetwork]);
  if (code !== 0) {
    log('info', `Creating network: ${CONFIG.internalNetwork}`);
    const result = await execPodman(['network', 'create', CONFIG.internalNetwork]);
    return result.code === 0;
  }
  return true;
}

async function getContainerStatus(appId: string): Promise<ContainerStatus> {
  const containerName = getContainerName(appId);
  const { stdout, code } = await execPodman([
    'inspect',
    '--format', '{{.State.Status}}',
    containerName,
  ]);

  if (code !== 0) {
    return 'not_found';
  }

  const status = stdout.toLowerCase();
  if (status === 'running') return 'running';
  if (status === 'exited' || status === 'stopped') return 'stopped';
  if (status === 'created' || status === 'starting') return 'starting';
  return 'error';
}

interface PortMappingParam {
  containerPort: number;
  hostPort: number;
  protocol: 'tcp' | 'udp';
  enabled: boolean;
}

async function startContainer(
  appId: string, 
  appType: 'user' | 'system',
  portMappings?: PortMappingParam[]
): Promise<InitResponse> {
  const containerName = getContainerName(appId);
  
  // Check if already running
  const currentStatus = await getContainerStatus(appId);
  if (currentStatus === 'running') {
    return { id: '', success: true, containerId: containerName };
  }

  // If stopped, remove old container first
  if (currentStatus === 'stopped' || currentStatus === 'error') {
    await execPodman(['rm', '-f', containerName]);
  }

  // Determine app directory and image
  const appDir = appType === 'system'
    ? `${CONFIG.systemAppsDir}/${appId}`
    : `${CONFIG.appsDir}/${appId}`;

  if (!existsSync(appDir)) {
    return { id: '', success: false, error: 'App directory not found' };
  }

  // Read app manifest for configuration
  const manifestPath = `${appDir}/app.json`;
  if (!existsSync(manifestPath)) {
    return { id: '', success: false, error: 'App manifest not found' };
  }

  let manifest: { runtime?: { port?: number; command?: string[] }; route?: string };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { id: '', success: false, error: 'Invalid app manifest' };
  }

  // Build container arguments
  const securityFlags = appType === 'system' ? SYSTEM_APP_SECURITY_FLAGS : USER_APP_SECURITY_FLAGS;
  const imageName = `${CONTAINER_NAME_PREFIX}-${appId}:latest`;
  
  // Check if app has a data directory
  const dataDir = `${appDir}/data`;
  const hasDataDir = existsSync(dataDir);
  
  const args = [
    'run', '-d',
    '--name', containerName,
    ...securityFlags,
    `--network=${CONFIG.internalNetwork}`,
    // Writable temp directory (since rootfs is read-only)
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    // Environment
    '-e', `APP_ID=${appId}`,
    '-e', `PORT=${manifest.runtime?.port || 3000}`,
  ];

  // Add port mappings if provided
  if (portMappings && portMappings.length > 0) {
    for (const mapping of portMappings) {
      if (mapping.enabled) {
        // Format: -p hostPort:containerPort/protocol
        args.push('-p', `${mapping.hostPort}:${mapping.containerPort}/${mapping.protocol}`);
        log('info', `Mapping port ${mapping.hostPort}:${mapping.containerPort}/${mapping.protocol}`);
      }
    }
  }

  // Add app data storage - either a real mount or tmpfs
  if (hasDataDir) {
    args.push('-v', `${dataDir}:/app/data:rw`);
  } else {
    args.push('--tmpfs', '/app/data:rw,noexec,nosuid,size=256m');
  }

  // Special handling for App Manager - mount Init socket
  if (appId === 'app-manager') {
    args.push('-v', `${CONFIG.socketPath}:/run/agentaos/init.sock:rw`);
  }

  args.push(imageName);

  log('info', `Starting container: ${containerName}`);
  const result = await execPodman(args);

  if (result.code !== 0) {
    log('error', `Failed to start container: ${result.stderr}`);
    return { id: '', success: false, error: result.stderr };
  }

  return { id: '', success: true, containerId: result.stdout };
}

async function stopContainer(appId: string): Promise<InitResponse> {
  const containerName = getContainerName(appId);
  
  log('info', `Stopping container: ${containerName}`);
  const result = await execPodman(['stop', '-t', '10', containerName]);

  if (result.code !== 0 && !result.stderr.includes('no such container')) {
    return { id: '', success: false, error: result.stderr };
  }

  // Remove the container
  await execPodman(['rm', '-f', containerName]);

  return { id: '', success: true };
}

async function getContainerLogs(appId: string, tail: number = 100): Promise<InitResponse> {
  const containerName = getContainerName(appId);
  
  const result = await execPodman(['logs', '--tail', String(tail), containerName]);
  
  if (result.code !== 0) {
    return { id: '', success: false, error: result.stderr };
  }

  const logs = (result.stdout + '\n' + result.stderr)
    .split('\n')
    .filter(line => line.length > 0);

  return { id: '', success: true, logs };
}

async function listContainers(): Promise<InitResponse> {
  const result = await execPodman([
    'ps', '-a',
    '--filter', `name=${CONTAINER_NAME_PREFIX}-`,
    '--format', '{{.Names}}|{{.Status}}',
  ]);

  if (result.code !== 0) {
    return { id: '', success: false, error: result.stderr };
  }

  const containers = result.stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const [name, status] = line.split('|');
      const appId = name?.replace(`${CONTAINER_NAME_PREFIX}-`, '') || '';
      const isRunning = status?.toLowerCase().includes('up');
      
      return {
        appId,
        containerId: name || '',
        status: (isRunning ? 'running' : 'stopped') as ContainerStatus,
        appType: 'user' as const,  // TODO: Track app type
      };
    });

  return { id: '', success: true, containers };
}

// ============================================================
// IMAGE MANAGEMENT
// ============================================================

function generateDefaultDockerfile(manifest: {
  runtime?: { image?: string; command?: string[]; port?: number };
}): string {
  const baseImage = manifest.runtime?.image || 'node:20-slim';
  const command = manifest.runtime?.command || ['node', 'index.js'];
  const port = manifest.runtime?.port || 3000;

  return `# Auto-generated Dockerfile for AgentaOS app
FROM ${baseImage}

WORKDIR /app

# Copy app files
COPY . .

# Install dependencies if package.json exists
RUN if [ -f package.json ]; then npm install --omit=dev; fi

# Expose the app port
EXPOSE ${port}

# Run the app
CMD ${JSON.stringify(command)}
`;
}

async function buildImage(appId: string, appType: 'user' | 'system'): Promise<ImageBuildResponse> {
  const appDir = appType === 'system'
    ? `${CONFIG.systemAppsDir}/${appId}`
    : `${CONFIG.appsDir}/${appId}`;

  if (!existsSync(appDir)) {
    return { id: '', success: false, error: 'App directory not found' };
  }

  // Read app manifest
  const manifestPath = `${appDir}/app.json`;
  if (!existsSync(manifestPath)) {
    return { id: '', success: false, error: 'App manifest not found' };
  }

  let manifest: { runtime?: { image?: string; command?: string[]; port?: number } };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return { id: '', success: false, error: 'Invalid app manifest' };
  }

  // Check if Dockerfile exists, generate default if not
  const dockerfilePath = `${appDir}/Dockerfile`;
  let generatedDockerfile = false;
  
  if (!existsSync(dockerfilePath)) {
    log('info', `No Dockerfile found for ${appId}, generating default`);
    const dockerfile = generateDefaultDockerfile(manifest);
    writeFileSync(dockerfilePath, dockerfile);
    generatedDockerfile = true;
  }

  const imageName = `${CONTAINER_NAME_PREFIX}-${appId}:latest`;

  log('info', `Building image: ${imageName}`);
  const result = await execPodman([
    'build',
    '-t', imageName,
    '-f', dockerfilePath,
    appDir,
  ]);

  // Clean up generated Dockerfile
  if (generatedDockerfile) {
    try {
      unlinkSync(dockerfilePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  if (result.code !== 0) {
    log('error', `Failed to build image: ${result.stderr}`);
    return { id: '', success: false, error: result.stderr };
  }

  log('info', `Successfully built image: ${imageName}`);
  return { id: '', success: true, imageName, imageId: result.stdout.trim() };
}

async function removeImage(appId: string): Promise<InitResponse> {
  const imageName = `${CONTAINER_NAME_PREFIX}-${appId}:latest`;

  log('info', `Removing image: ${imageName}`);
  const result = await execPodman(['rmi', '-f', imageName]);

  if (result.code !== 0 && !result.stderr.includes('no such image')) {
    return { id: '', success: false, error: result.stderr };
  }

  return { id: '', success: true };
}

// ============================================================
// TERMINAL SESSION MANAGEMENT
// ============================================================

interface TerminalSession {
  pty: pty.IPty;
  socket: Socket;
  appId: string;
}

// Active terminal sessions keyed by sessionId
const terminalSessions = new Map<string, TerminalSession>();

// Map sockets to their session IDs for cleanup
const socketSessions = new Map<Socket, Set<string>>();

function startExecSession(
  appId: string,
  socket: Socket,
  cols: number = 80,
  rows: number = 24
): ContainerExecResponse {
  const containerName = getContainerName(appId);
  const sessionId = randomUUID();

  log('info', `Starting exec session ${sessionId} for container ${containerName}`);
  log('info', `PTY size: ${cols}x${rows}`);

  try {
    // Spawn podman exec with PTY using script to force TTY allocation
    // Linux script syntax: script -q -c "command" /dev/null
    const cmd = `podman exec -it ${containerName} /bin/sh`;
    log('info', `Spawning: script -q -c "${cmd}" /dev/null`);
    const ptyProcess = pty.spawn('script', ['-q', '-c', cmd, '/dev/null'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: '/',
      env: process.env as { [key: string]: string },
    });
    log('info', `PTY spawned with pid: ${ptyProcess.pid}`);

    const session: TerminalSession = {
      pty: ptyProcess,
      socket,
      appId,
    };

    terminalSessions.set(sessionId, session);

    // Track session for this socket
    if (!socketSessions.has(socket)) {
      socketSessions.set(socket, new Set());
    }
    socketSessions.get(socket)!.add(sessionId);

    // Handle PTY output - send to socket
    ptyProcess.onData((data: string) => {
      log('info', `PTY data (${data.length} chars): ${data.substring(0, 50).replace(/\n/g, '\\n')}`);
      const message: TerminalDataMessage = {
        type: 'terminal:data',
        sessionId,
        data: Buffer.from(data).toString('base64'),
      };
      try {
        socket.write(JSON.stringify(message) + '\n');
      } catch (err) {
        log('error', `Failed to write terminal data: ${err}`);
      }
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      log('info', `Exec session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      const exitMessage = {
        type: 'terminal:exit',
        sessionId,
        exitCode,
      };
      try {
        socket.write(JSON.stringify(exitMessage) + '\n');
      } catch {
        // Socket may already be closed
      }
      cleanupSession(sessionId);
    });

    return { id: '', success: true, sessionId };
  } catch (err) {
    log('error', `Failed to start exec session: ${err}`);
    return { id: '', success: false, error: `Failed to start exec: ${err}` };
  }
}

function handleTerminalInput(message: TerminalInputMessage): void {
  const session = terminalSessions.get(message.sessionId);
  if (!session) {
    log('warn', `Terminal input for unknown session: ${message.sessionId}`);
    return;
  }

  try {
    const data = Buffer.from(message.data, 'base64').toString();
    session.pty.write(data);
  } catch (err) {
    log('error', `Failed to write to PTY: ${err}`);
  }
}

function handleTerminalResize(message: TerminalResizeMessage): void {
  const session = terminalSessions.get(message.sessionId);
  if (!session) {
    log('warn', `Terminal resize for unknown session: ${message.sessionId}`);
    return;
  }

  try {
    session.pty.resize(message.cols, message.rows);
  } catch (err) {
    log('error', `Failed to resize PTY: ${err}`);
  }
}

function cleanupSession(sessionId: string): void {
  const session = terminalSessions.get(sessionId);
  if (session) {
    try {
      session.pty.kill();
    } catch {
      // Already dead
    }
    terminalSessions.delete(sessionId);
    
    // Remove from socket tracking
    const socketSessionSet = socketSessions.get(session.socket);
    if (socketSessionSet) {
      socketSessionSet.delete(sessionId);
    }
  }
}

function cleanupSocketSessions(socket: Socket): void {
  const sessionIds = socketSessions.get(socket);
  if (sessionIds) {
    for (const sessionId of sessionIds) {
      log('info', `Cleaning up session ${sessionId} due to socket disconnect`);
      cleanupSession(sessionId);
    }
    socketSessions.delete(socket);
  }
}

// ============================================================
// REQUEST HANDLING
// ============================================================

async function handleRequest(request: InitRequest, socket: Socket): Promise<InitResponse> {
  const { id, op } = request;

  // SECURITY: Validate operation
  if (!isValidOperation(op)) {
    log('warn', `Invalid operation rejected: ${op}`);
    return { id, success: false, error: 'Invalid operation' };
  }

  // Handle system health (no appId needed)
  if (op === 'system:health') {
    const podmanResult = await execPodman(['--version']);
    return {
      id,
      success: true,
      initUptime: process.uptime(),
      podmanAvailable: podmanResult.code === 0,
    };
  }

  // Handle container list (no appId needed)
  if (op === 'container:list') {
    const result = await listContainers();
    return { ...result, id };
  }

  // All other operations require appId
  if (!('appId' in request)) {
    return { id, success: false, error: 'Missing appId' };
  }

  const { appId } = request;

  // SECURITY: Validate appId strictly
  if (!isValidAppId(appId)) {
    log('warn', `Invalid appId rejected: ${appId}`);
    return { id, success: false, error: 'Invalid app ID' };
  }

  switch (op) {
    case 'container:start': {
      const appType = ('appType' in request && request.appType === 'system') ? 'system' : 'user';
      // Extract port mappings if provided
      const portMappings = ('portMappings' in request && Array.isArray(request.portMappings))
        ? request.portMappings as PortMappingParam[]
        : undefined;
      const result = await startContainer(appId, appType, portMappings);
      return { ...result, id };
    }

    case 'container:stop': {
      const result = await stopContainer(appId);
      return { ...result, id };
    }

    case 'container:restart': {
      await stopContainer(appId);
      const appType = ('appType' in request && request.appType === 'system') ? 'system' : 'user';
      // Extract port mappings if provided
      const portMappings = ('portMappings' in request && Array.isArray(request.portMappings))
        ? request.portMappings as PortMappingParam[]
        : undefined;
      const result = await startContainer(appId, appType, portMappings);
      return { ...result, id };
    }

    case 'container:status': {
      const status = await getContainerStatus(appId);
      return { id, success: true, status, containerId: getContainerName(appId) };
    }

    case 'container:logs': {
      const tail = ('tail' in request && isValidTailParam(request.tail)) ? request.tail : 100;
      const result = await getContainerLogs(appId, tail);
      return { ...result, id };
    }

    case 'image:build': {
      const appType = ('appType' in request && request.appType === 'system') ? 'system' : 'user';
      const result = await buildImage(appId, appType);
      return { ...result, id };
    }

    case 'image:remove': {
      const result = await removeImage(appId);
      return { ...result, id };
    }

    case 'container:exec': {
      // Check if container is running first
      const status = await getContainerStatus(appId);
      if (status !== 'running') {
        return { id, success: false, error: 'Container is not running' };
      }
      const cols = ('cols' in request && typeof request.cols === 'number') ? request.cols : 80;
      const rows = ('rows' in request && typeof request.rows === 'number') ? request.rows : 24;
      const result = startExecSession(appId, socket, cols, rows);
      return { ...result, id };
    }

    default:
      return { id, success: false, error: 'Unknown operation' };
  }
}

// ============================================================
// SOCKET SERVER
// ============================================================

function handleConnection(socket: Socket): void {
  const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
  log('debug', `Client connected: ${clientId}`);

  let buffer = '';

  socket.on('data', async (data: Buffer) => {
    buffer += data.toString();

    // Handle newline-delimited JSON
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';  // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);
        
        // Check if it's a terminal message (has 'type' field) or init request (has 'op' field)
        if ('type' in parsed) {
          // Handle terminal messages
          const terminalMessage = parsed as TerminalMessage;
          switch (terminalMessage.type) {
            case 'terminal:input':
              handleTerminalInput(terminalMessage as TerminalInputMessage);
              break;
            case 'terminal:resize':
              handleTerminalResize(terminalMessage as TerminalResizeMessage);
              break;
            default:
              log('warn', `Unknown terminal message type: ${terminalMessage.type}`);
          }
        } else if ('op' in parsed) {
          // Handle init requests
          const request = parsed as InitRequest;
          log('debug', `Request: ${request.op} ${('appId' in request) ? request.appId : ''}`);
          
          const response = await handleRequest(request, socket);
          socket.write(JSON.stringify(response) + '\n');
        } else {
          log('warn', 'Unknown message format');
        }
      } catch (err) {
        log('warn', `Invalid request: ${err}`);
        socket.write(JSON.stringify({
          id: '',
          success: false,
          error: 'Invalid request format',
        }) + '\n');
      }
    }
  });

  socket.on('close', () => {
    log('debug', `Client disconnected: ${clientId}`);
    cleanupSocketSessions(socket);
  });

  socket.on('error', (err) => {
    log('error', `Socket error: ${err.message}`);
    cleanupSocketSessions(socket);
  });
}

async function startServer(): Promise<Server> {
  // Ensure socket directory exists
  const socketDir = dirname(CONFIG.socketPath);
  if (!existsSync(socketDir)) {
    mkdirSync(socketDir, { recursive: true });
  }

  // Remove existing socket file
  if (existsSync(CONFIG.socketPath)) {
    unlinkSync(CONFIG.socketPath);
  }

  // Ensure Podman network exists
  await ensureNetwork();

  const server = createServer(handleConnection);

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(CONFIG.socketPath, () => {
      log('info', `Init socket listening on ${CONFIG.socketPath}`);
      resolve(server);
    });
  });
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  log('info', 'AgentaOS Init starting...');
  log('info', `Apps directory: ${CONFIG.appsDir}`);
  log('info', `System apps directory: ${CONFIG.systemAppsDir}`);

  // Check Podman availability
  const podmanCheck = await execPodman(['--version']);
  if (podmanCheck.code !== 0) {
    log('error', 'Podman not available');
    process.exit(1);
  }
  log('info', `Podman: ${podmanCheck.stdout}`);

  // Start socket server
  const server = await startServer();

  // Graceful shutdown
  const shutdown = () => {
    log('info', 'Shutting down...');
    
    // Cleanup all terminal sessions
    for (const sessionId of terminalSessions.keys()) {
      cleanupSession(sessionId);
    }
    
    server.close(() => {
      if (existsSync(CONFIG.socketPath)) {
        unlinkSync(CONFIG.socketPath);
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('info', 'AgentaOS Init ready');
}

main().catch((err) => {
  log('error', 'Fatal error:', err);
  process.exit(1);
});
