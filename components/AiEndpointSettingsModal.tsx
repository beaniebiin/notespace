import React, { useState, useEffect } from 'react';
import { AiEndpoint, getAiEndpoints, saveAiEndpoints } from '../services/geminiService';
import { X, Plus, Trash2, Shield, Eye, EyeOff, Save, Layers, Server } from 'lucide-react';

interface AiEndpointSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiEndpointSettingsModal: React.FC<AiEndpointSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [endpoints, setEndpoints] = useState<AiEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    const data = await getAiEndpoints();
    setEndpoints(data.answer_endpoints || []);
    setLoading(false);
  };

  const handleAddEndpoint = () => {
    const newEp: AiEndpoint = {
      id: `ep-${Date.now()}`,
      name: `AI 엔드포인트 ${endpoints.length + 1}`,
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      api_key: '',
      models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemma-4-31b-it'],
    };
    setEndpoints(prev => [...prev, newEp]);
  };

  const handleRemoveEndpoint = (index: number) => {
    if (endpoints.length <= 1) {
      alert("최소 1개 이상의 엔드포인트가 필요합니다.");
      return;
    }
    setEndpoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleChangeField = (index: number, field: keyof AiEndpoint, value: any) => {
    setEndpoints(prev => {
      const copy = [...prev];
      if (field === 'models' && typeof value === 'string') {
        copy[index] = {
          ...copy[index],
          models: value.split(',').map(m => m.trim()).filter(Boolean)
        };
      } else {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveAiEndpoints({ answer_endpoints: endpoints });
    setSaving(false);
    if (ok) {
      alert("AI 엔드포인트 설정이 성공적으로 저장되었습니다.");
      onClose();
    } else {
      alert("엔드포인트 저장에 실패했습니다.");
    }
  };

  const toggleKeyVisibility = (id: string | number) => {
    const strId = String(id);
    setShowKeys(prev => ({ ...prev, [strId]: !prev[strId] }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-200 dark:border-gray-800 relative overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-purple-50/50 to-blue-50/30 dark:from-gray-900 dark:to-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Server size={18} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-base">
                AI 엔드포인트 통합 관리
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                답변 생성 시 연동되는 AI 게이트웨이 및 모델 폴백 순서를 관리합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Info Banner */}
          <div className="flex items-start gap-3 p-3.5 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 rounded-xl text-xs text-purple-900 dark:text-purple-200">
            <Shield size={16} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">상위 폴더 하드코딩 저장 보장 (../../ai_config.json)</span>
              노트 답변 생성 시 위계 순서대로 호출되는 <strong>AI 엔드포인트 목록</strong>입니다.
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-gray-400">엔드포인트 불러오는 중...</div>
          ) : (
            <div className="space-y-5">
              {endpoints.map((ep, idx) => (
                <div
                  key={ep.id || idx}
                  className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/60 space-y-3.5 relative group"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-gray-200/60 dark:border-gray-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                        #{idx + 1} AI 엔드포인트
                      </span>
                      <input
                        type="text"
                        value={ep.name}
                        onChange={e => handleChangeField(idx, 'name', e.target.value)}
                        placeholder="엔드포인트 명칭"
                        className="font-semibold text-sm text-gray-900 dark:text-white bg-transparent outline-none border-b border-dashed border-gray-300 focus:border-purple-500 dark:border-gray-700 px-1 py-0.5"
                      />
                    </div>
                    {endpoints.length > 1 && (
                      <button
                        onClick={() => handleRemoveEndpoint(idx)}
                        className="p-1 text-gray-400 hover:text-rose-500 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="엔드포인트 삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {/* URL */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      엔드포인트 OpenAI Chat Completions URL
                    </label>
                    <input
                      type="text"
                      value={ep.url}
                      onChange={e => handleChangeField(idx, 'url', e.target.value)}
                      placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showKeys[String(ep.id)] ? "text" : "password"}
                        value={ep.api_key || ''}
                        onChange={e => handleChangeField(idx, 'api_key', e.target.value)}
                        placeholder="API Key 입력..."
                        className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(ep.id)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showKeys[String(ep.id)] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Models Priority List */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                      <Layers size={12} />
                      내부 모델 폴백 순서 (쉼표 구분)
                    </label>
                    <input
                      type="text"
                      value={Array.isArray(ep.models) ? ep.models.join(', ') : ep.models}
                      onChange={e => handleChangeField(idx, 'models', e.target.value)}
                      placeholder="gemini-3.6-flash, gemini-3.5-flash, gemma-4-31b-it"
                      className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-purple-700 dark:text-purple-300 outline-none focus:border-purple-500"
                    />
                    <span className="text-[10px] text-gray-400 mt-1 block">
                      * 선택된 엔드포인트 및 모델 실패 시 내부 우선순위 순서대로 자동 폴백됩니다.
                    </span>
                  </div>
                </div>
              ))}

              <button
                onClick={handleAddEndpoint}
                className="w-full py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-800 hover:border-purple-400 dark:hover:border-purple-600 rounded-xl text-xs font-semibold text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={15} />
                새 AI 엔드포인트 추가
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? '저장 중...' : '설정 저장하기'}
          </button>
        </div>

      </div>
    </div>
  );
};
