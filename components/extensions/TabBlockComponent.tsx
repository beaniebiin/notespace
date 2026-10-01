import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import { Plus, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TAB_PRESET_COLORS, tabPill } from './TabBlockUtils';

interface TabItemInfo {
  itemId: string;
  label: string;
  color: string | null;
  active: boolean;
  hasContent: boolean;
}

const readItems = (node: PMNode): TabItemInfo[] => {
  const arr: TabItemInfo[] = [];
  node.forEach((child) => {
    arr.push({
      itemId: child.attrs.itemId,
      label: child.attrs.label || '탭',
      color: child.attrs.color || null,
      active: !!child.attrs.active,
      hasContent: (child.textContent || '').trim().length > 0,
    });
  });
  return arr;
};

/**
 * 탭 블록 에디터 NodeView.
 * - 타이틀 행 (Q6: 회색·작게·얇게, 클릭 편집)
 * - 헤더 행 (전환 + 추가 + 이름변경(더블클릭) + 삭제 + 컬러칩(Q4: 5색 + 커스텀))
 * - 패널 전환은 자식 data-active 플래그 + CSS (index.css .tab-panels 규칙)
 */
export const TabBlockComponent: React.FC<NodeViewProps> = ({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
}) => {
  const items = readItems(node);
  const activeId = items.some((i) => i.itemId === node.attrs.activeId)
    ? node.attrs.activeId
    : items[0]?.itemId;

  const [titleDraft, setTitleDraft] = useState<string>(node.attrs.title || '');
  const [titleFocused, setTitleFocused] = useState(false);
  const [editingLabel, setEditingLabel] = useState<{ id: string; value: string } | null>(null);
  // item4: pill 더블클릭/도트 클릭 시 탭 위에 뜨는 미니 칩 팝업 위치
  const [chipOpen, setChipOpen] = useState<{ id: string; top: number; left: number } | null>(null);
  const chipBoxRef = useRef<HTMLDivElement>(null);
  const chipMountRef = useRef(0);

  // 외부 변경(undo 등) 시 타이틀 초안 동기화 (편집 중 제외)
  useEffect(() => {
    if (!titleFocused) setTitleDraft(node.attrs.title || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.attrs.title]);

  // 정합성 보장 (수렴 시 자동 정지, effect는 [node] 변경 때만 재실행):
  // 1) 중복·결손 itemId 재생성 (붙여넣기 복제 등으로 같은 블록 안에 중복이 생긴 경우)
  // 2) activeId 무효·플래그 불일치 → 단일 트랜잭션 정규화
  // 3) 빈 패널(childCount 0) → 빈 paragraph 삽입 (클릭·입력 가능 영역 확보)
  useEffect(() => {
    if (typeof getPos !== 'function' || !editor || editor.isDestroyed) return;
    const base = getPos();
    if (typeof base !== 'number') return;
    interface EffChild {
      pos: number;
      itemId: string;
      label: string;
      color: string | null;
      active: boolean;
    }
    const seen = new Set<string>();
    const regen = new Map<number, string>(); // childPos -> fresh itemId
    const eff: EffChild[] = [];
    node.forEach((child, offset) => {
      const pos = base + 1 + offset;
      let id = child.attrs.itemId as string | null;
      if (!id || seen.has(id)) {
        id = uuidv4();
        regen.set(pos, id);
      }
      seen.add(id);
      eff.push({
        pos,
        itemId: id,
        label: child.attrs.label || '탭',
        color: child.attrs.color || null,
        active: !!child.attrs.active,
      });
    });
    if (eff.length === 0) return;
    const targetId = eff.some((i) => i.itemId === node.attrs.activeId)
      ? node.attrs.activeId
      : eff[0].itemId;
    const mismatch =
      targetId !== node.attrs.activeId ||
      eff.some((i) => (i.itemId === targetId) !== i.active);
    const empties: number[] = [];
    node.forEach((child, offset) => {
      if (child.childCount === 0) empties.push(base + 1 + offset);
    });
    if (regen.size === 0 && !mismatch && empties.length === 0) return;
    try {
      const tr = editor.state.tr;
      if (regen.size > 0 || mismatch) {
        if (targetId !== node.attrs.activeId) {
          tr.setNodeMarkup(base, undefined, { ...node.attrs, activeId: targetId });
        }
        eff.forEach((c) => {
          const wantActive = mismatch ? c.itemId === targetId : c.active;
          if (regen.has(c.pos) || (mismatch && wantActive !== c.active)) {
            tr.setNodeMarkup(c.pos, undefined, {
              itemId: c.itemId,
              label: c.label,
              color: c.color,
              active: wantActive,
            });
          }
        });
      }
      // 뒤쪽부터 삽입해야 앞쪽 위치가 어긋나지 않음
      empties
        .sort((a, b) => b - a)
        .forEach((pos) => tr.insert(pos + 1, editor.schema.nodes.paragraph.create()));
      editor.view.dispatch(tr);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);

  const childPos = (itemId: string): { pos: number; child: PMNode } | null => {
    if (typeof getPos !== 'function' || !editor || editor.isDestroyed) return null;
    const base = getPos();
    if (typeof base !== 'number') return null;
    let found: { pos: number; child: PMNode } | null = null;
    node.forEach((child, offset) => {
      if (child.attrs.itemId === itemId) found = { pos: base + 1 + offset, child };
    });
    return found;
  };

  const setItemAttrs = (itemId: string, patch: Record<string, any>) => {
    const f = childPos(itemId);
    if (!f || !editor || editor.isDestroyed) return;
    try {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(f.pos, undefined, { ...f.child.attrs, ...patch })
      );
    } catch {
      /* ignore */
    }
  };

  // Q2: 활성 탭 전환 — 부모 activeId + 자식 active 플래그를 동일 트랜잭션에 저장
  const switchTab = (itemId: string) => {
    if (typeof getPos !== 'function' || !editor || editor.isDestroyed) return;
    const base = getPos();
    if (typeof base !== 'number') return;
    try {
      const tr = editor.state.tr.setNodeMarkup(base, undefined, {
        ...node.attrs,
        activeId: itemId,
      });
      node.forEach((child, offset) => {
        tr.setNodeMarkup(base + 1 + offset, undefined, {
          ...child.attrs,
          active: child.attrs.itemId === itemId,
        });
      });
      editor.view.dispatch(tr);
    } catch {
      /* ignore */
    }
  };

  const addTab = () => {
    if (typeof getPos !== 'function' || !editor || editor.isDestroyed) return;
    const base = getPos();
    if (typeof base !== 'number') return;
    try {
      const id = uuidv4();
      // 삭제 후 추가해도 라벨이 겹치지 않도록 기존 최대 번호 + 1
      let maxN = 0;
      items.forEach((i) => {
        const m = /^탭 (\d+)$/.exec(i.label);
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
      });
      const label = `탭 ${maxN + 1}`;
      const end = base + node.nodeSize - 1;
      const newItem = editor.schema.nodes.tabItem.create(
        { itemId: id, label, color: null, active: true },
        editor.schema.nodes.paragraph.create()
      );
      const tr = editor.state.tr;
      node.forEach((child, offset) => {
        tr.setNodeMarkup(base + 1 + offset, undefined, { ...child.attrs, active: false });
      });
      tr.setNodeMarkup(base, undefined, { ...node.attrs, activeId: id });
      tr.insert(end, newItem);
      editor.view.dispatch(tr);
      setEditingLabel({ id, value: label });
    } catch {
      /* ignore */
    }
  };

  // Q3: 마지막 1개 탭 삭제 금지 + 내용 있는 탭은 confirm
  const deleteTab = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (items.length <= 1) return;
    const idx = items.findIndex((i) => i.itemId === itemId);
    if (idx < 0) return;
    const target = items[idx];
    if (target.hasContent && !window.confirm(`"${target.label}" 탭에 내용이 있습니다. 삭제할까요?`)) {
      return;
    }
    if (typeof getPos !== 'function' || !editor || editor.isDestroyed) return;
    const base = getPos();
    if (typeof base !== 'number') return;
    try {
      const f = childPos(itemId);
      if (!f) return;
      const neighbor = items[idx - 1] ?? items[idx + 1];
      let tr = editor.state.tr.delete(f.pos, f.pos + f.child.nodeSize);
      if (node.attrs.activeId === itemId && neighbor) {
        // 삭제된 뒤 이웃 위치 (뒤쪽 이웃은 삭제 크기만큼 당겨짐)
        let npos = childPos(neighbor.itemId)?.pos ?? -1;
        if (npos > f.pos) npos -= f.child.nodeSize;
        tr = tr.setNodeMarkup(npos, undefined, {
          itemId: neighbor.itemId,
          label: neighbor.label,
          color: neighbor.color,
          active: true,
        });
        tr = tr.setNodeMarkup(base, undefined, { ...node.attrs, activeId: neighbor.itemId });
      }
      editor.view.dispatch(tr);
    } catch {
      /* ignore */
    }
    if (editingLabel?.id === itemId) setEditingLabel(null);
    if (chipOpen?.id === itemId) setChipOpen(null);
  };

  // 블록 전체 삭제 (타이틀행 우측 ×): 내용 있는 탭이 하나라도 있으면 confirm
  const deleteBlock = (e: React.MouseEvent) => {
    e.stopPropagation();
    const hasAnyContent = items.some((i) => i.hasContent);
    if (
      hasAnyContent &&
      !window.confirm(`탭 블록 전체를 삭제할까요? ${items.length}개 탭의 내용이 함께 삭제됩니다.`)
    ) {
      return;
    }
    if (typeof getPos !== 'function' || !editor || editor.isDestroyed) return;
    const base = getPos();
    if (typeof base !== 'number') return;
    try {
      editor.view.dispatch(editor.state.tr.delete(base, base + node.nodeSize));
    } catch {
      /* ignore */
    }
  };

  const commitTitle = () => {
    setTitleFocused(false);
    try {
      updateAttributes({ title: titleDraft });
    } catch {
      /* ignore */
    }
  };

  const commitLabel = () => {
    if (!editingLabel) return;
    const v = editingLabel.value.trim();
    if (v) setItemAttrs(editingLabel.id, { label: v });
    setEditingLabel(null);
  };

  const applyColor = (itemId: string, color: string | null) => {
    setItemAttrs(itemId, { color });
    setChipOpen(null);
  };

  // item4: 미니 칩 팝업을 탭 위에 배치 (모바일은 화면 안으로 클램프, 위 공간 없으면 아래)
  const openChips = (e: React.SyntheticEvent, itemId: string) => {
    const el = (e.currentTarget as HTMLElement).closest('[data-tab-pill]') as HTMLElement | null;
    const r = (el ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
    setChipOpen({ id: itemId, top: r.top, left: r.left + r.width / 2 });
  };

  // 칩 팝업 닫기: 바깥 클릭·Esc (여는 제스처와 겹치지 않도록 마운트 가드)
  useEffect(() => {
    if (!chipOpen) return;
    chipMountRef.current = Date.now();
    const onDown = (ev: MouseEvent) => {
      if (Date.now() - chipMountRef.current < 400) return;
      if (chipBoxRef.current && !chipBoxRef.current.contains(ev.target as Node)) {
        setChipOpen(null);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setChipOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [chipOpen]);

  let chipStyle: { top: number; left: number } | null = null;
  if (chipOpen && typeof window !== 'undefined') {
    const W = 184;
    const left = Math.max(8, Math.min(chipOpen.left - W / 2, window.innerWidth - W - 8));
    const above = chipOpen.top - 52;
    chipStyle = { top: above > 8 ? above : chipOpen.top + 32, left };
  }

  const stopKey = (e: React.KeyboardEvent) => e.stopPropagation();
  const stopMouse = (e: React.MouseEvent) => e.stopPropagation();

  // 빈 패널 클릭이 tabBlock 경계 selection으로 끝나면, 입력 글자가 매번 새 tabItem으로
  // 감싸지는 손상이 발생한다. 텍스트·인터랙티브 요소가 아닌 빈 공간 클릭은 활성 패널
  // 끝으로 커서를 직접 배치해 항상 유효한 텍스트 커서를 보장한다.
  const onPanelsMouseDown = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!t || typeof (t as any).closest !== 'function') return;
    if (
      t.closest(
        'p, li, ul, ol, h1, h2, h3, h4, h5, h6, pre, code, blockquote, table, tr, td, th, summary, details, input, button, a, img, [data-tab-pill], .tab-headers, .tab-block .tab-block'
      )
    ) {
      return; // 텍스트·토글·중첩탭 등: 네이티브 동작 유지
    }
    e.preventDefault();
    focusActivePanelEnd();
  };

  const focusActivePanelEnd = () => {
    if (typeof getPos !== 'function' || !editor || editor.isDestroyed) return;
    const f = childPos(activeId);
    if (!f) return;
    try {
      const $end = editor.state.doc.resolve(f.pos + f.child.nodeSize - 1);
      const sel = Selection.findFrom($end, -1, true) || Selection.near($end, -1);
      editor.view.dispatch(editor.state.tr.setSelection(sel));
      editor.view.focus();
    } catch {
      /* ignore */
    }
  };

  return (
    <NodeViewWrapper
      className={`tab-block my-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 overflow-hidden transition-shadow ${
        selected ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''
      }`}
    >
      {/* Q6: 블록 타이틀 — 회색·작고·얇게 + 우측 끝 블록 삭제 버튼 */}
      <div className="px-4 pt-2.5 flex items-center gap-2" onMouseDown={stopMouse}>
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onFocus={() => setTitleFocused(true)}
          onKeyDown={(e) => {
            stopKey(e);
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setTitleDraft(node.attrs.title || '');
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="탭 블록 제목"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent outline-none border-none p-0 text-[0.9rem] font-[300] text-[#222222] dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={deleteBlock}
          title="탭 블록 삭제"
          className="p-0.5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
        >
          <X size={13} />
        </button>
      </div>

      {/* 탭 헤더 행 (Q5 모바일: 가로 스크롤) */}
      <div
        className="tab-headers flex items-center gap-1 px-3 pt-1.5 pb-1 overflow-x-auto"
        contentEditable={false}
        onMouseDown={stopMouse}
      >
        {items.map((it) => {
          const isActive = it.itemId === activeId;
          const pill = tabPill(it.color, isActive);
          return (
            <div
              key={it.itemId}
              data-tab-pill={it.itemId}
              role="button"
              tabIndex={0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => switchTab(it.itemId)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                openChips(e, it.itemId);
                setEditingLabel({ id: it.itemId, value: it.label });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  switchTab(it.itemId);
                }
              }}
              title={`${it.label} (더블클릭: 이름 변경 + 색상 변경)`}
              className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full text-sm whitespace-nowrap cursor-pointer transition-colors shrink-0 ${
                isActive
                  ? 'font-semibold text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60'
              } ${pill.className}`}
              style={pill.style}
            >
              {editingLabel?.id === it.itemId ? (
                <input
                  autoFocus
                  value={editingLabel.value}
                  onChange={(e) => setEditingLabel({ id: it.itemId, value: e.target.value })}
                  onBlur={commitLabel}
                  onMouseDown={stopMouse}
                  onDoubleClick={stopMouse}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    stopKey(e);
                    if (e.key === 'Enter') commitLabel();
                    if (e.key === 'Escape') setEditingLabel(null);
                  }}
                  spellCheck={false}
                  className="w-20 bg-white dark:bg-gray-700 outline-none border border-purple-300 dark:border-purple-600 rounded px-1 text-sm"
                />
              ) : (
                <span className="leading-none">{it.label}</span>
              )}
              {items.length > 1 && (
                <span
                  role="button"
                  tabIndex={-1}
                  title="탭 삭제"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => deleteTab(it.itemId, e)}
                  className="p-0.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X size={12} />
                </span>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addTab}
          title="탭 추가"
          className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700/60 transition-colors shrink-0"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* 패널: R3 — 폰트 지정 없음 (.tiptap p 상속) */}
      <div className="px-4 pb-4 pt-1 min-w-0" onMouseDown={onPanelsMouseDown}>
        <NodeViewContent className="tab-panels min-w-0" />
      </div>

      {/* item4: 컬러칩 미니 팝업 — pill 더블클릭/도트 클릭 시 탭 위에 표시 */}
      {chipOpen && chipStyle && createPortal(
        <div
          ref={chipBoxRef}
          contentEditable={false}
          className="fixed z-[130] w-[184px] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 p-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={chipStyle}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-1">
            {TAB_PRESET_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(chipOpen.id, c.name)}
                title={c.name}
                className="w-6 h-6 rounded-full border border-black/10 dark:border-white/20 hover:scale-110 transition-transform cursor-pointer"
                style={{ backgroundColor: c.hex }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyColor(chipOpen.id, null)}
              title="색상 제거"
              className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-[10px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>,
        document.body
      )}
    </NodeViewWrapper>
  );
};

export default TabBlockComponent;
