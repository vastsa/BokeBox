import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  fetchAllLibrary,
  fetchListenItem,
  podcastAudioUrl,
  coverImageUrl,
} from '../api/client';
import { trackFromJob } from '../player/trackFromJob';
import { loadAlbumQueue } from '../player/albumQueue';
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
import { getToken } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import { usePlayer } from '../player/PlayerContext';
import type { LibraryItem } from '../types/job';
import { useI18n } from '../i18n';

import {
  RATES,
  SLEEP_PRESETS,
  formatCountdown,
  type Panel,
  type SleepPresetKey,
  type SleepState,
} from '../features/listen-player/playerUi';

export function ListenPlayerPage({ id, route: _route }: { id: string; route: Route }) {
  const { t } = useI18n();
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
        const serverListen = getToken() ? data.listen : null;
        const merged = {
          ...data,
          listen: mergeListenRecord(data.job.id, serverListen),
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

  // 曲库 / 专辑队列：用于上一集 / 下一集
  useEffect(() => {
    void fetchAllLibrary()
      .then((items) => {
        const list = Array.isArray(items) ? items : [];
        const albumQ = loadAlbumQueue();
        if (albumQ?.jobIds?.length) {
          const map = new Map(list.map((it) => [it.job.id, it]));
          const ordered = albumQ.jobIds
            .map((jid) => map.get(jid))
            .filter(Boolean) as LibraryItem[];
          // 当前曲目在专辑内则用专辑顺序，否则回落全库
          if (ordered.some((it) => it.job.id === id) || ordered.length) {
            // 仅当当前 id 属于专辑，或专辑队列非空且用户从专辑进入
            if (albumQ.jobIds.includes(id)) {
              setQueue(ordered);
              return;
            }
          }
        }
        setQueue(list);
      })
      .catch(() => setQueue([]));
  }, [id]);

  useEffect(() => {
    if (!queue.length) return;
    player.setQueue(queue.map((it) => trackFromJob(it.job)));
  }, [queue, player]);

  useEffect(() => {
    player.setAutoAdvance(sleep.kind !== 'eoe');
    return () => player.setAutoAdvance(true);
  }, [sleep.kind, player]);

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
            {t('common.backHome')}
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
    tags.slice(0, 2).join(' · ') || t('app.privatePodcast');
  const hasScript = Boolean(job.podcast?.script);
  const sleepActive = sleep.kind !== 'off';
  const sleepLabel =
    sleep.kind === 'timer'
      ? formatCountdown(sleepLeftMs)
      : sleep.kind === 'eoe'
        ? t('player.sleepEoe')
        : '';

  const tabs = (
    [
      ...(hasScript ? ([['lyrics', t('player.lyrics')]] as const) : []),
      ['notes', t('player.notes')] as const,
      ['flashcards', t('player.flashcards')] as const,
      ['outline', t('player.outline')] as const,
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
      aria-label={active.playing ? t('common.pause') : t('common.play')}
      tabIndex={variant === 'hero' ? 0 : -1}
    >
      <CoverArt
        seed={job.id}
        preferred={job.podcast?.coverGradient}
        imageUrl={job.podcast?.hasCoverImage ? coverImageUrl(job.id, job.updatedAt, 'md') : undefined}
        title={title}
        className="qq-disc-face is-round"
        monogram
        priority
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
          aria-label={t('player.back')}
        >
          <IconBack size={18} />
        </button>
        <div className="qq-top-tabs" role="tablist" aria-label={t('player.contentTabs')}>
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
          aria-label={t('player.downloadAudio')}
          title={t('common.download')}
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
              {tags.length > 0 && (
                <div className="qq-song-chips">
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
                <p className="qq-empty">{t('player.noScript')}</p>
              ))}

            {panel === 'notes' && (
              <article className="qq-notes prose-soft">
                {job.podcast?.showNotes ? (
                  <ReactMarkdown>{job.podcast.showNotes}</ReactMarkdown>
                ) : job.podcast?.summary ? (
                  <p>{job.podcast.summary}</p>
                ) : (
                  <p className="qq-empty">{t('player.noNotes')}</p>
                )}
              </article>
            )}

            {panel === 'flashcards' && (
              <div className="qq-flashcards">
                <FlashcardsView
                  cards={job.podcast?.flashcards}
                  emptyText={t('player.noFlashcards')}
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
                  <p className="qq-empty">{t('player.noOutline')}</p>
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
            imageUrl={job.podcast?.hasCoverImage ? coverImageUrl(job.id, job.updatedAt, 'md') : undefined}
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
                aria-label={t('player.progress')}
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
              title={showRemain ? t('player.showTotal') : t('player.showRemain')}
              aria-label={showRemain ? t('player.showTotal') : t('player.showRemain')}
            >
              {showRemain ? `-${formatDuration(remain)}` : formatDuration(active.duration)}
            </button>
          </div>

          <div className="qq-controls">
            <button
              type="button"
              className="qq-ctrl is-rate"
              onClick={cycleRate}
              aria-label={t('player.rateSwitch', { rate: active.rate })}
              title={t('player.switchRate')}
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
              aria-label={t('player.prevEpisode')}
              title={prevItem ? t('player.prevEpisodeTitle', { title: prevItem.job.podcast?.title || prevItem.job.title }) : t('player.noPrev')}
            >
              <IconTrackPrev size={18} />
            </button>
            <button
              type="button"
              className="qq-ctrl has-badge"
              onClick={() => player.seekBy(-15)}
              aria-label={t('player.back15')}
              title="-15s"
            >
              <IconSkipBack size={17} />
              <em>15</em>
            </button>
            <button
              type="button"
              className="qq-ctrl is-main"
              onClick={ensureAndPlay}
              aria-label={active.playing ? t('common.pause') : t('common.play')}
            >
              {active.playing ? <IconPause size={24} /> : <IconPlay size={24} />}
            </button>
            <button
              type="button"
              className="qq-ctrl has-badge"
              onClick={() => player.seekBy(15)}
              aria-label={t('player.forward15')}
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
              aria-label={t('player.nextEpisode')}
              title={nextItem ? t('player.nextEpisodeTitle', { title: nextItem.job.podcast?.title || nextItem.job.title }) : t('player.noNext')}
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
                title={t('player.sleepTimer')}
                aria-label={
                  sleepActive
                    ? t('player.sleepTimerActive', { label: sleepLabel })
                     : t('player.sleepTimer')
                }
              >
                <IconMoon size={16} />
                {sleepActive && <span className="qq-sleep-label">{sleepLabel}</span>}
              </button>
              {sleepOpen && (
                <div className="qq-sleep-menu" role="menu" aria-label={t('player.sleepOptions')}>
                  <div className="qq-sleep-menu-title">{t('player.sleepTimer')}</div>
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
                        {opt.key === 'off'
                          ? t('player.sleepOff')
                          : opt.key === 'eoe'
                            ? t('player.sleepEoe')
                            : t('player.sleepMinutes', { n: opt.n ?? opt.key })}
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
