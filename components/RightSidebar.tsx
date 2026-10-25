import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { TOCHeading, DesktopStickyToc } from './TableOfContents';
import { computeTextStatistics } from '../services/textStatistics';
import {
  RightSidebarPlugin,
  RightSidebarContext,
} from './right-sidebar/RightSidebarTypes';
import { defaultRightSidebarPlugins } from './right-sidebar/plugins';

export interface RightSidebarProps {
  isOpen: boolean;
  onToggle?: () => void;
  headings: TOCHeading[];
  activeHeadingId?: string | null;
  onNavigateHeading: (id: string) => void;
  activeNoteId: string | null;
  activeNoteTitle?: string;
  editorContent: string;
  plugins?: RightSidebarPlugin[];
  defaultTabId?: string;
  className?: string;
  onNavigateLink?: (targetNoteId?: string | null, targetSectionId?: string | null) => void;
  onInsertMarkdown?: (markdown: string) => void;
  onAiAction?: (
    prompt: string,
    files?: { mimeType: string; data: string; name?: string }[],
    endpointId?: string | number,
    model?: string,
    excludeContent?: boolean,
    wrapCodeBlock?: boolean,
    systemInstruction?: string
  ) => void;
  isAiLoading?: boolean;
  onOpenAiEndpointSettings?: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  onToggle,
  headings,
  activeHeadingId,
  onNavigateHeading,
  activeNoteId,
  activeNoteTitle = '현재 문서',
  editorContent,
  plugins = defaultRightSidebarPlugins,
  defaultTabId = 'idea',
  className = '',
  onNavigateLink = () => { },
  onInsertMarkdown,
  onAiAction,
  isAiLoading = false,
  onOpenAiEndpointSettings,
}) => {
  // Active Tab state
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('notespace_right_sidebar_tab');
      return saved || defaultTabId;
    } catch {
      return defaultTabId;
    }
  });

  // Plugin Area Collapsible Visibility state
  const [isPluginAreaVisible, setIsPluginAreaVisible] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('notespace_right_sidebar_plugin_visible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleTogglePluginArea = useCallback(() => {
    setIsPluginAreaVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('notespace_right_sidebar_plugin_visible', String(next));
      } catch { }
      return next;
    });
  }, []);

  const handleSelectTab = (id: string) => {
    if (activeTabId === id && isPluginAreaVisible) {
      handleTogglePluginArea();
      return;
    }
    setActiveTabId(id);
    setIsPluginAreaVisible(true);
    try {
      localStorage.setItem('notespace_right_sidebar_tab', id);
      localStorage.setItem('notespace_right_sidebar_plugin_visible', 'true');
    } catch { }
  };

  // Compute live word/character statistics
  const statistics = useMemo(() => computeTextStatistics(editorContent), [editorContent]);

  // Active Plugin definition
  const activePlugin = useMemo(() => {
    return plugins.find((p) => p.id === activeTabId) || plugins[0];
  }, [plugins, activeTabId]);

  // Context for plugins
  const context: RightSidebarContext = useMemo(
    () => ({
      activeNoteId,
      activeNoteTitle,
      editorContent,
      statistics,
      onNavigateLink,
      onInsertMarkdown,
      onAiAction,
      isAiLoading,
      onOpenAiEndpointSettings,
    }),
    [
      activeNoteId,
      activeNoteTitle,
      editorContent,
      statistics,
      onNavigateLink,
      onInsertMarkdown,
      onAiAction,
      isAiLoading,
      onOpenAiEndpointSettings,
    ]
  );

  return (
    <aside
      className={`no-print select-none h-full bg-[#fafafa] dark:bg-[#141414] border-l border-gray-200/60 dark:border-gray-800/60
        fixed inset-y-0 right-0 z-40 max-w-[85vw]
        md:relative md:z-10 md:max-w-none
        transition-all duration-300 ease-in-out flex flex-col shrink-0 overflow-hidden
        ${isOpen
          ? 'translate-x-0 w-72 md:w-64 xl:w-72 opacity-100 shadow-2xl md:shadow-none'
          : 'translate-x-full w-72 md:w-0 md:translate-x-0 opacity-0 md:opacity-0 pointer-events-none border-l-0 md:border-l-0'
        } ${className}`}
      aria-label="우측 사이드바"
    >
      {/* 1. Header Bar: Title (h-11 matches TopBar exactly; close is unified with TopBar button on desktop) */}
      <div className="h-11 shrink-0 flex items-center justify-between px-3.5 border-b border-[#eef0f2] dark:border-[#262626] text-xs">
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="font-semibold text-xs tracking-wide text-gray-700 dark:text-gray-300 truncate">
            목차
          </span>
        </div>

        {/* Mobile-only close button */}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="md:hidden p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            title="우측 사이드바 닫기"
            aria-label="우측 사이드바 닫기"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* 2. Top Area: Table of Contents (TOC) */}
      <div className={`${isPluginAreaVisible ? 'flex-[65]' : 'flex-1'} min-h-0 flex flex-col overflow-hidden px-2 pt-2 transition-all duration-200`}>
        {headings && headings.length > 0 ? (
          <DesktopStickyToc
            headings={headings}
            title={activeNoteTitle}
            activeId={activeHeadingId}
            onNavigate={onNavigateHeading}
            hideCollapseButton={true}
            className="w-full flex-1 min-h-0 flex flex-col"
            containerClassName="h-full overflow-y-auto pr-1 text-xs scroll-smooth border-none bg-transparent shadow-none p-1 custom-scrollbar"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center text-gray-400/70 dark:text-gray-500/70">
            <span className="text-[11px] leading-relaxed">목차가 없습니다</span>
          </div>
        )}
      </div>

      {/* 3. Middle Area Divider & Pluggable Tab Header */}
      {isPluginAreaVisible && (
        <div className="shrink-0 px-2 py-1.5 border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-850/30">
          <div className="flex items-center justify-between gap-1">
            {/* Segmented Icon-Only Tab Bar (Compact buttons + overflow-x scroll guard) */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-200/50 dark:bg-gray-800/60 overflow-x-auto no-scrollbar flex-1 min-w-0">
              {plugins.map((plugin) => {
                const Icon = plugin.icon;
                const isActive = plugin.id === activeTabId;
                const badge = plugin.badge ? plugin.badge(context) : undefined;

                return (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => handleSelectTab(plugin.id)}
                    className={`relative w-7 h-7 shrink-0 rounded-md transition-all duration-150 cursor-pointer flex items-center justify-center ${isActive
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-2xs'
                      : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    title={plugin.tooltip || plugin.title}
                    aria-label={plugin.title}
                  >
                    <Icon size={14} />
                    {badge !== undefined && (
                      <span
                        className={`absolute -top-1 -right-1 text-[9px] font-mono px-1 rounded-full leading-tight ${isActive
                          ? 'bg-blue-100 dark:bg-blue-900/80 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Collapse / Hide Plugin Block Button */}
            <button
              type="button"
              onClick={handleTogglePluginArea}
              className="w-7 h-7 shrink-0 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer flex items-center justify-center"
              title="플러그인 블록 접기"
              aria-label="플러그인 블록 접기"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 4. Lower Area (~35%): Active Plugin Content */}
      {isPluginAreaVisible && (
        <div className="flex-[35] min-h-0 flex flex-col overflow-hidden p-2 bg-transparent text-[13.6px]">
          {activePlugin ? (
            activePlugin.render(context)
          ) : (
            <div className="p-3 text-[13.5px] text-gray-400">선택된 플러그인이 없습니다.</div>
          )}
        </div>
      )}

      {/* When plugin area is hidden: '화살표 + 플러그인 표시' toggle button above status bar */}
      {!isPluginAreaVisible && (
        <button
          type="button"
          onClick={handleTogglePluginArea}
          className="shrink-0 w-full py-1.5 px-3 border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/70 dark:bg-gray-850/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-[12.5px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors flex items-center justify-between cursor-pointer select-none"
          title="플러그인 블록 펼치기"
        >
          <div className="flex items-center gap-1.5">
            <ChevronUp size={14} className="text-gray-400" />
            <span>플러그인 표시</span>
          </div>
          {activePlugin && (
            <div className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
              <activePlugin.icon size={13} />
              <span>{activePlugin.title}</span>
            </div>
          )}
        </button>
      )}

      {/* 5. Bottom Status Bar: Obsidian Minimal Style */}
      <div className="h-7 shrink-0 flex items-center justify-end px-3 text-[11.5px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800/80 bg-[#fafafa]/90 dark:bg-[#141414]/90 select-none">
        <div className="flex items-center space-x-1.5 shrink-0">
          <span title="단어 수">{statistics.words} 단어</span>
          <span className="opacity-40">·</span>
          <span title="글자 수">{statistics.characters} 자</span>
        </div>
      </div>
    </aside>
  );
};

export default RightSidebar;
