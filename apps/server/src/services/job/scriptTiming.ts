/**
 * 口播脚本时间轴
 * - 默认：按可发音字符权重均分
 * - 有音频时：用静音边界吸附，显著提升跟读对齐
 * - TTS 多段合成时：可叠加 chunk 实测时长锚定
 */
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  isValidScriptTimingRows,
  parseScriptLines,
  spokenWeight,
  stripAudioTags,
  type ParsedScriptLine,
  type ScriptLineTiming,
  type ScriptTimingSource,
} from '@bokebox/shared';
import { jobPaths } from '../../utils/paths.js';
import { pathExists } from '../../utils/fs.js';
import { resolveFfmpegPath } from '../../utils/ffmpeg.js';

const execFileAsync = promisify(execFile);

export { spokenWeight, stripAudioTags };
export type { ParsedScriptLine, ScriptLineTiming };

export const parseScriptLinesDetailed = parseScriptLines;

export type ScriptTimingFile = {
  version: 1;
  durationSec: number;
  source: ScriptTimingSource;
  lines: ScriptLineTiming[];
};

function distribute(
  items: Array<{ text: string; weight: number }>,
  startSec: number,
  durationSec: number,
): ScriptLineTiming[] {
  if (!items.length || durationSec <= 0) return [];
  const total = items.reduce((a, b) => a + b.weight, 0) || 1;
  let acc = 0;
  return items.map((item) => {
    const s = startSec + (acc / total) * durationSec;
    acc += item.weight;
    const e = startSec + (acc / total) * durationSec;
    return {
      text: item.text,
      startSec: Number(s.toFixed(3)),
      endSec: Number(e.toFixed(3)),
    };
  });
}

/** 探测静音区间 */
export async function detectSilenceIntervals(
  audioPath: string,
  opts?: { noiseDb?: number; minDuration?: number },
): Promise<Array<{ start: number; end: number }>> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) return [];
  if (!(await pathExists(audioPath))) return [];

  const noiseDb = opts?.noiseDb ?? -32;
  const minDuration = opts?.minDuration ?? 0.35;
  try {
    const { stderr } = await execFileAsync(
      ffmpegPath,
      [
        '-i',
        audioPath,
        '-af',
        `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
        '-f',
        'null',
        '-',
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    const log = String(stderr || '');
    const starts = [...log.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) =>
      Number(m[1]),
    );
    const ends = [...log.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) =>
      Number(m[1]),
    );
    const n = Math.min(starts.length, ends.length);
    const out: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < n; i += 1) {
      if (ends[i] > starts[i]) out.push({ start: starts[i], end: ends[i] });
    }
    return out;
  } catch {
    return [];
  }
}

/** 只解析媒体头读取时长，避免为了探测时长完整解码音频。 */
export async function probeAudioDurationSec(audioPath: string): Promise<number> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath || !(await pathExists(audioPath))) return 0;
  try {
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-i', audioPath],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    const m = String(stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } catch (err) {
    // ffmpeg -i 无输出文件时 exit code 非 0，但仍有 Duration
    const msg = err instanceof Error ? (err as Error & { stderr?: string }).stderr || err.message : '';
    const m = String(msg).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
}

/**
 * 将理想句末时间吸附到最近静音起点（句间停顿）。
 * 若理想点落在某段静音内，吸附到该静音起点。
 */
function snapEndsToSilence(
  idealEnds: number[],
  silences: Array<{ start: number; end: number }>,
  durationSec: number,
): number[] {
  if (!idealEnds.length || !Number.isFinite(durationSec) || durationSec <= 0) return [];
  const minGap = Math.min(0.18, (durationSec / idealEnds.length) * 0.4);
  const safeSilences = silences.filter(
    (item) =>
      Number.isFinite(item.start) &&
      Number.isFinite(item.end) &&
      item.start >= 0 &&
      item.end > item.start &&
      item.start < durationSec,
  );
  const candidates = [0, ...safeSilences.map((s) => s.start), durationSec]
    .filter((x) => x >= 0 && x <= durationSec + 0.01)
    .map((x) => Number(x.toFixed(3)));
  const points = [...new Set(candidates)].sort((a, b) => a - b);

  const snapped: number[] = [];
  let prev = 0;
  for (let i = 0; i < idealEnds.length; i += 1) {
    const ideal = idealEnds[i];
    const isLast = i === idealEnds.length - 1;
    if (isLast) {
      snapped.push(Number(durationSec.toFixed(3)));
      break;
    }

    const remain = idealEnds.length - i - 1;
    const minEnd = prev + minGap;
    const maxEnd = durationSec - remain * minGap;
    const safeIdeal = Math.min(maxEnd, Math.max(minEnd, ideal));

    // 理想点落在静音区间内 → 直接用静音起点
    let best: number | null = null;
    for (const s of safeSilences) {
      if (safeIdeal >= s.start - 0.05 && safeIdeal <= s.end + 0.05) {
        if (s.start >= minEnd && s.start <= maxEnd) {
          best = s.start;
          break;
        }
      }
    }

    if (best == null) {
      let bestScore = Infinity;
      best = safeIdeal;
      for (const p of points) {
        if (p < minEnd) continue;
        if (p > maxEnd) break;
        // 允许略早吸附到句末停顿，不再强惩罚
        const score = Math.abs(p - safeIdeal);
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
      // 最近静音太远则保留理想值，避免乱跳
      if (bestScore > 2.2) {
        best = safeIdeal;
      }
    }

    best = Math.min(maxEnd, Math.max(minEnd, best));
    snapped.push(Number(best.toFixed(3)));
    prev = best;
  }
  return snapped;
}

function timingFromEnds(
  lines: Array<{ text: string }>,
  ends: number[],
): ScriptLineTiming[] {
  return lines.map((l, i) => ({
    text: l.text,
    startSec: Number((i === 0 ? 0 : ends[i - 1]).toFixed(3)),
    endSec: Number(ends[i].toFixed(3)),
  }));
}

/**
 * 由总时长估算；可选 TTS 分块实测；可选静音吸附。
 */
export type ScriptTimingChunk = {
  sourceStart: number;
  sourceEnd: number;
  durationSec: number;
};

function assignLinesToChunks(
  lines: ParsedScriptLine[],
  chunks: ScriptTimingChunk[],
): ParsedScriptLine[][] {
  const groups = chunks.map(() => [] as ParsedScriptLine[]);
  for (const line of lines) {
    let bestIndex = -1;
    let bestOverlap = -1;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const overlap = Math.max(
        0,
        Math.min(line.sourceEnd, chunk.sourceEnd) -
          Math.max(line.sourceStart, chunk.sourceStart),
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestOverlap <= 0) continue;
    groups[bestIndex].push(line);
  }
  return groups;
}

export function buildScriptTiming(options: {
  script: string;
  durationSec: number;
  chunks?: ScriptTimingChunk[];
  silences?: Array<{ start: number; end: number }>;
}): ScriptTimingFile {
  const lines = parseScriptLinesDetailed(options.script);
  const durationSec =
    Number.isFinite(options.durationSec) && options.durationSec > 0
      ? options.durationSec
      : 0;
  const chunks = options.chunks || [];
  if (!lines.length || durationSec <= 0) {
    return { version: 1, durationSec, source: 'estimated', lines: [] };
  }

  // 1) 分块实测：块间锚点 + 块内字重
  if (
    chunks.length > 0 &&
    chunks.every(
      (chunk) =>
        Number.isFinite(chunk.sourceStart) &&
        Number.isFinite(chunk.sourceEnd) &&
        Number.isFinite(chunk.durationSec) &&
        chunk.sourceStart >= 0 &&
        chunk.sourceEnd > chunk.sourceStart &&
        chunk.durationSec > 0,
    )
  ) {
    const groups = assignLinesToChunks(lines, chunks);
    const timed: ScriptLineTiming[] = [];
    let chunkStartSec = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const inChunk = groups[index];
      if (!inChunk.length) {
        chunkStartSec += chunk.durationSec;
        continue;
      }
      timed.push(
        ...distribute(
          inChunk.map((l) => ({ text: l.text, weight: l.weight })),
          chunkStartSec,
          chunk.durationSec,
        ),
      );
      chunkStartSec += chunk.durationSec;
    }

    const completeMapping =
      timed.length === lines.length &&
      timed.every((row, index) => row.text === lines[index].text);

    if (completeMapping) {
      const last = timed[timed.length - 1];
      if (Math.abs(last.endSec - durationSec) > 0.05) {
        const scale = durationSec / Math.max(last.endSec, 0.001);
        for (const row of timed) {
          row.startSec = Number((row.startSec * scale).toFixed(3));
          row.endSec = Number((row.endSec * scale).toFixed(3));
        }
      }

      // 再做静音精修（若有）
      if (options.silences?.length) {
        const idealEnds = timed.map((t) => t.endSec);
        const ends = snapEndsToSilence(idealEnds, options.silences, durationSec);
        return {
          version: 1,
          durationSec,
          source: 'silence-aligned',
          lines: timingFromEnds(lines, ends),
        };
      }

      return {
        version: 1,
        durationSec,
        source: 'measured',
        lines: timed,
      };
    }
  }

  // 2) 纯字重理想句末
  const totalW = lines.reduce((a, b) => a + b.weight, 0) || 1;
  let acc = 0;
  const idealEnds = lines.map((l) => {
    acc += l.weight;
    return (acc / totalW) * durationSec;
  });

  // 3) 静音吸附
  if (options.silences?.length) {
    const ends = snapEndsToSilence(idealEnds, options.silences, durationSec);
    return {
      version: 1,
      durationSec,
      source: 'silence-aligned',
      lines: timingFromEnds(lines, ends),
    };
  }

  const estimated = distribute(
    lines.map((l) => ({ text: l.text, weight: l.weight })),
    0,
    durationSec,
  );
  if (estimated.length) {
    estimated[estimated.length - 1].endSec = Number(durationSec.toFixed(3));
  }
  return {
    version: 1,
    durationSec,
    source: 'estimated',
    lines: estimated,
  };
}

/** 针对已有音频生成对齐时间轴（静音吸附优先） */
export async function buildAlignedScriptTiming(options: {
  script: string;
  audioPath: string;
  durationSec?: number;
}): Promise<ScriptTimingFile> {
  const durationSec =
    options.durationSec && options.durationSec > 0
      ? options.durationSec
      : await probeAudioDurationSec(options.audioPath);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('无法读取音频时长，不能生成可靠的口播时间轴');
  }
  const silences = await detectSilenceIntervals(options.audioPath);
  return buildScriptTiming({
    script: options.script,
    durationSec,
    silences,
  });
}

export async function writeScriptTiming(
  jobId: string,
  timing: ScriptTimingFile,
): Promise<string> {
  if (!isValidScriptTimingFile(timing)) {
    throw new Error('拒绝写入无效的口播时间轴');
  }
  const paths = jobPaths(jobId);
  await fs.writeFile(paths.scriptTiming, JSON.stringify(timing, null, 2), 'utf8');
  return paths.scriptTiming;
}

export async function readScriptTiming(
  jobId: string,
  expectedScript?: string,
): Promise<ScriptTimingFile | null> {
  const file = jobPaths(jobId).scriptTiming;
  if (!(await pathExists(file))) return null;
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as ScriptTimingFile;
    const expectedLines = expectedScript ? parseScriptLines(expectedScript) : undefined;
    if (!isValidScriptTimingFile(parsed, expectedLines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isValidScriptTimingFile(
  timing: ScriptTimingFile | null | undefined,
  expectedLines?: Array<Pick<ParsedScriptLine, 'text'>>,
): timing is ScriptTimingFile {
  if (!timing || timing.version !== 1) return false;
  if (!Number.isFinite(timing.durationSec) || timing.durationSec <= 0) return false;
  if (!['estimated', 'measured', 'silence-aligned'].includes(timing.source)) return false;
  if (!isValidScriptTimingRows(timing.lines, expectedLines)) return false;

  const tolerance = Math.max(0.05, Math.min(0.5, timing.durationSec * 0.005));
  const first = timing.lines[0];
  const last = timing.lines[timing.lines.length - 1];
  if (Math.abs(first.startSec) > tolerance) return false;
  if (last.endSec > timing.durationSec + tolerance) return false;
  if (Math.abs(last.endSec - timing.durationSec) > tolerance) return false;
  return timing.lines.every(
    (row) => row.startSec <= timing.durationSec + tolerance,
  );
}


function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** 秒 → SRT 时间码 HH:MM:SS,mmm */
export function formatSrtTimestamp(sec: number): string {
  const safe = Math.max(0, Number(sec) || 0);
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

/** 由时间轴生成 SRT（一行一句，已去音频标签） */
export function buildSrtFromTiming(lines: ScriptLineTiming[]): string {
  const rows = (lines || []).filter(
    (line) =>
      line &&
      String(line.text || '').trim() &&
      Number.isFinite(line.startSec) &&
      Number.isFinite(line.endSec) &&
      line.endSec > line.startSec,
  );
  if (!rows.length) return '';
  return (
    rows
      .map((line, index) => {
        const text = stripAudioTags(line.text).replace(/\s+/gu, ' ').trim();
        return [
          String(index + 1),
          `${formatSrtTimestamp(line.startSec)} --> ${formatSrtTimestamp(line.endSec)}`,
          text,
        ].join('\n');
      })
      .join('\n\n') + '\n'
  );
}

/** 写入 podcast.srt（与 script-timing 同步） */
export async function writePodcastSrt(
  jobId: string,
  timing: ScriptTimingFile | { lines: ScriptLineTiming[] },
): Promise<string | null> {
  const body = buildSrtFromTiming(timing.lines || []);
  const file = jobPaths(jobId).podcastSrt;
  if (!body) {
    try {
      await fs.unlink(file);
    } catch {
      // ignore
    }
    return null;
  }
  await fs.writeFile(file, body, 'utf8');
  return file;
}

/**
 * 按「句音频实测 + 句间静音」直接构建时间轴。
 * speechRanges 对应每句语音起止（不含后随 gap）。
 */
export function buildScriptTimingFromSpeechRanges(options: {
  script: string;
  speechRanges: Array<{ startSec: number; endSec: number }>;
  gapSec?: number;
  durationSec?: number;
}): ScriptTimingFile {
  const lines = parseScriptLinesDetailed(options.script);
  const ranges = options.speechRanges || [];
  if (!lines.length || !ranges.length) {
    return {
      version: 1,
      durationSec: options.durationSec || 0,
      source: 'estimated',
      lines: [],
    };
  }

  const count = Math.min(lines.length, ranges.length);
  const timed: ScriptLineTiming[] = [];
  for (let i = 0; i < count; i += 1) {
    const range = ranges[i];
    timed.push({
      text: lines[i].text,
      startSec: Number(range.startSec.toFixed(3)),
      endSec: Number(range.endSec.toFixed(3)),
    });
  }

  // 若句数多于 speech range（极少见），用末尾均分兜底
  if (lines.length > count) {
    const lastEnd = timed[timed.length - 1]?.endSec || 0;
    const remain = lines.slice(count);
    const tailDur = Math.max(0.2, (options.durationSec || lastEnd) - lastEnd);
    timed.push(
      ...distribute(
        remain.map((l) => ({ text: l.text, weight: l.weight })),
        lastEnd,
        tailDur,
      ),
    );
  }

  const durationSec =
    (Number.isFinite(options.durationSec) && (options.durationSec || 0) > 0
      ? options.durationSec!
      : timed[timed.length - 1]?.endSec) || 0;

  if (timed.length) {
    // 保证单调且最后一句不越过总时长
    for (let i = 0; i < timed.length; i += 1) {
      if (i > 0 && timed[i].startSec < timed[i - 1].endSec) {
        timed[i].startSec = timed[i - 1].endSec;
      }
      if (timed[i].endSec <= timed[i].startSec) {
        timed[i].endSec = Number((timed[i].startSec + 0.05).toFixed(3));
      }
    }
    timed[timed.length - 1].endSec = Math.min(
      timed[timed.length - 1].endSec,
      Number(durationSec.toFixed(3)),
    );
  }

  return {
    version: 1,
    durationSec: Number(durationSec.toFixed(3)),
    source: 'measured',
    lines: timed,
  };
}

