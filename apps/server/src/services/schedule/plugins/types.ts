/**
 * Schedule 订阅插件契约
 *
 * 职责：按插件自己的逻辑产出「候选条目列表」，
 * 宿主负责去重、限流、创建 Job、调度。
 *
 * 目录：storage/plugins/schedule/<dir>/plugin.json + entry
 * 上传 zip 安装，与 Source/ASR/TTS 同一套包管理。
 */
import type {
  PluginConfigField,
  PluginConfigFieldStatus,
  PluginConfigMap,
  PluginConfigValue,
  PluginOrigin,
  PluginPermission,
  PluginRiskLevel,
} from '../../../plugin-kit/index.js';
import type { ScheduleItemCandidate } from '../types.js';

export type SchedulePluginRiskLevel = PluginRiskLevel;
export type SchedulePluginOrigin = PluginOrigin;
export type SchedulePluginPermission = PluginPermission;
export type SchedulePluginConfigField = PluginConfigField;
export type SchedulePluginConfigFieldStatus = PluginConfigFieldStatus;
export type SchedulePluginConfigMap = PluginConfigMap;
export type SchedulePluginConfigValue = PluginConfigValue;

/** 能力标签：便于 UI 过滤与文档 */
export type SchedulePluginCapability =
  | 'poll' // 通用轮询
  | 'rss' // RSS/Atom
  | 'list' // 榜单/列表页
  | 'api'; // 远程 API

export interface SchedulePluginManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  apiVersion: number;
  description?: string;
  riskLevel?: SchedulePluginRiskLevel;
  defaultEnabled?: boolean;
  permissions?: SchedulePluginPermission[];
  configSchema?: SchedulePluginConfigField[];
  capabilities?: SchedulePluginCapability[];
}

/** 宿主注入的运行上下文 */
export interface SchedulePluginContext {
  /** 当前订阅 id */
  scheduleId: string;
  /** 订阅名称 */
  scheduleName: string;
  /** 存储根目录 */
  storageDir: string;
  /** 插件目录（external 才有） */
  pluginDir?: string;
  /** 可中断信号 */
  signal?: AbortSignal;
  /** 用户在后台保存的配置（明文） */
  config: SchedulePluginConfigMap;
  getConfig(key: string): SchedulePluginConfigValue | undefined;
  /**
   * 可选：安全出站 GET（已做 SSRF 校验与重定向限制）
   * 插件应优先用它，而不是裸 fetch 打内网。
   */
  safeFetch(
    url: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<Response>;
}

/**
 * 拉取参数：来自订阅的 sourceConfig.params + 内置字段
 * 插件可声明 configSchema；订阅级参数也可覆盖。
 */
export interface SchedulePluginFetchInput {
  /** 订阅级自由参数（JSON 对象，插件自行解释） */
  params: Record<string, unknown>;
  /** 每轮建议上限（宿主 limits.maxItemsPerRun），插件可参考但不必强制截断 */
  maxItems: number;
  /** 时区提示 */
  timezone: string;
}

export interface SchedulePluginFetchResult {
  items: ScheduleItemCandidate[];
  /** 可选调试信息 */
  strategy?: string;
  rawMeta?: Record<string, unknown>;
}

export interface SchedulePlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly riskLevel: SchedulePluginRiskLevel;
  readonly capabilities: readonly SchedulePluginCapability[];
  readonly defaultEnabled: boolean;
  readonly configSchema?: readonly SchedulePluginConfigField[];

  /** 依赖 / 配置是否就绪 */
  isAvailable(ctx?: Pick<SchedulePluginContext, 'config' | 'getConfig'>): boolean;

  /**
   * 是否能处理当前订阅参数。
   * 订阅指定 pluginId 时仍会调用，返回 false 则本轮失败。
   */
  canHandle(input: SchedulePluginFetchInput, ctx: SchedulePluginContext): boolean;

  /** 拉取候选条目（不要自己创建 Job） */
  fetch(
    input: SchedulePluginFetchInput,
    ctx: SchedulePluginContext,
  ): Promise<SchedulePluginFetchResult>;
}

export interface SchedulePluginRegistration {
  id: string;
  plugin?: SchedulePlugin;
  origin: SchedulePluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: SchedulePluginPermission[];
  apiVersion?: number;
  configSchema?: SchedulePluginConfigField[];
  loadError?: string;
  manifestSnapshot?: SchedulePluginManifest;
  loadedAt: string;
}

export interface SchedulePluginDescriptor {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: SchedulePluginRiskLevel;
  capabilities: SchedulePluginCapability[];
  defaultEnabled: boolean;
  enabled: boolean;
  available: boolean;
  origin: SchedulePluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: SchedulePluginPermission[];
  apiVersion?: number;
  loadError?: string;
  configSchema?: SchedulePluginConfigField[];
  configValues?: Record<string, SchedulePluginConfigValue | ''>;
  configStatus?: Record<string, SchedulePluginConfigFieldStatus>;
  configReady?: boolean;
}
