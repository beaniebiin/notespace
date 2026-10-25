import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Scale,
  Search,
  Settings,
  Key,
  Copy,
  Check,
  ArrowDownToLine,
  ArrowLeft,
  FileText,
  BookOpen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { RightSidebarPlugin, RightSidebarContext } from '../RightSidebarTypes';
import {
  classifyLegalQuery,
  LegalClassification,
  stripArticleHeader,
} from '../../../services/legalClassifier';
import {
  linkspaceService,
  UnifiedLegalSearchResult,
  LegalPrecedentDetail,
  LegalDecisionDetail,
  LegalLawDetail,
} from '../../../services/linkspaceService';

export const LinkClipPluginComponent: React.FC<{ ctx: RightSidebarContext }> = ({ ctx }) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<UnifiedLegalSearchResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullTextOpen, setIsFullTextOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [filterKeyword, setFilterKeyword] = useState('');

  // OC Modal state
  const [isOcModalOpen, setIsOcModalOpen] = useState(false);
  const [ocInput, setOcInput] = useState('');
  const [hasOcKey, setHasOcKey] = useState<boolean | null>(null);
  const [ocSaveMessage, setOcSaveMessage] = useState<string | null>(null);

  // Live classification preview
  const classification: LegalClassification = useMemo(() => {
    return classifyLegalQuery(query);
  }, [query]);

  // Check initial OC configuration
  useEffect(() => {
    linkspaceService.getOcKey().then((oc) => {
      setOcInput(oc);
      const configured = Boolean(oc && oc.length > 0);
      setHasOcKey(configured);
      if (!configured) {
        setIsOcModalOpen(true);
      }
    });
  }, []);

  // Save OC handler
  const handleSaveOc = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = ocInput.trim();
    if (!clean) {
      setOcSaveMessage('인증키를 입력해주세요.');
      return;
    }
    await linkspaceService.saveOcKey(clean);
    setHasOcKey(true);
    setOcSaveMessage('인증키가 저장되었습니다.');
    setTimeout(() => {
      setIsOcModalOpen(false);
      setOcSaveMessage(null);
    }, 900);
  };

  // Perform search
  const handleSearch = useCallback(
    async (searchQuery?: string, isBackNav = false) => {
      const q = (searchQuery ?? query).trim();
      if (!q) return;

      if (!isBackNav && query.trim() && query.trim() !== q) {
        setHistory((prev) => [...prev, query.trim()]);
      }

      setQuery(q);

      const oc = await linkspaceService.getOcKey();
      if (!oc) {
        setIsOcModalOpen(true);
        return;
      }

      setIsLoading(true);
      setIsFullTextOpen(false);
      setFilterKeyword('');
      try {
        const result = await linkspaceService.unifiedSearch(q, oc);
        setSearchResult(result);
      } catch (e: any) {
        setSearchResult({
          success: false,
          classification,
          error: e.message || '검색 중 오류가 발생했습니다.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [query, classification]
  );

  const handleBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    handleSearch(prev, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Get current markdown text representation
  const getFormattedMarkdown = useCallback((): string => {
    if (!searchResult || !searchResult.success) return '';
    if (searchResult.precedent) {
      return linkspaceService.formatPrecedentMarkdown(searchResult.precedent);
    }
    if (searchResult.decision) {
      return linkspaceService.formatDecisionMarkdown(searchResult.decision);
    }
    if (searchResult.law) {
      return linkspaceService.formatLawMarkdown(searchResult.law);
    }
    return '';
  }, [searchResult]);

  // Copy to clipboard
  const handleCopy = async () => {
    const text = getFormattedMarkdown();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Insert into note
  const handleInsertIntoNote = () => {
    const text = getFormattedMarkdown();
    if (!text || !ctx.onInsertMarkdown) return;
    ctx.onInsertMarkdown(text);
  };

  // Render clickable references (참조조문, 참조판례 스마트 백링크)
  const renderClickableRef = (rawText?: string) => {
    if (!rawText) return null;
    const regex = /(\d{2,4}[가-힣]+\d{1,7}|[가-힣]{2,15}(?:법|법률|령|규칙|헌법)\s*(?:제\s*\d+\s*조(?:\s*(?:의|-)\s*\d+)?(?:\s*제\s*\d+\s*항)?)?)/g;
    const parts = rawText.split(regex);
    return parts.map((part, i) => {
      if (regex.test(part)) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleSearch(part)}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer inline-flex items-center gap-0.5 mx-0.5 px-1 py-0.2 rounded bg-blue-50/80 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            title={`${part} 검색`}
          >
            {part}
          </button>
        );
      }
      return part;
    });
  };

  // Color scheme based on classification type
  const typeBadgeStyle = useMemo(() => {
    switch (classification.type) {
      case 'prec':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'detc':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'law':
      default:
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
  }, [classification.type]);

  // Determine articles to display (Range vs Target vs All)
  const displayArticles = useMemo(() => {
    if (!searchResult?.law) return [];
    if (searchResult.law.targetArticle) {
      return [searchResult.law.targetArticle];
    }
    return searchResult.law.articles;
  }, [searchResult]);

  // In-law filter for full law or range search
  const visibleArticles = useMemo(() => {
    if (!filterKeyword.trim()) return displayArticles;
    const kw = filterKeyword.trim().toLowerCase();
    return displayArticles.filter((a) =>
      a.joNumber.toLowerCase().includes(kw) ||
      (a.joTitle && a.joTitle.toLowerCase().includes(kw)) ||
      (a.content && a.content.toLowerCase().includes(kw))
    );
  }, [displayArticles, filterKeyword]);

  return (
    <div className="h-full flex flex-col min-h-0 text-xs">
      {/* 1. Header & Omnibox */}
      <div className="pb-1.5 mb-1.5 border-b border-gray-100 dark:border-gray-800/80 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          {/* History Back button */}
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleBack}
              title={`이전 검색 (${history[history.length - 1]})`}
              className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft size={13} />
            </button>
          )}

          <div className="relative flex-1 min-w-0 flex items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="입력"
              className="w-full pl-2 pr-14 py-1 text-xs rounded-md bg-gray-100/70 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
            />
            {/* Realtime classification mini badge inside input */}
            {query.trim().length > 0 && (
              <span
                className={`absolute right-1 text-[9.5px] px-1.5 py-0.5 rounded font-medium border ${typeBadgeStyle} pointer-events-none select-none`}
              >
                {classification.typeName}
              </span>
            )}
          </div>

          {/* Search Trigger Button */}
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={!query.trim() || isLoading}
            title="검색 실행 (Enter)"
            className="p-1 px-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none shrink-0 text-[11px]"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          </button>

          {/* OC Settings Gear Button */}
          <button
            type="button"
            onClick={() => setIsOcModalOpen(true)}
            title="법제처 Open API 인증키(OC) 설정"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer shrink-0"
          >
            <Settings size={14} className={!hasOcKey ? 'text-amber-500 animate-pulse' : ''} />
          </button>
        </div>
      </div>

      {/* 2. OC Key Missing Warning Banner */}
      {!hasOcKey && !isOcModalOpen && (
        <div
          onClick={() => setIsOcModalOpen(true)}
          className="mb-1.5 p-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-[11px]">
            <Key size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Open API 인증키(OC)를 등록해야 검색이 가능합니다.</span>
          </div>
          <span className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 underline">
            등록
          </span>
        </div>
      )}

      {/* 3. Main Result Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
        {isLoading ? (
          <div className="h-44 flex flex-col items-center justify-center text-center text-gray-400 gap-2">
            <Loader2 size={24} className="animate-spin text-blue-500" />
            <span className="text-xs">국가법령정보센터에서 조회 중...</span>
          </div>
        ) : searchResult ? (
          searchResult.success ? (
            <div className="space-y-2">
              {/* Precedent View */}
              {searchResult.precedent && (
                <div className="space-y-1.5">
                  <div className="p-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40">
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                      {searchResult.precedent.court} · {searchResult.precedent.date} 선고
                    </div>
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-100 mt-0.5">
                      {searchResult.precedent.caseNumber} {searchResult.precedent.decisionType}
                    </div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-300 font-medium mt-0.5">
                      【{searchResult.precedent.caseName || '사건명 없음'}】
                    </div>
                  </div>

                  {searchResult.precedent.issues && (
                    <div className="p-2 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-200/60 dark:border-gray-800/60">
                      <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                        <FileText size={12} className="text-blue-500" />
                        【판시사항】
                      </div>
                      <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {searchResult.precedent.issues}
                      </div>
                    </div>
                  )}

                  {searchResult.precedent.summary && (
                    <div className="p-2 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-200/60 dark:border-gray-800/60">
                      <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                        <FileText size={12} className="text-blue-500" />
                        【판결요지】
                      </div>
                      <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {searchResult.precedent.summary}
                      </div>
                    </div>
                  )}

                  {searchResult.precedent.refArticles && (
                    <div className="p-2 rounded-lg bg-gray-50/50 dark:bg-gray-850/40 border border-gray-200/50 dark:border-gray-800/50 text-[11px]">
                      <span className="font-semibold text-gray-600 dark:text-gray-400">참조조문: </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {renderClickableRef(searchResult.precedent.refArticles)}
                      </span>
                    </div>
                  )}

                  {searchResult.precedent.refCases && (
                    <div className="p-2 rounded-lg bg-gray-50/50 dark:bg-gray-850/40 border border-gray-200/50 dark:border-gray-800/50 text-[11px]">
                      <span className="font-semibold text-gray-600 dark:text-gray-400">참조판례: </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {renderClickableRef(searchResult.precedent.refCases)}
                      </span>
                    </div>
                  )}

                  {searchResult.precedent.content && (
                    <div className="border border-gray-200/60 dark:border-gray-800/60 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setIsFullTextOpen((prev) => !prev)}
                        className="w-full p-2 flex items-center justify-between text-[11px] font-semibold text-gray-600 dark:text-gray-400 bg-gray-100/50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      >
                        <span>판례 전문 {isFullTextOpen ? '접기' : '보기'}</span>
                        {isFullTextOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {isFullTextOpen && (
                        <div className="p-2 text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900">
                          {searchResult.precedent.content}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Decision View */}
              {searchResult.decision && (
                <div className="space-y-1.5">
                  <div className="p-2 rounded-lg bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/40">
                    <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                      헌법재판소 · {searchResult.decision.date}
                    </div>
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-100 mt-0.5">
                      {searchResult.decision.caseNumber}
                    </div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-300 font-medium mt-0.5">
                      【{searchResult.decision.caseName || '사건명 없음'}】
                    </div>
                  </div>

                  {searchResult.decision.summary && (
                    <div className="p-2 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-200/60 dark:border-gray-800/60">
                      <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                        <FileText size={12} className="text-purple-500" />
                        【결정요지】
                      </div>
                      <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {searchResult.decision.summary}
                      </div>
                    </div>
                  )}

                  {searchResult.decision.issues && (
                    <div className="p-2 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-200/60 dark:border-gray-800/60">
                      <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                        <FileText size={12} className="text-purple-500" />
                        【판시사항】
                      </div>
                      <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {searchResult.decision.issues}
                      </div>
                    </div>
                  )}

                  {searchResult.decision.targetArticles && (
                    <div className="p-2 rounded-lg bg-gray-50/50 dark:bg-gray-850/40 border border-gray-200/50 dark:border-gray-800/50 text-[11px]">
                      <span className="font-semibold text-gray-600 dark:text-gray-400">심판대상조문: </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {renderClickableRef(searchResult.decision.targetArticles)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Law View */}
              {searchResult.law && (
                <div className="space-y-1.5">
                  <div className="p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-100 flex items-center justify-between">
                      <span>
                        {searchResult.law.lawName}
                        {searchResult.law.rangeLabel ? ` (${searchResult.law.rangeLabel})` : ''}
                        {searchResult.law.enforceDate && !searchResult.law.rangeLabel
                          ? ` (${searchResult.law.enforceDate})`
                          : ''}
                      </span>
                      {!searchResult.law.targetArticle && (
                        <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                          총 {searchResult.law.articles.length}개 조문
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick filter input when multiple articles are present */}
                  {!searchResult.law.targetArticle && searchResult.law.articles.length > 1 && (
                    <div className="relative">
                      <input
                        type="text"
                        value={filterKeyword}
                        onChange={(e) => setFilterKeyword(e.target.value)}
                        placeholder={`조문 번호 또는 키워드 필터 (총 ${displayArticles.length}개)...`}
                        className="w-full pl-2 pr-6 py-1 text-[11px] rounded bg-gray-100/70 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-emerald-400 dark:focus:border-emerald-500"
                      />
                      {filterKeyword && (
                        <button
                          type="button"
                          onClick={() => setFilterKeyword('')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}

                  {/* Render Target Article, Range Articles, or Full List */}
                  {visibleArticles.length === 0 ? (
                    <div className="text-center py-4 text-xs text-gray-400">
                      필터와 일치하는 조문이 없습니다.
                    </div>
                  ) : (
                    visibleArticles.map((article, idx) => {
                      const cleanContent = stripArticleHeader(article.content);
                      return (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-200/60 dark:border-gray-800/60 space-y-1 [content-visibility:auto] [contain-intrinsic-size:70px]"
                        >
                          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <BookOpen size={12} />
                            <span>
                              {article.joNumber}
                              {article.joTitle ? ` (${article.joTitle})` : ''}
                            </span>
                          </div>
                          {cleanContent && (
                            <div className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                              {cleanContent}
                            </div>
                          )}
                          {article.hangItems && article.hangItems.length > 0 && (
                            <div className="pl-2 border-l-2 border-emerald-300 dark:border-emerald-700/60 space-y-1 mt-1 text-[11.5px]">
                              {article.hangItems.map((h, hIdx) => (
                                <div key={hIdx} className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                  {h.hangNumber && (
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 mr-1">
                                      {h.hangNumber}
                                    </span>
                                  )}
                                  {h.hangContent}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 flex items-start gap-2 text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div className="leading-relaxed">{searchResult.error}</div>
            </div>
          )
        ) : (
          <div className="h-44 flex flex-col items-center justify-center text-center text-gray-400/80 dark:text-gray-500/80 p-4">
            <Scale size={28} className="mb-2 opacity-50" />
            <p className="text-xs font-medium">법령, 판례, 헌재결정례를 검색해보세요.</p>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              사건번호(87도126, 2024헌나1) 또는<br />
              조문(민법 제1조, 가담법 3조, 민법 제3조~제9조)을 입력하세요.
            </p>
          </div>
        )}
      </div>

      {/* 4. Bottom Action Bar (1 compact horizontal row) */}
      <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-gray-100 dark:border-gray-800/80 text-[11px] text-gray-400 shrink-0 select-none">
        <span className="text-[10px] text-gray-400 truncate">LinkClip</span>

        <div className="flex items-center gap-1">
          {/* Insert into Note Button */}
          {ctx.onInsertMarkdown && (
            <button
              type="button"
              onClick={handleInsertIntoNote}
              disabled={!searchResult?.success}
              title="에디터 현재 커서 위치에 일반 텍스트로 삽입"
              className="px-1.5 py-0.5 rounded hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1 text-[10.5px]"
            >
              <ArrowDownToLine size={12} />
              <span>삽입</span>
            </button>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!searchResult?.success}
            title="마크다운 텍스트 복사"
            className="px-1.5 py-0.5 rounded hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1 text-[10.5px]"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            <span>{copied ? '복사됨' : '복사'}</span>
          </button>
        </div>
      </div>

      {/* 5. OC Key Configuration Modal */}
      {isOcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-1.5 font-bold text-xs text-gray-800 dark:text-gray-100">
                <Key size={14} className="text-amber-500" />
                <span>Open API 인증키 등록</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOcModalOpen(false)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">
              법령·판례 조회를 위해 법제처 국가법령정보 공동활용 사이트(open.law.go.kr)에서 발급받은{' '}
              <strong>인증키(OC)</strong>를 등록해주세요.
            </p>

            <form onSubmit={handleSaveOc} className="space-y-2">
              <input
                type="text"
                value={ocInput}
                onChange={(e) => setOcInput(e.target.value)}
                placeholder="예: your_oc_key_here"
                autoFocus
                className="w-full px-2.5 py-1.5 text-xs rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500"
              />

              {ocSaveMessage && (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {ocSaveMessage}
                </div>
              )}

              <div className="flex items-center justify-end pt-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsOcModalOpen(false)}
                    className="px-2.5 py-1 text-xs rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 cursor-pointer"
                  >
                    닫기
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer transition-colors"
                  >
                    저장
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const LinkClipPlugin: RightSidebarPlugin = {
  id: 'link',
  title: 'LinkClip',
  icon: Scale,
  tooltip: 'LinkClip',
  render: (ctx) => <LinkClipPluginComponent ctx={ctx} />,
};

export default LinkClipPlugin;
