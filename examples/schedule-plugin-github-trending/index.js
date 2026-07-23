/**
 * GitHub Trending 订阅插件
 * 使用宿主 ctx.safeFetch 拉取 HTML 并解析仓库卡片
 */
function buildUrl(params, cfg) {
  const since = String(params.since || cfg.since || 'daily');
  const language = String(params.language || cfg.language || '').trim();
  const spoken = String(
    params.spokenLanguage || cfg.spokenLanguage || '',
  ).trim();
  const pathLang = language ? `/${encodeURIComponent(language)}` : '';
  const qs = new URLSearchParams();
  qs.set('since', since === 'weekly' || since === 'monthly' ? since : 'daily');
  if (spoken) qs.set('spoken_language_code', spoken);
  return `https://github.com/trending${pathLang}?${qs.toString()}`;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseTrending(html) {
  const items = [];
  // article.Box-row 卡片
  const re =
    /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html))) {
    const block = m[1] || '';
    const href =
      block.match(
        /<h2[\s\S]*?<a[^>]*href="(\/[^"]+\/[^"]+)"[^>]*>/i,
      )?.[1] ||
      block.match(/href="(\/[^"\s]+\/[^"\s]+)"/i)?.[1];
    if (!href) continue;
    const fullName = href.replace(/^\/+/, '').replace(/\/$/, '');
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) continue;
    const desc =
      block
        .match(
          /<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/p>/i,
        )?.[1]
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || '';
    const url = `https://github.com/${fullName}`;
    items.push({
      key: `gh-trend:${fullName}`,
      url,
      title: fullName,
      summary: decodeEntities(desc) || undefined,
      publishedAt: new Date().toISOString().slice(0, 10),
    });
  }
  return items;
}

const plugin = {
  id: 'schedule.github-trending',
  name: 'GitHub Trending',
  description: '抓取 GitHub Trending 仓库列表',
  version: '0.1.0',
  riskLevel: 'medium',
  capabilities: ['list', 'poll', 'api'],
  defaultEnabled: false,

  isAvailable() {
    return true;
  },

  canHandle() {
    return true;
  },

  async fetch(input, ctx) {
    const cfg = {
      since: ctx.getConfig('since'),
      language: ctx.getConfig('language'),
      spokenLanguage: ctx.getConfig('spokenLanguage'),
    };
    const url = buildUrl(input.params || {}, cfg);
    const res = await ctx.safeFetch(url, {
      timeoutMs: 30_000,
      headers: {
        Accept: 'text/html',
        'User-Agent':
          'BokeBoxSchedule/1.0 (+https://github.com/vastsa/BokeBox)',
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub Trending HTTP ${res.status}`);
    }
    const html = await res.text();
    let items = parseTrending(html);
    if (!items.length) {
      throw new Error('未能解析到 Trending 条目（页面结构可能变化）');
    }
    if (input.maxItems > 0) {
      items = items.slice(0, Math.max(input.maxItems, 1));
    }
    return {
      items,
      strategy: 'github-trending-html',
      rawMeta: { url, count: items.length },
    };
  },
};

export default plugin;
