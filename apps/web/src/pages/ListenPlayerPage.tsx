import { useEffect, useMemo, useRef, useState } from 'react';
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

export function ListenPlayerPage({ id, route: _route }: { id: string; route: Route }) {
  const player = usePlayer();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('lyrics');
  const boundId = useRef<string | null>(null);

  useEffect(() => {
    void fetchListenItem(id)
      .then((data) => {
        const merged = {
          ...data,
          listen: mergeListenRecord(data.job.id, data.listen),
        };
        setItem(merged);
        setError(null);
        // 有脚本默认歌词模式，否则笔记
        if (merged.job.podcast?.script) setPanel('lyrics');
        else if (merged.job.podcast?.showNotes) setPanel('notes');
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

  const pct = useMemo(
    () => (active.duration > 0 ? (active.current / active.duration) * 100 : 0),
    [active.current, active.duration],
  );

  if (error) {
    return (
      <div className="qq-player">
        <div className="qq-error">
          <p>{error}</p>
          <button
            type="button"
            className="nl-btn nl-btn-primary"
            onClick={() => navigate({ name: 'listen' })}
          >
            返回听播厅
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
  const artist =
    (job.podcast?.tags || []).slice(0, 2).join(' / ') ||
    (job.podcast?.estimatedMinutes
      ? `约 ${job.podcast.estimatedMinutes} 分钟`
      : '私人播客');
  const hasScript = Boolean(job.podcast?.script);

  const ensureAndPlay = () => {
    if (player.track?.id !== job.id) {
      player.playTrack(trackFromJob(job), { autoplay: true, resume: true });
      return;
    }
    player.toggle();
  };

  return (
    <div className="qq-player nl-enter">
      {/* 氛围底：封面色模糊铺满 */}
      <div className="qq-ambient" aria-hidden>
        <div className={`qq-ambient-blob bg-gradient-to-br ${g}`} />
        <div className="qq-ambient-veil" />
      </div>

      {/* 顶栏极简 */}
      <header className="qq-top">
        <button
          type="button"
          className="qq-icon-btn"
          onClick={() => navigate({ name: 'listen' })}
          aria-label="返回"
        >
          <IconBack size={18} />
        </button>
        <div className="qq-top-tabs">
          {(
            [
              ...(hasScript ? ([['lyrics', '歌词']] as const) : []),
              ['notes', '笔记'] as const,
              ['flashcards', '闪卡'] as const,
              ['outline', '大纲'] as const,
            ] as Array<readonly [Panel, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
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
          aria-label="下载"
        >
          <IconDownload size={16} />
        </a>
      </header>

      {/* 主舞台：左文案 / 右大碟 */}
      <div className="qq-stage">
        <div className="qq-stage-left">
          <div className="qq-song-head">
            <h1 className="qq-song-title">{title}</h1>
            <p className="qq-song-artist">{artist}</p>
          </div>

          <div className="qq-stage-body">
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
                {active.playing ? <IconPause size={28} /> : <IconPlay size={28} />}
              </div>
            </CoverArt>
            <div className="qq-disc-glow" aria-hidden />
          </button>
        </div>
      </div>

      {/* 底部控制条 · QQ 音乐风 */}
      <footer className="qq-dock">
        <div className="qq-dock-left">
          <CoverArt
            seed={job.id}
            preferred={job.podcast?.coverGradient}
            title={title}
            className="qq-dock-cover"
          />
          <div className="min-w-0">
            <div className="qq-dock-title">
              <span className="truncate">{title}</span>
            </div>
            <div className="qq-dock-sub truncate">{artist}</div>
          </div>
        </div>

        <div className="qq-dock-center">
          <div className="qq-progress-row">
            <span className="qq-time">{formatDuration(active.current)}</span>
            <div className="qq-progress-wrap">
              <input
                type="range"
                min={0}
                max={active.duration || 0}
                step={0.1}
                value={active.current}
                onChange={(e) => player.seekTo(Number(e.target.value))}
                className="qq-range"
                aria-label="播放进度"
              />
              <div className="qq-progress-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="qq-time">{formatDuration(active.duration)}</span>
          </div>

          <div className="qq-controls">
            <button
              type="button"
              className="qq-ctrl"
              onClick={() => player.seekBy(-15)}
              aria-label="后退15秒"
              title="-15s"
            >
              <IconSkipBack size={18} />
            </button>
            <button
              type="button"
              className="qq-ctrl is-main"
              onClick={ensureAndPlay}
              aria-label={active.playing ? '暂停' : '播放'}
            >
              {active.playing ? <IconPause size={22} /> : <IconPlay size={22} />}
            </button>
            <button
              type="button"
              className="qq-ctrl"
              onClick={() => player.seekBy(15)}
              aria-label="前进15秒"
              title="+15s"
            >
              <IconSkipForward size={18} />
            </button>
          </div>
        </div>

        <div className="qq-dock-right">
          <div className="qq-rate-group" role="group" aria-label="倍速">
            {[1, 1.25, 1.5, 1.75].map((r) => (
              <button
                key={r}
                type="button"
                className={['qq-rate', active.rate === r ? 'is-active' : ''].join(' ')}
                onClick={() => player.setRate(r)}
              >
                {r}x
              </button>
            ))}
          </div>
          <button
            type="button"
            className={['qq-panel-btn', panel === 'lyrics' ? 'is-active' : ''].join(' ')}
            onClick={() => setPanel(hasScript ? 'lyrics' : 'notes')}
          >
            词
          </button>
        </div>
      </footer>
    </div>
  );
}
