import React, { useState } from 'react';
import { tabPill } from './TabBlockUtils';

export interface TabViewerTab {
  label: string;
  color: string | null;
  content: React.ReactNode;
}

interface TabBlockViewerProps {
  title?: string;
  tabs: TabViewerTab[];
}

/** 뷰어(읽기 전용) 탭 블록. 전환은 가능, 편집은 불가. */
export const TabBlockViewer: React.FC<TabBlockViewerProps> = ({ title, tabs }) => {
  const [idx, setIdx] = useState(0);
  if (!tabs || tabs.length === 0) return null;
  const safe = Math.min(idx, tabs.length - 1);
  const active = tabs[safe];

  return (
    <div className="tab-block my-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 overflow-hidden">
      {title ? (
        <div className="px-4 pt-2.5 text-[0.9rem] font-[300] text-[#222222] dark:text-gray-200">
          {title}
        </div>
      ) : null}
      <div className="tab-headers flex items-center gap-1 px-3 pt-1.5 pb-1 overflow-x-auto">
        {tabs.map((t, i) => {
          const isActive = i === safe;
          const pill = tabPill(t.color, isActive);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              title={t.label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap cursor-pointer transition-colors shrink-0 ${
                isActive
                  ? 'font-semibold text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60'
              } ${pill.className}`}
              style={pill.style}
            >
              <span className="leading-none">{t.label || '탭'}</span>
            </button>
          );
        })}
      </div>
      <div className="px-4 pb-4 pt-1 min-w-0">{active?.content}</div>
    </div>
  );
};

export default TabBlockViewer;
