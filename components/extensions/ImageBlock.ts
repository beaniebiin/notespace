import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageBlockComponent } from './ImageBlockComponent';
import { escapeHtmlAttr } from './htmlAttr';

export interface ImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      setImageBlock: (options: { src: string; alt?: string; title?: string; width?: string; alignment?: string }) => ReturnType;
    };
  }
}

export const ImageBlock = Node.create<ImageOptions>({
  name: 'image', // Overwrite default image node

  addOptions() {
    return {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? 'inline' : 'block';
  },

  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('width') || element.getAttribute('data-width') || element.style.width || '100%',
        renderHTML: attributes => {
          if (!attributes.width || attributes.width === '100%') return {};
          return { width: attributes.width, 'data-width': attributes.width };
        },
      },
      alignment: {
        default: 'center',
        parseHTML: element => element.getAttribute('align') || element.getAttribute('data-align') || element.getAttribute('data-alignment') || 'center',
        renderHTML: attributes => {
          if (!attributes.alignment || attributes.alignment === 'center') return {};
          return { align: attributes.alignment, 'data-align': attributes.alignment };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockComponent);
  },

  addCommands() {
    return {
      setImageBlock:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const alt = state.esc(node.attrs.alt || '');
          const src = state.esc(node.attrs.src || '');
          const title = node.attrs.title ? ` "${state.esc(node.attrs.title)}"` : '';
          const width = node.attrs.width;
          const alignment = node.attrs.alignment;

          const hasCustomWidth = width && width !== '100%';
          const hasCustomAlign = alignment && alignment !== 'center';

          if (hasCustomWidth || hasCustomAlign) {
            const wAttr = width ? ` width="${width}"` : '';
            const aAttr = alignment ? ` align="${alignment}"` : '';
            state.write(`\n\n<img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}"${wAttr}${aAttr} />\n\n`);
          } else {
            if (node.isBlock) {
              state.write(`\n\n![${alt}](${src}${title})\n\n`);
            } else {
              state.write(`![${alt}](${src}${title})`);
            }
          }
        },
      },
    };
  },
});
