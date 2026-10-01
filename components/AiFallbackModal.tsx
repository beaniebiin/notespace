import React from 'react';
import { AlertTriangle, ArrowRight, RefreshCw, X } from 'lucide-react';

interface AiFallbackModalProps {
  isOpen: boolean;
  failedEndpointName: string;
  nextEndpointName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AiFallbackModal: React.FC<AiFallbackModalProps> = ({
  isOpen,
  failedEndpointName,
  nextEndpointName,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              엔드포인트 폴백 전환 확인
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              선택된 AI 엔드포인트의 처리가 실패했습니다.
            </p>
          </div>
        </div>

        <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl p-4 mb-6">
          <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed mb-3">
            <strong className="font-semibold text-amber-950 dark:text-amber-100">[{failedEndpointName}]</strong>의 모든 AI 모델 응답 처리에 실패했습니다.
          </p>
          <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-lg border border-amber-200/40 dark:border-amber-900/30 text-xs">
            <span className="text-gray-500 line-through truncate max-w-[140px]">{failedEndpointName}</span>
            <ArrowRight size={14} className="text-amber-500 shrink-0 mx-2" />
            <span className="font-bold text-blue-600 dark:text-blue-400 truncate max-w-[140px]">{nextEndpointName}</span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
            다음 사용 가능한 엔드포인트로 전환하여 다시 시도하시겠습니까?
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-colors"
          >
            <RefreshCw size={13} />
            엔드포인트 전환 후 재시도
          </button>
        </div>
      </div>
    </div>
  );
};
