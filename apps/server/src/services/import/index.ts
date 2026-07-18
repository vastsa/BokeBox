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
  extractPageTitle,
  extractArticleContent,
  extractReadableText,
  detectAntiBot,
  importUrlContent,
  type ImportResult,
} from './urlImporter.js';
