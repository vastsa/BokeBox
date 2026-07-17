import { useEffect, useMemo, useRef } from 'react';
import {
  IconDownload,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
} from '../icons';
import { CoverArt } from '../ui/CoverArt';
import { formatDuration } from '../../lib/format';
import { usePlayer, type PlayerTrack } from '../../player/PlayerContext';
import { useI18n } from '../../i18n';

export type MiniPlayerState = {
  current: number;
  duration: number;
  playing: boolean;
};

export function MiniPlayer({
  trackId,
  src,
  title,
  downloadUrl,
  coverClassName,
  coverImageUrl,
  summary,
  onStateChange,
  seekRequest,
  compact = false,
}: {
  /** 与全局播放器对齐的曲目 ID（通常为 job.id） */
  trackId: string;
  src: string;
  title?: string;
  downloadUrl?: string;
  coverClassName?: string;
  coverImageUrl?: string;
  summary?: string;
  onStateChange?: (s: MiniPlayerState) => void;
  /** 外部跳转请求（秒） */
  seekRequest?: number | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const player = usePlayer();
  const lastSeek = useRef<number | null>(null);
  const prevRef = useRef<MiniPlayerState | null>(null);

  const isActive = player.track?.id === trackId;
  const current = isActive ? player.current : 0;
  const duration = isActive ? player.duration : 0;
  const playing = isActive ? player.playing : false;
  const rate = isActive ? player.rate : player.rate;

  const trackPayload = useMemo<PlayerTrack>(
    () => ({
      id: trackId,
      title: title || t('app.podcastAudio'),
      src,
      coverClassName,
      coverImageUrl,
      downloadUrl,
      summary,
    }),
    [trackId, title, src, coverClassName, coverImageUrl, downloadUrl, summary],
  );

  // 同步状态给父组件（脚本跟读等）
  useEffect(() => {
    if (!onStateChange) return;
    const prev = prevRef.current;
    if (
      prev &&
      prev.playing === playing &&
      prev.duration === duration &&
      Math.abs(prev.current - current) < 0.25
    ) {
      return;
    }
    const next = { current, duration, playing };
    prevRef.current = next;
    onStateChange(next);
  }, [current, duration, playing, onStateChange]);

  // 外部 seek（脚本点击）
  useEffect(() => {
    if (seekRequest == null) return;
    if (lastSeek.current === seekRequest) return;
    lastSeek.current = seekRequest;

    if (isActive) {
      player.seekTo(seekRequest);
      return;
    }
    player.playTrack(trackPayload, { autoplay: true, seekTo: seekRequest });
  }, [seekRequest, isActive, player, trackPayload]);

  // src 变更（如重合成）时，若正在播同一集则强制换源
  useEffect(() => {
    lastSeek.current = null;
    if (!isActive) return;
    if (player.track?.src === src) return;
    player.playTrack(trackPayload, {
      autoplay: playing,
      seekTo: current > 1 ? current : undefined,
    });
    // 仅在 src / trackId 变化时处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, trackId]);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  const ensureTrack = (autoplay: boolean, seekTo?: number) => {
    if (isActive && player.track?.src === src) {
      if (seekTo != null) player.seekTo(seekTo);
      if (autoplay && !playing) player.play();
      return;
    }
    player.playTrack(trackPayload, { autoplay, seekTo });
  };

  const toggle = () => {
    if (isActive && player.track?.src === src) {
      player.toggle();
      return;
    }
    ensureTrack(true);
  };

  const seekBy = (delta: number) => {
    if (!isActive) {
      ensureTrack(true, Math.max(0, delta > 0 ? delta : 0));
      return;
    }
    player.seekBy(delta);
  };

  const seekTo = (sec: number) => {
    if (!isActive) {
      ensureTrack(false, sec);
      return;
    }
    player.seekTo(sec);
  };

  return (
    <div className={['mini-player', compact ? 'is-compact' : ''].join(' ')}>
      {!compact && (
        <div className="mini-player-head">
          <CoverArt
            seed={trackId}
            preferred={coverClassName}
            imageUrl={coverImageUrl}
            title={title}
            className="mini-player-cover"
          >
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          </CoverArt>
          <div className="min-w-0 flex-1">
            <div className="mini-player-kicker">
              {isActive && playing ? 'Now Playing' : 'Podcast Preview'}
            </div>
            <div className="mini-player-title">{title || t('app.podcastAudio')}</div>
          </div>
          {downloadUrl && (
            <a href={downloadUrl} className="mini-player-dl" aria-label={t('common.download')}>
              <IconDownload size={14} />
            </a>
          )}
        </div>
      )}

      <div className="mini-player-time">
        <span>{formatDuration(current)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        onChange={(e) => seekTo(Number(e.target.value))}
        className="pb-range mini-player-range"
        aria-label={t('player.progress')}
      />
      <div className="pb-progress mini-player-track">
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className="mini-player-controls">
        <button
          type="button"
          className="mini-ctrl"
          onClick={() => seekBy(-15)}
          aria-label={t('player.back15')}
        >
          <IconSkipBack size={16} />
        </button>
        <button
          type="button"
          className="mini-ctrl is-main"
          onClick={toggle}
          aria-label={playing ? t('common.pause') : t('common.play')}
        >
          {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
        </button>
        <button
          type="button"
          className="mini-ctrl"
          onClick={() => seekBy(15)}
          aria-label={t('player.forward15')}
        >
          <IconSkipForward size={16} />
        </button>
      </div>

      <div className="mini-player-rates">
        {[0.75, 1, 1.25, 1.5].map((r) => (
          <button
            key={r}
            type="button"
            className={['mini-rate', rate === r && isActive ? 'is-active' : ''].join(' ')}
            onClick={() => {
              ensureTrack(playing);
              player.setRate(r);
            }}
          >
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}
