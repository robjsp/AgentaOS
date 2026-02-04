/**
 * Init Socket Client
 * 
 * Client for communicating with the Init microkernel via Unix socket.
 * Used by the App Manager to start/stop/manage containers.
 */

import { createConnection, Socket } from 'net';
import { randomUUID } from 'crypto';
import {
  InitRequest,
  InitResponse,
  ContainerStartRequest,
  ContainerStopRequest,
  ContainerStatusRequest,
  ContainerLogsRequest,
  ContainerListResponse,
  ContainerStatusResponse,
  ContainerLogsResponse,
  ContainerExecResponse,
  SystemHealthResponse,
  ImageBuildRequest,
  ImageRemoveRequest,
  ImageBuildResponse,
  PortMapping,
  TerminalMessage,
  TerminalInputMessage,
  TerminalResizeMessage,
  TerminalDataMessage,
  TerminalExitMessage,
  TerminalErrorMessage,
  INIT_SOCKET_PATH,
} from '../../../shared/protocol';
import { logger } from './logger';

export interface TerminalSessionCallbacks {
  onData: (data: string) => void;  // Base64 encoded data
  onExit: (exitCode: number) => void;
  onError: (error: string) => void;
}

export class InitClient {
  private socketPath: string;
  private socket: Socket | null = null;
  private pendingRequests: Map<string, {
    resolve: (response: InitResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private terminalSessions: Map<string, TerminalSessionCallbacks> = new Map();
  private buffer = '';
  private connected = false;
  private reconnecting = false;

  constructor(socketPath: string = INIT_SOCKET_PATH) {
    this.socketPath = socketPath;
  }

  /**
   * Connect to the Init socket
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath);

      this.socket.on('connect', () => {
        this.connected = true;
        this.reconnecting = false;
        logger.info('Connected to Init socket');
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.socket = null;
        logger.warn('Disconnected from Init socket');
        this.scheduleReconnect();
      });

      this.socket.on('error', (err) => {
        if (!this.connected) {
          reject(err);
        } else {
          logger.error('Init socket error:', err.message);
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        logger.error('Failed to reconnect to Init:', err);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);

        // Check if it's a terminal message (has 'type' field starting with 'terminal:')
        if ('type' in parsed && typeof parsed.type === 'string' && parsed.type.startsWith('terminal:')) {
          this.handleTerminalMessage(parsed as TerminalMessage);
        } else {
          // Handle as init response
          const response = parsed as InitResponse;
          const pending = this.pendingRequests.get(response.id);

          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        }
      } catch (err) {
        logger.error('Failed to parse Init response:', err);
      }
    }
  }

  private handleTerminalMessage(message: TerminalMessage): void {
    const sessionId = message.sessionId;
    const callbacks = this.terminalSessions.get(sessionId);

    if (!callbacks) {
      logger.warn(`Received terminal message for unknown session: ${sessionId}`);
      return;
    }

    switch (message.type) {
      case 'terminal:data':
        callbacks.onData((message as TerminalDataMessage).data);
        break;
      case 'terminal:exit':
        callbacks.onExit((message as TerminalExitMessage).exitCode);
        this.terminalSessions.delete(sessionId);
        break;
      case 'terminal:error':
        callbacks.onError((message as TerminalErrorMessage).error);
        break;
    }
  }

  /**
   * Send a request to Init and wait for response
   */
  private async sendRequest<T extends InitResponse>(request: Omit<InitRequest, 'id'>): Promise<T> {
    if (!this.connected || !this.socket) {
      await this.connect();
    }

    const id = randomUUID();
    const fullRequest = { ...request, id } as InitRequest;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: resolve as (response: InitResponse) => void,
        reject,
        timeout,
      });

      this.socket!.write(JSON.stringify(fullRequest) + '\n');
    });
  }

  /**
   * Start a container
   */
  async startContainer(
    appId: string, 
    appType: 'user' | 'system' = 'user',
    portMappings?: PortMapping[]
  ): Promise<{ containerId?: string }> {
    const response = await this.sendRequest<InitResponse>({
      op: 'container:start',
      appId,
      appType,
      portMappings,
    } as Omit<ContainerStartRequest, 'id'>);

    if (!response.success) {
      throw new Error(response.error || 'Failed to start container');
    }

    return { containerId: (response as { containerId?: string }).containerId };
  }

  /**
   * Stop a container
   */
  async stopContainer(appId: string): Promise<void> {
    const response = await this.sendRequest<InitResponse>({
      op: 'container:stop',
      appId,
    } as Omit<ContainerStopRequest, 'id'>);

    if (!response.success) {
      throw new Error(response.error || 'Failed to stop container');
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(
    appId: string,
    portMappings?: PortMapping[]
  ): Promise<{ containerId?: string }> {
    const response = await this.sendRequest<InitResponse>({
      op: 'container:restart',
      appId,
      portMappings,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to restart container');
    }

    return { containerId: (response as { containerId?: string }).containerId };
  }

  /**
   * Get container status
   */
  async getContainerStatus(appId: string): Promise<ContainerStatusResponse> {
    const response = await this.sendRequest<ContainerStatusResponse>({
      op: 'container:status',
      appId,
    } as Omit<ContainerStatusRequest, 'id'>);

    if (!response.success) {
      throw new Error(response.error || 'Failed to get container status');
    }

    return response;
  }

  /**
   * Get container logs
   */
  async getContainerLogs(appId: string, tail: number = 100): Promise<string[]> {
    const response = await this.sendRequest<ContainerLogsResponse>({
      op: 'container:logs',
      appId,
      tail,
    } as Omit<ContainerLogsRequest, 'id'>);

    if (!response.success) {
      throw new Error(response.error || 'Failed to get container logs');
    }

    return response.logs || [];
  }

  /**
   * List all containers
   */
  async listContainers(): Promise<ContainerListResponse> {
    const response = await this.sendRequest<ContainerListResponse>({
      op: 'container:list',
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to list containers');
    }

    return response;
  }

  /**
   * Check system health
   */
  async checkHealth(): Promise<SystemHealthResponse> {
    const response = await this.sendRequest<SystemHealthResponse>({
      op: 'system:health',
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to check health');
    }

    return response;
  }

  /**
   * Build a container image for an app
   */
  async buildImage(appId: string, appType: 'user' | 'system' = 'user'): Promise<{ imageName?: string; imageId?: string }> {
    const response = await this.sendRequest<ImageBuildResponse>({
      op: 'image:build',
      appId,
      appType,
    } as Omit<ImageBuildRequest, 'id'>);

    if (!response.success) {
      throw new Error(response.error || 'Failed to build image');
    }

    return { imageName: response.imageName, imageId: response.imageId };
  }

  /**
   * Remove a container image
   */
  async removeImage(appId: string): Promise<void> {
    const response = await this.sendRequest<InitResponse>({
      op: 'image:remove',
      appId,
    } as Omit<ImageRemoveRequest, 'id'>);

    if (!response.success) {
      throw new Error(response.error || 'Failed to remove image');
    }
  }

  /**
   * Start an exec session in a container
   * Returns the sessionId that can be used for subsequent operations
   */
  async startExec(
    appId: string,
    callbacks: TerminalSessionCallbacks,
    cols: number = 80,
    rows: number = 24
  ): Promise<string> {
    const response = await this.sendRequest<ContainerExecResponse>({
      op: 'container:exec',
      appId,
      cols,
      rows,
    });

    if (!response.success || !response.sessionId) {
      throw new Error(response.error || 'Failed to start exec session');
    }

    // Register callbacks for this session
    this.terminalSessions.set(response.sessionId, callbacks);

    return response.sessionId;
  }

  /**
   * Send input to a terminal session
   */
  sendTerminalInput(sessionId: string, data: string): void {
    if (!this.connected || !this.socket) {
      logger.error('Cannot send terminal input: not connected');
      return;
    }

    const message: TerminalInputMessage = {
      type: 'terminal:input',
      sessionId,
      data,
    };

    this.socket.write(JSON.stringify(message) + '\n');
  }

  /**
   * Resize a terminal session
   */
  sendTerminalResize(sessionId: string, cols: number, rows: number): void {
    if (!this.connected || !this.socket) {
      logger.error('Cannot send terminal resize: not connected');
      return;
    }

    const message: TerminalResizeMessage = {
      type: 'terminal:resize',
      sessionId,
      cols,
      rows,
    };

    this.socket.write(JSON.stringify(message) + '\n');
  }

  /**
   * Close a terminal session
   */
  closeTerminalSession(sessionId: string): void {
    this.terminalSessions.delete(sessionId);
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
    this.terminalSessions.clear();
  }
}

// Singleton instance
let initClient: InitClient | null = null;

export function getInitClient(): InitClient {
  if (!initClient) {
    initClient = new InitClient();
  }
  return initClient;
}
