/**
 * RSS / Atom 解析（无第三方依赖）
 */
import { safeFetch, UnsafeUrlError } from '../../utils/ssrf.js';
import { isValidHttpUrl } from '../import/index.js';
import type { ScheduleItemCandidate } from './types.js';

function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = Number.parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function pickTag(block: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(
      `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
      'i',
    );
    const m = block.match(re);
    if (m?.[1] != null) {
      return decodeXmlEntities(m[1].trim());
    }
    // self-closing / attribute form: <link href="..."/>
    const attrRe = new RegExp(
      `<${name}\\b[^>]*\\b(?:href|url)=["']([^"']+)["'][^>]*/?>`,
      'i',
    );
    const am = block.match(attrRe);
    if (am?.[1]) return decodeXmlEntities(am[1].trim());
  }
  return '';
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeItemKey(parts: {
  guid?: string;
  link?: string;
  title?: string;
  publishedAt?: string;
}): string {
  const guid = (parts.guid || '').trim();
  if (guid) return `guid:${guid}`;
  const link = (parts.link || '').trim();
  if (link) return `link:${link}`;
  const title = (parts.title || '').trim();
  const pub = (parts.publishedAt || '').trim();
  return `hash:${title}|${pub}`;
}

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(m[1] || '');
  }
  return out;
}

export function parseFeedXml(xml: string): ScheduleItemCandidate[] {
  const text = String(xml || '');
  const items: ScheduleItemCandidate[] = [];

  const rssItems = extractBlocks(text, 'item');
  if (rssItems.length) {
    for (const block of rssItems) {
      const title = stripTags(pickTag(block, ['title']));
      const link = pickTag(block, ['link', 'guid']).trim();
      const guid = pickTag(block, ['guid']);
      const publishedAt =
        pickTag(block, ['pubDate', 'published', 'dc:date', 'date']) || null;
      const summary = stripTags(
        pickTag(block, ['description', 'content:encoded', 'summary']),
      );
      // link 优先；guid 若是 URL 也可
      let url = link;
      if (!isValidHttpUrl(url) && isValidHttpUrl(guid)) url = guid;
      if (!isValidHttpUrl(url)) continue;
      items.push({
        key: normalizeItemKey({ guid, link: url, title, publishedAt: publishedAt || undefined }),
        url,
        title: title || undefined,
        publishedAt,
        summary: summary || undefined,
      });
    }
    return items;
  }

  // Atom
  const entries = extractBlocks(text, 'entry');
  for (const block of entries) {
    const title = stripTags(pickTag(block, ['title']));
    let link = '';
    // Atom: <link href="..." rel="alternate"/>
    const linkTags = block.match(/<link\b[^>]*>/gi) || [];
    for (const tag of linkTags) {
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1] || 'alternate';
      if (rel === 'alternate' || !link) {
        link = decodeXmlEntities(href);
        if (rel === 'alternate') break;
      }
    }
    const id = pickTag(block, ['id']);
    const publishedAt =
      pickTag(block, ['published', 'updated', 'pubDate']) || null;
    const summary = stripTags(pickTag(block, ['summary', 'content']));
    let url = link;
    if (!isValidHttpUrl(url) && isValidHttpUrl(id)) url = id;
    if (!isValidHttpUrl(url)) continue;
    items.push({
      key: normalizeItemKey({
        guid: id,
        link: url,
        title,
        publishedAt: publishedAt || undefined,
      }),
      url,
      title: title || undefined,
      publishedAt,
      summary: summary || undefined,
    });
  }
  return items;
}

export async function fetchRssItems(
  feedUrl: string,
  options: { timeoutMs?: number; userAgent?: string } = {},
): Promise<ScheduleItemCandidate[]> {
  const url = String(feedUrl || '').trim();
  if (!isValidHttpUrl(url)) {
    throw new Error('RSS 地址无效');
  }
  const userAgent =
    String(options.userAgent || '').trim() ||
    'BokeBoxSchedule/1.0 (+https://github.com/vastsa/BokeBox)';
  let res: Response;
  try {
    res = await safeFetch(url, {
      timeoutMs: options.timeoutMs ?? 30_000,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': userAgent,
      },
    });
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    throw new Error(
      `拉取 RSS 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`拉取 RSS 失败: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 8 * 1024 * 1024) {
    throw new Error('RSS 内容过大（>8MB）');
  }
  const xml = buf.toString('utf8');
  const items = parseFeedXml(xml);
  if (!items.length) {
    throw new Error('未解析到任何条目（请确认是有效的 RSS/Atom）');
  }
  return items;
}

/** url_list 源：把配置的 URL 变成候选条目 */
export function candidatesFromUrlList(urls: string[]): ScheduleItemCandidate[] {
  const out: ScheduleItemCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of urls || []) {
    const url = String(raw || '').trim();
    if (!isValidHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    let title: string | undefined;
    try {
      title = new URL(url).hostname;
    } catch {
      title = url;
    }
    out.push({
      key: `link:${url}`,
      url,
      title,
      publishedAt: null,
    });
  }
  return out;
}
