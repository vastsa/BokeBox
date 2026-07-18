/**
 * 通用插件契约（Source / ASR / TTS 共用）
 */

/** 插件风险等级：用于 UI 提示与默认启用策略 */
export type PluginRiskLevel = 'low' | 'medium' | 'high';

/** 插件来源：内置代码 vs 本地目录外部插件 */
export type PluginOrigin = 'builtin' | 'external';

/** 插件声明的权限（宿主可展示；当前阶段主要作声明） */
export type PluginPermission =
  | 'network'
  | 'fs:job-dir'
  | 'process:spawn'
  | 'config'
  | 'cookies';

/** 插件配置字段类型（后台表单渲染） */
export type PluginConfigFieldType =
  | 'string'
  | 'password'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea';

export type PluginConfigValue = string | number | boolean;
export type PluginConfigMap = Record<string, PluginConfigValue>;

/** 插件声明的配置项（plugin.json 或运行时对象） */
export interface PluginConfigField {
  key: string;
  label: string;
  type: PluginConfigFieldType;
  description?: string;
  required?: boolean;
  placeholder?: string;
  default?: PluginConfigValue;
  options?: Array<{ value: string; label: string }>;
  /**
   * 是否敏感字段。
   * password 默认 true；其它默认 false。
   */
  secret?: boolean;
}

/** 前端展示用：敏感字段状态 */
export interface PluginConfigFieldStatus {
  set: boolean;
  hint?: string;
}

/** 通用 plugin.json 清单字段（kind 专属字段由各 loader 扩展） */
export interface PluginManifestBase {
  id: string;
  name: string;
  version: string;
  /** 相对插件目录的入口文件 */
  entry: string;
  apiVersion: number;
  description?: string;
  riskLevel?: PluginRiskLevel;
  defaultEnabled?: boolean;
  permissions?: PluginPermission[];
  configSchema?: PluginConfigField[];
}

/** 列表 API 通用描述（kind 可附加字段） */
export interface PluginDescriptorBase {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: PluginRiskLevel;
  defaultEnabled: boolean;
  enabled: boolean;
  available: boolean;
  origin: PluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: PluginPermission[];
  apiVersion?: number;
  loadError?: string;
  configSchema?: PluginConfigField[];
  configValues?: Record<string, PluginConfigValue | ''>;
  configStatus?: Record<string, PluginConfigFieldStatus>;
  configReady?: boolean;
}

export interface PluginScanResult {
  pluginsDir: string;
  loaded: string[];
  failed: Array<{ id: string; dirName: string; error: string }>;
  removed: string[];
}

export const PLUGIN_API_VERSION = 1;
