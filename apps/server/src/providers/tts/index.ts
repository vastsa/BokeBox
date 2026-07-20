/**
 * TTS 插件层公开入口
 *
 * - 扩展: 将插件放入 storage/plugins/tts/<dir>/ 后 rescan
 * - 热切换: setTtsPluginEnabled / 设置 ttsProvider
 * - 兼容旧 API: registerTtsProvider / resolveTtsProvider
 */
export type {
  TtsPlugin,
  TtsProvider,
  TtsPluginContext,
  TtsPluginDescriptor,
  TtsPluginManifest,
  TtsPluginRegistration,
  TtsProviderMeta,
  TtsChunkInput,
  TtsChunkResult,
  TtsVoiceMeta,
  TtsModeMeta,
  TtsAudioFormat,
} from './types.js';

export {
  registerTtsPlugin,
  registerTtsProvider,
  registerTtsPluginFailure,
  unregisterTtsPlugin,
  unregisterExternalTtsPlugins,
  getTtsPlugin,
  getTtsProviderById,
  getTtsPluginRegistration,
  listTtsPlugins,
  listTtsProviders,
  listTtsPluginRegistrations,
  listTtsPluginDescriptors,
  listTtsProviderDescriptors,
  isTtsPluginEnabled,
  setTtsPluginEnabled,
  resetTtsPluginEnabled,
  resolveTtsPlugin,
  resolveTtsProvider,
  toTtsPluginDescriptor,
} from './registry.js';

export {
  ensureBuiltinTtsPlugins,
  refreshExternalTtsPlugins,
  listTtsPluginsPublic,
  createTtsContext,
  updateTtsPluginConfigForId,
  resetTtsPluginConfigForId,
  assertTtsPluginConfigReady,
} from './host.js';

export {
  scanAndLoadExternalTtsPlugins,
  type TtsPluginScanResult,
} from './loader.js';

export { toTtsDescriptor } from './types.js';

export {
  MIMO_PRESET_VOICES,
  MIMO_SPEECH_STYLE_TAGS,
  MIMO_AUDIO_TAG_EXAMPLES,
  applyAssistantStyleTags,
  resolveMimoPresetVoice,
} from './mimoTts.js';
export { OPENAI_PRESET_VOICES } from './openaiTts.js';
export { EDGE_PRESET_VOICES, resolveEdgeVoice } from './edgeTts.js';
export {
  splitScript,
  splitScriptWithRanges,
  mergeWavBuffers,
  wavDurationSec,
  detectAudioFormat,
} from './audioUtils.js';
export type { ScriptChunk } from './audioUtils.js';

export { resolveVoicePanel, compileVoicePanelFromUi } from './voicePanel.js';
