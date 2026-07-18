/**
 * 通用插件基础设施（Source/ASR/TTS 共用能力）
 */
export type {
  PluginConfigField,
  PluginConfigFieldStatus,
  PluginConfigFieldType,
  PluginConfigMap,
  PluginConfigValue,
  PluginDescriptorBase,
  PluginManifestBase,
  PluginOrigin,
  PluginPermission,
  PluginRiskLevel,
  PluginScanResult,
} from './types.js';
export { PLUGIN_API_VERSION } from './types.js';

export {
  getPluginEnabledOverride,
  setPluginEnabledOverride,
  listPluginEnabledOverrides,
  getPluginConfigMap,
  setPluginConfigMap,
  getPluginConfig,
  setPluginConfig,
  resetPluginConfig,
} from './persist.js';

export {
  normalizeConfigSchema,
  mergeConfigSchema,
  isPluginConfigReady,
  resolveRuntimeConfig,
  toPublicPluginConfig,
  updatePluginConfig,
  resetPluginConfigStore,
  createConfigAccessor,
  isSecretField,
} from './config.js';

export {
  isRiskLevel,
  isPermission,
  normalizeManifestBase,
  readPluginJson,
  importPluginEntry,
  resolvePluginExportValue,
  listPluginDirs,
} from './loaderShared.js';
