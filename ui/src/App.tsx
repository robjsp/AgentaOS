import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './views/Dashboard';
import { Apps } from './views/Apps';
import { Files } from './views/Files';
import { System } from './views/System';
import { Settings } from './views/Settings';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  // Initialize WebSocket connection
  useWebSocket();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/apps" element={<Apps />} />
        <Route path="/files/*" element={<Files />} />
        <Route path="/system" element={<System />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
