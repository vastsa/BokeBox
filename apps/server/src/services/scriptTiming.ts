/**
 * 口播脚本时间轴：与前端 scriptFollow 对齐的权重算法 + 合成块时长锚定
 */
import fs from 'node:fs/promises';
import { jobPaths } from '../utils/paths.js';
import { pathExists } from '../utils/fs.js';

export type ScriptLineTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

export type ScriptTimingFile = {
  version: 1;
  durationSec: number;
  /** estimated | measured（按 TTS wav 块时长锚定） */
  source: 'estimated' | 'measured';
  lines: ScriptLineTiming[];
};

const AUDIO_TAG_RE = /[\(（\[]\s*[^\)）\]]{1,48}\s*[\)）\]]/g;

const PAUSE_TAG_WEIGHT: Record<string, number> = {
  深呼吸: 11,
  吸气: 7,
  屏息: 6,
  喘息: 7,
  叹气: 8,
  长叹一口气: 10,
  沉默片刻: 14,
  轻笑: 4,
  笑: 3,
  苦笑: 4,
  哽咽: 5,
  语速放缓: 3,
  语速加快: -2,
};

export function stripAudioTags(text: string): string {
  return text
    .replace(AUDIO_TAG_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([，,。.!！？?；;：:、])/g, '$1')
    .trim();
}

function pauseWeightFromRaw(raw: string): number {
  let extra = 0;
  const matches = raw.match(AUDIO_TAG_RE) || [];
  for (const tag of matches) {
    const inner = tag.slice(1, -1).trim();
    if (!inner) continue;
    for (const part of inner.split(/[\s,，、/|]+/)) {
      const key = part.trim();
      if (!key) continue;
      if (key in PAUSE_TAG_WEIGHT) extra += PAUSE_TAG_WEIGHT[key];
    }
  }
  return extra;
}

export function spokenWeight(text: string): number {
  if (!text) return 2;
  let w = 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  w += (cjk?.length || 0) * 1;

  const latinWords = text.match(/[A-Za-z]+(?:[.\-_][A-Za-z0-9]+)*/g) || [];
  for (const word of latinWords) {
    w += Math.max(1.3, word.length * 0.58 + 0.35);
  }

  const nums = text.match(/\d+(?:\.\d+)?/g) || [];
  for (const n of nums) {
    w += Math.max(1, n.replace('.', '').length * 0.95);
  }

  const residual = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, '')
    .replace(/[A-Za-z0-9.\-_]/g, '')
    .replace(/[\s"'“”‘’「」『』【】\[\]（）()…—–\-·•]/g, '')
    .replace(/[，,。.!！？?；;：:、]/g, '');
  if (residual) w += residual.length * 0.4;

  const trimmed = text.trim();
  if (/[。！？!?]$/.test(trimmed)) w += 2.4;
  else if (/[；;]$/.test(trimmed)) w += 1.4;
  else if (/[，,、]$/.test(trimmed)) w += 0.7;

  return Math.max(2, w);
}

export type ParsedScriptLine = {
  text: string;
  weight: number;
  /** 在原始脚本中的起始字符下标（用于映射 TTS 块） */
  sourceStart: number;
  sourceEnd: number;
};

export function parseScriptLinesDetailed(script: string): ParsedScriptLine[] {
  const normalized = script.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // 用原始 normalized 做 offset 映射
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
        weight: Math.max(2, spokenWeight(text) + pauseWeightFromRaw(raw) + 0.6),
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

/**
 * 由总时长估算时间轴；若提供 TTS 文本块及其实测时长，则按块锚定后在块内按权重细分。
 */
export function buildScriptTiming(options: {
  script: string;
  durationSec: number;
  /** TTS 分段原文（与合成顺序一致） */
  chunks?: string[];
  /** 各分段实测秒数 */
  chunkDurationsSec?: number[];
}): ScriptTimingFile {
  const lines = parseScriptLinesDetailed(options.script);
  const durationSec = Math.max(0, options.durationSec);
  const chunks = options.chunks || [];
  const chunkDurs = options.chunkDurationsSec || [];

  if (
    chunks.length > 0 &&
    chunkDurs.length === chunks.length &&
    chunkDurs.every((d) => d > 0)
  ) {
    // 将原始脚本按 TTS 分块定位（顺序拼接）
    const normalized = options.script.replace(/\r\n/g, '\n').trim();
    let cursor = 0;
    const ranges: Array<{ start: number; end: number; dur: number }> = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      let idx = normalized.indexOf(chunk, cursor);
      if (idx < 0) {
        // 容错：风格标签可能被 applyAssistantStyleTags 改写，退化为等长推进
        idx = cursor;
      }
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

    // 若映射遗漏部分行，用剩余时间补齐
    if (timed.length < lines.length) {
      const used = new Set(timed.map((t) => t.text + '@' + t.startSec));
      const missing = lines.filter((l) => {
        // 简单：未出现在 timed 的 text 序列中
        return !timed.some((t) => t.text === l.text);
      });
      if (missing.length) {
        const remainStart = timed.length
          ? timed[timed.length - 1].endSec
          : 0;
        const remainDur = Math.max(0.1, durationSec - remainStart);
        timed.push(
          ...distribute(
            missing.map((l) => ({ text: l.text, weight: l.weight })),
            remainStart,
            remainDur,
          ),
        );
      }
      void used;
    }

    // 归一化到总时长（防止浮点漂移）
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

    return {
      version: 1,
      durationSec,
      source: 'measured',
      lines: timed,
    };
  }

  // 纯估算：全局权重分配，略收尾静音
  const effective = Math.max(0.1, durationSec * 0.985);
  const estimated = distribute(
    lines.map((l) => ({ text: l.text, weight: l.weight })),
    0,
    effective,
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

export async function writeScriptTiming(
  jobId: string,
  timing: ScriptTimingFile,
): Promise<string> {
  const paths = jobPaths(jobId);
  const file = paths.scriptTiming;
  await fs.writeFile(file, JSON.stringify(timing, null, 2), 'utf8');
  return file;
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
