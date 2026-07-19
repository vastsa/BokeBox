/**
 * TTS 音色 UI 画像：按提供方 / 插件 meta 决定展示形态
 */
import type { AiPluginDescriptor } from '../api/plugins';
import {
  EDGE_VOICE_OPTIONS,
  OPENAI_VOICE_OPTIONS,
} from './providerOptions';

export type TtsVoiceUi = 'preset' | 'reference' | 'freeform' | 'none';

export type TtsVoiceOption = {
  id: string;
  name: string;
  meta?: string;
  title?: string;
};

export type TtsVoiceProfile = {
  providerId: string;
  providerName: string;
  voiceUi: TtsVoiceUi;
  supportsStyleTags: boolean;
  supportsVoiceDesign: boolean;
  voices: TtsVoiceOption[];
  /** 预置网格默认值；reference/freeform 可为空 */
  defaultVoice: string;
  /** 插件配置里的默认 referenceId（非密钥） */
  pluginDefaultReferenceId?: string;
  configReady?: boolean;
  description?: string;
};

const MIMO_VOICES: TtsVoiceOption[] = [
  { id: 'mimo_default', name: 'MiMo-默认', meta: '自适应', title: '中国集群=冰糖' },
  { id: '冰糖', name: '冰糖', meta: '中文 · 女性' },
  { id: '茉莉', name: '茉莉', meta: '中文 · 女性' },
  { id: '苏打', name: '苏打', meta: '中文 · 男性' },
  { id: '白桦', name: '白桦', meta: '中文 · 男性' },
  { id: 'Mia', name: 'Mia', meta: '英文 · 女性' },
  { id: 'Chloe', name: 'Chloe', meta: '英文 · 女性' },
  { id: 'Milo', name: 'Milo', meta: '英文 · 男性' },
  { id: 'Dean', name: 'Dean', meta: '英文 · 男性' },
];

export function normalizeTtsProviderId(provider?: string): string {
  return String(provider || 'mimo').trim() || 'mimo';
}

export function isMimoTtsProvider(provider?: string): boolean {
  return normalizeTtsProviderId(provider).toLowerCase() === 'mimo';
}

function normalizeVoiceUi(raw: unknown): TtsVoiceUi | undefined {
  const s = String(raw || '').trim();
  if (s === 'preset' || s === 'reference' || s === 'freeform' || s === 'none') {
    return s;
  }
  return undefined;
}

function pluginVoices(plugin?: AiPluginDescriptor | null): TtsVoiceOption[] {
  const list = plugin?.voices;
  if (!Array.isArray(list) || !list.length) return [];
  const out: TtsVoiceOption[] = [];
  for (const v of list) {
    const id = String(v?.id || '').trim();
    if (!id || id === 'config') continue;
    const name = String(v?.name || id);
    const language = String(v?.language || '').trim();
    const gender = String(v?.gender || '').trim();
    const metaParts = [language, gender && gender !== '-' ? gender : ''].filter(
      Boolean,
    );
    out.push({
      id,
      name,
      meta: metaParts.length ? metaParts.join(' · ') : undefined,
      title: String(v?.description || '').trim() || undefined,
    });
  }
  return out;
}

function builtinPresetVoices(providerId: string): TtsVoiceOption[] {
  const id = providerId.toLowerCase();
  if (id === 'edge') {
    return EDGE_VOICE_OPTIONS.map((v) => ({
      id: v.id,
      name: v.name,
      meta: v.language,
      title: `${v.name} · ${v.language}`,
    }));
  }
  if (id === 'openai') {
    return OPENAI_VOICE_OPTIONS.map((v) => ({
      id: v.id,
      name: v.name,
      meta: v.language,
      title: `${v.name} · ${v.language}`,
    }));
  }
  if (id === 'mimo') return MIMO_VOICES.map((v) => ({ ...v }));
  return [];
}

function defaultVoiceForPreset(providerId: string, voices: TtsVoiceOption[]): string {
  const id = providerId.toLowerCase();
  if (id === 'edge') return 'zh-CN-XiaoxiaoNeural';
  if (id === 'openai') return 'alloy';
  if (id === 'mimo') return '冰糖';
  return voices[0]?.id || '';
}

function readPluginDefaultVoice(
  plugin?: AiPluginDescriptor | null,
  voiceUi?: TtsVoiceUi,
): string | undefined {
  const values = plugin?.configValues;
  if (!values || typeof values !== 'object') return undefined;

  // 1) 插件显式声明的配置 key
  const declared = String(plugin?.voiceConfigKey || '').trim();
  if (declared && values[declared] !== undefined && values[declared] !== '') {
    const s = String(values[declared]).trim();
    if (s) return s;
  }

  // 2) 按 UI 形态的常见约定
  const keys =
    voiceUi === 'reference'
      ? ['referenceId', 'reference_id', 'defaultVoice', 'voice']
      : ['defaultVoice', 'voice', 'referenceId', 'reference_id'];
  for (const key of keys) {
    const raw = values[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const s = String(raw).trim();
    if (s) return s;
  }
  return undefined;
}

/**
 * 根据 providerId + 插件描述符解析音色 UI 画像。
 * 优先使用插件显式 voiceUi，其次按内置表 / voices 推断。
 */
export function resolveTtsVoiceProfile(
  provider?: string,
  plugin?: AiPluginDescriptor | null,
): TtsVoiceProfile {
  const providerId = normalizeTtsProviderId(provider);
  const idLower = providerId.toLowerCase();
  const explicitUi = normalizeVoiceUi(plugin?.voiceUi);
  const fromPlugin = pluginVoices(plugin);
  const builtin = builtinPresetVoices(providerId);

  // 推断优先级：
  // 1) 插件显式 voiceUi（第三方插件的正确做法）
  // 2) 内置提供方
  // 3) 有 voices 列表 → preset
  // 4) 否则 freeform（通用兜底，不特判插件名）
  let voiceUi: TtsVoiceUi =
    explicitUi ||
    (idLower === 'demo'
      ? 'none'
      : idLower === 'mimo' || idLower === 'openai' || idLower === 'edge'
        ? 'preset'
        : fromPlugin.length
          ? 'preset'
          : 'freeform');

  if (explicitUi === 'reference') voiceUi = 'reference';
  if (explicitUi === 'none') voiceUi = 'none';
  if (explicitUi === 'preset') voiceUi = 'preset';
  if (explicitUi === 'freeform') voiceUi = 'freeform';

  const supportsStyleTags = Boolean(
    plugin?.supportsStyleTags ?? idLower === 'mimo',
  );
  const supportsVoiceDesign = Boolean(
    plugin?.supportsVoiceDesign ?? idLower === 'mimo',
  );

  const voices =
    voiceUi === 'preset'
      ? fromPlugin.length
        ? fromPlugin
        : builtin
      : [];

  const suggestedDefault = String(
    plugin?.suggestedModels?.defaultVoice || '',
  ).trim();
  const pluginDefaultReferenceId = readPluginDefaultVoice(plugin, voiceUi);

  let defaultVoice = '';
  if (voiceUi === 'preset') {
    defaultVoice =
      (suggestedDefault && voices.some((v) => v.id === suggestedDefault)
        ? suggestedDefault
        : '') || defaultVoiceForPreset(providerId, voices);
  } else if (voiceUi === 'reference' || voiceUi === 'freeform') {
    // 任务级 voice 可空，空则走插件默认 referenceId
    defaultVoice = '';
  }

  return {
    providerId,
    providerName: plugin?.name || providerId,
    voiceUi,
    supportsStyleTags,
    supportsVoiceDesign,
    voices,
    defaultVoice,
    pluginDefaultReferenceId,
    configReady: plugin?.configReady,
    description: plugin?.description || undefined,
  };
}

export function defaultVoiceForProvider(
  provider?: string,
  plugin?: AiPluginDescriptor | null,
): string {
  return resolveTtsVoiceProfile(provider, plugin).defaultVoice;
}

/** 展示用音色标签 */
export function formatTtsVoiceLabel(
  voice: string | undefined,
  profile: TtsVoiceProfile,
  emptyLabel = '插件默认',
): string {
  const v = String(voice || '').trim();
  if (profile.voiceUi === 'reference' || profile.voiceUi === 'freeform') {
    if (v) return v;
    if (profile.pluginDefaultReferenceId) {
      return `${emptyLabel}（${profile.pluginDefaultReferenceId}）`;
    }
    return emptyLabel;
  }
  if (profile.voiceUi === 'none') return '—';
  if (v) {
    const hit = profile.voices.find((x) => x.id === v);
    return hit?.name || v;
  }
  return profile.defaultVoice || emptyLabel;
}
