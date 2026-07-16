export function getBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL || 'https://api.oj.ink/v1').replace(/\/$/, '');
}

export function getApiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

export function getChatModel(): string {
  return process.env.OPENAI_CHAT_MODEL || 'mimo-v2.5';
}

export function getAsrModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL || 'mimo-v2.5-asr';
}

export function getTtsModel(): string {
  return process.env.OPENAI_TTS_MODEL || 'mimo-v2.5-tts';
}

export function getVoiceDesignModel(): string {
  return process.env.OPENAI_TTS_VOICEDESIGN_MODEL || 'mimo-v2.5-tts-voicedesign';
}

/** 自然口播默认预置音色（中国站推荐冰糖） */
export function getDefaultTtsVoice(): string {
  return process.env.OPENAI_TTS_DEFAULT_VOICE?.trim() || '冰糖';
}

export async function aiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${getApiKey()}`);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${getBaseUrl()}${path}`, { ...init, headers });
}
