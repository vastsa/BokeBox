/**
 * 响应 MIME / 扩展名 / 魔数识别素材类型
 */
import type { SourceKind } from '../../types/job.js';
import { AUDIO_EXT, TEXT_EXT, VIDEO_EXT } from './kinds.js';

// ── 类型识别 ────────────────────────────────────────────────

export function kindFromMime(mime: string): SourceKind | null {
  const m = mime.toLowerCase().split(';')[0].trim();
  if (!m || m === 'application/octet-stream') return null;
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'application/xhtml+xml' ||
    m.includes('html') ||
    m.includes('markdown')
  ) {
    return 'text';
  }
  return null;
}

export function kindFromExt(ext: string): SourceKind | null {
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (TEXT_EXT.has(ext)) return 'text';
  return null;
}

export function kindFromMagic(buf: Buffer): SourceKind | null {
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

export function defaultExt(kind: SourceKind, mime: string): string {
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

export function mimeFor(kind: SourceKind, ext: string, headerMime: string): string {
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

