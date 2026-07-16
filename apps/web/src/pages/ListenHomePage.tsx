import { useEffect, useMemo, useState } from 'react';
import { fetchHistory, fetchLibrary } from '../api/client';
import { IconLibrary, IconPlay, IconSpark } from '../components/icons';
import { CoverArt } from '../components/ui/CoverArt';
import { EmptyState } from '../components/ui/EmptyState';
import {
  coverGradientFor,
  formatDuration,
  formatTime,
  listenProgressPct,
} from '../lib/format';
import { navigate, type Route } from '../lib/router';
import type { LibraryItem } from '../types/job';
import { AppShell } from '../layouts/AppShell';
import { usePlayer } from '../player/PlayerContext';
import { trackFromJob } from '../player/trackFromJob';
import { bestResumeSec, mergeListenRecord } from '../player/listenProgress';

function greetingByHour(h = new Date().getHours()): string {
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了';
}

export function ListenHomePage({ route }: { route: Route }) {
  const player = usePlayer();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [history, setHistory] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchLibrary(), fetchHistory()])
      .then(([lib, his]) => {
        const withLocal = (items: LibraryItem[]) =>
          items.map((it) => ({
            ...it,
            listen: mergeListenRecord(it.job.id, it.listen),
          }));
        setLibrary(withLocal(lib));
        setHistory(withLocal(his));
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const continueItems = useMemo(
    () =>
      history.filter(
        (i) => i.listen && !i.listen.completed && i.listen.progressSec > 3,
      ),
    [history],
  );

  const recentItems = useMemo(() => {
    const seen = new Set<string>();
    const rows: LibraryItem[] = [];
    for (const it of history) {
      if (seen.has(it.job.id)) continue;
      seen.add(it.job.id);
      rows.push(it);
      if (rows.length >= 12) break;
    }
    if (rows.length < 8) {
      for (const it of library) {
        if (seen.has(it.job.id)) continue;
        seen.add(it.job.id);
        rows.push(it);
        if (rows.length >= 12) break;
      }
    }
    return rows;
  }, [history, library]);

  const featured = continueItems[0] || recentItems[0] || library[0];
  const greeting = useMemo(() => greetingByHour(), []);

  const playItem = (item: LibraryItem, opts?: { openPlayer?: boolean }) => {
    const listen = mergeListenRecord(item.job.id, item.listen);
    player.playTrack(trackFromJob(item.job), {
      autoplay: true,
      resume: true,
      serverProgress: listen,
      seekTo: bestResumeSec(item.job.id, listen),
    });
    if (opts?.openPlayer) {
      navigate({ name: 'player', id: item.job.id });
    }
  };

  const isPlayingId = player.track?.id;
  const isPlaying = player.playing;

  return (
    <AppShell route={route}>
      <div className="listen-page nl-enter">
        {/* 顶栏：问候 + 快捷入口 */}
        <header className="listen-top page-container">
          <div className="listen-top-main">
            <div className="listen-greet">{greeting}</div>
            <h1 className="listen-title">私人播客</h1>
          </div>
          <button
            type="button"
            className="listen-top-action"
            onClick={() => navigate({ name: 'admin' })}
            aria-label="管理"
          >
            <IconSpark size={15} />
            <span>管理</span>
          </button>
        </header>

        <div className="page-container listen-body">
          {error && (
            <div className="listen-error">{error}</div>
          )}

          {loading ? (
            <ListenSkeleton />
          ) : !library.length && !history.length ? (
            <EmptyState
              icon={<IconLibrary size={22} />}
              title="还没有可听内容"
              description="上传视频生成播客后，会像歌单一样出现在这里"
              actionLabel="去上传"
              onAction={() => navigate({ name: 'admin-upload' })}
            />
          ) : (
            <>
              {/* 主推 Banner · 网易云每日推荐感 */}
              {featured && (
                <section className="listen-section">
                  <NcBanner
                    item={featured}
                    isContinue={Boolean(continueItems[0])}
                    playing={isPlayingId === featured.job.id && isPlaying}
                    onPlay={() => playItem(featured)}
                    onOpen={() => playItem(featured, { openPlayer: true })}
                  />
                </section>
              )}

              {/* 快捷入口 */}
              <section className="listen-section">
                <div className="nc-chips">
                  <button
                    type="button"
                    className="nc-chip is-primary"
                    onClick={() => {
                      if (featured) playItem(featured);
                      else navigate({ name: 'admin-upload' });
                    }}
                  >
                    <IconPlay size={12} />
                    {continueItems[0] ? '继续播放' : '开始播放'}
                  </button>
                  <button
                    type="button"
                    className="nc-chip"
                    onClick={() => {
                      const el = document.getElementById('listen-all');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    全部 {library.length}
                  </button>
                  <button
                    type="button"
                    className="nc-chip"
                    onClick={() => {
                      const el = document.getElementById('listen-recent');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    最近 {history.length}
                  </button>
                  <button
                    type="button"
                    className="nc-chip"
                    onClick={() => navigate({ name: 'admin-upload' })}
                  >
                    上传
                  </button>
                </div>
              </section>

              {/* 最近播放 · 横向封面轨 */}
              {recentItems.length > 0 && (
                <section className="listen-section" id="listen-recent">
                  <NcSectionTitle
                    title="最近播放"
                    more={
                      history.length > 0
                        ? `${history.length} 条记录`
                        : undefined
                    }
                  />
                  <div className="nc-h-scroll">
                    {recentItems.map((item, idx) => (
                      <RecentCover
                        key={item.job.id}
                        item={item}
                        index={idx}
                        active={isPlayingId === item.job.id}
                        playing={isPlayingId === item.job.id && isPlaying}
                        onPlay={() => playItem(item)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 继续收听 · 未完成 */}
              {continueItems.length > 0 && (
                <section className="listen-section">
                  <NcSectionTitle title="继续收听" more={`${continueItems.length} 集未听完`} />
                  <div className="nc-continue-list">
                    {continueItems.slice(0, 6).map((item, idx) => (
                      <ContinueRow
                        key={item.job.id}
                        item={item}
                        index={idx}
                        active={isPlayingId === item.job.id}
                        playing={isPlayingId === item.job.id && isPlaying}
                        onPlay={() => playItem(item)}
                        onOpen={() => playItem(item, { openPlayer: true })}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 推荐 / 全部 · 封面网格 */}
              <section className="listen-section" id="listen-all">
                <NcSectionTitle
                  title="推荐播客"
                  more={library.length ? `${library.length} 集` : undefined}
                />
                {!library.length ? (
                  <p className="listen-empty-tip">后台发布后会出现在这里</p>
                ) : (
                  <div className="nc-cover-grid">
                    {library.map((item, idx) => (
                      <AlbumCard
                        key={item.job.id}
                        item={item}
                        index={idx}
                        active={isPlayingId === item.job.id}
                        playing={isPlayingId === item.job.id && isPlaying}
                        onPlay={() => playItem(item)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* 播放历史 · 歌曲列表感 */}
              {history.length > 0 && (
                <section className="listen-section">
                  <NcSectionTitle title="播放历史" more="按最近听过排序" />
                  <div className="nc-song-list">
                    {history.map((item, idx) => (
                      <SongRow
                        key={`${item.job.id}-${idx}`}
                        item={item}
                        index={idx}
                        active={isPlayingId === item.job.id}
                        playing={isPlayingId === item.job.id && isPlaying}
                        onPlay={() => playItem(item)}
                        onOpen={() => playItem(item, { openPlayer: true })}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function NcSectionTitle({ title, more }: { title: string; more?: string }) {
  return (
    <div className="nc-sec-head">
      <h2 className="nc-sec-title">{title}</h2>
      {more && <span className="nc-sec-more">{more}</span>}
    </div>
  );
}

function NcBanner({
  item,
  isContinue,
  playing,
  onPlay,
  onOpen,
}: {
  item: LibraryItem;
  isContinue: boolean;
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
  const grad = coverGradientFor(item.job.id, item.job.podcast?.coverGradient);
  const title = item.job.podcast?.title || item.job.title;
  const summary = item.job.podcast?.summary;

  return (
    <div className="nc-banner">
      <div className={`nc-banner-bg bg-gradient-to-br ${grad}`} aria-hidden />
      <div className="nc-banner-inner">
        <button
          type="button"
          className="nc-banner-cover-btn"
          onClick={onOpen}
          aria-label="打开播放页"
        >
          <CoverArt
            seed={item.job.id}
            preferred={item.job.podcast?.coverGradient}
            title={title}
            className="nc-banner-cover"
          />
          <span className="nc-banner-vinyl" aria-hidden />
        </button>

        <div className="nc-banner-meta">
          <div className="nc-banner-badge">
            {isContinue ? '继续播放' : '今日推荐'}
            {isContinue && pct > 0 ? ` · ${Math.round(pct)}%` : ''}
          </div>
          <button type="button" className="nc-banner-title" onClick={onOpen}>
            {title}
          </button>
          {summary && <p className="nc-banner-desc">{summary}</p>}
          <div className="nc-banner-foot">
            <span className="nc-banner-mins">
              {item.job.podcast?.estimatedMinutes
                ? `${item.job.podcast.estimatedMinutes} 分钟`
                : '播客'}
            </span>
            <button type="button" className="nc-banner-play" onClick={onPlay}>
              <IconPlay size={14} />
              {playing ? '播放中' : isContinue ? '接着听' : '立即播放'}
            </button>
          </div>
          {pct > 0 && !item.listen?.completed && (
            <div className="nc-banner-progress">
              <i style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentCover({
  item,
  index,
  active,
  playing,
  onPlay,
}: {
  item: LibraryItem;
  index: number;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
}) {
  const title = item.job.podcast?.title || item.job.title;
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);

  return (
    <button
      type="button"
      className={['nc-recent', active ? 'is-active' : ''].join(' ')}
      style={{ ['--stagger' as string]: `${index * 30}ms` }}
      onClick={onPlay}
    >
      <CoverArt
        seed={item.job.id}
        preferred={item.job.podcast?.coverGradient}
        title={title}
        className="nc-recent-art"
      >
        <span className="nc-recent-play">
          <IconPlay size={14} />
        </span>
        {playing && <span className="nc-eq" aria-hidden><i /><i /><i /></span>}
        {pct > 0 && !item.listen?.completed && (
          <span className="nc-recent-bar">
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </CoverArt>
      <div className="nc-recent-title">{title}</div>
    </button>
  );
}

function ContinueRow({
  item,
  index,
  active,
  playing,
  onPlay,
  onOpen,
}: {
  item: LibraryItem;
  index: number;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
  const title = item.job.podcast?.title || item.job.title;
  const left = Math.max(
    0,
    (item.listen?.durationSec || 0) - (item.listen?.progressSec || 0),
  );

  return (
    <div
      className={['nc-continue-row', active ? 'is-active' : ''].join(' ')}
      style={{ ['--stagger' as string]: `${index * 28}ms` }}
    >
      <button type="button" className="nc-continue-main" onClick={onPlay}>
        <CoverArt
          seed={item.job.id}
          preferred={item.job.podcast?.coverGradient}
          title={title}
          className="nc-continue-cover"
        >
          {playing ? (
            <span className="nc-eq is-dark" aria-hidden><i /><i /><i /></span>
          ) : (
            <IconPlay size={12} />
          )}
        </CoverArt>
        <div className="min-w-0 flex-1">
          <div className="nc-continue-title">{title}</div>
          <div className="nc-continue-sub">
            已听 {Math.round(pct)}%
            {left > 0 ? ` · 剩余 ${formatDuration(left)}` : ''}
          </div>
          <div className="nc-continue-progress">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>
      <button type="button" className="nc-row-more" onClick={onOpen} aria-label="打开详情">
        详情
      </button>
    </div>
  );
}

function AlbumCard({
  item,
  index,
  active,
  playing,
  onPlay,
}: {
  item: LibraryItem;
  index: number;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
}) {
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
  const title = item.job.podcast?.title || item.job.title;

  return (
    <button
      type="button"
      className={['nc-album', active ? 'is-active' : ''].join(' ')}
      style={{ ['--stagger' as string]: `${index * 28}ms` }}
      onClick={onPlay}
    >
      <CoverArt
        seed={item.job.id}
        preferred={item.job.podcast?.coverGradient}
        title={title}
        className="nc-album-art"
      >
        <span className="nc-album-play">
          {playing ? (
            <span className="nc-eq" aria-hidden><i /><i /><i /></span>
          ) : (
            <IconPlay size={13} />
          )}
        </span>
        {pct > 0 && (
          <span className="nc-album-bar">
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </CoverArt>
      <div className="nc-album-title">{title}</div>
      <div className="nc-album-sub">
        {item.job.podcast?.estimatedMinutes
          ? `${item.job.podcast.estimatedMinutes} 分钟`
          : '播客'}
        {item.listen?.completed
          ? ' · 已听完'
          : pct > 0
            ? ` · ${Math.round(pct)}%`
            : item.listen?.playCount
              ? ` · ${item.listen.playCount} 次`
              : ''}
      </div>
    </button>
  );
}

function SongRow({
  item,
  index,
  active,
  playing,
  onPlay,
  onOpen,
}: {
  item: LibraryItem;
  index: number;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
  const title = item.job.podcast?.title || item.job.title;

  return (
    <div
      className={['nc-song', active ? 'is-active' : ''].join(' ')}
      style={{ ['--stagger' as string]: `${index * 24}ms` }}
    >
      <button type="button" className="nc-song-main" onClick={onPlay}>
        <span className="nc-song-idx">
          {playing ? (
            <span className="nc-eq is-brand" aria-hidden><i /><i /><i /></span>
          ) : (
            String(index + 1).padStart(2, '0')
          )}
        </span>
        <CoverArt
          seed={item.job.id}
          preferred={item.job.podcast?.coverGradient}
          title={title}
          className="nc-song-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="nc-song-title">{title}</div>
          <div className="nc-song-sub">
            {formatTime(item.listen?.lastListenedAt)}
            {item.listen?.completed
              ? ' · 已听完'
              : pct > 0
                ? ` · ${Math.round(pct)}%`
                : ''}
            {item.listen?.playCount ? ` · ${item.listen.playCount} 次` : ''}
          </div>
        </div>
      </button>
      <button type="button" className="nc-row-more" onClick={onOpen} aria-label="打开播放页">
        打开
      </button>
    </div>
  );
}

function ListenSkeleton() {
  return (
    <div className="listen-skeleton">
      <div className="nl-shimmer nc-banner-skel" />
      <div className="nc-chips">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="nl-shimmer nc-chip-skel" />
        ))}
      </div>
      <div className="nc-h-scroll">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="nl-shimmer nc-recent-skel" />
        ))}
      </div>
      <div className="nc-cover-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="nl-shimmer nc-album-skel" />
        ))}
      </div>
    </div>
  );
}
