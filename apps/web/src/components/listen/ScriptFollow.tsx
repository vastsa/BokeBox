import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  activeLineIndex,
  seekSecForLine,
  splitScriptLines,
} from '../../lib/scriptFollow';

const LINE_H = 56;
const VIEW_RADIUS = 4; // 渲染中心附近行数
const SNAP_MS = 320;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export function ScriptFollow({
  script,
  currentSec,
  durationSec,
  onSeek,
  variant = 'list',
}: {
  script: string;
  currentSec: number;
  durationSec: number;
  onSeek?: (sec: number) => void;
  variant?: 'list' | 'lyrics';
}) {
  const lines = useMemo(() => splitScriptLines(script), [script]);
  const active = useMemo(
    () => activeLineIndex(lines, currentSec, durationSec),
    [lines, currentSec, durationSec],
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (variant === 'lyrics') return;
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active, variant]);

  if (!lines.length) {
    return <p className="qq-empty">暂无脚本</p>;
  }

  if (variant === 'lyrics') {
    return (
      <LyricsWheel
        lines={lines}
        active={active}
        durationSec={durationSec}
        onSeek={onSeek}
      />
    );
  }

  return (
    <div className="script-follow" ref={listRef}>
      <div className="script-follow-hint">
        跟读高亮按进度估算 · 点击句子可跳转
      </div>
      <div className="script-follow-list">
        {lines.map((line, i) => {
          const state =
            i === active ? 'is-active' : i < active ? 'is-passed' : 'is-upcoming';
          return (
            <button
              key={`${i}-${line.slice(0, 12)}`}
              type="button"
              ref={i === active ? activeRef : undefined}
              className={['script-line', state].join(' ')}
              onClick={() => onSeek?.(seekSecForLine(lines, i, durationSec))}
            >
              <span className="script-line-idx">{i + 1}</span>
              <span className="script-line-text">{line}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 连续像素滚动歌词轮：
 * - 拖拽/滚轮实时跟手
 * - 松手惯性 + 吸附最近句
 * - 播放时平滑跟随
 */
function LyricsWheel({
  lines,
  active,
  durationSec,
  onSeek,
}: {
  lines: string[];
  active: number;
  durationSec: number;
  onSeek?: (sec: number) => void;
}) {
  const maxY = Math.max(0, (lines.length - 1) * LINE_H);

  const scrollYRef = useRef(active * LINE_H);
  const [scrollY, setScrollY] = useState(active * LINE_H);
  const [interacting, setInteracting] = useState(false);

  const modeRef = useRef<'follow' | 'user'>('follow');
  const lockFollowUntil = useRef(0);
  const animRef = useRef<number | null>(null);
  const lastSample = useRef<{ y: number; t: number; v: number }>({
    y: 0,
    t: 0,
    v: 0,
  });
  const dragRef = useRef<{
    pointerId: number;
    startClientY: number;
    startScrollY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const lastSeekIndex = useRef<number | null>(null);

  const cancelAnim = () => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  const applyScroll = useCallback(
    (y: number, hard = true) => {
      const next = hard ? clamp(y, 0, maxY) : y;
      scrollYRef.current = next;
      setScrollY(next);
      return next;
    },
    [maxY],
  );

  const nearestIndex = useCallback(
    (y = scrollYRef.current) => clamp(Math.round(y / LINE_H), 0, lines.length - 1),
    [lines.length],
  );

  const seekToIndex = useCallback(
    (index: number) => {
      const i = clamp(index, 0, lines.length - 1);
      if (lastSeekIndex.current === i) return;
      lastSeekIndex.current = i;
      onSeek?.(seekSecForLine(lines, i, durationSec));
    },
    [durationSec, lines, onSeek],
  );

  /** 平滑滚到目标 y，结束后可选 seek */
  const animateTo = useCallback(
    (targetY: number, opts?: { seek?: boolean; duration?: number }) => {
      cancelAnim();
      const from = scrollYRef.current;
      const to = clamp(targetY, 0, maxY);
      const dur = opts?.duration ?? SNAP_MS;
      if (Math.abs(to - from) < 0.5) {
        applyScroll(to);
        if (opts?.seek) seekToIndex(nearestIndex(to));
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = easeOutCubic(clamp((now - t0) / dur, 0, 1));
        applyScroll(from + (to - from) * p);
        if (p < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          animRef.current = null;
          if (opts?.seek) seekToIndex(nearestIndex(to));
        }
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [applyScroll, maxY, nearestIndex, seekToIndex],
  );

  // 播放进度跟随（用户操作期间/锁定期间不抢）
  useEffect(() => {
    if (modeRef.current === 'user') return;
    if (Date.now() < lockFollowUntil.current) return;
    if (interacting) return;
    const target = active * LINE_H;
    if (Math.abs(target - scrollYRef.current) < 1) return;
    // 句间平滑滑过去，而不是瞬间跳
    animateTo(target, { duration: 380 });
    lastSeekIndex.current = active;
  }, [active, animateTo, interacting]);

  // 脚本切换时复位
  useEffect(() => {
    cancelAnim();
    modeRef.current = 'follow';
    applyScroll(active * LINE_H);
    lastSeekIndex.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  useEffect(() => () => cancelAnim(), []);

  const finishUserGesture = useCallback(
    (velocity: number) => {
      // 惯性：v 单位 px/ms
      let y = scrollYRef.current;
      const maxV = 2.8;
      let v = clamp(velocity, -maxV, maxV);

      // 速度太小直接吸附
      if (Math.abs(v) < 0.08) {
        const idx = nearestIndex(y);
        lockFollowUntil.current = Date.now() + 900;
        modeRef.current = 'user';
        animateTo(idx * LINE_H, { seek: true, duration: 280 });
        window.setTimeout(() => {
          if (Date.now() >= lockFollowUntil.current) modeRef.current = 'follow';
        }, 950);
        setInteracting(false);
        return;
      }

      cancelAnim();
      const t0 = performance.now();
      let lastT = t0;
      const friction = 0.0024;

      const step = (now: number) => {
        const dt = Math.min(32, now - lastT);
        lastT = now;
        v *= Math.exp(-friction * dt);
        y += v * dt;

        // 边界回弹
        if (y < 0) {
          y = 0;
          v = 0;
        } else if (y > maxY) {
          y = maxY;
          v = 0;
        }
        applyScroll(y);

        if (Math.abs(v) > 0.05 && now - t0 < 900) {
          animRef.current = requestAnimationFrame(step);
          return;
        }

        const idx = nearestIndex(y);
        lockFollowUntil.current = Date.now() + 900;
        modeRef.current = 'user';
        animateTo(idx * LINE_H, { seek: true, duration: 260 });
        window.setTimeout(() => {
          if (Date.now() >= lockFollowUntil.current) modeRef.current = 'follow';
        }, 950);
        setInteracting(false);
      };
      animRef.current = requestAnimationFrame(step);
    },
    [animateTo, applyScroll, maxY, nearestIndex],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    cancelAnim();
    modeRef.current = 'user';
    setInteracting(true);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientY: e.clientY,
      startScrollY: scrollYRef.current,
      moved: false,
    };
    lastSample.current = { y: scrollYRef.current, t: performance.now(), v: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = d.startClientY - e.clientY; // 上滑内容上移 = scrollY 增大
    if (Math.abs(dy) > 3) d.moved = true;

    let next = d.startScrollY + dy;
    // 边缘橡皮筋（软约束，不 hard clamp）
    if (next < 0) next *= 0.28;
    else if (next > maxY) next = maxY + (next - maxY) * 0.28;
    applyScroll(next, false);

    const now = performance.now();
    const sample = lastSample.current;
    const dt = now - sample.t;
    if (dt > 8) {
      sample.v = (scrollYRef.current - sample.y) / dt;
      sample.y = scrollYRef.current;
      sample.t = now;
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!d.moved) {
      setInteracting(false);
      return;
    }
    suppressClick.current = true;
    finishUserGesture(lastSample.current.v);
  };

  // 滚轮：连续滚动，停轮后再吸附 seek
  const wheelIdleTimer = useRef<number | null>(null);
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    cancelAnim();
    modeRef.current = 'user';
    setInteracting(true);

    // 触控板平滑 delta
    const dy = e.deltaY;
    applyScroll(scrollYRef.current + dy * (e.deltaMode === 1 ? LINE_H * 0.35 : 0.85));

    if (wheelIdleTimer.current != null) window.clearTimeout(wheelIdleTimer.current);
    wheelIdleTimer.current = window.setTimeout(() => {
      wheelIdleTimer.current = null;
      finishUserGesture(0);
    }, 120);
  };

  const center = clamp(scrollY / LINE_H, -0.4, lines.length - 0.6);
  const centerIdx = nearestIndex(clamp(scrollY, 0, maxY));
  const from = Math.max(0, Math.floor(center) - VIEW_RADIUS);
  const to = Math.min(lines.length - 1, Math.ceil(center) + VIEW_RADIUS);

  const items: { i: number; text: string; dist: number }[] = [];
  for (let i = from; i <= to; i += 1) {
    items.push({ i, text: lines[i], dist: i - center });
  }

  return (
    <div
      className={['qq-lyrics-wheel', interacting ? 'is-dragging' : ''].join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
      role="listbox"
      aria-label="歌词，可上下滑动"
      aria-activedescendant={`lyric-${centerIdx}`}
    >
      <div className="qq-lyrics-stage" style={{ ['--lyric-h' as string]: `${LINE_H}px` }}>
        <div className="qq-lyrics-focus" aria-hidden />
        {items.map(({ i, text, dist }) => {
          const ad = Math.abs(dist);
          const isCenter = ad < 0.5;
          const opacity = clamp(1 - ad * 0.28, 0.14, 1);
          const scale = clamp(1 - ad * 0.055, 0.86, 1);
          const y = dist * LINE_H;
          return (
            <button
              key={i}
              id={`lyric-${i}`}
              type="button"
              role="option"
              aria-selected={isCenter}
              className={['qq-lyric-line', isCenter ? 'is-active' : ''].join(' ')}
              style={{
                opacity,
                transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
              }}
              onClick={(ev) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  ev.preventDefault();
                  return;
                }
                cancelAnim();
                modeRef.current = 'user';
                lockFollowUntil.current = Date.now() + 900;
                animateTo(i * LINE_H, { seek: true, duration: 300 });
                window.setTimeout(() => {
                  if (Date.now() >= lockFollowUntil.current) modeRef.current = 'follow';
                }, 950);
              }}
            >
              <span className="qq-lyric-text">{text}</span>
            </button>
          );
        })}
      </div>
      <div className="qq-lyrics-meta" aria-hidden>
        <span>
          {centerIdx + 1}
          <i>/</i>
          {lines.length}
        </span>
      </div>
    </div>
  );
}
