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

/**
 * 插件声明式音色面板（宿主只做通用渲染，不固定业务页面）
 *
 * 第三方插件在 meta.voicePanel 中描述 fields 即可，无需改主仓前端。
 */
export type TtsVoiceBind = 'voice' | 'mode' | 'voiceDesign' | 'styleTags';

export type TtsVoicePanelWhen = {
  /** 仅当 tts.mode 匹配时显示（字符串或列表） */
  mode?: string | string[];
};

export type TtsVoicePanelOption = {
  id: string;
  name?: string;
  label?: string;
  language?: string;
  gender?: string;
  description?: string;
};

export type TtsVoicePanelField =
  | {
      type: 'info';
      text: string;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'modeTabs';
      /** 缺省使用 meta.modes */
      options?: Array<{ id: string; label: string; description?: string }>;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'voiceGrid';
      /** 缺省使用 meta.voices */
      options?: TtsVoicePanelOption[];
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'text' | 'textarea';
      bind: 'voice' | 'voiceDesign';
      label: string;
      placeholder?: string;
      description?: string;
      rows?: number;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'select';
      bind: 'voice' | 'voiceDesign';
      label: string;
      options: Array<{ value: string; label: string }>;
      description?: string;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'tags';
      bind: 'styleTags';
      label: string;
      options: string[];
      optional?: boolean;
      when?: TtsVoicePanelWhen;
    }
  | {
      /** 展示：当前生效 voice + 插件默认（voiceConfigKey） */
      type: 'effectiveSummary';
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'actions';
      items: Array<'usePluginDefault' | 'clearOverride' | 'openPluginSettings'>;
      when?: TtsVoicePanelWhen;
    };

export type TtsVoicePanelSpec = {
  /** 规范版本，当前 1 */
  version?: 1;
  title?: string;
  description?: string;
  fields: TtsVoicePanelField[];
};


/**
 * @deprecated 兼容旧插件的简写。新插件请直接提供 meta.voicePanel。
 * 宿主会把 voiceUi 编译成 voicePanel 再渲染。
 */
export type TtsVoiceUi = 'preset' | 'reference' | 'freeform' | 'none';

export interface TtsProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  modes: TtsModeMeta[];
  voices: TtsVoiceMeta[];
  supportsStyleTags: boolean;
  supportsVoiceDesign: boolean;
  /**
   * 插件自定义音色面板（推荐）。
   * 宿主只做通用字段渲染，不固定业务布局。
   */
  voicePanel?: TtsVoicePanelSpec;
  /**
   * @deprecated 旧简写；无 voicePanel 时由宿主编译为 voicePanel。
   */
  voiceUi?: TtsVoiceUi;
  /**
   * 插件配置里「默认音色」字段 key。
   * 任务级 tts.voice 始终可覆盖此配置。
   */
  voiceConfigKey?: string;
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
  voiceUi?: TtsVoiceUi;
  voiceConfigKey?: string;
  voicePanel?: TtsVoicePanelSpec;
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
