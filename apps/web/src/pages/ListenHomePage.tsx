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
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了';
}

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

export function ListenHomePage({ route }: { route: Route }) {
  const player = usePlayer();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchLibrary(), fetchHistory()])
      .then(([lib, his]) => {
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
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const greeting = useMemo(() => greetingByHour(), []);

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
            <div className="lh-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="nl-shimmer lh-skel-card" />
              ))}
            </div>
          ) : !library.length ? (
            <EmptyState
              icon={<IconLibrary size={22} />}
              title="还没有可听内容"
              description="上传视频生成播客后，会像卡片一样出现在这里"
              actionLabel="去上传"
              onAction={() => navigate({ name: 'admin-upload' })}
            />
          ) : (
            <div className="lh-grid" role="list">
              {library.map((item, idx) => (
                <CoverCard
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
        </div>
      </div>
    </AppShell>
  );
}

function CoverCard({
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
  const summary = itemSummary(item);
  const pct = listenProgressPct(item.listen?.progressSec, item.listen?.durationSec);
  const mins = itemMinutes(item);
  const badge = item.listen?.completed
    ? '已听完'
    : pct > 0
      ? `${Math.round(pct)}%`
      : mins;

  return (
    <article
      role="listitem"
      className={['lh-card', active ? 'is-active' : ''].join(' ')}
      style={{ ['--stagger' as string]: `${index * 30}ms` }}
    >
      <div className="lh-card-face">
        <CoverArt
          seed={item.job.id}
          preferred={item.job.podcast?.coverGradient}
          title={title}
          monogram={false}
          className="lh-card-cover"
          aria-hidden
        />

        {/* 上：标题 / 中：留白 / 下：简介 */}
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

        {pct > 0 && !item.listen?.completed && (
          <span className="lh-card-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
    </article>
  );
}
