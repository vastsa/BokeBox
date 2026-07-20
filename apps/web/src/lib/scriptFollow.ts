/**
 * 口播脚本 → 跟读时间轴。
 *
 * 解析规则来自 @bokebox/shared，确保 TTS 输入、服务端时间轴与前端展示一致。
 * 服务端时间轴只有通过文本、有限值和单调性校验后才会被采用。
 */
import {
  isValidScriptTimingRows,
  parseScriptLines,
  spokenWeight,
  splitScriptLines,
  stripAudioTags,
  type ParsedScriptLine,
  type ScriptLineTiming,
  type ScriptTimingSource,
} from '@bokebox/shared';

export {
  parseScriptLines,
  spokenWeight,
  splitScriptLines,
  stripAudioTags,
};
export type { ParsedScriptLine, ScriptLineTiming, ScriptTimingSource };

export type ResolvedScriptTimeline = {
  lines: ScriptLineTiming[];
  source: ScriptTimingSource;
  usedProvidedTiming: boolean;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function asParsedLines(
  lines: string[] | ParsedScriptLine[],
): Array<Pick<ParsedScriptLine, 'text' | 'weight'>> {
  if (!lines.length) return [];
  if (typeof lines[0] === 'string') {
    return (lines as string[]).map((text) => ({
      text,
      weight: spokenWeight(text),
    }));
  }
  return lines as ParsedScriptLine[];
}

function scaleTiming(
  timing: ScriptLineTiming[],
  durationSec: number,
): ScriptLineTiming[] | null {
  const lastEnd = timing[timing.length - 1]?.endSec || 0;
  if (durationSec <= 0 || lastEnd <= 0 || Math.abs(lastEnd - durationSec) < 0.05) {
    return timing.map((row) => ({ ...row }));
  }
  // 只归一化容器/编码造成的小幅差异；明显偏差视为旧时间轴损坏。
  const toleratedDrift = Math.max(1, lastEnd * 0.05);
  if (Math.abs(durationSec - lastEnd) > toleratedDrift) return null;
  const scale = durationSec / lastEnd;
  return timing.map((row) => ({
    text: row.text,
    startSec: Number((row.startSec * scale).toFixed(3)),
    endSec: Number((row.endSec * scale).toFixed(3)),
  }));
}

function estimateFromLines(
  parsed: Array<Pick<ParsedScriptLine, 'text' | 'weight'>>,
  durationSec: number,
): ScriptLineTiming[] {
  if (!parsed.length || durationSec <= 0) return [];
  const total = parsed.reduce((sum, line) => sum + line.weight, 0) || 1;
  let accumulated = 0;
  return parsed.map((line, index) => {
    const startSec = (accumulated / total) * durationSec;
    accumulated += line.weight;
    const endSec =
      index === parsed.length - 1
        ? durationSec
        : (accumulated / total) * durationSec;
    return {
      text: line.text,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
    };
  });
}

/**
 * 生成页面实际使用的时间轴。任何无效服务端数据都会回退到真实媒体时长估算。
 */
export function resolveScriptTimeline(
  lines: string[] | ParsedScriptLine[],
  durationSec: number,
  timing?: ScriptLineTiming[] | null,
  timingSource?: ScriptTimingSource | null,
): ResolvedScriptTimeline {
  const parsed = asParsedLines(lines);
  if (!parsed.length) {
    return { lines: [], source: 'estimated', usedProvidedTiming: false };
  }

  if (isValidScriptTimingRows(timing, parsed)) {
    const resolvedDuration =
      Number.isFinite(durationSec) && durationSec > 0
        ? durationSec
        : timing[timing.length - 1].endSec;
    const scaled = scaleTiming(timing, resolvedDuration);
    if (scaled && isValidScriptTimingRows(scaled, parsed)) {
      return {
        lines: scaled,
        source: timingSource || 'measured',
        usedProvidedTiming: true,
      };
    }
  }

  const fallbackDuration =
    Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  return {
    lines: estimateFromLines(parsed, fallbackDuration),
    source: 'estimated',
    usedProvidedTiming: false,
  };
}

/** 已归一化时间轴上的当前句索引，使用二分查找避免逐帧全量扫描。 */
export function activeLineIndexForTimeline(
  timeline: ScriptLineTiming[],
  currentSec: number,
): number {
  if (!timeline.length) return 0;
  const current = Math.max(0, Number.isFinite(currentSec) ? currentSec : 0);
  let low = 0;
  let high = timeline.length - 1;
  let result = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (timeline[middle].startSec <= current) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

/** 当前句内部进度；只有句级时间轴时用于进度轨，不伪造逐词时间。 */
export function lineProgressForTimeline(
  timeline: ScriptLineTiming[],
  index: number,
  currentSec: number,
): number {
  const cue = timeline[clamp(index, 0, Math.max(0, timeline.length - 1))];
  if (!cue) return 0;
  const length = cue.endSec - cue.startSec;
  if (length <= 0) return 0;
  return clamp((currentSec - cue.startSec) / length, 0, 1);
}

/** 兼容列表视图：将播放进度映射到句子索引。 */
export function activeLineIndex(
  lines: string[] | ParsedScriptLine[],
  currentSec: number,
  durationSec: number,
  timing?: ScriptLineTiming[] | null,
): number {
  const timeline = resolveScriptTimeline(lines, durationSec, timing).lines;
  return activeLineIndexForTimeline(timeline, currentSec);
}

/** 点击某句时返回句首秒数。 */
export function seekSecForLine(
  lines: string[] | ParsedScriptLine[],
  index: number,
  durationSec: number,
  timing?: ScriptLineTiming[] | null,
): number {
  const timeline = resolveScriptTimeline(lines, durationSec, timing).lines;
  if (!timeline.length) return 0;
  return Math.max(
    0,
    timeline[clamp(index, 0, timeline.length - 1)]?.startSec || 0,
  );
}

/** 客户端兜底估算，不写回服务端。 */
export function estimateScriptTiming(
  script: string,
  durationSec: number,
): ScriptLineTiming[] {
  return estimateFromLines(parseScriptLines(script), durationSec);
}
