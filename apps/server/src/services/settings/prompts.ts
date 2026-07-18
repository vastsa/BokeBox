/**
 * 全局口播 / TTS / 封面 / 系统提示词设置
 */
import type { ScriptPromptOptions, TtsOptions } from '../../types/job.js';
import { normalizeScriptPrompt } from '../content/scriptPrompt.js';
import { DEFAULT_AI, getAiConfig } from './ai.js';
import {
  KEY_COVER_PROMPT,
  KEY_FLASHCARD_SYSTEM_PROMPT,
  KEY_PODCAST_SYSTEM_PROMPT,
  KEY_REWRITE_SYSTEM_PROMPT,
  KEY_SCRIPT_PROMPT,
  KEY_TTS_OPTIONS,
  deleteSetting,
  getSettingRaw,
  parseJson,
  setSettingRaw,
} from './kv.js';

const MIMO_PRESET_VOICE_IDS = new Set([
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

const OPENAI_PRESET_VOICE_IDS = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
]);

const EDGE_PRESET_VOICE_IDS = new Set([
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-XiaoyiNeural',
  'zh-CN-YunxiNeural',
  'zh-CN-YunjianNeural',
  'zh-CN-YunyangNeural',
  'zh-CN-XiaochenNeural',
  'zh-CN-XiaohanNeural',
  'zh-CN-XiaomengNeural',
  'zh-CN-XiaomoNeural',
  'zh-CN-XiaoruiNeural',
  'zh-CN-XiaoshuangNeural',
  'zh-CN-XiaoxuanNeural',
  'zh-CN-YunfengNeural',
  'zh-CN-YunhaoNeural',
  'zh-CN-YunxiaNeural',
  'zh-CN-YunyeNeural',
  'zh-CN-YunzeNeural',
  'en-US-AriaNeural',
  'en-US-JennyNeural',
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-GB-SoniaNeural',
]);

function currentTtsProviderId(): string {
  return (getAiConfig().ttsProvider || DEFAULT_AI.ttsProvider || 'mimo')
    .trim()
    .toLowerCase() || 'mimo';
}

function defaultVoiceForProvider(provider: string): string {
  if (provider === 'edge') return 'zh-CN-XiaoxiaoNeural';
  if (provider === 'openai') return 'alloy';
  return DEFAULT_AI.defaultVoice || '冰糖';
}

function resolveStoredVoice(voice?: string, providerId?: string): string {
  const provider = (providerId || currentTtsProviderId()).trim().toLowerCase();
  const cfgDefault = getAiConfig().defaultVoice?.trim() || '';
  const candidate = voice?.trim() || cfgDefault;

  if (provider === 'edge') {
    const fallback =
      cfgDefault &&
      (EDGE_PRESET_VOICE_IDS.has(cfgDefault) ||
        /^[a-z]{2}-[A-Z]{2}-/.test(cfgDefault))
        ? cfgDefault
        : defaultVoiceForProvider('edge');
    if (
      candidate &&
      (EDGE_PRESET_VOICE_IDS.has(candidate) ||
        /^[a-z]{2}-[A-Z]{2}-/.test(candidate))
    ) {
      return candidate;
    }
    return fallback;
  }

  if (provider === 'openai') {
    const normalized = candidate.toLowerCase();
    const fallback =
      cfgDefault && OPENAI_PRESET_VOICE_IDS.has(cfgDefault.toLowerCase())
        ? cfgDefault.toLowerCase()
        : defaultVoiceForProvider('openai');
    if (normalized && OPENAI_PRESET_VOICE_IDS.has(normalized)) return normalized;
    return fallback;
  }

  // mimo 及其他：仅放行 MiMo 预置
  const fallback =
    cfgDefault && MIMO_PRESET_VOICE_IDS.has(cfgDefault)
      ? cfgDefault
      : defaultVoiceForProvider('mimo');
  if (candidate && MIMO_PRESET_VOICE_IDS.has(candidate)) return candidate;
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

/** 统一归一化全局/任务 TTS 配置（非 MiMo 强制收敛高级音色字段） */
export function normalizeTtsOptions(tts?: Partial<TtsOptions> | null): TtsOptions {
  const provider = currentTtsProviderId();
  const isMimo = provider === 'mimo';
  let mode = normalizeMode(tts?.mode ? String(tts.mode) : 'default');
  if (!isMimo) mode = 'default';

  const styleTags = isMimo
    ? parseStyleTags(
        (tts as { styleTags?: unknown } | null | undefined)?.styleTags,
      )
    : undefined;
  const voiceDesign =
    isMimo && tts?.voiceDesign ? String(tts.voiceDesign).trim() : '';

  return {
    mode,
    voice:
      mode === 'voicedesign'
        ? undefined
        : resolveStoredVoice(
            tts?.voice ? String(tts.voice) : undefined,
            provider,
          ),
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


export type AiPromptKind = 'podcastSystem' | 'rewriteSystem' | 'flashcardSystem';

const AI_PROMPT_KEYS: Record<AiPromptKind, string> = {
  podcastSystem: KEY_PODCAST_SYSTEM_PROMPT,
  rewriteSystem: KEY_REWRITE_SYSTEM_PROMPT,
  flashcardSystem: KEY_FLASHCARD_SYSTEM_PROMPT,
};

/** 读取 AI 系统提示词原文（空表示使用代码内多语言默认） */
export function getAiPromptTemplateStored(kind: AiPromptKind): string {
  const raw = getSettingRaw(AI_PROMPT_KEYS[kind]);
  if (!raw) return '';
  return String(raw).trim();
}

/**
 * 保存 AI 系统提示词。
 * 传空 / null → 删除配置，回落系统默认。
 */
export function setAiPromptTemplateStored(
  kind: AiPromptKind,
  template?: string | null,
): string {
  const key = AI_PROMPT_KEYS[kind];
  const next = template == null ? '' : String(template).trim();
  if (!next) {
    deleteSetting(key);
    return '';
  }
  setSettingRaw(key, next);
  return next;
}
