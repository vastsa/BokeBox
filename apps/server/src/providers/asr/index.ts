/**
 * ASR 插件层公开入口
 *
 * - 扩展: 将插件放入 storage/plugins/asr/<dir>/ 后 rescan
 * - 热切换: setAsrPluginEnabled / 设置 asrProvider
 * - 兼容旧 API: registerAsrProvider / resolveAsrProvider
 */
export type {
  AsrPlugin,
  AsrProvider,
  AsrPluginContext,
  AsrPluginDescriptor,
  AsrPluginManifest,
  AsrPluginRegistration,
  AsrTranscribeInput,
  AsrTranscribeResult,
} from './types.js';

export {
  registerAsrPlugin,
  registerAsrProvider,
  registerAsrPluginFailure,
  unregisterAsrPlugin,
  unregisterExternalAsrPlugins,
  getAsrPlugin,
  getAsrProviderById,
  getAsrPluginRegistration,
  listAsrPlugins,
  listAsrProviders,
  listAsrPluginRegistrations,
  listAsrPluginDescriptors,
  listAsrProviderDescriptors,
  isAsrPluginEnabled,
  setAsrPluginEnabled,
  resetAsrPluginEnabled,
  resolveAsrPlugin,
  resolveAsrProvider,
  toAsrPluginDescriptor,
} from './registry.js';

export {
  ensureBuiltinAsrPlugins,
  refreshExternalAsrPlugins,
  listAsrPluginsPublic,
  createAsrContext,
  updateAsrPluginConfigForId,
  resetAsrPluginConfigForId,
  assertAsrPluginConfigReady,
} from './host.js';

export {
  scanAndLoadExternalAsrPlugins,
  type AsrPluginScanResult,
} from './loader.js';

export { toAsrDescriptor } from './types.js';
