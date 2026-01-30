import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  FolderOpen, 
  Monitor, 
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useConnectionStore } from '../stores/connection';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/apps', icon: Package, label: 'Apps' },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/system', icon: Monitor, label: 'System' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Layout({ children }: LayoutProps) {
  const isConnected = useConnectionStore((s) => s.isConnected);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-surface-900 border-b border-surface-800 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-lg">AgentaOS</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex items-center gap-1 ml-8">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-surface-800 text-primary-400'
                    : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-1.5 text-sm text-green-400">
              <Wifi className="w-4 h-4" />
              <span>Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm text-red-400">
              <WifiOff className="w-4 h-4" />
              <span>Disconnected</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
