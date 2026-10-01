import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Code,
  ToggleLeft,
  Table as TableIcon,
  Image as ImageIcon,
  Globe,
  ArrowUp,
  X,
  Layers,
  Quote,
} from 'lucide-react';

export type SlashCommandId =
  | 'ai'
  | 'code'
  | 'toggle'
  | 'table-2x2'
  | 'table-3x3'
  | 'table-4x4'
  | 'image'
  | 'website'
  | 'tab'
  | 'cite';

export interface SlashCommandItem {
  id: SlashCommandId;
  title: string;
  desc: string;
  hint?: string;
  keywords: string[];
  icon: React.ReactNode;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'ai',
    title: 'AI 노트',
    desc: 'AI로 내용 생성하기',
    keywords: ['ai', '에이아이', '노트', '생성', '편집', 'ainote'],
    icon: <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />,
  },
  {
    id: 'code',
    title: '코드 블록',
    desc: '코드 스니펫 작성',
    hint: '```',
    keywords: ['코드', 'code', '```', '코드블럭', '코드블록'],
    icon: <Code size={16} className="text-gray-600 dark:text-gray-300" />,
  },
  {
    id: 'toggle',
    title: '토글 목록',
    desc: '접기 / 펼치기 블록',
    hint: '>',
    keywords: ['토글', 'toggle', '접기', '펼치기', '>'],
    icon: <ToggleLeft size={16} className="text-gray-600 dark:text-gray-300" />,
  },
  {
    id: 'table-2x2',
    title: '표 2×2',
    desc: '2행 2열 표 삽입',
    hint: '/table',
    keywords: ['표', 'table', '테이블', '2x2', '2×2'],
    icon: <TableIcon size={16} className="text-gray-600 dark:text-gray-300" />,
  },
  {
    id: 'table-3x3',
    title: '표 3×3',
    desc: '3행 3열 표 삽입',
    hint: '/table',
    keywords: ['표', 'table', '테이블', '3x3', '3×3'],
    icon: <TableIcon size={16} className="text-gray-600 dark:text-gray-300" />,
  },
  {
    id: 'table-4x4',
    title: '표 4×4',
    desc: '4행 4열 표 삽입',
    hint: '/table',
    keywords: ['표', 'table', '테이블', '4x4', '4×4'],
    icon: <TableIcon size={16} className="text-gray-600 dark:text-gray-300" />,
  },
  {
    id: 'image',
    title: '이미지',
    desc: '파일 선택하여 삽입',
    keywords: ['이미지', 'image', '사진', '그림', '업로드', 'img'],
    icon: <ImageIcon size={16} className="text-emerald-500" />,
  },
  {
    id: 'website',
    title: '웹사이트',
    desc: '링크 프리뷰 카드 삽입',
    keywords: ['웹사이트', 'website', '링크', '임베드', 'embed', '프리뷰', 'url', '웹'],
    icon: <Globe size={16} className="text-blue-500" />,
  },
  {
    id: 'tab',
    title: '탭',
    desc: '전환식 탭 블록 삽입',
    hint: '/tab',
    keywords: ['탭', 'tab', '탭블록', '전환'],
    icon: <Layers size={16} className="text-purple-600 dark:text-purple-400" />,
  },
  {
    id: 'cite',
    title: '인용구',
    desc: '인용문 블록 삽입',
    hint: '>',
    keywords: ['인용', '인용구', 'quote', 'blockquote', '>'],
    icon: <Quote size={16} className="text-indigo-500 dark:text-indigo-400" />,
  },
];

export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.title.toLowerCase().includes(q)) return true;
    if (cmd.desc.toLowerCase().includes(q)) return true;
    return cmd.keywords.some((k) => {
      const key = k.toLowerCase();
      return key.includes(q) || q.includes(key);
    });
  });
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (id: SlashCommandId) => void;
  onHover: (index: number) => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  items,
  selectedIndex,
  position,
  onSelect,
  onHover,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [flipUp, setFlipUp] = useState(false);

  useEffect(() => {
    // 커서가 화면 하단에 가까우면 메뉴를 위로 펼침
    const estimatedHeight = Math.min(360, 48 + items.length * 52);
    setFlipUp(position.top + 28 + estimatedHeight > window.innerHeight - 16);
  }, [position.top, items.length]);

  useEffect(() => {
    // 선택 항목이 보이도록 스크롤
    const el = menuRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const top = flipUp ? undefined : Math.min(position.top + 24, window.innerHeight - 200);
  const bottom = flipUp ? Math.max(window.innerHeight - position.top + 8, 16) : undefined;
  const left = Math.max(8, Math.min(position.left - 8, window.innerWidth - 320));

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] w-[300px] max-h-[340px] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={flipUp ? { bottom, left } : { top, left }}
      role="menu"
    >
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
          일치하는 명령이 없습니다
        </div>
      ) : (
        items.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.id}
              data-index={idx}
              type="button"
              onMouseDown={(e) => {
                // 에디터 포커스 유지를 위해 기본 mousedown 방지
                e.preventDefault();
                onSelect(item.id);
              }}
              onMouseEnter={() => onHover(idx)}
              title={item.desc}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
              }`}
              role="menuitem"
            >
              <span className="w-7 h-7 shrink-0 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 flex items-center justify-center">
                {item.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {item.title}
                </span>
                <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">
                  {item.desc}
                </span>
              </span>
              {item.hint && (
                <span className="shrink-0 text-[11px] font-mono text-gray-400 dark:text-gray-500">
                  {item.hint}
                </span>
              )}
            </button>
          );
        })
      )}
      <div className="mt-1 pt-1.5 border-t border-gray-100 dark:border-gray-700 px-3 py-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>메뉴 닫기</span>
        <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px] font-mono">
          esc
        </kbd>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AI inline input (레퍼런스: "AI로 편집하기" 바)
// ---------------------------------------------------------------------------

interface SlashAiInputProps {
  position: { top: number; left: number };
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

export const SlashAiInput: React.FC<SlashAiInputProps> = ({
  position,
  onSubmit,
  onCancel,
  placeholder = 'AI로 편집하기',
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 바깥 클릭 시 입력 바 닫기 (에디터로 포커스 복귀는 onCancel에서 처리)
  // 주의: 열리는 제스처(메뉴 탭/클릭)의 mousedown이 마운트와 같은 태스크에서
  // 전달될 수 있으므로, 마운트 직후 일정 시간 내 이벤트는 무시해야 즉시 닫힘을 방지할 수 있음
  useEffect(() => {
    mountTimeRef.current = Date.now();
    const onDown = (e: MouseEvent) => {
      if (Date.now() - mountTimeRef.current < 400) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onCancel]);

  const submit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    onSubmit(prompt);
  };

  const left = Math.max(8, Math.min(position.left - 8, window.innerWidth - 560));
  const top = Math.min(position.top + 24, window.innerHeight - 120);

  return (
    <div
      ref={containerRef}
      className="fixed z-[100] w-[min(540px,calc(100vw-32px))] bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-600 pl-2 pr-1.5 py-1.5 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ top, left }}
    >
      <span className="w-8 h-8 shrink-0 rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 flex items-center justify-center">
        <Sparkles size={16} className="text-gray-700 dark:text-gray-200" />
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          e.stopPropagation();
        }}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none border-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        title="닫기 (esc)"
        className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <X size={15} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={submit}
        disabled={!value.trim()}
        title="AI 요청 보내기"
        className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-colors ${
          value.trim()
            ? 'bg-purple-600 text-white hover:bg-purple-700'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
        }`}
      >
        <ArrowUp size={15} />
      </button>
    </div>
  );
};
