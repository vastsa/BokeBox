import type { ScriptPromptOptions } from '../types/job.js';

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
  { key: 'extraInstructions', label: '额外要求' },
];

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
    const v = clean((raw as ScriptPromptOptions)[key]);
    if (v) next[key] = v;
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
): string {
  const p = normalizeScriptPrompt(prompt);
  if (!p) return '';

  const lines: string[] = [
    '',
    '【口播人设与风格干预】（用户自定义，优先级高于默认设定）',
  ];

  for (const { key, label } of FIELDS) {
    const value = p[key];
    if (value) lines.push(`- ${label}：${value}`);
  }

  lines.push(
    '请严格按以上人设撰写 script / hostIntro：',
    '1. 开场与收尾要体现主播身份与节目辨识度（若有节目名请自然点出）。',
    '2. 措辞、节奏、称呼符合指定说话风格与语气调性。',
    '3. 内容面向目标听众，避免不匹配的黑话或腔调。',
    '4. 额外要求必须遵守，但不能编造转写稿中不存在的事实。',
    '5. 仍然必须遵守 MiMo TTS 音频标签控制规则。',
  );

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
  if (!parts.length && p.extraInstructions) {
    parts.push(p.extraInstructions.slice(0, 24));
  }
  return parts.join(' · ') || '已自定义';
}

export { FIELDS as SCRIPT_PROMPT_FIELDS };
