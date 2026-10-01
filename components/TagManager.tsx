import React, { useState, useRef, useEffect } from 'react';
import { Tag, TagColor } from '../types';
import { TAG_COLORS } from '../constants';
import { X, Plus, MoreHorizontal, Check, Trash2 } from 'lucide-react';

interface TagManagerProps {
  tags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  suggestions: Tag[];
}

export const TagManager: React.FC<TagManagerProps> = ({ tags, onTagsChange, suggestions }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [editTag, setEditTag] = useState<Tag | null>(null); // If set, we are editing this tag
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false);
        setEditTag(null);
        setFilter('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddTag = (tag: Tag) => {
    // Check if already exists in current tags
    if (!tags.find(t => t.label.toLowerCase() === tag.label.toLowerCase())) {
      onTagsChange([...tags, tag]);
    }
    setIsPopoverOpen(false);
    setFilter('');
  };

  const handleCreateTag = () => {
    const newTag: Tag = {
      id: `tag-${Date.now()}`,
      label: filter,
      color: 'default'
    };
    handleAddTag(newTag);
  };

  const handleRemoveTag = (tagId: string) => {
    onTagsChange(tags.filter(t => t.id !== tagId));
    if (editTag?.id === tagId) setEditTag(null);
  };

  const handleUpdateTagColor = (tag: Tag, color: TagColor) => {
    const updatedTags = tags.map(t => t.id === tag.id ? { ...t, color } : t);
    onTagsChange(updatedTags);
    setEditTag(null);
  };

  // Filter suggestions
  const filteredSuggestions = suggestions.filter(s =>
    s.label.toLowerCase().includes(filter.toLowerCase()) &&
    !tags.find(t => t.label.toLowerCase() === s.label.toLowerCase())
  );

  // Get unique suggestions by label to avoid duplicates in dropdown
  const uniqueMap = new Map<string, Tag>();
  filteredSuggestions.forEach(item => uniqueMap.set(item.label, item));
  const uniqueSuggestions = Array.from(uniqueMap.values());

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 relative z-10">
      {tags.map(tag => {
        const colorClass = TAG_COLORS[tag.color] || TAG_COLORS.default;
        return (
          <div
            key={tag.id}
            className={`
            ${colorClass} 
            px-2 py-0.5 rounded-full text-xs font-medium flex items-center group cursor-pointer transition-all hover:bg-opacity-80
          `}
          >
            <span className="mr-1">{tag.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditTag(tag);
                setIsPopoverOpen(true);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-black/10 rounded-full transition-opacity"
            >
              <MoreHorizontal size={10} />
            </button>
          </div>
        )
      })}

      <button
        ref={buttonRef}
        onClick={() => {
          setEditTag(null);
          setIsPopoverOpen(!isPopoverOpen);
        }}
        className="no-print flex items-center text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-0.5 rounded transition-colors"
      >
        <Plus size={14} className="mr-1" />
        태그 추가
      </button>

      {isPopoverOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {editTag ? (
            // Edit Mode
            <div className="p-2">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Edit '{editTag.label}'</span>
                <button onClick={() => setEditTag(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-5 gap-1 mb-3">
                {Object.keys(TAG_COLORS).map((colorKey) => (
                  <button
                    key={colorKey}
                    onClick={() => handleUpdateTagColor(editTag, colorKey as TagColor)}
                    className={`
                                    w-6 h-6 rounded-full border border-gray-100 dark:border-gray-700 flex items-center justify-center
                                    ${TAG_COLORS[colorKey as TagColor]}
                                    ${editTag.color === colorKey ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800' : ''}
                                `}
                    title={colorKey}
                  >
                    {editTag.color === colorKey && <Check size={10} />}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                <button
                  onClick={() => handleRemoveTag(editTag.id)}
                  className="w-full text-left flex items-center text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded"
                >
                  <Trash2 size={12} className="mr-2" />
                  Remove Tag
                </button>
              </div>
            </div>
          ) : (
            // Add Mode
            <>
              <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                <input
                  autoFocus
                  type="text"
                  placeholder="태그를 검색하거나 만들어보세요."
                  className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 px-2 py-1 uppercase">태그 선택</div>

                {uniqueSuggestions.map(tag => {
                  const colorClass = TAG_COLORS[tag.color] || TAG_COLORS.default;
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleAddTag({ ...tag, id: `tag-${Date.now()}` })} // Create new instance from suggestion
                      className="w-full text-left flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm group text-gray-900 dark:text-gray-200"
                    >
                      <span className={`w-2 h-2 rounded-full mr-2 ${colorClass.split(' ')[0]}`}></span>
                      {tag.label}
                    </button>
                  )
                })}

                {filter && !uniqueSuggestions.find(s => s.label.toLowerCase() === filter.toLowerCase()) && (
                  <button
                    onClick={handleCreateTag}
                    className="w-full text-left flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm text-gray-800 dark:text-gray-200"
                  >
                    <span className="mr-2 text-xs border border-gray-300 dark:border-gray-600 rounded px-1">New</span>
                    Create "{filter}"
                  </button>
                )}

                {uniqueSuggestions.length === 0 && !filter && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 px-2 pb-2">발견된 태그 없음</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
