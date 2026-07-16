import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchHistory,
  fetchJobs,
  fetchLibrary,
} from '../api/client';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import {
  IconLibrary,
  IconPause,
  IconPlay,
} from '../components/icons';
import { CoverArt } from '../components/ui/CoverArt';
import { EmptyState } from '../components/ui/EmptyState';
import {
  formatDuration,
  hashSeed,
  listenProgressPct,
} from '../lib/format';
import { navigate, type Route } from '../lib/router';
import type { Job, JobStatus, LibraryItem } from '../types/job';
import { AppShell } from '../layouts/AppShell';
import { usePlayer } from '../player/PlayerContext';
import { trackFromJob } from '../player/trackFromJob';
import { bestResumeSec, mergeListenRecord } from '../player/listenProgress';

const ACTIVE: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'synthesizing_audio',
];

type FilterKey = 'all' | 'unplayed' | 'progress' | 'done';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unplayed', label: '未听' },
  { key: 'progress', label: '在听' },
  { key: 'done', label: '听完' },
];

function itemTitle(item: LibraryItem): string {
  return item.job.podcast?.title || item.job.title;
}

function itemSummary(item: LibraryItem): string {
  return (
    item.job.podcast?.summary?.trim() ||
    item.job.podcast?.hostIntro?.trim() ||
    '暂无简介'
  );
}

function itemMinutes(item: LibraryItem): string {
  const mins = item.job.podcast?.estimatedMinutes;
  if (mins && mins > 0) return `${mins} 分钟`;
  if (item.listen?.durationSec) return formatDuration(item.listen.durationSec);
  return '播客';
}

function itemPct(item: LibraryItem): number {
  return listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
}

function matchFilter(item: LibraryItem, filter: FilterKey): boolean {
  const pct = itemPct(item);
  const completed = Boolean(item.listen?.completed);
  if (filter === 'all') return true;
  if (filter === 'done') return completed;
  if (filter === 'progress') return !completed && pct > 0;
  // unplayed
  return !completed && pct <= 0;
}

function matchQuery(item: LibraryItem, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    itemTitle(item),
    itemSummary(item),
    item.job.originalFilename || '',
    ...(item.job.podcast?.tags || []),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** 瀑布流高度变体：短 / 中 / 高 */
function cardSize(seed: string): 's' | 'm' | 't' {
  const n = hashSeed(seed) % 3;
  return n === 0 ? 's' : n === 1 ? 'm' : 't';
}

export function ListenHomePage({ route }: { route: Route }) {
  const player = usePlayer();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [lib, his, allJobs] = await Promise.all([
        fetchLibrary(),
        fetchHistory(),
        fetchJobs(),
      ]);
      const progressMap = new Map(
        his.map((it) => [it.job.id, mergeListenRecord(it.job.id, it.listen)]),
      );
      setLibrary(
        lib.map((it) => ({
          ...it,
          listen:
            progressMap.get(it.job.id) ||
            mergeListenRecord(it.job.id, it.listen),
        })),
      );
      setJobs(allJobs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 有进行中任务时轮询
  useEffect(() => {
    const active = jobs.some((j) => ACTIVE.includes(j.status));
    if (!active) return;
    const t = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(t);
  }, [jobs, refresh]);

  const pipelineJobs = useMemo(
    () =>
      jobs.filter(
        (j) => ACTIVE.includes(j.status) || j.status === 'failed',
      ),
    [jobs],
  );

  const queried = useMemo(
    () => library.filter((item) => matchQuery(item, query)),
    [library, query],
  );

  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: queried.length,
      unplayed: 0,
      progress: 0,
      done: 0,
    };
    for (const item of queried) {
      if (matchFilter(item, 'done')) counts.done += 1;
      else if (matchFilter(item, 'progress')) counts.progress += 1;
      else counts.unplayed += 1;
    }
    return counts;
  }, [queried]);

  const filtered = useMemo(
    () => queried.filter((item) => matchFilter(item, filter)),
    [queried, filter],
  );

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

  return (
    <AppShell route={route}>
      <div className="lh-page nl-enter">
        <div className="page-container lh-body">
          {error && <div className="lh-error">{error}</div>}

          {!loading && pipelineJobs.length > 0 && (
            <section className="lh-pipeline">
              <div className="lh-section-head">
                <h2 className="lh-section-title">制作中</h2>
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
                      title={job.podcast?.title || job.title}
                      className="lh-pipeline-cover"
                    />
                    <div className="lh-pipeline-body">
                      <div className="lh-pipeline-title">
                        {job.podcast?.title || job.title}
                      </div>
                      <div className="lh-pipeline-sub">
                        <StatusBadge status={job.status} />
                        <span>{job.message || '处理中'}</span>
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

          {loading ? (
            <div className="lh-masonry">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={[
                    'nl-shimmer',
                    'lh-skel-card',
                    `is-${(['s', 'm', 't'] as const)[i % 3]}`,
                  ].join(' ')}
                />
              ))}
            </div>
          ) : !library.length ? (
            <EmptyState
              icon={<IconLibrary size={22} />}
              title="还没有可听内容"
              description="上传视频或链接，生成播客后会出现在这里"
              actionLabel="开始制作"
              onAction={() => navigate({ name: 'create' })}
            />
          ) : (
            <>
              <div className="lh-toolbar">
                <div className="lh-filters" role="tablist" aria-label="筛选">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.key}
                      className={[
                        'lh-filter',
                        filter === f.key ? 'is-active' : '',
                      ].join(' ')}
                      onClick={() => setFilter(f.key)}
                    >
                      <span>{f.label}</span>
                      <em>{filterCounts[f.key]}</em>
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
                    placeholder="搜索关键词"
                    aria-label="搜索关键词"
                  />
                  {query.trim() && (
                    <button
                      type="button"
                      className="lh-search-clear"
                      onClick={() => setQuery('')}
                      aria-label="清除搜索"
                    >
                      ×
                    </button>
                  )}
                </label>
              </div>

              {!filtered.length ? (
                <div className="lh-empty-filter">
                  {query.trim() ? '没有匹配的播客' : '当前筛选下没有内容'}
                  <button
                    type="button"
                    className="lh-empty-filter-btn"
                    onClick={() => {
                      setFilter('all');
                      setQuery('');
                    }}
                  >
                    清除条件
                  </button>
                </div>
              ) : (
                <div className="lh-masonry" role="list">
                  {filtered.map((item, idx) => (
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
                  ))}
                </div>
              )}
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
  const title = itemTitle(item);
  const summary = itemSummary(item);
  const pct = itemPct(item);
  const mins = itemMinutes(item);
  const badge = item.listen?.completed
    ? '已听完'
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
          title={title}
          monogram={false}
          className="lh-card-cover"
          aria-hidden
        />

        <button
          type="button"
          className="lh-card-overlay"
          onClick={onOpen}
          aria-label={`打开 ${title}`}
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
          aria-label={playing ? '暂停' : `播放 ${title}`}
        >
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>

        <button
          type="button"
          className="lh-card-manage"
          onClick={onManage}
          aria-label={`管理 ${title}`}
          title="管理"
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
