import { getDb } from '../db/sqlite.js';
import type { ScriptPromptOptions, TtsOptions } from '../types/job.js';
import { normalizeScriptPrompt } from './scriptPrompt.js';

const KEY_SCRIPT_PROMPT = 'script_prompt';
const KEY_COVER_PROMPT = 'cover_prompt';
const KEY_TTS_OPTIONS = 'tts_options';
const KEY_AUTH = 'auth_account';
const KEY_AI = 'ai_config';
const KEY_SESSIONS = 'auth_sessions';
const KEY_SETUP = 'setup_completed';

export type AuthAccount = {
  username: string;
  /** scrypt 派生：salt:hash（hex） */
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type AiConfig = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  asrModel: string;
  ttsModel: string;
  voiceDesignModel: string;
  /** 图片生成模型；空字符串表示不生成 AI 封面 */
  imageModel: string;
  defaultVoice: string;
};

export type PublicAiConfig = {
  apiKeySet: boolean;
  /** 脱敏后的 key 尾号，未设置时为空 */
  apiKeyHint: string;
  baseUrl: string;
  chatModel: string;
  asrModel: string;
  ttsModel: string;
  voiceDesignModel: string;
  /** 图片生成模型；空表示关闭 AI 封面 */
  imageModel: string;
  defaultVoice: string;
};

export type SessionRecord = {
  token: string;
  username: string;
  createdAt: string;
  expiresAt: string;
};

const DEFAULT_AI: AiConfig = {
  apiKey: '',
  baseUrl: 'https://api.oj.ink/v1',
  chatModel: 'mimo-v2.5',
  asrModel: 'mimo-v2.5-asr',
  ttsModel: 'mimo-v2.5-tts',
  voiceDesignModel: 'mimo-v2.5-tts-voicedesign',
  imageModel: '',
  defaultVoice: '冰糖',
};

function getSettingRaw(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSettingRaw(key: string, value: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (@key, @value, @updated_at)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run({ key, value, updated_at: now });
}

function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 是否已完成系统初始化 */
export function isSetupCompleted(): boolean {
  if (getSettingRaw(KEY_SETUP) === '1') return true;
  // 兼容：有账号即视为已初始化
  return Boolean(getAuthAccount());
}

export function markSetupCompleted(): void {
  setSettingRaw(KEY_SETUP, '1');
}

export function getAuthAccount(): AuthAccount | null {
  return parseJson<AuthAccount>(getSettingRaw(KEY_AUTH));
}

export function setAuthAccount(account: AuthAccount): AuthAccount {
  setSettingRaw(KEY_AUTH, JSON.stringify(account));
  return account;
}

export function getAiConfig(): AiConfig {
  const stored = parseJson<Partial<AiConfig>>(getSettingRaw(KEY_AI));
  const envKey = process.env.OPENAI_API_KEY?.trim() || '';
  const envBase = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
  return {
    apiKey: stored?.apiKey?.trim() || envKey || DEFAULT_AI.apiKey,
    baseUrl: (stored?.baseUrl || envBase || DEFAULT_AI.baseUrl).replace(
      /\/$/,
      '',
    ),
    chatModel:
      stored?.chatModel?.trim() ||
      process.env.OPENAI_CHAT_MODEL ||
      DEFAULT_AI.chatModel,
    asrModel:
      stored?.asrModel?.trim() ||
      process.env.OPENAI_TRANSCRIBE_MODEL ||
      DEFAULT_AI.asrModel,
    ttsModel:
      stored?.ttsModel?.trim() ||
      process.env.OPENAI_TTS_MODEL ||
      DEFAULT_AI.ttsModel,
    voiceDesignModel:
      stored?.voiceDesignModel?.trim() ||
      process.env.OPENAI_TTS_VOICEDESIGN_MODEL ||
      DEFAULT_AI.voiceDesignModel,
    // 图片模型允许显式空字符串关闭；仅在字段缺失时回落 env/默认
    imageModel:
      stored && Object.prototype.hasOwnProperty.call(stored, 'imageModel')
        ? String(stored.imageModel || '').trim()
        : (process.env.OPENAI_IMAGE_MODEL || DEFAULT_AI.imageModel).trim(),
    defaultVoice:
      stored?.defaultVoice?.trim() ||
      process.env.OPENAI_TTS_DEFAULT_VOICE ||
      DEFAULT_AI.defaultVoice,
  };
}

/** 仅读取库中已保存配置（不含 env 回落），用于判断是否写过 */
export function getStoredAiConfig(): Partial<AiConfig> | null {
  return parseJson<Partial<AiConfig>>(getSettingRaw(KEY_AI));
}

export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const current = getAiConfig();
  const next: AiConfig = {
    apiKey:
      patch.apiKey !== undefined
        ? String(patch.apiKey).trim()
        : current.apiKey,
    baseUrl: (
      patch.baseUrl !== undefined
        ? String(patch.baseUrl).trim()
        : current.baseUrl
    ).replace(/\/$/, ''),
    chatModel:
      patch.chatModel !== undefined
        ? String(patch.chatModel).trim() || current.chatModel
        : current.chatModel,
    asrModel:
      patch.asrModel !== undefined
        ? String(patch.asrModel).trim() || current.asrModel
        : current.asrModel,
    ttsModel:
      patch.ttsModel !== undefined
        ? String(patch.ttsModel).trim() || current.ttsModel
        : current.ttsModel,
    voiceDesignModel:
      patch.voiceDesignModel !== undefined
        ? String(patch.voiceDesignModel).trim() || current.voiceDesignModel
        : current.voiceDesignModel,
    // 允许保存空字符串，用于关闭 AI 封面生成
    imageModel:
      patch.imageModel !== undefined
        ? String(patch.imageModel).trim()
        : current.imageModel,
    defaultVoice:
      patch.defaultVoice !== undefined
        ? String(patch.defaultVoice).trim() || current.defaultVoice
        : current.defaultVoice,
  };
  // 空字符串 apiKey 表示不覆盖（编辑场景）
  if (patch.apiKey === '') {
    next.apiKey = current.apiKey;
  }
  setSettingRaw(KEY_AI, JSON.stringify(next));
  return next;
}

export function maskApiKey(apiKey?: string): string {
  const key = (apiKey || '').trim();
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

export function toPublicAiConfig(cfg?: AiConfig): PublicAiConfig {
  const c = cfg || getAiConfig();
  return {
    apiKeySet: Boolean(c.apiKey),
    apiKeyHint: maskApiKey(c.apiKey),
    baseUrl: c.baseUrl,
    chatModel: c.chatModel,
    asrModel: c.asrModel,
    ttsModel: c.ttsModel,
    voiceDesignModel: c.voiceDesignModel,
    imageModel: c.imageModel || '',
    defaultVoice: c.defaultVoice,
  };
}

export function getDefaultAiConfigForSetup(): PublicAiConfig & {
  /** 初始化页可预填明文默认（仅 base/model，不含密钥） */
  suggested: Omit<AiConfig, 'apiKey'>;
} {
  const c = getAiConfig();
  return {
    ...toPublicAiConfig(c),
    suggested: {
      baseUrl: c.baseUrl || DEFAULT_AI.baseUrl,
      chatModel: c.chatModel || DEFAULT_AI.chatModel,
      asrModel: c.asrModel || DEFAULT_AI.asrModel,
      ttsModel: c.ttsModel || DEFAULT_AI.ttsModel,
      voiceDesignModel: c.voiceDesignModel || DEFAULT_AI.voiceDesignModel,
      imageModel: c.imageModel || DEFAULT_AI.imageModel,
      defaultVoice: c.defaultVoice || DEFAULT_AI.defaultVoice,
    },
  };
}

function listSessions(): SessionRecord[] {
  const all = parseJson<SessionRecord[]>(getSettingRaw(KEY_SESSIONS)) || [];
  const now = Date.now();
  return all.filter((s) => new Date(s.expiresAt).getTime() > now);
}

function saveSessions(sessions: SessionRecord[]): void {
  setSettingRaw(KEY_SESSIONS, JSON.stringify(sessions));
}

export function createSession(
  username: string,
  ttlMs = 1000 * 60 * 60 * 24 * 30,
): SessionRecord {
  const token = cryptoRandomToken();
  const now = new Date();
  const session: SessionRecord = {
    token,
    username,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  const next = listSessions().filter((s) => s.username !== username);
  next.push(session);
  // 最多保留 10 个会话
  saveSessions(next.slice(-10));
  return session;
}

export function getSession(token?: string | null): SessionRecord | null {
  if (!token) return null;
  const found = listSessions().find((s) => s.token === token);
  return found || null;
}

export function revokeSession(token?: string | null): void {
  if (!token) return;
  saveSessions(listSessions().filter((s) => s.token !== token));
}

export function revokeAllSessions(): void {
  deleteSetting(KEY_SESSIONS);
}


const PRESET_VOICE_IDS = new Set([
  'mimo_default',
  '冰糖',
  '茉莉',
  '苏打',
  '白桦',
  'Mia',
  'Chloe',
  'Milo',
  'Dean',
]);

function resolveStoredVoice(voice?: string): string {
  const fallback =
    getAiConfig().defaultVoice?.trim() || DEFAULT_AI.defaultVoice;
  const candidate = voice?.trim() || fallback;
  if (PRESET_VOICE_IDS.has(candidate)) return candidate;
  return fallback;
}

function normalizeMode(raw?: string | null): TtsOptions['mode'] {
  const m = String(raw || 'default').trim();
  if (m === 'voicedesign') return 'voicedesign';
  return 'default';
}

function parseStyleTags(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  if (Array.isArray(raw)) {
    const tags = raw.map((x) => String(x).trim()).filter(Boolean);
    return tags.length ? tags : undefined;
  }
  const text = String(raw).trim();
  if (!text) return undefined;
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text) as unknown;
      if (Array.isArray(arr)) {
        const tags = arr.map((x) => String(x).trim()).filter(Boolean);
        return tags.length ? tags : undefined;
      }
    } catch {
      // ignore
    }
  }
  const tags = text.split(/[\s,，、|]+/).map((s) => s.trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

/** 统一归一化全局/任务 TTS 配置 */
export function normalizeTtsOptions(tts?: Partial<TtsOptions> | null): TtsOptions {
  const mode = normalizeMode(tts?.mode ? String(tts.mode) : 'default');
  const styleTags = parseStyleTags(
    (tts as { styleTags?: unknown } | null | undefined)?.styleTags,
  );
  const voiceDesign = tts?.voiceDesign ? String(tts.voiceDesign).trim() : '';
  return {
    mode,
    voice:
      mode === 'voicedesign'
        ? undefined
        : resolveStoredVoice(tts?.voice ? String(tts.voice) : undefined),
    voiceDesign: voiceDesign || undefined,
    styleTags: mode === 'voicedesign' ? undefined : styleTags,
  };
}

function defaultGlobalTts(): TtsOptions {
  return normalizeTtsOptions({
    mode: 'default',
    voice: getAiConfig().defaultVoice || DEFAULT_AI.defaultVoice,
    voiceDesign:
      '成熟稳重的中文播客主持人，音色温暖清晰，语速适中，有亲和力',
  });
}

/** 读取全局 TTS（音色）设置 */
export function getGlobalTtsOptions(): TtsOptions {
  const raw = getSettingRaw(KEY_TTS_OPTIONS);
  if (!raw) return defaultGlobalTts();
  try {
    const parsed = JSON.parse(raw) as Partial<TtsOptions>;
    return normalizeTtsOptions(parsed);
  } catch {
    return defaultGlobalTts();
  }
}

/** 保存全局 TTS（音色）设置 */
export function setGlobalTtsOptions(
  tts?: Partial<TtsOptions> | null,
): TtsOptions {
  const next = normalizeTtsOptions(tts ?? defaultGlobalTts());
  setSettingRaw(KEY_TTS_OPTIONS, JSON.stringify(next));
  return next;
}

/** 读取全局口播提示词干预 */
export function getGlobalScriptPrompt(): ScriptPromptOptions {
  const raw = getSettingRaw(KEY_SCRIPT_PROMPT);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<ScriptPromptOptions>;
    return normalizeScriptPrompt(parsed) || {};
  } catch {
    return {};
  }
}

/** 保存全局口播提示词干预（空对象表示清空） */
export function setGlobalScriptPrompt(
  prompt?: Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions {
  const next = normalizeScriptPrompt(prompt) || {};
  setSettingRaw(KEY_SCRIPT_PROMPT, JSON.stringify(next));
  return next;
}


/** 读取后台配置的封面提示词模板（空表示使用代码内默认） */
export function getCoverPromptTemplateStored(): string {
  const raw = getSettingRaw(KEY_COVER_PROMPT);
  if (!raw) return '';
  // 兼容：历史上若误存 JSON 字符串
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { template?: string };
      return String(parsed.template || '').trim();
    } catch {
      // fallthrough
    }
  }
  return trimmed;
}

/**
 * 保存封面提示词模板。
 * 传空 / null → 删除配置，回落系统默认。
 */
export function setCoverPromptTemplate(
  template?: string | null,
): string {
  const next = template == null ? '' : String(template).trim();
  if (!next) {
    deleteSetting(KEY_COVER_PROMPT);
    return '';
  }
  setSettingRaw(KEY_COVER_PROMPT, next);
  return next;
}

function cryptoRandomToken(): string {
  const bytes = new Uint8Array(32);
  // Node 全局 crypto
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}
