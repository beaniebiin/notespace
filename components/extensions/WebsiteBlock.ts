import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { WebsiteBlockComponent } from './WebsiteBlockComponent';

export interface WebsiteBlockOptions {
  HTMLAttributes: Record<string, any>;
}

export const WebsiteBlock = Node.create<WebsiteBlockOptions>({
  name: 'websiteBlock',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      url: {
        default: null,
      },
      title: {
        default: null,
      },
      description: {
        default: null,
      },
      image: {
        default: null,
      },
      favicon: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="website-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'website-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WebsiteBlockComponent);
  },
});
