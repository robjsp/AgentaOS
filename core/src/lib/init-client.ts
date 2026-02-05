/**
 * Init Socket Client
 *
 * Client for communicating with the Init microkernel via Unix socket.
 * Used by the App Manager to start/stop/manage containers.
 */

import { createConnection, Socket } from "net";
import { randomUUID } from "crypto";
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
  SystemHealthResponse,
  ImageBuildRequest,
  ImageRemoveRequest,
  ImageBuildResponse,
  PortMapping,
  INIT_SOCKET_PATH,
} from "../../../shared/protocol";
import { logger } from "./logger";

export class InitClient {
  private socketPath: string;
  private socket: Socket | null = null;
  private pendingRequests: Map<
    string,
    {
      resolve: (response: InitResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private buffer = "";
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

      this.socket.on("connect", () => {
        this.connected = true;
        this.reconnecting = false;
        logger.info("Connected to Init socket");
        resolve();
      });

      this.socket.on("data", (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.socket = null;
        logger.warn("Disconnected from Init socket");
        this.scheduleReconnect();
      });

      this.socket.on("error", (err) => {
        if (!this.connected) {
          reject(err);
        } else {
          logger.error("Init socket error:", err.message);
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
        logger.error("Failed to reconnect to Init:", err);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as InitResponse;
        const pending = this.pendingRequests.get(response.id);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch (err) {
        logger.error("Failed to parse Init response:", err);
      }
    }
  }

  /**
   * Send a request to Init and wait for response
   */
  private async sendRequest<T extends InitResponse>(
    request: Omit<InitRequest, "id">,
  ): Promise<T> {
    if (!this.connected || !this.socket) {
      await this.connect();
    }

    const id = randomUUID();
    const fullRequest = { ...request, id } as InitRequest;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: resolve as (response: InitResponse) => void,
        reject,
        timeout,
      });

      this.socket!.write(JSON.stringify(fullRequest) + "\n");
    });
  }

  /**
   * Start a container
   * @param appId - The app ID
   * @param appType - "user" or "system"
   * @param portMappings - Port mappings for the container
   * @param instanceId - Optional instance ID for multi-instance support
   */
  async startContainer(
    appId: string,
    appType: "user" | "system" = "user",
    portMappings?: PortMapping[],
    instanceId?: string,
  ): Promise<{ containerId?: string }> {
    const request: Omit<ContainerStartRequest, "id"> = {
      op: "container:start",
      appId,
      appType,
      portMappings,
    };
    if (instanceId) {
      request.instanceId = instanceId;
    }

    const response = await this.sendRequest<InitResponse>(request);

    if (!response.success) {
      throw new Error(response.error || "Failed to start container");
    }

    return { containerId: (response as { containerId?: string }).containerId };
  }

  /**
   * Stop a container
   * @param appId - The app ID
   * @param instanceId - Optional instance ID for multi-instance support
   */
  async stopContainer(appId: string, instanceId?: string): Promise<void> {
    const request: Omit<ContainerStopRequest, "id"> = {
      op: "container:stop",
      appId,
    };
    if (instanceId) {
      (request as ContainerStopRequest).instanceId = instanceId;
    }

    const response = await this.sendRequest<InitResponse>(request);

    if (!response.success) {
      throw new Error(response.error || "Failed to stop container");
    }
  }

  /**
   * Restart a container
   * @param appId - The app ID
   * @param portMappings - Port mappings for the container
   * @param instanceId - Optional instance ID for multi-instance support
   */
  async restartContainer(
    appId: string,
    portMappings?: PortMapping[],
    instanceId?: string,
  ): Promise<{ containerId?: string }> {
    const request: { op: "container:restart"; appId: string; portMappings?: PortMapping[]; instanceId?: string } = {
      op: "container:restart",
      appId,
      portMappings,
    };
    if (instanceId) {
      request.instanceId = instanceId;
    }

    const response = await this.sendRequest<InitResponse>(request);

    if (!response.success) {
      throw new Error(response.error || "Failed to restart container");
    }

    return { containerId: (response as { containerId?: string }).containerId };
  }

  /**
   * Get container status
   * @param appId - The app ID
   * @param instanceId - Optional instance ID for multi-instance support
   */
  async getContainerStatus(
    appId: string,
    instanceId?: string,
  ): Promise<ContainerStatusResponse> {
    const request: Omit<ContainerStatusRequest, "id"> = {
      op: "container:status",
      appId,
    };
    if (instanceId) {
      (request as ContainerStatusRequest).instanceId = instanceId;
    }

    const response = await this.sendRequest<ContainerStatusResponse>(request);

    if (!response.success) {
      throw new Error(response.error || "Failed to get container status");
    }

    return response;
  }

  /**
   * Get container logs
   * @param appId - The app ID
   * @param tail - Number of log lines to return
   * @param instanceId - Optional instance ID for multi-instance support
   */
  async getContainerLogs(
    appId: string,
    tail: number = 100,
    instanceId?: string,
  ): Promise<string[]> {
    const request: Omit<ContainerLogsRequest, "id"> = {
      op: "container:logs",
      appId,
      tail,
    };
    if (instanceId) {
      (request as ContainerLogsRequest).instanceId = instanceId;
    }

    const response = await this.sendRequest<ContainerLogsResponse>(request);

    if (!response.success) {
      throw new Error(response.error || "Failed to get container logs");
    }

    return response.logs || [];
  }

  /**
   * List all containers
   */
  async listContainers(): Promise<ContainerListResponse> {
    const response = await this.sendRequest<ContainerListResponse>({
      op: "container:list",
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to list containers");
    }

    return response;
  }

  /**
   * Check system health
   */
  async checkHealth(): Promise<SystemHealthResponse> {
    const response = await this.sendRequest<SystemHealthResponse>({
      op: "system:health",
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to check health");
    }

    return response;
  }

  /**
   * Build a container image for an app
   */
  async buildImage(
    appId: string,
    appType: "user" | "system" = "user",
  ): Promise<{ imageName?: string; imageId?: string }> {
    const response = await this.sendRequest<ImageBuildResponse>({
      op: "image:build",
      appId,
      appType,
    } as Omit<ImageBuildRequest, "id">);

    if (!response.success) {
      throw new Error(response.error || "Failed to build image");
    }

    return { imageName: response.imageName, imageId: response.imageId };
  }

  /**
   * Remove a container image
   */
  async removeImage(appId: string): Promise<void> {
    const response = await this.sendRequest<InitResponse>({
      op: "image:remove",
      appId,
    } as Omit<ImageRemoveRequest, "id">);

    if (!response.success) {
      throw new Error(response.error || "Failed to remove image");
    }
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
