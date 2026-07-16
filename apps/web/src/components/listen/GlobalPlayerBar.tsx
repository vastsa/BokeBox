import { usePlayer } from '../../player/PlayerContext';
import { formatDuration } from '../../lib/format';
import { navigate, type Route } from '../../lib/router';
import {
  IconClose,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
} from '../icons';
import { CoverArt } from '../ui/CoverArt';

export function GlobalPlayerBar({ route }: { route: Route }) {
  const {
    track,
    playing,
    current,
    duration,
    visible,
    toggle,
    seekBy,
    seekTo,
    stop,
    rate,
    setRate,
  } = usePlayer();

  // 沉浸播放页已有完整控件，隐藏底栏避免重复
  if (!track || !visible || route.name === 'player') return null;

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const hasBottomNav =
    route.name === 'listen' ||
    route.name === 'admin' ||
    route.name === 'admin-upload' ||
    route.name === 'admin-job';

  return (
    <div
      className={['global-player', hasBottomNav ? 'with-bottom-nav' : ''].join(' ')}
      role="region"
      aria-label="全局播放器"
    >
      <div className="global-player-inner">
        <CoverArt
          as="button"
          seed={track.id}
          preferred={track.coverClassName}
          imageUrl={track.coverImageUrl}
          title={track.title}
          className="global-player-cover"
          onClick={() => navigate({ name: 'player', id: track.id })}
          aria-label="打开播放页"
        >
          {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
        </CoverArt>

        <button
          type="button"
          className="global-player-meta"
          onClick={() => navigate({ name: 'player', id: track.id })}
        >
          <div className="global-player-title">{track.title}</div>
          <div className="global-player-time">
            {formatDuration(current)} / {formatDuration(duration)}
          </div>
        </button>

        <div className="global-player-controls">
          <button
            type="button"
            className="global-ctrl"
            onClick={() => seekBy(-15)}
            aria-label="后退15秒"
          >
            <IconSkipBack size={15} />
          </button>
          <button
            type="button"
            className="global-ctrl is-main"
            onClick={toggle}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>
          <button
            type="button"
            className="global-ctrl"
            onClick={() => seekBy(15)}
            aria-label="前进15秒"
          >
            <IconSkipForward size={15} />
          </button>
        </div>

        <div className="global-player-side">
          <select
            className="global-rate"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-label="倍速"
          >
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
          <button
            type="button"
            className="global-close"
            onClick={stop}
            aria-label="关闭播放"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      <input
        type="range"
        className="pb-range global-player-range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        onChange={(e) => seekTo(Number(e.target.value))}
        aria-label="播放进度"
      />
      <div className="pb-progress global-player-progress">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
