/**
 * 口播脚本 → 跟读/歌词行解析与进度对齐
 *
 * 设计要点：
 * 1. 剥离 MiMo TTS 音频标签（不参与展示与时长估算）
 * 2. 按「中文 / 英文词 / 数字 / 停顿标签 / 句读」加权估算时长
 * 3. 优先使用服务端 scriptTiming（合成时按音频块实测）
 */

/** 单行精确时间轴（秒） */
export type ScriptLineTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

/** 解析后的脚本行 */
export type ParsedScriptLine = {
  /** 展示文案（已去音频标签） */
  text: string;
  /** 相对权重（越大口播越久） */
  weight: number;
};

/** MiMo 音频标签：(磁性) / （深呼吸） / [轻笑] */
const AUDIO_TAG_RE = /[\(（\[]\s*[^\)）\]]{1,48}\s*[\)）\]]/g;

/** 停顿类标签 → 额外时长权重（约等于中文字符当量） */
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

/** 歌词高亮略微提前，贴近「先看到再听到」的跟读体验 */
const ACTIVE_LEAD_SEC = 0.16;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** 去掉 TTS 音频控制标签，仅保留口播正文 */
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

/**
 * 估算一行「口播量」：
 * - 中文按字
 * - 英文按词（比纯字符略慢）
 * - 数字按位
 * - 句读给短停顿
 */
export function spokenWeight(text: string): number {
  if (!text) return 2;
  let w = 0;

  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  w += (cjk?.length || 0) * 1;

  const latinWords = text.match(/[A-Za-z]+(?:[.\-_][A-Za-z0-9]+)*/g) || [];
  for (const word of latinWords) {
    // 英文/标识符口播通常比「等长中文」更耗时
    w += Math.max(1.3, word.length * 0.58 + 0.35);
  }

  const nums = text.match(/\d+(?:\.\d+)?/g) || [];
  for (const n of nums) {
    w += Math.max(1, n.replace('.', '').length * 0.95);
  }

  // 未计入中英数时的其它符号（如 emoji / 少数符号）给基础量
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

function lineWeight(rawLine: string, displayText: string): number {
  return Math.max(2, spokenWeight(displayText) + pauseWeightFromRaw(rawLine));
}

/**
 * 将口播脚本切成适合跟读的句子段落（展示用，已去标签）
 */
export function splitScriptLines(script: string): string[] {
  return parseScriptLines(script).map((l) => l.text);
}

/** 解析脚本：保留展示文本 + 权重 */
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
  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i];
    const text = stripAudioTags(raw);
    if (!text) continue;

    // 段落边界：原块换行后的首句，给一点停顿余量
    let weight = lineWeight(raw, text);
    if (i > 0) {
      // 粗略：若上一原始行以句号结束且本行是新语义，已在 spokenWeight 处理
      weight += 0.6;
    }
    lines.push({ text, weight });
  }

  return lines.length
    ? lines
    : [{ text: stripAudioTags(normalized) || normalized, weight: 8 }];
}

function cumulativeStarts(weights: number[]): { starts: number[]; total: number } {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const starts: number[] = [];
  let acc = 0;
  for (const w of weights) {
    starts.push(acc / total);
    acc += w;
  }
  return { starts, total };
}


/** 将时间轴按实际音频时长等比拉伸（合成估算时长与浏览器解码时长可能有细微偏差） */
export function scaleScriptTiming(
  timing: ScriptLineTiming[] | null | undefined,
  durationSec: number,
): ScriptLineTiming[] | null {
  if (!timing?.length || !durationSec || durationSec <= 0) return timing ?? null;
  const lastEnd = timing[timing.length - 1]?.endSec || 0;
  if (lastEnd <= 0) return timing;
  if (Math.abs(lastEnd - durationSec) < 0.35) return timing;
  const scale = durationSec / lastEnd;
  return timing.map((row) => ({
    text: row.text,
    startSec: Number((row.startSec * scale).toFixed(3)),
    endSec: Number((row.endSec * scale).toFixed(3)),
  }));
}

/**
 * 将播放进度映射到句子索引。
 * 有 scriptTiming 时走真实时间轴；否则按权重估算。
 */
export function activeLineIndex(
  lines: string[] | ParsedScriptLine[],
  currentSec: number,
  durationSec: number,
  timing?: ScriptLineTiming[] | null,
): number {
  const n =
    lines.length && typeof lines[0] === 'string'
      ? (lines as string[]).length
      : (lines as ParsedScriptLine[]).length;
  if (!n) return 0;

  const scaled = scaleScriptTiming(timing, durationSec);
  if (scaled && scaled.length > 0) {
    const t = Math.max(0, currentSec) + ACTIVE_LEAD_SEC;
    let idx = 0;
    const limit = Math.min(n, scaled.length);
    for (let i = 0; i < limit; i += 1) {
      if (scaled[i].startSec <= t) idx = i;
      else break;
    }
    return idx;
  }

  if (!durationSec || durationSec <= 0) return 0;

  const weights =
    lines.length && typeof lines[0] !== 'string'
      ? (lines as ParsedScriptLine[]).map((l) => l.weight)
      : (lines as string[]).map((l) => spokenWeight(l));

  const { starts, total } = cumulativeStarts(weights);
  // 有效口播区间：略收尾部静音，避免最后一句过早结束高亮
  const effectiveDur = Math.max(0.1, durationSec * 0.985);
  const ratio = clamp(currentSec / effectiveDur, 0, 0.9999);
  const target = ratio * total;

  let acc = 0;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i];
    if (target <= acc) return i;
  }
  // starts 用于防止空权重退化
  void starts;
  return weights.length - 1;
}

/** 点击某句时，估算/读取应跳转的秒数（句首） */
export function seekSecForLine(
  lines: string[] | ParsedScriptLine[],
  index: number,
  durationSec: number,
  timing?: ScriptLineTiming[] | null,
): number {
  const n =
    lines.length && typeof lines[0] === 'string'
      ? (lines as string[]).length
      : (lines as ParsedScriptLine[]).length;
  if (!n) return 0;
  const i = clamp(index, 0, n - 1);

  const scaled = scaleScriptTiming(timing, durationSec);
  if (scaled && scaled[i]) {
    return Math.max(0, scaled[i].startSec);
  }

  if (!durationSec || durationSec <= 0) return 0;

  const weights =
    lines.length && typeof lines[0] !== 'string'
      ? (lines as ParsedScriptLine[]).map((l) => l.weight)
      : (lines as string[]).map((l) => spokenWeight(l));
  const { starts } = cumulativeStarts(weights);
  const effectiveDur = Math.max(0.1, durationSec * 0.985);
  return starts[i] * effectiveDur;
}

/**
 * 仅凭脚本 + 总时长生成时间轴（前端兜底 / 服务端无实测块时）
 */
export function estimateScriptTiming(
  script: string,
  durationSec: number,
): ScriptLineTiming[] {
  const parsed = parseScriptLines(script);
  if (!parsed.length || durationSec <= 0) return [];

  const weights = parsed.map((l) => l.weight);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const effectiveDur = Math.max(0.1, durationSec * 0.985);
  let acc = 0;
  return parsed.map((line) => {
    const startSec = (acc / total) * effectiveDur;
    acc += line.weight;
    const endSec = (acc / total) * effectiveDur;
    return {
      text: line.text,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
    };
  });
}
