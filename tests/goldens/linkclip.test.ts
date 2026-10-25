import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLegalQuery,
  formatJoParam,
  resolveLawName,
  stripArticleHeader,
} from '../../services/legalClassifier';
import {
  linkspaceService,
  LegalPrecedentDetail,
  LegalDecisionDetail,
  LegalLawDetail,
} from '../../services/linkspaceService';
import { localFileAdapter } from '../../services/localFileAdapter';
import {
  defaultRightSidebarPlugins,
  LinkClipPlugin,
} from '../../components/right-sidebar/plugins';

test('LinkClip: Legal Query Classifier & Abbreviation Dictionary', async (t) => {
  await t.test('Classifies court precedent case numbers correctly', () => {
    const c1 = classifyLegalQuery('2020도5233');
    assert.strictEqual(c1.type, 'prec');
    assert.strictEqual(c1.typeName, '판례');
    assert.strictEqual(c1.targetQuery, '2020도5233');

    const c2 = classifyLegalQuery('2018다 21345');
    assert.strictEqual(c2.type, 'prec');
    assert.strictEqual(c2.targetQuery, '2018다21345');

    const c3 = classifyLegalQuery('99도1234');
    assert.strictEqual(c3.type, 'prec');
  });

  await t.test('Classifies constitutional court decision case numbers correctly', () => {
    const d1 = classifyLegalQuery('2021헌바123');
    assert.strictEqual(d1.type, 'detc');
    assert.strictEqual(d1.typeName, '헌재');
    assert.strictEqual(d1.targetQuery, '2021헌바123');

    const d2 = classifyLegalQuery('99헌마 456');
    assert.strictEqual(d2.type, 'detc');
    assert.strictEqual(d2.targetQuery, '99헌마456');
  });

  await t.test('Classifies and parses law articles with jo, hang, ho, and mok', () => {
    const l1 = classifyLegalQuery('민법 제390조');
    assert.strictEqual(l1.type, 'law');
    assert.strictEqual(l1.lawName, '민법');
    assert.strictEqual(l1.joInput, '제390조');
    assert.strictEqual(l1.joNumber, 390);

    const l2 = classifyLegalQuery('건축법 제3조 제1항 제2호 다목');
    assert.strictEqual(l2.type, 'law');
    assert.strictEqual(l2.lawName, '건축법');
    assert.strictEqual(l2.joInput, '제3조');
    assert.strictEqual(l2.subTarget?.hang, 1);
    assert.strictEqual(l2.subTarget?.ho, 2);
    assert.strictEqual(l2.subTarget?.mok, '다');
  });

  await t.test('Classifies article range queries correctly (including 제N조의M)', () => {
    const r1 = classifyLegalQuery('민법 제3조~제9조');
    assert.strictEqual(r1.type, 'law');
    assert.strictEqual(r1.lawName, '민법');
    assert.ok(r1.joRange);
    assert.strictEqual(r1.joRange?.startMain, 3);
    assert.strictEqual(r1.joRange?.startSub, 0);
    assert.strictEqual(r1.joRange?.endMain, 9);
    assert.strictEqual(r1.joRange?.endSub, 0);
    assert.strictEqual(r1.joRange?.startVal, 30000);
    assert.strictEqual(r1.joRange?.endVal, 90000);
    assert.strictEqual(r1.joRange?.label, '제3조 ~ 제9조');

    const r2 = classifyLegalQuery('상법 제530조의2 ~ 530조의5');
    assert.strictEqual(r2.type, 'law');
    assert.strictEqual(r2.lawName, '상법');
    assert.ok(r2.joRange);
    assert.strictEqual(r2.joRange?.startMain, 530);
    assert.strictEqual(r2.joRange?.startSub, 2);
    assert.strictEqual(r2.joRange?.endMain, 530);
    assert.strictEqual(r2.joRange?.endSub, 5);
    assert.strictEqual(r2.joRange?.startVal, 5300002);
    assert.strictEqual(r2.joRange?.endVal, 5300005);
    assert.strictEqual(r2.joRange?.label, '제530조의2 ~ 제530조의5');

    const r3 = classifyLegalQuery('민법 33~37');
    assert.strictEqual(r3.type, 'law');
    assert.strictEqual(r3.lawName, '민법');
    assert.ok(r3.joRange);
    assert.strictEqual(r3.joRange?.startMain, 33);
    assert.strictEqual(r3.joRange?.endMain, 37);
  });

  await t.test('Strips article header prefix to prevent duplication', () => {
    const raw1 = '제339조(유질계약의 금지) 질권설정자는 채무변제기의 계약으로';
    assert.strictEqual(stripArticleHeader(raw1), '질권설정자는 채무변제기의 계약으로');

    const raw2 = '제339조 (유질계약의 금지) 질권설정자는 채무변제기의 계약으로';
    assert.strictEqual(stripArticleHeader(raw2), '질권설정자는 채무변제기의 계약으로');

    const raw3 = '제530조의2(회사의 분할ㆍ분할합병) ① 회사는 분할할 수 있다.';
    assert.strictEqual(stripArticleHeader(raw3), '① 회사는 분할할 수 있다.');

    const raw4 = '질권설정자는 채무변제기의 계약으로';
    assert.strictEqual(stripArticleHeader(raw4), '질권설정자는 채무변제기의 계약으로');
  });

  await t.test('Resolves official law abbreviations automatically', () => {
    assert.strictEqual(resolveLawName('민소법'), '민사소송법');
    assert.strictEqual(resolveLawName('형소법'), '형사소송법');
    assert.strictEqual(resolveLawName('가담법'), '가등기담보 등에 관한 법률');
    assert.strictEqual(resolveLawName('특가법'), '특정범죄 가중처벌 등에 관한 법률');
    assert.strictEqual(resolveLawName('특경법'), '특정경제범죄 가중처벌 등에 관한 법률');
    assert.strictEqual(resolveLawName('정통망법'), '정보통신망 이용촉진 및 정보보호 등에 관한 법률');
    assert.strictEqual(resolveLawName('개인정보보호법'), '개인정보 보호법');
    assert.strictEqual(resolveLawName('근기법'), '근로기준법');
    assert.strictEqual(resolveLawName('도교법'), '도로교통법');

    // Query classification integration
    const q1 = classifyLegalQuery('민소법 216조');
    assert.strictEqual(q1.lawName, '민사소송법');
    assert.strictEqual(q1.abbreviation, '민소법');
    assert.strictEqual(q1.joInput, '제216조');

    const q2 = classifyLegalQuery('가담법 제3조');
    assert.strictEqual(q2.lawName, '가등기담보 등에 관한 법률');
    assert.strictEqual(q2.abbreviation, '가담법');

    const q3 = classifyLegalQuery('특가법 5조의4');
    assert.strictEqual(q3.lawName, '특정범죄 가중처벌 등에 관한 법률');
    assert.strictEqual(q3.joInput, '제5조의4');
    assert.strictEqual(q3.joNumber, 5);
    assert.strictEqual(q3.joBranch, 4);
  });

  await t.test('Formats jo parameter to 6-digit DRF standard', () => {
    assert.strictEqual(formatJoParam('3'), '000300');
    assert.strictEqual(formatJoParam('390'), '039000');
    assert.strictEqual(formatJoParam('제390조'), '039000');
    assert.strictEqual(formatJoParam('제10조의2'), '001002');
    assert.strictEqual(formatJoParam('10-2'), '001002');
    assert.strictEqual(formatJoParam('000500'), '000500');
  });
});

test('LinkClip: Service & Markdown Formatters (일반 텍스트 형식)', async (t) => {
  let mockStorage: Record<string, string> = {};
  const originalRead = localFileAdapter.readTextFile;
  const originalWrite = localFileAdapter.writeTextFile;

  t.beforeEach(() => {
    mockStorage = {};
    localFileAdapter.readTextFile = async (path: string) => mockStorage[path] ?? null;
    localFileAdapter.writeTextFile = async (path: string, content: string) => {
      mockStorage[path] = content;
      return true;
    };
  });

  t.after(() => {
    localFileAdapter.readTextFile = originalRead;
    localFileAdapter.writeTextFile = originalWrite;
  });

  await t.test('Manages OC Key configuration persistence', async () => {
    assert.strictEqual(await linkspaceService.isOcConfigured(), false);

    await linkspaceService.saveOcKey('TEST_OC_KEY_123');
    assert.strictEqual(await linkspaceService.getOcKey(), 'TEST_OC_KEY_123');
    assert.strictEqual(await linkspaceService.isOcConfigured(), true);

    await linkspaceService.saveOcKey('');
    assert.strictEqual(await linkspaceService.isOcConfigured(), false);
  });

  await t.test('Formats precedent markdown in plain text format', () => {
    const mockPrec: LegalPrecedentDetail = {
      serial: '12345',
      caseNumber: '2020도5233',
      caseName: '사기 등',
      date: '2021. 3. 11.',
      court: '대법원',
      decisionType: '판결',
      issues: '[1] 사기죄의 성립 요건\n[2] 불법영득의사의 판단 기준',
      summary: '[1] 사기죄는 타인을 기망하여 착오에 빠뜨리고 처분행위를 유발하여 재물을 교부받음으로써 성립한다.',
      refArticles: '형법 제347조 제1항',
    };

    const md = linkspaceService.formatPrecedentMarkdown(mockPrec);
    assert.ok(md.includes('### 대법원 2021. 3. 11. 선고 2020도5233 판결 【사기 등】'));
    assert.ok(md.includes('【판시사항】'));
    assert.ok(md.includes('【판결요지】'));
    assert.ok(md.includes('【참조조문】'));
    assert.ok(!md.includes('> '), 'Should not be blockquote format per user choice');
  });

  await t.test('Formats constitutional decision markdown in plain text format', () => {
    const mockDetc: LegalDecisionDetail = {
      serial: '67890',
      caseNumber: '2021헌바123',
      caseName: '위헌소원',
      date: '2022. 6. 30.',
      summary: '심판대상조항은 과잉금지원칙에 반하지 않는다.',
      targetArticles: '구 도로교통법 제148조의2 제1항',
    };

    const md = linkspaceService.formatDecisionMarkdown(mockDetc);
    assert.ok(md.includes('### 헌법재판소 2022. 6. 30. 2021헌바123 결정 【위헌소원】'));
    assert.ok(md.includes('【결정요지】'));
    assert.ok(md.includes('【심판대상조문】'));
  });

  await t.test('Formats law markdown in plain text format and strips redundant body header', () => {
    const mockLaw: LegalLawDetail = {
      lawId: '001',
      lawName: '민법',
      articles: [
        {
          joNumber: '제339조',
          joTitle: '유질계약의 금지',
          content: '제339조(유질계약의 금지) 질권설정자는 채무변제기의 계약으로 질권자에게 변제에 갈음하여 질물의 소유권을 취득하게 하거나...',
        },
      ],
      targetArticle: {
        joNumber: '제339조',
        joTitle: '유질계약의 금지',
        content: '제339조(유질계약의 금지) 질권설정자는 채무변제기의 계약으로 질권자에게 변제에 갈음하여 질물의 소유권을 취득하게 하거나...',
      },
    };

    const md = linkspaceService.formatLawMarkdown(mockLaw);
    assert.ok(md.includes('### 민법 제339조 (유질계약의 금지)'));
    assert.ok(md.includes('질권설정자는 채무변제기의 계약으로'));
    // Ensure body doesn't duplicate "제339조(유질계약의 금지)"
    const lines = md.split('\n').filter((l) => l.trim().length > 0);
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0], '### 민법 제339조 (유질계약의 금지)');
    assert.ok(lines[1].startsWith('질권설정자는 채무변제기'));
  });

  await t.test('Formats law range markdown with multiple articles in plain text format', () => {
    const mockRangeLaw: LegalLawDetail = {
      lawId: '001',
      lawName: '민법',
      rangeLabel: '제3조 ~ 제5조',
      articles: [
        {
          joNumber: '제3조',
          joTitle: '권리능력의 존속기간',
          content: '제3조(권리능력의 존속기간) 사람은 생존한 동안 권리와 의무의 주체가 된다.',
        },
        {
          joNumber: '제4조',
          joTitle: '성년',
          content: '제4조(성년) 사람은 19세로 성년에 이르게 된다.',
        },
        {
          joNumber: '제5조',
          joTitle: '미성년자의 능력',
          content: '제5조(미성년자의 능력) 미성년자가 법률행위를 함에는 법정대리인의 동의를 얻어야 한다.',
          hangItems: [
            { hangNumber: '제1항', hangContent: '미성년자가 법률행위를 함에는...' },
            { hangNumber: '제2항', hangContent: '전항의 규정에 위반한 행위는 취소할 수 있다.' },
          ],
        },
      ],
    };

    const md = linkspaceService.formatLawMarkdown(mockRangeLaw);
    assert.ok(md.includes('### 민법 제3조 ~ 제5조'));
    assert.ok(md.includes('**제3조 (권리능력의 존속기간)**'));
    assert.ok(md.includes('사람은 생존한 동안 권리와 의무의 주체가 된다.'));
    assert.ok(md.includes('**제4조 (성년)**'));
    assert.ok(md.includes('**제5조 (미성년자의 능력)**'));
    assert.ok(md.includes('제1항 미성년자가 법률행위를 함에는...'));
    assert.ok(md.includes('제2항 전항의 규정에 위반한 행위는 취소할 수 있다.'));
  });

  await t.test('Formats entire law markdown showing all articles when no jo specified', () => {
    const mockFullLaw: LegalLawDetail = {
      lawId: '001',
      lawName: '대한민국헌법',
      articles: [
        {
          joNumber: '제1조',
          joTitle: '',
          content: '제1조 ①대한민국은 민주공화국이다.',
        },
        {
          joNumber: '제2조',
          joTitle: '',
          content: '제2조 ①대한민국의 국민이 되는 요건은 법률로 정한다.',
        },
      ],
    };

    const md = linkspaceService.formatLawMarkdown(mockFullLaw);
    assert.ok(md.includes('### 대한민국헌법'));
    assert.ok(md.includes('**제1조**'));
    assert.ok(md.includes('①대한민국은 민주공화국이다.'));
    assert.ok(md.includes('**제2조**'));
    assert.ok(md.includes('①대한민국의 국민이 되는 요건은 법률로 정한다.'));
  });
});

test('LinkClip: Plugin Registry Contract', async (t) => {
  await t.test('LinkClipPlugin has valid metadata and render function', () => {
    assert.strictEqual(LinkClipPlugin.id, 'link');
    assert.strictEqual(LinkClipPlugin.title, 'LinkClip');
    assert.ok(LinkClipPlugin.icon, 'Must have icon');
    assert.ok(LinkClipPlugin.tooltip?.includes('LinkClip'));
    assert.strictEqual(typeof LinkClipPlugin.render, 'function');
  });

  await t.test('defaultRightSidebarPlugins contains LinkClipPlugin', () => {
    assert.ok(defaultRightSidebarPlugins.length >= 3);
    const linkPlugin = defaultRightSidebarPlugins.find((p) => p.id === 'link');
    assert.ok(linkPlugin, 'LinkClipPlugin must be registered');
    assert.strictEqual(linkPlugin?.title, 'LinkClip');
  });
});
