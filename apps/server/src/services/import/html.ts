/**
 * 文本解码与 HTML/正文抽取（纯函数）
 */
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

export function decodeTextBuffer(buf: Buffer, contentType: string): string {
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

export function stripTagsToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article|blockquote|pre|figcaption)>/gi, '\n')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function collapseWhitespace(text: string): string {
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

export function removeNoiseBlocks(html: string): string {
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

