import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Package, 
  Play, 
  Square, 
  RotateCcw, 
  Trash2, 
  Upload,
  MoreVertical,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { appsApi, type App } from '../lib/api';
import { cn, formatRelativeTime } from '../lib/utils';

export function Apps() {
  const [installing, setInstalling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['apps'],
    queryFn: appsApi.list,
  });

  const installMutation = useMutation({
    mutationFn: appsApi.install,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setInstalling(false);
    },
    onError: () => {
      setInstalling(false);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setInstalling(true);
    installMutation.mutate(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Apps</h1>
          <p className="text-surface-400 mt-1">Manage your installed applications</p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={installing}
            className="btn-primary"
          >
            <Upload className="w-4 h-4 mr-2" />
            {installing ? 'Installing...' : 'Install App'}
          </button>
        </div>
      </div>

      {installMutation.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-400">Installation failed</p>
            <p className="text-sm text-red-300/80 mt-1">
              {installMutation.error instanceof Error 
                ? installMutation.error.message 
                : 'An error occurred'}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-surface-400">Loading apps...</div>
      ) : error ? (
        <div className="text-red-400">Failed to load apps</div>
      ) : data?.apps.length === 0 ? (
        <div className="card p-8 text-center">
          <Package className="w-12 h-12 text-surface-600 mx-auto mb-4" />
          <h2 className="text-lg font-medium mb-2">No apps installed</h2>
          <p className="text-surface-400 mb-4">
            Upload a .zip file to install your first app
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary"
          >
            <Upload className="w-4 h-4 mr-2" />
            Install App
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.apps.map(app => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppCard({ app }: { app: App }) {
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleError = (err: Error) => {
    console.error(`App ${app.id} action failed:`, err);
    setError(err.message);
    // Clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  };

  const startMutation = useMutation({
    mutationFn: () => appsApi.start(app.id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: handleError,
  });

  const stopMutation = useMutation({
    mutationFn: () => appsApi.stop(app.id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: handleError,
  });

  const restartMutation = useMutation({
    mutationFn: () => appsApi.restart(app.id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: handleError,
  });

  const uninstallMutation = useMutation({
    mutationFn: () => appsApi.uninstall(app.id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: handleError,
  });

  const isRunning = app.status === 'running';
  const isLoading = startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

  const handleStartStop = () => {
    if (isRunning) {
      console.log(`Stopping app: ${app.id}`);
      stopMutation.mutate();
    } else {
      console.log(`Starting app: ${app.id}`);
      startMutation.mutate();
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-surface-700 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-surface-400" />
          </div>
          <div>
            <h3 className="font-medium">{app.name}</h3>
            <p className="text-xs text-surface-500">v{app.version}</p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="btn-ghost btn-sm p-1"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowMenu(false)} 
              />
              <div className="absolute right-0 top-full mt-1 w-40 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-20 py-1">
                {app.route && isRunning && (
                  <a
                    href={`/apps${app.route}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open App
                  </a>
                )}
                <button
                  onClick={() => {
                    restartMutation.mutate();
                    setShowMenu(false);
                  }}
                  disabled={!isRunning}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-700 transition-colors w-full text-left disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restart
                </button>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to uninstall this app?')) {
                      uninstallMutation.mutate();
                    }
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-700 transition-colors w-full text-left text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Uninstall
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-2 mb-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {app.description && (
        <p className="text-sm text-surface-400 mb-3 line-clamp-2">
          {app.description}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            app.status === 'running' ? "bg-green-400" :
            app.status === 'error' ? "bg-red-400" :
            app.status === 'starting' ? "bg-yellow-400 animate-pulse" :
            "bg-surface-500"
          )} />
          <span className="text-sm text-surface-400 capitalize">{app.status}</span>
        </div>

        <button
          onClick={handleStartStop}
          disabled={isLoading || app.status === 'starting'}
          className={cn(
            "btn btn-sm",
            isRunning ? "btn-secondary" : "btn-primary"
          )}
        >
          {isLoading ? (
            <RotateCcw className="w-4 h-4 animate-spin" />
          ) : isRunning ? (
            <>
              <Square className="w-4 h-4 mr-1" />
              Stop
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-1" />
              Start
            </>
          )}
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-surface-700">
        <p className="text-xs text-surface-500">
          Updated {formatRelativeTime(app.updated_at)}
        </p>
      </div>
    </div>
  );
}
