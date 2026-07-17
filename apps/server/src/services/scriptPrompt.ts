import type { ScriptPromptOptions } from '../types/job.js';
import type { Locale } from '../i18n/types.js';
import {
  resolveContentLocale,
  scriptPromptFieldLabels,
  scriptPromptSectionTitle,
} from '../i18n/contentLocale.js';
import { contentPromptLanguage } from '../i18n/registry.js';

const FIELDS: Array<{
  key: keyof ScriptPromptOptions;
  label: string;
}> = [
  { key: 'hostName', label: '主播称呼' },
  { key: 'hostIdentity', label: '主播身份' },
  { key: 'showName', label: '节目名称' },
  { key: 'speakingStyle', label: '说话风格' },
  { key: 'audience', label: '目标听众' },
  { key: 'tone', label: '语气调性' },
  { key: 'openingStyle', label: '开场偏好' },
  { key: 'closingStyle', label: '收尾偏好' },
  { key: 'maxChars', label: '字数上限' },
  { key: 'extraInstructions', label: '额外要求' },
];

/** 系统默认口播字数上限（去除音频标签后） */
export const DEFAULT_SCRIPT_MAX_CHARS = 1600;
export const MIN_SCRIPT_MAX_CHARS = 300;
export const MAX_SCRIPT_MAX_CHARS = 8000;

/** 解析字数上限；非法/空则回落默认 */
export function resolveScriptMaxChars(
  prompt?: ScriptPromptOptions | null,
): number {
  const raw = String(prompt?.maxChars || '').trim();
  if (!raw) return DEFAULT_SCRIPT_MAX_CHARS;
  const n = Number(raw.replace(/[^\d]/g, ''));
  if (!Number.isFinite(n)) return DEFAULT_SCRIPT_MAX_CHARS;
  const rounded = Math.round(n);
  if (rounded < MIN_SCRIPT_MAX_CHARS) return MIN_SCRIPT_MAX_CHARS;
  if (rounded > MAX_SCRIPT_MAX_CHARS) return MAX_SCRIPT_MAX_CHARS;
  return rounded;
}

const AUDIO_TAG_RE = /[\(（\[]\s*[^\)）\]]{1,48}\s*[\)）\]]/g;

/** 去除音频标签后统计正文字数（中文按字、英文按词近似） */
export function countSpokenChars(script: string): number {
  const plain = String(script || '')
    .replace(AUDIO_TAG_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 0;
  // 中日韩统一表意文字按字计
  const cjk = plain.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  let count = cjk?.length || 0;
  // 剩余拉丁/数字按「去掉空白后的字符」计，避免英文过短
  const residual = plain
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .replace(/[^\w.-]+/g, ' ')
    .trim();
  if (residual) {
    count += residual.replace(/\s+/g, '').length;
  }
  return count;
}


function clean(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

/** 归一化口播提示词干预；空字段丢弃 */
export function normalizeScriptPrompt(
  raw?: Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const next: ScriptPromptOptions = {};
  for (const { key } of FIELDS) {
    let v = clean((raw as ScriptPromptOptions)[key]);
    if (!v) continue;
    if (key === 'maxChars') {
      const n = Number(v.replace(/[^\d]/g, ''));
      if (!Number.isFinite(n)) continue;
      const rounded = Math.round(n);
      if (rounded < MIN_SCRIPT_MAX_CHARS || rounded > MAX_SCRIPT_MAX_CHARS) {
        // 超出合理范围则夹取
        v = String(
          Math.min(MAX_SCRIPT_MAX_CHARS, Math.max(MIN_SCRIPT_MAX_CHARS, rounded)),
        );
      } else {
        v = String(rounded);
      }
    }
    next[key] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

/** 是否存在任何有效干预项 */
export function hasScriptPrompt(
  prompt?: ScriptPromptOptions | null,
): boolean {
  return Boolean(normalizeScriptPrompt(prompt));
}

/** 生成注入 system prompt 的人设段落 */
export function buildScriptPromptSection(
  prompt?: ScriptPromptOptions | null,
  locale: Locale | string | null = 'zh-CN',
): string {
  const p = normalizeScriptPrompt(prompt);
  if (!p) return '';
  const loc = resolveContentLocale(locale);
  const labels = scriptPromptFieldLabels(loc);
  const lines: string[] = ['', scriptPromptSectionTitle(loc)];

  const zhFamily = loc === 'zh-CN' || loc === 'zh-TW';
  const langName = contentPromptLanguage(loc);

  for (const { key, label } of labels) {
    const value = p[key as keyof ScriptPromptOptions];
    if (value) {
      lines.push(zhFamily ? `- ${label}：${value}` : `- ${label}: ${value}`);
    }
  }

  const maxChars = resolveScriptMaxChars(p);
  const targetMin = Math.round(maxChars * 0.75);
  if (zhFamily) {
    lines.push(
      '请严格按以上人设撰写 script / hostIntro：',
      '1. 开场与收尾要体现主播身份与节目辨识度（若有节目名请自然点出）。',
      '2. 措辞、节奏、称呼符合指定说话风格与语气调性。',
      '3. 内容面向目标听众，避免不匹配的黑话或腔调。',
      '4. 口播稿 script 正文字数（去除音频标签后）严格不超过 ' +
        String(maxChars) +
        ' 字，目标约 ' +
        String(targetMin) +
        '-' +
        String(maxChars) +
        ' 字，宁短勿超。',
      '5. 额外要求必须遵守，但不能编造转写稿中不存在的事实。',
      '6. 仍然必须遵守 MiMo TTS 音频标签控制规则。',
      loc === 'zh-TW'
        ? '7. 面向用户的字段必须使用繁體中文。'
        : '7. 面向用户的字段必须使用简体中文。',
    );
  } else {
    lines.push(
      'Write script / hostIntro strictly with the persona above:',
      '1. Opening and closing should reflect host identity and show branding (mention show name naturally if set).',
      '2. Wording, pacing, and address style must match the specified speaking style and tone.',
      '3. Target the stated audience; avoid mismatched jargon.',
      `4. Spoken script length after removing audio tags must be ≤ ${maxChars} characters, ideally ${targetMin}-${maxChars}. Prefer shorter over longer.`,
      '5. Honor extra requirements without inventing facts absent from the transcript.',
      '6. Still obey MiMo TTS audio-tag rules (style tags remain Chinese control tokens).',
      `7. User-facing fields must be written in ${langName}.`,
    );
  }

  return lines.join('\n');
}

/** 用于 UI / 消息摘要 */
export function summarizeScriptPrompt(
  prompt?: ScriptPromptOptions | null,
): string {
  const p = normalizeScriptPrompt(prompt);
  if (!p) return '默认人设';

  const parts: string[] = [];
  if (p.hostName) parts.push(p.hostName);
  if (p.hostIdentity) parts.push(p.hostIdentity);
  if (p.showName) parts.push(`《${p.showName}》`);
  if (p.tone) parts.push(p.tone);
  if (p.speakingStyle) parts.push(p.speakingStyle);
  if (p.maxChars) parts.push(`≤${p.maxChars}字`);
  if (!parts.length && p.extraInstructions) {
    parts.push(p.extraInstructions.slice(0, 24));
  }
  return parts.join(' · ') || '已自定义';
}

export { FIELDS as SCRIPT_PROMPT_FIELDS };
