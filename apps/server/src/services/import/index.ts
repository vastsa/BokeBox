/**
 * URL / 本地素材导入子域
 */
export {
  VIDEO_EXT,
  AUDIO_EXT,
  TEXT_EXT,
  ALLOWED_MEDIA_EXT,
  detectSourceKind,
  kindLabel,
  isValidHttpUrl,
  isPlaceholderTitle,
  type ImportResult,
} from './kinds.js';

export {
  extractPageTitle,
  extractArticleContent,
  extractReadableText,
  detectAntiBot,
  importUrlContent,
} from './urlImporter.js';
