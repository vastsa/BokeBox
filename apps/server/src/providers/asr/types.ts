/**
 * ASR 插件契约（与 Source 插件同一套机制）
 */
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

export interface AsrTranscribeInput {
  audioPath: string;
  /** 文件扩展名 / 容器格式提示，如 mp3、wav */
  format?: string;
  /** 覆盖配置中的模型名 */
  model?: string;
  /** 可选语言提示（部分协议支持） */
  language?: string;
}

export interface AsrTranscribeResult {
  text: string;
  provider: ProviderId;
  model?: string;
  demo?: boolean;
}

/** 宿主注入的运行上下文（外部插件可读配置） */
export interface AsrPluginContext {
  storageDir: string;
  config: PluginConfigMap;
  getConfig(key: string): PluginConfigValue | undefined;
  signal?: AbortSignal;
}

/**
 * 核心转写能力（内置实现文件可只声明此接口）
 */
export interface AsrProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly description: string;
  readonly suggestedModel?: string;
  /**
   * 为 true 时：用户明确选择该源且当前不可用，resolve 仍返回自身，
   * 由 transcribe 抛出安装/配置提示，避免静默切到 demo。
   */
  readonly strictAvailability?: boolean;
  isAvailable(): boolean;
  transcribe(
    input: AsrTranscribeInput,
    ctx?: AsrPluginContext,
  ): Promise<AsrTranscribeResult>;
}

/**
 * ASR 插件 = 核心能力 + 插件元数据（与 Source 对齐）
 */
export interface AsrPlugin extends AsrProvider {
  readonly version: string;
  readonly riskLevel: PluginRiskLevel;
  readonly defaultEnabled: boolean;
  readonly configSchema?: readonly PluginConfigField[];
}

export interface AsrPluginManifest extends PluginManifestBase {
  kind?: 'asr';
  suggestedModel?: string;
}

export interface AsrPluginDescriptor extends PluginDescriptorBase {
  kind: 'asr';
  suggestedModel?: string;
  /** 是否为当前设置中的激活插件 */
  active?: boolean;
}

export interface AsrPluginRegistration {
  plugin?: AsrPlugin;
  origin: PluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: PluginPermission[];
  apiVersion?: number;
  loadError?: string;
  configSchema?: PluginConfigField[];
  manifestSnapshot?: Partial<AsrPluginManifest>;
  loadedAt?: string;
}

export function toAsrDescriptor(p: AsrProvider): ProviderDescriptor {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    available: p.isAvailable(),
    suggestedModels: p.suggestedModel ? { asr: p.suggestedModel } : undefined,
  };
}
