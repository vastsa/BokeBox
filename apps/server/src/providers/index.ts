/**
 * AI 能力提供方（ASR / TTS）热插拔入口
 *
 * 扩展新源：
 * 1. 实现 AsrProvider / TtsProvider
 * 2. registerAsrProvider / registerTtsProvider
 * 3. 设置页选择 asrProvider / ttsProvider 即可切换（无需重启）
 */
export {
  registerAsrProvider,
  listAsrProviders,
  listAsrProviderDescriptors,
  getAsrProviderById,
  resolveAsrProvider,
} from './asr/index.js';
export type {
  AsrProvider,
  AsrTranscribeInput,
  AsrTranscribeResult,
} from './asr/index.js';

export {
  registerTtsProvider,
  listTtsProviders,
  listTtsProviderDescriptors,
  getTtsProviderById,
  resolveTtsProvider,
  MIMO_PRESET_VOICES,
  MIMO_SPEECH_STYLE_TAGS,
  MIMO_AUDIO_TAG_EXAMPLES,
  OPENAI_PRESET_VOICES,
  applyAssistantStyleTags,
  resolveMimoPresetVoice,
  splitScript,
  mergeWavBuffers,
  wavDurationSec,
  detectAudioFormat,
} from './tts/index.js';
export type {
  TtsProvider,
  TtsProviderMeta,
  TtsChunkInput,
  TtsChunkResult,
  TtsVoiceMeta,
  TtsModeMeta,
} from './tts/index.js';

export type { ProviderDescriptor, ProviderId } from './types.js';
