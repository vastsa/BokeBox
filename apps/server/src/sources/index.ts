/**
 * Source 插件层公开入口
 *
 * 使用方式：
 * - pipeline: importSource({ type:'url', url, jobId })
 * - 扩展: 将插件放入 storage/plugins/source/<dir>/ 后 rescan
 * - 热切换: setSourcePluginEnabled(id, true/false)
 */
export type {
  SourceArtifact,
  SourceCapability,
  SourceInput,
  SourcePlugin,
  SourcePluginContext,
  SourcePluginDescriptor,
  SourcePluginManifest,
  SourcePluginOrigin,
  SourcePluginPermission,
  SourcePluginRegistration,
  SourceProbe,
  SourceRiskLevel,
} from './types.js';

export {
  registerSourcePlugin,
  registerSourcePluginFailure,
  unregisterSourcePlugin,
  unregisterExternalSourcePlugins,
  getSourcePlugin,
  getSourcePluginRegistration,
  listSourcePlugins,
  listSourcePluginRegistrations,
  listEnabledSourcePlugins,
  listSourcePluginDescriptors,
  isSourcePluginEnabled,
  setSourcePluginEnabled,
  resetSourcePluginEnabled,
  resolveSourcePlugin,
  toSourcePluginDescriptor,
} from './registry.js';

export {
  ensureBuiltinSourcePlugins,
  importSource,
  probeSource,
  refreshExternalSourcePlugins,
  listSourcePluginsPublic,
  sourcePluginHost,
  createSourceContext,
} from './host.js';

export {
  scanAndLoadExternalSourcePlugins,
  type SourcePluginScanResult,
} from './loader.js';

export {
  DIRECT_HTTP_PLUGIN_ID,
  directHttpSourcePlugin,
} from './plugins/directHttp.js';
