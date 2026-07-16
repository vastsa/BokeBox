import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { jobPaths } from '../utils/paths.js';
import { ensureDir, writeText } from '../utils/fs.js';
import type { SourceKind } from '../types/job.js';

const MAX_BYTES = 500 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 600;
/** 文本类抓取上限（防止超大 HTML 占满内存） */
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

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

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
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

// ── 文件名 / 扩展名 ─────────────────────────────────────────

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

function safeFilenameBase(name: string, fallback = 'remote'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/[^\w.\u4e00-\u9fa5-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

// ── 类型识别 ────────────────────────────────────────────────

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
    m.includes('html') ||
    m.includes('markdown')
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

// ── 编码 / 文本解码 ─────────────────────────────────────────

function charsetFromContentType(contentType: string): string | null {
  const m = /charset\s*=\s*["']?([^\s"';,]+)/i.exec(contentType || '');
  return m?.[1] ? normalizeCharset(m[1]) : null;
}

function charsetFromHtmlMeta(rawAscii: string): string | null {
  // <meta charset="utf-8">
  const m1 = /<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_\-]+)/i.exec(rawAscii);
  if (m1?.[1]) return normalizeCharset(m1[1]);
  // <meta http-equiv="Content-Type" content="text/html; charset=gbk">
  const m2 =
    /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([a-z0-9_\-]+)/i.exec(
      rawAscii,
    );
  if (m2?.[1]) return normalizeCharset(m2[1]);
  return null;
}

function normalizeCharset(raw: string): string {
  const c = raw.trim().toLowerCase().replace(/_/g, '-');
  if (c === 'utf8' || c === 'utf-8') return 'utf-8';
  if (c === 'gb2312' || c === 'gbk' || c === 'gb-2312') return 'gbk';
  if (c === 'gb18030' || c === 'gb-18030') return 'gb18030';
  if (c === 'big5' || c === 'big-5') return 'big5';
  if (c === 'iso-8859-1' || c === 'latin1') return 'iso-8859-1';
  return c;
}

function decodeTextBuffer(buf: Buffer, contentType: string): string {
  const candidates: string[] = [];
  const fromHeader = charsetFromContentType(contentType);
  if (fromHeader) candidates.push(fromHeader);

  // 用 latin1 窥探 meta charset（不破坏字节）
  const head = buf.slice(0, Math.min(buf.length, 8192)).toString('latin1');
  const fromMeta = charsetFromHtmlMeta(head);
  if (fromMeta && !candidates.includes(fromMeta)) candidates.push(fromMeta);

  // 常见兜底顺序
  for (const c of ['utf-8', 'gb18030', 'gbk', 'big5']) {
    if (!candidates.includes(c)) candidates.push(c);
  }

  // BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8');
  }

  for (const enc of candidates) {
    try {
      const text = new TextDecoder(enc, { fatal: false }).decode(buf);
      // 替换字符过多则换下一个编码
      const bad = (text.match(/\uFFFD/g) || []).length;
      if (bad / Math.max(text.length, 1) > 0.02) continue;
      return text;
    } catch {
      // try next
    }
  }
  return buf.toString('utf8');
}

// ── HTML 实体 / 清洗 ────────────────────────────────────────

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    mdash: '—',
    ndash: '–',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    middot: '·',
    bull: '•',
    copy: '©',
    reg: '®',
    trade: '™',
  };
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const code = parseInt(d, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => {
      const v = named[name.toLowerCase()];
      return v ?? m;
    });
}

function stripTagsToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article|blockquote|pre|figcaption)>/gi, '\n')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(
    `${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const m = re.exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : null;
}

function firstMetaContent(html: string, keys: string[]): string | null {
  const lowerKeys = keys.map((k) => k.toLowerCase());
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const prop = (
      extractAttr(tag, 'property') ||
      extractAttr(tag, 'name') ||
      extractAttr(tag, 'itemprop') ||
      ''
    ).toLowerCase();
    if (!lowerKeys.includes(prop)) continue;
    const content = extractAttr(tag, 'content');
    if (content) return decodeHtmlEntities(content).trim();
  }
  return null;
}

function extractTagText(html: string, tagName: string): string | null {
  const re = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    'i',
  );
  const m = re.exec(html);
  if (!m) return null;
  const text = collapseWhitespace(stripTagsToText(m[1]));
  return text || null;
}

/** 从 HTML 提取页面标题 */
export function extractPageTitle(html: string): string | null {
  const candidates = [
    firstMetaContent(html, ['og:title', 'twitter:title', 'title']),
    extractTagText(html, 'title'),
    extractTagText(html, 'h1'),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    let t = raw
      .replace(/\s*[|\-–—_]\s*(微信|知乎|博客|Blog|CSDN|掘金|简书|头条|百度|Google|首页).*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    // 站点名过长截断
    if (t.length > 120) t = t.slice(0, 120).trim();
    if (t.length >= 2) return t;
  }
  return null;
}

/** 常见正文容器选择器（站点适配，纯正则近似） */
const CONTENT_BLOCK_PATTERNS: RegExp[] = [
  // 微信公众号
  /<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i,
  // 语义标签
  /<article\b[^>]*>([\s\S]*?)<\/article>/i,
  /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  /<div[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
  // 常见 CMS / 中文站点
  /<div[^>]+class=["'][^"']*(?:article[-_ ]?content|post[-_ ]?content|entry[-_ ]?content|rich[-_ ]?text|markdown[-_ ]?body|article[-_ ]?body|post[-_ ]?body|content[-_ ]?body|Post-RichText|RichText|article_content|content_views)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  /<section[^>]+class=["'][^"']*(?:article|post|content)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
  /<div[^>]+id=["'](?:content|article|post|main-content|article-content|js_content)["'][^>]*>([\s\S]*?)<\/div>/i,
];

function removeNoiseBlocks(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<canvas\b[\s\S]*?<\/canvas>/gi, ' ')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<form\b[\s\S]*?<\/form>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<button\b[\s\S]*?<\/button>/gi, ' ')
    // 常见噪音 class
    .replace(
      /<(?:div|section|ul)[^>]+class=["'][^"']*(?:nav|menu|sidebar|footer|header|comment|share|related|recommend|advert|ads?|toolbar|breadcrumb|pagination)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|ul)>/gi,
      ' ',
    );
}

function scoreTextBlock(text: string): number {
  const t = text.trim();
  if (t.length < 40) return 0;
  const paras = t.split(/\n+/).filter((p) => p.trim().length > 20);
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  const links = (t.match(/https?:\/\//g) || []).length;
  // 中文文章更重 CJK；英文重字母
  let score = t.length + paras.length * 40 + cjk * 1.2 + letters * 0.3;
  // 链接过多通常是目录/导航
  score -= links * 80;
  // 过短段落堆砌降权
  if (paras.length === 0) score *= 0.4;
  return score;
}

/**
 * 从 HTML 抽取可读正文（轻量 Readability）。
 * 优先站点正文容器 → 语义块打分 → 全页降级。
 */
export function extractArticleContent(html: string): {
  title: string | null;
  text: string;
} {
  const title = extractPageTitle(html);
  const cleaned = removeNoiseBlocks(html);

  let bestText = '';
  let bestScore = 0;

  for (const re of CONTENT_BLOCK_PATTERNS) {
    const m = re.exec(cleaned);
    if (!m?.[1]) continue;
    const text = collapseWhitespace(stripTagsToText(m[1]));
    const score = scoreTextBlock(text) + 200; // 选择器命中加权
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
  }

  // 对 <p> 块聚类打分（兜底）
  if (bestScore < 200) {
    const pBlocks = cleaned.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
    if (pBlocks.length >= 2) {
      const joined = collapseWhitespace(stripTagsToText(pBlocks.join('\n')));
      const score = scoreTextBlock(joined);
      if (score > bestScore) {
        bestScore = score;
        bestText = joined;
      }
    }
  }

  // 全页降级
  if (bestScore < 80) {
    const full = collapseWhitespace(stripTagsToText(cleaned));
    if (scoreTextBlock(full) > bestScore) bestText = full;
  }

  // 标题拼到正文前，便于口播脚本感知主题
  let text = bestText;
  if (title && text && !text.startsWith(title)) {
    text = `${title}\n\n${text}`;
  }

  return { title, text: collapseWhitespace(text) };
}

/** 粗粒度提取可读正文：去脚本/样式/标签 + 文章级抽取 */
export function extractReadableText(raw: string, mimeOrExt: string): string {
  const lower = mimeOrExt.toLowerCase();
  if (lower.includes('html') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    return extractArticleContent(raw).text;
  }
  if (lower.includes('json') || lower.endsWith('.json')) {
    try {
      return collapseWhitespace(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      return collapseWhitespace(raw);
    }
  }
  if (lower.includes('xml') || lower.endsWith('.xml') || lower.endsWith('.svg')) {
    return collapseWhitespace(stripTagsToText(removeNoiseBlocks(raw)));
  }
  return collapseWhitespace(raw);
}

// ── HTTP 抓取 / 反强反爬 ───────────────────────────────────

type UaProfile = 'desktop' | 'mobile' | 'wechat';

interface FetchProfile {
  id: UaProfile;
  userAgent: string;
  secChUa?: string;
  secChUaMobile?: string;
  secChUaPlatform?: string;
}

const UA_PROFILES: FetchProfile[] = [
  {
    id: 'desktop',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
    secChUaMobile: '?0',
    secChUaPlatform: '"macOS"',
  },
  {
    id: 'mobile',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    secChUaMobile: '?1',
    secChUaPlatform: '"iOS"',
  },
  {
    id: 'wechat',
    // 微信内置浏览器 UA：对公众号等站点更友好
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49.2600(0x28003137) NetType/WIFI Language/zh_CN',
    secChUaMobile: '?1',
    secChUaPlatform: '"Android"',
  },
];

/** 简单 Cookie 罐：同源预热 + 透传 Set-Cookie */
class CookieJar {
  private jar = new Map<string, string>();

  absorb(res: Response): void {
    const anyHeaders = res.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const list =
      typeof anyHeaders.getSetCookie === 'function'
        ? anyHeaders.getSetCookie()
        : [];
    // 兼容只暴露拼接字符串的实现
    if (!list.length) {
      const single = res.headers.get('set-cookie');
      if (single) list.push(single);
    }
    for (const raw of list) {
      const part = String(raw).split(';')[0]?.trim();
      if (!part || !part.includes('=')) continue;
      const eq = part.indexOf('=');
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!name) continue;
      if (value === '' || /^(delete|deleted)$/i.test(value)) {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
  }

  header(): string | undefined {
    if (!this.jar.size) return undefined;
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function pickProfilesForUrl(url: string): FetchProfile[] {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.includes('weixin.qq.com') ||
      host.includes('qq.com') ||
      host.includes('wechat')
    ) {
      return [
        UA_PROFILES.find((p) => p.id === 'wechat')!,
        UA_PROFILES.find((p) => p.id === 'mobile')!,
        UA_PROFILES.find((p) => p.id === 'desktop')!,
      ];
    }
    if (
      host.includes('zhihu.com') ||
      host.includes('xiaohongshu') ||
      host.includes('douyin') ||
      host.includes('toutiao') ||
      host.includes('bilibili')
    ) {
      return [
        UA_PROFILES.find((p) => p.id === 'mobile')!,
        UA_PROFILES.find((p) => p.id === 'desktop')!,
        UA_PROFILES.find((p) => p.id === 'wechat')!,
      ];
    }
  } catch {
    // ignore
  }
  return [...UA_PROFILES];
}

function browserHeaders(
  url: string,
  profile: FetchProfile,
  opts: { cookie?: string; referer?: string; navigate?: boolean } = {},
): Record<string, string> {
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    // ignore
  }
  const referer = opts.referer || (origin ? `${origin}/` : '');
  const navigate = opts.navigate !== false;
  const headers: Record<string, string> = {
    'User-Agent': profile.userAgent,
    Accept: navigate
      ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      : '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  };
  if (profile.secChUa) headers['sec-ch-ua'] = profile.secChUa;
  if (profile.secChUaMobile) headers['sec-ch-ua-mobile'] = profile.secChUaMobile;
  if (profile.secChUaPlatform) {
    headers['sec-ch-ua-platform'] = profile.secChUaPlatform;
  }
  if (navigate) {
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = referer ? 'same-origin' : 'none';
    headers['Sec-Fetch-User'] = '?1';
  } else {
    headers['Sec-Fetch-Dest'] = 'empty';
    headers['Sec-Fetch-Mode'] = 'cors';
    headers['Sec-Fetch-Site'] = 'same-origin';
  }
  if (referer) headers.Referer = referer;
  if (opts.cookie) headers.Cookie = opts.cookie;
  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return defaultValue;
  if (['0', 'false', 'off', 'no'].includes(raw)) return false;
  if (['1', 'true', 'on', 'yes'].includes(raw)) return true;
  return defaultValue;
}

/** 识别反爬 / 验证页 / 空壳页 */
export function detectAntiBot(htmlOrText: string, title?: string | null): string | null {
  const sample = `${title || ''}\n${htmlOrText}`.slice(0, 12000);
  const lower = sample.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/just a moment|checking your browser|cf-browser-verification|cloudflare/i, 'Cloudflare 验证'],
    [/attention required|access denied|request blocked/i, '访问被拒绝'],
    [/captcha|recaptcha|hcaptcha|geetest|滑动验证|安全验证|人机验证|请完成验证/i, '验证码/人机验证'],
    [/请开启\s*javascript|enable javascript|noscript/i, '需 JS 渲染'],
    [/验证后继续访问|环境异常|当前环境存在风险|系统繁忙.*稍后/i, '风控拦截'],
    [/频繁访问|操作过于频繁|请求太快|rate.?limit/i, '访问频率限制'],
    [/登录后查看|请先登录|扫码登录|登录后可阅读全文|开通会员.*阅读/i, '需登录/会员'],
    [/sogou\.com\/link|anti.?spider|spider.?detect/i, '反爬虫识别'],
  ];
  for (const [re, label] of rules) {
    if (re.test(sample) || re.test(lower)) return label;
  }
  // 极短 HTML 且几乎无正文
  const textish = collapseWhitespace(stripTagsToText(removeNoiseBlocks(sample)));
  if (htmlOrText.includes('<html') && textish.length < 40) {
    return '空壳页面';
  }
  return null;
}

function isGoodArticleText(text: string): boolean {
  const t = collapseWhitespace(text);
  if (t.length < 80) return false;
  // 至少有一定信息密度
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  return cjk + letters >= 40;
}

async function rawFetch(
  url: string,
  headers: Record<string, string>,
  options: { timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) {
      throw new Error(`下载超时（超过 ${Math.round(timeoutMs / 1000)} 秒）`);
    }
    throw new Error(`下载失败: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 同源首页预热 Cookie，降低直连触发风控概率 */
async function warmUpCookies(
  url: string,
  profile: FetchProfile,
  jar: CookieJar,
): Promise<void> {
  try {
    const u = new URL(url);
    const home = `${u.origin}/`;
    if (home === url || home === `${url}/`) return;
    const res = await rawFetch(
      home,
      browserHeaders(home, profile, { cookie: jar.header(), navigate: true }),
      { timeoutMs: 20_000 },
    );
    jar.absorb(res);
    try {
      await res.arrayBuffer();
    } catch {
      // ignore
    }
    // 轻微抖动，模拟真人
    await sleep(150 + Math.floor(Math.random() * 250));
  } catch {
    // 预热失败不阻断主流程
  }
}

interface DirectPageResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  headerMime: string;
  body: Buffer;
  profileId: UaProfile;
  blockReason?: string | null;
}

async function fetchDirectOnce(
  url: string,
  profile: FetchProfile,
  opts: { warm?: boolean; timeoutMs?: number } = {},
): Promise<DirectPageResult> {
  const jar = new CookieJar();
  if (opts.warm !== false) {
    await warmUpCookies(url, profile, jar);
  }
  const res = await rawFetch(
    url,
    browserHeaders(url, profile, {
      cookie: jar.header(),
      navigate: true,
    }),
    { timeoutMs: opts.timeoutMs },
  );
  jar.absorb(res);
  const headerMime = (res.headers.get('content-type') || '').toLowerCase();
  const finalUrl = res.url || url;

  if (!res.ok) {
    // 仍读取 body，便于识别验证页
    let body: Buffer = Buffer.alloc(0);
    try {
      body = Buffer.from(await readBodyWithLimit(res, MAX_TEXT_BYTES));
    } catch {
      // ignore
    }
    const decoded = body.length ? decodeTextBuffer(body, headerMime) : '';
    const title = decoded ? extractPageTitle(decoded) : null;
    return {
      ok: false,
      status: res.status,
      finalUrl,
      headerMime,
      body,
      profileId: profile.id,
      blockReason:
        detectAntiBot(decoded, title) ||
        `HTTP ${res.status}`,
    };
  }

  const lenHeader = res.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    throw new Error(`远程文件过大，最大 ${formatMb(MAX_BYTES)}`);
  }

  const isLikelyText =
    headerMime.includes('html') ||
    headerMime.includes('text') ||
    headerMime.includes('json') ||
    headerMime.includes('xml') ||
    !headerMime ||
    headerMime.includes('octet-stream');

  const body: Buffer = Buffer.from(
    await readBodyWithLimit(res, isLikelyText ? MAX_TEXT_BYTES : MAX_BYTES),
  );
  const decodedHead = decodeTextBuffer(
    body.slice(0, Math.min(body.length, 64_000)),
    headerMime,
  );
  const title = extractPageTitle(decodedHead);
  const blockReason = detectAntiBot(decodedHead, title);

  return {
    ok: true,
    status: res.status,
    finalUrl,
    headerMime,
    body,
    profileId: profile.id,
    blockReason,
  };
}

/**
 * 直连多 UA 轮换 + Cookie 预热。
 * 返回第一个「非强拦截」响应；若全拦截则返回最后一次结果。
 */
async function fetchDirectSmart(url: string): Promise<DirectPageResult> {
  const profiles = pickProfilesForUrl(url);
  let last: DirectPageResult | null = null;
  let lastErr: Error | null = null;

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i]!;
    for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
      try {
        const result = await fetchDirectOnce(url, profile, {
          warm: attempt === 1,
        });
        last = result;

        // 明确媒体 MIME：无需正文质量判断
        const mimeKind = kindFromMime(result.headerMime);
        if (result.ok && (mimeKind === 'video' || mimeKind === 'audio')) {
          return result;
        }

        if (result.ok && !result.blockReason) {
          // 文本页再看正文是否够用
          if (mimeKind === 'text' || !mimeKind) {
            const decoded = decodeTextBuffer(result.body, result.headerMime);
            const isHtml =
              result.headerMime.includes('html') || /^\s*</.test(decoded.slice(0, 256));
            const text = isHtml
              ? extractArticleContent(decoded).text
              : extractReadableText(decoded, result.headerMime || 'text/plain');
            if (isGoodArticleText(text) || mimeKind === 'text' && text.length >= 20) {
              return result;
            }
            // 正文太差，换 UA / 策略
            result.blockReason = result.blockReason || '正文过短';
          } else {
            return result;
          }
        }

        // 404 不轮换
        if (result.status === 404) return result;

        if (
          isRetryableStatus(result.status) &&
          attempt < RETRY_MAX
        ) {
          await sleep(RETRY_BASE_MS * attempt + Math.floor(Math.random() * 200));
          continue;
        }
        // 换下一个 UA
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (attempt < RETRY_MAX) {
          await sleep(RETRY_BASE_MS * attempt);
          continue;
        }
      }
    }
    // UA 间抖动
    if (i < profiles.length - 1) {
      await sleep(200 + Math.floor(Math.random() * 300));
    }
  }

  if (last) return last;
  throw lastErr || new Error('直连抓取失败');
}

/** 兼容旧调用：增强版直连 */
async function fetchWithRetry(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Response> {
  // signal 暂透传到底层较复杂；保持超时语义
  void options.signal;
  const profile = pickProfilesForUrl(url)[0]!;
  const jar = new CookieJar();
  await warmUpCookies(url, profile, jar);
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      const res = await rawFetch(
        url,
        browserHeaders(url, profile, { cookie: jar.header() }),
        { timeoutMs },
      );
      jar.absorb(res);
      if (!res.ok && isRetryableStatus(res.status) && attempt < RETRY_MAX) {
        lastErr = new Error(`HTTP ${res.status}`);
        try {
          await res.arrayBuffer();
        } catch {
          // ignore
        }
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < RETRY_MAX) {
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
    }
  }
  throw new Error(`下载失败: ${lastErr?.message || '未知错误'}`);
}

interface ReaderResult {
  title?: string;
  text: string;
  finalUrl: string;
  strategy: string;
}

/** Jina Reader：绕过多数站点反爬，输出可读 Markdown/文本 */
async function fetchViaJina(url: string): Promise<ReaderResult> {
  if (!envFlag('URL_FETCH_JINA', true)) {
    throw new Error('Jina 通道已关闭（URL_FETCH_JINA=0）');
  }
  const endpoint = `https://r.jina.ai/${url}`;
  const headers: Record<string, string> = {
    Accept: 'text/plain, text/markdown, */*',
    'User-Agent': UA_PROFILES[0]!.userAgent,
    'X-Return-Format': 'markdown',
    'X-Timeout': '45',
    'X-Locale': 'zh-CN',
  };
  const apiKey = String(process.env.JINA_API_KEY || '').trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await rawFetch(endpoint, headers, { timeoutMs: 90_000 });
  if (!res.ok) {
    throw new Error(`Jina HTTP ${res.status}`);
  }
  const body = await readBodyWithLimit(res, MAX_TEXT_BYTES);
  const raw = decodeTextBuffer(body, res.headers.get('content-type') || 'text/plain');
  if (!raw || raw.trim().length < 20) {
    throw new Error('Jina 返回为空');
  }
  if (detectAntiBot(raw)) {
    // Jina 有时也会回验证页提示
    throw new Error(`Jina 仍被拦截：${detectAntiBot(raw)}`);
  }

  // Jina 常见格式：Title: xxx\nURL Source: ...\nMarkdown Content:\n...
  let title: string | undefined;
  const titleMatch =
    /^(?:Title|标题)\s*[:：]\s*(.+)$/im.exec(raw) ||
    /^#\s+(.+)$/m.exec(raw);
  if (titleMatch?.[1]) title = titleMatch[1].trim();

  let text = raw
    .replace(/^(?:URL Source|来源)\s*[:：].*$/gim, '')
    .replace(/^(?:Published Time|发布时间)\s*[:：].*$/gim, '')
    .replace(/^(?:Title|标题)\s*[:：]\s*.*$/gim, '')
    .replace(/^Markdown Content\s*[:：]?\s*/im, '')
    .trim();

  // 去掉 markdown 链接噪音但保留文字
  text = text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (title && text && !text.startsWith(title)) {
    text = `${title}\n\n${text}`;
  }
  text = collapseWhitespace(text);
  if (!isGoodArticleText(text)) {
    throw new Error('Jina 正文过短');
  }
  return { title, text, finalUrl: url, strategy: 'jina' };
}

/** 备用：通过 Jina HTML 模式拿原文再本地抽取 */
async function fetchViaJinaHtml(url: string): Promise<ReaderResult> {
  if (!envFlag('URL_FETCH_JINA', true)) {
    throw new Error('Jina 通道已关闭');
  }
  const endpoint = `https://r.jina.ai/${url}`;
  const headers: Record<string, string> = {
    Accept: 'text/html, */*',
    'User-Agent': UA_PROFILES[0]!.userAgent,
    'X-Return-Format': 'html',
    'X-Timeout': '45',
  };
  const apiKey = String(process.env.JINA_API_KEY || '').trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await rawFetch(endpoint, headers, { timeoutMs: 90_000 });
  if (!res.ok) throw new Error(`Jina HTML HTTP ${res.status}`);
  const body = await readBodyWithLimit(res, MAX_TEXT_BYTES);
  const html = decodeTextBuffer(body, res.headers.get('content-type') || 'text/html');
  const article = extractArticleContent(html);
  if (!isGoodArticleText(article.text)) {
    throw new Error('Jina HTML 正文过短');
  }
  return {
    title: article.title || undefined,
    text: article.text,
    finalUrl: url,
    strategy: 'jina-html',
  };
}

/**
 * 可选 Playwright 渲染（需本机已安装 playwright，不作为硬依赖）。
 * URL_FETCH_PLAYWRIGHT=1 时启用。
 */
async function fetchViaPlaywright(url: string): Promise<ReaderResult> {
  if (!envFlag('URL_FETCH_PLAYWRIGHT', false)) {
    throw new Error('Playwright 通道未启用（URL_FETCH_PLAYWRIGHT=1）');
  }
  // 动态加载，避免硬依赖；用 Function 绕过静态模块解析
  let playwright: any;
  const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
  try {
    playwright = await dynImport('playwright');
  } catch {
    try {
      playwright = await dynImport('playwright-core');
    } catch {
      throw new Error('未安装 playwright / playwright-core');
    }
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const context = await browser.newContext({
      userAgent: UA_PROFILES[0]!.userAgent,
      locale: 'zh-CN',
      viewport: { width: 1440, height: 1100 },
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // 等正文出现 / 网络稍静
    try {
      await page.waitForLoadState('networkidle', { timeout: 12_000 });
    } catch {
      // ignore
    }
    await sleep(800);
    const html = await page.content();
    const titleFromPage = (await page.title()) || null;
    const article = extractArticleContent(html);
    const title = article.title || titleFromPage;
    let text = article.text;
    if (title && text && !text.startsWith(title)) text = `${title}\n\n${text}`;
    text = collapseWhitespace(text);
    if (!isGoodArticleText(text)) {
      throw new Error('Playwright 渲染后正文仍过短');
    }
    if (detectAntiBot(html, title)) {
      throw new Error(`Playwright 仍遇拦截：${detectAntiBot(html, title)}`);
    }
    return {
      title: title || undefined,
      text,
      finalUrl: page.url() || url,
      strategy: 'playwright',
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

interface ResolvedPage {
  kind: 'text' | 'media-buffer';
  title?: string;
  textContent?: string;
  finalUrl: string;
  headerMime: string;
  body?: Buffer;
  strategy: string;
  filenameHint?: string;
}

/**
 * 网页多通道抓取：
 * 1) 直连 UA 轮换 + Cookie 预热
 * 2) Jina Reader Markdown
 * 3) Jina HTML
 * 4) 可选 Playwright
 */
async function resolveArticlePage(url: string): Promise<ResolvedPage> {
  const errors: string[] = [];

  // 1) 直连
  try {
    const direct = await fetchDirectSmart(url);
    const mimeKind = kindFromMime(direct.headerMime);
    if (direct.ok && (mimeKind === 'video' || mimeKind === 'audio')) {
      return {
        kind: 'media-buffer',
        finalUrl: direct.finalUrl,
        headerMime: direct.headerMime,
        body: Buffer.from(direct.body),
        strategy: `direct:${direct.profileId}`,
      };
    }

    if (direct.ok && direct.body.length) {
      const decoded = decodeTextBuffer(direct.body, direct.headerMime);
      const isHtml =
        direct.headerMime.includes('html') ||
        /^\s*</.test(decoded.slice(0, 256));
      if (isHtml) {
        const blocked = direct.blockReason || detectAntiBot(decoded);
        const article = extractArticleContent(decoded);
        if (!blocked && isGoodArticleText(article.text)) {
          return {
            kind: 'text',
            title: article.title || undefined,
            textContent: article.text,
            finalUrl: direct.finalUrl,
            headerMime: direct.headerMime || 'text/html',
            strategy: `direct:${direct.profileId}`,
          };
        }
        errors.push(
          `direct:${direct.profileId}→${blocked || '正文过短'}`,
        );
      } else {
        const text = extractReadableText(
          decoded,
          direct.headerMime || 'text/plain',
        );
        if (isGoodArticleText(text) || text.length >= 20) {
          return {
            kind: 'text',
            textContent: text,
            finalUrl: direct.finalUrl,
            headerMime: direct.headerMime || 'text/plain',
            strategy: `direct:${direct.profileId}`,
          };
        }
        errors.push(`direct:${direct.profileId}→非HTML正文过短`);
      }
    } else {
      errors.push(
        `direct→${direct.blockReason || `HTTP ${direct.status}`}`,
      );
    }
  } catch (err) {
    errors.push(`direct→${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Jina markdown
  try {
    const jina = await fetchViaJina(url);
    return {
      kind: 'text',
      title: jina.title,
      textContent: jina.text,
      finalUrl: jina.finalUrl,
      headerMime: 'text/markdown',
      strategy: jina.strategy,
    };
  } catch (err) {
    errors.push(`jina→${err instanceof Error ? err.message : String(err)}`);
  }

  // 3) Jina html
  try {
    const jinaHtml = await fetchViaJinaHtml(url);
    return {
      kind: 'text',
      title: jinaHtml.title,
      textContent: jinaHtml.text,
      finalUrl: jinaHtml.finalUrl,
      headerMime: 'text/html',
      strategy: jinaHtml.strategy,
    };
  } catch (err) {
    errors.push(
      `jina-html→${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4) Playwright（可选）
  try {
    const pw = await fetchViaPlaywright(url);
    return {
      kind: 'text',
      title: pw.title,
      textContent: pw.text,
      finalUrl: pw.finalUrl,
      headerMime: 'text/html',
      strategy: pw.strategy,
    };
  } catch (err) {
    errors.push(
      `playwright→${err instanceof Error ? err.message : String(err)}`,
    );
  }

  throw new Error(
    `强反爬拦截，多通道均失败：${errors.join(' | ')}。可设置 JINA_API_KEY 或 URL_FETCH_PLAYWRIGHT=1（需安装 playwright）后重试`,
  );
}

async function readBodyWithLimit(
  res: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!res.body) {
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > maxBytes) {
      throw new Error(`远程文件过大，最大 ${formatMb(maxBytes)}`);
    }
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new Error(`远程文件过大，最大 ${formatMb(maxBytes)}`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function streamBodyToFile(
  res: Response,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  await ensureDir(path.dirname(destPath));
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`远程文件过大，最大 ${formatMb(maxBytes)}`);
    }
    await fsp.writeFile(destPath, buf);
    return buf.length;
  }

  let total = 0;
  const nodeStream = Readable.fromWeb(
    res.body as import('node:stream/web').ReadableStream,
  );
  const { Transform } = await import('node:stream');
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      total += (chunk as Buffer).length;
      if (total > maxBytes) {
        cb(new Error(`远程文件过大，最大 ${formatMb(maxBytes)}`));
        return;
      }
      cb(null, chunk);
    },
  });

  const out = fs.createWriteStream(destPath);
  try {
    await pipeline(nodeStream, counter, out);
  } catch (err) {
    try {
      await fsp.unlink(destPath);
    } catch {
      // ignore
    }
    throw err;
  }
  return total;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function looksLikeMediaUrl(url: string): boolean {
  try {
    const ext = extOf(path.basename(new URL(url).pathname));
    return VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext);
  } catch {
    return false;
  }
}

// ── 主入口 ─────────────────────────────────────────────────

/**
 * 从远程 URL 下载内容，识别 video / audio / text，并落盘到任务目录。
 * 网页启用反强反爬多通道：UA 轮换 / Cookie 预热 / Jina / 可选 Playwright。
 */
export async function importUrlContent(
  url: string,
  jobId: string,
): Promise<ImportResult> {
  if (!isValidHttpUrl(url)) {
    throw new Error('请输入有效的 http/https 链接');
  }

  const requestUrl = url.trim();
  const paths = jobPaths(jobId);
  await ensureDir(paths.dir);

  // ── 明确媒体直链：增强直连下载 ──
  if (looksLikeMediaUrl(requestUrl)) {
    let res: Response;
    try {
      res = await fetchWithRetry(requestUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(msg.startsWith('下载') ? msg : `下载失败: ${msg}`);
    }
    if (!res.ok) {
      throw new Error(`下载失败 HTTP ${res.status}`);
    }
    const finalUrl = res.url || requestUrl;
    const headerMime = (res.headers.get('content-type') || '').toLowerCase();
    const filenameGuess = filenameFromUrl(
      finalUrl,
      res.headers.get('content-disposition'),
    );
    const extGuess = extOf(filenameGuess);
    const kind =
      kindFromMime(headerMime) ||
      kindFromExt(extGuess) ||
      'video';
    if (kind === 'text') {
      // 扩展名像媒体但实际是网页，丢弃响应体后走文章通道
      try {
        await res.arrayBuffer();
      } catch {
        // ignore
      }
    } else {
      const ext = extGuess || defaultExt(kind, headerMime);
      const safeBase = safeFilenameBase(
        path.basename(filenameGuess, extOf(filenameGuess)),
      );
      const filename = `${safeBase}${ext}`;
      const sourcePath = paths.source(ext);
      const size = await streamBodyToFile(res, sourcePath, MAX_BYTES);
      if (!size) throw new Error('远程内容为空');
      return {
        kind,
        sourcePath,
        mimeType: mimeFor(kind, ext, headerMime),
        size,
        filename,
        finalUrl,
      };
    }
  }

  // ── 网页 / 未知：反强反爬多通道 ──
  const resolved = await resolveArticlePage(requestUrl);

  if (resolved.kind === 'media-buffer' && resolved.body) {
    const filenameGuess = filenameFromUrl(resolved.finalUrl);
    const extGuess = extOf(filenameGuess);
    const kind =
      kindFromMime(resolved.headerMime) ||
      kindFromExt(extGuess) ||
      kindFromMagic(resolved.body);
    if (!kind || kind === 'text') {
      throw new Error('媒体内容识别失败');
    }
    const ext = extGuess || defaultExt(kind, resolved.headerMime);
    const safeBase = safeFilenameBase(
      path.basename(filenameGuess, extOf(filenameGuess)),
    );
    const filename = `${safeBase}${ext}`;
    const sourcePath = paths.source(ext);
    await fsp.writeFile(sourcePath, resolved.body);
    const stat = await fsp.stat(sourcePath);
    return {
      kind,
      sourcePath,
      mimeType: mimeFor(kind, ext, resolved.headerMime),
      size: stat.size,
      filename,
      finalUrl: resolved.finalUrl,
    };
  }

  const textContent = resolved.textContent || '';
  if (!textContent || textContent.length < 20) {
    throw new Error(
      '文本内容过短或无法提取有效正文（页面可能是动态渲染 / 需登录 / 强反爬）',
    );
  }

  const pageTitle = resolved.title || null;
  const safeBase = safeFilenameBase(
    pageTitle ||
      path.basename(filenameFromUrl(resolved.finalUrl), extOf(filenameFromUrl(resolved.finalUrl))) ||
      'article',
    'article',
  );
  const filename = `${safeBase}.txt`;
  const sourcePath = paths.source('.txt');
  // 文首标注抓取通道，便于排查（不污染口播时可忽略首行 meta）
  const payload = textContent;
  await writeText(sourcePath, payload);
  await writeText(paths.transcript, payload);
  const stat = await fsp.stat(sourcePath);

  console.info(
    `[urlImporter] ${requestUrl} → strategy=${resolved.strategy} title=${pageTitle || '-'} chars=${payload.length}`,
  );

  return {
    kind: 'text',
    sourcePath,
    mimeType: 'text/plain',
    size: stat.size,
    filename,
    textContent: payload,
    title: pageTitle || undefined,
    finalUrl: resolved.finalUrl,
  };
}
