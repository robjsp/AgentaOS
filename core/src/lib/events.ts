import { EventEmitter } from 'events';

export interface SystemEvent {
  type: string;
  timestamp: number;
  data?: unknown;
}

class TypedEventEmitter extends EventEmitter {
  emit(event: string, payload: SystemEvent): boolean {
    // Emit to specific event
    super.emit(event, payload);
    // Also emit to wildcard listeners
    super.emit('*', payload);
    return true;
  }
}

export const eventBus = new TypedEventEmitter();

// Event types
export const Events = {
  // App events
  APP_INSTALLED: 'app:installed',
  APP_UNINSTALLED: 'app:uninstalled',
  APP_STARTED: 'app:started',
  APP_STOPPED: 'app:stopped',
  APP_ERROR: 'app:error',
  APP_LOG: 'app:log',
  
  // System events
  SYSTEM_INFO: 'system:info',
  SYSTEM_ERROR: 'system:error',
  
  // File events
  FILE_CREATED: 'file:created',
  FILE_DELETED: 'file:deleted',
  FILE_MODIFIED: 'file:modified',
} as const;

// Helper to emit events
export function emitEvent(type: string, data?: unknown): void {
  eventBus.emit(type, {
    type,
    timestamp: Date.now(),
    data,
  });
}
