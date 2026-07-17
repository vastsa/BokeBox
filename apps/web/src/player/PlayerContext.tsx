import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  bestResumeSec,
  getLastTrack,
  persistProgress,
  saveLastTrack,
  saveLocalProgress,
} from './listenProgress';
import { tOutside } from '../i18n';

export type PlayerTrack = {
  id: string;
  title: string;
  src: string;
  coverClassName?: string;
  /** AI 封面图 URL */
  coverImageUrl?: string;
  downloadUrl?: string;
  summary?: string;
};

type PlayTrackOpts = {
  autoplay?: boolean;
  /** 显式跳转；不传则自动从本地/服务端续播 */
  seekTo?: number;
  /** 为 false 时强制从头播 */
  resume?: boolean;
  /** 服务端进度（可选，用于与本地合并） */
  serverProgress?: {
    progressSec?: number;
    durationSec?: number;
    completed?: boolean;
    lastListenedAt?: string;
  } | null;
};

type PlayerContextValue = {
  track: PlayerTrack | null;
  playing: boolean;
  current: number;
  duration: number;
  rate: number;
  visible: boolean;
  playTrack: (track: PlayerTrack, opts?: PlayTrackOpts) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (sec: number) => void;
  seekBy: (delta: number) => void;
  setRate: (rate: number) => void;
  setVisible: (v: boolean) => void;
  /** 立刻落盘当前进度 */
  flushProgress: (extra?: { completed?: boolean; incrementPlay?: boolean }) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

function safeDuration(audio: HTMLAudioElement): number {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  try {
    if (audio.seekable?.length) {
      const end = audio.seekable.end(audio.seekable.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<PlayerTrack | null>(null);
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [visible, setVisible] = useState(true);
  const pendingSeek = useRef<number | null>(null);
  const lastPersistAt = useRef(0);
  const lastPersistSec = useRef(-1);
  const playCountedId = useRef<string | null>(null);

  const setTrackBoth = useCallback((next: PlayerTrack | null) => {
    trackRef.current = next;
    setTrack(next);
  }, []);

  // 启动时恢复上次曲目，小播放器默认展开（不自动播放，避免浏览器拦截）
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const last = getLastTrack();
    if (!last?.id || !last.src) return;
    const audio = audioRef.current;
    if (!audio) return;

    const track: PlayerTrack = {
      id: last.id,
      title: last.title || tOutside('app.podcastAudio'),
      src: last.src,
      coverClassName: last.coverClassName,
      coverImageUrl: last.coverImageUrl,
      downloadUrl: last.downloadUrl,
      summary: last.summary,
    };
    setTrackBoth(track);
    setVisible(true);

    const resume =
      last.progressSec > 3 &&
      !(last.durationSec > 0 && last.progressSec >= last.durationSec - 1.5)
        ? last.progressSec
        : bestResumeSec(last.id) || 0;

    if (resume > 0) pendingSeek.current = resume;
    setCurrent(resume > 0 ? resume : 0);
    setDuration(last.durationSec > 0 ? last.durationSec : 0);
    audio.src = last.src;
    audio.load();
    audio.playbackRate = rate;
  }, [setTrackBoth, rate]);

  const flushProgress = useCallback(
    (extra?: { completed?: boolean; incrementPlay?: boolean }) => {
      const t = trackRef.current;
      const audio = audioRef.current;
      if (!t || !audio) return;

      const progressSec = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const durationSec = safeDuration(audio) || 0;
      if (progressSec < 0.5 && !extra?.completed && !extra?.incrementPlay) return;

      const local = persistProgress({
        jobId: t.id,
        progressSec,
        durationSec,
        completed: extra?.completed,
        incrementPlay: extra?.incrementPlay,
      });

      saveLastTrack({
        id: t.id,
        title: t.title,
        src: t.src,
        coverClassName: t.coverClassName,
        coverImageUrl: t.coverImageUrl,
        downloadUrl: t.downloadUrl,
        summary: t.summary,
        progressSec: local.progressSec,
        durationSec: local.durationSec,
        updatedAt: local.updatedAt,
      });

      lastPersistAt.current = Date.now();
      lastPersistSec.current = local.progressSec;
    },
    [],
  );

  const maybePersist = useCallback(
    (force = false) => {
      const audio = audioRef.current;
      const t = trackRef.current;
      if (!audio || !t) return;
      const now = Date.now();
      const sec = audio.currentTime || 0;
      if (
        !force &&
        now - lastPersistAt.current < 4000 &&
        Math.abs(sec - lastPersistSec.current) < 2
      ) {
        return;
      }
      flushProgress();
    },
    [flushProgress],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDur = () => {
      const d = safeDuration(audio);
      if (d > 0) setDuration(d);
      if (pendingSeek.current != null && d > 0) {
        try {
          audio.currentTime = Math.min(d, Math.max(0, pendingSeek.current));
          setCurrent(audio.currentTime);
        } catch {
          // ignore
        }
        pendingSeek.current = null;
      }
    };
    const onTime = () => {
      setCurrent(audio.currentTime);
      syncDur();
      if (!audio.paused) maybePersist(false);
    };
    const onPlay = () => {
      setPlaying(true);
      const t = trackRef.current;
      if (t && playCountedId.current !== t.id) {
        playCountedId.current = t.id;
        flushProgress({ incrementPlay: true });
      }
    };
    const onPause = () => {
      setPlaying(false);
      maybePersist(true);
    };
    const onEnded = () => {
      setPlaying(false);
      flushProgress({ completed: true });
    };

    audio.addEventListener('loadedmetadata', syncDur);
    audio.addEventListener('durationchange', syncDur);
    audio.addEventListener('canplay', syncDur);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', syncDur);
      audio.removeEventListener('durationchange', syncDur);
      audio.removeEventListener('canplay', syncDur);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [flushProgress, maybePersist]);

  // 页面隐藏 / 关闭时立刻落盘
  useEffect(() => {
    const onHide = () => maybePersist(true);
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [maybePersist]);

  const playTrack = useCallback(
    (next: PlayerTrack, opts?: PlayTrackOpts) => {
      const audio = audioRef.current;
      if (!audio) return;

      // 切换曲目前先保存当前进度
      if (trackRef.current && trackRef.current.id !== next.id) {
        flushProgress();
        playCountedId.current = null;
      }

      const same = trackRef.current?.id === next.id && trackRef.current?.src === next.src;
      setTrackBoth(next);
      setVisible(true);

      let seek: number | undefined = opts?.seekTo;
      if (seek == null && opts?.resume !== false) {
        seek = bestResumeSec(next.id, opts?.serverProgress);
      }
      if (seek != null) pendingSeek.current = seek;

      if (!same) {
        setCurrent(seek && seek > 0 ? seek : 0);
        setDuration(0);
        audio.src = next.src;
        audio.load();
      } else if (seek != null) {
        try {
          audio.currentTime = seek;
          setCurrent(seek);
        } catch {
          pendingSeek.current = seek;
        }
      }

      audio.playbackRate = rate;
      if (opts?.autoplay !== false) {
        void audio.play().catch(() => setPlaying(false));
      } else {
        // 仅装载：也写一份 last-track，方便下次进入
        saveLocalProgress({
          jobId: next.id,
          progressSec: seek || 0,
          durationSec: 0,
        });
        saveLastTrack({
          id: next.id,
          title: next.title,
          src: next.src,
          coverClassName: next.coverClassName,
          coverImageUrl: next.coverImageUrl,
          downloadUrl: next.downloadUrl,
          summary: next.summary,
          progressSec: seek || 0,
          durationSec: 0,
          updatedAt: Date.now(),
        });
      }
    },
    [rate, flushProgress, setTrackBoth],
  );

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    void audio.play().catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, []);

  const stop = useCallback(() => {
    // 关闭小播放器：落盘并收起，但保留本地进度与 last-track，下次进入仍默认打开
    flushProgress();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    setPlaying(false);
    setVisible(false);
    playCountedId.current = null;
  }, [flushProgress]);

  const seekTo = useCallback(
    (sec: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const max = safeDuration(audio) || duration;
      const next = Math.max(0, max > 0 ? Math.min(max, sec) : Math.max(0, sec));
      try {
        audio.currentTime = next;
        setCurrent(next);
      } catch {
        pendingSeek.current = next;
      }
      // seek 后尽快落盘
      window.setTimeout(() => maybePersist(true), 50);
    },
    [duration, maybePersist],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seekTo(audio.currentTime + delta);
    },
    [seekTo],
  );

  const setRate = useCallback((next: number) => {
    setRateState(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      playing,
      current,
      duration,
      rate,
      visible,
      playTrack,
      toggle,
      play,
      pause,
      stop,
      seekTo,
      seekBy,
      setRate,
      setVisible,
      flushProgress,
    }),
    [
      track,
      playing,
      current,
      duration,
      rate,
      visible,
      playTrack,
      toggle,
      play,
      pause,
      stop,
      seekTo,
      seekBy,
      setRate,
      flushProgress,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" playsInline className="hidden" />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

export function usePlayerOptional(): PlayerContextValue | null {
  return useContext(PlayerContext);
}
