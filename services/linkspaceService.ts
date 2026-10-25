import { isTauriEnvironment, localFileAdapter } from './localFileAdapter';
import {
  classifyLegalQuery,
  formatJoParam,
  LegalClassification,
  LegalJoRange,
  LegalSubTarget,
  stripArticleHeader,
} from './legalClassifier';

const OC_STORAGE_KEY = 'notespace_linkspace_oc_key';
const CONFIG_FILE = 'linkspace_config.json';
const LAW_SEARCH_URL = 'http://www.law.go.kr/DRF/lawSearch.do';
const LAW_SERVICE_URL = 'http://www.law.go.kr/DRF/lawService.do';

export interface LegalPrecedentDetail {
  serial: string;
  caseNumber: string;
  caseName: string;
  date: string;
  court: string;
  decisionType: string;
  issues?: string; // 판시사항
  summary?: string; // 판결요지
  refArticles?: string; // 참조조문
  refCases?: string; // 참조판례
  content?: string; // 판례내용
}

export interface LegalDecisionDetail {
  serial: string;
  caseNumber: string;
  caseName: string;
  date: string;
  summary?: string; // 결정요지
  issues?: string; // 판시사항
  targetArticles?: string; // 심판대상조문
  content?: string; // 전문
}

export interface LegalLawArticle {
  joNumber: string;
  joTitle?: string;
  content: string;
  joVal?: number;
  hangItems?: {
    hangNumber?: string;
    hangContent?: string;
  }[];
}

export interface LegalLawDetail {
  lawId: string;
  lawName: string;
  publishDate?: string;
  enforceDate?: string;
  department?: string;
  rangeLabel?: string;
  articles: LegalLawArticle[];
  targetArticle?: LegalLawArticle;
}

export interface UnifiedLegalSearchResult {
  success: boolean;
  classification: LegalClassification;
  precedent?: LegalPrecedentDetail;
  decision?: LegalDecisionDetail;
  law?: LegalLawDetail;
  error?: string;
}

/**
 * 배열 정규화 헬퍼 (단일 객체이거나 배열인 공공 API 응답을 순수 배열로 통일)
 */
function ensureArray<T>(data: any): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return [data];
}

/**
 * HTML 엔티티 및 불필요한 줄바꿈 태그 정제
 */
function cleanText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * HTTP 통신 유틸리티 (Tauri 네이티브 HTTP invoke 또는 웹 브라우저 fetch)
 */
export async function fetchLawRaw(url: string): Promise<string> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('fetch_law_api', { url });
    } catch (e) {
      console.warn('Tauri fetch_law_api failed, trying fetch fallback:', e);
    }
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return await res.text();
}

/**
 * JSON 응답 파싱
 */
export async function fetchLawJson(url: string): Promise<any> {
  const text = await fetchLawRaw(url);
  try {
    return JSON.parse(text);
  } catch (err) {
    // Open API가 에러 발생 시 XML이나 HTML로 반환하는 경우 메시지 정밀 추출
    const msgMatch =
      text.match(/<resultMsg[^>]*>(.*?)<\/resultMsg>/i) ||
      text.match(/<message[^>]*>(.*?)<\/message>/i) ||
      text.match(/<errMsg[^>]*>(.*?)<\/errMsg>/i) ||
      text.match(/<title[^>]*>(.*?)<\/title>/i);

    if (msgMatch && msgMatch[1].trim()) {
      throw new Error(`국가법령정보 API 안내: ${cleanText(msgMatch[1])}`);
    }
    if (text.includes('등록되지 않은') || text.includes('존재하지 않는')) {
      throw new Error('국가법령정보센터에 등록되지 않은 법령이거나 유효하지 않은 요청입니다.');
    }
    throw new Error('법령정보 API 응답을 JSON으로 파싱할 수 없습니다.');
  }
}

export const linkspaceService = {
  /**
   * 저장된 OC 인증키 가져오기
   */
  getOcKey: async (): Promise<string> => {
    try {
      const fileData = await localFileAdapter.readTextFile(CONFIG_FILE);
      if (fileData) {
        const parsed = JSON.parse(fileData);
        if (parsed?.oc) return parsed.oc.trim();
      }
    } catch { }

    if (typeof window !== 'undefined') {
      try {
        const local = localStorage.getItem(OC_STORAGE_KEY);
        if (local) return local.trim();
      } catch { }
    }

    return '';
  },

  /**
   * OC 인증키 저장
   */
  saveOcKey: async (oc: string): Promise<void> => {
    const trimmed = oc.trim();
    try {
      await localFileAdapter.writeTextFile(CONFIG_FILE, JSON.stringify({ oc: trimmed }, null, 2));
    } catch { }

    if (typeof window !== 'undefined') {
      try {
        if (trimmed) {
          localStorage.setItem(OC_STORAGE_KEY, trimmed);
        } else {
          localStorage.removeItem(OC_STORAGE_KEY);
        }
      } catch { }
    }
  },

  /**
   * OC 인증키가 유효하게 등록되어 있는지 확인
   */
  isOcConfigured: async (): Promise<boolean> => {
    const oc = await linkspaceService.getOcKey();
    return Boolean(oc && oc.length > 0);
  },

  /**
   * 1. 판례 검색 (사건번호 기반)
   */
  searchPrecedent: async (caseNumber: string, userOc?: string): Promise<LegalPrecedentDetail | null> => {
    const oc = userOc || (await linkspaceService.getOcKey());
    if (!oc) throw new Error('국가법령정보 Open API 인증키(OC)가 필요합니다.');

    const cleanCaseNo = caseNumber.replace(/\s+/g, '');

    // 1단계: 사건번호로 검색하여 판례일련번호 획득
    const listUrl = `${LAW_SEARCH_URL}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&nb=${encodeURIComponent(cleanCaseNo)}`;
    const listJson = await fetchLawJson(listUrl);
    const searchRoot = listJson?.PrecSearch || listJson?.precSearch || {};
    const rawItems = searchRoot?.prec || searchRoot?.Prec || [];
    const items = ensureArray<any>(rawItems);

    if (items.length === 0) {
      return null;
    }

    // 사건번호 완전일치 매칭 우선
    let matchedItem = items.find((item) => (item['사건번호'] || '').replace(/\s+/g, '') === cleanCaseNo);
    if (!matchedItem) {
      matchedItem = items[0];
    }

    const precSerial = matchedItem['판례일련번호'] || matchedItem['id'];
    if (!precSerial) {
      return null;
    }

    // 2단계: 판례일련번호로 판례 본문 상세 조회
    const detailUrl = `${LAW_SERVICE_URL}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&ID=${encodeURIComponent(precSerial)}`;
    const detailJson = await fetchLawJson(detailUrl);
    const detailRoot = detailJson?.PrecService || detailJson?.precService || {};

    return {
      serial: String(precSerial),
      caseNumber: cleanText(detailRoot['사건번호'] || matchedItem['사건번호']),
      caseName: cleanText(detailRoot['사건명'] || matchedItem['사건명']),
      date: cleanText(detailRoot['선고일자'] || matchedItem['선고일자']),
      court: cleanText(detailRoot['법원명'] || matchedItem['법원명']),
      decisionType: cleanText(detailRoot['판결유형'] || detailRoot['선고'] || matchedItem['판결유형']),
      issues: cleanText(detailRoot['판시사항']),
      summary: cleanText(detailRoot['판결요지']),
      refArticles: cleanText(detailRoot['참조조문']),
      refCases: cleanText(detailRoot['참조판례']),
      content: cleanText(detailRoot['판례내용']),
    };
  },

  /**
   * 2. 헌재 검색 (사건번호 기반)
   */
  searchDecision: async (caseNumber: string, userOc?: string): Promise<LegalDecisionDetail | null> => {
    const oc = userOc || (await linkspaceService.getOcKey());
    if (!oc) throw new Error('국가법령정보 Open API 인증키(OC)가 필요합니다.');

    const cleanCaseNo = caseNumber.replace(/\s+/g, '');

    // 1단계: 사건번호로 검색하여 결정례 일련번호 획득
    const listUrl = `${LAW_SEARCH_URL}?OC=${encodeURIComponent(oc)}&target=detc&type=JSON&nb=${encodeURIComponent(cleanCaseNo)}`;
    const listJson = await fetchLawJson(listUrl);
    const searchRoot = listJson?.DetcSearch || listJson?.detcSearch || {};
    const rawItems = searchRoot?.detc || searchRoot?.Detc || [];
    const items = ensureArray<any>(rawItems);

    if (items.length === 0) {
      return null;
    }

    let matchedItem = items.find((item) => (item['사건번호'] || '').replace(/\s+/g, '') === cleanCaseNo);
    if (!matchedItem) {
      matchedItem = items[0];
    }

    const detcSerial = matchedItem['헌재결정례일련번호'] || matchedItem['id'];
    if (!detcSerial) {
      return null;
    }

    // 2단계: 결정례 상세 조회
    const detailUrl = `${LAW_SERVICE_URL}?OC=${encodeURIComponent(oc)}&target=detc&type=JSON&ID=${encodeURIComponent(detcSerial)}`;
    const detailJson = await fetchLawJson(detailUrl);
    const detailRoot = detailJson?.DetcService || detailJson?.detcService || {};

    return {
      serial: String(detcSerial),
      caseNumber: cleanText(detailRoot['사건번호'] || matchedItem['사건번호']),
      caseName: cleanText(detailRoot['사건명'] || matchedItem['사건명']),
      date: cleanText(detailRoot['종국일자'] || detailRoot['선고일자'] || matchedItem['종국일자']),
      summary: cleanText(detailRoot['결정요지']),
      issues: cleanText(detailRoot['판시사항']),
      targetArticles: cleanText(detailRoot['심판대상조문']),
      content: cleanText(detailRoot['전문']),
    };
  },

  /**
   * 3. 법령 및 조문 검색 (단일 조문 및 조문 범위 지원)
   */
  searchLaw: async (
    lawName: string,
    joInput?: string,
    subTarget?: LegalSubTarget,
    joRange?: LegalJoRange,
    userOc?: string
  ): Promise<LegalLawDetail | null> => {
    const oc = userOc || (await linkspaceService.getOcKey());
    if (!oc) throw new Error('국가법령정보 Open API 인증키(OC)가 필요합니다.');

    // 1단계: 법령명으로 검색하여 법령 ID 획득 (nw=3 현행 우선, display=100)
    const searchUrl = `${LAW_SEARCH_URL}?OC=${encodeURIComponent(oc)}&target=eflaw&type=JSON&query=${encodeURIComponent(lawName)}&search=1&nw=3&display=100`;
    let searchJson = await fetchLawJson(searchUrl);
    let searchRoot = searchJson?.LawSearch || searchJson?.lawSearch || {};
    let rawItems = searchRoot?.law || searchRoot?.Law || [];
    let items = ensureArray<any>(rawItems);

    // 현행에서 결과가 없으면 전체(nw 미지정)로 2차 검색
    if (items.length === 0) {
      const fallbackUrl = `${LAW_SEARCH_URL}?OC=${encodeURIComponent(oc)}&target=eflaw&type=JSON&query=${encodeURIComponent(lawName)}&search=1&display=100`;
      searchJson = await fetchLawJson(fallbackUrl);
      searchRoot = searchJson?.LawSearch || searchJson?.lawSearch || {};
      rawItems = searchRoot?.law || searchRoot?.Law || [];
      items = ensureArray<any>(rawItems);
    }

    if (items.length === 0) {
      return null;
    }

    // 완전일치 우선 매칭
    const cleanName = lawName.replace(/\s+/g, '');
    let matchedLaw = items.find(
      (item) => (item['법령명한글'] || item['법령명'] || '').replace(/\s+/g, '') === cleanName &&
                (item['현행연혁코드'] === '현행' || !item['현행연혁코드'])
    );
    if (!matchedLaw) {
      matchedLaw = items.find(
        (item) => (item['법령명한글'] || item['법령명'] || '').replace(/\s+/g, '') === cleanName
      );
    }
    if (!matchedLaw) {
      matchedLaw = items.find(
        (item) => (item['법령명한글'] || item['법령명'] || '').replace(/\s+/g, '').startsWith(cleanName)
      );
    }
    if (!matchedLaw) {
      matchedLaw = items[0];
    }

    // 법령 상세 조회:
    // 법령ID가 있으면 ID=001706 으로 조회하고, 없으면 MST=법령일련번호 로 조회
    const lawId = matchedLaw['법령ID'] || matchedLaw['id'];
    const mstSeq = matchedLaw['법령일련번호'];
    const officialLawName = matchedLaw['법령명한글'] || matchedLaw['법령명'] || lawName;

    // 조문 범위 검색일 경우 JO 파라미터를 비워 전체 조문을 조회한 후 범위 필터링
    const joParam = joRange ? '' : formatJoParam(joInput);
    let detailUrl: string;
    if (lawId) {
      detailUrl = `${LAW_SERVICE_URL}?OC=${encodeURIComponent(oc)}&target=eflaw&type=JSON&ID=${encodeURIComponent(lawId)}`;
    } else {
      detailUrl = `${LAW_SERVICE_URL}?OC=${encodeURIComponent(oc)}&target=eflaw&type=JSON&MST=${encodeURIComponent(mstSeq)}`;
    }
    if (joParam) {
      detailUrl += `&JO=${joParam}`;
    }

    const detailJson = await fetchLawJson(detailUrl);
    const lawRoot = detailJson?.법령 || detailJson?.Law || {};
    const baseInfo = lawRoot?.기본정보 || {};

    const rawUnits = lawRoot?.조문?.조문단위 || [];
    let units = ensureArray<any>(rawUnits);

    // '조문' 단위 우선 필터링 (장, 절, 관 등 '전문' 제외)
    const actualArticles = units.filter((u) => u['조문여부'] === '조문');
    if (actualArticles.length > 0) {
      units = actualArticles;
    }

    let articles: LegalLawArticle[] = units.map((u) => {
      const joNumStr = String(u['조문번호'] || '');
      const joNum = parseInt(joNumStr, 10) || 0;
      const joBranchStr = String(u['조문가지번호'] || '');
      const joBranch = parseInt(joBranchStr, 10) || 0;
      const joVal = joNum * 10000 + joBranch;

      const joBranchLabel = joBranch > 0 ? `의${joBranch}` : '';
      const joFormatted = joNum > 0 ? `제${joNum}조${joBranchLabel}` : '';

      const hangRaw = u['항'] || [];
      const hangList = ensureArray<any>(hangRaw);
      const hangItems = hangList.map((h) => ({
        hangNumber: h['항번호'] ? `제${h['항번호']}항` : undefined,
        hangContent: cleanText(h['항내용']),
      }));

      return {
        joNumber: joFormatted,
        joTitle: cleanText(u['조문제목']),
        content: cleanText(u['조문내용']),
        joVal,
        hangItems: hangItems.length > 0 ? hangItems : undefined,
      };
    });

    // 조문 범위 필터링 적용 (예: 제3조 ~ 제9조)
    if (joRange) {
      const rangeFiltered = articles.filter((a) => {
        const val = a.joVal ?? 0;
        return val >= joRange.startVal && val <= joRange.endVal;
      });
      if (rangeFiltered.length > 0) {
        articles = rangeFiltered;
      }
    }

    // 타겟 조문 식별 (단일 조문 검색 시에만)
    let targetArticle: LegalLawArticle | undefined;
    if (joInput && !joRange) {
      const cleanJoInput = joInput.replace(/\s+/g, '');
      targetArticle = articles.find((a) => a.joNumber.replace(/\s+/g, '') === cleanJoInput);
      if (!targetArticle && articles.length > 0) {
        targetArticle = articles[0];
      }
    }

    return {
      lawId: String(lawId || mstSeq),
      lawName: cleanText(baseInfo['법령명_한글'] || officialLawName),
      publishDate: cleanText(baseInfo['공포일자']),
      enforceDate: cleanText(baseInfo['시행일자']),
      department: cleanText(typeof baseInfo['소관부처'] === 'string' ? baseInfo['소관부처'] : baseInfo['소관부처']?.content),
      rangeLabel: joRange?.label,
      articles,
      targetArticle,
    };
  },

  /**
   * 통합 질의 검색 실행
   */
  unifiedSearch: async (query: string, userOc?: string): Promise<UnifiedLegalSearchResult> => {
    const classification = classifyLegalQuery(query);

    try {
      if (classification.type === 'prec') {
        const precedent = await linkspaceService.searchPrecedent(classification.targetQuery, userOc);
        if (!precedent) {
          return {
            success: false,
            classification,
            error: `일치하는 판례를 찾을 수 없습니다 (${classification.targetQuery}). 공보불게재 판례이거나 사건번호를 확인해주세요.`,
          };
        }
        return { success: true, classification, precedent };
      }

      if (classification.type === 'detc') {
        const decision = await linkspaceService.searchDecision(classification.targetQuery, userOc);
        if (!decision) {
          return {
            success: false,
            classification,
            error: `일치하는 헌재결정례를 찾을 수 없습니다 (${classification.targetQuery}).`,
          };
        }
        return { success: true, classification, decision };
      }

      // 법령 검색 (단일 조문 및 조문 범위)
      const lawName = classification.lawName || classification.rawQuery;
      const law = await linkspaceService.searchLaw(
        lawName,
        classification.joInput,
        classification.subTarget,
        classification.joRange,
        userOc
      );
      if (!law || law.articles.length === 0) {
        return {
          success: false,
          classification,
          error: `일치하는 법령을 찾을 수 없습니다 (${lawName}).`,
        };
      }

      return { success: true, classification, law };
    } catch (e: any) {
      return {
        success: false,
        classification,
        error: e.message || '법령정보 검색 중 오류가 발생했습니다.',
      };
    }
  },

  /**
   * 일반 텍스트 형식 마크다운 포맷터: 판례
   */
  formatPrecedentMarkdown: (detail: LegalPrecedentDetail): string => {
    const header = `### ${detail.court} ${detail.date ? detail.date + ' 선고 ' : ''}${detail.caseNumber} ${detail.decisionType || '판결'} 【${detail.caseName}】`;
    const sections: string[] = [header, ''];

    if (detail.issues) {
      sections.push('【판시사항】');
      sections.push(detail.issues);
      sections.push('');
    }

    if (detail.summary) {
      sections.push('【판결요지】');
      sections.push(detail.summary);
      sections.push('');
    }

    if (detail.refArticles) {
      sections.push('【참조조문】');
      sections.push(detail.refArticles);
      sections.push('');
    }

    return sections.join('\n').trim();
  },

  /**
   * 일반 텍스트 형식 마크다운 포맷터: 헌재결정례
   */
  formatDecisionMarkdown: (detail: LegalDecisionDetail): string => {
    const header = `### 헌법재판소 ${detail.date ? detail.date + ' ' : ''}${detail.caseNumber} 결정 【${detail.caseName}】`;
    const sections: string[] = [header, ''];

    if (detail.summary) {
      sections.push('【결정요지】');
      sections.push(detail.summary);
      sections.push('');
    }

    if (detail.issues) {
      sections.push('【판시사항】');
      sections.push(detail.issues);
      sections.push('');
    }

    if (detail.targetArticles) {
      sections.push('【심판대상조문】');
      sections.push(detail.targetArticles);
      sections.push('');
    }

    return sections.join('\n').trim();
  },

  /**
   * 일반 텍스트 형식 마크다운 포맷터: 법령
   */
  formatLawMarkdown: (detail: LegalLawDetail): string => {
    // 1. 단일 조문 검색(targetArticle 존재)인 경우: 해당 조문만 출력
    if (detail.targetArticle) {
      const article = detail.targetArticle;
      const titleSuffix = article.joTitle ? ` (${article.joTitle})` : '';
      const header = `### ${detail.lawName} ${article.joNumber}${titleSuffix}`;
      const sections: string[] = [header, ''];

      const body = stripArticleHeader(article.content);
      if (body) {
        sections.push(body);
      } else if (article.content) {
        sections.push(article.content);
      }

      if (article.hangItems && article.hangItems.length > 0) {
        for (const h of article.hangItems) {
          if (h.hangContent && h.hangContent !== article.content && h.hangContent !== body) {
            const prefix = h.hangNumber ? `${h.hangNumber} ` : '';
            sections.push(`${prefix}${h.hangContent}`);
          }
        }
      }

      return sections.join('\n').trim();
    }

    // 2. 조문 범위 검색이거나 전체 법률 검색인 경우: 전체 조문 목록 출력
    if (!detail.articles || detail.articles.length === 0) {
      return `### ${detail.lawName}\n\n등록된 조문 내용이 없습니다.`;
    }

    const rangeSuffix = detail.rangeLabel ? ` ${detail.rangeLabel}` : '';
    const header = `### ${detail.lawName}${rangeSuffix}`;
    const sections: string[] = [header, ''];
    for (const a of detail.articles) {
      const titleSuffix = a.joTitle ? ` (${a.joTitle})` : '';
      sections.push(`**${a.joNumber}${titleSuffix}**`);
      const cleanContent = stripArticleHeader(a.content);
      if (cleanContent) sections.push(cleanContent);
      if (a.hangItems && a.hangItems.length > 0) {
        for (const h of a.hangItems) {
          if (h.hangContent && h.hangContent !== a.content && h.hangContent !== cleanContent) {
            const prefix = h.hangNumber ? `${h.hangNumber} ` : '';
            sections.push(`${prefix}${h.hangContent}`);
          }
        }
      }
      sections.push('');
    }
    return sections.join('\n').trim();
  },
};
