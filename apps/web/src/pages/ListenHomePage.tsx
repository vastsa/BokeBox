import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Masonry } from 'react-plock';
import {
  albumCoverUrl,
  coverImageUrl,
  fetchJobs,
  fetchLibrary,
  fetchListenAlbums,
} from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { LibraryListFacets, LibraryListFilter } from '../types/pagination';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { CoverArt } from '../components/ui/CoverArt';
import { BrandMascot } from '../components/BrandMark';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { getToken } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import type { Job, LibraryItem } from '../types/job';
import type { AlbumSummary } from '../types/album';
import { useI18n } from '../i18n';
import { AppShell } from '../layouts/AppShell';
import { usePlayer } from '../player/PlayerContext';
import { trackFromJob } from '../player/trackFromJob';
import { bestResumeSec, mergeListenRecord } from '../player/listenProgress';

import {
  ACTIVE,
  DEFAULT_LIBRARY_PAGE_SIZE,
  EMPTY_LIB_FACETS,
  MASONRY_CONFIG,
  SKEL_ITEMS,
  cardSize,
  estimateLibraryPageSize,
  type FilterKey,
} from '../features/listen-home/libraryModel';
import { CoverCard } from '../features/listen-home/CoverCard';
import { LibraryFilters } from '../features/listen-home/LibraryFilters';

export function ListenHomePage({ route }: { route: Route }) {
  const { t } = useI18n();
  const player = usePlayer();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  /** 首屏/筛选重置加载 */
  const [initialLoading, setInitialLoading] = useState(true);
  /** 触底追加加载 */
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [facets, setFacets] = useState<LibraryListFacets>(EMPTY_LIB_FACETS);
  const refreshIdRef = useRef(0);
  const pageRef = useRef(1);
  /** 本轮分页统一 pageSize：重置时按视口重算，滚动中途不改，避免页码错位 */
  const pageSizeRef = useRef(DEFAULT_LIBRARY_PAGE_SIZE);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const mapLibraryItems = useCallback(
    (items: LibraryItem[], authed: boolean): LibraryItem[] =>
      items.map((it) => ({
        ...it,
        listen: mergeListenRecord(it.job.id, authed ? it.listen : null),
      })),
    [],
  );

  const applyLibraryPage = useCallback(
    (
      libRes: Awaited<ReturnType<typeof fetchLibrary>>,
      mode: 'replace' | 'append',
      authed: boolean,
    ) => {
      const items = mapLibraryItems(libRes.items, authed);
      setTotal(libRes.total);
      setFacets(libRes.facets || EMPTY_LIB_FACETS);
      const nextPage = libRes.page || 1;
      // 空页直接视为到底，避免哨兵反复触发
      const nextHasMore =
        items.length > 0 && nextPage < (libRes.totalPages || 1);
      pageRef.current = nextPage;
      setHasMore(nextHasMore);
      hasMoreRef.current = nextHasMore;

      if (mode === 'replace') {
        setLibrary(items);
        return;
      }

      if (!items.length) return;

      setLibrary((prev) => {
        if (!prev.length) return items;
        const seen = new Set(prev.map((it) => it.job.id));
        const extra = items.filter((it) => !seen.has(it.job.id));
        return extra.length ? [...prev, ...extra] : prev;
      });
    },
    [mapLibraryItems],
  );

  /** 拉曲库单页；replace=首屏/筛选重置，append=瀑布流触底 */
  const fetchLibrarySlice = useCallback(
    async (targetPage: number, mode: 'replace' | 'append', refreshId: number) => {
      const authed = Boolean(getToken());
      const libRes = await fetchLibrary({
        page: targetPage,
        pageSize: pageSizeRef.current,
        q: debouncedQuery,
        filter: filter as LibraryListFilter,
      });
      if (refreshId !== refreshIdRef.current) return null;
      applyLibraryPage(libRes, mode, authed);
      return { authed, libRes };
    },
    [applyLibraryPage, debouncedQuery, filter],
  );

  /** 拉取制作中/失败任务 + 专辑横条（仅首屏或任务完成时） */
  const fetchSidePanels = useCallback(async (refreshId: number) => {
    const authed = Boolean(getToken());
    if (!authed) {
      const alRes = await fetchListenAlbums({ page: 1, pageSize: 12 }).catch(
        () => null,
      );
      if (refreshId !== refreshIdRef.current) return;
      setAlbums(alRes?.albums || []);
      setJobs([]);
      return;
    }

    // 一次 pipeline 请求拿制作中 + 失败；轮询仍只打 active。
    const [pipelineRes, alRes] = await Promise.all([
      fetchJobs({
        page: 1,
        pageSize: 50,
        filter: 'pipeline',
        includeFacets: false,
      }).catch(() => null),
      fetchListenAlbums({ page: 1, pageSize: 12 }).catch(() => null),
    ]);
    if (refreshId !== refreshIdRef.current) return;

    setAlbums(alRes?.albums || []);
    setJobs(pipelineRes?.jobs || []);
  }, []);

  /**
   * 重置并加载第 1 页（筛选/搜索/首屏/任务完成）。
   * withSidePanels：同时刷新制作中任务与专辑。
   */
  const reloadFromStart = useCallback(
    async (opts?: { withSidePanels?: boolean }) => {
      const refreshId = ++refreshIdRef.current;
      const withSide = opts?.withSidePanels !== false;
      setInitialLoading(true);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      setHasMore(true);
      hasMoreRef.current = true;
      pageRef.current = 1;
      // 筛选/搜索/首屏重置时按当前视口重算每页条数
      pageSizeRef.current = estimateLibraryPageSize();

      try {
        const tasks: Promise<unknown>[] = [
          fetchLibrarySlice(1, 'replace', refreshId),
        ];
        if (withSide) tasks.push(fetchSidePanels(refreshId));
        await Promise.all(tasks);
        if (refreshId !== refreshIdRef.current) return;
        setError(null);
      } catch (e) {
        if (refreshId !== refreshIdRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (refreshId === refreshIdRef.current) setInitialLoading(false);
      }
    },
    [fetchLibrarySlice, fetchSidePanels],
  );

  /** 任务完成后：保留已滚动深度，按已加载条数一次回填，避免跳回顶部 */
  const softRefreshLibrary = useCallback(async () => {
    const refreshId = ++refreshIdRef.current;
    const unit = Math.max(1, pageSizeRef.current);
    const loaded = Math.max(pageRef.current * unit, unit);
    const pageSize = Math.min(100, loaded);
    try {
      const authed = Boolean(getToken());
      const [libRes] = await Promise.all([
        fetchLibrary({
          page: 1,
          pageSize,
          q: debouncedQuery,
          filter: filter as LibraryListFilter,
        }),
        fetchSidePanels(refreshId),
      ]);
      if (refreshId !== refreshIdRef.current) return;

      const items = mapLibraryItems(libRes.items, authed);
      setLibrary(items);
      setTotal(libRes.total);
      setFacets(libRes.facets || EMPTY_LIB_FACETS);
      // 用「已加载条数」反推页码，继续触底分页
      const approxPage = Math.max(1, Math.ceil(items.length / unit));
      pageRef.current = approxPage;
      const nextHasMore = items.length < (libRes.total || 0);
      setHasMore(nextHasMore);
      hasMoreRef.current = nextHasMore;
      setError(null);
    } catch (e) {
      if (refreshId !== refreshIdRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [debouncedQuery, fetchSidePanels, filter, mapLibraryItems]);

  const loadMore = useCallback(async () => {
    if (initialLoading || loadingMoreRef.current || !hasMoreRef.current) return;
    const nextPage = pageRef.current + 1;
    const refreshId = refreshIdRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchLibrarySlice(nextPage, 'append', refreshId);
      if (refreshId !== refreshIdRef.current) return;
      setError(null);
    } catch (e) {
      if (refreshId !== refreshIdRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (refreshId === refreshIdRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [fetchLibrarySlice, initialLoading]);

  // 筛选 / 搜索变化：重置瀑布流
  useEffect(() => {
    void reloadFromStart({ withSidePanels: true });
    return () => {
      refreshIdRef.current += 1;
    };
  }, [debouncedQuery, filter, reloadFromStart]);

  // 触底哨兵：进入视口后追加下一页
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || initialLoading) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root: null, rootMargin: '320px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [initialLoading, loadMore, library.length, hasMore]);

  // 有进行中任务时只轮询活跃任务，避免每 2 秒重复刷新曲库。
  useEffect(() => {
    const previousActive = jobs.filter((j) => ACTIVE.includes(j.status));
    if (previousActive.length === 0) return;

    let polling = false;
    let cancelled = false;
    const pollActiveJobs = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await fetchJobs({
          page: 1,
          pageSize: 50,
          filter: 'active',
          includeFacets: false,
        });
        if (cancelled) return;
        const nextActive = result.jobs || [];
        const nextIds = new Set(nextActive.map((job) => job.id));
        const hasFinished = previousActive.some((job) => !nextIds.has(job.id));

        if (hasFinished) {
          // 完成或失败会影响曲库/失败列表，保留滚动深度做一次回填。
          await softRefreshLibrary();
          return;
        }

        setJobs((current) => [
          ...nextActive,
          ...current.filter((job) => job.status === 'failed'),
        ]);
      } catch {
        // 短暂网络错误交给下一轮轮询恢复，首页现有内容保持不变。
      } finally {
        polling = false;
      }
    };

    const timer = window.setInterval(() => void pollActiveJobs(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobs, softRefreshLibrary]);

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
          queue: library.map((x) => trackFromJob(x.job)),
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
      queue: library.map((x) => trackFromJob(x.job)),
    });
  };

  const isPlayingId = player.track?.id;
  const isPlaying = player.playing;

  const libraryCount = total;
  const headSub = initialLoading
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

          {!initialLoading && pipelineJobs.length > 0 && (
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

          {!initialLoading && albums.length > 0 && (
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

          {initialLoading ? (
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
                <LibraryFilters
                  filter={filter}
                  counts={filterCounts}
                  onChange={setFilter}
                />
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

              <div className="lh-infinite-foot" aria-live="polite">
                <div ref={sentinelRef} className="lh-infinite-sentinel" aria-hidden />
                {loadingMore ? (
                  <div className="lh-infinite-status">
                    <span className="lh-infinite-spinner" aria-hidden />
                    <span>{t('home.loadingMore')}</span>
                  </div>
                ) : hasMore ? (
                  <button
                    type="button"
                    className="lh-infinite-more"
                    onClick={() => void loadMore()}
                  >
                    {t('home.loadMore')}
                  </button>
                ) : filtered.length > 0 ? (
                  <div className="lh-infinite-status is-done">
                    {t('home.noMore', { n: total })}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

