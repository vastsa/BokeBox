import type { JobStatus, LibraryItem } from '../../types/job';
import type { LibraryListFacets } from '../../types/pagination';
import type { Translator } from '../../i18n';
import { formatDuration, hashSeed, listenProgressPct } from '../../lib/format';

export const ACTIVE: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'generating_cover',
  'synthesizing_audio',
];

export type FilterKey = 'all' | 'unplayed' | 'progress' | 'done';

export const FILTER_KEYS: FilterKey[] = ['all', 'unplayed', 'progress', 'done'];

export const FILTER_LABEL_KEY: Record<FilterKey, string> = {
  all: 'home.filterAll',
  unplayed: 'home.filterUnplayed',
  progress: 'home.filterProgress',
  done: 'home.filterDone',
};

/** 真正的最短列瀑布流：2 → 3 → 4 列 */
export const MASONRY_CONFIG = {
  columns: [2, 3, 4],
  gap: [14, 16, 18],
  // media 长度需覆盖列配置索引（react-plock 按命中的 min-width 数量取 columns[i]）
  media: [720, 1100, 10000],
  useBalancedLayout: true,
};

/** 与卡片 is-s / is-m / is-t 的 aspect-ratio 对应：1/1、3/4、2/3 */
export const CARD_HEIGHT_RATIOS = [1, 4 / 3, 3 / 2] as const;
export const AVG_CARD_HEIGHT_RATIO =
  CARD_HEIGHT_RATIOS.reduce((sum, r) => sum + r, 0) / CARD_HEIGHT_RATIOS.length;

/** 服务端 pageSize 上限 100；首屏过小会立刻触底，过大浪费带宽 */
export const LIBRARY_PAGE_MIN = 6;
export const LIBRARY_PAGE_MAX = 48;
/** 多拉 1 行，避免首屏刚够高就立刻触发哨兵 */
export const LIBRARY_OVERSCAN_ROWS = 1;
/** 页头 + 筛选条 + 间距（不含专辑/制作中，首屏骨架时通常尚未占位） */
export const LIBRARY_CHROME_TOP_PX = 168;
/** 底栏 + 迷你播放条预留 */
export const LIBRARY_CHROME_BOTTOM_PX = 120;
/** 内容区左右 padding 粗估（--page-x * 2） */
export const LIBRARY_PAGE_PAD_X = 40;
/** 与 .page-container 的 --container-max 大致对齐 */
export const LIBRARY_CONTAINER_MAX = 1120;

export function masonryLayoutForWidth(width: number): { columns: number; gap: number } {
  // 与 react-plock 一致：累计命中的 min-width 数量作为 columns/gap 下标
  let hits = 0;
  for (const bp of MASONRY_CONFIG.media) {
    if (width >= bp) hits += 1;
    else break;
  }
  const index = Math.min(
    Math.max(hits, 0),
    MASONRY_CONFIG.columns.length - 1,
  );
  return {
    columns: MASONRY_CONFIG.columns[index],
    gap: MASONRY_CONFIG.gap[index],
  };
}

/**
 * 按当前视口估算「一屏可见 + 1 行 overscan」的条数。
 * 用于首屏与触底追加的 pageSize，避免固定 10 条在宽屏不够 / 窄屏过多。
 */
export function estimateLibraryPageSize(
  viewport?: { width: number; height: number },
): number {
  const width =
    viewport?.width ??
    (typeof window !== 'undefined' ? window.innerWidth : 390);
  const height =
    viewport?.height ??
    (typeof window !== 'undefined' ? window.innerHeight : 844);

  const { columns, gap } = masonryLayoutForWidth(width);
  const contentWidth = Math.max(
    280,
    Math.min(width - LIBRARY_PAGE_PAD_X, LIBRARY_CONTAINER_MAX),
  );
  const colWidth = (contentWidth - gap * (columns - 1)) / columns;
  const avgCardH = Math.max(120, colWidth * AVG_CARD_HEIGHT_RATIO);
  const availableH = Math.max(
    avgCardH,
    height - LIBRARY_CHROME_TOP_PX - LIBRARY_CHROME_BOTTOM_PX,
  );
  const rows = Math.max(1, Math.ceil(availableH / (avgCardH + gap)));
  const count = (rows + LIBRARY_OVERSCAN_ROWS) * columns;
  return Math.min(LIBRARY_PAGE_MAX, Math.max(LIBRARY_PAGE_MIN, count));
}

export const DEFAULT_LIBRARY_PAGE_SIZE = estimateLibraryPageSize();
export const SKEL_ITEMS = Array.from(
  { length: Math.min(12, DEFAULT_LIBRARY_PAGE_SIZE) },
  (_, i) => i,
);

export function itemTitle(item: LibraryItem): string {
  return item.job.podcast?.title || item.job.title;
}

export function itemSummary(item: LibraryItem, t: Translator): string {
  return (
    item.job.podcast?.summary?.trim() ||
    item.job.podcast?.hostIntro?.trim() ||
    t('home.noSummary')
  );
}

export function itemMinutes(item: LibraryItem, t: Translator): string {
  // 预估分钟不准，仅展示真实收听时长（有记录时）
  if (item.listen?.durationSec) return formatDuration(item.listen.durationSec);
  return t('app.podcast');
}

export function itemPct(item: LibraryItem): number {
  return listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
}


/** 瀑布流高度变体：短 / 中 / 高 */
export function cardSize(seed: string): 's' | 'm' | 't' {
  const n = hashSeed(seed) % 3;
  return n === 0 ? 's' : n === 1 ? 'm' : 't';
}

export const EMPTY_LIB_FACETS: LibraryListFacets = {
  all: 0,
  unplayed: 0,
  progress: 0,
  done: 0,
};

