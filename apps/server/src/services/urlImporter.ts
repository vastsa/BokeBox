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

// ── HTTP 抓取 ───────────────────────────────────────────────

function browserHeaders(url: string): Record<string, string> {
  let referer = '';
  try {
    const u = new URL(url);
    referer = u.origin + '/';
  } catch {
    // ignore
  }
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PersonBoke/1.0',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    // 部分站点校验 Referer
    ...(referer ? { Referer: referer } : {}),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithRetry(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onParentAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: browserHeaders(url),
      });

      if (!res.ok && isRetryableStatus(res.status) && attempt < RETRY_MAX) {
        lastErr = new Error(`HTTP ${res.status}`);
        // 尽量消费 body 以便连接复用
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
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(msg)) {
        throw new Error(`下载超时（超过 ${Math.round(timeoutMs / 1000)} 秒）`);
      }
      lastErr = err instanceof Error ? err : new Error(msg);
      if (attempt < RETRY_MAX) {
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener('abort', onParentAbort);
      }
    }
  }

  throw new Error(`下载失败: ${lastErr?.message || '未知错误'}`);
}

async function readBodyWithLimit(
  res: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!res.body) {
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > maxBytes) throw new Error(`远程文件过大，最大 ${formatMb(maxBytes)}`);
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

// ── 主入口 ─────────────────────────────────────────────────

/**
 * 从远程 URL 下载内容，识别 video / audio / text，并落盘到任务目录。
 * 网页会做正文抽取与标题识别；音视频流式落盘避免占满内存。
 */
export async function importUrlContent(
  url: string,
  jobId: string,
): Promise<ImportResult> {
  if (!isValidHttpUrl(url)) {
    throw new Error('请输入有效的 http/https 链接');
  }

  const requestUrl = url.trim();
  let res: Response;
  try {
    res = await fetchWithRetry(requestUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg.startsWith('下载') ? msg : `下载失败: ${msg}`);
  }

  if (!res.ok) {
    const hint =
      res.status === 403
        ? '（站点拒绝访问，可能需登录或防盗链）'
        : res.status === 404
          ? '（资源不存在）'
          : res.status === 401
            ? '（需要鉴权）'
            : '';
    throw new Error(`下载失败 HTTP ${res.status}${hint}`);
  }

  const finalUrl = res.url || requestUrl;
  const headerMime = (res.headers.get('content-type') || '').toLowerCase();
  const lenHeader = res.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    throw new Error(`远程文件过大，最大 ${formatMb(MAX_BYTES)}`);
  }

  const filenameGuess = filenameFromUrl(
    finalUrl,
    res.headers.get('content-disposition'),
  );
  const extGuess = extOf(filenameGuess);

  // 先根据 header / 扩展名猜测类型，决定内存读 or 流式写
  const kindHint =
    kindFromMime(headerMime) || kindFromExt(extGuess) || null;

  const paths = jobPaths(jobId);
  await ensureDir(paths.dir);

  // ── 明确媒体：流式落盘 ──
  if (kindHint === 'video' || kindHint === 'audio') {
    const ext = extGuess || defaultExt(kindHint, headerMime);
    const safeBase = safeFilenameBase(
      path.basename(filenameGuess, extOf(filenameGuess)),
    );
    const filename = `${safeBase}${ext}`;
    const sourcePath = paths.source(ext);
    const size = await streamBodyToFile(res, sourcePath, MAX_BYTES);
    if (!size) throw new Error('远程内容为空');
    return {
      kind: kindHint,
      sourcePath,
      mimeType: mimeFor(kindHint, ext, headerMime),
      size,
      filename,
      finalUrl,
    };
  }

  // ── 文本 / 未知：读入内存识别 ──
  const maxRead =
    kindHint === 'text' ||
    headerMime.includes('html') ||
    headerMime.includes('text') ||
    headerMime.includes('json') ||
    headerMime.includes('xml')
      ? MAX_TEXT_BYTES
      : MAX_BYTES;

  const body = await readBodyWithLimit(res, maxRead);
  if (!body.length) throw new Error('远程内容为空');

  const kind =
    kindHint ||
    kindFromMime(headerMime) ||
    kindFromExt(extGuess) ||
    kindFromMagic(body) ||
    null;

  if (!kind) {
    throw new Error(
      '无法识别内容类型（仅支持视频 / 音频 / 文本网页）。请检查链接是否可直接访问，或是否为需登录页面。',
    );
  }

  // 未知类型实为媒体：补写文件
  if (kind === 'video' || kind === 'audio') {
    const ext = extGuess || defaultExt(kind, headerMime);
    const safeBase = safeFilenameBase(
      path.basename(filenameGuess, extOf(filenameGuess)),
    );
    const filename = `${safeBase}${ext}`;
    const sourcePath = paths.source(ext);
    await fsp.writeFile(sourcePath, body);
    const stat = await fsp.stat(sourcePath);
    return {
      kind,
      sourcePath,
      mimeType: mimeFor(kind, ext, headerMime),
      size: stat.size,
      filename,
      finalUrl,
    };
  }

  // ── 文本 / 网页 ──
  const decoded = decodeTextBuffer(body, headerMime);
  const isHtml =
    headerMime.includes('html') ||
    extGuess === '.html' ||
    extGuess === '.htm' ||
    /^\s*</.test(decoded.slice(0, 256));

  let textContent: string;
  let pageTitle: string | null = null;

  if (isHtml) {
    const article = extractArticleContent(decoded);
    textContent = article.text;
    pageTitle = article.title;
  } else {
    textContent = extractReadableText(
      decoded,
      headerMime || extGuess || 'text/plain',
    );
  }

  if (!textContent || textContent.length < 20) {
    throw new Error(
      '文本内容过短或无法提取有效正文（页面可能是动态渲染 / 需登录 / 反爬）',
    );
  }

  const safeBase = safeFilenameBase(
    pageTitle || path.basename(filenameGuess, extOf(filenameGuess)) || 'article',
    'article',
  );
  const filename = `${safeBase}.txt`;
  const sourcePath = paths.source('.txt');
  await writeText(sourcePath, textContent);
  await writeText(paths.transcript, textContent);
  const stat = await fsp.stat(sourcePath);

  return {
    kind: 'text',
    sourcePath,
    mimeType: 'text/plain',
    size: stat.size,
    filename,
    textContent,
    title: pageTitle || undefined,
    finalUrl,
  };
}
