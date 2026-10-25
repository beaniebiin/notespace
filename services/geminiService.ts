import { GoogleGenAI } from "@google/genai";
import { localFileAdapter } from "./localFileAdapter";

export interface Attachment {
  mimeType: string;
  data: string; // base64
  name?: string;
}

export interface AiEndpoint {
  id: string | number;
  name: string;
  url: string;
  api_key?: string;
  api_key_masked?: string;
  has_key?: boolean;
  models: string[];
}

export interface AiGenerateResult {
  status: 'success' | 'endpoint_failed';
  content?: string;
  endpoint_id?: string | number;
  endpoint_name?: string;
  model_used?: string;
  failed_endpoint_id?: string | number;
  failed_endpoint_name?: string;
  error?: string;
  next_endpoint?: {
    id: string | number;
    name: string;
  } | null;
}

export interface AiEndpointsConfig {
  answer_endpoints: AiEndpoint[];
}

const DEFAULT_AI_CONFIG: AiEndpointsConfig = {
  answer_endpoints: [
    {
      id: 1,
      name: "Gemini API (OpenAI 호환)",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      api_key: "",
      models: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    },
    {
      id: 2,
      name: "OpenAI 호환 게이트웨이",
      url: "https://api.openai.com/v1/chat/completions",
      api_key: "",
      models: ["gpt-4o-mini", "gpt-4o"]
    }
  ]
};

export const getAiEndpoints = async (): Promise<AiEndpointsConfig> => {
  try {
    const raw = await localFileAdapter.readTextFile('ai_config.json');
    if (!raw) {
      return DEFAULT_AI_CONFIG;
    }
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return { answer_endpoints: data };
    }
    return {
      answer_endpoints: data.answer_endpoints || DEFAULT_AI_CONFIG.answer_endpoints
    };
  } catch (e) {
    console.error("Failed to load AI endpoints from local storage", e);
    return DEFAULT_AI_CONFIG;
  }
};

export const saveAiEndpoints = async (config: AiEndpointsConfig | AiEndpoint[]): Promise<boolean> => {
  try {
    const payload: AiEndpointsConfig = Array.isArray(config)
      ? { answer_endpoints: config }
      : config;
    return await localFileAdapter.writeTextFile('ai_config.json', JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error("Failed to save AI endpoints to local storage", e);
    return false;
  }
};

/**
 * Generate suggestions for follow-up notes or questions
 */
export const generateSuggestions = async (currentContent: string): Promise<string[]> => {
  const fallback = ["요약해 주세요", "문법을 교정해 주세요", "관련된 내용을 더 써주세요"];

  try {
    const config = await getAiEndpoints();
    const endpoint = config.answer_endpoints.find(e => e.api_key && e.api_key.trim().length > 0);
    if (!endpoint || !endpoint.api_key) {
      return fallback;
    }

    // Direct Google GenAI call if apiKey is present
    const ai = new GoogleGenAI({ apiKey: endpoint.api_key });
    const prompt = `
      Based on the following note content, suggest 3 relevant follow-up questions or actions that the user might want to ask an AI assistant.
      The suggestions must be in Korean.
      Provide the output as a raw JSON array of strings. Do not include markdown formatting like \`\`\`json.
      
      Example output: ["요약해줘", "번역해줘", "더 자세히 설명해줘"]

      Current Content:
      ---
      ${currentContent.substring(0, 50000)}
      ---
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text || "[]";
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.warn("Direct suggestion generation failed, using fallback:", error);
    return fallback;
  }
};

/**
 * Client-Side Direct Multimodal Note Generation with Hierarchical Failover
 */
export const generateNoteContentViaProxy = async (
  prompt: string,
  currentContent: string = "",
  attachments: Attachment[] = [],
  endpointId?: string | number,
  selectedModel?: string,
  customSystemInstruction?: string
): Promise<AiGenerateResult> => {
  const config = await getAiEndpoints();
  const endpoints = config.answer_endpoints || [];

  if (endpoints.length === 0) {
    return {
      status: 'endpoint_failed',
      error: '설정된 AI 엔드포인트가 없습니다. 설정에서 API 키와 엔드포인트를 추가해주세요.'
    };
  }

  // 1. Determine target endpoint index
  let targetIndex = 0;
  if (endpointId) {
    const idx = endpoints.findIndex(e => String(e.id) === String(endpointId));
    if (idx !== -1) targetIndex = idx;
  }

  // 2. Prepare user content parts (multimodal)
  let fullPromptText = prompt;
  if (currentContent && currentContent.trim()) {
    fullPromptText = `The user request: "${prompt}".\n\nCurrent note content:\n---\n${currentContent}\n---`;
  }

  const userContentParts: any[] = [
    { type: 'text', text: fullPromptText }
  ];

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (!att.data) continue;
      let dataUri = att.data;
      if (!dataUri.startsWith('data:')) {
        const mime = att.mimeType || 'image/jpeg';
        dataUri = `data:${mime};base64,${att.data}`;
      }
      userContentParts.push({
        type: 'image_url',
        image_url: { url: dataUri }
      });
    }
  }

  const defaultSystemInstruction =
    "You are an AI assistant in a Markdown note-taking app.\n" +
    "Provide the response in clean Markdown format.\n" +
    "If the user asks to summarize, provide a summary.\n" +
    "If they ask to continue writing, append to the content.\n" +
    "If images or files are provided, use them as context.\n" +
    "Do not wrap the whole response in markdown code blocks unless specifically asked for code.\n" +
    "Return the raw markdown content directly.";

  const systemInstruction = customSystemInstruction?.trim()
    ? `${customSystemInstruction.trim()}\n\n---\n${defaultSystemInstruction}`
    : defaultSystemInstruction;

  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userContentParts.length === 1 ? fullPromptText : userContentParts }
  ];

  let lastError = '';

  // 3. Try target endpoint first, then sequential failover
  for (let epIdx = targetIndex; epIdx < endpoints.length; epIdx++) {
    const ep = endpoints[epIdx];
    const apiKey = (ep.api_key || '').trim();
    const url = (ep.url || '').trim();

    if (!url) {
      lastError = `엔드포인트 '${ep.name}'의 URL이 비어있습니다.`;
      continue;
    }

    const models = (ep.models && ep.models.length > 0) ? ep.models : ['gemini-2.0-flash'];
    let modelsToTry = models;
    if (epIdx === targetIndex && selectedModel && models.includes(selectedModel)) {
      modelsToTry = [selectedModel, ...models.filter(m => m !== selectedModel)];
    }

    for (const model of modelsToTry) {
      try {
        const bodyPayload = {
          model,
          messages,
          temperature: 0.7
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyPayload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const resData = await res.json();
          const content = 
            resData.choices?.[0]?.message?.content ||
            resData.choices?.[0]?.delta?.content ||
            resData.candidates?.[0]?.content?.parts?.[0]?.text ||
            '';

          if (content) {
            return {
              status: 'success',
              content,
              endpoint_id: ep.id,
              endpoint_name: ep.name,
              model_used: model
            };
          }
        } else {
          const errText = await res.text();
          lastError = `[${ep.name} / ${model}] HTTP ${res.status}: ${errText}`;
        }
      } catch (err: any) {
        lastError = `[${ep.name} / ${model}] 오류: ${err.message || '요청 실패'}`;
      }
    }

    // If target endpoint failed, check next endpoint for failover confirmation modal
    if (epIdx === targetIndex && targetIndex + 1 < endpoints.length) {
      const nextEp = endpoints[targetIndex + 1];
      return {
        status: 'endpoint_failed',
        error: lastError,
        failed_endpoint_id: ep.id,
        failed_endpoint_name: ep.name,
        next_endpoint: {
          id: nextEp.id,
          name: nextEp.name
        }
      };
    }
  }

  return {
    status: 'endpoint_failed',
    error: lastError || '모든 AI 엔드포인트 요청에 실패했습니다.'
  };
};

export interface SkillItem {
  id: string;
  title: string;
  description: string;
  system_prompt: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export const DEFAULT_SKILLS: SkillItem[] = [
  {
    id: 'skill-summarize',
    title: '핵심 요약',
    description: '문서의 주요 핵심 내용과 결론을 글머리 기호로 명확히 정리합니다.',
    system_prompt: '다음 제공된 텍스트를 분석하여 핵심 주제, 주요 논점, 결론으로 나누어 간결하고 명확한 Markdown 글머리 기호 목록으로 요약하세요.',
    sort_order: 1,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: 'skill-refine',
    title: '문장 다듬기',
    description: '어색한 문장과 오탈자를 교정하고 매끄럽고 전문적인 톤으로 윤문합니다.',
    system_prompt: '다음 텍스트의 어색한 문맥, 비문, 오탈자를 교정하고, 의미는 그대로 유지하면서 더욱 명료하고 전문적인 톤이 되도록 Markdown 형식으로 다듬어주세요.',
    sort_order: 2,
    created_at: 1700000001000,
    updated_at: 1700000001000,
  },
];

const cloneDefaultSkills = (): SkillItem[] => JSON.parse(JSON.stringify(DEFAULT_SKILLS));

export const getSkills = async (): Promise<SkillItem[]> => {
  try {
    const raw = await localFileAdapter.readTextFile('skills.json');
    if (!raw) {
      // 최초 실행 시 기본 프리셋 자동 로드 및 저장
      const initial = cloneDefaultSkills();
      await localFileAdapter.writeTextFile('skills.json', JSON.stringify(initial, null, 2));
      return initial;
    }
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return cloneDefaultSkills();
      }
      return data.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return cloneDefaultSkills();
  } catch (e) {
    console.error('Failed to load skills from local storage', e);
    return cloneDefaultSkills();
  }
};

export const saveSkill = async (
  skill: Partial<SkillItem> & { title: string; system_prompt: string }
): Promise<SkillItem> => {
  const skills = await getSkills();
  const now = Date.now();
  let updatedSkill: SkillItem;

  if (skill.id) {
    const idx = skills.findIndex((s) => s.id === skill.id);
    if (idx !== -1) {
      updatedSkill = {
        ...skills[idx],
        ...skill,
        title: skill.title.trim(),
        description: (skill.description ?? skills[idx].description ?? '').trim(),
        system_prompt: skill.system_prompt.trim(),
        updated_at: now,
      };
      skills[idx] = updatedSkill;
    } else {
      updatedSkill = {
        id: skill.id,
        title: skill.title.trim(),
        description: (skill.description || '').trim(),
        system_prompt: skill.system_prompt.trim(),
        sort_order: skill.sort_order ?? (skills.length + 1),
        created_at: skill.created_at ?? now,
        updated_at: now,
      };
      skills.push(updatedSkill);
    }
  } else {
    const newId = `skill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    updatedSkill = {
      id: newId,
      title: skill.title.trim(),
      description: (skill.description || '').trim(),
      system_prompt: skill.system_prompt.trim(),
      sort_order: skills.length + 1,
      created_at: now,
      updated_at: now,
    };
    skills.push(updatedSkill);
  }

  skills.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  await localFileAdapter.writeTextFile('skills.json', JSON.stringify(skills, null, 2));
  return updatedSkill;
};

export const deleteSkill = async (id: string): Promise<boolean> => {
  try {
    const skills = await getSkills();
    const filtered = skills.filter((s) => s.id !== id);
    if (filtered.length === skills.length) return false;
    await localFileAdapter.writeTextFile('skills.json', JSON.stringify(filtered, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to delete skill', e);
    return false;
  }
};

export const reorderSkills = async (orderedIds: string[]): Promise<boolean> => {
  try {
    const skills = await getSkills();
    const skillMap = new Map(skills.map((s) => [s.id, s]));
    const reordered: SkillItem[] = [];

    orderedIds.forEach((id, index) => {
      const s = skillMap.get(id);
      if (s) {
        reordered.push({ ...s, sort_order: index + 1, updated_at: Date.now() });
        skillMap.delete(id);
      }
    });

    let nextOrder = reordered.length + 1;
    for (const remaining of skillMap.values()) {
      reordered.push({ ...remaining, sort_order: nextOrder++ });
    }

    await localFileAdapter.writeTextFile('skills.json', JSON.stringify(reordered, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to reorder skills', e);
    return false;
  }
};

export const resetSkillsToDefault = async (): Promise<SkillItem[]> => {
  try {
    const initial = cloneDefaultSkills();
    await localFileAdapter.writeTextFile('skills.json', JSON.stringify(initial, null, 2));
    return initial;
  } catch (e) {
    console.error('Failed to reset skills to default', e);
    return cloneDefaultSkills();
  }
};
