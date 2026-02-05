/**
 * AgentaOS Init Socket Protocol
 * 
 * This defines the communication protocol between the Init microkernel
 * and the App Manager. The protocol is intentionally minimal and strict
 * to minimize attack surface.
 */

// ============================================================
// OPERATIONS (Whitelist - only these are allowed)
// ============================================================

export type InitOperation =
  | 'container:start'
  | 'container:stop'
  | 'container:restart'
  | 'container:status'
  | 'container:logs'
  | 'container:list'
  | 'image:build'
  | 'image:remove'
  | 'system:health';

// ============================================================
// PORT MAPPING TYPES
// ============================================================

export interface PortMapping {
  containerPort: number;  // Port inside container (e.g., 25565)
  hostPort: number;       // Port on host (e.g., 10001)
  protocol: 'tcp' | 'udp';
  enabled: boolean;
}

// Port allocation range for user apps
export const PORT_RANGE = {
  min: 10000,
  max: 20000,
};

// ============================================================
// REQUEST TYPES
// ============================================================

export interface InitRequestBase {
  id: string;  // Request ID for correlation
  op: InitOperation;
}

export interface ContainerStartRequest extends InitRequestBase {
  op: 'container:start';
  appId: string;
  instanceId?: string;  // Optional instance ID for multi-instance support
  appType: 'user' | 'system';
  portMappings?: PortMapping[];  // Optional port mappings
}

export interface ContainerStopRequest extends InitRequestBase {
  op: 'container:stop';
  appId: string;
  instanceId?: string;  // Optional instance ID for multi-instance support
}

export interface ContainerRestartRequest extends InitRequestBase {
  op: 'container:restart';
  appId: string;
  instanceId?: string;  // Optional instance ID for multi-instance support
}

export interface ContainerStatusRequest extends InitRequestBase {
  op: 'container:status';
  appId: string;
  instanceId?: string;  // Optional instance ID for multi-instance support
}

export interface ContainerLogsRequest extends InitRequestBase {
  op: 'container:logs';
  appId: string;
  instanceId?: string;  // Optional instance ID for multi-instance support
  tail?: number;  // Only allowed param: number of lines
}

export interface ContainerListRequest extends InitRequestBase {
  op: 'container:list';
}

export interface SystemHealthRequest extends InitRequestBase {
  op: 'system:health';
}

export interface ImageBuildRequest extends InitRequestBase {
  op: 'image:build';
  appId: string;
  appType: 'user' | 'system';
}

export interface ImageRemoveRequest extends InitRequestBase {
  op: 'image:remove';
  appId: string;
}

export type InitRequest =
  | ContainerStartRequest
  | ContainerStopRequest
  | ContainerRestartRequest
  | ContainerStatusRequest
  | ContainerLogsRequest
  | ContainerListRequest
  | ImageBuildRequest
  | ImageRemoveRequest
  | SystemHealthRequest;

// ============================================================
// RESPONSE TYPES
// ============================================================

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'error' | 'not_found';

export interface InitResponseBase {
  id: string;  // Correlation ID from request
  success: boolean;
  error?: string;
}

export interface ContainerStartResponse extends InitResponseBase {
  containerId?: string;
}

export interface ContainerStopResponse extends InitResponseBase {}

export interface ContainerRestartResponse extends InitResponseBase {
  containerId?: string;
}

export interface ContainerStatusResponse extends InitResponseBase {
  status?: ContainerStatus;
  containerId?: string;
  startedAt?: string;
}

export interface ContainerLogsResponse extends InitResponseBase {
  logs?: string[];
}

export interface ContainerInfo {
  appId: string;
  containerId: string;
  status: ContainerStatus;
  appType: 'user' | 'system';
}

export interface ContainerListResponse extends InitResponseBase {
  containers?: ContainerInfo[];
}

export interface SystemHealthResponse extends InitResponseBase {
  initUptime?: number;
  podmanAvailable?: boolean;
}

export interface ImageBuildResponse extends InitResponseBase {
  imageId?: string;
  imageName?: string;
}

export interface ImageRemoveResponse extends InitResponseBase {}

export type InitResponse =
  | ContainerStartResponse
  | ContainerStopResponse
  | ContainerRestartResponse
  | ContainerStatusResponse
  | ContainerLogsResponse
  | ContainerListResponse
  | ImageBuildResponse
  | ImageRemoveResponse
  | SystemHealthResponse;

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate app ID format
 * Only lowercase alphanumeric and hyphens, 1-64 characters
 */
export function isValidAppId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/.test(id);
}

/**
 * Validate instance ID format
 * Format: {appId}-{number} e.g., "hello-1", "myapp-42"
 * Only lowercase alphanumeric, hyphens, and must end with a number
 */
export function isValidInstanceId(instanceId: string): boolean {
  // Instance ID format: appId-number (e.g., hello-1, my-app-2)
  return /^[a-z0-9][a-z0-9-]*-\d+$/.test(instanceId);
}

/**
 * Validate operation is in allowed set
 */
export function isValidOperation(op: string): op is InitOperation {
  const allowed: InitOperation[] = [
    'container:start',
    'container:stop',
    'container:restart',
    'container:status',
    'container:logs',
    'container:list',
    'image:build',
    'image:remove',
    'system:health',
  ];
  return allowed.includes(op as InitOperation);
}

/**
 * Validate tail parameter for logs
 */
export function isValidTailParam(tail: unknown): tail is number {
  return typeof tail === 'number' && tail > 0 && tail <= 10000 && Number.isInteger(tail);
}

/**
 * Validate port number
 */
export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && port >= 1 && port <= 65535 && Number.isInteger(port);
}

/**
 * Validate host port is within allowed range
 */
export function isValidHostPort(port: number): boolean {
  return port >= PORT_RANGE.min && port <= PORT_RANGE.max;
}

/**
 * Validate protocol
 */
export function isValidProtocol(protocol: unknown): protocol is 'tcp' | 'udp' {
  return protocol === 'tcp' || protocol === 'udp';
}

/**
 * Validate a port mapping object
 */
export function isValidPortMapping(mapping: unknown): mapping is PortMapping {
  if (typeof mapping !== 'object' || mapping === null) return false;
  const m = mapping as Record<string, unknown>;
  return (
    isValidPort(m.containerPort) &&
    isValidPort(m.hostPort) &&
    isValidHostPort(m.hostPort as number) &&
    isValidProtocol(m.protocol) &&
    typeof m.enabled === 'boolean'
  );
}

// ============================================================
// SOCKET PATHS
// ============================================================

export const INIT_SOCKET_PATH = '/run/agentaos/init.sock';
export const CONTAINER_NAME_PREFIX = 'agentaos';
