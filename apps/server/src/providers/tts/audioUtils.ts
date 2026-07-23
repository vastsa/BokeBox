/** TTS 音频拼接 / 切段工具（与具体协议无关） */

export type ScriptChunk = {
  text: string;
  sourceStart: number;
  sourceEnd: number;
};

type SourceRange = { start: number; end: number };

function trimRange(text: string, range: SourceRange): SourceRange | null {
  const raw = text.slice(range.start, range.end);
  const value = raw.trim();
  if (!value) return null;
  const leading = raw.indexOf(value);
  const start = range.start + Math.max(0, leading);
  return { start, end: start + value.length };
}

function splitOversizedRange(
  text: string,
  range: SourceRange,
  maxLen: number,
): SourceRange[] {
  const output: SourceRange[] = [];
  let start = range.start;
  while (range.end - start > maxLen) {
    const hardEnd = start + maxLen;
    const softStart = start + Math.floor(maxLen * 0.55);
    let end = hardEnd;
    for (let index = hardEnd - 1; index >= softStart; index -= 1) {
      if (/[，,、；;：:\s]/u.test(text[index])) {
        end = index + 1;
        break;
      }
    }
    const part = trimRange(text, { start, end });
    if (part) output.push(part);
    start = end;
  }
  const tail = trimRange(text, { start, end: range.end });
  if (tail) output.push(tail);
  return output;
}

/**
 * 按句切分合成文本，并直接保留源范围。
 * 一句一合成：以句号/问号/叹号/换行为单位，不再按 maxChars 合并多句。
 * maxLen 仅用于「单句过长」时的硬切，避免单次请求爆炸。
 * 时间轴不得再通过 indexOf 反推范围，否则空行归一化后会重复/遗漏句子。
 */
export function splitScriptWithRanges(text: string, maxLen: number): ScriptChunk[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  // maxLen 仅兜底超长单句；无效/过小值时给一个安全下限
  const limit = Math.max(80, Math.floor(maxLen) || 500);

  const rawUnits: SourceRange[] = [];
  let start = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    if (!/[。！？!?\n]/u.test(normalized[index])) continue;
    const unit = trimRange(normalized, { start, end: index + 1 });
    if (unit) rawUnits.push(unit);
    start = index + 1;
  }
  if (start < normalized.length) {
    const tail = trimRange(normalized, { start, end: normalized.length });
    if (tail) rawUnits.push(tail);
  }

  // 一句一段；仅当单句超过 limit 时再硬切
  const units = rawUnits.flatMap((range) =>
    range.end - range.start > limit
      ? splitOversizedRange(normalized, range, limit)
      : [range],
  );

  const chunks: ScriptChunk[] = [];
  for (const unit of units) {
    const range = trimRange(normalized, unit);
    if (!range) continue;
    chunks.push({
      text: normalized.slice(range.start, range.end),
      sourceStart: range.start,
      sourceEnd: range.end,
    });
  }

  return chunks.length
    ? chunks
    : [{ text: normalized, sourceStart: 0, sourceEnd: normalized.length }];
}

export function splitScript(text: string, maxLen: number): string[] {
  return splitScriptWithRanges(text, maxLen).map((chunk) => chunk.text);
}

/** 从标准 PCM WAV 读取时长（秒） */
export function wavDurationSec(buf: Buffer): number {
  if (buf.slice(0, 4).toString() !== 'RIFF') return 0;
  try {
    const fmt = findChunk(buf, 'fmt ');
    const data = findChunk(buf, 'data');
    if (!fmt || !data) return 0;
    const channels = fmt.chunk.readUInt16LE(0);
    const sampleRate = fmt.chunk.readUInt32LE(4);
    const bitsPerSample = fmt.chunk.readUInt16LE(14);
    const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
    if (bytesPerSec <= 0) return 0;
    return data.chunk.length / bytesPerSec;
  } catch {
    return 0;
  }
}


/** 从首段 WAV 读取 PCM 参数；失败返回 null */
export function readWavPcmFormat(
  buf: Buffer,
): { channels: number; sampleRate: number; bitsPerSample: number } | null {
  if (!buf || buf.slice(0, 4).toString() !== 'RIFF') return null;
  try {
    const fmt = findChunk(buf, 'fmt ');
    if (!fmt) return null;
    return {
      channels: fmt.chunk.readUInt16LE(0),
      sampleRate: fmt.chunk.readUInt32LE(4),
      bitsPerSample: fmt.chunk.readUInt16LE(14),
    };
  } catch {
    return null;
  }
}

/** 生成指定时长的静音 PCM WAV（与参考格式一致） */
export function createSilentWav(
  durationSec: number,
  format: { channels: number; sampleRate: number; bitsPerSample: number },
): Buffer {
  const seconds = Math.max(0, Number(durationSec) || 0);
  const channels = Math.max(1, format.channels || 1);
  const sampleRate = Math.max(1, format.sampleRate || 24000);
  const bitsPerSample = format.bitsPerSample === 8 ? 8 : 16;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.max(0, Math.round(seconds * sampleRate));
  const pcm = Buffer.alloc(frameCount * channels * bytesPerSample, 0);
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}


/**
 * 句间停顿（秒）：比固定短静音更接近口播换气。
 * - 短句稍短、长句稍长
 * - 问句/感叹稍长
 * - 段落边界（原文本以换行切开）更长
 */
export function resolveSentenceGapSec(options: {
  text?: string;
  durationSec?: number;
  isParagraphBreak?: boolean;
  isLast?: boolean;
}): number {
  if (options.isLast) return 0;

  const text = String(options.text || '').trim();
  const dur = Math.max(0, Number(options.durationSec) || 0);
  const spokenLen = text
    .replace(/[\[\(（][^\]\)）]{0,32}[\]\)）]/gu, '')
    .replace(/\s+/gu, '')
    .length;

  // 基础：0.55s，随句长/时长上浮
  let gap = 0.55;
  if (spokenLen >= 18 || dur >= 2.2) gap = 0.7;
  if (spokenLen >= 36 || dur >= 4) gap = 0.85;
  if (spokenLen >= 56 || dur >= 6) gap = 1.0;

  const end = text.slice(-1);
  if (end === '？' || end === '?') gap += 0.18;
  else if (end === '！' || end === '!') gap += 0.12;
  else if (end === '。' || end === '.') gap += 0.06;
  else if (end === '；' || end === ';') gap += 0.1;

  if (options.isParagraphBreak) gap += 0.28;

  // 极短应答句（嗯/好/对）不要拖太久
  if (spokenLen > 0 && spokenLen <= 4 && dur > 0 && dur < 0.9) {
    gap = Math.min(gap, 0.45);
  }

  // 夹逼到听感舒适区间
  return Number(Math.min(1.25, Math.max(0.42, gap)).toFixed(3));
}

/**
 * 拼接多段 WAV，并在段间插入静音。
 * gapSec 可为固定秒数，或与 buffers 等长的逐段后置停顿（最后一段忽略）。
 */
export function mergeWavBuffersWithGaps(
  buffers: Buffer[],
  gapSec: number | number[] = 0.55,
): {
  audio: Buffer;
  speechRanges: Array<{ startSec: number; endSec: number }>;
  /** 实际插入的逐段后置停顿（长度 buffers-1） */
  gapsSec: number[];
  /** @deprecated 使用 gapsSec；保留平均停顿便于旧调用 */
  gapSec: number;
  totalDurationSec: number;
} {
  if (!buffers.length) {
    return {
      audio: Buffer.alloc(0),
      speechRanges: [],
      gapsSec: [],
      gapSec: 0,
      totalDurationSec: 0,
    };
  }

  const gapList: number[] = buffers.map((_, index) => {
    if (index >= buffers.length - 1) return 0;
    if (Array.isArray(gapSec)) {
      const v = Number(gapSec[index]);
      return Number.isFinite(v) && v > 0 ? v : 0;
    }
    const v = Number(gapSec);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  const hasGap = gapList.some((v) => v > 0);

  if (buffers.length === 1 || !hasGap) {
    const audio = mergeWavBuffers(buffers);
    const ranges: Array<{ startSec: number; endSec: number }> = [];
    let cursor = 0;
    for (const buf of buffers) {
      const dur = wavDurationSec(buf);
      ranges.push({ startSec: cursor, endSec: cursor + dur });
      cursor += dur;
    }
    return {
      audio,
      speechRanges: ranges,
      gapsSec: [],
      gapSec: 0,
      totalDurationSec: cursor || wavDurationSec(audio),
    };
  }

  const fmt = readWavPcmFormat(buffers[0]);
  if (!fmt) {
    const audio = mergeWavBuffers(buffers);
    return {
      audio,
      speechRanges: [],
      gapsSec: [],
      gapSec: 0,
      totalDurationSec: wavDurationSec(audio),
    };
  }

  // 缓存不同时长静音，避免每段重新 alloc
  const silenceCache = new Map<string, Buffer>();
  const silenceFor = (sec: number): Buffer => {
    const key = sec.toFixed(3);
    let buf = silenceCache.get(key);
    if (!buf) {
      buf = createSilentWav(sec, fmt);
      silenceCache.set(key, buf);
    }
    return buf;
  };

  const pieces: Buffer[] = [];
  const speechRanges: Array<{ startSec: number; endSec: number }> = [];
  const appliedGaps: number[] = [];
  let cursor = 0;
  for (let i = 0; i < buffers.length; i += 1) {
    const buf = buffers[i];
    const dur = wavDurationSec(buf);
    speechRanges.push({
      startSec: Number(cursor.toFixed(3)),
      endSec: Number((cursor + dur).toFixed(3)),
    });
    pieces.push(buf);
    cursor += dur;
    if (i < buffers.length - 1) {
      const gap = gapList[i] || 0;
      if (gap > 0) {
        pieces.push(silenceFor(gap));
        cursor += gap;
        appliedGaps.push(gap);
      } else {
        appliedGaps.push(0);
      }
    }
  }
  const audio = mergeWavBuffers(pieces);
  const avgGap = appliedGaps.length
    ? appliedGaps.reduce((a, b) => a + b, 0) / appliedGaps.length
    : 0;
  return {
    audio,
    speechRanges,
    gapsSec: appliedGaps,
    gapSec: Number(avgGap.toFixed(3)),
    totalDurationSec: Number(cursor.toFixed(3)),
  };
}

/**
 * 简单拼接多个 WAV：仅当全部为标准 PCM WAV 时合并 data chunk。
 * 若无法解析，退回直接 concat（多数情况下单段即可）。
 */
export function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 1) return buffers[0];
  if (!buffers.every((b) => b.slice(0, 4).toString() === 'RIFF')) {
    return Buffer.concat(buffers);
  }

  try {
    const pcmParts: Buffer[] = [];
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;

    for (const buf of buffers) {
      const fmt = findChunk(buf, 'fmt ');
      const data = findChunk(buf, 'data');
      if (!fmt || !data) throw new Error('invalid wav');
      const ch = fmt.chunk.readUInt16LE(0);
      const sr = fmt.chunk.readUInt32LE(4);
      const bps = fmt.chunk.readUInt16LE(14);
      if (!sampleRate) {
        channels = ch;
        sampleRate = sr;
        bitsPerSample = bps;
      } else if (ch !== channels || sr !== sampleRate || bps !== bitsPerSample) {
        throw new Error('wav format mismatch');
      }
      pcmParts.push(data.chunk);
    }

    const pcm = Buffer.concat(pcmParts);
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
  } catch {
    return buffers[0];
  }
}

export function detectAudioFormat(buf: Buffer): 'wav' | 'mp3' | 'ogg' | 'unknown' {
  if (buf.length >= 4 && buf.slice(0, 4).toString() === 'RIFF') return 'wav';
  if (buf.length >= 3 && buf.slice(0, 3).toString() === 'ID3') return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  if (buf.length >= 4 && buf.slice(0, 4).toString() === 'OggS') return 'ogg';
  return 'unknown';
}

function findChunk(
  buf: Buffer,
  id: string,
): { chunk: Buffer; offset: number } | null {
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.slice(offset, offset + 4).toString('ascii');
    const size = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > buf.length) return null;
    if (chunkId === id) {
      return { chunk: buf.slice(dataStart, dataEnd), offset: dataStart };
    }
    offset = dataEnd + (size % 2);
  }
  return null;
}
