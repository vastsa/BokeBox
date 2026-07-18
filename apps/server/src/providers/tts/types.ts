/**
 * TTS 插件契约（与 Source / ASR 同一套机制）
 */
import type { TtsMode, TtsOptions } from '../../types/job.js';
import type {
  PluginConfigField,
  PluginConfigMap,
  PluginConfigValue,
  PluginDescriptorBase,
  PluginManifestBase,
  PluginOrigin,
  PluginPermission,
  PluginRiskLevel,
} from '../../plugin-kit/index.js';
import type { ProviderDescriptor, ProviderId } from '../types.js';

export type {
  PluginConfigField,
  PluginConfigMap,
  PluginConfigValue,
  PluginOrigin,
  PluginPermission,
  PluginRiskLevel,
};

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

/** 宿主注入的运行上下文 */
export interface TtsPluginContext {
  storageDir: string;
  config: PluginConfigMap;
  getConfig(key: string): PluginConfigValue | undefined;
  signal?: AbortSignal;
}

/**
 * 核心合成能力（内置实现文件可只声明此接口）
 */
export interface TtsProvider {
  readonly id: ProviderId;
  readonly meta: TtsProviderMeta;
  readonly strictAvailability?: boolean;
  isAvailable(): boolean;
  synthesizeChunk(
    input: TtsChunkInput,
    ctx?: TtsPluginContext,
  ): Promise<TtsChunkResult>;
}

/**
 * TTS 插件 = 核心能力 + 插件元数据
 */
export interface TtsPlugin extends TtsProvider {
  readonly version: string;
  readonly riskLevel: PluginRiskLevel;
  readonly defaultEnabled: boolean;
  readonly configSchema?: readonly PluginConfigField[];
  /** 顶层 name/description 便于列表；缺省回落 meta */
  readonly name?: string;
  readonly description?: string;
}

export interface TtsPluginManifest extends PluginManifestBase {
  kind?: 'tts';
}

export interface TtsPluginDescriptor extends PluginDescriptorBase {
  kind: 'tts';
  supportsStyleTags?: boolean;
  supportsVoiceDesign?: boolean;
  modes?: TtsModeMeta[];
  voices?: TtsVoiceMeta[];
  suggestedModels?: TtsProviderMeta['suggestedModels'];
  active?: boolean;
}

export interface TtsPluginRegistration {
  plugin?: TtsPlugin;
  origin: PluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: PluginPermission[];
  apiVersion?: number;
  loadError?: string;
  configSchema?: PluginConfigField[];
  manifestSnapshot?: Partial<TtsPluginManifest>;
  loadedAt?: string;
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
