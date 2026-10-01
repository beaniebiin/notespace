import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Trash2, Info, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useResolvedImageUrl } from '../../services/imageStorageService';

export const ImageBlockComponent: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, deleteNode, selected } = props;
  const { src, alt, title, width = '100%', alignment = 'center' } = node.attrs;
  const displaySrc = useResolvedImageUrl(src);

  const [isClicked, setIsClicked] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isActive = selected || isClicked;

  // Handle click outside to dismiss toolbar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsClicked(false);
        setShowInfo(false);
      }
    };

    if (isActive) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActive]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const handleSetAlignment = (newAlign: 'left' | 'center' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    updateAttributes({ alignment: newAlign });
  };

  const handleSetWidth = (newWidth: '40%' | '70%' | '100%', e: React.MouseEvent) => {
    e.stopPropagation();
    updateAttributes({ width: newWidth });
  };

  const justifyClass =
    alignment === 'left' ? 'justify-start' :
    alignment === 'right' ? 'justify-end' :
    'justify-center';

  return (
    <NodeViewWrapper
      ref={containerRef}
      className={`w-full my-4 flex ${justifyClass} select-none`}
      contentEditable={false}
    >
      <div
        className={`relative inline-block max-w-full transition-all duration-150 group ${
          isActive ? 'ring-2 ring-blue-500 rounded-lg' : ''
        }`}
        style={{ width }}
        onClick={(e) => {
          e.stopPropagation();
          setIsClicked(true);
        }}
      >
        <img
          src={displaySrc}
          alt={alt || ''}
          title={title || ''}
          onLoad={handleImageLoad}
          className="rounded-lg w-full h-auto block cursor-pointer transition-all duration-150"
        />

        {/* Floating Toolbar */}
        {isActive && (
          <div
            className="absolute -top-11 right-0 flex items-center gap-0.5 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-lg p-1 z-30 select-none animate-in fade-in duration-150 text-gray-700 dark:text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Alignment Options */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={(e) => handleSetAlignment('left', e)}
                className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  alignment === 'left' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`}
                title="좌측 정렬"
              >
                <AlignLeft size={16} />
              </button>
              <button
                type="button"
                onClick={(e) => handleSetAlignment('center', e)}
                className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  alignment === 'center' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`}
                title="가운데 정렬"
              >
                <AlignCenter size={16} />
              </button>
              <button
                type="button"
                onClick={(e) => handleSetAlignment('right', e)}
                className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  alignment === 'right' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`}
                title="우측 정렬"
              >
                <AlignRight size={16} />
              </button>
            </div>

            <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

            {/* Width Options (40%, 70%, 100%) */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => handleSetWidth('40%', e)}
                className={`px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  width === '40%' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40 dark:text-blue-400 font-bold' : 'text-gray-600 dark:text-gray-300 font-medium'
                }`}
                title="너비 40%"
              >
                40%
              </button>
              <button
                type="button"
                onClick={(e) => handleSetWidth('70%', e)}
                className={`px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  width === '70%' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40 dark:text-blue-400 font-bold' : 'text-gray-600 dark:text-gray-300 font-medium'
                }`}
                title="너비 70%"
              >
                70%
              </button>
              <button
                type="button"
                onClick={(e) => handleSetWidth('100%', e)}
                className={`px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  width === '100%' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40 dark:text-blue-400 font-bold' : 'text-gray-600 dark:text-gray-300 font-medium'
                }`}
                title="너비 100%"
              >
                100%
              </button>
            </div>

            <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

            {/* Info & Delete */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInfo(!showInfo);
                }}
                className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  showInfo ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/40' : 'text-gray-500 dark:text-gray-400'
                }`}
                title="이미지 정보"
              >
                <Info size={16} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode();
                }}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                title="삭제"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Info Popover */}
        {showInfo && isActive && (
          <div
            className="absolute top-2 right-0 bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 rounded-lg p-3 z-40 w-64 text-xs space-y-1.5 text-gray-700 dark:text-gray-300 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-1 flex items-center justify-between">
              <span>Image Details</span>
              <span className="text-[10px] text-blue-500 font-mono">{width}</span>
            </div>
            <div className="truncate" title={src}>
              <span className="font-medium text-gray-500 dark:text-gray-400">Source: </span>
              {src.split('/').pop() || src}
            </div>
            {imgNaturalSize && (
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Original: </span>
                {imgNaturalSize.width} × {imgNaturalSize.height} px
              </div>
            )}
            <div>
              <span className="font-medium text-gray-500 dark:text-gray-400">Align: </span>
              {alignment}
            </div>
            {alt && (
              <div className="truncate" title={alt}>
                <span className="font-medium text-gray-500 dark:text-gray-400">Alt: </span>
                {alt}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export default ImageBlockComponent;
