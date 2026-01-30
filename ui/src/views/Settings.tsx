import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { systemApi } from '../lib/api';

export function Settings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['system', 'config'],
    queryFn: systemApi.config,
  });

  // Update form data when query data changes
  useEffect(() => {
    if (data?.config) {
      setFormData(data.config);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: systemApi.updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'config'] });
      setHasChanges(false);
    },
  });

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    if (data) {
      setFormData(data.config);
      setHasChanges(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-surface-400 mt-1">Configure your AgentaOS instance</p>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={handleReset} className="btn-ghost btn-sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            className="btn-primary btn-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-surface-400">Loading settings...</div>
      ) : (
        <div className="space-y-6">
          {/* General Settings */}
          <section className="card p-6">
            <h2 className="font-medium mb-4">General</h2>
            <div className="space-y-4">
              <SettingRow
                label="Instance Name"
                description="A friendly name for this AgentaOS instance"
              >
                <input
                  type="text"
                  value={formData.instance_name || ''}
                  onChange={(e) => handleChange('instance_name', e.target.value)}
                  placeholder="My AgentaOS"
                  className="input w-64"
                />
              </SettingRow>
            </div>
          </section>

          {/* Network Settings */}
          <section className="card p-6">
            <h2 className="font-medium mb-4">Network</h2>
            <div className="space-y-4">
              <SettingRow
                label="External URL"
                description="The public URL where this instance is accessible"
              >
                <input
                  type="url"
                  value={formData.external_url || ''}
                  onChange={(e) => handleChange('external_url', e.target.value)}
                  placeholder="https://my-agentaos.example.com"
                  className="input w-80"
                />
              </SettingRow>
            </div>
          </section>

          {/* About */}
          <section className="card p-6">
            <h2 className="font-medium mb-4">About</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-surface-400">Version</span>
                <span>{formData.version || '0.1.0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-400">Initialized</span>
                <span>{formData.initialized === 'true' ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="card p-6 border-red-500/20">
            <h2 className="font-medium text-red-400 mb-4">Danger Zone</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Reset All Settings</p>
                  <p className="text-sm text-surface-400">
                    Reset all settings to their default values
                  </p>
                </div>
                <button
                  className="btn-danger btn-sm"
                  onClick={() => {
                    if (confirm('Are you sure you want to reset all settings?')) {
                      // TODO: Implement reset
                    }
                  }}
                >
                  Reset Settings
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-surface-400">{description}</p>
      </div>
      {children}
    </div>
  );
}
