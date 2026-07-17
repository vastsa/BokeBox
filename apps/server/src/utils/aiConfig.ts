import { getAiConfig } from '../services/settingsStore.js';

/** 运行时优先读库内 AI 配置，回落到环境变量（由 settingsStore 统一处理） */
export function getBaseUrl(): string {
  return getAiConfig().baseUrl.replace(/\/$/, '');
}

export function getApiKey(): string {
  return getAiConfig().apiKey.trim();
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
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

/** ASR 提供方 id：mimo | openai | 自定义注册 */
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

export async function aiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${getApiKey()}`);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${getBaseUrl()}${path}`, { ...init, headers });
}
