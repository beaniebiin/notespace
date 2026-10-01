import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Sliders, FolderTree, ArrowUp, ArrowDown, CornerUpLeft, 
  Folder, FolderOpen, FileText, FolderInput, Edit2, Trash2, Check, Search,
  History, Copy, Loader2, Archive, Download, Upload, AlertTriangle
} from 'lucide-react';
import { AppSettings, FileSystemNode } from '../types';
import { APP_VERSION } from '../constants';
import { storageService } from '../services/storageService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  fileSystem: FileSystemNode[];
  activeNoteId?: string | null;
  onMoveNode: (nodeId: string, targetFolderId: string | undefined, targetIndex?: number) => void;
  onRenameNode: (id: string, newName: string) => void;
  onDeleteNode: (id: string) => void;
}

// Helper to find a node by ID
const findNodeById = (nodes: FileSystemNode[], id: string): FileSystemNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
};

// Helper to get parent and index of a node
const findParentAndIndex = (
  nodes: FileSystemNode[], 
  targetId: string, 
  parentId: string | undefined = undefined
): { parentId: string | undefined; parentNode: FileSystemNode | null; index: number } | null => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) {
      return { parentId, parentNode: parentId ? findNodeById(nodes, parentId) : null, index: i };
    }
    if (nodes[i].children) {
      const found = findParentAndIndex(nodes[i].children!, targetId, nodes[i].id);
      if (found) return found;
    }
  }
  return null;
};

// Collect all descendant IDs to prevent cyclical moves
const getDescendantIds = (node: FileSystemNode): Set<string> => {
  const ids = new Set<string>();
  const collect = (n: FileSystemNode) => {
    ids.add(n.id);
    if (n.children) n.children.forEach(collect);
  };
  collect(node);
  return ids;
};

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  onSave,
  fileSystem,
  activeNoteId,
  onMoveNode,
  onRenameNode,
  onDeleteNode
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'hierarchy' | 'snapshots' | 'backup'>('general');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [searchQuery, setSearchQuery] = useState('');
  const [movePickerNode, setMovePickerNode] = useState<FileSystemNode | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  // Collect all folder IDs to expand by default
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // --- Backup & Restore States ---
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusMessage, setImportStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleExportZip = async () => {
    try {
      setIsExporting(true);
      const blob = await storageService.exportWorkspaceZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      a.href = url;
      a.download = `notespace_backup_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export failed:', err);
      alert('백업 파일 생성에 실패했습니다: ' + (err.message || '알 수 없는 오류'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportZipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`'${file.name}' 백업 파일로 워크스페이스를 복원하시겠습니까?\n\n주의: 기존 로컬 워크스페이스의 내용이 백업 파일의 내용으로 완전히 교체됩니다.`)) {
      if (zipInputRef.current) zipInputRef.current.value = '';
      return;
    }

    try {
      setIsImporting(true);
      setImportStatusMessage(null);
      const ok = await storageService.importWorkspaceZip(file);
      if (ok) {
        setImportStatusMessage({
          type: 'success',
          text: '복원이 성공적으로 완료되었습니다! 잠시 후 화면이 새로고침됩니다...'
        });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setImportStatusMessage({
          type: 'error',
          text: '백업 파일 형식이 올바르지 않거나 복원에 실패했습니다.'
        });
      }
    } catch (err: any) {
      setImportStatusMessage({
        type: 'error',
        text: '복원 중 오류 발생: ' + (err.message || '알 수 없는 오류')
      });
    } finally {
      setIsImporting(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  // --- Snapshot Tab States ---
  const allNotes = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const traverse = (nodes: FileSystemNode[]) => {
      for (const n of nodes) {
        if (n.type === 'note') list.push({ id: n.id, name: n.name });
        if (n.children) traverse(n.children);
      }
    };
    traverse(fileSystem);
    return list;
  }, [fileSystem]);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(activeNoteId || null);
  const [snapshots, setSnapshots] = useState<{ filename: string; timestamp: number; size: number }[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [selectedSnapshotFilename, setSelectedSnapshotFilename] = useState<string | null>(null);
  const [snapshotContent, setSnapshotContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (activeNoteId && allNotes.some(n => n.id === activeNoteId)) {
        setSelectedNoteId(activeNoteId);
      } else if (!selectedNoteId && allNotes.length > 0) {
        setSelectedNoteId(allNotes[0].id);
      }
    }
  }, [isOpen, activeNoteId, allNotes]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'snapshots' || !selectedNoteId) return;
    let isSubscribed = true;
    setIsLoadingSnapshots(true);
    setSelectedSnapshotFilename(null);
    setSnapshotContent('');

    fetch(`api.php?action=list_snapshots&id=${encodeURIComponent(selectedNoteId)}&_t=${Date.now()}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (!isSubscribed) return;
        setSnapshots(data || []);
        setIsLoadingSnapshots(false);
        if (data && data.length > 0) {
          setSelectedSnapshotFilename(data[0].filename);
        }
      })
      .catch(err => {
        if (!isSubscribed) return;
        console.error('Failed to fetch snapshots', err);
        setSnapshots([]);
        setIsLoadingSnapshots(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, activeTab, selectedNoteId]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'snapshots' || !selectedNoteId || !selectedSnapshotFilename) {
      setSnapshotContent('');
      return;
    }
    let isSubscribed = true;
    setIsLoadingContent(true);
    setCopySuccess(false);

    fetch(`api.php?action=load_snapshot&id=${encodeURIComponent(selectedNoteId)}&filename=${encodeURIComponent(selectedSnapshotFilename)}&_t=${Date.now()}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!isSubscribed) return;
        setSnapshotContent(data?.content || '');
        setIsLoadingContent(false);
      })
      .catch(err => {
        if (!isSubscribed) return;
        console.error('Failed to load snapshot content', err);
        setSnapshotContent('');
        setIsLoadingContent(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, activeTab, selectedNoteId, selectedSnapshotFilename]);

  const handleCopySnapshot = () => {
    if (!snapshotContent) return;
    navigator.clipboard.writeText(snapshotContent).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const formatSnapshotLabel = (filename: string, timestamp?: number) => {
    const m = filename.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/);
    if (m) {
      return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
    }
    if (timestamp) {
      const d = new Date(timestamp * 1000);
      return d.toLocaleString('ko-KR');
    }
    return filename;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Auto-expand all folders initially
      const allFolderIds = new Set<string>();
      const collectFolders = (nodes: FileSystemNode[]) => {
        for (const n of nodes) {
          if (n.type === 'folder') {
            allFolderIds.add(n.id);
            if (n.children) collectFolders(n.children);
          }
        }
      };
      collectFolders(fileSystem);
      setExpandedFolders(allFolderIds);
    }
  }, [isOpen, fileSystem]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Hierarchy actions
  const handleMoveUp = (node: FileSystemNode) => {
    const info = findParentAndIndex(fileSystem, node.id);
    if (!info || info.index <= 0) return;
    onMoveNode(node.id, info.parentId, info.index - 1);
  };

  const handleMoveDown = (node: FileSystemNode) => {
    const info = findParentAndIndex(fileSystem, node.id);
    if (!info) return;
    // Siblings list
    const parent = info.parentId ? findNodeById(fileSystem, info.parentId) : null;
    const siblings = parent ? (parent.children || []) : fileSystem;
    if (info.index >= siblings.length - 1) return;
    onMoveNode(node.id, info.parentId, info.index + 1);
  };

  const handleOutdent = (node: FileSystemNode) => {
    if (!node.parentId) return; // Already at root
    const parentFolderInfo = findParentAndIndex(fileSystem, node.parentId);
    if (!parentFolderInfo) {
      // Outdent to root
      onMoveNode(node.id, undefined);
      return;
    }
    // Move to parent's parent, positioned right after parentFolder
    onMoveNode(node.id, parentFolderInfo.parentId, parentFolderInfo.index + 1);
  };

  const handleStartRename = (node: FileSystemNode) => {
    setRenamingNodeId(node.id);
    setRenamingValue(node.name);
  };

  const handleSaveRename = (nodeId: string) => {
    if (renamingValue.trim()) {
      onRenameNode(nodeId, renamingValue.trim());
    }
    setRenamingNodeId(null);
  };

  // Flattened tree for folder picker modal
  const getEligibleFolders = (nodeToMove: FileSystemNode): { id: string; name: string; depth: number }[] => {
    const invalidIds = getDescendantIds(nodeToMove);
    const result: { id: string; name: string; depth: number }[] = [];

    const traverse = (nodes: FileSystemNode[], depth: number) => {
      for (const n of nodes) {
        if (n.type === 'folder' && !invalidIds.has(n.id)) {
          result.push({ id: n.id, name: n.name, depth });
          if (n.children) traverse(n.children, depth + 1);
        }
      }
    };
    traverse(fileSystem, 0);
    return result;
  };

  // Render tree item recursively in hierarchy manager
  const renderTreeItem = (node: FileSystemNode, depth: number, parentId?: string): React.ReactNode => {
    const isFolder = node.type === 'folder';
    const isExpanded = expandedFolders.has(node.id);
    const parentNode = parentId ? findNodeById(fileSystem, parentId) : null;
    const siblings = parentNode ? (parentNode.children || []) : fileSystem;
    const itemIndex = siblings.findIndex(s => s.id === node.id);
    const canMoveUp = itemIndex > 0;
    const canMoveDown = itemIndex >= 0 && itemIndex < siblings.length - 1;
    const canOutdent = Boolean(parentId);

    // Filter matching
    const matchesSearch = !searchQuery.trim() || node.name.toLowerCase().includes(searchQuery.toLowerCase());

    return (
      <div key={node.id} className="flex flex-col select-none">
        {matchesSearch && (
          <div 
            className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg group text-sm border-b border-gray-50 dark:border-gray-750"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {/* Left: Icon & Name */}
            <div className="flex items-center min-w-0 flex-1 mr-2">
              {isFolder ? (
                <button 
                  onClick={() => toggleFolder(node.id)}
                  className="mr-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 p-0.5"
                >
                  {isExpanded ? <FolderOpen size={16} className="text-amber-500" /> : <Folder size={16} className="text-amber-500" />}
                </button>
              ) : (
                <FileText size={16} className="mr-1.5 text-blue-500 shrink-0" />
              )}

              {renamingNodeId === node.id ? (
                <div className="flex items-center space-x-1 flex-1">
                  <input
                    type="text"
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename(node.id);
                      if (e.key === 'Escape') setRenamingNodeId(null);
                    }}
                    autoFocus
                    className="px-1.5 py-0.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white flex-1"
                  />
                  <button 
                    onClick={() => handleSaveRename(node.id)}
                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <span className="truncate text-gray-800 dark:text-gray-200 font-medium">
                  {node.name}
                </span>
              )}
            </div>

            {/* Right: Touch-friendly Controls */}
            <div className="flex items-center space-x-1 shrink-0">
              {/* Move Up */}
              <button
                disabled={!canMoveUp}
                onClick={() => handleMoveUp(node)}
                title="위로 이동"
                className={`p-1.5 rounded transition-colors ${
                  canMoveUp 
                    ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300' 
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <ArrowUp size={16} />
              </button>

              {/* Move Down */}
              <button
                disabled={!canMoveDown}
                onClick={() => handleMoveDown(node)}
                title="아래로 이동"
                className={`p-1.5 rounded transition-colors ${
                  canMoveDown 
                    ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300' 
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <ArrowDown size={16} />
              </button>

              {/* Outdent */}
              <button
                disabled={!canOutdent}
                onClick={() => handleOutdent(node)}
                title="상위 레벨로 내보내기 (Outdent)"
                className={`p-1.5 rounded transition-colors ${
                  canOutdent 
                    ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300' 
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <CornerUpLeft size={16} />
              </button>

              {/* Move to Folder Picker */}
              <button
                onClick={() => setMovePickerNode(node)}
                title="특정 폴더로 이동"
                className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded active:bg-blue-100"
              >
                <FolderInput size={16} />
              </button>

              {/* Rename */}
              <button
                onClick={() => handleStartRename(node)}
                title="이름 변경"
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              >
                <Edit2 size={14} />
              </button>

              {/* Delete */}
              <button
                onClick={() => {
                  if (confirm(`'${node.name}'을(를) 휴지통으로 이동하시겠습니까?`)) {
                    onDeleteNode(node.id);
                  }
                }}
                title="휴지통으로 이동"
                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Children if folder */}
        {isFolder && isExpanded && node.children && (
          <div className="flex flex-col">
            {node.children.map(child => renderTreeItem(child, depth + 1, node.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full ${activeTab === 'snapshots' ? 'max-w-4xl' : 'max-w-2xl'} max-h-[90vh] flex flex-col relative animate-in fade-in zoom-in duration-200 border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-150`}>
        
        {/* Modal Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Settings</h3>
            {/* Tab Buttons */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 text-xs font-medium">
              <button
                onClick={() => setActiveTab('general')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'general'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Sliders size={14} />
                <span>일반 설정</span>
              </button>
              <button
                onClick={() => setActiveTab('hierarchy')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'hierarchy'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <FolderTree size={14} />
                <span>위계 및 순서 관리</span>
              </button>
              <button
                onClick={() => setActiveTab('snapshots')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'snapshots'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <History size={14} />
                <span>스냅샷</span>
              </button>
              <button
                onClick={() => setActiveTab('backup')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'backup'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Archive size={14} />
                <span>데이터 백업/복원</span>
              </button>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' ? (
            <div className="space-y-5 max-w-md mx-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  App Title
                </label>
                <input
                  type="text"
                  value={localSettings.title}
                  onChange={(e) => setLocalSettings({ ...localSettings, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Logo Text (1-2 chars)
                </label>
                <input
                  type="text"
                  maxLength={2}
                  value={localSettings.logo}
                  onChange={(e) => setLocalSettings({ ...localSettings, logo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Dark Mode</span>
                  <span className="text-xs text-gray-400">어두운 테마 활성화</span>
                </div>
                <button
                  onClick={() => setLocalSettings({ ...localSettings, darkMode: !localSettings.darkMode })}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${localSettings.darkMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${localSettings.darkMode ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">형광펜 대비</span>
                  <span className="text-xs text-gray-400">기본 (0.5/0.65/0.8) · 고대비 (0.8/0.88/0.95)</span>
                </div>
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 text-xs font-medium">
                  {(['standard', 'high'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setLocalSettings({ ...localSettings, contrast: level })}
                      className={`px-3 py-1.5 rounded-md transition-all ${
                        (localSettings.contrast ?? 'standard') === level
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm font-semibold'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      {level === 'standard' ? '기본' : '고대비'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'hierarchy' ? (
            <div className="flex flex-col h-full space-y-3">
              {/* Hierarchy Header info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-blue-50/70 dark:bg-blue-900/20 px-3.5 py-2.5 rounded-lg border border-blue-100 dark:border-blue-800/40 text-xs text-blue-800 dark:text-blue-300">
                <p>
                  💡 <strong>버튼 제어 안내:</strong> 순서 변경(<kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 rounded border border-blue-200 dark:border-blue-700 font-mono">↑</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 rounded border border-blue-200 dark:border-blue-700 font-mono">↓</kbd>), 상위로 내보내기(<kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 rounded border border-blue-200 dark:border-blue-700 font-mono">←</kbd>), 폴더 지정 이동(<kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 rounded border border-blue-200 dark:border-blue-700 font-mono">📁</kbd>)
                </p>
                <div className="flex items-center space-x-1 shrink-0">
                  <button 
                    onClick={() => {
                      const all = new Set<string>();
                      const collect = (nodes: FileSystemNode[]) => {
                        nodes.forEach(n => { if (n.type === 'folder') { all.add(n.id); if (n.children) collect(n.children); } });
                      };
                      collect(fileSystem);
                      setExpandedFolders(all);
                    }}
                    className="px-2 py-1 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 border border-blue-200 dark:border-blue-800"
                  >
                    모두 펼치기
                  </button>
                  <button 
                    onClick={() => setExpandedFolders(new Set())}
                    className="px-2 py-1 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 border border-blue-200 dark:border-blue-800"
                  >
                    모두 접기
                  </button>
                </div>
              </div>

              {/* Filter / Search input */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="항목 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-750 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Tree list */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 max-h-[50vh] overflow-y-auto bg-white dark:bg-gray-850">
                {fileSystem.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    등록된 노트나 폴더가 없습니다.
                  </div>
                ) : (
                  fileSystem.map(node => renderTreeItem(node, 0, undefined))
                )}
              </div>
            </div>
          ) : activeTab === 'snapshots' ? (
            /* Snapshots Tab */
            <div className="flex flex-col h-full space-y-3">
              {/* Note Selector & Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 dark:bg-gray-750 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <FileText size={16} className="text-blue-500 shrink-0" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 shrink-0">대상 노트:</span>
                  <select
                    value={selectedNoteId || ''}
                    onChange={(e) => setSelectedNoteId(e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {allNotes.length === 0 ? (
                      <option value="">등록된 노트 없음</option>
                    ) : (
                      allNotes.map(n => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0 flex items-center gap-1">
                  <History size={13} className="text-gray-400" />
                  <span>20분 간격 / 최대 20개 자동 보관</span>
                </div>
              </div>

              {/* Main 2-Column Split: Snapshots List (Left) + Plaincode Viewer (Right) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 h-[48vh] min-h-[320px]">
                {/* Left Column: Snapshots List */}
                <div className="md:col-span-4 border border-gray-200 dark:border-gray-700 rounded-lg p-2 overflow-y-auto bg-gray-50/50 dark:bg-gray-850 flex flex-col space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center justify-between">
                    <span>스냅샷 목록</span>
                    <span className="text-gray-400 font-normal">{snapshots.length}개</span>
                  </div>

                  {isLoadingSnapshots ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-gray-400 py-8">
                      <Loader2 size={16} className="animate-spin mr-1.5" />
                      <span>목록 로딩 중...</span>
                    </div>
                  ) : snapshots.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-gray-400 p-6">
                      <History size={24} className="text-gray-300 dark:text-gray-600 mb-2" />
                      <p>보관된 스냅샷이 없습니다.</p>
                      <p className="text-[10px] text-gray-400 mt-1">수정 간격 20분 이상 경과 시 자동 보관됩니다.</p>
                    </div>
                  ) : (
                    snapshots.map((snap) => {
                      const isSelected = selectedSnapshotFilename === snap.filename;
                      return (
                        <button
                          key={snap.filename}
                          onClick={() => setSelectedSnapshotFilename(snap.filename)}
                          className={`w-full text-left p-2 rounded-md transition-all text-xs flex flex-col gap-0.5 border ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 shadow-xs'
                              : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300'
                          }`}
                        >
                          <div className="font-mono font-medium truncate flex items-center justify-between">
                            <span>{formatSnapshotLabel(snap.filename, snap.timestamp)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
                            <span className="truncate">{snap.filename}</span>
                            <span>{formatFileSize(snap.size)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Right Column: Plaincode Viewer */}
                <div className="md:col-span-8 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
                  {/* Viewer Header */}
                  <div className="px-3.5 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-850 shrink-0">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                        {selectedSnapshotFilename ? selectedSnapshotFilename : '선택된 스냅샷 없음'}
                      </span>
                      {snapshotContent && (
                        <span className="text-[10px] text-gray-400 font-mono">
                          ({snapshotContent.length.toLocaleString()}자)
                        </span>
                      )}
                    </div>

                    {snapshotContent && (
                      <button
                        onClick={handleCopySnapshot}
                        className={`flex items-center space-x-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                          copySuccess
                            ? 'bg-green-600 text-white shadow-xs'
                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {copySuccess ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copySuccess ? '복사됨!' : '전체 복사'}</span>
                      </button>
                    )}
                  </div>

                  {/* Viewer Body */}
                  <div className="flex-1 p-2 relative overflow-hidden flex flex-col">
                    {isLoadingContent ? (
                      <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                        <Loader2 size={16} className="animate-spin mr-1.5" />
                        <span>본문 로딩 중...</span>
                      </div>
                    ) : !selectedSnapshotFilename ? (
                      <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                        좌측에서 스냅샷을 선택하면 마크다운 원본 코드가 표시됩니다.
                      </div>
                    ) : (
                      <textarea
                        readOnly
                        value={snapshotContent}
                        placeholder="스냅샷 내용이 비어 있습니다."
                        className="w-full h-full p-2.5 text-xs font-mono bg-transparent text-gray-800 dark:text-gray-200 resize-none focus:outline-none select-text leading-relaxed"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'backup' ? (
            <div className="space-y-6 max-w-lg mx-auto py-2">
              {/* Status Banner */}
              {importStatusMessage && (
                <div
                  className={`p-3.5 rounded-lg text-xs flex items-start space-x-2.5 animate-in fade-in duration-200 ${
                    importStatusMessage.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">{importStatusMessage.text}</div>
                </div>
              )}

              {/* Card 1: Export ZIP */}
              <div className="p-5 bg-gray-50 dark:bg-gray-750 rounded-xl border border-gray-200/80 dark:border-gray-700 space-y-3">
                <div className="flex items-center space-x-2.5 text-gray-900 dark:text-white font-semibold">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
                    <Download size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">오프라인 데이터 백업 (ZIP 내보내기)</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                      현재 워크스페이스의 모든 노트, 계층 트리, 설정 파일을 하나의 압축 파일로 다운로드합니다.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleExportZip}
                    disabled={isExporting}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>ZIP 압축 파일 생성 중...</span>
                      </>
                    ) : (
                      <>
                        <Download size={15} />
                        <span>전체 워크스페이스 ZIP 백업 다운로드</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Card 2: Import ZIP */}
              <div className="p-5 bg-gray-50 dark:bg-gray-750 rounded-xl border border-gray-200/80 dark:border-gray-700 space-y-3">
                <div className="flex items-center space-x-2.5 text-gray-900 dark:text-white font-semibold">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-lg">
                    <Upload size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">오프라인 데이터 복원 (ZIP 가져오기)</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                      이전에 백업해 둔 ZIP 파일을 선택하여 로컬 워크스페이스를 복원합니다.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-lg border border-amber-200/60 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start space-x-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>
                    주의: 복원 시 현재 로컬의 모든 워크스페이스 데이터가 백업 파일의 내용으로 완전히 교체됩니다. 중요한 노트는 먼저 백업해 두세요.
                  </span>
                </div>

                <input
                  type="file"
                  ref={zipInputRef}
                  onChange={handleImportZipFile}
                  accept=".zip,application/zip"
                  className="hidden"
                />

                <div className="pt-2">
                  <button
                    onClick={() => zipInputRef.current?.click()}
                    disabled={isImporting}
                    className="w-full py-2.5 px-4 bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>ZIP 압축 해제 및 복원 진행 중...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={15} />
                        <span>백업 ZIP 파일 선택하여 복원하기</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        
        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-850 shrink-0">
          <div className="flex items-center space-x-2">
            <span>NoteSpace System</span>
            <span className="font-mono px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
              {APP_VERSION}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors font-medium"
            >
              닫기
            </button>
            {activeTab === 'general' && (
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                변경사항 저장
              </button>
            )}
          </div>
        </div>

        {/* Destination Folder Picker Modal (Nested) */}
        {movePickerNode && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-700 flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center space-x-2 text-gray-900 dark:text-white font-semibold">
                  <FolderInput size={18} className="text-blue-500" />
                  <span className="truncate">'{movePickerNode.name}' 이동할 폴더 선택</span>
                </div>
                <button 
                  onClick={() => setMovePickerNode(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="py-3 flex-1 overflow-y-auto space-y-1">
                {/* Option: Root Level */}
                <button
                  onClick={() => {
                    onMoveNode(movePickerNode.id, undefined);
                    setMovePickerNode(null);
                  }}
                  className={`w-full flex items-center px-3 py-2 text-sm rounded-lg text-left transition-colors ${
                    !movePickerNode.parentId 
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold' 
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  <span className="w-5 text-gray-400">🏠</span>
                  <span className="font-medium">[최상위 루트]</span>
                  {!movePickerNode.parentId && <span className="ml-auto text-xs text-blue-600 font-normal">현재 위치</span>}
                </button>

                {/* Option: Folders in Tree */}
                {getEligibleFolders(movePickerNode).map(f => (
                  <button
                    key={f.id}
                    onClick={() => {
                      onMoveNode(movePickerNode.id, f.id);
                      setMovePickerNode(null);
                    }}
                    className={`w-full flex items-center px-3 py-2 text-sm rounded-lg text-left transition-colors ${
                      movePickerNode.parentId === f.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}
                    style={{ paddingLeft: `${f.depth * 16 + 12}px` }}
                  >
                    <Folder size={16} className="mr-2 text-amber-500 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    {movePickerNode.parentId === f.id && <span className="ml-auto text-xs text-blue-600 font-normal">현재 폴더</span>}
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => setMovePickerNode(null)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default SettingsModal;
