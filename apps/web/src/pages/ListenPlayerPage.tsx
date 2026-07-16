import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  fetchLibrary,
  fetchListenItem,
  podcastAudioUrl,
  coverImageUrl,
} from '../api/client';
import { trackFromJob } from '../player/trackFromJob';
import { mergeListenRecord } from '../player/listenProgress';
import { ScriptFollow } from '../components/listen/ScriptFollow';
import { FlashcardsView } from '../components/FlashcardsView';
import {
  IconBack,
  IconDownload,
  IconMoon,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
  IconTrackNext,
  IconTrackPrev,
} from '../components/icons';
import { CoverArt } from '../components/ui/CoverArt';
import { coverGradientFor, formatDuration } from '../lib/format';
import { navigate, type Route } from '../lib/router';
import { usePlayer } from '../player/PlayerContext';
import type { LibraryItem } from '../types/job';

type Panel = 'lyrics' | 'notes' | 'flashcards' | 'outline';

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

type SleepPresetKey = 'off' | 'eoe' | 5 | 10 | 15 | 30 | 45 | 60;
/** 睡眠定时：关闭 / 倒计时分钟 / 播完本集 */
type SleepState =
  | { kind: 'off' }
  | { kind: 'timer'; minutes: number; endsAt: number }
  | { kind: 'eoe' };

const SLEEP_PRESETS = [
  { key: 'off', label: '关闭' },
  { key: 'eoe', label: '播完本集' },
  { key: 5, label: '5 分钟' },
  { key: 10, label: '10 分钟' },
  { key: 15, label: '15 分钟' },
  { key: 30, label: '30 分钟' },
  { key: 45, label: '45 分钟' },
  { key: 60, label: '60 分钟' },
] as const;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ListenPlayerPage({ id, route: _route }: { id: string; route: Route }) {
  const player = usePlayer();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('lyrics');
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const scrubbingRef = useRef(false);
  const [showRemain, setShowRemain] = useState(false);
  const [queue, setQueue] = useState<LibraryItem[]>([]);
  const [sleep, setSleep] = useState<SleepState>({ kind: 'off' });
  const [sleepLeftMs, setSleepLeftMs] = useState(0);
  const [sleepOpen, setSleepOpen] = useState(false);
  const sleepMenuRef = useRef<HTMLDivElement>(null);
  const boundId = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchListenItem(id)
      .then((data) => {
        const merged = {
          ...data,
          listen: mergeListenRecord(data.job.id, data.listen),
        };
        setItem(merged);
        setError(null);
        if (merged.job.podcast?.script) setPanel('lyrics');
        else if (merged.job.podcast?.showNotes) setPanel('notes');
        else if (merged.job.podcast?.flashcards?.length) setPanel('flashcards');
        else setPanel('outline');
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  // 曲库：用于上一集 / 下一集（与首页同一顺序：新→旧）
  useEffect(() => {
    void fetchLibrary()
      .then((items) => setQueue(Array.isArray(items) ? items : []))
      .catch(() => setQueue([]));
  }, []);

  useEffect(() => {
    if (!item) return;
    const job = item.job;
    const listen = mergeListenRecord(job.id, item.listen);
    const same = player.track?.id === job.id;
    if (!same) {
      player.playTrack(trackFromJob(job), {
        autoplay: false,
        resume: true,
        serverProgress: listen,
      });
    }
    boundId.current = job.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.job.id]);

  const active =
    player.track?.id === id
      ? {
          playing: player.playing,
          current: player.current,
          duration: player.duration,
          rate: player.rate,
        }
      : { playing: false, current: 0, duration: 0, rate: 1 };

  const displayCurrent = scrubbing ? scrubValue : active.current;
  const pct = useMemo(
    () => (active.duration > 0 ? (displayCurrent / active.duration) * 100 : 0),
    [displayCurrent, active.duration],
  );
  const remain = Math.max(0, (active.duration || 0) - displayCurrent);

  const queueIndex = useMemo(
    () => queue.findIndex((x) => x.job.id === id),
    [queue, id],
  );
  const prevItem = queueIndex > 0 ? queue[queueIndex - 1] : null;
  const nextItem =
    queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : null;

  const ensureAndPlay = useCallback(() => {
    if (!item) return;
    const job = item.job;
    if (player.track?.id !== job.id) {
      player.playTrack(trackFromJob(job), { autoplay: true, resume: true });
      return;
    }
    player.toggle();
  }, [item, player]);

  const goEpisode = useCallback(
    (target: LibraryItem | null) => {
      if (!target) return;
      setSleepOpen(false);
      // 切集时保留睡眠定时（若是倒计时则继续；播完本集仍有效）
      player.playTrack(trackFromJob(target.job), {
        autoplay: true,
        resume: true,
        serverProgress: mergeListenRecord(target.job.id, target.listen),
      });
      navigate({ name: 'player', id: target.job.id });
    },
    [player],
  );

  const cycleRate = useCallback(() => {
    const idx = RATES.findIndex((r) => Math.abs(r - active.rate) < 0.001);
    const next = RATES[(idx + 1) % RATES.length];
    player.setRate(next);
  }, [active.rate, player]);

  const applySleep = useCallback((preset: SleepPresetKey) => {
    if (preset === 'off') {
      setSleep({ kind: 'off' });
      setSleepLeftMs(0);
    } else if (preset === 'eoe') {
      setSleep({ kind: 'eoe' });
      setSleepLeftMs(0);
    } else {
      const mins = Number(preset);
      setSleep({ kind: 'timer', minutes: mins, endsAt: Date.now() + mins * 60_000 });
    }
    setSleepOpen(false);
  }, []);

  // 睡眠倒计时 tick
  useEffect(() => {
    if (sleep.kind !== 'timer') {
      setSleepLeftMs(0);
      return;
    }
    const tick = () => {
      const left = sleep.endsAt - Date.now();
      setSleepLeftMs(Math.max(0, left));
      if (left <= 0) {
        player.pause();
        setSleep({ kind: 'off' });
        setSleepLeftMs(0);
      }
    };
    tick();
    const t = window.setInterval(tick, 500);
    return () => window.clearInterval(t);
  }, [sleep, player]);

  // 播完本集：到结尾自动关闭定时（音频 ended 后 playing=false）
  useEffect(() => {
    if (sleep.kind !== 'eoe') return;
    if (active.duration <= 0) return;
    const atEnd = active.current >= active.duration - 0.35 && active.current > 1;
    if (atEnd && !active.playing) {
      setSleep({ kind: 'off' });
    }
  }, [sleep.kind, active.playing, active.current, active.duration]);

  // 点击外部关闭睡眠菜单
  useEffect(() => {
    if (!sleepOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = sleepMenuRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setSleepOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [sleepOpen]);

  // 键盘
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (panel === 'flashcards') {
        if (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        ensureAndPlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        player.seekBy(e.shiftKey ? -30 : -15);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        player.seekBy(e.shiftKey ? 30 : 15);
      } else if (e.key === '[') {
        e.preventDefault();
        const idx = RATES.findIndex((r) => Math.abs(r - active.rate) < 0.001);
        const prev = RATES[Math.max(0, (idx < 0 ? 1 : idx) - 1)];
        player.setRate(prev);
      } else if (e.key === ']') {
        e.preventDefault();
        const idx = RATES.findIndex((r) => Math.abs(r - active.rate) < 0.001);
        const next = RATES[Math.min(RATES.length - 1, (idx < 0 ? 1 : idx) + 1)];
        player.setRate(next);
      } else if (e.key === 'Home') {
        e.preventDefault();
        player.seekTo(0);
      } else if ((e.key === ',' || e.key === '<') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        goEpisode(prevItem);
      } else if ((e.key === '.' || e.key === '>') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        goEpisode(nextItem);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active.rate, ensureAndPlay, goEpisode, item, nextItem, panel, player, prevItem]);

  if (error) {
    return (
      <div className="qq-player">
        <div className="qq-error">
          <div className="qq-error-icon" aria-hidden>
            !
          </div>
          <p>{error}</p>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => navigate({ name: 'home' })}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="qq-player">
        <div className="qq-loading">
          <div className="nl-shimmer qq-loading-disc" />
          <div className="nl-shimmer h-4 w-48 rounded-full" />
          <div className="nl-shimmer h-3 w-32 rounded-full" />
        </div>
      </div>
    );
  }

  const job = item.job;
  const g = coverGradientFor(job.id, job.podcast?.coverGradient);
  const title = job.podcast?.title || job.title;
  const tags = job.podcast?.tags || [];
  const artist =
    tags.slice(0, 2).join(' · ') ||
    (job.podcast?.estimatedMinutes
      ? `约 ${job.podcast.estimatedMinutes} 分钟`
      : '私人播客');
  const hasScript = Boolean(job.podcast?.script);
  const sleepActive = sleep.kind !== 'off';
  const sleepLabel =
    sleep.kind === 'timer'
      ? formatCountdown(sleepLeftMs)
      : sleep.kind === 'eoe'
        ? '本集'
        : '';

  const tabs = (
    [
      ...(hasScript ? ([['lyrics', '歌词']] as const) : []),
      ['notes', '笔记'] as const,
      ['flashcards', '闪卡'] as const,
      ['outline', '大纲'] as const,
    ] as Array<readonly [Panel, string]>
  );

  const disc = (variant: 'hero' | 'stage') => (
    <button
      type="button"
      className={[
        'qq-disc',
        variant === 'hero' ? 'is-hero-disc' : 'is-stage-disc',
        active.playing ? 'is-spinning' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={ensureAndPlay}
      aria-label={active.playing ? '暂停' : '播放'}
      tabIndex={variant === 'hero' ? 0 : -1}
    >
      <CoverArt
        seed={job.id}
        preferred={job.podcast?.coverGradient}
        imageUrl={job.podcast?.hasCoverImage ? coverImageUrl(job.id, job.updatedAt) : undefined}
        title={title}
        className="qq-disc-face is-round"
        monogram
      >
        <div className="qq-disc-ring" />
        <div className="qq-disc-label">
          {active.playing ? <IconPause size={variant === 'hero' ? 18 : 26} /> : <IconPlay size={variant === 'hero' ? 18 : 26} />}
        </div>
      </CoverArt>
      <div className="qq-disc-glow" aria-hidden />
      <div className="qq-disc-shadow" aria-hidden />
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={[
        'qq-player',
        'nl-enter',
        active.playing ? 'is-playing' : '',
        sleepActive ? 'is-sleeping' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="qq-ambient" aria-hidden>
        <div className={['qq-ambient-blob', `bg-gradient-to-br ${g}`].join(' ')} />
        <div
          className={['qq-ambient-blob', 'qq-ambient-blob-2', `bg-gradient-to-br ${g}`].join(' ')}
        />
        <div className="qq-ambient-veil" />
      </div>

      <header className="qq-top">
        <button
          type="button"
          className="qq-icon-btn"
          onClick={() => navigate({ name: 'home' })}
          aria-label="返回"
        >
          <IconBack size={18} />
        </button>
        <div className="qq-top-tabs" role="tablist" aria-label="内容面板">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={panel === k}
              className={['qq-top-tab', panel === k ? 'is-active' : ''].join(' ')}
              onClick={() => setPanel(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <a
          href={podcastAudioUrl(job.id, true)}
          className="qq-icon-btn"
          aria-label="下载音频"
          title="下载"
        >
          <IconDownload size={16} />
        </a>
      </header>

      <div className="qq-stage">
        <div className="qq-stage-left">
          <div className="qq-hero">
            <div className="qq-song-head">
              <h1 className="qq-song-title" title={title}>
                {title}
              </h1>
              <p className="qq-song-artist">{artist}</p>
              {(tags.length > 0 || job.podcast?.estimatedMinutes) && (
                <div className="qq-song-chips">
                  {job.podcast?.estimatedMinutes ? (
                    <span className="qq-chip">约 {job.podcast.estimatedMinutes} 分钟</span>
                  ) : null}
                  {tags.slice(0, 3).map((t) => (
                    <span key={t} className="qq-chip">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="qq-hero-disc">{disc('hero')}</div>
          </div>

          <div className="qq-stage-body" role="tabpanel">
            {panel === 'lyrics' &&
              (hasScript ? (
                <ScriptFollow
                  script={job.podcast!.script!}
                  currentSec={active.current}
                  durationSec={active.duration}
                  onSeek={(sec) => player.seekTo(sec)}
                  variant="lyrics"
                  timing={job.podcast?.scriptTiming}
                />
              ) : (
                <p className="qq-empty">暂无口播脚本</p>
              ))}

            {panel === 'notes' && (
              <article className="qq-notes prose-soft">
                {job.podcast?.showNotes ? (
                  <ReactMarkdown>{job.podcast.showNotes}</ReactMarkdown>
                ) : job.podcast?.summary ? (
                  <p>{job.podcast.summary}</p>
                ) : (
                  <p className="qq-empty">暂无节目笔记</p>
                )}
              </article>
            )}

            {panel === 'flashcards' && (
              <div className="qq-flashcards">
                <FlashcardsView
                  cards={job.podcast?.flashcards}
                  emptyText="暂无知识闪卡"
                  compact
                />
              </div>
            )}

            {panel === 'outline' && (
              <ol className="qq-outline">
                {job.podcast?.outline?.length ? (
                  job.podcast.outline.map((seg, i) => (
                    <li key={`${seg.title}-${i}`}>
                      <span className="qq-outline-idx">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <div className="qq-outline-title">{seg.title}</div>
                        {seg.summary && (
                          <div className="qq-outline-desc">{seg.summary}</div>
                        )}
                      </div>
                    </li>
                  ))
                ) : (
                  <p className="qq-empty">暂无大纲</p>
                )}
              </ol>
            )}
          </div>
        </div>

        <div className="qq-stage-right" aria-hidden>
          <div className="qq-stage-right-inner">{disc('stage')}</div>
        </div>
      </div>

      <footer className="qq-dock">
        <div className="qq-dock-left">
          <CoverArt
            seed={job.id}
            preferred={job.podcast?.coverGradient}
            imageUrl={job.podcast?.hasCoverImage ? coverImageUrl(job.id, job.updatedAt) : undefined}
            title={title}
            className="qq-dock-cover"
          />
          <div className="qq-dock-meta">
            <div className="qq-dock-title">
              <span className="truncate">{title}</span>
            </div>
            <div className="qq-dock-sub truncate">{artist}</div>
          </div>
        </div>

        <div className="qq-dock-center">
          <div className="qq-progress-row">
            <span className="qq-time">{formatDuration(displayCurrent)}</span>
            <div className={['qq-progress-wrap', scrubbing ? 'is-scrubbing' : ''].join(' ')}>
              <div className="qq-progress-bar" aria-hidden>
                <i style={{ width: `${pct}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={active.duration || 0}
                step={0.1}
                value={displayCurrent}
                onPointerDown={() => {
                  scrubbingRef.current = true;
                  setScrubbing(true);
                  setScrubValue(active.current);
                }}
                onPointerUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  scrubbingRef.current = false;
                  setScrubbing(false);
                  player.seekTo(v);
                }}
                onPointerCancel={() => {
                  scrubbingRef.current = false;
                  setScrubbing(false);
                }}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setScrubValue(v);
                  if (!scrubbingRef.current) player.seekTo(v);
                }}
                className="qq-range"
                aria-label="播放进度"
              />
              {scrubbing && (
                <div className="qq-scrub-tip" aria-hidden>
                  {formatDuration(scrubValue)}
                </div>
              )}
            </div>
            <button
              type="button"
              className="qq-time is-btn"
              onClick={() => setShowRemain((v) => !v)}
              title={showRemain ? '显示总时长' : '显示剩余时长'}
              aria-label={showRemain ? '显示总时长' : '显示剩余时长'}
            >
              {showRemain ? `-${formatDuration(remain)}` : formatDuration(active.duration)}
            </button>
          </div>

          <div className="qq-controls">
            <button
              type="button"
              className="qq-ctrl is-rate"
              onClick={cycleRate}
              aria-label={`倍速 ${active.rate}x，点击切换`}
              title="切换倍速"
            >
              <span className="qq-rate-text">
                {active.rate % 1 === 0 ? `${active.rate}` : active.rate}
                <small>x</small>
              </span>
            </button>

            <button
              type="button"
              className="qq-ctrl is-ep"
              onClick={() => goEpisode(prevItem)}
              disabled={!prevItem}
              aria-label="上一集"
              title={prevItem ? `上一集：${prevItem.job.podcast?.title || prevItem.job.title}` : '没有上一集'}
            >
              <IconTrackPrev size={18} />
            </button>
            <button
              type="button"
              className="qq-ctrl has-badge"
              onClick={() => player.seekBy(-15)}
              aria-label="后退15秒"
              title="-15s"
            >
              <IconSkipBack size={17} />
              <em>15</em>
            </button>
            <button
              type="button"
              className="qq-ctrl is-main"
              onClick={ensureAndPlay}
              aria-label={active.playing ? '暂停' : '播放'}
            >
              {active.playing ? <IconPause size={24} /> : <IconPlay size={24} />}
            </button>
            <button
              type="button"
              className="qq-ctrl has-badge"
              onClick={() => player.seekBy(15)}
              aria-label="前进15秒"
              title="+15s"
            >
              <IconSkipForward size={17} />
              <em>15</em>
            </button>
            <button
              type="button"
              className="qq-ctrl is-ep"
              onClick={() => goEpisode(nextItem)}
              disabled={!nextItem}
              aria-label="下一集"
              title={nextItem ? `下一集：${nextItem.job.podcast?.title || nextItem.job.title}` : '没有下一集'}
            >
              <IconTrackNext size={18} />
            </button>

            <div className="qq-sleep" ref={sleepMenuRef}>
              <button
                type="button"
                className={['qq-ctrl', 'is-sleep', sleepActive ? 'is-active' : ''].join(' ')}
                onClick={() => setSleepOpen((v) => !v)}
                aria-expanded={sleepOpen}
                aria-haspopup="menu"
                title="睡眠定时"
                aria-label={
                  sleepActive
                    ? `睡眠定时 ${sleepLabel}，点击修改`
                    : '睡眠定时'
                }
              >
                <IconMoon size={16} />
                {sleepActive && <span className="qq-sleep-label">{sleepLabel}</span>}
              </button>
              {sleepOpen && (
                <div className="qq-sleep-menu" role="menu" aria-label="睡眠定时选项">
                  <div className="qq-sleep-menu-title">睡眠定时</div>
                  {SLEEP_PRESETS.map((opt) => {
                    const isActive =
                      (opt.key === 'off' && sleep.kind === 'off') ||
                      (opt.key === 'eoe' && sleep.kind === 'eoe') ||
                      (typeof opt.key === 'number' &&
                        sleep.kind === 'timer' &&
                        sleep.minutes === opt.key);
                    return (
                      <button
                        key={String(opt.key)}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className={['qq-sleep-item', isActive ? 'is-active' : '']
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => applySleep(opt.key)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
