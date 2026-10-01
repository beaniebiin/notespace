import React, { useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Trash2, ExternalLink, Eye, EyeOff, Edit2, Check, X, Loader2, Globe } from 'lucide-react';
import { urlPreviewService } from '../../services/urlPreviewService';

export const WebsiteBlockComponent = (props: any) => {
  const { node, deleteNode, updateAttributes } = props;
  const { url, title, favicon, description, image } = node.attrs;
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(url);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    let active = true;
    if (showPreview) {
      setLoadingPreview(true);
      urlPreviewService.fetchPreviewHtml(url).then((html) => {
        if (active) {
          setPreviewHtml(html);
          setLoadingPreview(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [showPreview, url]);

  const handleSave = async () => {
    setIsEditing(false);
    if (editUrl !== url) {
      try {
        const data = await urlPreviewService.fetchMetadata(editUrl);
        updateAttributes({
          url: editUrl,
          title: data.title || editUrl,
          favicon: data.favicon || '',
          description: data.description || '',
          image: data.image || '',
        });
      } catch (e) {
        console.error('Failed to fetch metadata', e);
        updateAttributes({ url: editUrl });
      }
    }
  };

  const handleCancel = () => {
    setEditUrl(url);
    setIsEditing(false);
  };

  const openExternal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <NodeViewWrapper className="website-block-component group relative my-4">
      {isEditing ? (
        <div className="flex items-center p-3 border border-blue-500 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
          <input
            type="text"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            className="flex-1 border-none outline-none text-sm mr-2 bg-transparent text-gray-900 dark:text-white"
            placeholder="Enter URL..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />
          <div className="flex gap-1">
            <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded" title="Save">
              <Check size={16} />
            </button>
            <button onClick={handleCancel} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Cancel">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <a
            href={url}
            onClick={openExternal}
            className="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 no-underline transition-colors bg-white dark:bg-gray-900"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="flex items-center justify-center mr-3 shrink-0">
              {favicon ? (
                <img src={favicon} alt="" className="w-5 h-5 object-contain rounded" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              ) : (
                <span className="w-5 h-5 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-gray-400 text-lg">🌐</span>
              )}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                {title || url}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{url}</div>
            </div>
            <div className="ml-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0">
              <ExternalLink size={16} />
            </div>
          </a>

          {/* Preview Section */}
          {showPreview && (
            <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 h-96 relative">
              {loadingPreview ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="text-xs">웹사이트를 안전하게 불러오는 중...</span>
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  title={title || 'Website Preview'}
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-same-origin allow-scripts"
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center text-gray-500 dark:text-gray-400 gap-3">
                  <Globe className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                  <div>
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">웹사이트 미리보기를 직접 열 수 없습니다</div>
                    <div className="text-xs mt-1 text-gray-400">보안 정책(X-Frame-Options) 또는 오프라인 상태일 수 있습니다.</div>
                  </div>
                  <button
                    onClick={openExternal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <ExternalLink size={14} />
                    브라우저에서 직접 열기
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions - visible on hover */}
          <div className="absolute -top-3 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-md p-1 z-10">
            <button
              onClick={() => {
                setEditUrl(url);
                setIsEditing(true);
              }}
              className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 rounded"
              title="URL 편집"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`p-1 rounded ${showPreview ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/20'}`}
              title={showPreview ? '미리보기 닫기' : '미리보기 열기'}
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={deleteNode}
              className="p-1 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}
    </NodeViewWrapper>
  );
};
