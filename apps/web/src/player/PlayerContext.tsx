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
import { navigate, parsePath } from '../lib/router';

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
  /** 播放队列；传入后用于 ended 自动下一首 */
  queue?: PlayerTrack[];
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
  /** 读取媒体元素的实时播放位置，供歌词等高精度视图使用。 */
  getCurrentTime: () => number;
  setRate: (rate: number) => void;
  setVisible: (v: boolean) => void;
  /** 立刻落盘当前进度 */
  flushProgress: (extra?: { completed?: boolean; incrementPlay?: boolean }) => void;
  setQueue: (tracks: PlayerTrack[]) => void;
  setAutoAdvance: (enabled: boolean) => void;
  playNext: () => boolean;
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
  const queueRef = useRef<PlayerTrack[]>([]);
  const autoAdvanceRef = useRef(true);
  const playNextRef = useRef<() => boolean>(() => false);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedSrcRef = useRef<string | null>(null);

  const clearPreload = useCallback(() => {
    const preload = preloadAudioRef.current;
    if (preload) {
      try {
        preload.pause();
      } catch {
        // ignore
      }
      preload.removeAttribute('src');
      try {
        preload.load();
      } catch {
        // ignore
      }
    }
    preloadedSrcRef.current = null;
  }, []);

  const maybePreloadNext = useCallback(() => {
    if (!autoAdvanceRef.current) return;
    const audio = audioRef.current;
    const currentTrack = trackRef.current;
    if (!audio || !currentTrack || audio.paused) return;

    const durationSec = safeDuration(audio);
    if (durationSec <= 0) return;
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const remaining = durationSec - currentTime;
    // 播客偏长：剩余 <= 90s 或进度 >= 90% 时开始预取
    if (remaining > 90 && currentTime / durationSec < 0.9) return;

    const queue = queueRef.current;
    const idx = queue.findIndex((item) => item.id === currentTrack.id);
    if (idx < 0 || idx >= queue.length - 1) return;
    const next = queue[idx + 1];
    if (!next?.src || next.src === currentTrack.src) return;
    if (preloadedSrcRef.current === next.src) return;

    let preload = preloadAudioRef.current;
    if (!preload) {
      preload = new Audio();
      preload.preload = 'auto';
      preloadAudioRef.current = preload;
    }
    preloadedSrcRef.current = next.src;
    preload.src = next.src;
    try {
      preload.load();
    } catch {
      // ignore
    }
  }, []);

  const setTrackBoth = useCallback((next: PlayerTrack | null) => {
    trackRef.current = next;
    setTrack(next);
  }, []);

  // 启动时只恢复播放器 UI；等用户点击播放后再加载音频，避免首页产生 Range 请求。
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
    audio.playbackRate = rate;
  }, [setTrackBoth, rate]);

  const ensureCurrentAudio = useCallback(() => {
    const audio = audioRef.current;
    const currentTrack = trackRef.current;
    if (!audio || !currentTrack) return null;
    if (audio.getAttribute('src') !== currentTrack.src) {
      audio.src = currentTrack.src;
      audio.load();
    }
    audio.playbackRate = rate;
    return audio;
  }, [rate]);

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
      const t = trackRef.current;
      if (
        pendingSeek.current == null &&
        !audio.paused &&
        t &&
        playCountedId.current !== t.id
      ) {
        playCountedId.current = t.id;
        flushProgress({ incrementPlay: true });
      }
    };
    const onTime = () => {
      setCurrent(audio.currentTime);
      syncDur();
      if (!audio.paused) {
        maybePersist(false);
        maybePreloadNext();
      }
    };
    const onPlay = () => {
      setPlaying(true);
      const t = trackRef.current;
      if (t && pendingSeek.current == null && playCountedId.current !== t.id) {
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
      if (autoAdvanceRef.current) {
        window.setTimeout(() => {
          playNextRef.current();
        }, 0);
      }
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
  }, [flushProgress, maybePersist, maybePreloadNext]);

  // 卸载时中止预加载，避免后台继续拉流
  useEffect(() => () => clearPreload(), [clearPreload]);

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

      if (opts?.queue) {
        queueRef.current = opts.queue;
      }

      // 切换曲目前先保存当前进度
      if (trackRef.current && trackRef.current.id !== next.id) {
        flushProgress();
        playCountedId.current = null;
        // 切歌后丢弃旧预加载；若正好切到已预取源，浏览器缓存可加速 load
        if (preloadedSrcRef.current && preloadedSrcRef.current !== next.src) {
          clearPreload();
        } else if (preloadedSrcRef.current === next.src) {
          preloadedSrcRef.current = null;
        }
      }

      const same = trackRef.current?.id === next.id && trackRef.current?.src === next.src;
      const sourceLoaded = audio.getAttribute('src') === next.src;
      setTrackBoth(next);
      setVisible(true);

      let seek: number | undefined = opts?.seekTo;
      if (seek == null && opts?.resume !== false) {
        seek = bestResumeSec(next.id, opts?.serverProgress);
      }
      if (seek != null) pendingSeek.current = seek;

      if (!same || !sourceLoaded) {
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
    [rate, flushProgress, setTrackBoth, clearPreload],
  );

  const setQueue = useCallback(
    (tracks: PlayerTrack[]) => {
      queueRef.current = tracks;
      // 队列变了则旧预加载可能失效
      const currentTrack = trackRef.current;
      if (!currentTrack || !preloadedSrcRef.current) return;
      const idx = tracks.findIndex((item) => item.id === currentTrack.id);
      const nextSrc = idx >= 0 && idx < tracks.length - 1 ? tracks[idx + 1]?.src : null;
      if (nextSrc !== preloadedSrcRef.current) clearPreload();
    },
    [clearPreload],
  );

  const setAutoAdvance = useCallback(
    (enabled: boolean) => {
      autoAdvanceRef.current = enabled;
      if (!enabled) clearPreload();
    },
    [clearPreload],
  );

  const playNext = useCallback((): boolean => {
    const currentTrack = trackRef.current;
    if (!currentTrack) return false;
    const q = queueRef.current;
    const idx = q.findIndex((t) => t.id === currentTrack.id);
    if (idx < 0 || idx >= q.length - 1) return false;
    const next = q[idx + 1];
    playTrack(next, { autoplay: true, resume: true });
    if (parsePath().name === 'player') {
      navigate({ name: 'player', id: next.id });
    }
    return true;
  }, [playTrack]);

  playNextRef.current = playNext;

  const play = useCallback(() => {
    const audio = ensureCurrentAudio();
    if (!audio) return;
    void audio.play().catch(() => setPlaying(false));
  }, [ensureCurrentAudio]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = ensureCurrentAudio();
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [ensureCurrentAudio]);

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
    clearPreload();
  }, [flushProgress, clearPreload]);

  const seekTo = useCallback(
    (sec: number) => {
      const audio = audioRef.current;
      const activeTrack = trackRef.current;
      if (!audio || !activeTrack) return;
      const max = safeDuration(audio) || duration;
      const next = Math.max(0, max > 0 ? Math.min(max, sec) : Math.max(0, sec));
      if (audio.getAttribute('src') !== activeTrack.src) {
        pendingSeek.current = next;
        setCurrent(next);
        return;
      }
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
      const activeTrack = trackRef.current;
      if (!audio || !activeTrack) return;
      const base =
        audio.getAttribute('src') === activeTrack.src ? audio.currentTime : current;
      seekTo(base + delta);
    },
    [current, seekTo],
  );

  const getCurrentTime = useCallback((): number => {
    const audio = audioRef.current;
    const activeTrack = trackRef.current;
    if (!audio || !activeTrack) return 0;
    if (audio.getAttribute('src') !== activeTrack.src) {
      return pendingSeek.current ?? 0;
    }
    return Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  }, []);

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
      getCurrentTime,
      setRate,
      setVisible,
      flushProgress,
      setQueue,
      setAutoAdvance,
      playNext,
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
      getCurrentTime,
      setRate,
      flushProgress,
      setQueue,
      setAutoAdvance,
      playNext,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      <audio ref={audioRef} preload="none" playsInline className="hidden" />
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
