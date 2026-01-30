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
  | 'system:health';

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
  appType: 'user' | 'system';
}

export interface ContainerStopRequest extends InitRequestBase {
  op: 'container:stop';
  appId: string;
}

export interface ContainerRestartRequest extends InitRequestBase {
  op: 'container:restart';
  appId: string;
}

export interface ContainerStatusRequest extends InitRequestBase {
  op: 'container:status';
  appId: string;
}

export interface ContainerLogsRequest extends InitRequestBase {
  op: 'container:logs';
  appId: string;
  tail?: number;  // Only allowed param: number of lines
}

export interface ContainerListRequest extends InitRequestBase {
  op: 'container:list';
}

export interface SystemHealthRequest extends InitRequestBase {
  op: 'system:health';
}

export type InitRequest =
  | ContainerStartRequest
  | ContainerStopRequest
  | ContainerRestartRequest
  | ContainerStatusRequest
  | ContainerLogsRequest
  | ContainerListRequest
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

export type InitResponse =
  | ContainerStartResponse
  | ContainerStopResponse
  | ContainerRestartResponse
  | ContainerStatusResponse
  | ContainerLogsResponse
  | ContainerListResponse
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

// ============================================================
// SOCKET PATHS
// ============================================================

export const INIT_SOCKET_PATH = '/run/agentaos/init.sock';
export const CONTAINER_NAME_PREFIX = 'agentaos';
