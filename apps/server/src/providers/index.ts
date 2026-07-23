/**
 * AI 能力插件入口（ASR / TTS）
 *
 * 与 Source 插件同一套机制：
 * - 内置插件代码注册
 * - 外部插件：storage/plugins/{asr|tts}/<dir>/plugin.json + entry
 * - 启停 / 配置 / rescan 热加载
 * - 设置页 asrProvider / ttsProvider 选择激活插件
 */
export {
  registerAsrPlugin,
  registerAsrProvider,
  listAsrPlugins,
  listAsrProviders,
  listAsrPluginDescriptors,
  listAsrProviderDescriptors,
  listAsrPluginsPublic,
  getAsrPlugin,
  getAsrProviderById,
  resolveAsrPlugin,
  resolveAsrProvider,
  refreshExternalAsrPlugins,
  ensureBuiltinAsrPlugins,
  isAsrPluginEnabled,
  setAsrPluginEnabled,
  resetAsrPluginEnabled,
  createAsrContext,
  updateAsrPluginConfigForId,
  resetAsrPluginConfigForId,
  assertAsrPluginConfigReady,
} from './asr/index.js';
export type {
  AsrPlugin,
  AsrProvider,
  AsrPluginContext,
  AsrPluginDescriptor,
  AsrTranscribeInput,
  AsrTranscribeResult,
} from './asr/index.js';

export {
  registerTtsPlugin,
  registerTtsProvider,
  listTtsPlugins,
  listTtsProviders,
  listTtsPluginDescriptors,
  listTtsProviderDescriptors,
  listTtsPluginsPublic,
  getTtsPlugin,
  getTtsProviderById,
  resolveTtsPlugin,
  resolveTtsProvider,
  refreshExternalTtsPlugins,
  ensureBuiltinTtsPlugins,
  isTtsPluginEnabled,
  setTtsPluginEnabled,
  resetTtsPluginEnabled,
  createTtsContext,
  updateTtsPluginConfigForId,
  resetTtsPluginConfigForId,
  assertTtsPluginConfigReady,
  MIMO_PRESET_VOICES,
  MIMO_SPEECH_STYLE_TAGS,
  MIMO_AUDIO_TAG_EXAMPLES,
  OPENAI_PRESET_VOICES,
  EDGE_PRESET_VOICES,
  applyAssistantStyleTags,
  planSentenceStyleTags,
  applyPlannedStyleToSentence,
  resolveMimoPresetVoice,
  resolveEdgeVoice,
  splitScript,
  splitScriptWithRanges,
  mergeWavBuffers,
  mergeWavBuffersWithGaps,
  resolveSentenceGapSec,
  createSilentWav,
  readWavPcmFormat,
  wavDurationSec,
  detectAudioFormat,
} from './tts/index.js';
export type {
  TtsPlugin,
  TtsProvider,
  TtsPluginContext,
  TtsPluginDescriptor,
  TtsProviderMeta,
  TtsChunkInput,
  TtsChunkResult,
  TtsVoiceMeta,
  TtsModeMeta,
} from './tts/index.js';

export type { ProviderDescriptor, ProviderId } from './types.js';
