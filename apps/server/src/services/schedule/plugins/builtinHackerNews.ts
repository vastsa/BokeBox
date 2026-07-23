/**
 * 内置：Hacker News
 * 使用官方 Firebase API（无需 Key）
 * https://github.com/HackerNews/API
 */
import type { ScheduleItemCandidate } from '../types.js';
import type {
  SchedulePlugin,
  SchedulePluginFetchInput,
  SchedulePluginContext,
} from './types.js';

type HnStory = {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  time?: number;
  score?: number;
  by?: string;
  type?: string;
};

const HN_API = 'https://hacker-news.firebaseio.com/v0';

type FeedKind = 'top' | 'new' | 'best' | 'ask' | 'show' | 'job';

function resolveFeed(params: Record<string, unknown>, cfg: Record<string, unknown>): FeedKind {
  const raw = String(params.feed || cfg.feed || 'top').trim().toLowerCase();
  if (
    raw === 'new' ||
    raw === 'best' ||
    raw === 'ask' ||
    raw === 'show' ||
    raw === 'job'
  ) {
    return raw;
  }
  return 'top';
}

function feedPath(feed: FeedKind): string {
  switch (feed) {
    case 'new':
      return 'newstories';
    case 'best':
      return 'beststories';
    case 'ask':
      return 'askstories';
    case 'show':
      return 'showstories';
    case 'job':
      return 'jobstories';
    default:
      return 'topstories';
  }
}

async function fetchJson<T>(
  ctx: SchedulePluginContext,
  url: string,
): Promise<T> {
  const res = await ctx.safeFetch(url, {
    timeoutMs: 20_000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'BokeBoxSchedule/1.0 (+https://github.com/vastsa/BokeBox)',
    },
  });
  if (!res.ok) {
    throw new Error(`Hacker News HTTP ${res.status}: ${url}`);
  }
  return (await res.json()) as T;
}

export const builtinHackerNews: SchedulePlugin = {
  id: 'schedule.hacker-news',
  name: 'Hacker News',
  description: '拉取 Hacker News 热门 / 最新 / Ask / Show 等条目',
  version: '1.0.0',
  riskLevel: 'low',
  capabilities: ['list', 'poll', 'api'],
  defaultEnabled: true,
  configSchema: [
    {
      key: 'feed',
      label: 'Feed',
      type: 'select',
      required: false,
      default: 'top',
      options: [
        { value: 'top', label: 'Top' },
        { value: 'new', label: 'New' },
        { value: 'best', label: 'Best' },
        { value: 'ask', label: 'Ask HN' },
        { value: 'show', label: 'Show HN' },
        { value: 'job', label: 'Jobs' },
      ],
    },
  ],
  isAvailable() {
    return true;
  },
  canHandle() {
    return true;
  },
  async fetch(input: SchedulePluginFetchInput, ctx: SchedulePluginContext) {
    const feed = resolveFeed(input.params || {}, {
      feed: ctx.getConfig('feed'),
    });
    const listUrl = `${HN_API}/${feedPath(feed)}.json`;
    const ids = await fetchJson<number[]>(ctx, listUrl);
    if (!Array.isArray(ids) || !ids.length) {
      throw new Error('Hacker News 未返回条目 id');
    }

    const limit = Math.min(
      Math.max(input.maxItems || 3, 1),
      20,
    );
    const picked = ids.slice(0, limit);
    const items: ScheduleItemCandidate[] = [];

    // 顺序请求，避免对 Firebase 并发过高
    for (const id of picked) {
      try {
        const story = await fetchJson<HnStory | null>(
          ctx,
          `${HN_API}/item/${id}.json`,
        );
        if (!story || !story.id) continue;
        const title = String(story.title || `HN #${story.id}`).trim();
        // 无外链时落到 HN 讨论页（Ask/部分帖）
        const url =
          String(story.url || '').trim() ||
          `https://news.ycombinator.com/item?id=${story.id}`;
        if (!/^https?:\/\//i.test(url)) continue;
        items.push({
          key: `hn:${story.id}`,
          url,
          title,
          summary: story.by
            ? `by ${story.by}${story.score != null ? ` · ${story.score} pts` : ''}`
            : undefined,
          publishedAt: story.time
            ? new Date(story.time * 1000).toISOString()
            : null,
        });
      } catch {
        // 单条失败跳过
      }
    }

    if (!items.length) {
      throw new Error('未能获取任何 Hacker News 条目');
    }

    return {
      items,
      strategy: `builtin-hacker-news:${feed}`,
      rawMeta: { feed, requested: picked.length, got: items.length },
    };
  },
};
