import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  MessageSquare,
  Zap,
  Send,
  Upload,
  FileText,
  Server,
  Loader2,
  X,
  Settings,
  Plus,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
} from 'lucide-react';
import { RightSidebarPlugin, RightSidebarContext } from '../RightSidebarTypes';
import {
  getAiEndpoints,
  AiEndpoint,
  SkillItem,
  getSkills,
  saveSkill,
  deleteSkill,
  reorderSkills,
  resetSkillsToDefault,
} from '../../../services/geminiService';

export const IdeaClipPluginComponent: React.FC<{ ctx: RightSidebarContext }> = ({ ctx }) => {
  const { onAiAction, isAiLoading = false, onOpenAiEndpointSettings } = ctx;

  // Sub-tabs: 'chat' | 'skills'
  const [subTab, setSubTab] = useState<'chat' | 'skills'>('chat');

  // AI Endpoints & Models
  const [endpoints, setEndpoints] = useState<AiEndpoint[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | number>('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Chat State
  const [chatPrompt, setChatPrompt] = useState<string>('');
  const [attachments, setAttachments] = useState<{ mimeType: string; data: string; name: string }[]>([]);
  const [excludeContent, setExcludeContent] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Skills State
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [skillPrompt, setSkillPrompt] = useState<string>('');
  const [skillExcludeContent, setSkillExcludeContent] = useState<boolean>(false);

  // Skill Management State
  const [isManagingSkills, setIsManagingSkills] = useState<boolean>(false);
  const [editingSkill, setEditingSkill] = useState<{
    id?: string;
    title: string;
    description: string;
    system_prompt: string;
  } | null>(null);
  const [isSavingSkill, setIsSavingSkill] = useState<boolean>(false);

  // 1. Load AI Endpoints
  useEffect(() => {
    let isCancelled = false;
    getAiEndpoints()
      .then((data) => {
        if (!isCancelled) {
          const list = data.answer_endpoints || [];
          setEndpoints(list);
          if (list.length > 0) {
            const currentEp = list.find((e) => String(e.id) === String(selectedEndpointId)) || list[0];
            setSelectedEndpointId(currentEp.id);
            const models = currentEp.models || [];
            if (!selectedModel || !models.includes(selectedModel)) {
              setSelectedModel(models[0] || '');
            }
          }
        }
      })
      .catch((e) => console.error('Failed to load AI endpoints in IdeaClip', e));

    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. Load Skills
  const refreshSkills = useCallback(async () => {
    try {
      const items = await getSkills();
      setSkills(items);
      if (items.length > 0 && !selectedSkillId) {
        setSelectedSkillId(items[0].id);
      }
    } catch (e) {
      console.error('Failed to refresh skills in IdeaClip', e);
    }
  }, [selectedSkillId]);

  useEffect(() => {
    refreshSkills();
  }, [refreshSkills]);

  const activeEndpoint = endpoints.find((e) => String(e.id) === String(selectedEndpointId)) || endpoints[0];
  const availableModels = activeEndpoint?.models || [];
  const activeSkill = skills.find((s) => s.id === selectedSkillId) || skills[0];

  const handleEndpointChange = (epId: string) => {
    setSelectedEndpointId(epId);
    const ep = endpoints.find((e) => String(e.id) === String(epId));
    if (ep && ep.models && ep.models.length > 0) {
      setSelectedModel(ep.models[0]);
    } else {
      setSelectedModel('');
    }
  };

  // File Attachment Process
  const processFile = (file: globalThis.File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      let mimeType = file.type;
      if (!mimeType || mimeType.trim() === '') {
        const name = file.name.toLowerCase();
        if (name.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (name.endsWith('.png')) mimeType = 'image/png';
        else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (name.endsWith('.webp')) mimeType = 'image/webp';
        else if (name.endsWith('.gif')) mimeType = 'image/gif';
      }

      setAttachments((prev) => [
        ...prev,
        {
          mimeType: mimeType || 'application/pdf',
          data: base64String,
          name: file.name,
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Send Free Chat
  const handleSendChat = () => {
    if (!chatPrompt.trim() || !onAiAction) return;
    onAiAction(chatPrompt, attachments, selectedEndpointId, selectedModel, excludeContent);
    setChatPrompt('');
    setAttachments([]);
  };

  // Run Selected Skill
  const handleRunSkill = () => {
    if (!activeSkill || !onAiAction) return;
    const promptToSend = skillPrompt.trim() || activeSkill.title;
    onAiAction(
      promptToSend,
      [],
      selectedEndpointId,
      selectedModel,
      skillExcludeContent,
      false,
      activeSkill.system_prompt
    );
    setSkillPrompt('');
  };

  // Skill Management Handlers
  const handleSaveSkillForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSkill || !editingSkill.title.trim() || !editingSkill.system_prompt.trim()) return;

    setIsSavingSkill(true);
    try {
      await saveSkill({
        id: editingSkill.id,
        title: editingSkill.title.trim(),
        description: editingSkill.description.trim(),
        system_prompt: editingSkill.system_prompt.trim(),
      });
      setEditingSkill(null);
      await refreshSkills();
    } catch (err) {
      console.error('Failed to save skill', err);
    } finally {
      setIsSavingSkill(false);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!window.confirm('이 스킬을 삭제하시겠습니까?')) return;
    await deleteSkill(id);
    await refreshSkills();
  };

  const handleMoveSkill = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= skills.length) return;

    const copy = [...skills];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    const orderedIds = copy.map((s) => s.id);
    await reorderSkills(orderedIds);
    await refreshSkills();
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('기본 내장 스킬로 초기화하시겠습니까?')) return;
    await resetSkillsToDefault();
    await refreshSkills();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 text-xs overflow-y-auto custom-scrollbar select-text">
      {/* 1. Sub-Tab Segmented Control */}
      <div className="flex p-0.5 mb-3 bg-gray-100 dark:bg-[#1f1f1f] rounded-lg border border-gray-200/60 dark:border-gray-800/60 font-medium">
        <button
          type="button"
          onClick={() => {
            setSubTab('chat');
            setIsManagingSkills(false);
          }}
          className={`flex-1 py-1.5 px-2 flex items-center justify-center space-x-1.5 rounded-md transition-all cursor-pointer ${subTab === 'chat'
            ? 'bg-white dark:bg-[#2c2c2c] text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
        >
          <MessageSquare size={13} />
          <span>요청</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('skills')}
          className={`flex-1 py-1.5 px-2 flex items-center justify-center space-x-1.5 rounded-md transition-all cursor-pointer ${subTab === 'skills'
            ? 'bg-white dark:bg-[#2c2c2c] text-amber-600 dark:text-amber-400 shadow-xs font-semibold'
            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
        >
          <Zap size={13} />
          <span>스킬</span>
        </button>
      </div>

      {/* 2. AI Endpoint & Model Selector (Shared) */}
      <div className="mb-3 p-2 bg-gray-50/80 dark:bg-[#1a1a1a]/80 rounded-lg border border-gray-200/50 dark:border-gray-800/50 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={selectedEndpointId}
            onChange={(e) => handleEndpointChange(e.target.value)}
            className="w-full text-[9px] p-1.5 bg-white dark:bg-[#252525] border border-gray-200 dark:border-gray-700/80 rounded focus:ring-1 focus:ring-blue-500 focus:outline-hidden truncate"
          >
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}
              </option>
            ))}
          </select>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={availableModels.length === 0}
            className="w-full text-[9px] p-1.5 bg-white dark:bg-[#252525] border border-gray-200 dark:border-gray-700/80 rounded focus:ring-1 focus:ring-blue-500 focus:outline-hidden truncate disabled:opacity-50"
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {onOpenAiEndpointSettings && (
            <button
              type="button"
              onClick={onOpenAiEndpointSettings}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors rounded cursor-pointer"
              title="엔드포인트 설정"
            >
              <Settings size={12} />
            </button>
          )}

        </div>
      </div>

      {/* 3. Sub-View: Free Chat */}
      {subTab === 'chat' && (
        <div className="flex-1 flex flex-col space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex-1 flex flex-col p-2.5 rounded-lg border transition-all ${isDragging
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1e1e]'
              }`}
          >
            <textarea
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              placeholder="요청할 내용을 입력하세요..."
              className="w-full flex-1 min-h-[90px] bg-transparent border-none resize-none focus:outline-hidden text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 leading-relaxed"
            />

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                {attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-1 text-[11px] bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-300 max-w-full"
                  >
                    <FileText size={11} className="shrink-0" />
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={excludeContent}
                  onChange={(e) => setExcludeContent(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0 focus:ring-offset-0 dark:bg-[#252525] dark:border-gray-700"
                />
                <span>노트 본문 제외 (프롬프트만 전송)</span>
              </label>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer"
                title="이미지/PDF 첨부"
              >
                <Upload size={12} />
                <span>첨부</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <button
              type="button"
              onClick={handleSendChat}
              disabled={isAiLoading || !chatPrompt.trim()}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center space-x-1.5 font-medium shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isAiLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>생성 중...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 4. Sub-View: Skills */}
      {subTab === 'skills' && (
        <div className="flex-1 flex flex-col space-y-3">
          {/* Skills Management Toggle Bar */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {isManagingSkills ? '스킬 관리' : '스킬 목록'}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsManagingSkills((prev) => !prev);
                setEditingSkill(null);
              }}
              className={`text-[11px] flex items-center space-x-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${isManagingSkills
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-semibold'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              <Settings size={11} />
              <span>{isManagingSkills ? '완료' : '관리'}</span>
            </button>
          </div>

          {/* Mode 4-A: Skill Management */}
          {isManagingSkills ? (
            <div className="space-y-3">
              {/* Add / Edit Form */}
              {editingSkill ? (
                <form
                  onSubmit={handleSaveSkillForm}
                  className="p-3 bg-white dark:bg-[#1e1e1e] rounded-lg border border-amber-300 dark:border-amber-700/60 space-y-2 shadow-xs"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-800 dark:text-gray-200">
                    <span>{editingSkill.id ? '스킬 수정' : '스킬 추가'}</span>
                    <button
                      type="button"
                      onClick={() => setEditingSkill(null)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">스킬 이름</label>
                    <input
                      type="text"
                      required
                      value={editingSkill.title}
                      onChange={(e) => setEditingSkill({ ...editingSkill, title: e.target.value })}
                      placeholder="예: 영문 번역, 비즈니스 보고서 톤"
                      className="w-full p-1.5 text-xs bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">설명</label>
                    <input
                      type="text"
                      value={editingSkill.description}
                      onChange={(e) => setEditingSkill({ ...editingSkill, description: e.target.value })}
                      placeholder="스킬의 용도와 특징"
                      className="w-full p-1.5 text-xs bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                      시스템 프롬프트
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={editingSkill.system_prompt}
                      onChange={(e) => setEditingSkill({ ...editingSkill, system_prompt: e.target.value })}
                      placeholder="AI가 수행할 구체적인 역할 및 형식 가이드라인을 작성하세요."
                      className="w-full p-1.5 text-xs bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded focus:ring-1 focus:ring-amber-500 focus:outline-hidden leading-relaxed"
                    />
                  </div>

                  <div className="flex space-x-2 pt-1">
                    <button
                      type="submit"
                      disabled={isSavingSkill}
                      className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium flex items-center justify-center space-x-1 cursor-pointer transition-colors"
                    >
                      {isSavingSkill ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      <span>저장</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSkill(null)}
                      className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingSkill({
                        title: '',
                        description: '',
                        system_prompt: '',
                      })
                    }
                    className="flex-1 py-1.5 px-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 rounded-lg flex items-center justify-center space-x-1 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>스킬 추가</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="py-1.5 px-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg flex items-center justify-center space-x-1 hover:text-gray-900 dark:hover:text-gray-200 transition-colors cursor-pointer"
                    title="기본 프리셋 복원"
                  >
                    <RotateCcw size={12} />
                    <span>기본값</span>
                  </button>
                </div>
              )}

              {/* Skills Order & Edit List */}
              <div className="space-y-1.5">
                {skills.map((skill, idx) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between p-2 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-800 rounded-lg"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-semibold text-gray-800 dark:text-gray-200 truncate">{skill.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">{skill.description || '설명 없음'}</div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveSkill(idx, 'up')}
                        className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 cursor-pointer"
                        title="위로 이동"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === skills.length - 1}
                        onClick={() => handleMoveSkill(idx, 'down')}
                        className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 cursor-pointer"
                        title="아래로 이동"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSkill({
                            id: skill.id,
                            title: skill.title,
                            description: skill.description,
                            system_prompt: skill.system_prompt,
                          })
                        }
                        className="p-1 text-gray-400 hover:text-blue-500 cursor-pointer"
                        title="수정"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(skill.id)}
                        className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                        title="삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Mode 4-B: Skill Selection & Execution */
            <div className="space-y-3">
              {/* Skill Cards Selector */}
              <div className="grid grid-cols-1 gap-1.5">
                {skills.map((skill) => {
                  const isSelected = skill.id === selectedSkillId;
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => setSelectedSkillId(skill.id)}
                      className={`text-left p-2 rounded-lg border transition-all cursor-pointer ${isSelected
                        ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-600/80 shadow-xs'
                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1e1e] hover:border-gray-300 dark:hover:border-gray-700'
                        }`}
                    >
                      <div className="flex items-center space-x-1.5 font-semibold text-gray-800 dark:text-gray-200">
                        <Zap
                          size={12}
                          className={isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}
                        />
                        <span className="truncate">{skill.title}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Skill Execution Panel */}
              {activeSkill && (
                <div className="p-2.5 bg-gray-50/70 dark:bg-[#1a1a1a]/70 rounded-lg border border-gray-200/60 dark:border-gray-800/60 space-y-2">
                  <textarea
                    value={skillPrompt}
                    onChange={(e) => setSkillPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleRunSkill();
                      }
                    }}
                    placeholder="추가 지시사항을 입력하세요."
                    className="w-full min-h-[60px] p-2 text-xs bg-white dark:bg-[#222222] border border-gray-200 dark:border-gray-700 rounded-md resize-none focus:outline-hidden focus:ring-1 focus:ring-amber-500 leading-relaxed placeholder-gray-400"
                  />

                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                    <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={skillExcludeContent}
                        onChange={(e) => setSkillExcludeContent(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-0 focus:ring-offset-0 dark:bg-[#252525] dark:border-gray-700"
                      />
                      <span>현재 노트 본문 제외</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunSkill}
                    disabled={isAiLoading}
                    className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg flex items-center justify-center space-x-1.5 font-medium shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {isAiLoading ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                      </>
                    ) : (
                      <>
                        <Zap size={13} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const IdeaClipPlugin: RightSidebarPlugin = {
  id: 'idea',
  title: 'IdeaClip',
  icon: Sparkles,
  tooltip: 'IdeaClip',
  render: (ctx: RightSidebarContext) => <IdeaClipPluginComponent ctx={ctx} />,
};
