import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, Editor, Node, mergeAttributes, Extension } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import Blockquote from '@tiptap/extension-blockquote';
import HardBreak from '@tiptap/extension-hard-break';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { ImageBlock } from './extensions/ImageBlock';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Markdown } from 'tiptap-markdown';
import { normalizeColor, blockSwatches } from '../services/highlight';
import { v4 as uuidv4 } from 'uuid';
import { getHTMLFromFragment } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';

import { WebsiteBlock } from './extensions/WebsiteBlock';
import { TabBlock, TabItem } from './extensions/TabBlock';
import { Plugin } from '@tiptap/pm/state';
import {
  SLASH_COMMANDS,
  SlashAiInput,
  SlashCommandId,
  SlashCommandMenu,
  filterSlashCommands,
} from './SlashCommandMenu';
import ImageManagerModal from './ImageManagerModal';
import LinkModal from './LinkModal';
import { createDefaultTabBlock, focusInsertedTabBlock } from './extensions/TabBlockUtils';
import type { NotifyInput } from '../services/notifications';

// Clean corrupted markdown (corrupted tables, stray backslashes in headings, unneeded HTML headings)
export const cleanMarkdownContent = (md: string): string => {
  if (!md) return md;
  let cleaned = md;

  // 1. Fix raw **bold** inside <td>/<th> HTML tags
  cleaned = cleaned.replace(/(<(?:td|th)[^>]*>)([\s\S]*?)(<\/(?:td|th)>)/gi, (match, openTag, inner, closeTag) => {
    let fixedInner = inner.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    fixedInner = fixedInner.replace(/\\+(\s*(?=<br|$))/gi, '<br>');
    fixedInner = fixedInner.replace(/\\+\s+/g, '<br>');
    return `${openTag}${fixedInner}${closeTag}`;
  });

  // 2. Fix stray backslashes used as line breaks in pipe table rows
  cleaned = cleaned.replace(/^(\|.+?\|)$/gm, (row) => {
    let fixedRow = row.replace(/\\+(\s*(?=\||<br))/gi, '<br>');
    fixedRow = fixedRow.replace(/\\+\s+/g, '<br>');
    return fixedRow;
  });

  // 3. Remove fixed pixel colgroups and uniform colwidths when all columns have identical widths,
  // preventing unwanted horizontal overflow / scrollbars on responsive widths (e.g. 840px breakpoint)
  cleaned = cleaned.replace(/<table([\s\S]*?)<\/table>/gi, (tableHtml) => {
    const colgroupMatch = tableHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
    if (!colgroupMatch) return tableHtml;

    const colTags = colgroupMatch[1].match(/<col[^>]*>/gi) || [];
    if (colTags.length === 0) return tableHtml;

    const widths = colTags.map(col => {
      const wMatch = col.match(/width:\s*(\d+)px/i);
      return wMatch ? parseInt(wMatch[1], 10) : null;
    });

    const allHaveWidth = widths.every(w => w !== null);
    const allSameWidth = allHaveWidth && widths.every(w => w === widths[0]);

    if (allSameWidth) {
      let fixedTable = tableHtml.replace(/<colgroup>[\s\S]*?<\/colgroup>/i, '');
      fixedTable = fixedTable.replace(/\s+colwidth="[^"]*"/gi, '');
      return fixedTable;
    }

    return tableHtml;
  });

  // 4. Heal corrupted headings with stray backslashes before numbers/dots
  // 4a. HTML headings without color: convert back to standard markdown # and strip stray backslashes
  cleaned = cleaned.replace(/<h([1-6])(?:\s+id="[^"]*")?\s*>(.*?)<\/h\1>/gi, (match, level, inner) => {
    if (match.includes('data-color') || match.includes('colored-bg-')) return match;
    const cleanedInner = inner.replace(/(\d+)(?:\\+)\./g, '$1.');
    return '#'.repeat(parseInt(level, 10)) + ' ' + cleanedInner;
  });

  // 4b. HTML headings with custom data-color: keep tag, fix stray backslashes inside inner text
  cleaned = cleaned.replace(/(<h[1-6][^>]*data-color[^>]*>)(.*?)(<\/h[1-6]>)/gi, (match, open, inner, close) => {
    const cleanedInner = inner.replace(/(\d+)(?:\\+)\./g, '$1.');
    return `${open}${cleanedInner}${close}`;
  });

  // 4c. Standard markdown headings: fix stray backslashes in numbering
  cleaned = cleaned.replace(/^(#{1,6}\s+.*)$/gm, (match) => {
    return match.replace(/(\d+)(?:\\+)\./g, '$1.');
  });

  return cleaned;
};

// Backwards compatibility alias
export const cleanTableMarkdown = cleanMarkdownContent;

// 이름 기반 형광펜 (D2): color attr에는 정준 이름만 저장하고, 구 rgba 유입은 파싱 시 정규화
const NameHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => normalizeColor(element.getAttribute('data-color') || element.style?.backgroundColor),
        renderHTML: (attributes: any) => (attributes.color ? { 'data-color': attributes.color } : {}),
      },

    };
  },
});

// Custom HardBreak: In tables, always serialize to <br> to keep table pipe syntax valid and prevent backslash leaks
const CustomHardBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any, parent: any, index: number) {
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              state.write(state.inTable ? '<br>' : '\\\n');
              return;
            }
          }
        },
        parse: {
          // handled by markdown-it
        }
      }
    };
  }
});

// Custom Tab Indent Extension
const TabIndent = Extension.create({
  name: 'tabIndent',
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.sinkListItem('listItem'),
      'Shift-Tab': () => this.editor.commands.liftListItem('listItem'),
    }
  },
});

// Heading Shortcuts (Ctrl+1 ~ Ctrl+6 / Cmd+1 ~ Cmd+6)
const HeadingShortcuts = Extension.create({
  name: 'headingShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-1': () => this.editor.commands.toggleHeading({ level: 1 }),
      'Mod-2': () => this.editor.commands.toggleHeading({ level: 2 }),
      'Mod-3': () => this.editor.commands.toggleHeading({ level: 3 }),
      'Mod-4': () => this.editor.commands.toggleHeading({ level: 4 }),
      'Mod-5': () => this.editor.commands.toggleHeading({ level: 5 }),
      'Mod-6': () => this.editor.commands.toggleHeading({ level: 6 }),
    };
  },
});

// Compress and persist pasted/dropped images to local storage as WebP
const compressAndUploadImage = async (file: File): Promise<string | null> => {
  try {
    const { imageStorageService } = await import('../services/imageStorageService');
    const record = await imageStorageService.compressAndStoreImage(file);
    return record.url;
  } catch (err) {
    console.error('Image paste compression failed:', err);
    return null;
  }
};

const ImagePasteDropHandler = Extension.create({
  name: 'imagePasteDropHandler',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const items = event.clipboardData?.items;
            if (!items) return false;

            const imageFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
              }
            }

            if (imageFiles.length === 0) return false;

            event.preventDefault();
            imageFiles.forEach(async (file) => {
              const url = await compressAndUploadImage(file);
              if (url && !view.isDestroyed) {
                const { state, dispatch } = view;
                const nodeType = state.schema.nodes.imageBlock || state.schema.nodes.image;
                if (nodeType) {
                  const node = nodeType.create({ src: url, alt: file.name || 'image' });
                  const tr = state.tr.replaceSelectionWith(node);
                  dispatch(tr);
                }
              }
            });
            return true;
          },
          handleDrop: (view, event) => {
            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) return false;

            const imageFiles: File[] = [];
            for (let i = 0; i < files.length; i++) {
              if (files[i].type.indexOf('image') !== -1) {
                imageFiles.push(files[i]);
              }
            }

            if (imageFiles.length === 0) return false;

            event.preventDefault();
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            imageFiles.forEach(async (file) => {
              const url = await compressAndUploadImage(file);
              if (url && !view.isDestroyed) {
                const { state, dispatch } = view;
                const nodeType = state.schema.nodes.imageBlock || state.schema.nodes.image;
                if (nodeType) {
                  const node = nodeType.create({ src: url, alt: file.name || 'image' });
                  const pos = coordinates?.pos ?? state.selection.from;
                  const tr = state.tr.insert(pos, node);
                  dispatch(tr);
                }
              }
            });
            return true;
          }
        }
      })
    ];
  }
});

// Fix pasted headings to strip duplicate IDs - updateToc will regenerate
const HeadingIdPasteFix = Extension.create({
  name: 'headingIdPasteFix',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedHTML(html: string) {
            // Strip id and data-id from pasted headings to force regeneration
            return html.replace(/<h([1-6])([^>]*)>/gi, (match, level, attrs) => {
              const cleaned = attrs.replace(/\s+id="[^"]*"/gi, '').replace(/\s+data-id="[^"]*"/gi, '');
              return `<h${level}${cleaned}>`;
            });
          },
        },
      }),
    ];
  },
});

// Custom TableCell with Align + BackgroundColor + FontSize support
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: element => element.getAttribute('align') || (element as HTMLElement).style.textAlign || 'left',
        renderHTML: attributes => {
          if (!attributes.align || attributes.align === 'left') return {};
          return {
            align: attributes.align,
          };
        }
      },
      backgroundColor: {
        default: null,
        parseHTML: element => normalizeColor((element as HTMLElement).style.backgroundColor || element.getAttribute('data-bg')) || null,
        renderHTML: attributes => {
          const name = normalizeColor(attributes.backgroundColor);
          if (!name) return {};
          return { 'data-bg': name };
        }
      },
      fontSize: {
        default: 'normal',
        parseHTML: element => element.getAttribute('data-font-size') || (element.classList.contains('table-sm') ? 'small' : 'normal'),
        renderHTML: attributes => {
          if (!attributes.fontSize || attributes.fontSize === 'normal') return {};
          return {
            'data-font-size': attributes.fontSize,
            class: 'table-sm',
            style: 'font-size: 1.05rem !important; font-weight: 300 !important;'
          };
        }
      },
      verticalAlign: {
        default: 'top',
        parseHTML: element => element.getAttribute('data-valign') || (element as HTMLElement).style.verticalAlign || 'top',
        renderHTML: attributes => {
          if (!attributes.verticalAlign || attributes.verticalAlign === 'top') return {};
          return {
            'data-valign': attributes.verticalAlign,
            style: `vertical-align: ${attributes.verticalAlign} !important;`
          };
        }
      }
    };
  }
});

// Custom TableHeader with Align + BackgroundColor + FontSize + VerticalAlign support
const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: element => element.getAttribute('align') || (element as HTMLElement).style.textAlign || 'left',
        renderHTML: attributes => {
          if (!attributes.align || attributes.align === 'left') return {};
          return {
            align: attributes.align,
          };
        }
      },
      backgroundColor: {
        default: null,
        parseHTML: element => normalizeColor((element as HTMLElement).style.backgroundColor || element.getAttribute('data-bg')) || null,
        renderHTML: attributes => {
          const name = normalizeColor(attributes.backgroundColor);
          if (!name) return {};
          return { 'data-bg': name };
        }
      },
      fontSize: {
        default: 'normal',
        parseHTML: element => element.getAttribute('data-font-size') || (element.classList.contains('table-sm') ? 'small' : 'normal'),
        renderHTML: attributes => {
          if (!attributes.fontSize || attributes.fontSize === 'normal') return {};
          return {
            'data-font-size': attributes.fontSize,
            class: 'table-sm',
            style: 'font-size: 1.05rem !important; font-weight: 300 !important;'
          };
        }
      },
      verticalAlign: {
        default: 'top',
        parseHTML: element => element.getAttribute('data-valign') || (element as HTMLElement).style.verticalAlign || 'top',
        renderHTML: attributes => {
          if (!attributes.verticalAlign || attributes.verticalAlign === 'top') return {};
          return {
            'data-valign': attributes.verticalAlign,
            style: `vertical-align: ${attributes.verticalAlign} !important;`
          };
        }
      }
    };
  }
});

// Custom Table: Handles markdown serialization with full support for background colors, font size, spans, verticalAlign, and clean pipes
const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: 'normal',
        parseHTML: element => element.getAttribute('data-font-size') || (element.classList.contains('table-sm') ? 'small' : 'normal'),
        renderHTML: attributes => {
          if (!attributes.fontSize || attributes.fontSize === 'normal') return {};
          return {
            'data-font-size': attributes.fontSize,
            class: 'table-sm',
            style: 'font-size: 1.05rem !important; font-weight: 300 !important;'
          };
        }
      }
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          // 1. Check if any cell has a background color, small font size, spans, or non-default verticalAlign
          let hasBgOrSpan = node.attrs.fontSize === 'small';
          node.descendants((child: any) => {
            if (child.type.name === 'tableCell' || child.type.name === 'tableHeader') {
              if (
                child.attrs.backgroundColor ||
                child.attrs.fontSize === 'small' ||
                child.attrs.colspan > 1 ||
                child.attrs.rowspan > 1 ||
                (child.attrs.verticalAlign && child.attrs.verticalAlign !== 'top')
              ) {
                hasBgOrSpan = true;
                return false;
              }
            }
            return true;
          });

          // 2. Check if first row is strictly headers
          const firstRow = node.firstChild;
          let firstRowAllHeaders = true;
          if (firstRow) {
            firstRow.forEach((cell: any) => {
              if (cell.type.name !== 'tableHeader') firstRowAllHeaders = false;
            });
          } else {
            firstRowAllHeaders = false;
          }

          // 3. If table has background colors, small font size, or non-standard headers, serialize as HTML to 100% preserve colors and inline marks
          if (hasBgOrSpan || !firstRowAllHeaders) {
            const schema = node.type.schema;
            let html = getHTMLFromFragment(Fragment.from(node), schema);
            html = cleanTableMarkdown(html);
            state.write('\n\n' + html + '\n\n');
            state.closeBlock(node);
            return;
          }

          // 4. Standard markdown pipe table serialization
          state.inTable = true;
          node.forEach((row: any, p: any, i: number) => {
            state.write('| ');
            row.forEach((col: any, p2: any, j: number) => {
              if (j > 0) state.write(' | ');
              col.forEach((block: any, p3: any, k: number) => {
                if (k > 0) state.write('<br>');
                state.renderInline(block);
              });
            });
            state.write(' |');
            state.ensureNewLine();
            if (i === 0) {
              const delimiterRow = Array.from({ length: row.childCount }).map((_, colIdx) => {
                const col = row.child(colIdx);
                const align = col.attrs.align;
                if (align === 'center') return ':---:';
                if (align === 'right') return '---:';
                return '---';
              }).join(' | ');
              state.write(`| ${delimiterRow} |`);
              state.ensureNewLine();
            }
          });
          state.closeBlock(node);
          state.inTable = false;
        },
        parse: {
          // handled by markdown-it
        }
      }
    };
  }
});

// Custom Details Node
const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'summary block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: element => element.hasAttribute('open'),
        renderHTML: attributes => {
          if (attributes.open) {
            return { open: '' };
          }
          return {};
        }
      }
    }
  },
  parseHTML() { return [{ tag: 'details' }] },
  renderHTML({ HTMLAttributes }) { return ['details', mergeAttributes(HTMLAttributes), 0] },
});

// Custom Summary Node
const Summary = Node.create({
  name: 'summary',
  group: 'block',
  content: 'text*',
  defining: true,
  parseHTML() { return [{ tag: 'summary' }] },
  renderHTML({ HTMLAttributes }) { return ['summary', mergeAttributes(HTMLAttributes), 0] },
});

interface TiptapEditorProps {
  noteId: string;
  content: string;
  onChange: (noteId: string, content: string) => void;
  setEditor: (editor: Editor | null) => void;
  onTocUpdate?: (toc: { id: string; text: string; level: number }[]) => void;
  placeholder?: string;
  editable?: boolean;
  onAiAction?: (prompt: string, opts?: { wrapCodeBlock?: boolean; excludeContent?: boolean }) => void;
  notify?: (input: NotifyInput) => void;
}

interface SlashState {
  query: string;
  range: { from: number; to: number };
  pos: { top: number; left: number };
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  noteId,
  content,
  onChange,
  setEditor,
  onTocUpdate,
  placeholder = '클릭하여 입력하세요...',
  editable = true,
  onAiAction,
  notify,
}) => {
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevTocRef = useRef<string>('');
  // 마지막으로 부모에 전달된 markdown (blur/unmount flush 중복 전달 방지 + stale 판별)
  const lastFlushedRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const noteIdRef = useRef(noteId);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);
  // Slash command menu state (notespace-style `/`)
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [aiMode, setAiMode] = useState(false);
  const [aiPos, setAiPos] = useState<{ top: number; left: number } | null>(null);
  // 인라인 프롬프트 바 모드: ai(AI 편집) | cite(통합 인용)
  const [promptKind, setPromptKind] = useState<'ai' | 'cite'>('ai');
  const [isSlashImageOpen, setIsSlashImageOpen] = useState(false);
  const [isSlashLinkOpen, setIsSlashLinkOpen] = useState(false);
  const slashRef = useRef<SlashState | null>(null);
  const slashIndexRef = useRef(0);
  const filteredRef = useRef(SLASH_COMMANDS);
  const aiModeRef = useRef(false);
  const dismissedTextRef = useRef<string | null>(null);
  const slashKeyHandlerRef = useRef<(view: any, event: KeyboardEvent) => boolean>(() => false);

  const getEditorView = (ed: Editor | null | undefined) => {
    if (!ed || ed.isDestroyed) return null;
    try {
      return ed.view;
    } catch {
      return null;
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        hardBreak: false,
      }),
      CustomHardBreak,
      HeadingShortcuts,
      Heading.configure({
        levels: [1, 2, 3, 4, 5, 6],
      }).extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            id: {
              default: null,
              parseHTML: element => element.id || element.getAttribute('data-id'),
              renderHTML: attributes => {
                if (!attributes.id) {
                  return {}
                }
                return {
                  id: attributes.id,
                  'data-id': attributes.id
                }
              },
            },
            color: {
              default: null,
              parseHTML: element => element.getAttribute('data-color'),
              renderHTML: attributes => {
                if (!attributes.color) return {};
                return {
                  'data-color': attributes.color,
                  class: `colored-bg-${attributes.color}`
                };
              }
            }
          }
        },
        addStorage() {
          return {
            markdown: {
              serialize(state: any, node: any) {
                if (node.attrs.color) {
                  const colorAttr = ` data-color="${node.attrs.color}" class="colored-bg-${node.attrs.color}"`;
                  const idAttr = node.attrs.id ? ` id="${node.attrs.id}"` : '';
                  state.write(`<h${node.attrs.level}${idAttr}${colorAttr}>`);
                  state.renderInline(node, false);
                  state.write(`</h${node.attrs.level}>`);
                  state.closeBlock(node);
                } else {
                  state.write(state.repeat('#', node.attrs.level) + ' ');
                  state.renderInline(node, false);
                  state.closeBlock(node);
                }
              }
            }
          }
        }
      }),
      Blockquote.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            color: {
              default: null,
              parseHTML: element => element.getAttribute('data-color'),
              renderHTML: attributes => {
                if (!attributes.color) return {};
                return {
                  'data-color': attributes.color,
                  class: `colored-bg-${attributes.color}`
                };
              }
            }
          }
        },
        addStorage() {
          return {
            markdown: {
              serialize(state: any, node: any) {
                if (node.attrs.color) {
                  state.write(`<blockquote data-color="${node.attrs.color}" class="colored-bg-${node.attrs.color}">\n\n`);
                  state.renderContent(node);
                  state.write(`\n\n</blockquote>`);
                  state.closeBlock(node);
                } else {
                  state.wrapBlock('> ', null, node, () => state.renderContent(node));
                }
              }
            }
          }
        }
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      ImageBlock,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TextStyle,
      NameHighlight,
      Underline,
      Details,
      Summary,
      TabBlock,
      TabItem,
      WebsiteBlock,
      CustomTable.configure({
        resizable: true,
      }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
      TabIndent,
      ImagePasteDropHandler,
      HeadingIdPasteFix,
      Markdown.configure({
        html: true, // Allow HTML for details/summary
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: cleanTableMarkdown(content),
    editable,
    onUpdate: ({ editor }) => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        if (!editor || editor.isDestroyed) return;
        const markdown = (editor.storage as any)?.markdown?.getMarkdown() || '';
        lastFlushedRef.current = markdown;
        onChangeRef.current(noteIdRef.current, markdown);
        updateToc(editor);
      }, 50);
    },
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none max-w-none min-h-[calc(100vh-200px)]',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
      },
      handleKeyDown: (view, event) => {
        try {
          return slashKeyHandlerRef.current(view, event as unknown as KeyboardEvent);
        } catch {
          return false;
        }
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        if (target && target.tagName.toLowerCase() === 'summary') {
          const detailsDom = target.closest('details');
          if (detailsDom) {
            event.preventDefault();
            let found = false;
            view.state.doc.descendants((node, p) => {
              if (found) return false;
              if (node.type.name === 'details') {
                const dom = view.nodeDOM(p) as HTMLElement;
                if (dom === detailsDom) {
                  const isOpen = node.attrs.open;
                  view.dispatch(view.state.tr.setNodeMarkup(p, null, { ...node.attrs, open: !isOpen }));
                  found = true;
                  return false;
                }
              }
              return true;
            });
            return true;
          }
        }
        return false;
      }
    },
  });

  const updateToc = useCallback((ed?: Editor | null) => {
    const targetEditor = ed || editor;
    if (!targetEditor || targetEditor.isDestroyed) return;
    const view = getEditorView(targetEditor);
    if (!view) return;

    if (onTocUpdate) {
      const headings: { id: string; text: string; level: number; color?: string }[] = [];
      let tr = targetEditor.state.tr;
      let modified = false;
      const seen = new Set<string>();

      targetEditor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          let id = node.attrs.id;
          if (!id || seen.has(id)) {
            id = `heading-${uuidv4()}`;
            tr = tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              id
            });
            modified = true;
          }
          seen.add(id);
          headings.push({
            id,
            text: node.textContent,
            level: node.attrs.level,
            color: node.attrs.color
          });
        }
      });

      if (modified && !targetEditor.isDestroyed && getEditorView(targetEditor)) {
        targetEditor.view.dispatch(tr);
      }

      const tocString = JSON.stringify(headings);
      if (prevTocRef.current !== tocString) {
        prevTocRef.current = tocString;
        onTocUpdate(headings);
      }
    }
  }, [onTocUpdate, editor]);

  const filteredSlash = React.useMemo(
    () => filterSlashCommands(slash?.query ?? ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slash?.query]
  );

  // Slash query 감지: 빈 블록에서 `/`로 시작하고 커서까지 공백이 없을 때만 메뉴 표시
  const updateSlashState = useCallback(() => {
    const ed = editor;
    if (!ed || ed.isDestroyed || !editable || aiModeRef.current) {
      if (slashRef.current) {
        slashRef.current = null;
        setSlash(null);
      }
      return;
    }
    try {
      const { $from } = ed.state.selection;
      const sel = ed.state.selection as any;
      if (sel && 'empty' in sel && !sel.empty) {
        if (slashRef.current) {
          slashRef.current = null;
          setSlash(null);
        }
        dismissedTextRef.current = null;
        return;
      }
      const parent = $from.parent;
      if (!parent || !parent.isTextblock || parent.type.name === 'codeBlock') {
        if (slashRef.current) {
          slashRef.current = null;
          setSlash(null);
        }
        dismissedTextRef.current = null;
        return;
      }
      const parentText: string = parent.textContent || '';
      const offset: number = $from.parentOffset;
      const textUpToCursor = parentText.slice(0, offset);
      const match = textUpToCursor.match(/^\/(\S*)$/);
      if (!match) {
        if (slashRef.current) {
          slashRef.current = null;
          setSlash(null);
        }
        dismissedTextRef.current = null;
        return;
      }
      // Esc로 닫은 텍스트와 동일하면 다시 띄우지 않음
      if (dismissedTextRef.current === textUpToCursor) return;
      const query = match[1] || '';
      const blockStart: number = $from.start();
      const from: number = ed.state.selection.from;
      const coords = ed.view.coordsAtPos(from);
      const pos = { top: coords.bottom ?? coords.top, left: coords.left };
      const prev = slashRef.current;
      if (prev && prev.query === query && prev.range.from === blockStart && prev.range.to === from) {
        // 쿼리 동일 → 위치만 갱신 (키보드 탐색 인덱스 유지)
        const updated: SlashState = { ...prev, pos };
        slashRef.current = updated;
        setSlash(updated);
        return;
      }
      const next: SlashState = { query, range: { from: blockStart, to: from }, pos };
      slashRef.current = next;
      setSlash(next);
      slashIndexRef.current = 0;
      setSlashIndex(0);
    } catch {
      /* ignore */
    }
  }, [editor, editable]);

  const runSlashCommand = useCallback((id: SlashCommandId) => {
    const ed = editor;
    const current = slashRef.current;
    if (!ed || ed.isDestroyed) return;
    dismissedTextRef.current = null;
    slashRef.current = null;
    setSlash(null);
    slashIndexRef.current = 0;
    setSlashIndex(0);
    if (!current) return;
    const range = current.range;
    const pos = current.pos;
    const deleteSlash = () => {
      try {
        ed.chain().focus().deleteRange(range).run();
      } catch { /* ignore */ }
    };
    try {
      switch (id) {
        case 'code':
          deleteSlash();
          ed.chain().focus().toggleCodeBlock().run();
          break;
        case 'toggle':
          deleteSlash();
          ed.chain().focus().insertContent('<details><summary>토글 목록</summary><p>내용을 입력하세요</p></details>').run();
          break;
        case 'table-2x2':
          deleteSlash();
          ed.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
          break;
        case 'table-3x3':
          deleteSlash();
          ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          break;
        case 'table-4x4':
          deleteSlash();
          ed.chain().focus().insertTable({ rows: 4, cols: 4, withHeaderRow: true }).run();
          break;
        case 'image':
          deleteSlash();
          setIsSlashImageOpen(true);
          break;
        case 'website':
          deleteSlash();
          setIsSlashLinkOpen(true);
          break;
        case 'cite':
          deleteSlash();
          ed.chain().focus().toggleBlockquote().run();
          break;
        case 'tab':
          deleteSlash();
          try {
            const json = createDefaultTabBlock();
            ed.chain().focus().insertContent(json).run();
            focusInsertedTabBlock(ed, json.attrs.blockId);
          } catch { /* ignore */ }
          break;
        case 'ai': {
          deleteSlash();
          setPromptKind('ai');
          // 삭제 후 커서 위치에서 좌표를 새로 계산 (캡처된 pos는 레이아웃 이동으로 어긋날 수 있음)
          let aiPos = pos;
          try {
            const c = ed.view.coordsAtPos(ed.state.selection.from);
            if (c) aiPos = { top: c.bottom ?? c.top, left: c.left };
          } catch { /* ignore, fallback to captured pos */ }
          setAiPos(aiPos);
          setAiMode(true);
          aiModeRef.current = true;
          break;
        }
        default:
          break;
      }
    } catch { /* ignore */ }
  }, [editor]);

  const handleSlashAiSubmit = useCallback((prompt: string) => {
    setAiMode(false);
    aiModeRef.current = false;
    setAiPos(null);
    try { editor?.chain().focus().run(); } catch { /* ignore */ }
    onAiAction?.(prompt);
  }, [editor, onAiAction]);

  const handleSlashAiCancel = useCallback(() => {
    setAiMode(false);
    aiModeRef.current = false;
    setAiPos(null);
    try { editor?.chain().focus().run(); } catch { /* ignore */ }
  }, [editor]);

  const handleSlashWebsiteSubmit = useCallback(async (url: string) => {
    setIsSlashLinkOpen(false);
    const ed = editor;
    if (!ed || ed.isDestroyed) return;
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
    try {
      ed.chain().focus().insertContent({
        type: 'websiteBlock',
        attrs: { url, title, favicon, description, image },
      }).run();
    } catch { /* ignore */ }
  }, [editor]);

  // ProseMirror 키 핸들러는 에디터 생성 시점에 고정되므로 ref 경유로 최신 상태를 참조
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    filteredRef.current = filteredSlash;
  });
  useEffect(() => {
    slashIndexRef.current = slashIndex;
  });
  useEffect(() => {
    aiModeRef.current = aiMode;
  });
  useEffect(() => {
    slashKeyHandlerRef.current = (view, event) => {
      const current = slashRef.current;
      if (!current || aiModeRef.current) return false;
      const list = filteredRef.current;
      if (event.key === 'ArrowDown') {
        if (list.length === 0) return false;
        event.preventDefault();
        const next = (slashIndexRef.current + 1) % list.length;
        slashIndexRef.current = next;
        setSlashIndex(next);
        return true;
      }
      if (event.key === 'ArrowUp') {
        if (list.length === 0) return false;
        event.preventDefault();
        const next = (slashIndexRef.current - 1 + list.length) % list.length;
        slashIndexRef.current = next;
        setSlashIndex(next);
        return true;
      }
      if (event.key === 'Enter') {
        const item = list[slashIndexRef.current];
        if (!item) return false;
        event.preventDefault();
        runSlashCommand(item.id);
        return true;
      }
      if (event.key === 'Escape') {
        try {
          const ed = editor;
          if (ed && !ed.isDestroyed) {
            const { $from } = ed.state.selection;
            dismissedTextRef.current = ($from.parent.textContent || '').slice(0, $from.parentOffset);
          }
        } catch { /* ignore */ }
        slashRef.current = null;
        setSlash(null);
        event.preventDefault();
        return true;
      }
      return false;
    };
  });

  // 에디터 변경/선택 변경 시 slash 상태 갱신
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const onTr = () => updateSlashState();
    const onBlur = () => {
      if (slashRef.current) {
        slashRef.current = null;
        setSlash(null);
      }
      // blur 시점에 디바운스된 markdown을 즉시 flush → 부모 content를 최신으로 유지.
      // 그렇지 않으면 content effect가 stale content로 setContent 덮어쓰기를 수행해
      // 입력 중 텍스트가 사라지고(#6) 뷰가 어긋날(#5) 수 있음.
      try {
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
        if (!editor.isDestroyed) {
          const markdown = (editor.storage as any)?.markdown?.getMarkdown() || '';
          if (markdown !== lastFlushedRef.current) {
            lastFlushedRef.current = markdown;
            onChangeRef.current(noteIdRef.current, markdown);
          }
          updateToc(editor);
        }
      } catch { /* ignore */ }
    };
    editor.on('update', onTr);
    editor.on('selectionUpdate', onTr);
    editor.on('blur', onBlur);
    updateSlashState();
    return () => {
      editor.off('update', onTr);
      editor.off('selectionUpdate', onTr);
      editor.off('blur', onBlur);
    };
  }, [editor, updateSlashState]);

  // 스크롤/리사이즈 시 플로팅 메뉴·AI 입력 위치 재계산
  useEffect(() => {
    if ((!slash && !aiMode) || !editor || editor.isDestroyed) return;
    const reposition = () => {
      try {
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        const pos = { top: coords.bottom ?? coords.top, left: coords.left };
        if (slashRef.current) {
          const updated = { ...slashRef.current, pos };
          slashRef.current = updated;
          setSlash(updated);
        }
        if (aiModeRef.current) setAiPos(pos);
      } catch { /* ignore */ }
    };
    const container = document.getElementById('main-scroll-container');
    window.addEventListener('resize', reposition);
    container?.addEventListener('scroll', reposition);
    return () => {
      window.removeEventListener('resize', reposition);
      container?.removeEventListener('scroll', reposition);
    };
  }, [slash, aiMode, editor]);

  // unmount 시 pending markdown 즉시 flush (noteId 명시 바인딩으로 타 노트 오염 방지)
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
        try {
          const ed = editor;
          if (ed && !ed.isDestroyed) {
            const markdown = (ed.storage as any)?.markdown?.getMarkdown() || '';
            if (markdown !== lastFlushedRef.current) {
              lastFlushedRef.current = markdown;
              onChangeRef.current(noteIdRef.current, markdown);
            }
          }
        } catch { }
      }
    };
  }, [editor]);

  // Update ToC on mount and content change
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      updateToc();
    }
  }, [editor, content, updateToc]);

  // Update editor content if prop changes externally (e.g., after async load)
  useEffect(() => {
    if (editor && !editor.isDestroyed && content !== undefined) {
      // If the user is currently editing / focused on the editor, do not overwrite content to preserve cursor position
      if (editor.isFocused) {
        return;
      }
      // NodeView 크롬(탭 타이틀/라벨 input 등) 조작 중에도 덮어쓰지 않음.
      // 디바운스(500ms) 사이 외부 content와 충돌해 입력 중 문서가 통째로 교체되는 것을 방지.
      try {
        const ae = document.activeElement;
        if (ae && editor.view.dom.contains(ae)) {
          return;
        }
      } catch { /* ignore */ }

      const currentMarkdown = (editor.storage as any)?.markdown?.getMarkdown() || '';
      // Only update if content actually differs to avoid infinite loops
      if (content !== currentMarkdown) {
        editor.commands.setContent(cleanTableMarkdown(content), { emitUpdate: false });
        lastFlushedRef.current = content;
        updateToc();
      }
    }
  }, [content, editor, updateToc]);

  useEffect(() => {
    setEditor(editor);
    try {
      lastFlushedRef.current = editor && !editor.isDestroyed
        ? (editor.storage as any)?.markdown?.getMarkdown() || ''
        : null;
    } catch { /* ignore */ }
    return () => setEditor(null);
  }, [editor, setEditor]);

  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  if (!editor || editor.isDestroyed) return null;

  return (
    <div className="tiptap-editor-container w-full relative">
      {editor && !editor.isDestroyed && (
        <BubbleMenu
          editor={editor}
          options={{
            placement: isMobileScreen ? 'top-start' : 'left-start',
            offset: isMobileScreen ? { mainAxis: 8, crossAxis: 0 } : { mainAxis: 8, crossAxis: 0 },
            shift: { padding: 12 },
            flip: {
              fallbackPlacements: isMobileScreen
                ? ['bottom-start', 'top', 'bottom']
                : ['top-start', 'bottom-start']
            },
          }}
          getReferencedVirtualElement={() => {
            if (!editor || editor.isDestroyed) return null;
            const view = getEditorView(editor);
            if (!view) return null;
            try {
              const { state } = editor;
              const { from } = state.selection;
              let node = view.domAtPos(from).node as HTMLElement;
              while (node && node.nodeType !== 1) {
                node = node.parentNode as HTMLElement;
              }
              if (node) {
                const targetEl = (node.closest('h1, h2, h3, h4, h5, h6, blockquote') as HTMLElement) || node;
                return {
                  getBoundingClientRect: () => targetEl.getBoundingClientRect(),
                  contextElement: targetEl,
                };
              }
            } catch {
              return null;
            }
            return null;
          }}
          shouldShow={({ editor }) => {
            if (!editor || editor.isDestroyed || !(editor as any).commandManager) return false;
            try {
              return editor.isActive('heading') || editor.isActive('blockquote');
            } catch (e) {
              return false;
            }
          }}
        >
          <div
            className={`flex ${isMobileScreen ? 'flex-row space-x-2' : 'flex-col space-y-1.5'} items-center bg-white/95 dark:bg-gray-800/95 backdrop-blur-xs p-1.5 ${isMobileScreen ? 'rounded-full' : 'rounded-2xl'} shadow-lg border border-gray-200/80 dark:border-gray-700 z-50`}
          >
            {blockSwatches().map(c => {
              const currentBlockColor = editor.isActive('heading')
                ? editor.getAttributes('heading').color
                : editor.isActive('blockquote')
                  ? editor.getAttributes('blockquote').color
                  : null;
              const isSelected = currentBlockColor === c.name;

              return (
                <button
                  key={c.name}
                  type="button"
                  className={`w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 hover:scale-110 active:scale-95 transition-transform ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800 scale-110' : ''
                    }`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => {
                    if (!editor || editor.isDestroyed || !(editor as any).commandManager) return;
                    try {
                      if (editor.isActive('heading')) {
                        editor.chain().focus().updateAttributes('heading', { color: c.name }).run();
                      } else if (editor.isActive('blockquote')) {
                        editor.chain().focus().updateAttributes('blockquote', { color: c.name }).run();
                      }
                    } catch (e) { }
                  }}
                  title={c.name}
                />
              );
            })}
            <button
              type="button"
              className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 bg-white text-[10px] flex items-center justify-center text-gray-500 hover:scale-110 active:scale-95 transition-transform dark:bg-gray-700 dark:text-gray-300 font-bold"
              onClick={() => {
                if (!editor || editor.isDestroyed || !(editor as any).commandManager) return;
                try {
                  if (editor.isActive('heading')) {
                    editor.chain().focus().updateAttributes('heading', { color: null }).run();
                  } else if (editor.isActive('blockquote')) {
                    editor.chain().focus().updateAttributes('blockquote', { color: null }).run();
                  }
                } catch (e) { }
              }}
              title="Clear Color"
            >✕</button>
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {slash && !aiMode && editable && createPortal(
        <SlashCommandMenu
          items={filteredSlash}
          selectedIndex={Math.min(slashIndex, Math.max(filteredSlash.length - 1, 0))}
          position={slash.pos}
          onSelect={runSlashCommand}
          onHover={(i) => {
            slashIndexRef.current = i;
            setSlashIndex(i);
          }}
        />,
        document.body
      )}
      {aiMode && aiPos && createPortal(
        <SlashAiInput
          position={aiPos}
          onSubmit={handleSlashAiSubmit}
          onCancel={handleSlashAiCancel}
        />,
        document.body
      )}
      <ImageManagerModal
        isOpen={isSlashImageOpen}
        onClose={() => setIsSlashImageOpen(false)}
        editor={editor}
      />
      <LinkModal
        isOpen={isSlashLinkOpen}
        onClose={() => setIsSlashLinkOpen(false)}
        onSubmit={handleSlashWebsiteSubmit}
        title="웹사이트 북마크 추가"
      />
    </div>
  );
};

export default TiptapEditor;
