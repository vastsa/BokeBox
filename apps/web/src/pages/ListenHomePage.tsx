import { useEffect, useMemo, useState } from 'react';
import { fetchHistory, fetchLibrary } from '../api/client';
import {
  IconHeadphones,
  IconLibrary,
  IconPause,
  IconPlay,
  IconSpark,
  IconUpload,
} from '../components/icons';
import { CoverArt } from '../components/ui/CoverArt';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDuration, listenProgressPct } from '../lib/format';
import { navigate, type Route } from '../lib/router';
import type { LibraryItem } from '../types/job';
import { AppShell } from '../layouts/AppShell';
import { usePlayer } from '../player/PlayerContext';
import { trackFromJob } from '../player/trackFromJob';
import { bestResumeSec, mergeListenRecord } from '../player/listenProgress';

function greetingByHour(h = new Date().getHours()): string {
  if (h < 6) return '夜深了，适合安静听一段';
  if (h < 11) return '早上好，开始今天的收听';
  if (h < 14) return '中午好，放松听一会儿';
  if (h < 18) return '下午好，继续你的播客';
  if (h < 22) return '晚上好，沉浸式收听';
  return '夜深了，适合安静听一段';
}

function itemTitle(item: LibraryItem): string {
  return item.job.podcast?.title || item.job.title;
}

function itemMinutes(item: LibraryItem): string {
  const mins = item.job.podcast?.estimatedMinutes;
  if (mins && mins > 0) return `${mins} 分钟`;
  if (item.listen?.durationSec) return formatDuration(item.listen.durationSec);
  return '播客';
}

function itemMeta(item: LibraryItem): string {
  const parts = [itemMinutes(item)];
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
  if (item.listen?.completed) parts.push('已听完');
  else if (pct > 0) parts.push(`${Math.round(pct)}%`);
  if (item.listen?.playCount) parts.push(`${item.listen.playCount} 次`);
  return parts.join(' · ');
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

  // 未听完：按最近听过排序（history 已是最近序）
  const continueItems = useMemo(
    () =>
      history.filter(
        (i) => i.listen && !i.listen.completed && i.listen.progressSec > 3,
      ),
    [history],
  );

  // 主推荐：优先未听完，否则最新一集
  const featured = continueItems[0] || library[0] || null;
  const featuredId = featured?.job.id;
  const featuredIsContinue = Boolean(
    featured && continueItems[0] && continueItems[0].job.id === featured.job.id,
  );

  // 继续收听轨：去掉主推荐，避免重复
  const continueRail = useMemo(
    () => continueItems.filter((i) => i.job.id !== featuredId).slice(0, 12),
    [continueItems, featuredId],
  );

  const greeting = useMemo(() => greetingByHour(), []);

  const playItem = (item: LibraryItem, opts?: { openPlayer?: boolean }) => {
    const listen = mergeListenRecord(item.job.id, item.listen);
    // 同一曲目 → 播放/暂停切换
    if (player.track?.id === item.job.id && !opts?.openPlayer) {
      player.toggle();
      return;
    }
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
      <div className="lh-page nl-enter">
        <header className="lh-header page-container">
          <div className="lh-brand">
            <span className="brand-mark" aria-hidden>
              <IconHeadphones size={16} />
            </span>
            <div className="lh-brand-text">
              <h1 className="lh-title">私人播客</h1>
              <p className="lh-greet">
                {loading
                  ? '加载中…'
                  : library.length
                    ? `${greeting} · ${library.length} 集`
                    : greeting}
              </p>
            </div>
          </div>
          <div className="lh-header-actions">
            <button
              type="button"
              className="lh-icon-btn"
              onClick={() => navigate({ name: 'admin-upload' })}
              aria-label="上传"
              title="上传"
            >
              <IconUpload size={16} />
            </button>
            <button
              type="button"
              className="lh-icon-btn"
              onClick={() => navigate({ name: 'admin' })}
              aria-label="管理"
              title="管理"
            >
              <IconSpark size={16} />
            </button>
          </div>
        </header>

        <div className="page-container lh-body">
          {error && <div className="lh-error">{error}</div>}

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
              {featured && (
                <section className="lh-section">
                  <FeaturedHero
                    item={featured}
                    isContinue={featuredIsContinue}
                    playing={isPlayingId === featured.job.id && isPlaying}
                    onPlay={() => playItem(featured)}
                    onOpen={() => playItem(featured, { openPlayer: true })}
                  />
                </section>
              )}

              {continueRail.length > 0 && (
                <section className="lh-section">
                  <SectionHead
                    title="继续收听"
                    more={`${continueItems.length} 集未听完`}
                  />
                  <div className="lh-rail" role="list">
                    {continueRail.map((item, idx) => (
                      <ContinueCard
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

              <section className="lh-section" id="listen-all">
                <SectionHead
                  title="全部播客"
                  more={library.length ? `${library.length} 集` : undefined}
                />
                {!library.length ? (
                  <p className="lh-empty-tip">后台发布后会出现在这里</p>
                ) : (
                  <div className="lh-ep-list" role="list">
                    {library.map((item, idx) => (
                      <EpisodeRow
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
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function SectionHead({ title, more }: { title: string; more?: string }) {
  return (
    <div className="lh-sec-head">
      <h2 className="lh-sec-title">{title}</h2>
      {more && <span className="lh-sec-more">{more}</span>}
    </div>
  );
}

function FeaturedHero({
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
  const title = itemTitle(item);
  const summary = item.job.podcast?.summary?.trim();

  return (
    <article className="lh-hero">
      <CoverArt
        seed={item.job.id}
        preferred={item.job.podcast?.coverGradient}
        title={title}
        monogram={false}
        className="lh-hero-bg"
        aria-hidden
      />
      <div className="lh-hero-veil" aria-hidden />

      <div className="lh-hero-inner">
        <button
          type="button"
          className="lh-hero-cover-btn"
          onClick={onOpen}
          aria-label="打开播放页"
        >
          <CoverArt
            seed={item.job.id}
            preferred={item.job.podcast?.coverGradient}
            title={title}
            className="lh-hero-cover"
          />
        </button>

        <div className="lh-hero-meta">
          <div className="lh-hero-badge">
            {isContinue ? '继续收听' : '精选推荐'}
            {isContinue && pct > 0 ? ` · ${Math.round(pct)}%` : ''}
          </div>

          <button type="button" className="lh-hero-title" onClick={onOpen}>
            {title}
          </button>

          {summary && <p className="lh-hero-desc">{summary}</p>}

          <div className="lh-hero-foot">
            <span className="lh-hero-mins">{itemMinutes(item)}</span>
            <button type="button" className="lh-hero-play" onClick={onPlay}>
              {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
              <span>{playing ? '播放中' : isContinue ? '接着听' : '立即播放'}</span>
            </button>
          </div>

          {pct > 0 && !item.listen?.completed && (
            <div className="lh-hero-progress" aria-hidden>
              <i style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ContinueCard({
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
  const title = itemTitle(item);
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);

  return (
    <button
      type="button"
      role="listitem"
      className={['lh-cont', active ? 'is-active' : ''].join(' ')}
      style={{ ['--stagger' as string]: `${index * 28}ms` }}
      onClick={onPlay}
    >
      <CoverArt
        seed={item.job.id}
        preferred={item.job.podcast?.coverGradient}
        title={title}
        className="lh-cont-cover"
      >
        {playing && (
          <span className="lh-eq is-dark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
      </CoverArt>
      <div className="lh-cont-body">
        <div className="lh-cont-title">{title}</div>
        <div className="lh-cont-sub">
          {pct > 0 ? `已听 ${Math.round(pct)}%` : itemMinutes(item)}
        </div>
        {pct > 0 && (
          <div className="lh-cont-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <span className="lh-cont-play" aria-hidden>
        {playing ? <IconPause size={13} /> : <IconPlay size={13} />}
      </span>
    </button>
  );
}

function EpisodeRow({
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
  const title = itemTitle(item);
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
  const summary = item.job.podcast?.summary?.trim();

  return (
    <div
      role="listitem"
      className={['lh-ep', active ? 'is-active' : ''].join(' ')}
      style={{ ['--stagger' as string]: `${index * 24}ms` }}
    >
      <button
        type="button"
        className="lh-ep-main"
        onClick={onPlay}
        aria-label={`播放 ${title}`}
      >
        <CoverArt
          seed={item.job.id}
          preferred={item.job.podcast?.coverGradient}
          title={title}
          className="lh-ep-cover"
        >
          {playing && (
            <span className="lh-eq is-dark" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
        </CoverArt>

        <div className="lh-ep-body">
          <div className="lh-ep-title">{title}</div>
          {summary && <div className="lh-ep-desc">{summary}</div>}
          <div className="lh-ep-meta">{itemMeta(item)}</div>
          {pct > 0 && !item.listen?.completed && (
            <div className="lh-ep-bar" aria-hidden>
              <i style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </button>

      <div className="lh-ep-actions">
        <button
          type="button"
          className="lh-ep-play"
          onClick={onPlay}
          aria-label={playing ? '暂停' : '播放'}
        >
          {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
        </button>
        <button
          type="button"
          className="lh-ep-open"
          onClick={onOpen}
          aria-label="打开播放页"
        >
          详情
        </button>
      </div>
    </div>
  );
}

function ListenSkeleton() {
  return (
    <div className="lh-skeleton">
      <div className="nl-shimmer lh-skel-hero" />
      <div className="lh-skel-rail">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="nl-shimmer lh-skel-cont" />
        ))}
      </div>
      <div className="lh-skel-list">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="nl-shimmer lh-skel-ep" />
        ))}
      </div>
    </div>
  );
}
