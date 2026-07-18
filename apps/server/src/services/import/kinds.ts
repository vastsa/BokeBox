/**
 * URL 导入：素材类型识别与轻量校验（纯函数）
 */
import type { SourceKind } from '../../types/job.js';
import { isSafeHttpUrl } from '../../utils/ssrf.js';

export const VIDEO_EXT = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.ts',
  '.flv',
]);
export const AUDIO_EXT = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.aac',
  '.ogg',
  '.flac',
  '.opus',
  '.wma',
  '.aiff',
]);
export const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.json',
  '.csv',
  '.xml',
  '.log',
  '.srt',
  '.vtt',
]);

/** 本地/远程均允许的扩展名 */
export const ALLOWED_MEDIA_EXT = new Set<string>([
  ...VIDEO_EXT,
  ...AUDIO_EXT,
  ...TEXT_EXT,
]);

/**
 * 根据扩展名与 MIME 推断素材类型。
 * 优先扩展名，其次 MIME；无法判断时返回 null。
 */
export function detectSourceKind(
  filenameOrExt?: string | null,
  mimeType?: string | null,
): SourceKind | null {
  const name = String(filenameOrExt || '').trim().toLowerCase();
  const ext = name.startsWith('.')
    ? name
    : name.includes('.')
      ? `.${name.split('.').pop()}`
      : name
        ? `.${name}`
        : '';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (TEXT_EXT.has(ext)) return 'text';

  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (!mime) return null;
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/xhtml+xml' ||
    mime.includes('html') ||
    mime.includes('markdown')
  ) {
    return 'text';
  }
  return null;
}

export function kindLabel(kind: SourceKind): string {
  if (kind === 'audio') return '音频';
  if (kind === 'text') return '文本';
  return '视频';
}

export interface ImportResult {
  kind: SourceKind;
  sourcePath: string;
  mimeType: string;
  size: number;
  filename: string;
  /** 文本类内容的清洗后正文 */
  textContent?: string;
  /** 从网页/响应提取的标题（优先用于任务名） */
  title?: string;
  /** 最终落地 URL（跟随重定向后） */
  finalUrl?: string;
}

/**
 * 协议 + 同步 SSRF 粗检（字面量私网 / localhost 等）。
 * DNS 解析级校验在 importUrlContent / safeFetch 中异步完成。
 */
export function isValidHttpUrl(raw: string): boolean {
  return isSafeHttpUrl(raw);
}

/** 是否像占位任务标题（应用网页真实标题覆盖） */
export function isPlaceholderTitle(title?: string | null): boolean {
  const t = String(title || '').trim();
  if (!t) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (t === 'URL 导入') return true;
  // 创建任务时用 hostname 占位
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t) && !/\s/.test(t)) return true;
  return false;
}
