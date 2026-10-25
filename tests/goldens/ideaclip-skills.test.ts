import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SKILLS,
  getSkills,
  saveSkill,
  deleteSkill,
  reorderSkills,
  resetSkillsToDefault,
} from '../../services/geminiService';
import { localFileAdapter } from '../../services/localFileAdapter';
import {
  defaultRightSidebarPlugins,
  IdeaClipPlugin,
  ScratchpadPlugin,
} from '../../components/right-sidebar/plugins';

test('IdeaClip Plugin Registration Contract', async (t) => {
  await t.test('defaultRightSidebarPlugins contains IdeaClipPlugin as first plugin', () => {
    assert.ok(defaultRightSidebarPlugins.length >= 2);
    assert.strictEqual(defaultRightSidebarPlugins[0].id, 'idea');
    assert.strictEqual(defaultRightSidebarPlugins[0].title, 'IdeaClip');
    assert.ok(defaultRightSidebarPlugins[0].icon, 'IdeaClip must have an icon');
    assert.strictEqual(typeof defaultRightSidebarPlugins[0].render, 'function');
  });

  await t.test('IdeaClipPlugin metadata and contract are valid', () => {
    assert.strictEqual(IdeaClipPlugin.id, 'idea');
    assert.strictEqual(IdeaClipPlugin.title, 'IdeaClip');
    assert.ok(IdeaClipPlugin.tooltip?.includes('IdeaClip'));
  });
});

test('Skills Storage & Management CRUD (offline-first localFileAdapter)', async (t) => {
  let mockStorage: Record<string, string> = {};

  // Mock localFileAdapter in-memory storage for test isolation
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

  await t.test('DEFAULT_SKILLS contains exactly 2 minimal presets (핵심 요약, 문장 다듬기)', () => {
    assert.strictEqual(DEFAULT_SKILLS.length, 2);
    assert.strictEqual(DEFAULT_SKILLS[0].title, '핵심 요약');
    assert.strictEqual(DEFAULT_SKILLS[1].title, '문장 다듬기');
    assert.ok(DEFAULT_SKILLS[0].system_prompt.length > 10);
    assert.ok(DEFAULT_SKILLS[1].system_prompt.length > 10);
  });

  await t.test('getSkills initializes skills.json with DEFAULT_SKILLS when empty', async () => {
    const skills = await getSkills();
    assert.strictEqual(skills.length, 2);
    assert.strictEqual(skills[0].id, 'skill-summarize');
    assert.strictEqual(skills[1].id, 'skill-refine');
    assert.ok(mockStorage['skills.json'], 'skills.json must be written to disk');
  });

  await t.test('saveSkill adds a new custom skill and persists to storage', async () => {
    const newSkill = await saveSkill({
      title: '영문 번역',
      description: '한국어 텍스트를 자연스러운 비즈니스 영어로 번역합니다.',
      system_prompt: 'Translate the given text into fluent, professional business English in Markdown.',
    });

    assert.ok(newSkill.id.startsWith('skill-'));
    assert.strictEqual(newSkill.title, '영문 번역');
    assert.strictEqual(newSkill.sort_order, 3);

    const reloaded = await getSkills();
    assert.strictEqual(reloaded.length, 3);
    assert.strictEqual(reloaded[2].title, '영문 번역');
  });

  await t.test('saveSkill updates existing skill title and prompt', async () => {
    await saveSkill({
      id: 'skill-summarize',
      title: '초단축 요약',
      system_prompt: '한 줄로 요약하세요.',
    });

    const reloaded = await getSkills();
    const updated = reloaded.find((s) => s.id === 'skill-summarize');
    assert.ok(updated);
    assert.strictEqual(updated.title, '초단축 요약');
    assert.strictEqual(updated.system_prompt, '한 줄로 요약하세요.');
    assert.strictEqual(updated.description, '문서의 주요 핵심 내용과 결론을 글머리 기호로 명확히 정리합니다.');
  });

  await t.test('reorderSkills adjusts sort_order correctly', async () => {
    // Current: [skill-summarize, skill-refine]
    const success = await reorderSkills(['skill-refine', 'skill-summarize']);
    assert.strictEqual(success, true);

    const reloaded = await getSkills();
    assert.strictEqual(reloaded[0].id, 'skill-refine');
    assert.strictEqual(reloaded[1].id, 'skill-summarize');
  });

  await t.test('deleteSkill removes skill from storage', async () => {
    const deleted = await deleteSkill('skill-refine');
    assert.strictEqual(deleted, true);

    const remaining = await getSkills();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].id, 'skill-summarize');
  });

  await t.test('resetSkillsToDefault restores initial 2 presets', async () => {
    const reset = await resetSkillsToDefault();
    assert.strictEqual(reset.length, 2);
    assert.strictEqual(reset[0].id, 'skill-summarize');
    assert.strictEqual(reset[1].id, 'skill-refine');
  });
});
