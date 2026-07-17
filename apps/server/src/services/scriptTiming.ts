/**
 * 口播脚本时间轴
 * - 默认：按可发音字符权重均分
 * - 有音频时：用静音边界吸附，显著提升跟读对齐
 * - TTS 多段合成时：可叠加 chunk 实测时长锚定
 */
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jobPaths } from '../utils/paths.js';
import { pathExists } from '../utils/fs.js';
import { resolveFfmpegPath } from '../utils/ffmpeg.js';

const execFileAsync = promisify(execFile);

export type ScriptLineTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

export type ScriptTimingFile = {
  version: 1;
  durationSec: number;
  /** estimated | measured | silence-aligned */
  source: 'estimated' | 'measured' | 'silence-aligned';
  lines: ScriptLineTiming[];
};

const AUDIO_TAG_RE = /[\(（\[]\s*[^\)）\]]{1,48}\s*[\)）\]]/g;

export function stripAudioTags(text: string): string {
  return text
    .replace(AUDIO_TAG_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([，,。.!！？?；;：:、])/g, '$1')
    .trim();
}

/** 可发音字符权重：去空白标点，避免启发式把误差放大 */
export function spokenWeight(text: string): number {
  const cleaned = stripAudioTags(text)
    .replace(/\s+/g, '')
    .replace(/[，,。.!！？?；;：:、"'“”‘’「」『』【】\[\]（）()…—–\-·•]/g, '');
  return Math.max(1, cleaned.length);
}

export type ParsedScriptLine = {
  text: string;
  weight: number;
  sourceStart: number;
  sourceEnd: number;
};

export function parseScriptLinesDetailed(script: string): ParsedScriptLine[] {
  const normalized = script.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines: ParsedScriptLine[] = [];
  const blocks = normalized.split(/\n+/);
  let searchFrom = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) {
      searchFrom += rawBlock.length + 1;
      continue;
    }

    const blockStart = normalized.indexOf(block, searchFrom);
    const base = blockStart >= 0 ? blockStart : searchFrom;
    searchFrom = base + block.length;

    const parts = block
      .split(/(?<=[。！？!?；;])/)
      .map((s) => s.trim())
      .filter(Boolean);

    const rawLines: string[] = [];
    if (parts.length <= 1) {
      if (block.length > 60) {
        const soft = block
          .split(/(?<=[，,、])/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (soft.length > 1) {
          let buf = '';
          for (const s of soft) {
            if ((buf + s).length > 48 && buf) {
              rawLines.push(buf);
              buf = s;
            } else {
              buf += s;
            }
          }
          if (buf) rawLines.push(buf);
        } else {
          rawLines.push(block);
        }
      } else {
        rawLines.push(block);
      }
    } else {
      rawLines.push(...parts);
    }

    let localFrom = 0;
    for (const raw of rawLines) {
      const rel = block.indexOf(raw, localFrom);
      const start = base + (rel >= 0 ? rel : localFrom);
      const end = start + raw.length;
      localFrom = (rel >= 0 ? rel : localFrom) + raw.length;

      const text = stripAudioTags(raw);
      if (!text) continue;
      lines.push({
        text,
        weight: spokenWeight(text),
        sourceStart: start,
        sourceEnd: end,
      });
    }
  }

  return lines.length
    ? lines
    : [
        {
          text: stripAudioTags(normalized) || normalized,
          weight: 8,
          sourceStart: 0,
          sourceEnd: normalized.length,
        },
      ];
}

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

/** 读取音频时长（优先 ffmpeg 输出） */
export async function probeAudioDurationSec(audioPath: string): Promise<number> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath || !(await pathExists(audioPath))) return 0;
  try {
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ['-i', audioPath, '-f', 'null', '-'],
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
  const candidates = [0, ...silences.map((s) => s.start), durationSec]
    .filter((x) => x >= 0 && x <= durationSec + 0.01)
    .map((x) => Number(x.toFixed(3)));
  const points = [...new Set(candidates)].sort((a, b) => a - b);

  const snapped: number[] = [];
  let prev = 0;
  for (let i = 0; i < idealEnds.length; i += 1) {
    const ideal = idealEnds[i];
    const isLast = i === idealEnds.length - 1;
    if (isLast) {
      snapped.push(durationSec);
      break;
    }

    const remain = idealEnds.length - i - 1;
    const minEnd = prev + 0.18;
    const maxEnd = Math.max(minEnd + 0.05, durationSec - remain * 0.15);

    // 理想点落在静音区间内 → 直接用静音起点
    let best: number | null = null;
    for (const s of silences) {
      if (ideal >= s.start - 0.05 && ideal <= s.end + 0.05) {
        if (s.start > prev + 0.05 && s.start <= maxEnd) {
          best = s.start;
          break;
        }
      }
    }

    if (best == null) {
      let bestScore = Infinity;
      best = Math.min(maxEnd, Math.max(minEnd, ideal));
      for (const p of points) {
        if (p <= prev + 0.05) continue;
        if (p > maxEnd) break;
        // 允许略早吸附到句末停顿，不再强惩罚
        const score = Math.abs(p - ideal);
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
      // 最近静音太远则保留理想值，避免乱跳
      if (bestScore > 2.2) {
        best = Math.min(maxEnd, Math.max(minEnd, ideal));
      }
    }

    best = Math.min(maxEnd, Math.max(minEnd, best));
    // 保证严格递增
    if (best <= prev) best = Math.min(maxEnd, prev + 0.2);
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
export function buildScriptTiming(options: {
  script: string;
  durationSec: number;
  chunks?: string[];
  chunkDurationsSec?: number[];
  silences?: Array<{ start: number; end: number }>;
}): ScriptTimingFile {
  const lines = parseScriptLinesDetailed(options.script);
  const durationSec = Math.max(0, options.durationSec);
  const chunks = options.chunks || [];
  const chunkDurs = options.chunkDurationsSec || [];

  // 1) 分块实测：块间锚点 + 块内字重
  if (
    chunks.length > 0 &&
    chunkDurs.length === chunks.length &&
    chunkDurs.every((d) => d > 0)
  ) {
    const normalized = options.script.replace(/\r\n/g, '\n').trim();
    let cursor = 0;
    const ranges: Array<{ start: number; end: number; dur: number }> = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      let idx = normalized.indexOf(chunk, cursor);
      if (idx < 0) idx = cursor;
      const start = idx;
      const end = idx + chunk.length;
      ranges.push({ start, end, dur: chunkDurs[i] });
      cursor = end;
    }

    const timed: ScriptLineTiming[] = [];
    let chunkStartSec = 0;
    for (const range of ranges) {
      const inChunk = lines.filter(
        (l) => l.sourceStart < range.end && l.sourceEnd > range.start,
      );
      if (!inChunk.length) {
        chunkStartSec += range.dur;
        continue;
      }
      timed.push(
        ...distribute(
          inChunk.map((l) => ({ text: l.text, weight: l.weight })),
          chunkStartSec,
          range.dur,
        ),
      );
      chunkStartSec += range.dur;
    }

    if (timed.length && durationSec > 0) {
      const last = timed[timed.length - 1];
      if (Math.abs(last.endSec - durationSec) > 0.05) {
        const scale = durationSec / Math.max(last.endSec, 0.001);
        for (const row of timed) {
          row.startSec = Number((row.startSec * scale).toFixed(3));
          row.endSec = Number((row.endSec * scale).toFixed(3));
        }
      }
    }

    // 再做静音精修（若有）
    if (options.silences?.length && timed.length === lines.length) {
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
  const silences = await detectSilenceIntervals(options.audioPath);
  return buildScriptTiming({
    script: options.script,
    durationSec: durationSec || 1,
    silences,
  });
}

export async function writeScriptTiming(
  jobId: string,
  timing: ScriptTimingFile,
): Promise<string> {
  const paths = jobPaths(jobId);
  await fs.writeFile(paths.scriptTiming, JSON.stringify(timing, null, 2), 'utf8');
  return paths.scriptTiming;
}

export async function readScriptTiming(
  jobId: string,
): Promise<ScriptTimingFile | null> {
  const file = jobPaths(jobId).scriptTiming;
  if (!(await pathExists(file))) return null;
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as ScriptTimingFile;
    if (!parsed?.lines?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}
