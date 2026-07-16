import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchListenItem, podcastAudioUrl } from '../api/client';
import { trackFromJob } from '../player/trackFromJob';
import { mergeListenRecord } from '../player/listenProgress';
import { ScriptFollow } from '../components/listen/ScriptFollow';
import { FlashcardsView } from '../components/FlashcardsView';
import {
  IconBack,
  IconDownload,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
} from '../components/icons';
import { CoverArt } from '../components/ui/CoverArt';
import { coverGradientFor, formatDuration } from '../lib/format';
import { navigate, type Route } from '../lib/router';
import { usePlayer } from '../player/PlayerContext';
import type { LibraryItem } from '../types/job';

type Panel = 'lyrics' | 'notes' | 'flashcards' | 'outline';

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function ListenPlayerPage({ id, route: _route }: { id: string; route: Route }) {
  const player = usePlayer();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('lyrics');
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const scrubbingRef = useRef(false);
  const [showRemain, setShowRemain] = useState(false);
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

  const ensureAndPlay = useCallback(() => {
    if (!item) return;
    const job = item.job;
    if (player.track?.id !== job.id) {
      player.playTrack(trackFromJob(job), { autoplay: true, resume: true });
      return;
    }
    player.toggle();
  }, [item, player]);

  const cycleRate = useCallback(() => {
    const idx = RATES.findIndex((r) => Math.abs(r - active.rate) < 0.001);
    const next = RATES[(idx + 1) % RATES.length];
    player.setRate(next);
  }, [active.rate, player]);

  // 键盘：空格播放、方向键 seek、[ ] 调速
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      // 闪卡页已占用方向键 / 空格时：仅在非闪卡面板响应空格与左右
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active.rate, ensureAndPlay, item, panel, player]);

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
  const focusContent = panel === 'flashcards' || panel === 'notes' || panel === 'outline';

  const tabs = (
    [
      ...(hasScript ? ([['lyrics', '歌词']] as const) : []),
      ['notes', '笔记'] as const,
      ['flashcards', '闪卡'] as const,
      ['outline', '大纲'] as const,
    ] as Array<readonly [Panel, string]>
  );

  const disc = (
    <button
      type="button"
      className={['qq-disc', active.playing ? 'is-spinning' : ''].join(' ')}
      onClick={ensureAndPlay}
      aria-label={active.playing ? '暂停' : '播放'}
    >
      <CoverArt
        seed={job.id}
        preferred={job.podcast?.coverGradient}
        title={title}
        className="qq-disc-face is-round"
        monogram
      >
        <div className="qq-disc-ring" />
        <div className="qq-disc-label">
          {active.playing ? <IconPause size={26} /> : <IconPlay size={26} />}
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
        focusContent ? 'is-focus-content' : '',
        panel === 'flashcards' ? 'is-flashcards' : '',
        panel === 'lyrics' ? 'is-lyrics' : '',
        panel === 'notes' ? 'is-notes' : '',
        panel === 'outline' ? 'is-outline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="qq-ambient" aria-hidden>
        <div className={['qq-ambient-blob', `bg-gradient-to-br ${g}`].join(' ')} />
        <div className={['qq-ambient-blob', 'qq-ambient-blob-2', `bg-gradient-to-br ${g}`].join(' ')} />
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
            <div className="qq-hero-disc" aria-hidden={false}>
              {disc}
            </div>
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

        <div className="qq-stage-right">
          {/* 桌面大碟：复用同一套 disc 节点会破坏单例，这里再渲染一份仅桌面可见 */}
          <div className="qq-stage-right-inner">{disc}</div>
        </div>
      </div>

      <footer className="qq-dock">
        <div className="qq-dock-left">
          <CoverArt
            seed={job.id}
            preferred={job.podcast?.coverGradient}
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
              className="qq-ctrl has-badge"
              onClick={() => player.seekBy(-15)}
              aria-label="后退15秒"
              title="-15s"
            >
              <IconSkipBack size={18} />
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
              <IconSkipForward size={18} />
              <em>15</em>
            </button>
          </div>
        </div>

        <div className="qq-dock-right">
          <div className="qq-rate-group qq-rate-desktop" role="group" aria-label="倍速">
            {RATES.map((r) => (
              <button
                key={r}
                type="button"
                className={['qq-rate', Math.abs(active.rate - r) < 0.001 ? 'is-active' : ''].join(
                  ' ',
                )}
                onClick={() => player.setRate(r)}
              >
                {r % 1 === 0 ? `${r}.0` : r}x
              </button>
            ))}
          </div>
          <button
            type="button"
            className="qq-rate-cycle"
            onClick={cycleRate}
            aria-label={`倍速 ${active.rate}x，点击切换`}
            title="切换倍速"
          >
            {active.rate % 1 === 0 ? `${active.rate}.0` : active.rate}x
          </button>
        </div>
      </footer>
    </div>
  );
}
