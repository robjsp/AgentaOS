import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Folder, 
  File, 
  Upload, 
  FolderPlus, 
  Trash2, 
  ChevronRight,
  Home,
  MoreVertical,
  Download,
} from 'lucide-react';
import { documentsApi, type FileInfo } from '../lib/api';
import { cn, formatBytes, formatRelativeTime } from '../lib/utils';

export function Files() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Get current path from URL
  const currentPath = location.pathname.replace('/files', '').replace(/^\//, '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', currentPath],
    queryFn: () => documentsApi.list(currentPath),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file }: { file: File }) => documentsApi.upload(currentPath, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => documentsApi.createDirectory(
      currentPath ? `${currentPath}/${name}` : name
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowNewFolderDialog(false);
      setNewFolderName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => documentsApi.delete(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSelectedItems(new Set());
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of files) {
      uploadMutation.mutate({ file });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleItemClick = (item: FileInfo) => {
    if (item.type === 'directory') {
      navigate(`/files/${item.path}`);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Delete ${selectedItems.size} item(s)?`)) return;

    for (const path of selectedItems) {
      deleteMutation.mutate(path);
    }
  };

  // Build breadcrumb parts
  const pathParts = currentPath ? currentPath.split('/') : [];
  const breadcrumbs = [
    { name: 'Documents', path: '' },
    ...pathParts.map((part, i) => ({
      name: part,
      path: pathParts.slice(0, i + 1).join('/'),
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Files</h1>
          <p className="text-surface-400 mt-1">Manage your documents</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => setShowNewFolderDialog(true)}
            className="btn-secondary btn-sm"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary btn-sm"
            disabled={uploadMutation.isPending}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-4 h-4 text-surface-500" />}
            <button
              onClick={() => navigate(`/files/${crumb.path}`)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-800 transition-colors",
                i === breadcrumbs.length - 1 ? "text-surface-100" : "text-surface-400"
              )}
            >
              {i === 0 && <Home className="w-4 h-4" />}
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* Actions bar */}
      {selectedItems.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-surface-800 rounded-lg">
          <span className="text-sm text-surface-400">
            {selectedItems.size} selected
          </span>
          <button
            onClick={handleDeleteSelected}
            className="btn-danger btn-sm ml-auto"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </button>
        </div>
      )}

      {/* File list */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-surface-400">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">Failed to load files</div>
        ) : data?.items.length === 0 ? (
          <div className="p-8 text-center">
            <Folder className="w-12 h-12 text-surface-600 mx-auto mb-4" />
            <p className="text-surface-400">This folder is empty</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-700 text-left text-sm text-surface-400">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === data?.items.length && data.items.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(data?.items.map(i => i.path) || []));
                      } else {
                        setSelectedItems(new Set());
                      }
                    }}
                    className="rounded"
                  />
                </th>
                <th className="p-3">Name</th>
                <th className="p-3 w-24">Size</th>
                <th className="p-3 w-40">Modified</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map(item => (
                <FileRow
                  key={item.path}
                  item={item}
                  selected={selectedItems.has(item.path)}
                  onSelect={(selected) => {
                    const newSet = new Set(selectedItems);
                    if (selected) {
                      newSet.add(item.path);
                    } else {
                      newSet.delete(item.path);
                    }
                    setSelectedItems(newSet);
                  }}
                  onClick={() => handleItemClick(item)}
                  onDelete={() => {
                    if (confirm(`Delete "${item.name}"?`)) {
                      deleteMutation.mutate(item.path);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Folder Dialog */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-800 rounded-lg p-6 w-full max-w-md border border-surface-700">
            <h2 className="text-lg font-medium mb-4">New Folder</h2>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="input mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName) {
                  createFolderMutation.mutate(newFolderName);
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewFolderDialog(false);
                  setNewFolderName('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => createFolderMutation.mutate(newFolderName)}
                disabled={!newFolderName || createFolderMutation.isPending}
                className="btn-primary"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FileRowProps {
  item: FileInfo;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
  onDelete: () => void;
}

function FileRow({ item, selected, onSelect, onClick, onDelete }: FileRowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const isFolder = item.type === 'directory';

  return (
    <tr 
      className={cn(
        "border-b border-surface-700/50 hover:bg-surface-800/50 transition-colors",
        selected && "bg-surface-800"
      )}
    >
      <td className="p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="rounded"
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="p-3">
        <button
          onClick={onClick}
          className="flex items-center gap-2 hover:text-primary-400 transition-colors"
        >
          {isFolder ? (
            <Folder className="w-5 h-5 text-primary-400" />
          ) : (
            <File className="w-5 h-5 text-surface-400" />
          )}
          <span className={isFolder ? "font-medium" : ""}>{item.name}</span>
        </button>
      </td>
      <td className="p-3 text-sm text-surface-400">
        {isFolder ? '—' : formatBytes(item.size)}
      </td>
      <td className="p-3 text-sm text-surface-400">
        {formatRelativeTime(item.modified)}
      </td>
      <td className="p-3">
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
              <div className="absolute right-0 top-full mt-1 w-32 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-20 py-1">
                {!isFolder && (
                  <a
                    href={`/api/documents/${item.path}`}
                    download
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                )}
                <button
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-700 transition-colors w-full text-left text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
