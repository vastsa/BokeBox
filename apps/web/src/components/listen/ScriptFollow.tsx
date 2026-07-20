import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  activeLineIndexForTimeline,
  parseScriptLines,
  resolveScriptTimeline,
  type ScriptLineTiming,
  type ScriptTimingSource,
} from '../../lib/scriptFollow';
import { formatDuration } from '../../lib/format';
import { useI18n } from '../../i18n';

const CLOCK_INTERVAL_MS = 40;
const OFFSET_STEP_SEC = 0.5;
const MAX_OFFSET_SEC = 5;
const OFFSET_STORAGE_PREFIX = 'bokebox:lyrics-offset:';

const LyricCueRow = memo(function LyricCueRow({
  cue,
  index,
  state,
  active,
  focused,
  timelineReady,
  timeLabel,
  seekLabel,
  registerRef,
  onFocus,
  onKeyDown,
  onSeek,
}: {
  cue: ScriptLineTiming;
  index: number;
  state: 'is-active' | 'is-passed' | 'is-upcoming';
  active: boolean;
  focused: boolean;
  timelineReady: boolean;
  timeLabel: string;
  seekLabel: string;
  registerRef: (index: number, element: HTMLButtonElement | null) => void;
  onFocus: (index: number) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => void;
  onSeek: (index: number) => void;
}) {
  return (
    <li className={state}>
      <button
        ref={(element) => registerRef(index, element)}
        type="button"
        tabIndex={focused ? 0 : -1}
        aria-current={active ? 'true' : undefined}
        aria-disabled={!timelineReady}
        aria-label={seekLabel}
        className="qq-lyric-cue"
        onFocus={() => onFocus(index)}
        onKeyDown={(event) => onKeyDown(event, index)}
        onClick={() => onSeek(index)}
      >
        <span className="qq-lyric-copy">{cue.text}</span>
        <span className="qq-lyric-time" aria-hidden="true">
          {timeLabel}
        </span>
      </button>
    </li>
  );
});

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function readStoredOffset(syncKey?: string): number {
  if (!syncKey || typeof window === 'undefined') return 0;
  try {
    const value = Number(
      window.localStorage.getItem(`${OFFSET_STORAGE_PREFIX}${syncKey}`),
    );
    return Number.isFinite(value)
      ? clamp(value, -MAX_OFFSET_SEC, MAX_OFFSET_SEC)
      : 0;
  } catch {
    return 0;
  }
}

function usePrecisePlaybackTime(
  currentSec: number,
  playing: boolean,
  readCurrentSec?: () => number,
): number {
  const [preciseSec, setPreciseSec] = useState(currentSec);
  const currentRef = useRef(currentSec);
  const readerRef = useRef(readCurrentSec);

  useEffect(() => {
    currentRef.current = currentSec;
    readerRef.current = readCurrentSec;
    setPreciseSec((previous) =>
      !playing || Math.abs(previous - currentSec) > 0.6 ? currentSec : previous,
    );
  }, [currentSec, playing, readCurrentSec]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (now - lastUpdate >= CLOCK_INTERVAL_MS) {
        lastUpdate = now;
        const mediaTime = readerRef.current?.() ?? currentRef.current;
        if (Number.isFinite(mediaTime)) {
          setPreciseSec((previous) =>
            Math.abs(previous - mediaTime) >= 0.015 ? mediaTime : previous,
          );
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  return preciseSec;
}

export function ScriptFollow({
  script,
  currentSec,
  durationSec,
  onSeek,
  variant = 'list',
  timing,
  timingSource,
  playing = false,
  readCurrentSec,
  syncKey,
}: {
  script: string;
  currentSec: number;
  durationSec: number;
  onSeek?: (sec: number) => void;
  variant?: 'list' | 'lyrics';
  timing?: ScriptLineTiming[] | null;
  timingSource?: ScriptTimingSource | null;
  playing?: boolean;
  /** 播放中直接读取 HTMLAudioElement.currentTime，绕开低频 timeupdate。 */
  readCurrentSec?: () => number;
  /** 用于按节目保存本地歌词校准值。 */
  syncKey?: string;
}) {
  const { t } = useI18n();
  const parsed = useMemo(() => parseScriptLines(script), [script]);
  const resolved = useMemo(
    () => resolveScriptTimeline(parsed, durationSec, timing, timingSource),
    [durationSec, parsed, timing, timingSource],
  );
  const active = activeLineIndexForTimeline(resolved.lines, currentSec);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (variant === 'lyrics') return;
    activeRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [active, variant]);

  if (!parsed.length) {
    return <p className="qq-empty">{t('player.noLyrics')}</p>;
  }

  if (variant === 'lyrics') {
    return (
      <LyricsTranscript
        parsed={parsed}
        currentSec={currentSec}
        durationSec={durationSec}
        timing={timing}
        timingSource={timingSource}
        playing={playing}
        readCurrentSec={readCurrentSec}
        onSeek={onSeek}
        syncKey={syncKey}
      />
    );
  }

  return (
    <div className="script-follow">
      <div className="script-follow-hint">{t('player.followHint')}</div>
      <div className="script-follow-list">
        {parsed.map((line, index) => {
          const state =
            index === active
              ? 'is-active'
              : index < active
                ? 'is-passed'
                : 'is-upcoming';
          const cue = resolved.lines[index];
          return (
            <button
              key={`${index}-${line.text.slice(0, 12)}`}
              type="button"
              ref={index === active ? activeRef : undefined}
              className={['script-line', state].join(' ')}
              onClick={() => onSeek?.(cue?.startSec || 0)}
            >
              <span className="script-line-idx">{index + 1}</span>
              <span className="script-line-text">{line.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LyricsTranscript({
  parsed,
  currentSec,
  durationSec,
  timing,
  timingSource,
  playing,
  readCurrentSec,
  onSeek,
  syncKey,
}: {
  parsed: ReturnType<typeof parseScriptLines>;
  currentSec: number;
  durationSec: number;
  timing?: ScriptLineTiming[] | null;
  timingSource?: ScriptTimingSource | null;
  playing: boolean;
  readCurrentSec?: () => number;
  onSeek?: (sec: number) => void;
  syncKey?: string;
}) {
  const { t } = useI18n();
  const preciseSec = usePrecisePlaybackTime(currentSec, playing, readCurrentSec);
  const [offsetSec, setOffsetSec] = useState(() => readStoredOffset(syncKey));
  const [following, setFollowing] = useState(true);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const programmaticUntilRef = useRef(0);
  const lastAutoIndexRef = useRef(-1);

  useEffect(() => {
    setOffsetSec(readStoredOffset(syncKey));
    setFollowing(true);
    setCalibrationOpen(false);
    lastAutoIndexRef.current = -1;
  }, [syncKey]);

  const resolved = useMemo(
    () => resolveScriptTimeline(parsed, durationSec, timing, timingSource),
    [durationSec, parsed, timing, timingSource],
  );
  const cues = useMemo<ScriptLineTiming[]>(
    () =>
      resolved.lines.length === parsed.length
        ? resolved.lines
        : parsed.map((line) => ({
            text: line.text,
            startSec: 0,
            endSec: 1,
          })),
    [parsed, resolved.lines],
  );
  const timelineReady = resolved.lines.length === parsed.length;

  const effectiveSec = Math.max(0, preciseSec + offsetSec);
  const active = timelineReady
    ? activeLineIndexForTimeline(cues, effectiveSec)
    : 0;
  const cueLabels = useMemo(
    () =>
      cues.map((cue) => {
        const time = formatDuration(cue.startSec);
        return {
          time,
          seek: t('player.lyricSeekLabel', { time, text: cue.text }),
        };
      }),
    [cues, t],
  );

  const scrollToLine = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      const scroller = scrollRef.current;
      const target = lineRefs.current[index];
      if (!scroller || !target) return;

      // 读取 CSS 焦点线（默认偏上 34%），让当前行落在渐隐区域中央偏上
      const focusRatioRaw = getComputedStyle(scroller)
        .getPropertyValue('--lyrics-focus-y')
        .trim();
      const focusRatio = focusRatioRaw.endsWith('%')
        ? Number.parseFloat(focusRatioRaw) / 100
        : Number.parseFloat(focusRatioRaw || '0.34');
      const focusY = Number.isFinite(focusRatio)
        ? Math.min(0.48, Math.max(0.26, focusRatio))
        : 0.34;

      const scrollerBox = scroller.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const targetTop =
        scroller.scrollTop + (targetBox.top - scrollerBox.top);
      const top =
        targetTop -
        scroller.clientHeight * focusY +
        targetBox.height / 2;
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const nextTop = Math.min(maxTop, Math.max(0, top));

      // 位移极小时跳过，避免同句内进度更新触发无意义平滑滚动
      if (Math.abs(scroller.scrollTop - nextTop) < 2.5) return;

      programmaticUntilRef.current =
        performance.now() + (behavior === 'smooth' ? 520 : 120);
      scroller.scrollTo({ top: nextTop, behavior });
    },
    [],
  );

  useEffect(() => {
    if (!following) return;
    const distance = Math.abs(active - lastAutoIndexRef.current);
    const behavior: ScrollBehavior =
      prefersReducedMotion() || lastAutoIndexRef.current < 0 || distance > 3
        ? 'auto'
        : 'smooth';
    const frame = window.requestAnimationFrame(() => scrollToLine(active, behavior));
    lastAutoIndexRef.current = active;
    return () => window.cancelAnimationFrame(frame);
  }, [active, following, scrollToLine]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller?.contains(document.activeElement)) setFocusedIndex(active);
  }, [active]);

  const persistOffset = useCallback(
    (value: number) => {
      const next = Number(
        clamp(value, -MAX_OFFSET_SEC, MAX_OFFSET_SEC).toFixed(2),
      );
      setOffsetSec(next);
      if (!syncKey) return;
      try {
        if (Math.abs(next) < 0.001) {
          window.localStorage.removeItem(`${OFFSET_STORAGE_PREFIX}${syncKey}`);
        } else {
          window.localStorage.setItem(
            `${OFFSET_STORAGE_PREFIX}${syncKey}`,
            String(next),
          );
        }
      } catch {
        // 本地存储不可用时仅保留本次页面状态。
      }
    },
    [syncKey],
  );

  const followCurrent = useCallback(() => {
    setFollowing(true);
    scrollToLine(active, prefersReducedMotion() ? 'auto' : 'smooth');
  }, [active, scrollToLine]);

  const seekLine = useCallback(
    (index: number) => {
      const cue = cues[index];
      if (!cue || !timelineReady) return;
      onSeek?.(Math.max(0, cue.startSec - offsetSec));
      setFollowing(true);
      setFocusedIndex(index);
      scrollToLine(index, prefersReducedMotion() ? 'auto' : 'smooth');
    },
    [cues, offsetSec, onSeek, scrollToLine, timelineReady],
  );

  const focusLine = useCallback(
    (index: number) => {
      const next = clamp(index, 0, cues.length - 1);
      setFocusedIndex(next);
      setFollowing(false);
      lineRefs.current[next]?.focus();
    },
    [cues.length],
  );

  const onLineKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusLine(index - 1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusLine(index + 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusLine(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusLine(cues.length - 1);
      }
    },
    [cues.length, focusLine],
  );
  const registerLineRef = useCallback(
    (index: number, element: HTMLButtonElement | null) => {
      lineRefs.current[index] = element;
    },
    [],
  );
  const focusCue = useCallback((index: number) => setFocusedIndex(index), []);

  const sourceLabel =
    resolved.source === 'silence-aligned'
      ? t('player.timingSilence')
      : resolved.source === 'measured'
        ? t('player.timingMeasured')
        : t('player.timingEstimated');
  const offsetLabel = `${offsetSec > 0 ? '+' : ''}${offsetSec.toFixed(1)}s`;

  return (
    <section
      className={[
        'qq-lyrics-transcript',
        following ? '' : 'is-browsing',
        calibrationOpen ? 'is-calibrating' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={t('player.lyricsAria')}
    >
      <div className="qq-lyrics-toolbar">
        <div className="qq-lyrics-status" aria-live="polite">
          <span className={['qq-lyrics-dot', following ? 'is-live' : ''].join(' ')} />
          <span>
            {following
              ? t('player.lyricsFollowing')
              : t('player.lyricsBrowsing')}
          </span>
          <span className="qq-lyrics-source">{sourceLabel}</span>
        </div>
        <button
          type="button"
          className={[
            'qq-lyrics-calibrate-toggle',
            Math.abs(offsetSec) > 0.001 ? 'is-adjusted' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={calibrationOpen}
          onClick={() => setCalibrationOpen((value) => !value)}
        >
          {t('player.lyricsCalibrate')}
          {Math.abs(offsetSec) > 0.001 && <span>{offsetLabel}</span>}
        </button>
      </div>

      {calibrationOpen && (
        <div className="qq-lyrics-calibration">
          <div>
            <strong>{t('player.lyricsOffset')}</strong>
            <span>{t('player.lyricsOffsetHint')}</span>
          </div>
          <div className="qq-lyrics-calibration-controls">
            <button
              type="button"
              onClick={() => persistOffset(offsetSec - OFFSET_STEP_SEC)}
              aria-label={t('player.lyricsDelay')}
            >
              −
            </button>
            <output aria-label={t('player.lyricsOffset')}>{offsetLabel}</output>
            <button
              type="button"
              onClick={() => persistOffset(offsetSec + OFFSET_STEP_SEC)}
              aria-label={t('player.lyricsAdvance')}
            >
              +
            </button>
            <button
              type="button"
              className="is-reset"
              onClick={() => persistOffset(0)}
              disabled={Math.abs(offsetSec) < 0.001}
            >
              {t('player.lyricsReset')}
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="qq-lyrics-scroll"
        onWheel={() => setFollowing(false)}
        onTouchMove={() => setFollowing(false)}
        onPointerDown={() => {
          if (performance.now() >= programmaticUntilRef.current) {
            setFollowing(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'PageUp' || event.key === 'PageDown') {
            setFollowing(false);
          }
        }}
      >
        <ol className="qq-lyrics-list">
          {cues.map((cue, index) => {
            const isActive = index === active;
            const state = isActive
              ? 'is-active'
              : index < active
                ? 'is-passed'
                : 'is-upcoming';
            return (
              <LyricCueRow
                key={`${index}-${cue.text.slice(0, 16)}`}
                cue={cue}
                index={index}
                state={state}
                active={isActive}
                focused={focusedIndex === index}
                timelineReady={timelineReady}
                timeLabel={cueLabels[index].time}
                seekLabel={cueLabels[index].seek}
                registerRef={registerLineRef}
                onFocus={focusCue}
                onKeyDown={onLineKeyDown}
                onSeek={seekLine}
              />
            );
          })}
        </ol>
      </div>

      {!following && (
        <button
          type="button"
          className="qq-lyrics-return"
          onClick={followCurrent}
        >
          <span aria-hidden />
          {t('player.lyricsReturn', {
            time: formatDuration(Math.max(0, preciseSec)),
          })}
        </button>
      )}
    </section>
  );
}
