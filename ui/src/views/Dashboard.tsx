import { useQuery } from '@tanstack/react-query';
import { 
  Cpu, 
  HardDrive, 
  MemoryStick, 
  Play, 
  Square, 
  Package,
  Activity,
} from 'lucide-react';
import { appsApi, systemApi, type App } from '../lib/api';
import { formatBytes } from '../lib/utils';
import { cn } from '../lib/utils';

export function Dashboard() {
  const { data: systemInfo, isLoading: systemLoading } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: systemApi.info,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: appsApi.list,
  });

  const runningApps = appsData?.apps.filter(app => app.status === 'running') || [];
  const stoppedApps = appsData?.apps.filter(app => app.status === 'stopped') || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-surface-400 mt-1">Overview of your AgentaOS system</p>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Cpu className="w-5 h-5" />}
          label="CPU"
          value={systemInfo ? `${systemInfo.cpu.loadAvg[0].toFixed(1)}%` : '—'}
          subtext={systemInfo?.cpu.model || 'Loading...'}
          loading={systemLoading}
        />
        <StatCard
          icon={<MemoryStick className="w-5 h-5" />}
          label="Memory"
          value={systemInfo ? `${systemInfo.memory.usedPercent}%` : '—'}
          subtext={systemInfo ? `${formatBytes(systemInfo.memory.used)} / ${formatBytes(systemInfo.memory.total)}` : 'Loading...'}
          loading={systemLoading}
          percent={systemInfo?.memory.usedPercent}
        />
        <StatCard
          icon={<HardDrive className="w-5 h-5" />}
          label="Disk"
          value={systemInfo ? `${systemInfo.disk.usedPercent}%` : '—'}
          subtext={systemInfo ? `${formatBytes(systemInfo.disk.used)} / ${formatBytes(systemInfo.disk.total)}` : 'Loading...'}
          loading={systemLoading}
          percent={systemInfo?.disk.usedPercent}
        />
      </div>

      {/* Apps Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Running Apps */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-green-400" />
            <h2 className="font-medium">Running Apps</h2>
            <span className="ml-auto text-sm text-surface-400">
              {runningApps.length} app{runningApps.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          {appsLoading ? (
            <div className="text-surface-500">Loading...</div>
          ) : runningApps.length === 0 ? (
            <div className="text-surface-500 text-sm">No apps running</div>
          ) : (
            <div className="space-y-2">
              {runningApps.map(app => (
                <AppRow key={app.id} app={app} />
              ))}
            </div>
          )}
        </div>

        {/* Stopped Apps */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-surface-400" />
            <h2 className="font-medium">Installed Apps</h2>
            <span className="ml-auto text-sm text-surface-400">
              {(appsData?.apps.length || 0)} total
            </span>
          </div>
          
          {appsLoading ? (
            <div className="text-surface-500">Loading...</div>
          ) : stoppedApps.length === 0 ? (
            <div className="text-surface-500 text-sm">All apps are running</div>
          ) : (
            <div className="space-y-2">
              {stoppedApps.map(app => (
                <AppRow key={app.id} app={app} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  loading?: boolean;
  percent?: number;
}

function StatCard({ icon, label, value, subtext, loading, percent }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-surface-400">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className={cn(
          "text-2xl font-semibold",
          loading && "animate-pulse"
        )}>
          {value}
        </span>
      </div>
      
      {percent !== undefined && (
        <div className="mt-3 h-1.5 bg-surface-700 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              percent > 80 ? "bg-red-500" : percent > 60 ? "bg-yellow-500" : "bg-primary-500"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      
      <p className="text-xs text-surface-500 mt-2 truncate">{subtext}</p>
    </div>
  );
}

function AppRow({ app }: { app: App }) {
  const isRunning = app.status === 'running';
  
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-700/50 transition-colors">
      <div className={cn(
        "w-2 h-2 rounded-full",
        isRunning ? "bg-green-400" : "bg-surface-500"
      )} />
      
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{app.name}</div>
        <div className="text-xs text-surface-500">v{app.version}</div>
      </div>
      
      <div className="flex items-center gap-1">
        {isRunning ? (
          <Square className="w-4 h-4 text-surface-400" />
        ) : (
          <Play className="w-4 h-4 text-surface-400" />
        )}
      </div>
    </div>
  );
}
