/**
 * HTTP 抓取：UA 轮换、Cookie 预热、反爬识别、正文解析
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ensureDir } from '../../utils/fs.js';
import {
  collapseWhitespace,
  decodeTextBuffer,
  extractArticleContent,
  extractPageTitle,
  extractReadableText,
  removeNoiseBlocks,
  stripTagsToText,
} from './html.js';
import { kindFromExt, kindFromMime } from './mediaDetect.js';
import { safeFetch, UnsafeUrlError } from '../../utils/ssrf.js';

export const MAX_BYTES = 500 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 600;
/** 文本类抓取上限（防止超大 HTML 占满内存） */
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

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
  try {
    // 每跳重定向都会做 SSRF 校验，避免公网跳板打内网
    return await safeFetch(url, {
      method: 'GET',
      headers,
      timeoutMs,
    });
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg) || /超时/.test(msg)) {
      throw new Error(
        msg.startsWith('下载超时')
          ? msg
          : `下载超时（超过 ${Math.round(timeoutMs / 1000)} 秒）`,
      );
    }
    throw new Error(msg.startsWith('下载失败') ? msg : `下载失败: ${msg}`);
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
export async function fetchWithRetry(
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

export interface ResolvedPage {
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
 * 网页抓取：直连 UA 轮换 + Cookie 预热
 */
export async function resolveArticlePage(url: string): Promise<ResolvedPage> {
  const errors: string[] = [];

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

  console.warn('[urlImporter] all strategies failed:', errors.join(' | '));
  throw new Error(
    '暂时无法获取该链接内容，请确认链接可公开访问后重试',
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

export async function streamBodyToFile(
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


