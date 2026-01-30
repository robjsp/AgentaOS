import { useQuery } from '@tanstack/react-query';
import { 
  Cpu, 
  HardDrive, 
  MemoryStick, 
  Server,
  Clock,
  Activity,
} from 'lucide-react';
import { systemApi } from '../lib/api';
import { formatBytes, cn } from '../lib/utils';

export function System() {
  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: systemApi.info,
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '< 1m';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System</h1>
        <p className="text-surface-400 mt-1">Monitor system resources and processes</p>
      </div>

      {isLoading ? (
        <div className="text-surface-400">Loading system info...</div>
      ) : !systemInfo ? (
        <div className="text-red-400">Failed to load system info</div>
      ) : (
        <>
          {/* System Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard
              icon={<Server className="w-5 h-5" />}
              label="Hostname"
              value={systemInfo.hostname}
            />
            <InfoCard
              icon={<Activity className="w-5 h-5" />}
              label="Platform"
              value={`${systemInfo.platform} (${systemInfo.arch})`}
            />
            <InfoCard
              icon={<Clock className="w-5 h-5" />}
              label="Uptime"
              value={formatUptime(systemInfo.uptime)}
            />
            <InfoCard
              icon={<Cpu className="w-5 h-5" />}
              label="CPU Cores"
              value={String(systemInfo.cpu.cores)}
            />
          </div>

          {/* Resource Usage */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* CPU */}
            <ResourceCard
              icon={<Cpu className="w-5 h-5" />}
              title="CPU"
              percent={Math.min(100, systemInfo.cpu.loadAvg[0] * 100 / systemInfo.cpu.cores)}
              details={[
                { label: 'Model', value: systemInfo.cpu.model },
                { label: 'Load (1m)', value: systemInfo.cpu.loadAvg[0].toFixed(2) },
                { label: 'Load (5m)', value: systemInfo.cpu.loadAvg[1].toFixed(2) },
                { label: 'Load (15m)', value: systemInfo.cpu.loadAvg[2].toFixed(2) },
              ]}
            />

            {/* Memory */}
            <ResourceCard
              icon={<MemoryStick className="w-5 h-5" />}
              title="Memory"
              percent={systemInfo.memory.usedPercent}
              details={[
                { label: 'Total', value: formatBytes(systemInfo.memory.total) },
                { label: 'Used', value: formatBytes(systemInfo.memory.used) },
                { label: 'Free', value: formatBytes(systemInfo.memory.free) },
                { label: 'Usage', value: `${systemInfo.memory.usedPercent}%` },
              ]}
            />

            {/* Disk */}
            <ResourceCard
              icon={<HardDrive className="w-5 h-5" />}
              title="Disk"
              percent={systemInfo.disk.usedPercent}
              details={[
                { label: 'Total', value: formatBytes(systemInfo.disk.total) },
                { label: 'Used', value: formatBytes(systemInfo.disk.used) },
                { label: 'Free', value: formatBytes(systemInfo.disk.free) },
                { label: 'Usage', value: `${systemInfo.disk.usedPercent}%` },
              ]}
            />
          </div>

          {/* Version Info */}
          <div className="card p-4">
            <h2 className="font-medium mb-4">System Information</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-surface-400">AgentaOS Version</span>
                <p className="font-medium">{systemInfo.version}</p>
              </div>
              <div>
                <span className="text-surface-400">Platform</span>
                <p className="font-medium">{systemInfo.platform}</p>
              </div>
              <div>
                <span className="text-surface-400">Architecture</span>
                <p className="font-medium">{systemInfo.arch}</p>
              </div>
              <div>
                <span className="text-surface-400">Environment</span>
                <p className="font-medium">{import.meta.env.MODE}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface InfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function InfoCard({ icon, label, value }: InfoCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-surface-400 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="font-medium truncate">{value}</p>
    </div>
  );
}

interface ResourceCardProps {
  icon: React.ReactNode;
  title: string;
  percent: number;
  details: Array<{ label: string; value: string }>;
}

function ResourceCard({ icon, title, percent, details }: ResourceCardProps) {
  const safePercent = Math.max(0, Math.min(100, percent));
  
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        <span className={cn(
          "text-2xl font-bold",
          safePercent > 80 ? "text-red-400" : 
          safePercent > 60 ? "text-yellow-400" : 
          "text-green-400"
        )}>
          {safePercent.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-surface-700 rounded-full overflow-hidden mb-4">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            safePercent > 80 ? "bg-red-500" :
            safePercent > 60 ? "bg-yellow-500" :
            "bg-green-500"
          )}
          style={{ width: `${safePercent}%` }}
        />
      </div>

      {/* Details */}
      <div className="space-y-2">
        {details.map((detail) => (
          <div key={detail.label} className="flex justify-between text-sm">
            <span className="text-surface-400">{detail.label}</span>
            <span>{detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
