import React, { useState, useRef, useEffect } from 'react';
import {
    MoreHorizontal, Sparkles, LayoutPanelLeft, Edit3, Eye, Code, Upload, Send, Paperclip,
    Trash2, Download, Printer, FolderInput, Folder, X, File, Settings, Server, Layers,
    Check, AlertCircle, Archive
} from 'lucide-react';
import { FileSystemNode, SaveStatusInfo, SaveStatusState, TopBarNotification } from '../types';
import { storageService } from '../services/storageService';
import { getAiEndpoints, AiEndpoint } from '../services/geminiService';
import { collectFolders, isDescendant } from '../services/tree-model';

interface TopBarProps {
    node: FileSystemNode | null;
    breadcrumbs: FileSystemNode[];
    onAiAction: (prompt: string, files?: { mimeType: string, data: string }[], endpointId?: string | number, model?: string, excludeContent?: boolean) => void;
    onGenerateSuggestions?: () => Promise<string[]>;
    isAiLoading: boolean;
    onToggleSidebar: () => void;
    onDelete: () => void;
    fileSystem: FileSystemNode[]; // Full tree to pick folders from
    onMoveNode: (nodeId: string, targetFolderId: string | undefined) => void;
    saveStatus: SaveStatusInfo | string;
    notifications?: TopBarNotification[];
    editorMode: 'wysiwyg' | 'raw' | 'viewer';
    onSetEditorMode: (mode: 'wysiwyg' | 'raw' | 'viewer') => void;
    onOpenSettings: () => void;
    onOpenAiEndpointSettings?: () => void;
    onPrint?: () => void;
    zoomLevel: number;
    setZoomLevel: (zoom: number) => void;
}

const TopBar: React.FC<TopBarProps> = ({
    node, breadcrumbs, onAiAction, isAiLoading, onToggleSidebar,
    onDelete, fileSystem, onMoveNode, saveStatus, notifications = [], editorMode, onSetEditorMode, onOpenSettings,
    onOpenAiEndpointSettings, onPrint, zoomLevel, setZoomLevel
}) => {
    const [showAiMenu, setShowAiMenu] = useState(false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    const [showModeMenu, setShowModeMenu] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');
    const [attachments, setAttachments] = useState<{ mimeType: string, data: string, name: string }[]>([]);
    const [endpoints, setEndpoints] = useState<AiEndpoint[]>([]);
    const [selectedEndpointId, setSelectedEndpointId] = useState<string | number>('');
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [excludeContent, setExcludeContent] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const zipUploadInputRef = useRef<HTMLInputElement>(null);

    // Fetch endpoints when menu opens
    useEffect(() => {
        if (showAiMenu) {
            getAiEndpoints().then(data => {
                const list = data.answer_endpoints || [];
                setEndpoints(list);
                if (list.length > 0) {
                    const currentEp = list.find(e => String(e.id) === String(selectedEndpointId)) || list[0];
                    setSelectedEndpointId(currentEp.id);
                    const models = currentEp.models || [];
                    if (!selectedModel || !models.includes(selectedModel)) {
                        setSelectedModel(models[0] || '');
                    }
                }
            }).catch(e => console.error("Failed to fetch endpoints", e));
        }
    }, [showAiMenu]);

    const activeEndpoint = endpoints.find(e => String(e.id) === String(selectedEndpointId)) || endpoints[0];
    const availableModels = activeEndpoint?.models || [];

    const handleEndpointChange = (epId: string) => {
        setSelectedEndpointId(epId);
        const ep = endpoints.find(e => String(e.id) === String(epId));
        if (ep && ep.models && ep.models.length > 0) {
            setSelectedModel(ep.models[0]);
        } else {
            setSelectedModel('');
        }
    };

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.ai-menu-container')) {
                setShowAiMenu(false);
            }
            if (!target.closest('.options-menu-container') && !showMoveModal) {
                setShowOptionsMenu(false);
            }
            if (!target.closest('.mode-menu-container')) {
                setShowModeMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMoveModal]);

    const handleAiClick = (prompt: string) => {
        onAiAction(prompt, attachments, selectedEndpointId, selectedModel, excludeContent);
        setCustomPrompt('');
        setAttachments([]);
        setShowAiMenu(false);
    };

    const processFile = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];

            let mimeType = file.type;
            if (!mimeType || mimeType.trim() === '') {
                const name = file.name.toLowerCase();
                if (name.endsWith('.pdf')) {
                    mimeType = 'application/pdf';
                } else if (name.endsWith('.png')) {
                    mimeType = 'image/png';
                } else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
                    mimeType = 'image/jpeg';
                } else if (name.endsWith('.webp')) {
                    mimeType = 'image/webp';
                } else if (name.endsWith('.gif')) {
                    mimeType = 'image/gif';
                }
            }

            setAttachments(prev => [...prev, {
                mimeType: mimeType || 'application/pdf',
                data: base64String,
                name: file.name
            }]);
        };
        reader.readAsDataURL(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const handleExportMarkdown = async () => {
        if (!node) return;
        try {
            const content = await storageService.getContent(node.id);
            const element = document.createElement("a");
            const file = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' });
            element.href = URL.createObjectURL(file);
            element.download = `${node.name}.md`;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        } catch (e) {
            console.error("Failed to export markdown", e);
        } finally {
            setShowOptionsMenu(false);
        }
    }

    const handleExportPDF = () => {
        setShowOptionsMenu(false);
        if (onPrint) {
            onPrint();
        } else {
            setTimeout(() => {
                window.print();
            }, 100);
        }
    }

    const handleExportWorkspaceZip = async () => {
        setShowOptionsMenu(false);
        try {
            const blob = await storageService.exportWorkspaceZip();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
            a.href = url;
            a.download = `notespace_backup_${dateStr}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e: any) {
            console.error("Failed to export workspace zip", e);
            alert("워크스페이스 백업에 실패했습니다: " + (e?.message || "알 수 없는 오류"));
        }
    };

    const handleImportWorkspaceZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm(`'${file.name}' 백업 파일로 워크스페이스를 복원하시겠습니까?\n\n주의: 기존 로컬 워크스페이스 데이터가 완전히 교체됩니다.`)) {
            if (zipUploadInputRef.current) zipUploadInputRef.current.value = '';
            return;
        }

        try {
            const ok = await storageService.importWorkspaceZip(file);
            if (ok) {
                alert("복원이 완료되었습니다. 화면을 새로고침합니다.");
                window.location.reload();
            } else {
                alert("백업 파일 형식이 올바르지 않거나 복원에 실패했습니다.");
            }
        } catch (err: any) {
            alert("복원 실패: " + (err.message || '알 수 없는 오류'));
        } finally {
            if (zipUploadInputRef.current) zipUploadInputRef.current.value = '';
            setShowOptionsMenu(false);
        }
    };

    const handleDelete = () => {
        if (!node) return;
        if (window.confirm(`Are you sure you want to delete "${node.name}"?`)) {
            onDelete();
        }
        setShowOptionsMenu(false);
    }

    // --- Move Logic ---
    // 현 노드 + 자손 제외는 이동 대화상자 정책이라 호출자에 둔다 (D4)
    const availableFolders = collectFolders(fileSystem).filter(f => !node || (f.id !== node.id && !isDescendant(node, f.id)));

    const renderSaveIndicator = () => {
        const info: SaveStatusInfo = typeof saveStatus === 'string'
            ? { 
                state: (saveStatus as SaveStatusState), 
                message: saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '저장됨' : '' 
              }
            : saveStatus;

        if (info.state === 'idle') return null;

        switch (info.state) {
            case 'version':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200/70 dark:border-blue-700/60 shadow-xs transition-all duration-300 animate-in fade-in"
                        title="현재 빌드 버전"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        {info.message}
                    </span>
                );
            case 'saving':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-700/60 shadow-xs transition-all duration-300 animate-in fade-in"
                        title="변경 사항 저장 중"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {info.message || '저장 중...'}
                    </span>
                );
            case 'error':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-300 border border-red-200/80 dark:border-red-700/70 shadow-xs transition-all duration-300 animate-in fade-in"
                        title="저장 또는 요청 실패"
                    >
                        <AlertCircle size={12} className="text-red-500" />
                        {info.message || '저장 실패'}
                    </span>
                );
            case 'ai_generating':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-700/60 shadow-xs transition-all duration-300 animate-in fade-in"
                        title="AI 생성 작업 진행 중"
                    >
                        <Sparkles size={12} className="text-purple-500 animate-spin" />
                        {info.message || 'AI 생성 중...'}
                    </span>
                );
            case 'ai_success':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-700/60 shadow-xs transition-all duration-300 animate-in fade-in"
                        title="AI 생성 완료"
                    >
                        <Sparkles size={12} className="text-purple-500" />
                        {info.message || 'AI 생성 완료'}
                    </span>
                );
            case 'saved':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-gray-400 dark:text-gray-500 transition-all duration-300 hover:text-gray-600 dark:hover:text-gray-300 animate-in fade-in"
                        title="모든 변경 사항이 저장되었습니다"
                    >
                        <Check size={12} className="text-emerald-500" />
                        {info.message || '저장됨'}
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="topbar-sticky h-12 shrink-0 flex items-center justify-between px-4 sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm z-20 border-b border-transparent hover:border-gray-100 dark:hover:border-gray-800 transition-colors no-print">
            <div className="flex items-center space-x-2 overflow-hidden flex-1 mr-4">
                <button
                    onClick={onToggleSidebar}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300 flex-shrink-0 mr-1"
                    title="Toggle Sidebar"
                >
                    <LayoutPanelLeft size={18} />
                </button>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">
                    {breadcrumbs && breadcrumbs.length > 0 ? (
                        breadcrumbs.map((crumb, index) => {
                            const isLast = index === breadcrumbs.length - 1;
                            return (
                                <React.Fragment key={crumb.id}>
                                    {index > 0 && <span className="mr-1 text-gray-400 hidden sm:inline">/</span>}
                                    <span 
                                        className={`mr-1 truncate ${
                                            isLast 
                                                ? 'font-medium text-[#191919] dark:text-gray-100' 
                                                : 'hidden sm:inline'
                                        }`}
                                    >
                                        {crumb.name}
                                    </span>
                                </React.Fragment>
                            );
                        })
                    ) : (
                        <span className="font-semibold text-gray-700 dark:text-gray-200 mr-2">NoteSpace</span>
                    )}
                    <span className="ml-2 flex-shrink-0 flex items-center space-x-1.5">
                        {renderSaveIndicator()}
                        {notifications && notifications.map(notif => {
                            if (notif.type === 'ai_loading') {
                                return (
                                    <span 
                                        key={notif.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-700/60 shadow-xs animate-in fade-in zoom-in-95 duration-200"
                                        title="AI 작업 중"
                                    >
                                        <Sparkles size={11} className="text-purple-500 animate-spin" />
                                        {notif.message}
                                    </span>
                                );
                            }
                            if (notif.type === 'ai_success') {
                                return (
                                    <span 
                                        key={notif.id}
                                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-700/60 shadow-xs animate-in fade-in zoom-in-95 duration-200"
                                        title="AI 완료"
                                    >
                                        <Sparkles size={11} className="text-purple-500" />
                                        {notif.message}
                                    </span>
                                );
                            }
                            if (notif.type === 'tree_saved') {
                                return (
                                    <span 
                                        key={notif.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-700/60 shadow-xs animate-in fade-in zoom-in-95 duration-200"
                                        title="구조 저장 완료"
                                    >
                                        <Folder size={11} className="text-blue-500" />
                                        {notif.message}
                                    </span>
                                );
                            }
                            if (notif.type === 'tree_error' || notif.type === 'ai_error') {
                                return (
                                    <span 
                                        key={notif.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-700/60 shadow-xs animate-in fade-in zoom-in-95 duration-200"
                                        title="오류"
                                    >
                                        <AlertCircle size={11} className="text-red-500" />
                                        {notif.message}
                                    </span>
                                );
                            }
                            return (
                                <span 
                                    key={notif.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-xs animate-in fade-in zoom-in-95 duration-200"
                                >
                                    {notif.message}
                                </span>
                            );
                        })}
                    </span>
                </div>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
                {/* Settings Button */}
                <button
                    onClick={onOpenSettings}
                    className="p-1 rounded text-sm font-medium text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Settings"
                >
                    <Settings size={18} />
                </button>

                {node && (
                    <>
                        {/* Edit Mode Toggle Popover */}
                <div className="relative mode-menu-container">
                    <button
                        onClick={() => setShowModeMenu(!showModeMenu)}
                        className={`p-1.5 rounded-lg text-sm font-medium transition-colors border ${
                            showModeMenu
                                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400'
                                : 'bg-gray-100/80 dark:bg-gray-800 hover:bg-gray-200/80 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400 border-gray-200/50 dark:border-gray-750'
                        }`}
                        title="편집 모드 전환 (Visual / Viewer / Raw)"
                    >
                        {editorMode === 'wysiwyg' && <Edit3 size={16} />}
                        {editorMode === 'viewer' && <Eye size={16} />}
                        {editorMode === 'raw' && <Code size={16} />}
                    </button>

                    {showModeMenu && (
                        <div className="absolute right-0 top-full mt-1.5 p-1 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 flex items-center space-x-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                            <button
                                onClick={() => {
                                    onSetEditorMode('wysiwyg');
                                    setShowModeMenu(false);
                                }}
                                className={`p-2 rounded-xl text-sm transition-all ${
                                    editorMode === 'wysiwyg'
                                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-xs'
                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                                title="Visual Editor (위지윅 편집기)"
                            >
                                <Edit3 size={16} />
                            </button>
                            <button
                                onClick={() => {
                                    onSetEditorMode('viewer');
                                    setShowModeMenu(false);
                                }}
                                className={`p-2 rounded-xl text-sm transition-all ${
                                    editorMode === 'viewer'
                                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-xs'
                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                                title="Read-only Viewer (읽기 전용 뷰어)"
                            >
                                <Eye size={16} />
                            </button>
                            <button
                                onClick={() => {
                                    onSetEditorMode('raw');
                                    setShowModeMenu(false);
                                }}
                                className={`p-2 rounded-xl text-sm transition-all ${
                                    editorMode === 'raw'
                                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shadow-xs'
                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                                title="Raw Markdown (마크다운 소스)"
                            >
                                <Code size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* AI Button */}
                <div className="relative ai-menu-container">
                    <button
                        onClick={() => setShowAiMenu(!showAiMenu)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (onOpenAiEndpointSettings) {
                                onOpenAiEndpointSettings();
                            }
                        }}
                        disabled={isAiLoading}
                        className={`p-1 rounded text-sm font-medium transition-colors
                            ${isAiLoading
                                ? 'text-gray-400 cursor-wait'
                                : 'text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                            }
                        `}
                        title="AI 메뉴 (좌클릭) / AI 엔드포인트 설정 (우클릭)"
                    >
                        <Sparkles size={18} className={isAiLoading ? "animate-pulse" : ""} />
                    </button>

                    {showAiMenu && (
                        <div className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden py-1 z-50">
                            <div className="p-3">

                                {/* Dual Dropdown Section (Endpoint -> Model) */}
                                <div className="mb-3 p-2.5 bg-gray-50 dark:bg-gray-750 rounded-xl border border-gray-200/80 dark:border-gray-700 space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 dark:text-gray-200">
                                        <span className="flex items-center gap-1.5">
                                            <Server size={13} className="text-purple-600 dark:text-purple-400" />
                                            엔드포인트 & 모델 선택
                                        </span>
                                        {onOpenAiEndpointSettings && (
                                            <button
                                                onClick={() => {
                                                    setShowAiMenu(false);
                                                    onOpenAiEndpointSettings();
                                                }}
                                                className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
                                            >
                                                관리
                                            </button>
                                        )}
                                    </div>

                                    {/* 1. Endpoint Selector */}
                                    <div>
                                        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                                            1. 엔드포인트 선택
                                        </label>
                                        <select
                                            value={String(selectedEndpointId)}
                                            onChange={e => handleEndpointChange(e.target.value)}
                                            className="w-full text-xs font-semibold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 outline-none focus:border-purple-500 transition-colors"
                                        >
                                            {endpoints.map(ep => (
                                                <option key={ep.id} value={String(ep.id)}>
                                                    {ep.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 2. Model Selector */}
                                    <div>
                                        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 flex items-center justify-between">
                                            <span>2. 모델 선택 (1순위)</span>
                                            <span className="text-[9px] text-purple-600 dark:text-purple-400 font-normal">* 실패시 하위 모델로 순차 폴백</span>
                                        </label>
                                        <select
                                            value={selectedModel}
                                            onChange={e => setSelectedModel(e.target.value)}
                                            className="w-full text-xs font-mono font-semibold bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 outline-none focus:border-purple-500 transition-colors"
                                        >
                                            {availableModels.map(m => (
                                                <option key={m} value={m}>
                                                    {m}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="h-[1px] bg-gray-100 dark:bg-gray-700 my-2.5"></div>

                                {/* Attachment Zone */}
                                <div
                                    className={`
                                        border-2 border-dashed rounded-lg p-3 mb-2.5 text-center transition-colors cursor-pointer
                                        ${isDragging ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}
                                    `}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="flex flex-col items-center justify-center text-gray-400 space-y-0.5">
                                        <Upload size={18} />
                                        <span className="text-[11px]">파일 첨부 (이미지 / PDF)</span>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        onChange={handleFileChange}
                                        accept="image/*,text/*,application/pdf,.pdf"
                                    />
                                </div>

                                {attachments.length > 0 && (
                                    <div className="mb-2.5 space-y-1 max-h-24 overflow-y-auto">
                                        {attachments.map((att, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1.5 rounded text-gray-700 dark:text-gray-200">
                                                <div className="flex items-center truncate">
                                                    <File size={12} className="mr-2 text-gray-500" />
                                                    <span className="truncate max-w-[180px]">{att.name}</span>
                                                </div>
                                                <button
                                                    onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                                    className="text-gray-400 hover:text-red-500 ml-2"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1 border border-transparent focus-within:border-purple-200 dark:focus-within:border-purple-800 focus-within:ring-2 focus-within:ring-purple-100 dark:focus-within:ring-purple-900">
                                    <input
                                        type="text"
                                        placeholder="AI에게 질문 또는 프롬프트 입력..."
                                        className="bg-transparent border-none outline-none text-xs w-full py-1.5 text-gray-900 dark:text-white placeholder-gray-400"
                                        value={customPrompt}
                                        onChange={(e) => setCustomPrompt(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && customPrompt.trim()) {
                                                handleAiClick(customPrompt);
                                            }
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        className="p-1.5 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 rounded hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-colors shrink-0"
                                        onClick={() => customPrompt.trim() && handleAiClick(customPrompt)}
                                    >
                                        <Send size={14} />
                                    </button>
                                </div>

                                <label
                                    className="flex items-center gap-1.5 mt-2 cursor-pointer select-none"
                                    title="체크 시 현재 노트 내용 없이 작성한 질문만 AI에 전송됩니다"
                                >
                                    <input
                                        type="checkbox"
                                        checked={excludeContent}
                                        onChange={(e) => setExcludeContent(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer"
                                    />
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                        노트 내용 반영 해제하기
                                    </span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1 sm:mx-2"></div>

                {/* Zoom Controls */}
                <div className="flex items-center space-x-1 mr-1 text-sm text-gray-500 dark:text-gray-400">
                    <button
                        onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        title="Zoom Out"
                    >
                        -
                    </button>
                    <span className="w-10 text-center font-mono text-[11px]">{zoomLevel}%</span>
                    <button
                        onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        title="Zoom In"
                    >
                        +
                    </button>
                </div>

                <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1 sm:mx-2"></div>


                <div className="relative options-menu-container">
                    <button
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 transition-colors"
                        onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                    >
                        <MoreHorizontal size={18} />
                    </button>

                    {showOptionsMenu && (
                        <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden py-1 z-50">
                            <button
                                onClick={handleExportMarkdown}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                            >
                                <Download size={14} className="mr-2" />
                                Export Markdown
                            </button>
                            <button
                                onClick={handleExportPDF}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                            >
                                <Printer size={14} className="mr-2" />
                                Export PDF
                            </button>
                            <div className="h-[1px] bg-gray-100 dark:bg-gray-700 my-1"></div>
                            <button
                                onClick={handleExportWorkspaceZip}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                                title="전체 워크스페이스를 ZIP 파일로 백업"
                            >
                                <Archive size={14} className="mr-2 text-blue-500" />
                                Export Workspace (ZIP)
                            </button>
                            <button
                                onClick={() => zipUploadInputRef.current?.click()}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                                title="ZIP 백업 파일로 워크스페이스 복원"
                            >
                                <Upload size={14} className="mr-2 text-amber-500" />
                                Import Workspace (ZIP)
                            </button>
                            <input
                                type="file"
                                ref={zipUploadInputRef}
                                onChange={handleImportWorkspaceZip}
                                accept=".zip,application/zip"
                                className="hidden"
                            />
                            <div className="h-[1px] bg-gray-100 dark:bg-gray-700 my-1"></div>
                            <button
                                onClick={() => { setShowMoveModal(true); setShowOptionsMenu(false); }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                            >
                                <FolderInput size={14} className="mr-2" />
                                Move to...
                            </button>
                            <button
                                onClick={() => { onOpenSettings(); setShowOptionsMenu(false); }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                            >
                                <Settings size={14} className="mr-2" />
                                Settings
                            </button>
                            <div className="h-[1px] bg-gray-100 dark:bg-gray-700 my-1"></div>
                            <button
                                onClick={handleDelete}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                            >
                                <Trash2 size={14} className="mr-2" />
                                Delete
                            </button>
                        </div>
                    )}
                </div>
                    </>
                )}
            </div>

            {/* Move Modal */}
            {showMoveModal && node && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-xs max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-3 border-b border-gray-100 dark:border-gray-700 font-medium text-gray-800 dark:text-gray-200 flex justify-between items-center">
                            <span>Move to...</span>
                            <button onClick={() => setShowMoveModal(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"><X size={16} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <button
                                onClick={() => { onMoveNode(node.id, undefined); setShowMoveModal(false); }}
                                className={`w-full text-left px-3 py-2 text-sm rounded flex items-center ${!node.parentId ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-default' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                                disabled={!node.parentId}
                            >
                                <span className="mr-2">🏠</span> Workspace Root
                            </button>
                            {availableFolders.map(folder => (
                                <button
                                    key={folder.id}
                                    onClick={() => { onMoveNode(node.id, folder.id); setShowMoveModal(false); }}
                                    className={`w-full text-left px-3 py-2 text-sm rounded flex items-center ${node.parentId === folder.id ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-default' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                                    disabled={node.parentId === folder.id}
                                >
                                    <Folder size={14} className="mr-2 text-gray-400" />
                                    <span className="truncate">{folder.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TopBar;
