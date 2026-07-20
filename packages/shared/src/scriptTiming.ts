import type { ScriptLineTiming } from './job.js';

/**
 * TTS 控制标签必须显式识别，不能把任意括号内容都当作音频指令。
 * 该词表同时供服务端合成、时间轴解析与前端展示使用，避免三套规则漂移。
 */
const SPEECH_STYLE_TAGS = new Set([
  '磁性',
  '沉稳',
  '温柔',
  '慵懒',
  '怅然',
  '深情',
  '欢快',
  '激昂',
  '清亮',
  '甜美',
  '东北话',
  '粤语',
  '恳切',
]);

const AUDIO_CONTROL_TAGS = new Set([
  '吸气',
  '深呼吸',
  '叹气',
  '长叹一口气',
  '喘息',
  '屏息',
  '清嗓',
  '咳嗽',
  '语速加快',
  '语速放慢',
  '加快语速',
  '放慢语速',
  '语速放缓',
  '停顿',
  '停顿片刻',
  '沉默片刻',
  '稍作停顿',
  '紧张',
  '激动',
  '疲惫',
  '委屈',
  '震惊',
  '不耐烦',
  '郑重',
  '小声',
  '低声',
  '高声',
  '提高音量',
  '降低音量',
  '气声',
  '沙哑',
  '颤抖',
  '轻笑',
  '笑',
  '大笑',
  '苦笑',
  '哽咽',
  '抽泣',
  '开场音乐渐弱',
  '收尾',
]);

const BRACKETED_TAG_RE = /[\[(（]\s*([^\])）]{1,32}?)\s*[\])）]/gu;
const SPOKEN_PUNCTUATION_RE =
  /[，,。.!！？?；;：:、"'“”‘’「」『』【】\[\]（）()…—–\-·•`~_+=<>/\\|]/gu;

export type ParsedScriptLine = {
  text: string;
  weight: number;
  sourceStart: number;
  sourceEnd: number;
};

function normalizeTagLabel(label: string): string {
  return label.trim().replace(/[，,、/|]+/gu, ' ').replace(/\s+/gu, ' ');
}

/** 是否为项目明确支持的音频控制标签。 */
export function isAudioControlTag(label: string): boolean {
  const normalized = normalizeTagLabel(label);
  if (!normalized) return false;
  if (AUDIO_CONTROL_TAGS.has(normalized) || SPEECH_STYLE_TAGS.has(normalized)) {
    return true;
  }
  const parts = normalized.split(' ').filter(Boolean);
  return parts.length > 1 && parts.every((part) => SPEECH_STYLE_TAGS.has(part));
}

/**
 * 仅移除明确的 TTS 控制标签；代码括号、数组下标和普通括注必须原样保留。
 */
export function stripAudioTags(text: string): string {
  return String(text || '')
    .replace(BRACKETED_TAG_RE, (match, label: string) =>
      isAudioControlTag(label) ? '' : match,
    )
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([，,。.!！？?；;：:、])/gu, '$1')
    .trim();
}

function spokenUnitCount(text: string): number {
  return Array.from(
    stripAudioTags(text).replace(/\s+/gu, '').replace(SPOKEN_PUNCTUATION_RE, ''),
  ).length;
}

/** 用于时间分配的可发音字符权重。 */
export function spokenWeight(text: string): number {
  return Math.max(1, spokenUnitCount(text));
}

/** 排除仅剩标点或控制标签的空歌词行。 */
export function hasSpokenText(text: string): boolean {
  return spokenUnitCount(text) > 0;
}

type TextRange = { start: number; end: number };

function sentenceRanges(block: string): TextRange[] {
  const ranges: TextRange[] = [];
  let start = 0;
  for (let index = 0; index < block.length; index += 1) {
    if (!/[。！？!?；]/u.test(block[index])) continue;
    ranges.push({ start, end: index + 1 });
    start = index + 1;
  }
  if (start < block.length) ranges.push({ start, end: block.length });
  return ranges.filter(({ start: from, end }) => block.slice(from, end).trim());
}

function softRanges(block: string): TextRange[] {
  const units: TextRange[] = [];
  let start = 0;
  for (let index = 0; index < block.length; index += 1) {
    if (!/[，,、]/u.test(block[index])) continue;
    units.push({ start, end: index + 1 });
    start = index + 1;
  }
  if (start < block.length) units.push({ start, end: block.length });
  if (units.length <= 1) return [{ start: 0, end: block.length }];

  const grouped: TextRange[] = [];
  let groupStart = units[0].start;
  let groupEnd = units[0].end;
  for (let index = 1; index < units.length; index += 1) {
    const unit = units[index];
    if (block.slice(groupStart, unit.end).trim().length > 48) {
      grouped.push({ start: groupStart, end: groupEnd });
      groupStart = unit.start;
    }
    groupEnd = unit.end;
  }
  grouped.push({ start: groupStart, end: groupEnd });
  return grouped;
}

/** 解析口播脚本，并保留每句在规范化脚本中的源位置。 */
export function parseScriptLines(script: string): ParsedScriptLine[] {
  const normalized = String(script || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines: ParsedScriptLine[] = [];
  const blockPattern = /[^\n]+/gu;
  for (const match of normalized.matchAll(blockPattern)) {
    const rawBlock = match[0];
    const leading = rawBlock.length - rawBlock.trimStart().length;
    const block = rawBlock.trim();
    if (!block) continue;
    const blockStart = (match.index || 0) + leading;

    let ranges = sentenceRanges(block);
    if (ranges.length <= 1 && block.length > 60) ranges = softRanges(block);

    for (const range of ranges) {
      const raw = block.slice(range.start, range.end).trim();
      if (!raw) continue;
      const localOffset = block.indexOf(raw, range.start);
      const text = stripAudioTags(raw);
      if (!text || !hasSpokenText(text)) continue;
      const sourceStart = blockStart + Math.max(range.start, localOffset);
      lines.push({
        text,
        weight: spokenWeight(text),
        sourceStart,
        sourceEnd: sourceStart + raw.length,
      });
    }
  }

  if (lines.length) return lines;
  const fallback = stripAudioTags(normalized);
  if (!fallback || !hasSpokenText(fallback)) return [];
  return [
    {
      text: fallback,
      weight: spokenWeight(fallback),
      sourceStart: 0,
      sourceEnd: normalized.length,
    },
  ];
}

export function splitScriptLines(script: string): string[] {
  return parseScriptLines(script).map((line) => line.text);
}

function normalizedTimingText(text: string): string {
  return String(text || '').trim().replace(/\s+/gu, ' ');
}

/**
 * 校验逐句时间轴的语义和单调性。
 * 同长度但重复/遗漏句、倒序、负数与非有限值都会被拒绝。
 */
export function isValidScriptTimingRows(
  timing: ScriptLineTiming[] | null | undefined,
  expectedLines?: Array<Pick<ParsedScriptLine, 'text'> | string>,
): timing is ScriptLineTiming[] {
  if (!timing?.length) return false;
  if (expectedLines && timing.length !== expectedLines.length) return false;

  let previousEnd = 0;
  for (let index = 0; index < timing.length; index += 1) {
    const row = timing[index];
    if (!row || !normalizedTimingText(row.text)) return false;
    if (!Number.isFinite(row.startSec) || !Number.isFinite(row.endSec)) return false;
    if (row.startSec < -0.001 || row.endSec <= row.startSec) return false;
    if (index > 0 && row.startSec < previousEnd - 0.01) return false;

    const expected = expectedLines?.[index];
    const expectedText = typeof expected === 'string' ? expected : expected?.text;
    if (
      expectedText !== undefined &&
      normalizedTimingText(row.text) !== normalizedTimingText(expectedText)
    ) {
      return false;
    }
    previousEnd = row.endSec;
  }
  return true;
}
