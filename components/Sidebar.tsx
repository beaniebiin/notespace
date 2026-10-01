import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileSystemNode, SidebarView, Tag, TagColor, AppSettings } from '../types';
import {
  ChevronRight, ChevronDown, FileText, Folder, FolderOpen,
  Plus, Trash2, Search, RotateCcw, FolderPlus, Edit2, Tags, GripVertical,
  X, Loader2
} from 'lucide-react';
import { storageService } from '../services/storageService';
import { TAG_COLORS } from '../constants';
import { findNode, findPath, findParentAndIndex, isDescendant } from '../services/tree-model';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface DropTargetInfo {
  targetId: string;
  position: 'before' | 'after' | 'inside';
}

export interface SearchResultItem {
  id: string;
  title: string;
  snippet: string;
  matchType: 'title' | 'content' | 'both';
  path?: string;
  score?: number;
  matchedCount?: number;
  totalCount?: number;
}

const HighlightMatch: React.FC<{ text: string; query: string; className?: string }> = ({ text, query, className }) => {
  if (!query.trim() || !text) return <span className={className}>{text}</span>;

  // 1. 단어 토큰 및 조사 분리 어근 추출
  const rawTokens = query.trim().split(/\s+/).filter(Boolean);
  const tokenSet = new Set<string>();

  rawTokens.forEach(tok => {
    tokenSet.add(tok);
    const particles = ['에서', '에게', '으로', '부터', '까지', '보다', '처럼', '에는', '에도', '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만'];
    for (const p of particles) {
      if (tok.length > p.length + 1 && tok.endsWith(p)) {
        tokenSet.add(tok.slice(0, -p.length));
        break;
      }
    }
  });

  // 2. 공백 제거 구문 추가
  if (rawTokens.length > 1) {
    tokenSet.add(rawTokens.join(''));
  }

  // 3. 글자 수 내림차순 정렬 (긴 구문 우선 매칭)
  const sortedTokens = Array.from(tokenSet)
    .filter(t => t.length >= 1)
    .sort((a, b) => b.length - a.length);

  if (sortedTokens.length === 0) return <span className={className}>{text}</span>;

  const escaped = sortedTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  const lowerTokens = new Set(sortedTokens.map(t => t.toLowerCase()));

  return (
    <span className={className}>
      {parts.map((part, i) =>
        lowerTokens.has(part.toLowerCase()) ? (
          <mark
            key={i}
            className="bg-amber-200 dark:bg-amber-500/40 text-amber-950 dark:text-amber-100 font-bold px-0.5 rounded-xs"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
};

interface SidebarProps {
  nodes: FileSystemNode[];
  activeNoteId: string | null;
  currentView: SidebarView;
  onChangeView: (view: SidebarView) => void;
  onSelectNote: (note: FileSystemNode) => void;
  onCreateNode: (parentId: string | undefined, type: 'note' | 'folder') => void;
  onDeleteNode: (nodeId: string) => void;
  trashItems: FileSystemNode[];
  onRestoreNode: (node: FileSystemNode) => void;
  onDeleteForever: (nodeId: string) => void;
  onRenameNode: (id: string, newName: string) => void;
  onMoveNode: (nodeId: string, targetFolderId: string | undefined, targetIndex?: number) => void;
  appSettings: AppSettings;
  onOpenSettings?: () => void;
}

const SortableSidebarItem: React.FC<{
  node: FileSystemNode;
  activeNoteId: string | null;
  depth: number;
  onSelect: (note: FileSystemNode) => void;
  onCreate: (parentId: string | undefined, type: 'note' | 'folder') => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  parentId: string | undefined;
  dropTarget: DropTargetInfo | null;
}> = ({ node, activeNoteId, depth, onSelect, onCreate, onDelete, onRename, parentId, dropTarget }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    data: { node, parentId, depth, type: node.type } as any,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const isTarget = dropTarget?.targetId === node.id;
  const isDropBefore = isTarget && dropTarget?.position === 'before';
  const isDropAfter = isTarget && dropTarget?.position === 'after';
  const isDropInside = isTarget && dropTarget?.position === 'inside' && node.type === 'folder';

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleSelect = () => {
    if (isRenaming) return;
    if (node.type === 'note') {
      onSelect(node);
    } else {
      setIsOpen(!isOpen);
    }
  };

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRenaming(true);
    setRenameValue(node.name);
  };

  const submitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== node.name) {
      onRename(node.id, renameValue.trim());
    }
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setRenameValue(node.name);
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') cancelRename();
  };

  // Auto-expand folder when dragging inside it
  useEffect(() => {
    if (isDropInside && !isOpen) {
      const timer = setTimeout(() => setIsOpen(true), 400);
      return () => clearTimeout(timer);
    }
  }, [isDropInside, isOpen]);

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="relative">
      {/* Visual drop indicator: BEFORE (insert above) */}
      {isDropBefore && (
        <div 
          className="absolute -top-[1px] left-2 right-2 h-[2px] bg-blue-500 z-30 pointer-events-none rounded-full shadow-[0_0_4px_rgba(59,130,246,0.5)]" 
        />
      )}

      <div
        className={`
          group flex items-center py-1 px-3 cursor-pointer select-none text-sm transition-colors relative
          ${activeNoteId === node.id ? 'bg-[rgba(55,53,47,0.08)] dark:bg-[rgba(255,255,255,0.08)] font-semibold' : 'hover:bg-[rgba(55,53,47,0.04)] dark:hover:bg-[rgba(255,255,255,0.04)]'}
          ${isDropInside ? 'bg-blue-100/70 dark:bg-blue-900/40 ring-2 ring-blue-500/80 rounded' : ''}
        `}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        onClick={handleSelect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Drag handle */}
        <button
          className="mr-1 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="드래그하여 이동"
        >
          <GripVertical size={12} />
        </button>

        <div
          className="mr-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-0.5 rounded"
          onClick={node.type === 'folder' && !isRenaming ? handleToggle : undefined}
        >
          {node.type === 'folder' ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px] inline-block" />
          )}
        </div>

        <div className="mr-2 text-gray-500 dark:text-gray-400">
          {node.type === 'folder' ? (
            isOpen ? <FolderOpen size={16} /> : <Folder size={16} />
          ) : (
            <FileText size={16} />
          )}
        </div>

        {isRenaming ? (
          <div className="flex-1 flex items-center mr-2">
            <input
              ref={inputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={submitRename}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm px-1 py-0.5 border border-blue-400 rounded outline-none bg-white dark:bg-gray-800 dark:text-white"
            />
          </div>
        ) : (
          <span className="truncate flex-1 text-gray-700 dark:text-gray-300 group-hover:text-black dark:group-hover:text-white">
            {node.name}
          </span>
        )}

        {!isRenaming && (isHovered || activeNoteId === node.id) && (
          <div className="flex items-center opacity-60 group-hover:opacity-100 bg-[#F7F6F3]/80 dark:bg-gray-900/80 backdrop-blur-[2px]">
            {node.type === 'folder' && (
              <>
                <button
                  className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded mr-1"
                  title="New Note inside"
                  onClick={(e) => { e.stopPropagation(); onCreate(node.id, 'note'); setIsOpen(true); }}
                >
                  <Plus size={12} />
                </button>
                <button
                  className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded mr-1"
                  title="New Folder inside"
                  onClick={(e) => { e.stopPropagation(); onCreate(node.id, 'folder'); setIsOpen(true); }}
                >
                  <FolderPlus size={12} />
                </button>
              </>
            )}
            <button
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded mr-1"
              title="Rename"
              onClick={startRename}
            >
              <Edit2 size={12} />
            </button>
            <button
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded"
              title="Move to Trash"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Visual drop indicator: AFTER (insert below) */}
      {isDropAfter && (
        <div 
          className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-blue-500 z-30 pointer-events-none rounded-full shadow-[0_0_4px_rgba(59,130,246,0.5)]" 
        />
      )}

      {node.type === 'folder' && isOpen && (
        <div className="flex flex-col">
          <SortableContext items={(node.children || []).map(c => c.id)} strategy={verticalListSortingStrategy}>
            {(node.children || []).map(child => (
              <SortableSidebarItem
                key={child.id}
                node={child}
                activeNoteId={activeNoteId}
                depth={depth + 1}
                parentId={node.id}
                onSelect={onSelect}
                onCreate={onCreate}
                onDelete={onDelete}
                onRename={onRename}
                dropTarget={dropTarget}
              />
            ))}
          </SortableContext>
          {(!node.children || node.children.length === 0) && (
            <div
              className={`text-xs text-gray-400 py-2 italic border-2 border-dashed mx-2 my-1 rounded text-center ${isDropInside ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-500' : 'border-gray-200 dark:border-gray-700'}`}
              style={{ marginLeft: `${(depth + 1) * 12 + 28}px` }}
            >
              {isDropInside ? '여기에 놓아 폴더 안으로 추가' : 'Empty - 드래그하여 추가'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TrashItem: React.FC<{ node: FileSystemNode, onRestore: any, onDeleteForever: any }> = ({ node, onRestore, onDeleteForever }) => {
  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm group">
      <div className="flex items-center overflow-hidden">
        {node.type === 'folder' ? <Folder size={14} className="mr-2 text-gray-500 dark:text-gray-400" /> : <FileText size={14} className="mr-2 text-gray-500 dark:text-gray-400" />}
        <span className="truncate dark:text-gray-300">{node.name}</span>
      </div>
      <div className="flex space-x-1 opacity-0 group-hover:opacity-100">
        <button onClick={() => onRestore(node)} title="Restore" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-green-600 dark:text-green-500"><RotateCcw size={14} /></button>
        <button onClick={() => onDeleteForever(node.id)} title="Delete Forever" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-600 dark:text-red-500"><Trash2 size={14} /></button>
      </div>
    </div>
  )
}

const TagGroup: React.FC<{
  tagName: string;
  tagColor: TagColor;
  notes: FileSystemNode[];
  onSelectNote: (note: FileSystemNode) => void;
}> = ({ tagName, tagColor, notes, onSelectNote }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-1">
      <div
        className="flex items-center px-3 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="mr-1 text-gray-500 dark:text-gray-400">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className={`px-2 py-0.5 rounded text-xs font-medium ${TAG_COLORS[tagColor]} dark:opacity-80`}>
          {tagName}
        </div>
        <div className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {notes.length}
        </div>
      </div>
      {isOpen && (
        <div className="flex flex-col">
          {notes.map(note => (
            <div
              key={note.id}
              className="flex items-center py-1 pl-8 pr-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
              onClick={() => onSelectNote(note)}
            >
              <FileText size={14} className="mr-2 text-gray-500 dark:text-gray-400" />
              <span className="truncate dark:text-gray-300">{note.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const Sidebar: React.FC<SidebarProps> = ({
  nodes, activeNoteId, currentView, onChangeView, onSelectNote, onCreateNode, onDeleteNode,
  trashItems, onRestoreNode, onDeleteForever, onRenameNode, onMoveNode, appSettings, onOpenSettings
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const searchSeqRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetInfo | null>(null);

  useEffect(() => {
    if (currentView === SidebarView.SEARCH) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [currentView]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) {
      if (e.key === 'Escape') {
        setSearchQuery('');
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSearchIndex(prev => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSearchIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = searchResults[selectedSearchIndex];
      if (selected) {
        const node = findNode(nodes, selected.id);
        if (node) onSelectNote(node);
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const tagsMap = useMemo(() => {
    const map = new Map<string, { color: TagColor, notes: FileSystemNode[] }>();

    const traverse = (list: FileSystemNode[]) => {
      list.forEach(node => {
        if (node.type === 'note' && node.tags && node.tags.length > 0) {
          node.tags.forEach(tag => {
            if (!map.has(tag.label)) {
              map.set(tag.label, { color: tag.color, notes: [] });
            }
            map.get(tag.label)?.notes.push(node);
          });
        }
        if (node.children) traverse(node.children);
      });
    };

    traverse(nodes);
    return map;
  }, [nodes]);

  useEffect(() => {
    if (currentView !== SidebarView.SEARCH || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setSelectedSearchIndex(0);
      return;
    }

    setIsSearching(true);
    const queryAtDispatch = searchQuery.trim();
    const seq = ++searchSeqRef.current;

    const timer = setTimeout(() => {
      const performSearch = async () => {
        try {
          const contentResults = await storageService.searchNotes(queryAtDispatch);
          if (seq !== searchSeqRef.current) return;

          const lowerQuery = queryAtDispatch.toLowerCase();
          const resultMap = new Map<string, SearchResultItem>();

          // 1. Content matches from backend (Option A ensures only active notes are queried)
          for (const item of contentResults) {
            const node = findNode(nodes, item.id);
            if (!node || node.type !== 'note') continue; // Extra safety guard against deleted/ghost notes

            const pathNodes = findPath(nodes, item.id);
            const folderPath = pathNodes && pathNodes.length > 1
              ? pathNodes.slice(0, -1).map(n => n.name).join(' / ')
              : undefined;

            const lowerNoSpace = lowerQuery.replace(/\s+/g, '');
            const nodeNoSpace = node.name.replace(/\s+/g, '').toLowerCase();
            const isTitleMatch = node.name.toLowerCase().includes(lowerQuery) || (lowerNoSpace.length >= 2 && nodeNoSpace.includes(lowerNoSpace));

            resultMap.set(item.id, {
              id: item.id,
              title: node.name,
              snippet: item.snippet,
              matchType: isTitleMatch ? 'both' : 'content',
              path: folderPath,
              score: (item as any).score,
              matchedCount: (item as any).matchedCount,
              totalCount: (item as any).totalCount
            });
          }

          // 2. Title matches from active tree (in case title matched in client state before sync)
          const lowerNoSpace = lowerQuery.replace(/\s+/g, '');
          const traverseAndSearchTitle = (n: FileSystemNode[]) => {
            for (const node of n) {
              const nodeNoSpace = node.name.replace(/\s+/g, '').toLowerCase();
              const isMatch = node.name.toLowerCase().includes(lowerQuery) || (lowerNoSpace.length >= 2 && nodeNoSpace.includes(lowerNoSpace));

              if (node.type === 'note' && isMatch) {
                if (!resultMap.has(node.id)) {
                  const pathNodes = findPath(nodes, node.id);
                  const folderPath = pathNodes && pathNodes.length > 1
                    ? pathNodes.slice(0, -1).map(n => n.name).join(' / ')
                    : undefined;

                  resultMap.set(node.id, {
                    id: node.id,
                    title: node.name,
                    snippet: '제목에서 검색어가 일치합니다.',
                    matchType: 'title',
                    path: folderPath,
                    score: 90
                  });
                }
              }
              if (node.children) traverseAndSearchTitle(node.children);
            }
          };
          traverseAndSearchTitle(nodes);

          if (seq !== searchSeqRef.current) return;

          const merged = Array.from(resultMap.values());
          // Sort order: by score descending if available, fallback to matchType
          merged.sort((a, b) => {
            if (a.score !== undefined && b.score !== undefined) {
              return b.score - a.score;
            }
            const score = (m: SearchResultItem['matchType']) => (m === 'both' ? 3 : m === 'title' ? 2 : 1);
            return score(b.matchType) - score(a.matchType);
          });

          setSearchResults(merged);
          setSelectedSearchIndex(0);
        } catch (err) {
          console.error('Search failed:', err);
        } finally {
          if (seq === searchSeqRef.current) {
            setIsSearching(false);
          }
        }
      };

      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, currentView, nodes]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setDropTarget(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDropTarget(null);
      return;
    }

    if (over.id === 'root-droppable') {
      setDropTarget({ targetId: 'root-droppable', position: 'after' });
      return;
    }

    const overNode = findNode(nodes, over.id as string);
    if (!overNode) {
      setDropTarget(null);
      return;
    }

    // Check cycle: cannot drop into self or descendant
    const activeNode = findNode(nodes, active.id as string);
    if (activeNode && (overNode.id === activeNode.id || isDescendant(activeNode, overNode.id))) {
      setDropTarget(null);
      return;
    }

    // Calculate relative vertical pointer position within target element
    if (over.rect && active.rect.current.translated) {
      const activeCenterY = active.rect.current.translated.top + active.rect.current.translated.height / 2;
      const overTop = over.rect.top;
      const overHeight = over.rect.height || 32;
      const relativeY = (activeCenterY - overTop) / overHeight;

      if (overNode.type === 'folder') {
        if (relativeY < 0.25) {
          setDropTarget({ targetId: overNode.id, position: 'before' });
        } else if (relativeY > 0.75) {
          setDropTarget({ targetId: overNode.id, position: 'after' });
        } else {
          setDropTarget({ targetId: overNode.id, position: 'inside' });
        }
      } else {
        if (relativeY < 0.5) {
          setDropTarget({ targetId: overNode.id, position: 'before' });
        } else {
          setDropTarget({ targetId: overNode.id, position: 'after' });
        }
      }
    } else {
      setDropTarget(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const currentDrop = dropTarget;
    setActiveDragId(null);
    setDropTarget(null);

    if (!over || !currentDrop) return;
    const activeId = active.id as string;
    
    if (currentDrop.targetId === 'root-droppable') {
      onMoveNode(activeId, undefined, undefined);
      return;
    }

    const overId = currentDrop.targetId;
    if (activeId === overId) return;

    const activeInfo = findParentAndIndex(nodes, activeId);
    const overInfo = findParentAndIndex(nodes, overId);
    const overNode = findNode(nodes, overId);
    if (!activeInfo || !overInfo || !overNode) return;

    // Cycle prevention
    const activeNodeObj = findNode(nodes, activeId);
    if (activeNodeObj && (overNode.id === activeNodeObj.id || isDescendant(activeNodeObj, overNode.id))) {
      return;
    }

    const sameParent = activeInfo.parentId === overInfo.parentId;

    if (currentDrop.position === 'inside' && overNode.type === 'folder') {
      onMoveNode(activeId, overNode.id, undefined);
      return;
    }

    if (currentDrop.position === 'before') {
      let targetIndex = overInfo.index;
      if (sameParent && activeInfo.index < overInfo.index) {
        targetIndex = overInfo.index - 1;
      }
      onMoveNode(activeId, overInfo.parentId, targetIndex);
      return;
    }

    if (currentDrop.position === 'after') {
      let targetIndex: number;
      if (sameParent) {
        if (activeInfo.index < overInfo.index) {
          targetIndex = overInfo.index;
        } else {
          targetIndex = overInfo.index + 1;
        }
      } else {
        targetIndex = overInfo.index + 1;
      }
      onMoveNode(activeId, overInfo.parentId, targetIndex);
      return;
    }
  };

  const activeNode = activeDragId ? findNode(nodes, activeDragId) : null;

  const { setNodeRef: setRootDroppableRef, isOver: isRootOver } = useDroppable({
    id: 'root-droppable',
    data: { isRoot: true } as any,
  });

  return (
    <div className="w-64 bg-[#F7F6F3] border-r border-[#E9E9E7] flex flex-col h-full flex-shrink-0 transition-all duration-300 font-sans dark:bg-gray-900 dark:border-gray-800 dark:text-gray-300">
      <div className="p-4 flex items-center justify-between sticky top-0 bg-[#F7F6F3] z-10 dark:bg-gray-900">
        <div
          className="flex items-center space-x-2 font-semibold text-gray-700 cursor-pointer dark:text-gray-200"
          onClick={() => onChangeView(SidebarView.FILES)}
        >
          <div className="w-6 h-6 bg-gray-800 text-white flex items-center justify-center rounded text-xs font-serif dark:bg-gray-700">
            {appSettings.logo}
          </div>
          <span className="truncate">{appSettings.title}</span>
        </div>
      </div>

      <div className="px-3 pb-2 space-y-1">
        <div
          onClick={() => onChangeView(SidebarView.SEARCH)}
          className={`flex items-center text-gray-600 dark:text-gray-400 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-[rgba(55,53,47,0.08)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors ${currentView === SidebarView.SEARCH ? 'bg-[rgba(55,53,47,0.08)] dark:bg-[rgba(255,255,255,0.08)] font-medium text-gray-900 dark:text-gray-200' : ''}`}
        >
          <Search size={14} className="mr-2" />
          <span>Search</span>
        </div>
        <div
          onClick={() => onChangeView(SidebarView.TAGS)}
          className={`flex items-center text-gray-600 dark:text-gray-400 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-[rgba(55,53,47,0.08)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors ${currentView === SidebarView.TAGS ? 'bg-[rgba(55,53,47,0.08)] dark:bg-[rgba(255,255,255,0.08)] font-medium text-gray-900 dark:text-gray-200' : ''}`}
        >
          <Tags size={14} className="mr-2" />
          <span>Tags</span>
        </div>
        <div
          onClick={() => onChangeView(SidebarView.TRASH)}
          className={`flex items-center text-gray-600 dark:text-gray-400 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-[rgba(55,53,47,0.08)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors ${currentView === SidebarView.TRASH ? 'bg-[rgba(55,53,47,0.08)] dark:bg-[rgba(255,255,255,0.08)] font-medium text-gray-900 dark:text-gray-200' : ''}`}
        >
          <Trash2 size={14} className="mr-2" />
          <span>Trash</span>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 pb-4">
        {currentView === SidebarView.FILES && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="group flex items-center justify-between px-3 py-2 mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-[rgba(55,53,47,0.04)] dark:hover:bg-[rgba(255,255,255,0.04)] cursor-pointer">
              <span>NOTES</span>
              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400"
                  title="New Folder"
                  onClick={(e) => { e.stopPropagation(); onCreateNode(undefined, 'folder'); }}
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400"
                  title="New Page"
                  onClick={(e) => { e.stopPropagation(); onCreateNode(undefined, 'note'); }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div ref={setRootDroppableRef} className={`min-h-[100px] ${isRootOver ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
              <SortableContext items={nodes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                {nodes.map(node => (
                  <SortableSidebarItem
                    key={node.id}
                    node={node}
                    activeNoteId={activeNoteId}
                    depth={0}
                    parentId={undefined}
                    onSelect={onSelectNote}
                    onCreate={onCreateNode}
                    onDelete={onDeleteNode}
                    onRename={onRenameNode}
                    dropTarget={dropTarget}
                  />
                ))}
              </SortableContext>
              {nodes.length === 0 && (
                <div className={`mx-3 mt-2 p-4 border-2 border-dashed rounded text-center text-xs text-gray-400 ${isRootOver ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                  {isRootOver ? '여기에 놓기' : '드래그하여 순서 변경 또는 폴더로 이동'}
                </div>
              )}
            </div>
            <DragOverlay>
              {activeNode ? (
                <div className="flex items-center py-1 px-3 bg-white dark:bg-gray-800 shadow-lg rounded border border-gray-200 dark:border-gray-700 text-sm opacity-90">
                  {activeNode.type === 'folder' ? <Folder size={16} className="mr-2 text-gray-500" /> : <FileText size={16} className="mr-2 text-gray-500" />}
                  <span className="truncate">{activeNode.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {currentView === SidebarView.SEARCH && (
          <div className="flex flex-col h-full px-3 pt-2">
            {/* Search Input Box */}
            <div className="relative mb-2 shrink-0">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                {isSearching ? (
                  <Loader2 size={14} className="animate-spin text-blue-500" />
                ) : (
                  <Search size={14} />
                )}
              </div>
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                placeholder="노트 제목 또는 본문 검색..."
                className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-all focus:border-blue-400 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-400/30 dark:focus:ring-blue-500/30 shadow-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="검색어 지우기"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Results Header / Meta */}
            {searchQuery.trim().length >= 2 && (
              <div className="flex items-center justify-between px-1 mb-2 text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                <span>
                  {isSearching ? '검색 중...' : `결과 ${searchResults.length}건`}
                </span>
                {searchResults.length > 0 && (
                  <span className="text-[10px] text-gray-400/80 dark:text-gray-500/80">
                    ↑↓ 이동 · Enter 열기
                  </span>
                )}
              </div>
            )}

            {/* Search Results List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pb-3 pr-0.5 custom-scrollbar">
              {searchQuery.trim().length >= 2 && searchResults.length > 0 ? (
                searchResults.map((res, index) => {
                  const isSelected = index === selectedSearchIndex;
                  const isActive = res.id === activeNoteId;

                  return (
                    <div
                      key={res.id}
                      className={`group p-2 rounded-md cursor-pointer border transition-all duration-150 text-left ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 shadow-xs'
                          : isActive
                          ? 'bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-750 border-gray-200 dark:border-gray-700/70 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                      onClick={() => {
                        const node = findNode(nodes, res.id);
                        if (node) onSelectNote(node);
                      }}
                      onMouseEnter={() => setSelectedSearchIndex(index)}
                    >
                      {/* Folder Breadcrumb (if any) */}
                      {res.path && (
                        <div className="flex items-center text-[10px] text-gray-400 dark:text-gray-500 mb-1 truncate">
                          <Folder size={10} className="mr-1 shrink-0 opacity-70" />
                          <span className="truncate">{res.path}</span>
                        </div>
                      )}

                      {/* Title + Badges */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center min-w-0 flex-1">
                          <FileText
                            size={13}
                            className={`mr-1.5 shrink-0 ${
                              isActive ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
                            }`}
                          />
                          <span className="font-medium text-xs text-gray-800 dark:text-gray-200 truncate">
                            <HighlightMatch text={res.title} query={searchQuery} />
                          </span>
                        </div>

                        {/* Match Type Badge */}
                        <div className="shrink-0 flex items-center gap-1">
                          {isActive && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-medium">
                              열림
                            </span>
                          )}
                          {res.matchedCount !== undefined && res.totalCount !== undefined && res.totalCount > 1 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium border border-gray-200 dark:border-gray-700">
                              {res.matchedCount === res.totalCount ? '전체일치' : `${res.matchedCount}/${res.totalCount}`}
                            </span>
                          )}
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium ${
                              res.matchType === 'both'
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                                : res.matchType === 'title'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                            }`}
                          >
                            {res.matchType === 'both'
                              ? '제목+본문'
                              : res.matchType === 'title'
                              ? '제목'
                              : '본문'}
                          </span>
                        </div>
                      </div>

                      {/* Snippet */}
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed bg-gray-50/70 dark:bg-gray-900/40 px-1.5 py-1 rounded border border-gray-100 dark:border-gray-800/80">
                        <HighlightMatch text={res.snippet} query={searchQuery} />
                      </div>
                    </div>
                  );
                })
              ) : searchQuery.trim().length >= 2 && !isSearching ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 mb-2">
                    <Search size={18} />
                  </div>
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    일치하는 결과가 없습니다
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">
                    다른 키워드로 검색해 보세요.
                  </div>
                </div>
              ) : searchQuery.trim().length === 1 ? (
                <div className="text-center py-6 px-4 text-xs text-gray-400 dark:text-gray-500">
                  검색어를 2자 이상 입력해주세요.
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4 text-gray-400 dark:text-gray-500">
                  <Search size={22} className="opacity-30 mb-2" />
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    빠른 노트 검색
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">
                    노트 제목과 본문 내용을 실시간으로 검색합니다.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === SidebarView.TAGS && (
          <div className="px-3 pt-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Tags
            </div>
            {tagsMap.size === 0 ? (
              <div className="text-sm text-gray-400 italic px-2">No tags found</div>
            ) : (
              Array.from(tagsMap.entries()).map(([label, data]) => (
                <TagGroup
                  key={label}
                  tagName={label}
                  tagColor={data.color}
                  notes={data.notes}
                  onSelectNote={onSelectNote}
                />
              ))
            )}
          </div>
        )}

        {currentView === SidebarView.TRASH && (
          <div className="px-3 pt-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Trash Bin ({trashItems.length})
            </div>
            {trashItems.length === 0 ? (
              <div className="text-sm text-gray-400 italic px-2">Trash is empty</div>
            ) : (
              trashItems.map(node => (
                <TrashItem
                  key={node.id}
                  node={node}
                  onRestore={onRestoreNode}
                  onDeleteForever={onDeleteForever}
                />
              ))
            )}
          </div>
        )}
      </div>

      {currentView === SidebarView.FILES && (
        <div className="p-3 border-t border-[#E9E9E7] dark:border-gray-800 flex space-x-1">
          <button
            className="flex-1 p-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded flex items-center justify-center transition-colors"
            onClick={() => onCreateNode(undefined, 'note')}
          >
            <Plus size={16} className="mr-2" />
            New Page
          </button>
          <button
            className="p-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded flex items-center justify-center transition-colors"
            title="New Folder"
            onClick={() => onCreateNode(undefined, 'folder')}
          >
            <FolderPlus size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
