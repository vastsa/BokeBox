import { getAiConfig } from '../services/settings/index.js';

export type AiServiceId = 'llm' | 'asr' | 'tts' | 'image';

/** 运行时解析：服务级端点/密钥优先，空则回落全局 */
export function resolveService(service: AiServiceId = 'llm'): {
  baseUrl: string;
  apiKey: string;
} {
  const c = getAiConfig();
  let baseUrl = c.baseUrl;
  let apiKey = c.apiKey;

  switch (service) {
    case 'llm':
      if (c.llmBaseUrl?.trim()) baseUrl = c.llmBaseUrl;
      if (c.llmApiKey?.trim()) apiKey = c.llmApiKey;
      break;
    case 'asr':
      if (c.asrBaseUrl?.trim()) baseUrl = c.asrBaseUrl;
      if (c.asrApiKey?.trim()) apiKey = c.asrApiKey;
      break;
    case 'tts':
      if (c.ttsBaseUrl?.trim()) baseUrl = c.ttsBaseUrl;
      if (c.ttsApiKey?.trim()) apiKey = c.ttsApiKey;
      break;
    case 'image':
      if (c.imageBaseUrl?.trim()) baseUrl = c.imageBaseUrl;
      if (c.imageApiKey?.trim()) apiKey = c.imageApiKey;
      break;
    default:
      break;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey: (apiKey || '').trim(),
  };
}

/** 全局默认 Base URL（兼容旧调用） */
export function getBaseUrl(): string {
  return resolveService('llm').baseUrl;
}

/** 全局/LLM 默认 Key（兼容旧调用） */
export function getApiKey(): string {
  return resolveService('llm').apiKey;
}

/** 是否具备可用密钥；可指定服务 */
export function hasApiKey(service: AiServiceId = 'llm'): boolean {
  return Boolean(resolveService(service).apiKey);
}

export function getChatModel(): string {
  return getAiConfig().chatModel;
}

export function getAsrModel(): string {
  return getAiConfig().asrModel;
}

export function getTtsModel(): string {
  return getAiConfig().ttsModel;
}

/** ASR 提供方 id：mimo | openai | local-whisper | 自定义注册 */
export function getAsrProviderId(): string {
  return (getAiConfig().asrProvider || 'mimo').trim() || 'mimo';
}

/** TTS 提供方 id：mimo | openai | edge | 自定义注册 */
export function getTtsProviderId(): string {
  return (getAiConfig().ttsProvider || 'mimo').trim() || 'mimo';
}

/** 本地 Whisper 可执行文件；空表示自动 PATH 探测 */
export function getWhisperBin(): string {
  return (getAiConfig().whisperBin || '').trim();
}

/** 本地 Whisper 语言提示；空表示自动检测 */
export function getWhisperLang(): string {
  return (getAiConfig().whisperLang || '').trim();
}

export function getVoiceDesignModel(): string {
  return getAiConfig().voiceDesignModel;
}

/** 图片生成模型；空表示未配置 */
export function getImageModel(): string {
  return (getAiConfig().imageModel || '').trim();
}

/** 是否启用 AI 封面（配置了图片模型） */
export function hasImageModel(): boolean {
  return Boolean(getImageModel());
}

/** 自然口播默认预置音色 */
export function getDefaultTtsVoice(): string {
  return getAiConfig().defaultVoice;
}

/**
 * 调用 OpenAI 兼容接口。
 * @param service 使用哪套端点/密钥：llm | asr | tts | image
 */
export async function aiFetch(
  path: string,
  init: RequestInit = {},
  service: AiServiceId = 'llm',
): Promise<Response> {
  const { baseUrl, apiKey } = resolveService(service);
  const headers = new Headers(init.headers || {});
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
  if (
    !headers.has('Content-Type') &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}
