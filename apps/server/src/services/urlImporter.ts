import fs from 'node:fs/promises';
import path from 'node:path';
import { jobPaths } from '../utils/paths.js';
import { ensureDir, writeText } from '../utils/fs.js';
import type { SourceKind } from '../types/job.js';

const MAX_BYTES = 500 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;

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
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function filenameFromUrl(url: string, contentDisposition?: string | null): string {
  if (contentDisposition) {
    const m =
      /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
        contentDisposition,
      );
    const name = decodeURIComponent((m?.[1] || m?.[2] || m?.[3] || '').trim());
    if (name) return name.replace(/[\\/:*?"<>|]+/g, '_');
  }
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    if (base && base !== '/' && base !== '.') {
      return decodeURIComponent(base).replace(/[\\/:*?"<>|]+/g, '_');
    }
  } catch {
    // ignore
  }
  return 'remote-content';
}

function extOf(name: string): string {
  return path.extname(name).toLowerCase();
}

function kindFromMime(mime: string): SourceKind | null {
  const m = mime.toLowerCase().split(';')[0].trim();
  if (!m || m === 'application/octet-stream') return null;
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'application/xhtml+xml' ||
    m.includes('html')
  ) {
    return 'text';
  }
  return null;
}

function kindFromExt(ext: string): SourceKind | null {
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (TEXT_EXT.has(ext)) return 'text';
  return null;
}

function kindFromMagic(buf: Buffer): SourceKind | null {
  if (buf.length < 12) return null;
  // ISO BMFF (mp4/m4a/mov)
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (
      brand.startsWith('m4a') ||
      brand.startsWith('mp4a') ||
      brand.includes('audio')
    ) {
      return 'audio';
    }
    return 'video';
  }
  // RIFF
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') {
    const form = buf.slice(8, 12).toString('ascii');
    if (form === 'WAVE') return 'audio';
    if (form === 'AVI ') return 'video';
  }
  // ID3 / mp3 frame
  if (
    buf.slice(0, 3).toString('ascii') === 'ID3' ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return 'audio';
  }
  // Ogg
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return 'audio';
  // FLAC
  if (buf.slice(0, 4).toString('ascii') === 'fLaC') return 'audio';
  // WebM/MKV
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video';
  }
  // PDF etc not supported
  // UTF text heuristic
  const sample = buf.slice(0, Math.min(buf.length, 2048));
  let weird = 0;
  for (const b of sample) {
    if (b === 0) return null; // binary
    if (b < 7 || (b > 14 && b < 32 && b !== 9 && b !== 10 && b !== 13)) weird++;
  }
  if (weird / sample.length < 0.05) return 'text';
  return null;
}

function defaultExt(kind: SourceKind, mime: string): string {
  if (kind === 'video') {
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('quicktime')) return '.mov';
    return '.mp4';
  }
  if (kind === 'audio') {
    if (mime.includes('wav')) return '.wav';
    if (mime.includes('ogg')) return '.ogg';
    if (mime.includes('flac')) return '.flac';
    if (mime.includes('aac') || mime.includes('mp4')) return '.m4a';
    return '.mp3';
  }
  if (mime.includes('html')) return '.html';
  if (mime.includes('json')) return '.json';
  if (mime.includes('markdown')) return '.md';
  return '.txt';
}

function mimeFor(kind: SourceKind, ext: string, headerMime: string): string {
  const h = headerMime.toLowerCase().split(';')[0].trim();
  if (h && h !== 'application/octet-stream') return h;
  if (kind === 'video') return 'video/mp4';
  if (kind === 'audio') {
    if (ext === '.wav') return 'audio/wav';
    if (ext === '.m4a') return 'audio/mp4';
    return 'audio/mpeg';
  }
  if (ext === '.html' || ext === '.htm') return 'text/html';
  if (ext === '.json') return 'application/json';
  if (ext === '.md') return 'text/markdown';
  return 'text/plain';
}

/** 粗粒度提取可读正文：去脚本/样式/标签 */
export function extractReadableText(raw: string, mimeOrExt: string): string {
  const lower = mimeOrExt.toLowerCase();
  let text = raw;
  if (lower.includes('html') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  if (lower.includes('json') || lower.endsWith('.json')) {
    try {
      text = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // keep raw
    }
  }
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 从远程 URL 下载内容，识别 video / audio / text，并落盘到任务目录。
 */
export async function importUrlContent(
  url: string,
  jobId: string,
): Promise<ImportResult> {
  if (!isValidHttpUrl(url)) {
    throw new Error('请输入有效的 http/https 链接');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.trim(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'PersonBokeBot/1.0 (+local; url-import; compatible; Mozilla/5.0)',
        Accept: '*/*',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) throw new Error('下载超时（超过 120 秒）');
    throw new Error(`下载失败: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`下载失败 HTTP ${res.status}`);
  }

  const headerMime = (res.headers.get('content-type') || '').toLowerCase();
  const lenHeader = res.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    throw new Error('远程文件过大，最大 500MB');
  }

  const filenameGuess = filenameFromUrl(url, res.headers.get('content-disposition'));
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) {
    throw new Error('远程文件过大，最大 500MB');
  }
  if (!body.length) {
    throw new Error('远程内容为空');
  }

  const extGuess = extOf(filenameGuess);
  const kind =
    kindFromMime(headerMime) ||
    kindFromExt(extGuess) ||
    kindFromMagic(body) ||
    null;

  if (!kind) {
    throw new Error(
      '无法识别内容类型（仅支持视频 / 音频 / 文本）。请检查链接是否为可直接下载的资源。',
    );
  }

  const ext = extGuess || defaultExt(kind, headerMime);
  const safeBase =
    path.basename(filenameGuess, extOf(filenameGuess)).replace(/[^\w.\u4e00-\u9fa5-]+/g, '_') ||
    'remote';
  const filename = `${safeBase}${ext}`;
  const mimeType = mimeFor(kind, ext, headerMime);

  const paths = jobPaths(jobId);
  await ensureDir(paths.dir);

  if (kind === 'text') {
    const rawText = body.toString('utf8');
    const textContent = extractReadableText(rawText, mimeType || ext);
    if (!textContent || textContent.length < 20) {
      throw new Error('文本内容过短或无法提取有效正文');
    }
    const sourcePath = paths.source('.txt');
    await writeText(sourcePath, textContent);
    // 同步一份 transcript 便于排查
    await writeText(paths.transcript, textContent);
    const stat = await fs.stat(sourcePath);
    return {
      kind,
      sourcePath,
      mimeType: 'text/plain',
      size: stat.size,
      filename: filename.endsWith('.txt') ? filename : `${safeBase}.txt`,
      textContent,
    };
  }

  // video / audio：按扩展名落盘
  const sourcePath = paths.source(ext);
  await fs.writeFile(sourcePath, body);
  const stat = await fs.stat(sourcePath);

  return {
    kind,
    sourcePath,
    mimeType,
    size: stat.size,
    filename,
  };
}

