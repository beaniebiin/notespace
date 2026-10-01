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
  selectedModel?: string
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

  const systemInstruction = 
    "You are an AI assistant in a Markdown note-taking app.\n" +
    "Provide the response in clean Markdown format.\n" +
    "If the user asks to summarize, provide a summary.\n" +
    "If they ask to continue writing, append to the content.\n" +
    "If images or files are provided, use them as context.\n" +
    "Do not wrap the whole response in markdown code blocks unless specifically asked for code.\n" +
    "Return the raw markdown content directly.";

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
