import { ContrastLevel } from '../types';

export type HighlightName = 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'gray';

export interface ColorEntry {
  name: HighlightName;
  label: string;
  /** base RGB. alpha는 대비 레벨(ALPHA_LEVELS)이 정한다 */
  rgb: [number, number, number];
  /** 다크모드 배경 (고정) */
  dark: string;
  /** 다크모드 글자색 (고정) */
  darkText: string;
  /** 블록 선택기 표시 hex */
  block: string;
  /** 탭 dot hex */
  tab: string;
  /** 툴바 swatch 테두리 */
  border: string;
}

// 5색 정준. 회색은 표 전용으로 TABLE_GRAY에 둔다(D5).
export const HIGHLIGHT_COLORS: ColorEntry[] = [
  { name: 'yellow', label: '노랑', rgb: [254, 243, 199], dark: 'rgba(133, 100, 4, 0.65)', darkText: '#FEF3C7', block: '#fffff6', tab: '#eab308', border: 'rgba(225, 215, 160, 0.9)' },
  { name: 'blue', label: '파랑', rgb: [220, 235, 255], dark: 'rgba(30, 58, 138, 0.6)', darkText: '#BFDBFE', block: '#f6f6ff', tab: '#3b82f6', border: 'rgba(195, 205, 245, 0.9)' },
  { name: 'green', label: '초록', rgb: [215, 243, 225], dark: 'rgba(20, 83, 45, 0.6)', darkText: '#A7F3D0', block: '#f6fff6', tab: '#22c55e', border: 'rgba(180, 225, 180, 0.9)' },
  { name: 'red', label: '빨강', rgb: [255, 232, 241], dark: 'rgba(153, 27, 27, 0.6)', darkText: '#FECACA', block: '#fff6f6', tab: '#ef4444', border: 'rgba(240, 190, 190, 0.9)' },
  { name: 'purple', label: '보라', rgb: [242, 222, 251], dark: 'rgba(88, 28, 135, 0.6)', darkText: '#DDD6FE', block: '#fff6ff', tab: '#a855f7', border: 'rgba(230, 195, 245, 0.9)' },
];

export const TABLE_GRAY: ColorEntry = {
  name: 'gray', label: '회색', rgb: [246, 246, 246], dark: 'rgba(55, 65, 81, 0.6)', darkText: '#E5E7EB', block: '#f6f6f6', tab: '#9ca3af', border: 'rgba(200, 200, 200, 0.9)',
};

const byName = new Map<HighlightName, ColorEntry>(
  [...HIGHLIGHT_COLORS, TABLE_GRAY].map((e) => [e.name, e])
);

export const colorByName = (name: string | null | undefined): ColorEntry | null => {
  if (!name) return null;
  return byName.get(name as HighlightName) ?? null;
};

// 대비 레벨별 alpha. standard(기본 0.5 / purple 0.65 / red 0.8),
// high(기본 0.8 / purple 0.88 / red 0.95). gray는 기본값을 따른다.
export const ALPHA_LEVELS: Record<ContrastLevel, { base: number; purple: number; red: number }> = {
  standard: { base: 0.5, purple: 0.65, red: 0.8 },
  high: { base: 0.8, purple: 0.88, red: 0.95 },
};

export const alphaFor = (name: HighlightName, level: ContrastLevel = 'standard'): number => {
  const t = ALPHA_LEVELS[level];
  if (name === 'purple') return t.purple;
  if (name === 'red') return t.red;
  return t.base;
};

export const markRgba = (name: HighlightName, level: ContrastLevel = 'standard'): string => {
  const e = byName.get(name);
  if (!e) return 'transparent';
  return `rgba(${e.rgb[0]}, ${e.rgb[1]}, ${e.rgb[2]}, ${alphaFor(name, level)})`;
};

// 표면별 alpha 정책. body(본문 mark + 표 셀 안 mark)는 대비 세팅 추종,
// heading(제목 표면)은 standard 고정, table(표 셀 배경)과 quote(인용구 배경)는
// 라이터 고정. rgb 칩은 공유하고 alpha만 차별한다.
export type SurfacePolicy = 'body' | 'heading' | 'table' | 'quote';

// 라이터 고정 alpha (일반대비보다 옅게). gray는 base를 따른다.
export const LIGHTER_ALPHA = { base: 0.25, purple: 0.3, red: 0.35 };

export const lighterAlphaFor = (name: HighlightName): number => {
  if (name === 'purple') return LIGHTER_ALPHA.purple;
  if (name === 'red') return LIGHTER_ALPHA.red;
  return LIGHTER_ALPHA.base;
};

export const surfaceRgba = (
  name: HighlightName,
  surface: SurfacePolicy,
  level: ContrastLevel = 'standard'
): string => {
  const e = byName.get(name);
  if (!e) return 'transparent';
  const a =
    surface === 'heading'
      ? alphaFor(name, 'standard')
      : surface === 'table' || surface === 'quote'
        ? lighterAlphaFor(name)
        : alphaFor(name, level);
  return `rgba(${e.rgb[0]}, ${e.rgb[1]}, ${e.rgb[2]}, ${a})`;
};

export const cssVarFor = (name: HighlightName, surface: SurfacePolicy): string => {
  if (surface === 'heading') return `var(--hl-h-${name})`;
  if (surface === 'table') return `var(--hl-t-${name})`;
  if (surface === 'quote') return `var(--hl-q-${name})`;
  return `var(--hl-${name})`;
};

// 라이트모드 배경은 CSS 변수로 렌더된다. 다크값은 CSS 고정.
export const cssVar = (name: HighlightName): string => `var(--hl-${name})`;

// 다크 표면값. mark는 alpha 0.1로 옅게, 표 셀은 흰 글씨 대비로 0.75 유지.
// heading·quote 다크는 기존 hex를 그대로 쓴다.
const DARK_RGB: Record<HighlightName, [number, number, number]> = {
  yellow: [133, 100, 4],
  blue: [30, 58, 138],
  green: [20, 83, 45],
  red: [153, 27, 27],
  purple: [88, 28, 135],
  gray: [55, 65, 81],
};

const DARK_SURFACE_HEX: Record<HighlightName, string> = {
  yellow: '#2c2414',
  blue: '#162033',
  green: '#13261d',
  red: '#2d181c',
  purple: '#261733',
  gray: '#242c38',
};

export const DARK_MARK_ALPHA = 0.1;
export const DARK_TABLE_ALPHA = 0.75;

// 테마별 변수 세트를 순수 계산한다. 인라인 변수가 .dark 규칙을 가리므로
// 다크값도 여기서 써야 다크모드에 반영된다.
export const varsForTheme = (
  level: ContrastLevel,
  isDark: boolean
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const e of [...HIGHLIGHT_COLORS, TABLE_GRAY]) {
    if (!isDark) {
      out[`--hl-${e.name}`] = markRgba(e.name, level);
      out[`--hl-h-${e.name}`] = surfaceRgba(e.name, 'heading');
      out[`--hl-t-${e.name}`] = surfaceRgba(e.name, 'table');
      out[`--hl-q-${e.name}`] = surfaceRgba(e.name, 'quote');
      continue;
    }
    const d = DARK_RGB[e.name];
    out[`--hl-${e.name}`] = `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${DARK_MARK_ALPHA})`;
    out[`--hl-h-${e.name}`] = DARK_SURFACE_HEX[e.name];
    out[`--hl-t-${e.name}`] = `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${DARK_TABLE_ALPHA})`;
    out[`--hl-q-${e.name}`] = DARK_SURFACE_HEX[e.name];
  }
  return out;
};

// 대비 레벨을 문서에 적용. 다크모드에서는 다크 표면값을 쓴다.
export const applyContrastLevel = (level: ContrastLevel = 'standard'): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vars = varsForTheme(level, root.classList.contains('dark'));
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
};

// 구 rgba(신·구 값 모두) · 블록 표시 hex · 이름 → 정준 이름. 모르면 null.
const legacyToName = new Map<string, HighlightName>([
  ['rgba(255,252,225,0.8)', 'yellow'],
  ['rgba(255,229,143,0.9)', 'yellow'],
  ['rgba(255,252,215,0.8)', 'yellow'],
  ['rgba(254,243,199,0.95)', 'yellow'],
  ['rgba(254,243,199,0.5)', 'yellow'],
  ['rgba(238,242,255,0.8)', 'blue'],
  ['rgba(215,215,255,0.8)', 'blue'],
  ['rgba(220,235,255,0.95)', 'blue'],
  ['rgba(220,235,255,0.5)', 'blue'],
  ['rgba(235,255,235,0.8)', 'green'],
  ['rgba(215,255,215,0.8)', 'green'],
  ['rgba(215,243,225,0.95)', 'green'],
  ['rgba(215,243,225,0.5)', 'green'],
  ['rgba(255,235,235,0.8)', 'red'],
  ['rgba(255,205,205,0.9)', 'red'],
  ['rgba(255,215,215,0.8)', 'red'],
  ['rgba(255,232,241,0.95)', 'red'],
  ['rgba(255,232,241,0.8)', 'red'],
  ['rgba(253,238,255,0.8)', 'purple'],
  ['rgba(255,215,255,0.8)', 'purple'],
  ['rgba(242,222,251,0.95)', 'purple'],
  ['rgba(242,222,251,0.65)', 'purple'],
  ['rgba(246,246,246,0.8)', 'gray'],
  ['rgba(246,246,246,0.5)', 'gray'],
  ['rgb(243,244,246)', 'gray'],
  ['#e8f3fa', 'blue'],
  ['#e6fcee', 'green'],
  ['#fef3c7', 'yellow'],
  ['#fff6ff', 'purple'],
  ['#f6f6ff', 'blue'],
  ['#f6fff6', 'green'],
  ['#fffff6', 'yellow'],
  ['#fff6f6', 'red'],
  ['#f6f6f6', 'gray'],
]);

const squish = (v: string): string => v.replace(/\s+/g, '').toLowerCase();

export const normalizeColor = (input: string | null | undefined): HighlightName | null => {
  if (!input) return null;
  const key = squish(String(input));
  if (byName.has(key as HighlightName)) return key as HighlightName;
  return legacyToName.get(key) ?? null;
};

// 표 셀 swatch (5색 + 회색)
export const tablePalette = (): ColorEntry[] => [...HIGHLIGHT_COLORS, TABLE_GRAY];

// 블록 선택기 표시 목록
export const blockSwatches = (): { name: HighlightName; hex: string }[] =>
  HIGHLIGHT_COLORS.map((e) => ({ name: e.name, hex: e.block }));

// 탭 프리셋 (이름 + dot). 기존 탭 UI 순서를 유지한다. 커스텀 hex 허용은 탭 영역이 담당.
const TAB_ORDER: HighlightName[] = ['purple', 'blue', 'green', 'yellow', 'red'];
export const tabPresets = (): { name: HighlightName; hex: string }[] =>
  TAB_ORDER.map((name) => ({ name, hex: byName.get(name)!.tab }));

// 이름 기반 mark 생성. 렌더 값은 CSS(`mark[data-color]`)가 소유한다.
export const buildMark = (name: HighlightName, text: string): string =>
  `<mark data-color="${name}">${text}</mark>`;

// mark 태그 제거, 텍스트 유지 (Slice 1 `<mark>` 금지 집행용)
export const stripMarks = (html: string): string =>
  String(html || '').replace(/<\/?mark\b[^>]*>/gi, '');

// 모드별 mark 허용. 정리는 금지(organize.md Slice 1).
export const markEnabledFor = (kind: '정리' | '형광펜' | '자유'): boolean => kind !== '정리';
