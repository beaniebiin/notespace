import { generateNoteContentViaProxy, Attachment } from './geminiService';
import { TopBarNotification } from '../types';

// 정리 kinds. Slice 1(정리)이 첫 컷, 사실관계·자유는 같은 seam 위 예약 자리.
export type AiRequestKind = '정리' | '사실관계' | '자유';

export interface AiSectionScope {
  title: string;
  level: 1 | 2;
  lineCount: number;
}

export interface AiRequest {
  kind: AiRequestKind;
  // Slice 1: 1줄 추가 지시(없으면 기본 정리). 자유: 전체 프롬프트. 사실관계: 호출자가 지은 프롬프트.
  instruction?: string;
  // Slice 1: 정리 대상 섹션 본문(제목 제외).
  sectionBody?: string;
  scope?: AiSectionScope;
  contextContent?: string;
  files?: Attachment[];
  endpointId?: string | number;
  model?: string;
}

export type AiApplyMode = 'insert' | 'codeBlock' | 'replaceSection';

export interface AiPill {
  type: TopBarNotification['type'];
  message: string;
  duration: number;
}

export type AiOutcome =
  | { status: 'success'; markdown: string; apply: AiApplyMode; modelUsed: string; pill: AiPill }
  | { status: 'not_run'; pill: AiPill }
  | {
      status: 'endpoint_failed';
      pill: AiPill;
      error?: string;
      fallback?: { failedEndpointName: string; nextEndpointId: string | number; nextEndpointName: string };
    }
  | { status: 'error'; pill: AiPill; error?: string };

// organize.md Slice 1 프롬프트 제약. 호출자 문자열이 아닌 이 모듈이 소유.
const ORGANIZE_CONSTRAINTS = [
  '한국어로 작성하세요.',
  '법률 용어는 원문을 그대로 유지하세요.',
  '존재하지 않는 인용(조문·판례)을 창작하지 마세요.',
  '형광펜(<mark>)을 사용하지 마세요. (형광펜은 Slice 3에서만)',
  '제목 줄은 유지하고 본문만 정리된 결과로 출력하세요. Markdown 형식으로 출력하세요.',
].join('\n');

export const buildOrganizePrompt = (
  scope: AiSectionScope,
  sectionBody: string,
  instruction?: string
): string => {
  const extra = instruction?.trim() ? `추가 지시: ${instruction.trim()}\n\n` : '';
  return [
    `다음은 노트의 H${scope.level} '${scope.title}' 섹션 본문입니다. 이 섹션을 정리하세요.`,
    extra,
    '---',
    sectionBody,
    '---',
    ORGANIZE_CONSTRAINTS,
  ].join('\n');
};

export const announceOrganizePill = (scope: AiSectionScope): AiPill => ({
  type: 'ai_loading',
  message: `H${scope.level} '${scope.title}' · ${scope.lineCount}줄 정리`,
  duration: 0,
});

const aiErrorPill = (): AiPill => ({ type: 'ai_error', message: 'AI 요청 오류', duration: 4500 });

// kind별 프롬프트 조립 + 프록시 호출 + 실패 의미 매핑. UI 삽입은 호출자가 outcome.apply로 수행.
export const requestAi = async (req: AiRequest): Promise<AiOutcome> => {
  let prompt: string;
  let contextContent = req.contextContent ?? '';
  let apply: AiApplyMode = 'insert';

  if (req.kind === '정리') {
    if (!req.scope || !req.sectionBody?.trim()) {
      return {
        status: 'not_run',
        pill: { type: 'ai_error', message: '섹션을 특정할 수 없거나 본문이 비어 정리하지 않았습니다', duration: 4500 },
      };
    }
    prompt = buildOrganizePrompt(req.scope, req.sectionBody, req.instruction);
    contextContent = '';
    apply = 'replaceSection';
  } else if (req.kind === '사실관계') {
    prompt = req.instruction ?? '';
    apply = 'codeBlock';
  } else {
    prompt = req.instruction ?? '';
    if (prompt.toLowerCase().includes('summarize')) {
      return forwardLegacySummary(req, prompt);
    }
  }

  let res;
  try {
    res = await generateNoteContentViaProxy(prompt, contextContent, req.files ?? [], req.endpointId, req.model);
  } catch (e: any) {
    return { status: 'error', pill: aiErrorPill(), error: e?.message };
  }

  if (res.status === 'success' && res.content) {
    return {
      status: 'success',
      markdown: res.content,
      apply,
      modelUsed: res.model_used || 'unknown',
      pill: { type: 'ai_success', message: `AI 생성 완료 (${res.model_used || 'unknown'})`, duration: 4500 },
    };
  }
  if (res.status === 'endpoint_failed') {
    return {
      status: 'endpoint_failed',
      pill: aiErrorPill(),
      error: res.error,
      fallback: res.next_endpoint
        ? {
            failedEndpointName: res.failed_endpoint_name || '현재 엔드포인트',
            nextEndpointId: res.next_endpoint.id,
            nextEndpointName: res.next_endpoint.name,
          }
        : undefined,
    };
  }
  return { status: 'error', pill: aiErrorPill(), error: res.error };
};

// 기존 summarize 분기 보존: '### Summary' 머리말을 붙여 삽입.
const forwardLegacySummary = async (req: AiRequest, prompt: string): Promise<AiOutcome> => {
  let res;
  try {
    res = await generateNoteContentViaProxy(prompt, req.contextContent ?? '', req.files ?? [], req.endpointId, req.model);
  } catch (e: any) {
    return { status: 'error', pill: aiErrorPill(), error: e?.message };
  }
  if (res.status === 'success' && res.content) {
    return {
      status: 'success',
      markdown: `\n### Summary\n${res.content}`,
      apply: 'insert',
      modelUsed: res.model_used || 'unknown',
      pill: { type: 'ai_success', message: `AI 생성 완료 (${res.model_used || 'unknown'})`, duration: 4500 },
    };
  }
  if (res.status === 'endpoint_failed') {
    return {
      status: 'endpoint_failed',
      pill: aiErrorPill(),
      error: res.error,
      fallback: res.next_endpoint
        ? {
            failedEndpointName: res.failed_endpoint_name || '현재 엔드포인트',
            nextEndpointId: res.next_endpoint.id,
            nextEndpointName: res.next_endpoint.name,
          }
        : undefined,
    };
  }
  return { status: 'error', pill: aiErrorPill(), error: res.error };
};
