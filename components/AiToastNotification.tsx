import React, { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';

interface AiToastProps {
  isOpen: boolean;
  endpointName: string;
  modelUsed: string;
  onClose: () => void;
}

export const AiToastNotification: React.FC<AiToastProps> = ({
  isOpen,
  endpointName,
  modelUsed,
  onClose,
}) => {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900/95 dark:bg-gray-800/95 text-white backdrop-blur-md rounded-full shadow-2xl border border-purple-500/30 text-xs font-medium">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white shrink-0">
          <Sparkles size={13} className="animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-purple-300">AI 답변 완료</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-200 font-normal">엔드포인트: <strong className="text-white">{endpointName}</strong></span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-200 font-normal">모델: <strong className="text-purple-200">{modelUsed}</strong></span>
        </div>
        <button
          onClick={onClose}
          className="ml-1 p-0.5 text-gray-400 hover:text-white rounded-full hover:bg-gray-700/50 transition-colors"
          title="Close notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
