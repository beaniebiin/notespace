import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold, Italic, List, ListOrdered,
  Code, Quote, Link as LinkIcon,
  ToggleLeft, Strikethrough, Underline as UnderlineIcon, Minus, Image as ImageIcon,
  Undo, Redo, Indent, Outdent, Highlighter, ChevronDown, Globe,
  Table as TableIcon, RowsIcon, ColumnsIcon, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  AlignLeft, AlignCenter, AlignRight, Layers, X,
  Maximize2, Type, Merge, Split, StretchHorizontal, StretchVertical, LayoutGrid
} from 'lucide-react';
import LinkModal from './LinkModal';
import ImageManagerModal from './ImageManagerModal';
import { createDefaultTabBlock, focusInsertedTabBlock } from './extensions/TabBlockUtils';
import { HIGHLIGHT_COLORS, tablePalette, cssVar } from '../services/highlight';

// Find the currently active table node and its document position with rock-solid fallbacks
const findActiveTable = (editor: Editor | null): { pos: number; node: any } | null => {
  if (!editor || editor.isDestroyed) return null;
  const { state } = editor.view;
  const { selection } = state;

  // 1. Check selection depths from $from
  for (let d = selection.$from.depth; d > 0; d--) {
    const node = selection.$from.node(d);
    if (node.type.name === 'table') {
      return { pos: selection.$from.before(d), node };
    }
  }

  // 2. Check $to depth
  for (let d = selection.$to.depth; d > 0; d--) {
    const node = selection.$to.node(d);
    if (node.type.name === 'table') {
      return { pos: selection.$to.before(d), node };
    }
  }

  // 3. In case of CellSelection ($anchorCell)
  if ((selection as any).$anchorCell) {
    const anchor = (selection as any).$anchorCell;
    for (let d = anchor.depth; d > 0; d--) {
      const node = anchor.node(d);
      if (node.type.name === 'table') {
        return { pos: anchor.before(d), node };
      }
    }
  }

  // 4. In case of NodeSelection (the table itself is selected)
  if ((selection as any).node && (selection as any).node.type.name === 'table') {
    return { pos: selection.from, node: (selection as any).node };
  }

  // 5. Fallback: Search table within or adjacent to selection range
  let found: { pos: number; node: any } | null = null;
  state.doc.nodesBetween(
    Math.max(0, selection.from - 2),
    Math.min(state.doc.content.size, selection.to + 2),
    (node, pos) => {
      if (node.type.name === 'table' && !found) {
        found = { pos, node };
        return false;
      }
    }
  );

  return found;
};

// Distribute table column widths evenly across the table width, fully supporting merged cells
// Resets fixed pixel widths (colwidth: null) to enforce a clean, 100% fluid responsive equal grid
const distributeTableColumns = (editor: Editor | null) => {
  if (!editor || editor.isDestroyed) return;
  const active = findActiveTable(editor);
  if (!active) return;

  const { state, dispatch } = editor.view;
  const { pos: tablePos, node: tableNode } = active;

  // 1. Assign colwidth = null to every cell in the table to eliminate fixed pixel overflow
  let tr = state.tr;
  tableNode.descendants((node: any, pos: number) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      tr = tr.setNodeMarkup(tablePos + 1 + pos, undefined, {
        ...node.attrs,
        colwidth: null,
      });
    }
  });

  dispatch(tr);

  // 2. Clear inline width styles from DOM table and col elements
  try {
    const tableDom = editor.view.nodeDOM(tablePos) as HTMLElement;
    if (tableDom) {
      tableDom.style.width = '100%';
      tableDom.style.minWidth = window.innerWidth < 640 ? '' : '100%'; // 좁은 화면은 CSS 반응형(표 가로 스크롤)에 맡긴다
      const cols = tableDom.querySelectorAll('colgroup col');
      cols.forEach(col => {
        (col as HTMLElement).style.width = '';
      });
    }
  } catch (e) {
    console.warn('Could not reset table DOM widths', e);
  }

  editor.commands.focus();
};

// Distribute / equalize table row heights (toggles between uniform height and natural auto-fit)
const distributeTableRows = (editor: Editor | null) => {
  if (!editor || editor.isDestroyed) return;
  const active = findActiveTable(editor);
  if (!active) return;

  const { state, dispatch } = editor.view;
  const { pos: tablePos, node: tableNode } = active;

  // 1. Check if any cell currently has custom height style
  let hasCustomHeight = false;
  tableNode.descendants((node: any) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      if (node.attrs.style && (node.attrs.style.includes('height:') || node.attrs.style.includes('height :'))) {
        hasCustomHeight = true;
        return false;
      }
    }
    return true;
  });

  let tr = state.tr;

  if (hasCustomHeight) {
    // Reset heights so rows auto-fit content naturally
    tableNode.descendants((node: any, pos: number) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const cleanedStyle = (node.attrs.style || '')
          .replace(/height\s*:\s*[^;]+;?/gi, '')
          .replace(/min-height\s*:\s*[^;]+;?/gi, '')
          .trim();
        tr = tr.setNodeMarkup(tablePos + 1 + pos, undefined, {
          ...node.attrs,
          style: cleanedStyle || null,
        });
      }
    });
  } else {
    // Measure row height, ignoring cells with rowspan > 1 to avoid excessive heights
    let maxRowHeight = 40;
    try {
      const tableDom = editor.view.nodeDOM(tablePos) as HTMLElement;
      if (tableDom) {
        const trEls = tableDom.querySelectorAll('tr');
        trEls.forEach(trEl => {
          if (trEl.offsetHeight > maxRowHeight && trEl.offsetHeight < 100) {
            maxRowHeight = trEl.offsetHeight;
          }
        });
      }
    } catch (e) {
      console.warn('Could not measure table row height', e);
    }

    tableNode.descendants((node: any, pos: number) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const rowspan = node.attrs.rowspan || 1;
        const targetHeight = maxRowHeight * rowspan;
        const currentStyle = (node.attrs.style || '')
          .replace(/height\s*:\s*[^;]+;?/gi, '')
          .replace(/min-height\s*:\s*[^;]+;?/gi, '')
          .trim();
        const newStyle = currentStyle
          ? `${currentStyle}; height: ${targetHeight}px;`
          : `height: ${targetHeight}px;`;
        tr = tr.setNodeMarkup(tablePos + 1 + pos, undefined, {
          ...node.attrs,
          style: newStyle,
        });
      }
    });
  }

  dispatch(tr);
  editor.commands.focus();
};

// Helper to check if currently focused / selected cell has small text
const isCurrentCellSmallText = (editor: Editor | null): boolean => {
  if (!editor || editor.isDestroyed) return false;
  const { state } = editor.view;
  const { selection } = state;

  // 1. Check from $from depth
  for (let d = selection.$from.depth; d > 0; d--) {
    const node = selection.$from.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      return node.attrs.fontSize === 'small';
    }
  }

  // 2. In case of CellSelection
  if ((selection as any).$anchorCell) {
    const anchor = (selection as any).$anchorCell;
    for (let d = anchor.depth; d > 0; d--) {
      const node = anchor.node(d);
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        return node.attrs.fontSize === 'small';
      }
    }
  }

  return false;
};

// Set font size for currently focused / selected cell(s) only
const setCellFontSize = (editor: Editor | null, size: 'normal' | 'small') => {
  if (!editor || editor.isDestroyed) return;
  editor
    .chain()
    .focus()
    .updateAttributes('tableCell', { fontSize: size })
    .updateAttributes('tableHeader', { fontSize: size })
    .run();
};

// Check if cells can be merged (multiple cells selected)
const canMergeCells = (editor: Editor | null): boolean => {
  if (!editor || editor.isDestroyed) return false;
  try {
    return editor.can().mergeCells();
  } catch {
    return false;
  }
};

// Check if current cell can be split (colspan > 1 || rowspan > 1)
const canSplitCell = (editor: Editor | null): boolean => {
  if (!editor || editor.isDestroyed) return false;
  try {
    return editor.can().splitCell();
  } catch {
    return false;
  }
};

// 9-position alignment matrix definition
const ALIGNMENT_MATRIX = [
  { id: 'top-left', align: 'left', valign: 'top', label: '상단 좌측', rect: { x: 2, y: 2 } },
  { id: 'top-center', align: 'center', valign: 'top', label: '상단 중앙', rect: { x: 5.5, y: 2 } },
  { id: 'top-right', align: 'right', valign: 'top', label: '상단 우측', rect: { x: 9, y: 2 } },
  { id: 'middle-left', align: 'left', valign: 'middle', label: '중앙 좌측', rect: { x: 2, y: 5.5 } },
  { id: 'middle-center', align: 'center', valign: 'middle', label: '정중앙', rect: { x: 5.5, y: 5.5 } },
  { id: 'middle-right', align: 'right', valign: 'middle', label: '중앙 우측', rect: { x: 9, y: 5.5 } },
  { id: 'bottom-left', align: 'left', valign: 'bottom', label: '하단 좌측', rect: { x: 2, y: 9 } },
  { id: 'bottom-center', align: 'center', valign: 'bottom', label: '하단 중앙', rect: { x: 5.5, y: 9 } },
  { id: 'bottom-right', align: 'right', valign: 'bottom', label: '하단 우측', rect: { x: 9, y: 9 } },
] as const;

// Set cell horizontal and vertical alignment simultaneously
const setTableCellAlignment = (
  editor: Editor | null,
  align: 'left' | 'center' | 'right',
  verticalAlign: 'top' | 'middle' | 'bottom'
) => {
  if (!editor || editor.isDestroyed) return;
  editor
    .chain()
    .focus()
    .updateAttributes('tableCell', { align, verticalAlign })
    .updateAttributes('tableHeader', { align, verticalAlign })
    .run();
};

// Get current cell alignment
const getActiveCellAlignment = (editor: Editor | null): { align: string; verticalAlign: string } => {
  if (!editor || editor.isDestroyed) return { align: 'left', verticalAlign: 'top' };
  const { state } = editor.view;
  const { selection } = state;

  for (let d = selection.$from.depth; d > 0; d--) {
    const node = selection.$from.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      return {
        align: node.attrs.align || 'left',
        verticalAlign: node.attrs.verticalAlign || 'top',
      };
    }
  }

  if ((selection as any).$anchorCell) {
    const anchor = (selection as any).$anchorCell;
    for (let d = anchor.depth; d > 0; d--) {
      const node = anchor.node(d);
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        return {
          align: node.attrs.align || 'left',
          verticalAlign: node.attrs.verticalAlign || 'top',
        };
      }
    }
  }

  return { align: 'left', verticalAlign: 'top' };
};

interface EditorToolbarProps {
  editor: Editor | null;
  onCopyLink?: () => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, onCopyLink }) => {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [showSpecialToolsMenu, setShowSpecialToolsMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isImageManagerOpen, setIsImageManagerOpen] = useState(false);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.heading-menu-container')) setShowHeadingMenu(false);
      if (!target.closest('.highlight-menu-container')) setShowHighlightMenu(false);
      if (!target.closest('.special-tools-container')) setShowSpecialToolsMenu(false);
      if (!target.closest('.table-menu-container')) setShowTableMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!editor || editor.isDestroyed || !(editor as any).commandManager) return null;

  const safeIsActive = (name: string, attributes?: Record<string, any>) => {
    if (!editor || editor.isDestroyed || !(editor as any).commandManager) return false;
    try {
      return editor.isActive(name, attributes);
    } catch (e) {
      return false;
    }
  };

  const safeCan = (fn: () => boolean) => {
    if (!editor || editor.isDestroyed || !(editor as any).commandManager) return false;
    try {
      return fn();
    } catch (e) {
      return false;
    }
  };

  const safeRun = (fn: () => void) => {
    if (!editor || editor.isDestroyed || !(editor as any).commandManager) return;
    try {
      fn();
    } catch (e) {
      console.warn("Skipped editor action due to unmounted state", e);
    }
  };

  // Get current heading label for 'p v' button
  const getCurrentHeadingLabel = () => {
    for (let level = 1; level <= 6; level++) {
      if (safeIsActive('heading', { level })) {
        return `H${level}`;
      }
    }
    return 'p';
  };

  const handleWebsiteBlockSubmit = async (url: string) => {
    let title = url;
    let favicon = '';
    let description = '';
    let image = '';

    try {
      const { urlPreviewService } = await import('../services/urlPreviewService');
      const data = await urlPreviewService.fetchMetadata(url);
      title = data.title || url;
      favicon = data.favicon || '';
      description = data.description || '';
      image = data.image || '';
    } catch (e) {
      console.error('Failed to fetch metadata, using fallback', e);
    }

    safeRun(() => {
      editor.chain().focus().insertContent({
        type: 'websiteBlock',
        attrs: {
          url,
          title,
          favicon,
          description,
          image
        }
      }).run();
    });
  };

  const isInTable = safeIsActive('table') || Boolean(findActiveTable(editor));
  const isAnyHighlightActive = safeIsActive('highlight');
  const activeCellAlign = getActiveCellAlignment(editor);

  return (
    <>
      <div className="toolbar-sticky flex flex-wrap items-center gap-1 p-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 w-full z-10 sticky top-12 text-sm">

        {/* 1. [제목크기] p v 드롭다운 (사례 2) */}
        <div className="relative heading-menu-container">
          <button
            onClick={() => setShowHeadingMenu(!showHeadingMenu)}
            className={`
              flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors
              border border-gray-200 dark:border-gray-700
              ${showHeadingMenu ? 'bg-blue-50 text-blue-600 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-750'}
            `}
            title="본문 및 제목 스타일 (Heading)"
          >
            <span>{getCurrentHeadingLabel()}</span>
            <ChevronDown size={12} className={`transition-transform duration-200 ${showHeadingMenu ? 'rotate-180' : ''}`} />
          </button>

          {showHeadingMenu && (
            <div className="absolute left-0 top-full mt-1.5 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-1.5 z-50 w-36 animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={() => {
                  safeRun(() => editor.chain().focus().setParagraph().run());
                  setShowHeadingMenu(false);
                }}
                className={`w-full text-center py-1 rounded text-xs transition-colors font-medium ${
                  !safeIsActive('heading')
                    ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                title="본문 (Paragraph)"
              >
                p
              </button>
              <div className="h-[1px] bg-gray-100 dark:bg-gray-700 my-1" />
              <div className="grid grid-cols-3 gap-1">
                {[
                  { level: 1, label: 'H1', style: 'text-sm font-extrabold' },
                  { level: 2, label: 'H2', style: 'text-xs font-bold' },
                  { level: 3, label: 'H3', style: 'text-xs font-semibold' },
                ].map(({ level, label, style }) => (
                  <button
                    key={level}
                    onClick={() => {
                      safeRun(() => editor.chain().focus().toggleHeading({ level: level as any }).run());
                      setShowHeadingMenu(false);
                    }}
                    className={`py-1 rounded flex items-center justify-center transition-colors ${style} ${
                      safeIsActive('heading', { level })
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    title={`제목 ${level} (H${level})`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1 mt-1">
                {[
                  { level: 4, label: 'H4', style: 'text-xs font-medium' },
                  { level: 5, label: 'H5', style: 'text-xs' },
                  { level: 6, label: 'H6', style: 'text-xs text-gray-500 dark:text-gray-400' },
                ].map(({ level, label, style }) => (
                  <button
                    key={level}
                    onClick={() => {
                      safeRun(() => editor.chain().focus().toggleHeading({ level: level as any }).run());
                      setShowHeadingMenu(false);
                    }}
                    className={`py-1 rounded flex items-center justify-center transition-colors ${style} ${
                      safeIsActive('heading', { level })
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    title={`제목 ${level} (H${level})`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. [글꼴세팅] Bold, Italic, Underline, Strike */}
        <ToolbarBtn
          icon={<Bold size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().toggleBold().run())}
          isActive={safeIsActive('bold')}
          label="굵게 (Bold, Ctrl+B)"
        />
        <ToolbarBtn
          icon={<Italic size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().toggleItalic().run())}
          isActive={safeIsActive('italic')}
          label="기울임 (Italic, Ctrl+I)"
        />
        <ToolbarBtn
          icon={<UnderlineIcon size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().toggleUnderline().run())}
          isActive={safeIsActive('underline')}
          label="밑줄 (Underline, Ctrl+U)"
        />
        <ToolbarBtn
          icon={<Strikethrough size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().toggleStrike().run())}
          isActive={safeIsActive('strike')}
          label="취소선 (Strikethrough)"
        />

        {/* 3. [형광펜] 색상 선택 팝오버 (사례 3) */}
        <div className="relative highlight-menu-container">
          <button
            onClick={() => setShowHighlightMenu(!showHighlightMenu)}
            className={`
              p-1.5 rounded transition-colors flex items-center gap-0.5
              ${isAnyHighlightActive
                ? 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'text-gray-600 hover:bg-gray-100 hover:text-black dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
              }
            `}
            title="형광펜 (Highlight)"
          >
            <Highlighter size={16} />
          </button>

          {showHighlightMenu && (
            <div className="absolute left-0 top-full mt-1.5 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-2 z-50 w-[116px] min-w-[116px] animate-in fade-in zoom-in-95 duration-150">
              <div className="grid grid-cols-3 gap-1.5 w-full justify-items-center">
                {HIGHLIGHT_COLORS.map(c => (
                  <button
                    key={c.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    style={{ backgroundColor: cssVar(c.name), borderColor: c.border }}
                    className="w-7 h-7 shrink-0 rounded-lg border hover:scale-110 transition-transform shadow-xs flex items-center justify-center cursor-pointer"
                    title={c.label}
                    onClick={() => {
                      safeRun(() => editor.chain().focus().toggleMark('highlight', { color: c.name }).run());
                      setShowHighlightMenu(false);
                    }}
                  />
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    safeRun(() => editor.chain().focus().unsetHighlight().run());
                    setShowHighlightMenu(false);
                  }}
                  className="w-7 h-7 shrink-0 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:scale-110 hover:border-gray-400 dark:hover:border-gray-500 transition-all flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shadow-xs cursor-pointer"
                  title="형광펜 제거"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. 구분선 (bar) */}
        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

        {/* 5. [bullet과 넘버링] */}
        <ToolbarBtn
          icon={<List size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().toggleBulletList().run())}
          isActive={safeIsActive('bulletList')}
          label="글머리 기호 목록 (Bullet List)"
        />
        <ToolbarBtn
          icon={<ListOrdered size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().toggleOrderedList().run())}
          isActive={safeIsActive('orderedList')}
          label="번호 매기기 목록 (Numbered List)"
        />

        {/* 7. [문단 조정] Outdent / Indent */}
        <ToolbarBtn
          icon={<Outdent size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().liftListItem('listItem').run())}
          disabled={!safeCan(() => editor.can().liftListItem('listItem'))}
          label="내어쓰기 (Outdent, Shift+Tab)"
        />
        <ToolbarBtn
          icon={<Indent size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().sinkListItem('listItem').run())}
          disabled={!safeCan(() => editor.can().sinkListItem('listItem'))}
          label="들여쓰기 (Indent, Tab)"
        />

        {/* 8. [특수기능] 팝오버 드롭다운 (인용구, 코드, 웹링크, 객관식, OX, 이미지, 토글) */}
        <div className="relative special-tools-container">
          <button
            onClick={() => setShowSpecialToolsMenu(!showSpecialToolsMenu)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
              border border-gray-200 dark:border-gray-700
              ${showSpecialToolsMenu ? 'bg-purple-50 text-purple-600 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750'}
            `}
            title="특수 블록 및 도구 삽입 (Special Tools)"
          >
            <Layers size={14} className="text-purple-600 dark:text-purple-400" />
            <ChevronDown size={12} className={`transition-transform duration-200 ${showSpecialToolsMenu ? 'rotate-180' : ''}`} />
          </button>

          {showSpecialToolsMenu && (
            <div className="absolute left-auto right-0 sm:left-0 sm:right-auto top-full mt-1.5 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-2 z-50 w-auto animate-in fade-in zoom-in-95 duration-150">
              <div className="flex flex-col gap-1.5">
                {/* 1행: 블록 서식 (Quote, Code, Toggle) */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      safeRun(() => editor.chain().focus().toggleBlockquote().run());
                      setShowSpecialToolsMenu(false);
                    }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      safeIsActive('blockquote')
                        ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="인용구 (Quote)"
                  >
                    <Quote size={16} />
                  </button>

                  <button
                    onClick={() => {
                      safeRun(() => editor.chain().focus().toggleCodeBlock().run());
                      setShowSpecialToolsMenu(false);
                    }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      safeIsActive('codeBlock')
                        ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="코드 블럭 (Code Block)"
                  >
                    <Code size={16} />
                  </button>

                  <button
                    onClick={() => {
                      safeRun(() => editor.chain().focus().insertContent('<details><summary>토글 목록</summary><p>내용을 입력하세요</p></details>').run());
                      setShowSpecialToolsMenu(false);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="토글 목록 (Toggle)"
                  >
                    <ToggleLeft size={16} />
                  </button>
                </div>

                {/* 2행: 외부 링크 & 미디어 + 탭 블록 (Globe, Image, Tab) */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setIsLinkModalOpen(true);
                      setShowSpecialToolsMenu(false);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                    title="웹 링크 / 북마크 카드"
                  >
                    <Globe size={16} />
                  </button>

                  <button
                    onClick={() => {
                      setIsImageManagerOpen(true);
                      setShowSpecialToolsMenu(false);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                    title="이미지 매니저 / 업로드"
                  >
                    <ImageIcon size={16} />
                  </button>

                  <button
                    onClick={() => {
                      safeRun(() => {
                        const json = createDefaultTabBlock();
                        editor.chain().focus().insertContent(json).run();
                        focusInsertedTabBlock(editor, json.attrs.blockId);
                      });
                      setShowSpecialToolsMenu(false);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="탭 블록 삽입 (Tab Block)"
                  >
                    <LayoutGrid size={16} />
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* 9. 구분선 (bar) */}
        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

        {/* 10. [표] */}
        <div className="relative table-menu-container">
          <ToolbarBtn
            icon={<TableIcon size={16} />}
            onClick={() => {
              safeRun(() => {
                if (isInTable) {
                  setShowTableMenu(!showTableMenu);
                } else {
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                }
              });
            }}
            isActive={isInTable}
            label={isInTable ? "Table Options" : "Insert Table"}
          />

          {showTableMenu && isInTable && (
            <div className="absolute left-auto right-0 sm:left-0 sm:right-auto top-full mt-1.5 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-2.5 z-50 w-[212px] min-w-[212px] max-w-[calc(100vw-2rem)] animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-2">
              {/* 1행: 행/열 추가 (4개) */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => { editor.chain().focus().addRowBefore().run(); })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title="행 추가 (위)"
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => { editor.chain().focus().addRowAfter().run(); })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title="행 추가 (아래)"
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => { editor.chain().focus().addColumnBefore().run(); })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title="열 추가 (왼쪽)"
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => { editor.chain().focus().addColumnAfter().run(); })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title="열 추가 (오른쪽)"
                >
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="h-[1px] bg-gray-100 dark:bg-gray-700" />

              {/* 2행: 셀 병합/분할 및 너비/높이 균일화 */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => safeRun(() => editor.chain().focus().mergeCells().run())}
                    disabled={!canMergeCells(editor)}
                    className={`px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors ${
                      canMergeCells(editor)
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer shadow-2xs'
                        : 'opacity-35 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                    title="선택된 셀 병합 (Merge Cells)"
                  >
                    <Merge size={13} />
                    <span>병합</span>
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => safeRun(() => editor.chain().focus().splitCell().run())}
                    disabled={!canSplitCell(editor)}
                    className={`px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors ${
                      canSplitCell(editor)
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer shadow-2xs'
                        : 'opacity-35 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                    title="병합된 셀 분할 (Split Cell)"
                  >
                    <Split size={13} />
                    <span>분할</span>
                  </button>
                </div>

                <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => safeRun(() => distributeTableColumns(editor))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    title="열 너비 균일화 (100% 균등 분배)"
                  >
                    <StretchHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => safeRun(() => distributeTableRows(editor))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    title="행 높이 균일화"
                  >
                    <StretchVertical size={14} />
                  </button>
                </div>
              </div>

              <div className="h-[1px] bg-gray-100 dark:bg-gray-700" />

              {/* 3행: 9개 셀 정렬 매트릭스 (수평 3 × 수직 3) */}
              <div className="bg-gray-50 dark:bg-gray-750/50 p-1.5 rounded-xl border border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 px-0.5">
                  <span className="font-medium">셀 내부 정렬 (3×3)</span>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                    {ALIGNMENT_MATRIX.find(m => m.align === activeCellAlign.align && m.valign === activeCellAlign.verticalAlign)?.label || '상단 좌측'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 justify-items-center">
                  {ALIGNMENT_MATRIX.map(item => {
                    const isSelected = activeCellAlign.align === item.align && activeCellAlign.verticalAlign === item.valign;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => safeRun(() => setTableCellAlignment(editor, item.align, item.valign))}
                        className={`w-full py-1 rounded-md flex items-center justify-center transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/60 dark:text-purple-300 dark:border-purple-500 font-semibold shadow-xs'
                            : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                        title={item.label}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                          <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
                          <rect x={item.rect.x} y={item.rect.y} width="5" height="5" rx="1" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-[1px] bg-gray-100 dark:bg-gray-700" />

              {/* 4행: 글씨 크기 (셀 단위: 기본 vs 작게) */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/60 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => {
                    setCellFontSize(editor, 'normal');
                  })}
                  className={`flex-1 py-1 px-1.5 rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    !isCurrentCellSmallText(editor)
                      ? 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-300 shadow-sm font-semibold'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                  title="선택된 셀 기본 글씨 (1.15rem, 400)"
                >
                  <Type size={13} />
                  <span>기본</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => {
                    setCellFontSize(editor, 'small');
                  })}
                  className={`flex-1 py-1 px-1.5 rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    isCurrentCellSmallText(editor)
                      ? 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-300 shadow-sm font-semibold'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                  title="선택된 셀 작은 글씨 (1.05rem, 300)"
                >
                  <Type size={11} />
                  <span>작게</span>
                </button>
              </div>

              <div className="h-[1px] bg-gray-100 dark:bg-gray-700" />

              {/* 5행: 셀 배경색 (6색 + ✕ 초기화, '배경색' 텍스트 제거) */}
              <div className="flex items-center gap-1.5 justify-between px-0.5">
                {tablePalette().map(c => (
                  <button
                    key={c.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 hover:scale-115 transition-transform cursor-pointer"
                    style={{ backgroundColor: cssVar(c.name) }}
                    title={`${c.label} 배경색`}
                    onClick={() => safeRun(() => {
                      editor.chain().focus().updateAttributes('tableCell', { backgroundColor: c.name }).updateAttributes('tableHeader', { backgroundColor: c.name }).run();
                    })}
                  />
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 bg-white text-[10px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:scale-115 transition-all dark:bg-gray-700 dark:text-gray-300 cursor-pointer"
                  title="배경색 제거"
                  onClick={() => safeRun(() => {
                    editor.chain().focus().updateAttributes('tableCell', { backgroundColor: null }).updateAttributes('tableHeader', { backgroundColor: null }).run();
                  })}
                >
                  ✕
                </button>
              </div>

              <div className="h-[1px] bg-gray-100 dark:bg-gray-700" />

              {/* 6행: 행/열/표 삭제 (3개 버튼 - Danger) */}
              <div className="flex items-center justify-around gap-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => { editor.chain().focus().deleteRow().run(); })}
                  className="flex-1 py-1 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                  title="행 삭제"
                >
                  <RowsIcon size={15} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => { editor.chain().focus().deleteColumn().run(); })}
                  className="flex-1 py-1 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                  title="열 삭제"
                >
                  <ColumnsIcon size={15} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => safeRun(() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); })}
                  className="flex-1 py-1 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                  title="표 삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 11. [구분선 (Divider)] - 사용자 요청: "divider를 표 버튼 옆으로 옮겨야해." */}
        <ToolbarBtn
          icon={<Minus size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().setHorizontalRule().run())}
          label="구분선 (Divider)"
        />

        {/* 12. [middle-bar / 뒤쪽 도구들] Undo, Redo */}
        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarBtn
          icon={<Undo size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().undo().run())}
          disabled={!safeCan(() => editor.can().undo())}
          label="실행 취소 (Undo, Ctrl+Z)"
        />
        <ToolbarBtn
          icon={<Redo size={16} />}
          onClick={() => safeRun(() => editor.chain().focus().redo().run())}
          disabled={!safeCan(() => editor.can().redo())}
          label="다시 실행 (Redo, Ctrl+Y)"
        />
      </div>

      <LinkModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onSubmit={handleWebsiteBlockSubmit}
        title="Add Website Bookmark"
      />

      <ImageManagerModal
        isOpen={isImageManagerOpen}
        onClose={() => setIsImageManagerOpen(false)}
        editor={editor}
      />
    </>
  );
};

const ToolbarBtn: React.FC<{
  icon: React.ReactNode,
  onClick: () => void,
  label: string,
  isActive?: boolean,
  disabled?: boolean
}> = ({ icon, onClick, label, isActive, disabled }) => (
  <button
    onClick={(e) => { e.preventDefault(); onClick(); }}
    disabled={disabled}
    className={`
      p-1.5 rounded transition-colors
      ${isActive ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-gray-600 hover:bg-gray-100 hover:text-black dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'}
      ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
    `}
    title={label}
  >
    {icon}
  </button>
);

export default EditorToolbar;
