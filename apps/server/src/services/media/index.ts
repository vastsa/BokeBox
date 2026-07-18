/**
 * 媒体处理子域导航出口
 */
export {
  extractAudio,
  generateSilentMp3,
  convertToMp3,
  type ExtractedAudio,
} from '../audioExtractor.js';
export {
  synthesizePodcastAudio,
  getActiveTtsUiMeta,
  TTS_MODE_META,
  PRESET_VOICES,
  SPEECH_STYLE_TAG_PRESETS,
  AUDIO_TAG_EXAMPLES,
  resolvePresetVoice,
} from '../ttsSynthesizer.js';
export {
  COVER_PROMPT_VARIABLES,
  DEFAULT_COVER_PROMPT_TEMPLATE,
  findCoverFile,
  findAlbumCoverFile,
  maybeGeneratePodcastCover,
  maybeGenerateAlbumCover,
  generatePodcastCover,
  generateAlbumCover,
} from '../coverGenerator.js';
export {
  parseCoverImageSize,
  resolveCoverDelivery,
} from '../imageOptimize.js';
export { transcribeAudio } from '../transcriber.js';
