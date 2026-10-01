import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, ChevronsUp, ChevronsDown, List } from 'lucide-react';

export interface TOCHeading {
  id: string;
  text: string;
  level: number;
  color?: string;
}

interface TOCProps {
  headings: TOCHeading[];
  onNavigate: (id: string) => void;
}

export const TableOfContents: React.FC<TOCProps> = ({ headings, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!headings || headings.length === 0) return null;

  return (
    <div className="mb-8 p-1 print:mb-4">
      <div className="flex items-center text-gray-500 dark:text-gray-400 text-sm font-medium mb-2 select-none">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer"
        >
          <span className="mr-1 no-print">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <span className="uppercase tracking-wider text-xs font-semibold">목차</span>
        </button>
      </div>

      <div className={`border-l-2 border-gray-100 dark:border-gray-800 pl-3 ml-1.5 space-y-1 ${isOpen ? 'block' : 'hidden print:block'}`}>
        {headings.map((header, index) => (
          <div
            key={header.id || index}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer truncate"
            style={{ paddingLeft: `${(header.level - 1) * 12}px` }}
            onClick={() => onNavigate(header.id)}
          >
            {header.color ? (
              <span className={`colored-bg-${header.color}`}>{header.text}</span>
            ) : (
              header.text
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export interface StickyTocProps {
  headings: TOCHeading[];
  title?: string;
  onNavigate: (id: string) => void;
  activeId?: string | null;
}

// 5-step cycle: H1 펼치기 -> H2 펼치기 -> 모두 펼치기 -> H2 접기 (H1만 남기기) -> H1 접기
type CycleStep = 'ALL_EXPANDED' | 'H2_COLLAPSED' | 'H1_COLLAPSED' | 'H1_EXPANDED' | 'H2_EXPANDED';

export const DesktopStickyToc: React.FC<StickyTocProps> = ({ headings, title, onNavigate, activeId }) => {
  if (!headings || headings.length === 0) return null;
  const containerRef = useRef<HTMLDivElement>(null);

  // States for collapse levels
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [collapsedH1s, setCollapsedH1s] = useState<Set<string>>(new Set());
  const [collapsedH2s, setCollapsedH2s] = useState<Set<string>>(new Set());
  const [collapsedH3s, setCollapsedH3s] = useState<Set<string>>(new Set());
  const [cycleStep, setCycleStep] = useState<CycleStep>('ALL_EXPANDED');

  // Compute hierarchy: which H1, H2, or H3 owns this item, and whether an item has children
  const itemsWithHierarchy = useMemo(() => {
    let currentH1Id: string | null = null;
    let currentH2Id: string | null = null;
    let currentH3Id: string | null = null;

    return headings.map((h, index) => {
      if (h.level === 1) {
        currentH1Id = h.id;
        currentH2Id = null;
        currentH3Id = null;
      } else if (h.level === 2) {
        currentH2Id = h.id;
        currentH3Id = null;
      } else if (h.level === 3) {
        currentH3Id = h.id;
      }

      let hasChildren = false;
      for (let i = index + 1; i < headings.length; i++) {
        if (headings[i].level <= h.level) break;
        hasChildren = true;
        break;
      }

      return {
        ...h,
        h1ParentId: h.level > 1 ? currentH1Id : null,
        h2ParentId: h.level > 2 ? currentH2Id : null,
        h3ParentId: h.level > 3 ? currentH3Id : null,
        hasChildren,
      };
    });
  }, [headings]);

  // Expandable sets
  const allH1Ids = useMemo(() => {
    return new Set(itemsWithHierarchy.filter(item => item.level === 1 && item.hasChildren).map(item => item.id));
  }, [itemsWithHierarchy]);

  const allH2Ids = useMemo(() => {
    return new Set(itemsWithHierarchy.filter(item => item.level === 2 && item.hasChildren).map(item => item.id));
  }, [itemsWithHierarchy]);

  const allH3Ids = useMemo(() => {
    return new Set(itemsWithHierarchy.filter(item => item.level === 3 && item.hasChildren).map(item => item.id));
  }, [itemsWithHierarchy]);

  // If activeId changes, automatically uncollapse parent H1 / H2 / H3 so active heading is visible
  useEffect(() => {
    if (!activeId) return;
    const activeItem = itemsWithHierarchy.find(item => item.id === activeId);
    if (!activeItem) return;

    if (activeItem.h1ParentId && collapsedH1s.has(activeItem.h1ParentId)) {
      setCollapsedH1s(prev => {
        const next = new Set(prev);
        next.delete(activeItem.h1ParentId!);
        return next;
      });
    }
    if (activeItem.h2ParentId && collapsedH2s.has(activeItem.h2ParentId)) {
      setCollapsedH2s(prev => {
        const next = new Set(prev);
        next.delete(activeItem.h2ParentId!);
        return next;
      });
    }
    if (activeItem.h3ParentId && collapsedH3s.has(activeItem.h3ParentId)) {
      setCollapsedH3s(prev => {
        const next = new Set(prev);
        next.delete(activeItem.h3ParentId!);
        return next;
      });
    }
  }, [activeId, itemsWithHierarchy]);

  // Synchronize TOC internal scroll with active heading
  useEffect(() => {
    if (!activeId || !containerRef.current || isPanelCollapsed) return;
    const activeEl = containerRef.current.querySelector(`[data-toc-id="${activeId}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeId, isPanelCollapsed]);

  // H1 단위 접기/열기
  const toggleH1 = (h1Id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedH1s(prev => {
      const next = new Set(prev);
      if (next.has(h1Id)) next.delete(h1Id);
      else next.add(h1Id);
      return next;
    });
  };

  // H2 단위 접기/열기
  const toggleH2 = (h2Id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedH2s(prev => {
      const next = new Set(prev);
      if (next.has(h2Id)) next.delete(h2Id);
      else next.add(h2Id);
      return next;
    });
  };

  // H3 단위 접기/열기
  const toggleH3 = (h3Id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedH3s(prev => {
      const next = new Set(prev);
      if (next.has(h3Id)) next.delete(h3Id);
      else next.add(h3Id);
      return next;
    });
  };

  // 5단계 위계 순환 처리: H1 펼치기 -> H2 펼치기 -> 모두 펼치기 -> H2 접기 (H1만 남기기) -> H1 접기
  const handleCycleFold = useCallback(() => {
    switch (cycleStep) {
      case 'ALL_EXPANDED':
        // Next: H2 접기 (H1만 남기기)
        setCollapsedH1s(new Set());
        setCollapsedH2s(new Set(allH2Ids));
        setCollapsedH3s(new Set(allH3Ids));
        setCycleStep('H2_COLLAPSED');
        break;

      case 'H2_COLLAPSED':
        // Next: H1 접기
        setCollapsedH1s(new Set(allH1Ids));
        setCollapsedH2s(new Set(allH2Ids));
        setCollapsedH3s(new Set(allH3Ids));
        setCycleStep('H1_COLLAPSED');
        break;

      case 'H1_COLLAPSED':
        // Next: H1 펼치기
        setCollapsedH1s(new Set());
        setCollapsedH2s(new Set(allH2Ids));
        setCollapsedH3s(new Set(allH3Ids));
        setCycleStep('H1_EXPANDED');
        break;

      case 'H1_EXPANDED':
        // Next: H2 펼치기
        setCollapsedH1s(new Set());
        setCollapsedH2s(new Set());
        setCollapsedH3s(new Set(allH3Ids));
        setCycleStep('H2_EXPANDED');
        break;

      case 'H2_EXPANDED':
      default:
        // Next: 모두 펼치기
        setCollapsedH1s(new Set());
        setCollapsedH2s(new Set());
        setCollapsedH3s(new Set());
        setCycleStep('ALL_EXPANDED');
        break;
    }
  }, [cycleStep, allH1Ids, allH2Ids, allH3Ids]);

  // Determine current button icon and tooltip based on next action
  const getCycleButtonProps = () => {
    switch (cycleStep) {
      case 'ALL_EXPANDED':
        return {
          icon: <ChevronUp size={13} />,
          title: 'H2 접기 (H1만 남기기)',
        };
      case 'H2_COLLAPSED':
        return {
          icon: <ChevronsUp size={13} />,
          title: 'H1 접기',
        };
      case 'H1_COLLAPSED':
        return {
          icon: <ChevronDown size={13} />,
          title: 'H1 펼치기',
        };
      case 'H1_EXPANDED':
        return {
          icon: <ChevronDown size={13} />,
          title: 'H2 펼치기',
        };
      case 'H2_EXPANDED':
      default:
        return {
          icon: <ChevronsDown size={13} />,
          title: '모두 펼치기',
        };
    }
  };

  // Compact, moderate indentation to prevent text truncation
  const getIndentClass = (level: number) => {
    switch (level) {
      case 1:
        return 'pl-1.5 font-semibold text-[11.5px]';
      case 2:
        return 'pl-3.5 font-medium text-[11px]';
      case 3:
        return 'pl-5 font-normal text-[10.5px]';
      case 4:
        return 'pl-6.5 font-normal text-[10px] text-gray-500 dark:text-gray-400';
      case 5:
        return 'pl-7.5 font-normal text-[9.5px] text-gray-400 dark:text-gray-500';
      case 6:
      default:
        return 'pl-8 font-normal text-[9px] text-gray-400 dark:text-gray-500';
    }
  };

  // If the whole TOC panel is minimized: Icon button only, no text label
  if (isPanelCollapsed) {
    return (
      <aside className="no-print select-none shrink-0" aria-label="목차">
        <button
          type="button"
          onClick={() => setIsPanelCollapsed(false)}
          className="p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md text-gray-500 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all hover:scale-110 flex items-center justify-center cursor-pointer"
          title="우측 목차 펼치기"
        >
          <List size={16} className="text-blue-500" />
        </button>
      </aside>
    );
  }

  const cycleButtonProps = getCycleButtonProps();

  return (
    <aside className="w-48 xl:w-56 shrink-0 no-print select-none transition-all duration-200" aria-label="목차">
      <div
        ref={containerRef}
        className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1 text-xs scroll-smooth bg-white/50 dark:bg-gray-900/50 backdrop-blur-xs p-2 rounded-xl border border-gray-100 dark:border-gray-800/80 shadow-xs"
      >
        {/* Header with Title and Global Actions */}
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="text-[11px] font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase">
              목차
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1 rounded-full bg-gray-100 dark:bg-gray-800 font-mono">
              {headings.length}
            </span>
          </div>

          <div className="flex items-center space-x-0.5">
            {/* Global hierarchy cycling button: icon only, no text */}
            <button
              type="button"
              onClick={handleCycleFold}
              className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              title={cycleButtonProps.title}
            >
              {cycleButtonProps.icon}
            </button>
            <button
              type="button"
              onClick={() => setIsPanelCollapsed(true)}
              className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              title="우측 목차 숨기기"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {title && (
          <div className="font-semibold text-gray-800 dark:text-gray-200 mb-2 truncate text-[11px] tracking-tight px-1" title={title}>
            {title}
          </div>
        )}

        <div className="border-l border-gray-200 dark:border-gray-800 space-y-0.5">
          {itemsWithHierarchy.map((header, index) => {
            // Check visibility based on H1, H2, and H3 collapse state
            if (header.level === 2 && header.h1ParentId && collapsedH1s.has(header.h1ParentId)) {
              return null;
            }
            if (header.level === 3) {
              if (header.h1ParentId && collapsedH1s.has(header.h1ParentId)) return null;
              if (header.h2ParentId && collapsedH2s.has(header.h2ParentId)) return null;
            }
            if (header.level >= 4) {
              if (header.h1ParentId && collapsedH1s.has(header.h1ParentId)) return null;
              if (header.h2ParentId && collapsedH2s.has(header.h2ParentId)) return null;
              if (header.h3ParentId && collapsedH3s.has(header.h3ParentId)) return null;
            }

            const isActive = activeId === header.id;
            const isH1Collapsed = collapsedH1s.has(header.id);
            const isH2Collapsed = collapsedH2s.has(header.id);
            const isH3Collapsed = collapsedH3s.has(header.id);
            const indentClass = getIndentClass(header.level);

            return (
              <div
                key={header.id || index}
                data-toc-id={header.id}
                onClick={() => onNavigate(header.id)}
                className={`py-1 pr-1.5 leading-relaxed cursor-pointer transition-all truncate rounded-r flex items-center group ${indentClass} ${isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold -ml-[1px] border-l-2 border-blue-500 bg-blue-50/60 dark:bg-blue-900/25'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                title={header.text}
              >
                {/* H1 단위 닫기 버튼 */}
                {header.level === 1 && header.hasChildren && (
                  <button
                    type="button"
                    onClick={(e) => toggleH1(header.id, e)}
                    className="w-3.5 h-3.5 mr-1 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded shrink-0 transition-transform"
                    title={isH1Collapsed ? "H1 하위 펼치기" : "H1 하위 접기"}
                  >
                    {isH1Collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                  </button>
                )}

                {/* H2 단위 닫기 버튼 */}
                {header.level === 2 && header.hasChildren && (
                  <button
                    type="button"
                    onClick={(e) => toggleH2(header.id, e)}
                    className="w-3.5 h-3.5 mr-1 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded shrink-0 transition-transform"
                    title={isH2Collapsed ? "H2 하위 펼치기" : "H2 하위 접기"}
                  >
                    {isH2Collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                  </button>
                )}

                {/* H3 단위 닫기 버튼 (H4 이상의 하위가 있는 경우) */}
                {header.level === 3 && header.hasChildren && (
                  <button
                    type="button"
                    onClick={(e) => toggleH3(header.id, e)}
                    className="w-3.5 h-3.5 mr-0.5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded shrink-0 transition-transform"
                    title={isH3Collapsed ? "H3 하위 펼치기" : "H3 하위 접기"}
                  >
                    {isH3Collapsed ? <ChevronRight size={9} /> : <ChevronDown size={9} />}
                  </button>
                )}

                {/* 하위 자식이 없는 H3 이하 항목의 섬세한 위계 인디케이터 도트 */}
                {header.level >= 3 && !header.hasChildren && (
                  <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mr-1.5 shrink-0 inline-block opacity-70" />
                )}

                <span className="truncate flex-1">
                  {header.color ? (
                    <span className={`colored-bg-${header.color}`}>{header.text}</span>
                  ) : (
                    header.text
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default TableOfContents;