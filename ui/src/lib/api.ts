const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  console.log(`[API] ${options.method || 'GET'} ${url}`);
  
  // Only set Content-Type if there's a body
  const headers: Record<string, string> = {};
  if (options.headers) {
    // Copy existing headers
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    console.log(`[API] ${url} -> ${response.status}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      console.error(`[API] Error:`, error);
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`[API] Response:`, data);
    return data;
  } catch (err) {
    console.error(`[API] Fetch failed:`, err);
    throw err;
  }
}

// Apps API
export interface App {
  id: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  status: 'stopped' | 'running' | 'error' | 'starting';
  route: string | null;
  port: number | null;
  container_id: string | null;
  created_at: string;
  updated_at: string;
}

export const appsApi = {
  list: () => request<{ apps: App[] }>('/apps'),
  
  get: (id: string) => request<{ app: App }>(`/apps/${id}`),
  
  install: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/apps`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json() as Promise<{ app: App }>;
  },
  
  uninstall: (id: string) => request<{ success: boolean }>(`/apps/${id}`, { method: 'DELETE' }),
  
  start: (id: string) => request<{ app: App }>(`/apps/${id}/start`, { method: 'POST' }),
  
  stop: (id: string) => request<{ app: App }>(`/apps/${id}/stop`, { method: 'POST' }),
  
  restart: (id: string) => request<{ app: App }>(`/apps/${id}/restart`, { method: 'POST' }),
  
  logs: (id: string) => request<{ logs: string[] }>(`/apps/${id}/logs`),
};

// Documents API
export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  created: string;
}

export interface DirectoryListing {
  path: string;
  items: FileInfo[];
}

export const documentsApi = {
  list: (path = '') => request<DirectoryListing>(`/documents/${path}`),
  
  upload: async (path: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/documents/${path}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json() as Promise<{ success: boolean; path: string }>;
  },
  
  createDirectory: (path: string) => 
    request<{ success: boolean; path: string }>(`/documents/${path}?mkdir`, { method: 'POST' }),
  
  delete: (path: string) => 
    request<{ success: boolean }>(`/documents/${path}`, { method: 'DELETE' }),
  
  rename: (path: string, newPath: string) =>
    request<{ success: boolean; path: string }>(`/documents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ newPath }),
    }),
};

// System API
export interface SystemInfo {
  version: string;
  hostname: string;
  platform: string;
  arch: string;
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  cpu: {
    cores: number;
    model: string;
    loadAvg: number[];
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
}

export const systemApi = {
  info: () => request<SystemInfo>('/system/info'),
  
  config: () => request<{ config: Record<string, string> }>('/system/config'),
  
  updateConfig: (config: Record<string, string>) =>
    request<{ success: boolean }>('/system/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
};
