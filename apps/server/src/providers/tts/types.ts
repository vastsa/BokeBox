import type { TtsMode, TtsOptions } from '../../types/job.js';
import type { ProviderDescriptor, ProviderId } from '../types.js';

export type TtsAudioFormat = 'wav' | 'mp3' | 'ogg' | 'unknown';

export interface TtsVoiceMeta {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  description?: string;
}

export interface TtsModeMeta {
  id: string;
  label: string;
  modelHint?: string;
  description?: string;
}

export interface TtsProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  modes: TtsModeMeta[];
  voices: TtsVoiceMeta[];
  supportsStyleTags: boolean;
  supportsVoiceDesign: boolean;
  /** 单次请求建议最大字符数；门面会据此切段 */
  maxCharsPerRequest: number;
  suggestedModels?: {
    tts?: string;
    voiceDesign?: string;
    defaultVoice?: string;
  };
}

export interface TtsChunkInput {
  text: string;
  tts?: TtsOptions;
  /** 分段合成时仅首段注入开头风格标签 */
  applyLeadingStyle?: boolean;
  model?: string;
  voiceDesignModel?: string;
}

export interface TtsChunkResult {
  audio: Buffer;
  format: TtsAudioFormat;
  provider: ProviderId;
  model?: string;
  voice?: string;
  mode?: TtsMode;
  demo?: boolean;
}

export interface TtsProvider {
  readonly id: ProviderId;
  readonly meta: TtsProviderMeta;
  isAvailable(): boolean;
  /** 合成单段文本（门面负责切段/拼接/落盘） */
  synthesizeChunk(input: TtsChunkInput): Promise<TtsChunkResult>;
}

export function toTtsDescriptor(p: TtsProvider): ProviderDescriptor {
  return {
    id: p.id,
    name: p.meta.name,
    description: p.meta.description,
    available: p.isAvailable(),
    suggestedModels: p.meta.suggestedModels,
  };
}
