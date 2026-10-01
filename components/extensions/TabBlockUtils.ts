import React from 'react';
import type { Editor } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';
import { v4 as uuidv4 } from 'uuid';
import { tabPresets } from '../../services/highlight';

// 5색 프리셋 유지 + 커스텀 hex 허용. color attr = 프리셋명 | '#rrggbb' | null.
// 값의 출처는 정준 모듈, pill 동작은 탭 영역이 소유한다.
export const TAB_PRESET_COLORS = tabPresets();

export const isTabPresetColor = (color: string | null | undefined): boolean =>
  !!color && TAB_PRESET_COLORS.some((p) => p.name === color);

/** 헤더 도트용 단색. 없으면 null (회색 플레이스홀더 표시). */
export const tabDotColor = (color: string | null | undefined): string | null => {
  if (!color) return null;
  const preset = TAB_PRESET_COLORS.find((p) => p.name === color);
  if (preset) return preset.hex;
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
};

/** 탭 pill 배경 (item3: 소제목 배경이 컬러를 따름, 활성/비활성 모두 표시).
 * 프리셋은 colored-bg-* 재사용, 커스텀은 alpha 인라인 배경. */
export const tabPill = (
  color: string | null | undefined,
  isActive: boolean
): { className: string; style?: React.CSSProperties } => {
  if (isTabPresetColor(color)) return { className: `colored-bg-${color}` };
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return { className: '', style: { backgroundColor: `${color}${isActive ? '2E' : '14'}` } };
  }
  return { className: isActive ? 'bg-gray-100 dark:bg-gray-700' : '' };
};

export const createDefaultTabBlock = () => {
  const ids = [uuidv4(), uuidv4(), uuidv4()];
  const blockId = uuidv4();
  return {
    type: 'tabBlock',
    attrs: { blockId, title: '', activeId: ids[0] },
    content: ids.map((id, i) => ({
      type: 'tabItem',
      attrs: {
        itemId: id,
        label: `탭 ${i + 1}`,
        color: i === 0 ? 'purple' : null,
        active: i === 0,
      },
      content: [{ type: 'paragraph' }],
    })),
  };
};

/** 삽입 직후 커서를 첫 탭 패널 문단으로 이동.
 * 빈 문서 edge에서 삽입 후 selection이 tabBlock 경계에 머물면 첫 글자가 새 tabItem으로
 * 감싸지는 손상이 발생하므로, 삽입 호출부(슬래시/툴바)에서 반드시 호출한다. */
/** 블록 내 특정 패널로 커서 이동 (pos 기준, 해당 블록 내부에서만 탐색) */
const focusPanelAt = (
  editor: Editor,
  blockPos: number,
  itemId: string | null
): boolean => {
  try {
    const block = editor.state.doc.nodeAt(blockPos);
    if (!block || block.type.name !== 'tabBlock') return false;
    let target = -1;
    let first = -1;
    block.forEach((child, offset) => {
      if (first === -1) first = offset;
      if (target === -1 && (itemId == null || child.attrs.itemId === itemId)) {
        target = offset;
      }
    });
    if (first === -1) return false;
    const $start = editor.state.doc.resolve(blockPos + 1 + (target !== -1 ? target : first) + 1);
    const sel = Selection.findFrom($start, 1, true);
    if (!sel) return false;
    editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView());
    editor.view.focus();
    return true;
  } catch {
    return false;
  }
};

/** 삽입 직후 커서를 첫 탭 패널 문단으로 이동.
 * selection 근접 위치 우선 탐색이라 blockId가 중복 복제되어도 올바른 블록에 착지한다.
 * (빈 문서 edge에서 selection이 tabBlock 경계에 머물러 첫 글자가 새 tabItem으로
 * 감싸지는 손상 방지 — 삽입 호출부(슬래시/툴바)에서 반드시 호출) */
export const focusInsertedTabBlock = (editor: Editor | null, blockId: string): boolean => {
  if (!editor || editor.isDestroyed) return false;
  try {
    const { $from } = editor.state.selection;
    // 1) 커서를 감싼 tabBlock (삽입 직후 가장 흔함)
    for (let d = $from.depth; d >= 0; d--) {
      if ($from.node(d).type.name === 'tabBlock') {
        const activeId = ($from.node(d).attrs.activeId as string | null) ?? null;
        if (focusPanelAt(editor, $from.before(d), activeId)) return true;
      }
    }
    // 2) 커서 바로 앞/뒤 형제 tabBlock (삽입 후 커서가 블록 밖에 남은 경우)
    const doc = editor.state.doc;
    const siblings: { node: any; pos: number }[] = [];
    doc.forEach((child, offset) => {
      if (child.type.name === 'tabBlock' && (offset + child.nodeSize === $from.pos || offset === $from.pos)) {
        siblings.push({ node: child, pos: offset });
      }
    });
    for (const s of siblings) {
      if (focusPanelAt(editor, s.pos, (s.node.attrs.activeId as string | null) ?? null)) return true;
    }
    // 3) 레거시: blockId 전역 스캔 (첫 매칭)
    if (blockId) {
      let found = -1;
      let foundActive: string | null = null;
      doc.descendants((node, pos) => {
        if (found !== -1) return false;
        if (node.type.name === 'tabBlock' && node.attrs.blockId === blockId) {
          found = pos;
          foundActive = (node.attrs.activeId as string | null) ?? null;
          return false;
        }
        return true;
      });
      if (found !== -1 && focusPanelAt(editor, found, foundActive)) return true;
    }
    return false;
  } catch {
    return false;
  }
};
