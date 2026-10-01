import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TabBlockComponent } from './TabBlockComponent';
import { createDefaultTabBlock } from './TabBlockUtils';
import { v4 as uuidv4 } from 'uuid';
import { escapeHtmlAttr as escapeAttr } from './htmlAttr';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabBlock: {
      insertTabBlock: () => ReturnType;
    };
  }
}

export const TabBlock = Node.create({
  name: 'tabBlock',

  group: 'block',

  content: 'tabItem+',

  defining: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id') || uuidv4(),
        renderHTML: (attributes) => ({ 'data-block-id': attributes.blockId }),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') || '',
        renderHTML: (attributes) => ({ 'data-title': attributes.title || '' }),
      },
      activeId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-active-id'),
        renderHTML: (attributes) => ({ 'data-active-id': attributes.activeId || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tab-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tab-block' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabBlockComponent);
  },

  addCommands() {
    return {
      insertTabBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent(createDefaultTabBlock());
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(
            `<div data-type="tab-block" data-block-id="${escapeAttr(node.attrs.blockId)}" data-title="${escapeAttr(node.attrs.title)}" data-active-id="${escapeAttr(node.attrs.activeId)}">\n\n`
          );
          state.renderContent(node);
          state.write(`\n\n</div>`);
          state.closeBlock(node);
        },
      },
    };
  },
});

export const TabItem = Node.create({
  name: 'tabItem',

  // 전용 그룹: 'block'에서 분리하여 tabItem 중첩·최상위 배치를 스키마 레벨에서 차단.
  // - tabBlock content 'tabItem+' → 이 그룹과 매칭되어 부모-자식 관계 유지
  // - tabItem content 'block+' → 자기 자신은 block 그룹이 아니므로 중첩 불가
  // - doc 최상위('block+')·paste 시 단독 tabItem은 허용되지 않아 구조 손상 원천 차단
  group: 'tabItem',

  content: 'block+',

  defining: true,

  addAttributes() {
    return {
      itemId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-item-id') || uuidv4(),
        renderHTML: (attributes) => ({ 'data-item-id': attributes.itemId }),
      },
      label: {
        default: '탭',
        parseHTML: (element) => element.getAttribute('data-label') || '탭',
        renderHTML: (attributes) => ({ 'data-label': attributes.label || '탭' }),
      },
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-color') || null,
        renderHTML: (attributes) => ({ 'data-color': attributes.color || '' }),
      },
      // CSS 전환용 미러 플래그. 부모 activeId와 동일 트랜잭션에서 함께 갱신됨.
      active: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-active') === 'true',
        renderHTML: (attributes) => ({ 'data-active': attributes.active ? 'true' : 'false' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tab-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tab-item' }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(
            `<div data-type="tab-item" data-item-id="${escapeAttr(node.attrs.itemId)}" data-label="${escapeAttr(node.attrs.label)}" data-color="${escapeAttr(node.attrs.color)}" data-active="${node.attrs.active ? 'true' : 'false'}">\n\n`
          );
          state.renderContent(node);
          state.write(`\n\n</div>`);
          state.closeBlock(node);
        },
      },
    };
  },
});

export default TabBlock;
