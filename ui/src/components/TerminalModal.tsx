import { useEffect, useCallback } from 'react';
import { X, Terminal as TerminalIcon } from 'lucide-react';
import { Terminal } from './Terminal';

interface TerminalModalProps {
  appId: string;
  appName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TerminalModal({ appId, appName, isOpen, onClose }: TerminalModalProps) {
  // Handle escape key to close
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full h-full max-w-6xl max-h-[90vh] m-4 flex flex-col bg-surface-900 rounded-lg shadow-2xl border border-surface-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 bg-surface-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-surface-700 rounded-lg flex items-center justify-center">
              <TerminalIcon className="w-4 h-4 text-surface-400" />
            </div>
            <div>
              <h2 className="font-medium text-surface-100">{appName}</h2>
              <p className="text-xs text-surface-500">Terminal</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="btn-ghost btn-sm p-2 hover:bg-surface-700"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Terminal */}
        <div className="flex-1 p-2 min-h-0">
          <Terminal 
            appId={appId} 
            onClose={onClose}
            onError={(message) => console.error('Terminal error:', message)}
          />
        </div>
        
        {/* Footer */}
        <div className="px-4 py-2 border-t border-surface-700 bg-surface-800">
          <p className="text-xs text-surface-500">
            Press <kbd className="px-1.5 py-0.5 bg-surface-700 rounded text-surface-400">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
