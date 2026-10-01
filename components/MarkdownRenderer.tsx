import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import { ExternalLink, Link as LinkIcon } from 'lucide-react';
import { TabBlockViewer } from './extensions/TabBlockViewer';
import { cleanMarkdownContent } from './TiptapEditor';
import { colorByName, cssVarFor } from '../services/highlight';
import { useResolvedImageUrl } from '../services/imageStorageService';

// data-bg 이름은 칩의 table(var) 배경으로, 알 수 없는 값은 그대로 통과.
const softCellBg = (bg: unknown): string | undefined => {
  const entry = typeof bg === 'string' ? colorByName(bg) : null;
  if (entry) return cssVarFor(entry.name, 'table');
  return typeof bg === 'string' && bg ? bg : undefined;
};

interface MarkdownRendererProps {
  content: string;
  onNavigate?: (noteId: string, sectionId?: string) => void;
}

const LinkCard: React.FC<{ href: string; children?: React.ReactNode; onNavigate?: (noteId: string, sectionId?: string) => void }> = ({ href, children, onNavigate }) => {
  const isInternal = href.startsWith('#');
  const isDeepLink = href.startsWith('?note=');
  let title = typeof children === 'string' ? children : href;
  let displayUrl = href;
  let faviconUrl = '';

  if (isInternal) {
    const id = href.substring(1);
    const element = document.getElementById(id);
    if (element) {
      title = element.innerText || title;
    }
    displayUrl = `Internal section: ${href}`;
  } else if (isDeepLink) {
    displayUrl = `Note Link: ${href}`;
  } else {
    try {
      const url = new URL(href);
      displayUrl = url.href;
      faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
      if (typeof children === 'string' && (children.startsWith('http') || children.includes(url.hostname))) {
        title = url.hostname;
      }
    } catch (e) {
    }
  }

  const handleLinkClick = (e: React.MouseEvent) => {
    if (isInternal) {
      e.preventDefault();
      const id = href.substring(1);
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (isDeepLink && onNavigate) {
        e.preventDefault();
        const params = new URLSearchParams(href);
        const noteId = params.get('note');
        const hash = href.split('#')[1];
        if (noteId) {
            onNavigate(noteId, hash);
        }
    }
  };

  return (
    <a 
      href={href} 
      onClick={handleLinkClick}
      target={isInternal || isDeepLink ? undefined : "_blank"}
      rel={isInternal || isDeepLink ? undefined : "noopener noreferrer"}
      className="block no-underline my-4 group"
    >
      <div className="flex items-center w-full p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-all duration-200 shadow-sm group-hover:shadow-md border-opacity-60">
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-100 truncate mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center">
            {(isInternal || isDeepLink) ? <LinkIcon size={10} className="mr-1" /> : null}
            {displayUrl}
          </div>
        </div>
        
        {faviconUrl ? (
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-600">
            <img 
              src={faviconUrl} 
              alt="" 
              className="w-6 h-6 object-contain"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
        ) : (
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-400">
            {(isInternal || isDeepLink) ? <LinkIcon size={18} /> : <ExternalLink size={18} />}
          </div>
        )}
      </div>
    </a>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onNavigate }) => {
  return (
    <div className="notion-markdown-body w-full max-w-[900px] mx-auto pb-32">
        <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeSlug]} 
            components={{
                p: ({ node, children, ...props }) => {
                    const childrenArray = React.Children.toArray(children);
                    if (
                        childrenArray.length === 1 && 
                        React.isValidElement(childrenArray[0]) && 
                        // @ts-ignore
                        (childrenArray[0].type === 'a' || (childrenArray[0] as any).props?.href)
                    ) {
                        const child = childrenArray[0] as React.ReactElement<{ href?: string; children?: React.ReactNode }>;
                        const href = child.props.href || '';
                        const childContent = child.props.children;
                        return <LinkCard href={href} onNavigate={onNavigate}>{childContent}</LinkCard>;
                    }
                    return <p className="mb-4" {...props}>{children}</p>;
                },
                
                ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />,
                li: ({node, className, ...props}: any) => {
                    if (className?.includes('task-list-item')) {
                        return <li className={`flex flex-row items-center my-1 list-none ${className || ''}`} {...props} />;
                    }
                    return <li className={`pl-1 ${className || ''}`} {...props} />;
                },
                
                blockquote: ({node, ...props}) => (
                    <blockquote {...props} />
                ),

                th: ({node, style, ...props}: any) => {
                    const bg = softCellBg(props['data-bg']);
                    const mergedStyle = bg ? { ...style, backgroundColor: bg } : style;
                    return <th style={mergedStyle} {...props} />;
                },

                td: ({node, style, ...props}: any) => {
                    const bg = softCellBg(props['data-bg']);
                    const mergedStyle = bg ? { ...style, backgroundColor: bg } : style;
                    return <td style={mergedStyle} {...props} />;
                },

                a: ({node, href, children, ...props}) => {
                    if (!href) return <span {...props}>{children}</span>;
                    
                    const isInternal = href.startsWith('#');
                    const isDeepLink = href.startsWith('?note=');
                    
                    // If it's the only thing in the context (unwrapped by p), render as LinkCard
                    // But we can't easily detect that here inside 'a'. The 'p' component handles unwrapping.
                    // However, if we are here, it means we are rendering an 'a' tag.
                    // If the parent was 'p' and it unwrapped us, we are standalone.
                    // Let's assume for now we use LinkCard for all deep links if they look like standalone blocks?
                    // Actually, let's just use standard <a> for inline links and LinkCard for block links if we can detect.
                    // For simplicity, let's just use standard <a> for inline text links, but intercept click.
                    
                    const handleClick = (e: React.MouseEvent) => {
                        if (isInternal) {
                            e.preventDefault();
                            const id = href.substring(1);
                            const element = document.getElementById(id);
                            if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else if (isDeepLink && onNavigate) {
                            e.preventDefault();
                            const params = new URLSearchParams(href);
                            const noteId = params.get('note');
                            const hash = href.split('#')[1];
                            if (noteId) onNavigate(noteId, hash);
                        }
                    };

                    return (
                        <a 
                            href={href} 
                            onClick={handleClick}
                            className={`${(isInternal || isDeepLink) ? 'text-blue-600 hover:underline cursor-pointer' : 'text-blue-600 hover:underline'}`}
                            target={(isInternal || isDeepLink) ? undefined : "_blank"}
                            rel={(isInternal || isDeepLink) ? undefined : "noopener noreferrer"}
                            {...props}
                        >
                            {children}
                        </a>
                    );
                },
                code: ({node, className, children, ...props}) => {
                    const match = /language-(\w+)/.exec(className || '')
                    // @ts-ignore
                    const isInline = !match && !String(children).includes('\n');
                    
                    if (isInline) {
                         return <code className="bg-gray-100 dark:bg-gray-800 text-red-500 dark:text-red-400 px-1 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
                    }
                    return (
                        <pre className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-4 rounded-md overflow-x-auto my-4 text-[1.05rem] font-[300] leading-[1.6]">
                            <code className={className} {...props}>
                                {children}
                            </code>
                        </pre>
                    )
                },
                input: ({node, ...props}: any) => {
                    if (props.type === 'checkbox') {
                         return <input type="checkbox" checked={props.checked} readOnly className="flex-shrink-0 w-4 h-4 cursor-default accent-blue-600 mr-2" />
                    }
                    return <input {...props}/>
                },
                div: ({node, ...props}: any) => {
                    if (props['data-type'] === 'tab-block') {
                        const kids = React.Children.toArray(props.children).filter(React.isValidElement);
                        const tabs = kids.map((kid: any) => ({
                            label: kid.props?.['data-label'] || '탭',
                            color: kid.props?.['data-color'] || null,
                            content: kid.props?.children,
                        }));
                        return <TabBlockViewer title={props['data-title'] || ''} tabs={tabs} />;
                    }
                    return <div {...props} />;
                },
                img: ({node, src, alt, width, align, style, ...props}: any) => {
                    const displaySrc = useResolvedImageUrl(src);
                    const alignClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';
                    const widthStyle = width ? { width: String(width).endsWith('%') || String(width).endsWith('px') ? width : `${width}%` } : { width: '100%' };
                    return (
                        <div className={`flex ${alignClass} my-4 select-none w-full`}>
                            <img
                                src={displaySrc}
                                alt={alt || ''}
                                style={{ ...style, ...widthStyle }}
                                className="rounded-lg max-w-full h-auto block"
                                {...props}
                            />
                        </div>
                    );
                },
                table: ({node, ...props}: any) => (
                    <div className="tableWrapper">
                        <table {...props} />
                    </div>
                )
            }}
        >
            {cleanMarkdownContent(content)}
        </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;