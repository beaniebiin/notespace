import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StickyNote,
  Copy,
  Check,
  Trash2,
  ArrowDownToLine,
  Plus,
  ChevronDown,
  Clock,
  Search,
  FileText,
} from 'lucide-react';
import { RightSidebarPlugin, RightSidebarContext } from '../RightSidebarTypes';
import {
  scratchpadService,
  ScratchpadDB,
  ScratchpadItem,
  formatScratchpadRelativeTime,
} from '../../../services/scratchpadService';

export const ScratchpadPluginComponent: React.FC<{ ctx: RightSidebarContext }> = ({ ctx }) => {
  const [db, setDb] = useState<ScratchpadDB | null>(null);
  const [activeId, setActiveId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<any>(null);

  // Active memo item from db
  const activeItem = useMemo(() => {
    if (!db || !db.items.length) return null;
    return db.items.find((i) => i.id === activeId) || db.items[0];
  }, [db, activeId]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    scratchpadService.getDB().then((loaded) => {
      if (!isMounted) return;
      setDb(loaded);
      setActiveId(loaded.activeId);
      const active = loaded.items.find((i) => i.id === loaded.activeId) || loaded.items[0];
      if (active) {
        setTitle(active.title || '');
        setContent(active.content || '');
      }
    });

    // Cross-tab/component update listener
    const handleUpdated = (e: any) => {
      if (!isMounted) return;
      const updatedDB: ScratchpadDB = e.detail;
      if (updatedDB) {
        setDb(updatedDB);
      }
    };

    window.addEventListener('notespace-scratchpad-updated', handleUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('notespace-scratchpad-updated', handleUpdated);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isDropdownOpen]);

  // Debounced auto-save
  const triggerAutoSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (!activeId) return;
      setIsSaving(true);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const updatedDB = await scratchpadService.saveItem(activeId, newTitle, newContent);
          setDb(updatedDB);
          setIsSaving(false);
          setLastSavedText('방금 저장됨');
        } catch (e) {
          console.error('Failed to auto-save scratchpad item', e);
          setIsSaving(false);
        }
      }, 450);
    },
    [activeId]
  );

  // Handle immediate save on blur
  const handleImmediateSave = useCallback(async () => {
    if (!activeId) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    try {
      const updatedDB = await scratchpadService.saveItem(activeId, title, content);
      setDb(updatedDB);
      setIsSaving(false);
      setLastSavedText('방금 저장됨');
    } catch (e) {
      console.error('Failed to immediately save scratchpad memo', e);
    }
  }, [activeId, title, content]);

  // Handle title input change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setTitle(next);
    triggerAutoSave(next, content);
  };

  // Handle content textarea change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    triggerAutoSave(title, next);
  };

  // Switch to another memo
  const handleSelectMemo = async (memoId: string) => {
    if (memoId === activeId) {
      setIsDropdownOpen(false);
      return;
    }
    // Flush current memo
    await handleImmediateSave();

    const target = db?.items.find((i) => i.id === memoId);
    if (target) {
      setActiveId(target.id);
      setTitle(target.title || '');
      setContent(target.content || '');
      await scratchpadService.setActiveId(target.id);
    }
    setIsDropdownOpen(false);
    setConfirmDeleteId(null);
  };

  // Create a brand new memo
  const handleCreateMemo = async () => {
    await handleImmediateSave();
    const { db: updatedDB, created } = await scratchpadService.createItem();
    setDb(updatedDB);
    setActiveId(created.id);
    setTitle(created.title);
    setContent(created.content);
    setIsDropdownOpen(false);
    setConfirmDeleteId(null);
    setLastSavedText('');
  };

  // Delete a memo
  const handleDeleteMemo = async (e: React.MouseEvent, memoId: string) => {
    e.stopPropagation();
    if (confirmDeleteId !== memoId) {
      setConfirmDeleteId(memoId);
      return;
    }

    const updatedDB = await scratchpadService.deleteItem(memoId);
    setDb(updatedDB);
    setActiveId(updatedDB.activeId);
    const newActive = updatedDB.items.find((i) => i.id === updatedDB.activeId) || updatedDB.items[0];
    if (newActive) {
      setTitle(newActive.title);
      setContent(newActive.content);
    }
    setConfirmDeleteId(null);
    if (memoId === activeId) {
      setIsDropdownOpen(false);
    }
  };

  // Copy active memo content
  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Failed to copy scratchpad text', e);
    }
  };

  // Insert into note
  const handleInsertIntoNote = () => {
    if (!content.trim() || !ctx.onInsertMarkdown) return;
    const headerPrefix = title.trim() ? `### ${title.trim()}\n\n` : '';
    ctx.onInsertMarkdown(`${headerPrefix}${content}`);
  };

  // Filtered memos for dropdown list
  const filteredMemos = useMemo(() => {
    if (!db) return [];
    if (!searchQuery.trim()) return db.items;
    const q = searchQuery.toLowerCase();
    return db.items.filter(
      (m) => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)
    );
  }, [db, searchQuery]);

  const charCount = content.length;
  const lineCount = content ? content.split('\n').length : 0;
  const memoCount = db?.items.length || 1;

  return (
    <div className="h-full flex flex-col min-h-0 text-xs">
      {/* 1. Memo Switcher & Quick Add Header */}
      <div className="relative pb-1.5 mb-1.5 border-b border-gray-100 dark:border-gray-800/80 shrink-0 select-none" ref={dropdownRef}>
        <div className="flex items-center justify-between gap-1">
          {/* Selector Button */}
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex-1 min-w-0 flex items-center justify-between gap-1.5 px-2 py-1 rounded-md bg-gray-100/70 hover:bg-gray-200/60 dark:bg-gray-800/60 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 transition-colors text-left cursor-pointer group"
            title="저장된 스크래치패드 메모 목록 열기"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <StickyNote size={13} className="text-amber-500 shrink-0" />
              <span className="font-semibold text-xs truncate">
                {title.trim() || '제목 없는 메모'}
              </span>
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 shrink-0 font-medium">
                {memoCount}
              </span>
            </div>
            <ChevronDown
              size={13}
              className={`text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 shrink-0 transition-transform duration-200 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* New Memo Button */}
          <button
            type="button"
            onClick={handleCreateMemo}
            title="새 스크래치패드 메모 추가"
            className="p-1 px-1.5 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0 text-[11px]"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">새 메모</span>
          </button>
        </div>

        {/* 2. Dropdown Memo List Menu */}
        {isDropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-72">
            {/* Search filter if more than 3 memos */}
            {memoCount > 3 && (
              <div className="p-1.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1.5 bg-gray-50/50 dark:bg-gray-850/50">
                <Search size={12} className="text-gray-400 ml-1" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="메모 검색..."
                  className="w-full bg-transparent text-[11px] outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400"
                />
              </div>
            )}

            {/* List */}
            <div className="overflow-y-auto custom-scrollbar flex-1 p-1 space-y-0.5">
              {filteredMemos.length === 0 ? (
                <div className="p-3 text-center text-gray-400 text-[11px]">
                  일치하는 메모가 없습니다.
                </div>
              ) : (
                filteredMemos.map((memo) => {
                  const isCurrent = memo.id === activeId;
                  const isDeleting = confirmDeleteId === memo.id;
                  const snippet = memo.content.trim().slice(0, 45) || '내용 없음';

                  return (
                    <div
                      key={memo.id}
                      onClick={() => handleSelectMemo(memo.id)}
                      className={`group flex items-center justify-between gap-2 p-1.5 rounded-md cursor-pointer transition-colors text-left ${
                        isCurrent
                          ? 'bg-blue-50/90 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800/70 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <FileText
                            size={12}
                            className={`shrink-0 ${
                              isCurrent ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'
                            }`}
                          />
                          <span className="text-xs truncate font-medium">
                            {memo.title || '제목 없음'}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate pl-4">
                          {snippet}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9.5px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                          <Clock size={9} />
                          {formatScratchpadRelativeTime(memo.updatedAt)}
                        </span>

                        {/* Delete memo button */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteMemo(e, memo.id)}
                          title={isDeleting ? '정말 삭제할까요? (클릭)' : '메모 삭제'}
                          className={`p-1 rounded transition-colors text-[10px] ${
                            isDeleting
                              ? 'bg-red-500 text-white font-medium px-1.5'
                              : 'text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {isDeleting ? (
                            '삭제확인'
                          ) : (
                            <Trash2 size={11} className="hover:scale-110" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Add Bar */}
            <div className="p-1 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-850/60">
              <button
                type="button"
                onClick={handleCreateMemo}
                className="w-full py-1 text-center text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 rounded transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus size={12} />새 메모 추가
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Inline Title Editor */}
      <input
        type="text"
        value={title}
        onChange={handleTitleChange}
        onBlur={handleImmediateSave}
        placeholder="메모 제목 (선택사항)..."
        className="w-full mb-1.5 px-2 py-1 text-xs font-semibold rounded bg-gray-50/50 dark:bg-gray-850/40 border border-transparent hover:border-gray-200 dark:hover:border-gray-800 focus:border-blue-400 dark:focus:border-blue-500 text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none transition-colors"
      />

      {/* 4. Scratchpad Textarea */}
      <textarea
        value={content}
        onChange={handleContentChange}
        onBlur={handleImmediateSave}
        placeholder="간단한 메모나 아이디어를 자유롭게 적어두세요 (자동 저장)..."
        spellCheck={false}
        className="flex-1 w-full min-h-0 p-2 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-200/60 dark:border-gray-800/60 text-gray-800 dark:text-gray-200 placeholder-gray-400 text-xs leading-relaxed outline-none resize-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
      />

      {/* 5. Bottom Action Bar (1 compact horizontal row) */}
      <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-gray-100 dark:border-gray-800/80 text-[11px] text-gray-400 shrink-0 select-none">
        {/* Left: Counts and Status */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-gray-500 dark:text-gray-400 tracking-tight text-[10.5px]">
            {charCount}자 · {lineCount}줄
          </span>
          {isSaving ? (
            <span className="text-[10px] text-blue-500 animate-pulse font-medium">저장 중...</span>
          ) : lastSavedText ? (
            <span className="text-[10px] text-emerald-500 font-normal">{lastSavedText}</span>
          ) : null}
        </div>

        {/* Right: Actions (Insert, Copy, Delete current memo) */}
        <div className="flex items-center gap-1">
          {/* Insert into main note button */}
          {ctx.onInsertMarkdown && (
            <button
              type="button"
              onClick={handleInsertIntoNote}
              disabled={!content.trim()}
              title="현재 에디터 커서 위치에 삽입"
              className="px-1.5 py-0.5 rounded hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1 text-[10.5px]"
            >
              <ArrowDownToLine size={12} />
              <span>삽입</span>
            </button>
          )}

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!content}
            title="메모 전체 복사"
            className="px-1.5 py-0.5 rounded hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1 text-[10.5px]"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            <span>{copied ? '복사됨' : '복사'}</span>
          </button>

          {/* Delete current memo button */}
          <button
            type="button"
            onClick={(e) => activeId && handleDeleteMemo(e, activeId)}
            title={confirmDeleteId === activeId ? '정말 삭제할까요? (다시 클릭)' : '현재 메모 삭제'}
            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[10.5px] flex items-center gap-1 ${
              confirmDeleteId === activeId
                ? 'bg-red-500 text-white font-medium animate-pulse'
                : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
            }`}
          >
            <Trash2 size={12} />
            {confirmDeleteId === activeId && <span>정말삭제?</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ScratchpadPlugin: RightSidebarPlugin = {
  id: 'scratchpad',
  title: '스크래치패드',
  icon: StickyNote,
  tooltip: '스크래치패드 (빠른 다중 메모)',
  badge: () => {
    const count = scratchpadService.getCachedCount();
    return count > 0 ? count : undefined;
  },
  render: (ctx) => <ScratchpadPluginComponent ctx={ctx} />,
};

export default ScratchpadPlugin;
