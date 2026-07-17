/**
 * Source 插件层公开入口
 *
 * 使用方式：
 * - pipeline: importSource({ type:'url', url, jobId })
 * - 扩展: registerSourcePlugin(myPlugin)
 * - 热切换: setSourcePluginEnabled(id, true/false)
 */
export type {
  SourceArtifact,
  SourceCapability,
  SourceInput,
  SourcePlugin,
  SourcePluginContext,
  SourcePluginDescriptor,
  SourceProbe,
  SourceRiskLevel,
} from './types.js';

export {
  registerSourcePlugin,
  unregisterSourcePlugin,
  getSourcePlugin,
  listSourcePlugins,
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
  sourcePluginHost,
  createSourceContext,
} from './host.js';

export {
  DIRECT_HTTP_PLUGIN_ID,
  directHttpSourcePlugin,
} from './plugins/directHttp.js';
