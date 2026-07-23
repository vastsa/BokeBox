/**
 * 内置：GitHub Trending
 */
import type { ScheduleItemCandidate } from '../types.js';
import type {
  SchedulePlugin,
  SchedulePluginFetchInput,
  SchedulePluginContext,
} from './types.js';

function buildUrl(
  params: Record<string, unknown>,
  cfg: Record<string, unknown>,
): string {
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

function decodeEntities(s: string): string {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseGithubTrendingHtml(html: string): ScheduleItemCandidate[] {
  const items: ScheduleItemCandidate[] = [];
  const re =
    /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const block = m[1] || '';
    const href =
      block.match(/<h2[\s\S]*?<a[^>]*href="(\/[^"]+\/[^"]+)"[^>]*>/i)?.[1] ||
      block.match(/href="(\/[^"\s]+\/[^"\s]+)"/i)?.[1];
    if (!href) continue;
    const fullName = href.replace(/^\/+/, '').replace(/\/$/, '');
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) continue;
    const desc =
      block
        .match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/p>/i)?.[1]
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || '';
    items.push({
      key: `gh-trend:${fullName}`,
      url: `https://github.com/${fullName}`,
      title: fullName,
      summary: decodeEntities(desc) || undefined,
      publishedAt: new Date().toISOString().slice(0, 10),
    });
  }
  return items;
}

export const builtinGithubTrending: SchedulePlugin = {
  id: 'schedule.github-trending',
  name: 'GitHub Trending',
  description: '抓取 GitHub Trending 仓库列表（按语言 / 时间范围）',
  version: '1.0.0',
  riskLevel: 'medium',
  capabilities: ['list', 'poll', 'api'],
  // 内置默认启用，方便开箱即用
  defaultEnabled: true,
  configSchema: [
    {
      key: 'since',
      label: '时间范围',
      type: 'select',
      required: false,
      default: 'daily',
      description: 'GitHub Trending 统计周期',
      options: [
        { value: 'daily', label: '今天' },
        { value: 'weekly', label: '本周' },
        { value: 'monthly', label: '本月' },
      ],
    },
    {
      key: 'language',
      label: '编程语言',
      type: 'string',
      required: false,
      placeholder: 'typescript / python / 留空=全部',
      description: '按编程语言过滤，留空表示全部',
    },
    {
      key: 'spokenLanguage',
      label: '口语语言',
      type: 'string',
      required: false,
      placeholder: 'zh / en / 留空=全部',
      description: 'spoken_language 参数，如 zh、en',
    },
  ],
  isAvailable() {
    return true;
  },
  canHandle() {
    return true;
  },
  async fetch(input: SchedulePluginFetchInput, ctx: SchedulePluginContext) {
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
    let items = parseGithubTrendingHtml(html);
    if (!items.length) {
      throw new Error('未能解析到 Trending 条目（页面结构可能变化）');
    }
    if (input.maxItems > 0) {
      items = items.slice(0, Math.max(input.maxItems, 1));
    }
    return {
      items,
      strategy: 'builtin-github-trending',
      rawMeta: { url, count: items.length },
    };
  },
};
