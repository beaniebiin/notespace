/**
 * 법령, 판례, 헌재결정례 질의 분석 및 분류기 (Pure TypeScript)
 * 법제처 공식 약칭 사전 및 조·항·호·목 핀포인트 파싱 지원
 */

export type LegalSearchType = 'law' | 'prec' | 'detc';

export interface LegalSubTarget {
  hang?: number;
  ho?: number;
  mok?: string;
  label?: string;
}

export interface LegalJoRange {
  startMain: number;
  startSub: number;
  endMain: number;
  endSub: number;
  startVal: number;
  endVal: number;
  label: string;
}

export interface LegalClassification {
  type: LegalSearchType;
  typeName: string; // '법령' | '판례' | '헌재'
  targetQuery: string;
  rawQuery: string;
  lawName?: string;
  rawLawName?: string;
  abbreviation?: string;
  joInput?: string;
  joNumber?: number;
  joBranch?: number;
  joRange?: LegalJoRange;
  subTarget?: LegalSubTarget;
}

// 대한민국 주요 법률 공식 및 빈출 약칭 사전
const COMMON_LAW_ABBREVIATIONS: Record<string, string> = {
  // 기본 6법 및 헌법
  '헌법': '대한민국헌법',
  '민법': '민법',
  '상법': '상법',
  '형법': '형법',
  '민소법': '민사소송법',
  '민사소송법': '민사소송법',
  '형소법': '형사소송법',
  '형사소송법': '형사소송법',
  '행소법': '행정소송법',
  '행정소송법': '행정소송법',
  '행심법': '행정심판법',
  '행정심판법': '행정심판법',
  '행정기본법': '행정기본법',
  '가소법': '가사소송법',
  '가사소송법': '가사소송법',

  // 민사·상사 특별법
  '가담법': '가등기담보 등에 관한 법률',
  '가등기담보법': '가등기담보 등에 관한 법률',
  '주임법': '주택임대차보호법',
  '주택임대차법': '주택임대차보호법',
  '상임법': '상가건물 임대차보호법',
  '상가임대차법': '상가건물 임대차보호법',
  '부실법': '부동산 실권리자명의 등기에 관한 법률',
  '부동산실명법': '부동산 실권리자명의 등기에 관한 법률',
  '부동산등기법': '부동산등기법',
  '부등법': '부동산등기법',
  '집합건물법': '집합건물의 소유 및 관리에 관한 법률',
  '채무자회생법': '채무자 회생 및 파산에 관한 법률',
  '통합도산법': '채무자 회생 및 파산에 관한 법률',
  '파산법': '채무자 회생 및 파산에 관한 법률',
  '자본시장법': '자본시장과 금융투자업에 관한 법률',
  '자본시장육성법': '자본시장과 금융투자업에 관한 법률',
  '어음법': '어음법',
  '수표법': '수표법',
  '공탁법': '공탁법',
  '민사집행법': '민사집행법',
  '민집법': '민사집행법',
  '소송촉진법': '소송촉진 등에 관한 특례법',
  '소특법': '소송촉진 등에 관한 특례법',

  // 형사 특별법
  '특가법': '특정범죄 가중처벌 등에 관한 법률',
  '특정범죄가중법': '특정범죄 가중처벌 등에 관한 법률',
  '특경법': '특정경제범죄 가중처벌 등에 관한 법률',
  '특정경제범죄법': '특정경제범죄 가중처벌 등에 관한 법률',
  '폭처법': '폭력행위 등 처벌에 관한 법률',
  '폭력행위처벌법': '폭력행위 등 처벌에 관한 법률',
  '교특법': '교통사고처리 특례법',
  '교통사고처리특례법': '교통사고처리 특례법',
  '성폭력처벌법': '성폭력범죄의 처벌 등에 관한 특례법',
  '성폭력특례법': '성폭력범죄의 처벌 등에 관한 특례법',
  '아청법': '아동ㆍ청소년의 성보호에 관한 법률',
  '아동청소년성보호법': '아동ㆍ청소년의 성보호에 관한 법률',
  '도교법': '도로교통법',
  '도로교통법': '도로교통법',
  '형집행법': '형의 집행 및 수용자의 처우에 관한 법률',
  '보호관찰법': '보호관찰 등에 관한 법률',
  '국가보안법': '국가보안법',
  '국보법': '국가보안법',
  '마약류관리법': '마약류 관리에 관한 법률',

  // 공법 및 행정법
  '정통망법': '정보통신망 이용촉진 및 정보보호 등에 관한 법률',
  '정보통신망법': '정보통신망 이용촉진 및 정보보호 등에 관한 법률',
  '개보법': '개인정보 보호법',
  '개인정보보호법': '개인정보 보호법',
  '국배법': '국가배상법',
  '국가배상법': '국가배상법',
  '공정거래법': '독점규제 및 공정거래에 관한 법률',
  '독점규제법': '독점규제 및 공정거래에 관한 법률',
  '행정절차법': '행정절차법',
  '정보공개법': '공공기관의 정보공개에 관한 법률',
  '질서위반행위규제법': '질서위반행위규제법',
  '행정조사기본법': '행정조사기본법',
  '국가공무원법': '국가공무원법',
  '지방공무원법': '지방공무원법',
  '경찰관직무집행법': '경찰관 직무집행법',
  '경직법': '경찰관 직무집행법',
  '공익사업을위한토지등의취득및보상에관한법률': '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률',
  '토지보상법': '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률',
  '국토계획법': '국토의 계획 및 이용에 관한 법률',
  '도시정비법': '도시 및 주거환경정비법',
  '건축법': '건축법',
  '지방자치법': '지방자치법',
  '지자법': '지방자치법',

  // 조세 및 노동
  '국세기본법': '국세기본법',
  '국기법': '국세기본법',
  '국세징수법': '국세징수법',
  '소득세법': '소득세법',
  '법인세법': '법인세법',
  '상증세법': '상속세 및 증여세법',
  '부가가치세법': '부가가치세법',
  '근기법': '근로기준법',
  '근로기준법': '근로기준법',
  '노조법': '노동조합 및 노동관계조정법',
  '노동조합법': '노동조합 및 노동관계조정법',
  '남녀고용평등법': '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률',
  '산재보험법': '산업재해보상보험법',
  '고용보험법': '고용보험법',

  // 헌법재판 및 사법조직
  '헌재법': '헌법재판소법',
  '헌법재판소법': '헌법재판소법',
  '법원조직법': '법원조직법',
  '검찰청법': '검찰청법',
  '변호사법': '변호사법',
};

// 원문자 매핑 테이블 (① -> 1, ⑳ -> 20)
const CIRCLE_TO_NUMBER: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
  '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
};

/**
 * 법령 약칭 정규화 함수 (공백 및 특수기호 제거 후 매칭)
 */
export function resolveLawName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return '';

  if (COMMON_LAW_ABBREVIATIONS[trimmed]) {
    return COMMON_LAW_ABBREVIATIONS[trimmed];
  }

  const normalized = trimmed.replace(/[\sㆍ·._\-]/g, '');
  for (const [abbr, full] of Object.entries(COMMON_LAW_ABBREVIATIONS)) {
    if (abbr.replace(/[\sㆍ·._\-]/g, '') === normalized) {
      return full;
    }
  }

  return trimmed;
}

/**
 * 조문 입력값을 국가법령정보 API 표준 6자리 규격(조번호 4자리 + 가지번호 2자리)으로 변환
 * 예: "3조" -> "000300", "390" -> "039000", "10조의2" -> "001002"
 */
export function formatJoParam(joInput?: string | null): string {
  if (!joInput) return '';
  const str = joInput.trim();
  if (!str) return '';

  if (/^\d{6}$/.test(str)) {
    return str;
  }

  const match = str.match(/(?:제\s*)?(\d+)(?:\s*조)?(?:\s*(?:의|-|_)\s*(\d+))?/);
  if (match) {
    const main = parseInt(match[1], 10) || 0;
    const sub = match[2] ? parseInt(match[2], 10) : 0;
    const mainPad = main.toString().padStart(4, '0');
    const subPad = sub.toString().padStart(2, '0');
    return `${mainPad}${subPad}`;
  }

  return '';
}

/**
 * 조문 본문 시작 부분에 중복 출력되는 "제N조(제목)" 접두어 제거
 */
export function stripArticleHeader(content?: string | null): string {
  if (!content) return '';
  return content.replace(/^제\s*\d+\s*조(?:\s*(?:의|-|_)\s*\d+)?(?:\s*\([^)]*\))?\s*/, '').trim();
}

/**
 * 질의 텍스트를 법령 / 판례 / 헌재로 정밀 분류
 */
export function classifyLegalQuery(query: string): LegalClassification {
  const rawQuery = (query || '').trim();
  const compactQuery = rawQuery.replace(/\s+/g, '');

  // 1. 사건번호 규칙: 숫자(2~4자리) + 한글 + 숫자(1~7자리)
  // 예: "2020도5233", "2018다21345", "2021헌바123", "99헌마12"
  const casePattern = /^(\d{2,4})([가-힣]+)(\d{1,7})$/;
  const caseMatch = compactQuery.match(casePattern);

  if (caseMatch) {
    const koreanPart = caseMatch[2];

    // 한글 부분이 '헌'으로 시작하는 경우 -> 헌재결정례
    if (koreanPart.startsWith('헌')) {
      return {
        type: 'detc',
        typeName: '헌재',
        targetQuery: compactQuery,
        rawQuery,
      };
    }

    // 그 외 사건번호 -> 판례
    return {
      type: 'prec',
      typeName: '판례',
      targetQuery: compactQuery,
      rawQuery,
    };
  }

  // 2. 조문 범위(Range) 패턴 우선 파싱 (예: "민법 제3조~제9조", "민법 33~37", "상법 제530조의2 ~ 530조의5")
  const rangePattern = /^(.*?)(?:\s+|(?<=[가-힣]))(?:제\s*)?(\d+)(?:\s*조)?(?:\s*(?:의|-|_)\s*(\d+))?\s*(?:[~∼～〜]|\s+-\s+)\s*(?:제\s*)?(\d+)(?:\s*조)?(?:\s*(?:의|-|_)\s*(\d+))?$/;
  const rm = rawQuery.match(rangePattern);
  if (rm) {
    const rawLawName = rm[1].trim();
    let sMain = parseInt(rm[2], 10);
    let sSub = rm[3] ? parseInt(rm[3], 10) : 0;
    let eMain = parseInt(rm[4], 10);
    let eSub = rm[5] ? parseInt(rm[5], 10) : 0;

    let sVal = sMain * 10000 + sSub;
    let eVal = eMain * 10000 + eSub;
    if (sVal > eVal) {
      const tm = sMain; const ts = sSub; const tv = sVal;
      sMain = eMain; sSub = eSub; sVal = eVal;
      eMain = tm; eSub = ts; eVal = tv;
    }

    const startLabel = sSub > 0 ? `제${sMain}조의${sSub}` : `제${sMain}조`;
    const endLabel = eSub > 0 ? `제${eMain}조의${eSub}` : `제${eMain}조`;
    const rangeLabel = `${startLabel} ~ ${endLabel}`;

    const resolved = resolveLawName(rawLawName);
    const label = `${resolved} ${rangeLabel}`;

    return {
      type: 'law',
      typeName: '법령',
      targetQuery: label,
      rawQuery,
      lawName: resolved,
      rawLawName,
      abbreviation: resolved !== rawLawName ? rawLawName : undefined,
      joRange: {
        startMain: sMain,
        startSub: sSub,
        endMain: eMain,
        endSub: eSub,
        startVal: sVal,
        endVal: eVal,
        label: rangeLabel,
      },
    };
  }

  // 3. 단일 조문 및 항/호/목 파싱
  // 패턴 1: 공백 분리 ("민법 제390조", "민법 390", "가담법 3조 1항")
  // 패턴 2: 공백 없이 '제'가 붙은 경우 ("민법제390조", "가담법제3조")
  // 패턴 3: 공백 없이 숫자+'조' ("민법390조", "민소법216조")
  let lawMatch: RegExpMatchArray | null = null;
  const p1 = /^(.*?)\s+(?:제\s*)?(\d+)(?:\s*조)?(?:\s*(?:의|-|_)\s*(\d+))?(.*)$/;
  const p2 = /^(.*?)(?:제\s*)(\d+)(?:\s*조)?(?:\s*(?:의|-|_)\s*(\d+))?(.*)$/;
  const p3 = /^(.*?)(\d+)\s*조(?:\s*(?:의|-|_)\s*(\d+))?(.*)$/;

  if (p1.test(rawQuery)) {
    lawMatch = rawQuery.match(p1);
  } else if (p2.test(rawQuery)) {
    const m = rawQuery.match(p2);
    if (m && m[1].trim()) lawMatch = m;
  } else if (p3.test(rawQuery)) {
    const m = rawQuery.match(p3);
    if (m && m[1].trim()) lawMatch = m;
  }

  if (lawMatch) {
    const rawLawName = lawMatch[1].trim();
    const mainJo = parseInt(lawMatch[2], 10);
    const subJo = lawMatch[3] ? parseInt(lawMatch[3], 10) : undefined;
    const joInput = subJo ? `제${mainJo}조의${subJo}` : `제${mainJo}조`;
    const rest = (lawMatch[4] || '').trim();

    let hang: number | undefined;
    let ho: number | undefined;
    let mok: string | undefined;

    // 항 파싱 (제N항 또는 원문자 ①~⑳)
    const hangMatch = rest.match(/(?:제\s*)?(\d+)\s*항/);
    if (hangMatch) {
      hang = parseInt(hangMatch[1], 10);
    } else {
      const circleMatch = rest.match(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/);
      if (circleMatch && CIRCLE_TO_NUMBER[circleMatch[1]]) {
        hang = CIRCLE_TO_NUMBER[circleMatch[1]];
      }
    }

    // 호 파싱 (제N호)
    const hoMatch = rest.match(/(?:제\s*)?(\d+)\s*호/);
    if (hoMatch) {
      ho = parseInt(hoMatch[1], 10);
    }

    // 목 파싱 ([가-하]목)
    const mokMatch = rest.match(/(?:제\s*)?([가-하])\s*목/);
    if (mokMatch) {
      mok = mokMatch[1];
    }

    let subTarget: LegalSubTarget | undefined;
    if (hang !== undefined || ho !== undefined || mok !== undefined) {
      let label = '';
      if (hang !== undefined) label += `제${hang}항`;
      if (ho !== undefined) label += ` 제${ho}호`;
      if (mok !== undefined) label += ` ${mok}목`;
      subTarget = { hang, ho, mok, label: label.trim() };
    }

    const resolved = resolveLawName(rawLawName);
    const label = `${resolved} ${joInput}${subTarget?.label ? ' ' + subTarget.label : ''}`;

    return {
      type: 'law',
      typeName: '조문',
      targetQuery: label,
      rawQuery,
      lawName: resolved,
      rawLawName,
      abbreviation: resolved !== rawLawName ? rawLawName : undefined,
      joInput,
      joNumber: mainJo,
      joBranch: subJo,
      subTarget,
    };
  }

  // 기본 법령 처리 (법령명 단독 검색)
  const resolved = resolveLawName(rawQuery);
  return {
    type: 'law',
    typeName: '법령',
    targetQuery: resolved,
    rawQuery,
    lawName: resolved,
    rawLawName: rawQuery,
    abbreviation: resolved !== rawQuery ? rawQuery : undefined,
  };
}
