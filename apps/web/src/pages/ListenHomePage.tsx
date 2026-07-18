import { useCallback, useEffect, useMemo, useState } from 'react';
import { Masonry } from 'react-plock';
import {
  albumCoverUrl,
  coverImageUrl,
  fetchJobs,
  fetchLibrary,
  fetchListenAlbums,
} from '../api/client';
import { Pagination } from '../components/ui/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { LibraryListFacets, LibraryListFilter } from '../types/pagination';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import {
  IconPause,
  IconPlay,
} from '../components/icons';
import { CoverArt } from '../components/ui/CoverArt';
import { BrandMascot } from '../components/BrandMark';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import {
  formatDuration,
  hashSeed,
  listenProgressPct,
} from '../lib/format';
import { getToken } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import type { Job, JobStatus, LibraryItem } from '../types/job';
import type { AlbumSummary } from '../types/album';
import { useI18n, type Translator } from '../i18n';
import { AppShell } from '../layouts/AppShell';
import { usePlayer } from '../player/PlayerContext';
import { trackFromJob } from '../player/trackFromJob';
import { bestResumeSec, mergeListenRecord } from '../player/listenProgress';

const ACTIVE: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'generating_cover',
  'synthesizing_audio',
];

type FilterKey = 'all' | 'unplayed' | 'progress' | 'done';

const FILTER_KEYS: FilterKey[] = ['all', 'unplayed', 'progress', 'done'];

const FILTER_LABEL_KEY: Record<FilterKey, string> = {
  all: 'home.filterAll',
  unplayed: 'home.filterUnplayed',
  progress: 'home.filterProgress',
  done: 'home.filterDone',
};

/** 真正的最短列瀑布流：2 → 3 → 4 列 */
const MASONRY_CONFIG = {
  columns: [2, 3, 4],
  gap: [14, 16, 18],
  // media 长度需覆盖列配置索引（react-plock 按命中的 min-width 数量取 columns[i]）
  media: [720, 1100, 10000],
  useBalancedLayout: true,
};

const SKEL_ITEMS = Array.from({ length: 6 }, (_, i) => i);

function itemTitle(item: LibraryItem): string {
  return item.job.podcast?.title || item.job.title;
}

function itemSummary(item: LibraryItem, t: Translator): string {
  return (
    item.job.podcast?.summary?.trim() ||
    item.job.podcast?.hostIntro?.trim() ||
    t('home.noSummary')
  );
}

function itemMinutes(item: LibraryItem, t: Translator): string {
  // 预估分钟不准，仅展示真实收听时长（有记录时）
  if (item.listen?.durationSec) return formatDuration(item.listen.durationSec);
  return t('app.podcast');
}

function itemPct(item: LibraryItem): number {
  return listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
}


/** 瀑布流高度变体：短 / 中 / 高 */
function cardSize(seed: string): 's' | 'm' | 't' {
  const n = hashSeed(seed) % 3;
  return n === 0 ? 's' : n === 1 ? 'm' : 't';
}

const EMPTY_LIB_FACETS: LibraryListFacets = {
  all: 0,
  unplayed: 0,
  progress: 0,
  done: 0,
};

const LIBRARY_PAGE_SIZE = 24;

export function ListenHomePage({ route }: { route: Route }) {
  const { t } = useI18n();
  const player = usePlayer();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facets, setFacets] = useState<LibraryListFacets>(EMPTY_LIB_FACETS);

  const refresh = useCallback(async () => {
    try {
      const authed = Boolean(getToken());
      if (!authed) {
        // 游客：曲库分页；进度只用浏览器本地
        const [libRes, alRes] = await Promise.all([
          fetchLibrary({
            page,
            pageSize: LIBRARY_PAGE_SIZE,
            q: debouncedQuery,
            filter: filter as LibraryListFilter,
          }),
          fetchListenAlbums({ page: 1, pageSize: 12 }).catch(() => null),
        ]);
        setLibrary(
          libRes.items.map((it) => ({
            ...it,
            listen: mergeListenRecord(it.job.id, null),
          })),
        );
        setTotal(libRes.total);
        setTotalPages(libRes.totalPages);
        setFacets(libRes.facets || EMPTY_LIB_FACETS);
        setAlbums(alRes?.albums || []);
        setJobs([]);
        setError(null);
        return;
      }

      const [libRes, activeRes, failedRes, alRes] = await Promise.all([
        fetchLibrary({
          page,
          pageSize: LIBRARY_PAGE_SIZE,
          q: debouncedQuery,
          filter: filter as LibraryListFilter,
        }),
        fetchJobs({ page: 1, pageSize: 50, filter: 'active' }).catch(() => null),
        fetchJobs({ page: 1, pageSize: 20, filter: 'failed' }).catch(() => null),
        fetchListenAlbums({ page: 1, pageSize: 12 }).catch(() => null),
      ]);
      setAlbums(alRes?.albums || []);
      setLibrary(
        libRes.items.map((it) => ({
          ...it,
          listen: mergeListenRecord(it.job.id, it.listen),
        })),
      );
      setTotal(libRes.total);
      setTotalPages(libRes.totalPages);
      setFacets(libRes.facets || EMPTY_LIB_FACETS);
      const pipeline = [
        ...(activeRes?.jobs || []),
        ...(failedRes?.jobs || []),
      ];
      // 去重
      const seen = new Set<string>();
      setJobs(
        pipeline.filter((j) => {
          if (seen.has(j.id)) return false;
          seen.add(j.id);
          return true;
        }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, filter]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedQuery]);

  // 有进行中任务时轮询
  useEffect(() => {
    const active = jobs.some((j) => ACTIVE.includes(j.status));
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const pipelineJobs = useMemo(
    () =>
      jobs.filter(
        (j) => ACTIVE.includes(j.status) || j.status === 'failed',
      ),
    [jobs],
  );

  const filterCounts = facets;

  // 服务端已筛选；本地再合并进度后，搜索词由服务端处理
  const filtered = library;

  const playItem = (item: LibraryItem, opts?: { openPlayer?: boolean }) => {
    if (opts?.openPlayer) {
      if (player.track?.id !== item.job.id) {
        const listen = mergeListenRecord(item.job.id, item.listen);
        player.playTrack(trackFromJob(item.job), {
          autoplay: true,
          resume: true,
          serverProgress: listen,
          seekTo: bestResumeSec(item.job.id, listen),
        });
      }
      navigate({ name: 'player', id: item.job.id });
      return;
    }

    if (player.track?.id === item.job.id) {
      player.toggle();
      return;
    }

    const listen = mergeListenRecord(item.job.id, item.listen);
    player.playTrack(trackFromJob(item.job), {
      autoplay: true,
      resume: true,
      serverProgress: listen,
      seekTo: bestResumeSec(item.job.id, listen),
    });
  };

  const isPlayingId = player.track?.id;
  const isPlaying = player.playing;

  const libraryCount = total;
  const headSub = loading
    ? t('home.loading')
    : libraryCount
      ? t('home.count', { n: libraryCount })
      : t('home.emptyHint');

  return (
    <AppShell route={route}>
      <div className="lh-page nl-enter">
        <div className="page-container app-page lh-body">
          <PageHeader title={t('home.title')} subtitle={headSub} />

          {error && <div className="lh-error">{error}</div>}

          {!loading && pipelineJobs.length > 0 && (
            <section className="lh-pipeline">
              <div className="lh-section-head">
                <h2 className="lh-section-title">{t('home.producing')}</h2>
                <span className="lh-section-meta">{pipelineJobs.length}</span>
              </div>
              <div className="lh-pipeline-list">
                {pipelineJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className="lh-pipeline-item"
                    onClick={() => navigate({ name: 'job', id: job.id })}
                  >
                    <CoverArt
                      seed={job.id}
                      preferred={job.podcast?.coverGradient}
                      imageUrl={
                        job.podcast?.hasCoverImage
                          ? coverImageUrl(job.id, job.updatedAt)
                          : undefined
                      }
                      title={job.podcast?.title || job.title}
                      className="lh-pipeline-cover"
                    />
                    <div className="lh-pipeline-body">
                      <div className="lh-pipeline-title">
                        {job.podcast?.title || job.title}
                      </div>
                      <div className="lh-pipeline-sub">
                        <StatusBadge status={job.status} />
                        <span>{job.message || t('common.processing')}</span>
                      </div>
                      {ACTIVE.includes(job.status) && (
                        <ProgressBar value={job.progress || 0} />
                      )}
                      {job.status === 'failed' && job.error && (
                        <div className="lh-pipeline-error">{job.error}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!loading && albums.length > 0 && (
            <section className="lh-albums">
              <div className="lh-section-head">
                <h2 className="lh-section-title">{t('album.homeTitle')}</h2>
                <button
                  type="button"
                  className="lh-section-link"
                  onClick={() => navigate({ name: 'albums' })}
                >
                  {t('album.viewAll')}
                </button>
              </div>
              <div className="lh-album-rail">
                {albums.slice(0, 12).map((album) => {
                  const coverId =
                    album.resolvedCoverJobId || album.coverJobId || album.id;
                  return (
                    <button
                      key={album.id}
                      type="button"
                      className="lh-album-card"
                      onClick={() => navigate({ name: 'album', id: album.id })}
                    >
                      <CoverArt
                        seed={coverId}
                        preferred={album.coverGradient}
                        title={album.title}
                        imageUrl={
                          album.hasOwnCoverImage
                            ? albumCoverUrl(album.id, album.updatedAt)
                            : album.hasCoverImage && album.resolvedCoverJobId
                              ? coverImageUrl(
                                  album.resolvedCoverJobId,
                                  album.updatedAt,
                                )
                              : null
                        }
                        className="lh-album-cover"
                      />
                      <span className="lh-album-title">{album.title}</span>
                      <span className="lh-album-meta">
                        {t('album.itemCount', { n: album.itemCount })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

                    {loading ? (
            <Masonry
              className="lh-masonry"
              items={SKEL_ITEMS}
              config={MASONRY_CONFIG}
              render={(i) => (
                <div
                  className={[
                    'nl-shimmer',
                    'lh-skel-card',
                    `is-${(['s', 'm', 't'] as const)[i % 3]}`,
                  ].join(' ')}
                />
              )}
            />
          ) : facets.all === 0 && !debouncedQuery ? (
            <EmptyState
              icon={<BrandMascot size={56} />}
              title={t('home.emptyTitle')}
              description={t('home.emptyDesc')}
              actionLabel={t('home.emptyAction')}
              onAction={() => navigate({ name: 'create' })}
            />
          ) : (
            <>
              <div className="lh-toolbar">
                <div className="lh-filters" role="tablist" aria-label={t('home.filtersAria')}>
                  {FILTER_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={filter === key}
                      className={[
                        'lh-filter',
                        filter === key ? 'is-active' : '',
                      ].join(' ')}
                      onClick={() => setFilter(key)}
                    >
                      <span>{t(FILTER_LABEL_KEY[key])}</span>
                      <em>{filterCounts[key]}</em>
                    </button>
                  ))}
                </div>
                <label className="lh-search">
                  <span className="lh-search-icon" aria-hidden>
                    ⌕
                  </span>
                  <input
                    type="search"
                    className="lh-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('home.searchPlaceholder')}
                    aria-label={t('home.searchAria')}
                  />
                  {query.trim() && (
                    <button
                      type="button"
                      className="lh-search-clear"
                      onClick={() => setQuery('')}
                      aria-label={t('home.clearSearch')}
                    >
                      ×
                    </button>
                  )}
                </label>
              </div>

              {!filtered.length ? (
                <div className="lh-empty-filter">
                  {query.trim() ? t('home.noMatch') : t('home.noFilter')}
                  <button
                    type="button"
                    className="lh-empty-filter-btn"
                    onClick={() => {
                      setFilter('all');
                      setQuery('');
                      setPage(1);
                    }}
                  >
                    {t('home.clearFilters')}
                  </button>
                </div>
              ) : (
                <Masonry
                  className="lh-masonry"
                  role="list"
                  items={filtered}
                  config={MASONRY_CONFIG}
                  render={(item, idx) => (
                    <CoverCard
                      key={item.job.id}
                      item={item}
                      index={idx}
                      size={cardSize(item.job.id)}
                      active={isPlayingId === item.job.id}
                      playing={isPlayingId === item.job.id && isPlaying}
                      onPlay={() => playItem(item)}
                      onOpen={() => playItem(item, { openPlayer: true })}
                      onManage={() =>
                        navigate({ name: 'job', id: item.job.id })
                      }
                    />
                  )}
                />
              )}

              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                disabled={loading}
                onChange={setPage}
              />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CoverCard({
  item,
  index,
  size,
  active,
  playing,
  onPlay,
  onOpen,
  onManage,
}: {
  item: LibraryItem;
  index: number;
  size: 's' | 'm' | 't';
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
  onManage: () => void;
}) {
  const { t } = useI18n();
  const title = itemTitle(item);
  const summary = itemSummary(item, t);
  const pct = itemPct(item);
  const mins = itemMinutes(item, t);
  const badge = item.listen?.completed
    ? t('home.finished')
    : pct > 0
      ? `${Math.round(pct)}%`
      : mins;

  return (
    <article
      role="listitem"
      className={['lh-card', active ? 'is-active' : '', `is-${size}`].join(' ')}
      style={{ ['--stagger' as string]: `${index * 28}ms` }}
    >
      <div className={['lh-card-face', `is-${size}`].join(' ')}>
        <CoverArt
          seed={item.job.id}
          preferred={item.job.podcast?.coverGradient}
          imageUrl={
            item.job.podcast?.hasCoverImage
              ? coverImageUrl(item.job.id, item.job.updatedAt)
              : undefined
          }
          title={title}
          monogram={false}
          className="lh-card-cover"
          aria-hidden
        />

        <button
          type="button"
          className="lh-card-overlay"
          onClick={onOpen}
          aria-label={t('home.openTitle', { title })}
        >
          <div className="lh-card-top">
            <span className="lh-card-badge">{badge}</span>
            <h2 className="lh-card-title">{title}</h2>
          </div>
          <p className="lh-card-desc">{summary}</p>
        </button>

        <button
          type="button"
          className="lh-card-play"
          onClick={onPlay}
          aria-label={playing ? t('common.pause') : t('home.playTitle', { title })}
        >
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>

        <button
          type="button"
          className="lh-card-manage"
          onClick={onManage}
          aria-label={t('home.manageTitle', { title })}
          title={t('common.manage')}
        >
          ···
        </button>

        {pct > 0 && !item.listen?.completed && (
          <span className="lh-card-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
    </article>
  );
}
