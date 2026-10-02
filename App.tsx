import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileSystemNode, SidebarView, AppSettings } from './types';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import TiptapEditor from './components/TiptapEditor';
import EditorToolbar from './components/EditorToolbar';
import TableOfContents, { DesktopStickyToc } from './components/TableOfContents';
import { TagManager } from './components/TagManager';
import SettingsModal from './components/SettingsModal';
import MarkdownRenderer from './components/MarkdownRenderer';
import { requestAi } from './services/aiOrchestrator';
import { collectTags, findNode, findPath, findFirstNote } from './services/tree-model';
import { applyContrastLevel } from './services/highlight';
import { storageService } from './services/storageService';
import { useFileTree } from './components/hooks/useFileTree';
import { useNotifications } from './components/hooks/useNotifications';
import { useNotePersistence } from './components/hooks/useNotePersistence';
import { X, LayoutPanelLeft } from 'lucide-react';
import { Editor } from '@tiptap/react';
import { AiToastNotification } from './components/AiToastNotification';
import { AiFallbackModal } from './components/AiFallbackModal';
import { AiEndpointSettingsModal } from './components/AiEndpointSettingsModal';

const App: React.FC = () => {
  // --- App State ---
  const { notify, dismiss, notifications: topBarNotifications } = useNotifications();
  const {
    fileSystem,
    trashItems,
    updateNode,
    renameNode,
    updateTags,
    moveNode,
    removeNode,
    restoreNode,
    deleteForever,
    createNode: createTreeNode,
  } = useFileTree({ notify });
  const handleNoteSaved = useCallback((id: string) => {
    updateNode(id, { lastModified: Date.now() });
  }, [updateNode]);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    title: 'NoteSpace',
    logo: 'N',
    darkMode: typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
    theme: 'system',
    contrast: 'standard'
  });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAiEndpointSettingsOpen, setIsAiEndpointSettingsOpen] = useState(false);

  // Toast Notification State
  const [toastState, setToastState] = useState<{
    isOpen: boolean;
    endpointName: string;
    modelUsed: string;
  }>({
    isOpen: false,
    endpointName: '',
    modelUsed: ''
  });

  // Fallback Modal State
  const [fallbackState, setFallbackState] = useState<{
    isOpen: boolean;
    failedEndpointName: string;
    nextEndpointId: string | number;
    nextEndpointName: string;
    pendingPrompt: string;
    pendingFiles?: { mimeType: string; data: string }[];
    pendingExcludeContent?: boolean;
    pendingWrapCodeBlock?: boolean;
  }>({
    isOpen: false,
    failedEndpointName: '',
    nextEndpointId: '',
    nextEndpointName: '',
    pendingPrompt: ''
  });

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const {
    saveStatus,
    scheduleSave,
    flush: flushPendingSave,
    peekPending,
    adoptPending,
    cancel: cancelPendingSave,
    resetStatus,
  } = useNotePersistence({ notify, onSaved: handleNoteSaved, activeNoteId });
  const [editorContent, setEditorContent] = useState<string>('');
  const [isNoteLoading, setIsNoteLoading] = useState<boolean>(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorMode, setEditorMode] = useState<'wysiwyg' | 'raw' | 'viewer'>('wysiwyg');

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarView, setSidebarView] = useState<SidebarView>(SidebarView.FILES);

  const [aiLoading, setAiLoading] = useState(false);
  const [tocHeadings, setTocHeadings] = useState<{ id: string; text: string; level: number; color?: string }[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  const [zoomLevel, setZoomLevel] = useState(100);


  const editorContentRef = useRef<string>('');
  const transitionSeqRef = useRef<number>(0);
  useEffect(() => { editorContentRef.current = editorContent; }, [editorContent]);

  // --- Effects ---
  useEffect(() => {
    const loadData = async () => {
      const settings = await storageService.getSettings();
      setAppSettings({ contrast: 'standard', ...settings });
    };
    loadData();
  }, []);

  useEffect(() => {
    const theme = appSettings.theme ?? (appSettings.darkMode ? 'dark' : 'light');
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark = theme === 'system' ? mediaQuery.matches : theme === 'dark';
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (theme === 'system') {
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [appSettings.theme, appSettings.darkMode]);

  useEffect(() => {
    applyContrastLevel(appSettings.contrast ?? 'standard');
  }, [appSettings.contrast, appSettings.darkMode]);

  useEffect(() => {
    document.title = appSettings.title;
  }, [appSettings.title]);

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    const ok = await storageService.saveSettings(newSettings);
    if (ok) {
      notify({ type: 'tree_saved', message: '설정 저장됨', duration: 2500 });
    } else {
      notify({ type: 'tree_error', message: '설정 저장 실패', duration: 4000 });
    }
  };

  useEffect(() => {
    const handleBeforePrint = () => {
      document.querySelectorAll('details:not([open])').forEach((el) => {
        el.setAttribute('data-print-opened', 'true');
        el.setAttribute('open', '');
      });
    };

    const handleAfterPrint = () => {
      document.querySelectorAll('details[data-print-opened="true"]').forEach((el) => {
        el.removeAttribute('open');
        el.removeAttribute('data-print-opened');
      });
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const loadContent = async () => {
      if (activeNoteId) {
        setIsNoteLoading(true);
        const content = await storageService.getContent(activeNoteId);
        if (!isCurrent) return;
        if (content === null) {
          // 불러오기 실패: 이전 노트 내용이 화면에 남지 않도록 클리어하고 오류 알림
          setEditorContent('');
          setIsNoteLoading(false);
          notify({ type: 'tree_error', message: '불러오기 실패 — 네트워크를 확인하세요', duration: 6000 });
          return;
        }
        setEditorContent(content);
        setIsNoteLoading(false);
      } else {
        if (isCurrent) {
          setEditorContent('');
          setIsNoteLoading(false);
        }
      }
    };
    loadContent();
    return () => {
      isCurrent = false;
    };
  }, [activeNoteId]);


  const printRestoreRef = useRef<{ wasSidebarOpen: boolean; openedDetails: HTMLDetailsElement[] }>({
    wasSidebarOpen: false,
    openedDetails: [],
  });

  const prepareForPrint = useCallback(() => {
    if (isSidebarOpen) {
      printRestoreRef.current.wasSidebarOpen = true;
      setIsSidebarOpen(false);
    }

    const opened: HTMLDetailsElement[] = [];
    document.querySelectorAll<HTMLDetailsElement>('details').forEach((el) => {
      if (!el.open) {
        opened.push(el);
        el.open = true;
        el.setAttribute('open', '');
        el.setAttribute('data-print-opened', 'true');
      }
    });
    printRestoreRef.current.openedDetails = opened;
  }, [isSidebarOpen]);

  const cleanupAfterPrint = useCallback(() => {
    if (printRestoreRef.current.wasSidebarOpen) {
      setIsSidebarOpen(true);
      printRestoreRef.current.wasSidebarOpen = false;
    }

    printRestoreRef.current.openedDetails.forEach((el) => {
      el.open = false;
      el.removeAttribute('open');
      el.removeAttribute('data-print-opened');
    });
    printRestoreRef.current.openedDetails = [];
    document.querySelectorAll<HTMLDetailsElement>('details[data-print-opened="true"]').forEach((el) => {
      el.open = false;
      el.removeAttribute('open');
      el.removeAttribute('data-print-opened');
    });
  }, []);

  useEffect(() => {
    const handleBeforePrint = () => {
      prepareForPrint();
    };
    const handleAfterPrint = () => {
      cleanupAfterPrint();
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [prepareForPrint, cleanupAfterPrint]);

  const handlePrint = useCallback(() => {
    prepareForPrint();
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        cleanupAfterPrint();
      }, 500);
    }, 150);
  }, [prepareForPrint, cleanupAfterPrint]);

  // Initial active note
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const noteId = params.get('note');

    if (noteId) {
      // Verify note exists
      const node = findNode(fileSystem, noteId);
      if (node) {
        setActiveNoteId(noteId);
        return;
      }
    }

    if (!activeNoteId && fileSystem.length > 0) {
      const first = findFirstNote(fileSystem);
      if (first) setActiveNoteId(first);
    }
  }, [fileSystem, activeNoteId]);

  // Handle screen resize to auto-close sidebar on mobile if needed, or leave as is.
  // Ghost Mount 및 덮어쓰기 원천 차단:
  // 1) live markdown 즉시 버퍼 적재
  // 2) isNoteLoading(true)로 기존 에디터 즉시 안전 언마운트 (새 ID에 구 내용 마운트 차단)
  // 3) flushPendingSave()를 완전히 await하여 이전 노트 저장 완료 보장
  // 4) transitionSeqRef 시퀀스 검사로 비동기 전환 순서 역전 방지
  // 5) 안전하게 activeNoteId 변경
  const transitionToNote = useCallback(async (nextNoteId: string, sectionId?: string) => {
    // 이미 해당 노트를 보고 있고 로딩 중도 아니라면 No-op
    if (nextNoteId === activeNoteId && !isNoteLoading) {
      setSidebarView(SidebarView.FILES);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      return;
    }

    // 시퀀스 증가 (진행 중이던 이전 전환을 즉시 무효화)
    const seq = ++transitionSeqRef.current;

    // 전환 대기 중 원래 노트로 되돌아온 경우: 이전 전환을 취소하고 로딩 상태만 해제
    if (nextNoteId === activeNoteId && isNoteLoading) {
      setIsNoteLoading(false);
      return;
    }

    // 1. 에디터에 미전송된 실시간 markdown이 있으면 버퍼에 즉각 적재
    if (editor && !editor.isDestroyed && activeNoteId) {
      try {
        const liveMarkdown = (editor.storage as any)?.markdown?.getMarkdown() || '';
        if (liveMarkdown !== editorContentRef.current) {
          adoptPending({ id: activeNoteId, content: liveMarkdown });
        }
      } catch { }
    }

    // 2. 화면의 에디터를 즉시 언마운트하여 Ghost Mount 원천 차단
    setIsNoteLoading(true);

    // 3. 이전 노트의 저장을 완전히 await하여 데이터 무결성 보장
    try {
      await flushPendingSave();
    } catch (e) {
      console.error('Failed to flush pending saves during note transition', e);
    }
    resetStatus();

    // 4. 최신 요청 검사: 대기 시간 동안 더 최신 클릭이 발생했다면 폐기
    if (seq !== transitionSeqRef.current) {
      return;
    }

    // 5. 노드가 비동기 대기 중 삭제되었는지 확인 (Zombie Resurrection 방지)
    if (!findNode(fileSystem, nextNoteId)) {
      setIsNoteLoading(false);
      return;
    }

    // 6. 안전하게 새 노트 ID 설정
    setActiveNoteId(nextNoteId);
    setSidebarView(SidebarView.FILES);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }

    if (sectionId) {
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.style.backgroundColor = '#fff3cd';
          element.style.transition = 'background-color 1s';
          setTimeout(() => {
            element.style.backgroundColor = 'transparent';
          }, 2000);
        }
      }, 300);
    }
  }, [activeNoteId, isNoteLoading, fileSystem, editor, adoptPending, flushPendingSave, resetStatus]);

  const handleSelectNote = (node: FileSystemNode) => {
    void transitionToNote(node.id);
  };

  // Selection-side handling around tree removal (editor/save stay in App)
  const deleteNode = useCallback((id: string) => {
    transitionSeqRef.current++;
    const { clearedActive } = removeNode(id, activeNoteId);
    if (clearedActive) {
      cancelPendingSave(id);
      setActiveNoteId(null);
      setEditorContent('');
      resetStatus();
    }
  }, [removeNode, activeNoteId, cancelPendingSave, resetStatus]);

  // Selection-side handling around tree creation (tree+storage stay in the hook)
  const createNode = useCallback(async (parentId: string | undefined, type: 'note' | 'folder') => {
    const node = await createTreeNode(parentId, type);
    if (type === 'note') {
      await transitionToNote(node.id);
    }
  }, [createTreeNode, transitionToNote]);

  const handleCopyLink = () => {
    if (!editor || !activeNoteId) return;

    // For now, just copy link to the note, as deep linking to selection requires more complex setup in Tiptap
    const link = `?note=${activeNoteId}`;
    const markdownLink = `[Link to Note](${link})`;

    navigator.clipboard.writeText(markdownLink).then(() => {
      alert("Link to note copied!");
    });
  };

  const handleNavigate = useCallback((noteId: string, sectionId?: string) => {
    void transitionToNote(noteId, sectionId);
  }, [transitionToNote]);

  const handleAiAction = async (
    prompt: string,
    files?: { mimeType: string; data: string }[],
    targetEndpointId?: string | number,
    targetModel?: string,
    excludeContent?: boolean,
    wrapCodeBlock?: boolean
  ) => {
    if (!activeNoteId || !editor) return;
    setAiLoading(true);
    const loadingId = notify({ type: 'ai_loading', message: 'AI 생성 중...', key: 'ai:run', duration: 0 });
    try {
      const contextContent = excludeContent ? '' : editorContent;
      // wrapCodeBlock 호출자(사실관계 정리)는 '사실관계' kind로 매핑. 나머지는 '자유'.
      const outcome = await requestAi({
        kind: wrapCodeBlock ? '사실관계' : '자유',
        instruction: prompt,
        contextContent,
        files,
        endpointId: targetEndpointId,
        model: targetModel,
      });

      if (outcome.status === 'success') {
        if (outcome.apply === 'codeBlock') {
          // 사실관계 정리 등: 결과를 코드블럭 노드로 삽입
          editor.chain().focus().insertContent({
            type: 'codeBlock',
            content: [{ type: 'text', text: outcome.markdown }],
          }).run();
        } else if (outcome.apply === 'replaceSection') { // Slice 1 섹션 교체 UI 전까지 삽입으로 반영
          editor.chain().focus().insertContent(outcome.markdown).run();
        } else {
          editor.chain().focus().insertContent(outcome.markdown).run();
        }


        notify({ type: outcome.pill.type, message: outcome.pill.message, duration: outcome.pill.duration });
      } else if (outcome.status === 'endpoint_failed') {
        notify({ type: outcome.pill.type, message: outcome.pill.message, duration: outcome.pill.duration });
        if (outcome.fallback) {
          setFallbackState({
            isOpen: true,
            failedEndpointName: outcome.fallback.failedEndpointName,
            nextEndpointId: outcome.fallback.nextEndpointId,
            nextEndpointName: outcome.fallback.nextEndpointName,
            pendingPrompt: prompt,
            pendingFiles: files,
            pendingExcludeContent: excludeContent,
            pendingWrapCodeBlock: wrapCodeBlock
          });
        } else {
          alert(`AI 생성 실패: ${outcome.error || '모든 엔드포인트 처리 실패'}`);
        }
      } else {
        notify({ type: outcome.pill.type, message: outcome.pill.message, duration: outcome.pill.duration });
      }
    } catch (e: any) {
      notify({ type: 'ai_error', message: 'AI 요청 오류', duration: 4500 });
    } finally {
      dismiss(loadingId);
      setAiLoading(false);
    }
  };

  const handleConfirmFallback = () => {
    const { pendingPrompt, pendingFiles, nextEndpointId, pendingExcludeContent, pendingWrapCodeBlock } = fallbackState;
    setFallbackState(prev => ({ ...prev, isOpen: false }));
    handleAiAction(pendingPrompt, pendingFiles, nextEndpointId, undefined, pendingExcludeContent, pendingWrapCodeBlock);
  };

  // Scrollspy to synchronize TOC active heading with document scroll
  useEffect(() => {
    const scrollContainer = document.getElementById('main-scroll-container');
    if (!scrollContainer || !tocHeadings || tocHeadings.length === 0) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const containerRect = scrollContainer.getBoundingClientRect();
        const headingElements = tocHeadings
          .map(h => {
            const el = (document.getElementById(h.id) || document.querySelector(`[data-id="${h.id}"]`)) as HTMLElement | null;
            return { id: h.id, el };
          })
          .filter((item): item is { id: string; el: HTMLElement } => Boolean(item.el));

        if (headingElements.length === 0) return;

        let currentActive = headingElements[0].id;
        for (const { id, el } of headingElements) {
          const rect = el.getBoundingClientRect();
          if (rect.top - containerRect.top <= 160) {
            currentActive = id;
          } else {
            break;
          }
        }
        setActiveHeadingId(currentActive);
      });
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [tocHeadings, activeNoteId]);

  const handleNavigateToHeading = useCallback((id: string) => {
    setActiveHeadingId(id);
    const container = document.getElementById('main-scroll-container');
    const target = document.getElementById(id) || document.querySelector(`[data-id="${id}"]`);
    if (container && target) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop = container.scrollTop + (targetRect.top - containerRect.top) - 24;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth'
      });
    } else if (target) {
      (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Memoize active node, breadcrumbs, and tag collection to avoid expensive
  // recursive fileSystem traversals on every render (e.g. scrollspy updates, status changes, zoom).
  const activeNode = useMemo(
    () => (activeNoteId ? findNode(fileSystem, activeNoteId) : null),
    [fileSystem, activeNoteId]
  );
  const breadcrumbs = useMemo(
    () => (activeNoteId ? findPath(fileSystem, activeNoteId) || [] : []),
    [fileSystem, activeNoteId]
  );
  const allTags = useMemo(
    () => collectTags(fileSystem),
    [fileSystem]
  );

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-white dark:bg-gray-950 text-[#37352f] dark:text-gray-100">

      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="no-print print:hidden fixed inset-0 bg-black/20 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`no-print
          fixed inset-y-0 left-0 z-40 h-full bg-[#F7F6F3] dark:bg-gray-900 border-r border-[#E9E9E7] dark:border-gray-800
          transition-all duration-300 ease-in-out
          md:relative overflow-hidden
          ${isSidebarOpen
          ? 'translate-x-0 w-64'
          : '-translate-x-full w-64 md:w-0 md:translate-x-0 md:border-none'
        }
      `}>
        <div className="w-64 h-full flex flex-col overflow-hidden relative">
          <Sidebar
            nodes={fileSystem}
            activeNoteId={activeNoteId}
            currentView={sidebarView}
            onChangeView={setSidebarView}
            onSelectNote={handleSelectNote}
            onCreateNode={createNode}
            onDeleteNode={deleteNode}
            trashItems={trashItems}
            onRestoreNode={restoreNode}
            onDeleteForever={deleteForever}
            onRenameNode={renameNode}
            onMoveNode={moveNode}
            appSettings={appSettings}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
          />
          {/* Sidebar Close Button (Desktop & Mobile) */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="absolute top-2 right-2 p-1 text-gray-500 hover:bg-gray-200 rounded z-50"
            title="Close Sidebar"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen supports-[height:100dvh]:h-[100dvh] overflow-hidden overscroll-none bg-white dark:bg-gray-900 transition-colors">
        {activeNode ? (
          <>
            <TopBar
              node={activeNode}
              breadcrumbs={breadcrumbs}
              onAiAction={handleAiAction}
              isAiLoading={aiLoading}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              onDelete={() => deleteNode(activeNode.id)}
              fileSystem={fileSystem}
              onMoveNode={moveNode}
              saveStatus={saveStatus}
              notifications={topBarNotifications}
              editorMode={editorMode}
              onSetEditorMode={setEditorMode}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onOpenAiEndpointSettings={() => setIsAiEndpointSettingsOpen(true)}
              onPrint={handlePrint}
              zoomLevel={zoomLevel}
              setZoomLevel={setZoomLevel}
            />

            {isNoteLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-gray-900 transition-colors select-none z-30">
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-gray-800 dark:text-gray-100 font-semibold text-base tracking-wide">로딩 중...</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">잠시만 기다려주세요...</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {editorMode === 'wysiwyg' && (
                  <div className="no-print shrink-0"><EditorToolbar editor={editor} /></div>
                )}

                <div
                  className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain relative bg-white dark:bg-gray-900 scroll-smooth"
                  id="main-scroll-container"
                >
                  <div className="flex justify-center items-start mx-auto px-4 sm:px-6 md:px-12 pt-4 pb-12 min-h-full transition-all duration-200">
                    <div
                      className="w-full max-w-[840px] xl:max-w-[900px] min-w-0"
                      style={{ zoom: `${zoomLevel}%` }}
                    >

                      {/* Title */}
                      <div className="group mb-2">
                        <input
                          type="text"
                          value={activeNode.name}
                          onChange={(e) => {
                            const newName = e.target.value;
                            if (activeNoteId) {
                              updateNode(activeNoteId, { name: newName });
                              notify({ type: 'tree_saved', message: '제목 변경 중...', duration: 1500 });
                            }
                          }}
                          onBlur={() => {
                            notify({ type: 'tree_saved', message: '제목 저장됨', duration: 2500 });
                          }}
                          readOnly={editorMode === 'viewer'}
                          placeholder="제목 없음"
                          spellCheck={false}
                          className="w-full text-[3rem] font-black text-[#37352f] dark:text-gray-100 placeholder-gray-300 outline-none border-none bg-transparent"
                        />
                      </div>

                      {/* Tags */}
                      <TagManager
                        tags={activeNode.tags || []}
                        onTagsChange={(tags) => activeNoteId && updateTags(activeNoteId, tags)}
                        suggestions={allTags}
                      />

                      <div className="lg:hidden print:block print-toc">
                        <TableOfContents
                          headings={tocHeadings}
                          onNavigate={handleNavigateToHeading}
                        />
                      </div>

                      {/* Editor/Preview */}
                      <div className="mt-4 h-full">
                        {editorMode === 'raw' && (
                          <textarea
                            className="w-full h-[calc(100vh-300px)] p-4 font-mono text-sm outline-none resize-none bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                            value={editorContent}
                            onChange={(e) => {
                              const newContent = e.target.value;
                              setEditorContent(newContent);
                              if (activeNoteId) scheduleSave(activeNoteId, newContent);
                            }}
                            placeholder="Type markdown here..."
                            spellCheck={false}
                          />
                        )}
                        {(editorMode === 'wysiwyg' || editorMode === 'viewer') && (
                          <TiptapEditor
                            key={activeNoteId + '-' + editorMode}
                            noteId={activeNoteId}
                            content={editorContent}
                            onChange={(noteId, newContent) => {
                              if (editorMode === 'viewer') return;
                              setEditorContent(newContent);
                              scheduleSave(noteId, newContent);
                            }}
                            setEditor={editorMode === 'viewer' ? () => { } : setEditor}
                            onTocUpdate={setTocHeadings}
                            editable={editorMode === 'wysiwyg'}
                            onAiAction={(prompt, opts) => handleAiAction(prompt, undefined, undefined, undefined, opts?.excludeContent, opts?.wrapCodeBlock)}
                            notify={notify}
                          />
                        )}
                      </div>
                    </div>

                    {/* Desktop Sticky Right TOC */}
                    <div className="hidden lg:block ml-4 xl:ml-8 shrink-0 sticky top-4">
                      <DesktopStickyToc
                        headings={tocHeadings}
                        title={activeNode.name}
                        activeId={activeHeadingId}
                        onNavigate={handleNavigateToHeading}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col dark:bg-gray-900">
            <div className="md:hidden absolute top-4 left-4">
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            </div>
            <p>노트를 눌러 편집을 시작하세요!</p>
            <div className="flex space-x-2 mt-4">
              <button
                onClick={() => createNode(undefined, 'note')}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                새 노트
              </button>
            </div>
          </div>
        )}
      </div>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={appSettings}
        onSave={handleSaveSettings}
        fileSystem={fileSystem}
        activeNoteId={activeNoteId}
        onMoveNode={moveNode}
        onRenameNode={renameNode}
        onDeleteNode={deleteNode}
      />

      <AiToastNotification
        isOpen={toastState.isOpen}
        endpointName={toastState.endpointName}
        modelUsed={toastState.modelUsed}
        onClose={() => setToastState(prev => ({ ...prev, isOpen: false }))}
      />

      <AiFallbackModal
        isOpen={fallbackState.isOpen}
        failedEndpointName={fallbackState.failedEndpointName}
        nextEndpointName={fallbackState.nextEndpointName}
        onConfirm={handleConfirmFallback}
        onCancel={() => setFallbackState(prev => ({ ...prev, isOpen: false }))}
      />

      <AiEndpointSettingsModal
        isOpen={isAiEndpointSettingsOpen}
        onClose={() => setIsAiEndpointSettingsOpen(false)}
      />
    </div>
  );
};

export default App;