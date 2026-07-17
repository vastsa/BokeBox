/**
 * Source 插件抽象（内容获取层）
 *
 * 核心流水线只消费 SourceArtifact，不关心具体平台/抓取实现。
 * 高风险获取（yt-dlp / Firecrawl 等）应作为可选插件注册，默认不启用。
 */
import type { SourceKind } from '../types/job.js';

/** 插件风险等级：用于 UI 提示与默认启用策略 */
export type SourceRiskLevel = 'low' | 'medium' | 'high';

/** 插件能力标签 */
export type SourceCapability = 'url' | 'file' | 'webpage' | 'media';

/** 插件来源：内置代码 vs 本地目录外部插件 */
export type SourcePluginOrigin = 'builtin' | 'external';

/** 插件声明的权限（宿主可展示；当前阶段仅作声明与校验清单） */
export type SourcePluginPermission =
  | 'network'
  | 'fs:job-dir'
  | 'process:spawn'
  | 'config'
  | 'cookies';

/** 插件配置字段类型（后台表单渲染） */
export type SourcePluginConfigFieldType =
  | 'string'
  | 'password'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea';

export type SourcePluginConfigValue = string | number | boolean;

export type SourcePluginConfigMap = Record<string, SourcePluginConfigValue>;

/** 插件声明的配置项（plugin.json 或运行时对象） */
export interface SourcePluginConfigField {
  key: string;
  label: string;
  type: SourcePluginConfigFieldType;
  description?: string;
  required?: boolean;
  placeholder?: string;
  default?: SourcePluginConfigValue;
  /** select 选项 */
  options?: Array<{ value: string; label: string }>;
  /**
   * 是否敏感字段。
   * password 默认 true；其它默认 false。
   * 敏感值不会回传前端明文，仅返回 set/hint。
   */
  secret?: boolean;
}

/** 前端展示用：敏感字段状态 */
export interface SourcePluginConfigFieldStatus {
  set: boolean;
  /** 脱敏提示，如 ••••ab12 */
  hint?: string;
}

/** 统一输入：当前阶段以 URL 为主，预留 file 扩展 */
export type SourceInput =
  | {
      type: 'url';
      url: string;
      jobId: string;
      /** 指定插件 id；缺省则自动匹配 */
      pluginId?: string;
    }
  | {
      type: 'file';
      filePath: string;
      jobId: string;
      filename?: string;
      mimeType?: string;
      pluginId?: string;
    };

/**
 * 统一产出：pipeline / job 只依赖此结构。
 * 与历史 ImportResult 字段对齐，便于渐进迁移。
 */
export interface SourceArtifact {
  kind: SourceKind;
  /** 落盘后的本地源文件路径（媒体或清洗后的文本） */
  localPath: string;
  mimeType: string;
  size: number;
  filename: string;
  /** 文本类正文（可选，文本任务可直接进 ASR 跳过路径） */
  textContent?: string;
  /** 建议任务标题 */
  title?: string;
  /** 最终来源 URL（重定向后） */
  sourceUrl?: string;
  /** 产出该 artifact 的插件 id */
  pluginId: string;
  /** 插件内部策略标记，仅调试用 */
  strategy?: string;
  rawMeta?: Record<string, unknown>;
}

export interface SourceProbe {
  /** 插件是否声明可处理 */
  handled: boolean;
  /** 可选：探测到的标题/类型提示 */
  title?: string;
  kindHint?: SourceKind;
  message?: string;
}

export interface SourcePluginContext {
  jobId: string;
  /** 当前任务工作目录（storage/jobs/{jobId}），供外部插件落盘 */
  jobDir: string;
  /** 统一存储根（storage/） */
  storageDir: string;
  /** 任务工作目录等扩展位 */
  signal?: AbortSignal;
  /**
   * 当前插件在后台保存的配置（明文）。
   * 仅宿主注入；外部插件通过 getConfig / config 读取。
   */
  config: SourcePluginConfigMap;
  /** 读取单项配置；缺省返回 undefined */
  getConfig(key: string): SourcePluginConfigValue | undefined;
}

export interface SourcePlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly riskLevel: SourceRiskLevel;
  readonly capabilities: readonly SourceCapability[];
  /**
   * 默认是否启用。
   * 高风险插件必须为 false，需用户显式开启。
   */
  readonly defaultEnabled: boolean;
  /**
   * 可选：插件配置字段声明。
   * 也可在 plugin.json 的 configSchema 声明；加载时合并（运行时优先）。
   */
  readonly configSchema?: readonly SourcePluginConfigField[];
  /** 当前进程内是否可用（依赖/配置是否就绪） */
  isAvailable(): boolean;
  /** 是否声明可处理该输入（快速匹配，不做重 IO） */
  canHandle(input: SourceInput): boolean;
  /** 可选：轻量探测（不落盘） */
  probe?(input: SourceInput, ctx: SourcePluginContext): Promise<SourceProbe>;
  /** 拉取并规范化为 SourceArtifact */
  fetch(input: SourceInput, ctx: SourcePluginContext): Promise<SourceArtifact>;
}

/** plugin.json 清单（外部插件必填） */
export interface SourcePluginManifest {
  id: string;
  name: string;
  version: string;
  /** 相对插件目录的入口文件，如 index.js */
  entry: string;
  /** 宿主 API 版本，当前为 1 */
  apiVersion: number;
  description?: string;
  riskLevel?: SourceRiskLevel;
  capabilities?: SourceCapability[];
  defaultEnabled?: boolean;
  permissions?: SourcePluginPermission[];
  /** 后台可编辑配置项 */
  configSchema?: SourcePluginConfigField[];
}

export interface SourcePluginDescriptor {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: SourceRiskLevel;
  capabilities: SourceCapability[];
  defaultEnabled: boolean;
  /** 配置层是否启用（未配置时回落 defaultEnabled） */
  enabled: boolean;
  available: boolean;
  origin: SourcePluginOrigin;
  /** 外部插件目录名 */
  dirName?: string;
  /** 外部插件绝对路径 */
  dirPath?: string;
  permissions?: SourcePluginPermission[];
  apiVersion?: number;
  /** 加载失败原因（仍会出现在列表中便于排查） */
  loadError?: string;
  /** 配置字段声明（无则后台不展示配置区） */
  configSchema?: SourcePluginConfigField[];
  /**
   * 非敏感配置的当前值；敏感字段固定为空字符串。
   * 敏感字段请看 configStatus。
   */
  configValues?: Record<string, SourcePluginConfigValue | ''>;
  /** 每个字段是否已设置（敏感字段用 hint 提示） */
  configStatus?: Record<string, SourcePluginConfigFieldStatus>;
  /** 必填配置是否齐全 */
  configReady?: boolean;
}

/** 注册表内部元数据 */
export interface SourcePluginRegistration {
  plugin?: SourcePlugin;
  origin: SourcePluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: SourcePluginPermission[];
  apiVersion?: number;
  loadError?: string;
  /** 归一化后的配置 schema（清单 + 运行时合并） */
  configSchema?: SourcePluginConfigField[];
  /** 加载失败时用于展示的清单快照 */
  manifestSnapshot?: Partial<SourcePluginManifest>;
  loadedAt?: string;
}
