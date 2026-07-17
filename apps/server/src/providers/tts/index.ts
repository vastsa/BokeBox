import { getTtsProviderId } from '../../utils/aiConfig.js';
import type { ProviderDescriptor } from '../types.js';
import { demoTtsProvider } from './demoTts.js';
import { mimoTtsProvider } from './mimoTts.js';
import { openaiTtsProvider } from './openaiTts.js';
import type { TtsProvider } from './types.js';
import { toTtsDescriptor } from './types.js';

const registry = new Map<string, TtsProvider>();

/** 注册 TTS 提供方（可热插拔扩展） */
export function registerTtsProvider(provider: TtsProvider): void {
  registry.set(provider.id, provider);
}

export function listTtsProviders(): TtsProvider[] {
  return [...registry.values()];
}

export function listTtsProviderDescriptors(): ProviderDescriptor[] {
  return listTtsProviders().map(toTtsDescriptor);
}

export function getTtsProviderById(id: string): TtsProvider | undefined {
  return registry.get(id);
}

/**
 * 按配置解析 TTS 提供方；不可用时回落 demo。
 * 每次调用都读最新配置，换源无需重启。
 */
export function resolveTtsProvider(explicitId?: string): TtsProvider {
  const preferredId = (explicitId || getTtsProviderId() || 'mimo').trim();
  const preferred = registry.get(preferredId) || registry.get('mimo');
  if (preferred?.isAvailable()) return preferred;

  if (preferred && !preferred.isAvailable()) {
    for (const p of registry.values()) {
      if (p.id !== 'demo' && p.isAvailable()) return p;
    }
  }

  return registry.get('demo') || demoTtsProvider;
}

// 内置提供方
registerTtsProvider(mimoTtsProvider);
registerTtsProvider(openaiTtsProvider);
registerTtsProvider(demoTtsProvider);

export type {
  TtsProvider,
  TtsProviderMeta,
  TtsChunkInput,
  TtsChunkResult,
  TtsVoiceMeta,
  TtsModeMeta,
} from './types.js';
export {
  MIMO_PRESET_VOICES,
  MIMO_SPEECH_STYLE_TAGS,
  MIMO_AUDIO_TAG_EXAMPLES,
  applyAssistantStyleTags,
  resolveMimoPresetVoice,
} from './mimoTts.js';
export { OPENAI_PRESET_VOICES } from './openaiTts.js';
export { splitScript, mergeWavBuffers, wavDurationSec, detectAudioFormat } from './audioUtils.js';
