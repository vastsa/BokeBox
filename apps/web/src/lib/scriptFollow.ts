/**
 * 口播脚本 → 跟读/歌词行解析与进度对齐
 *
 * 原则：
 * 1. 展示去掉 TTS 音频标签
 * 2. 时长按「可发音字符数」均分总时长（中文 TTS 语速近似匀速）
 * 3. 仅当服务端提供实测 scriptTiming 时使用绝对时间轴；
 *    估算结果绝不伪装成精确时间轴
 */

/** 单行时间轴（秒）——仅服务端实测写入时可信 */
export type ScriptLineTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

export type ParsedScriptLine = {
  /** 展示文案（已去音频标签） */
  text: string;
  /** 用于均分时长的字符权重 */
  weight: number;
};

/** MiMo 音频标签：(磁性) / （深呼吸） / [轻笑] */
const AUDIO_TAG_RE = /[\(（\[]\s*[^\)）\]]{1,48}\s*[\)）\]]/g;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** 去掉 TTS 音频控制标签 */
export function stripAudioTags(text: string): string {
  return text
    .replace(AUDIO_TAG_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([，,。.!！？?；;：:、])/g, '$1')
    .trim();
}

/**
 * 可发音量：去空白与标点后的字符数。
 * 中文 TTS 近似按字匀速，英文/数字按字符计即可，避免额外启发式把误差放大。
 */
export function spokenWeight(text: string): number {
  const cleaned = stripAudioTags(text)
    .replace(/\s+/g, '')
    .replace(/[，,。.!！？?；;：:、"'“”‘’「」『』【】\[\]（）()…—–\-·•]/g, '');
  return Math.max(1, cleaned.length);
}

/** 切句（展示用，已去标签） */
export function splitScriptLines(script: string): string[] {
  return parseScriptLines(script).map((l) => l.text);
}

/** 解析脚本行 + 权重 */
export function parseScriptLines(script: string): ParsedScriptLine[] {
  const normalized = script.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const rawLines: string[] = [];
  for (const block of blocks) {
    const parts = block
      .split(/(?<=[。！？!?；;])/)
      .map((s) => s.trim())
      .filter(Boolean);

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
          continue;
        }
      }
      rawLines.push(block);
    } else {
      rawLines.push(...parts);
    }
  }

  const lines: ParsedScriptLine[] = [];
  for (const raw of rawLines) {
    const text = stripAudioTags(raw);
    if (!text) continue;
    lines.push({ text, weight: spokenWeight(text) });
  }

  return lines.length
    ? lines
    : [{ text: stripAudioTags(normalized) || normalized, weight: 8 }];
}

function lineCount(lines: string[] | ParsedScriptLine[]): number {
  return lines.length;
}

function weightsOf(lines: string[] | ParsedScriptLine[]): number[] {
  if (!lines.length) return [];
  if (typeof lines[0] === 'string') {
    return (lines as string[]).map((l) => spokenWeight(l));
  }
  return (lines as ParsedScriptLine[]).map((l) => l.weight);
}

/** 浏览器解码时长与分析时长有偏差时等比拉伸 */
function scaleTiming(
  timing: ScriptLineTiming[],
  durationSec: number,
): ScriptLineTiming[] {
  if (!durationSec || durationSec <= 0) return timing;
  const last = timing[timing.length - 1]?.endSec || 0;
  if (last <= 0 || Math.abs(last - durationSec) < 0.5) return timing;
  const scale = durationSec / last;
  return timing.map((row) => ({
    text: row.text,
    startSec: Number((row.startSec * scale).toFixed(3)),
    endSec: Number((row.endSec * scale).toFixed(3)),
  }));
}

/**
 * 将播放进度映射到句子索引。
 * timing 必须是实测/静音对齐时间轴；缺失则按字符权重 + 真实 duration 估算。
 */
export function activeLineIndex(
  lines: string[] | ParsedScriptLine[],
  currentSec: number,
  durationSec: number,
  timing?: ScriptLineTiming[] | null,
): number {
  const n = lineCount(lines);
  if (!n) return 0;

  // 仅当时间轴行数与歌词行数一致时采用（避免错位）
  if (timing && timing.length === n) {
    const scaled = scaleTiming(timing, durationSec);
    const t = Math.max(0, currentSec);
    let idx = 0;
    for (let i = 0; i < n; i += 1) {
      if (scaled[i].startSec <= t) idx = i;
      else break;
    }
    return idx;
  }

  if (!durationSec || durationSec <= 0) return 0;

  const weights = weightsOf(lines);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const ratio = clamp(currentSec / durationSec, 0, 0.999999);
  const target = ratio * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i];
    if (target <= acc) return i;
  }
  return n - 1;
}

/** 点击某句 → 跳转到句首秒数 */
export function seekSecForLine(
  lines: string[] | ParsedScriptLine[],
  index: number,
  durationSec: number,
  timing?: ScriptLineTiming[] | null,
): number {
  const n = lineCount(lines);
  if (!n) return 0;
  const i = clamp(index, 0, n - 1);

  if (timing && timing.length === n && timing[i]) {
    const scaled = scaleTiming(timing, durationSec);
    return Math.max(0, scaled[i].startSec);
  }

  if (!durationSec || durationSec <= 0) return 0;
  const weights = weightsOf(lines);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  for (let k = 0; k < i; k += 1) acc += weights[k];
  return (acc / total) * durationSec;
}

/**
 * 客户端兜底估算（不写回服务端，不伪装成 measured）
 */
export function estimateScriptTiming(
  script: string,
  durationSec: number,
): ScriptLineTiming[] {
  const parsed = parseScriptLines(script);
  if (!parsed.length || durationSec <= 0) return [];
  const total = parsed.reduce((a, b) => a + b.weight, 0) || 1;
  let acc = 0;
  return parsed.map((line) => {
    const startSec = (acc / total) * durationSec;
    acc += line.weight;
    const endSec = (acc / total) * durationSec;
    return {
      text: line.text,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
    };
  });
}
