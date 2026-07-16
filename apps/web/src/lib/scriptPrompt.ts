import type { ScriptPromptOptions } from '../types/job';

export const SCRIPT_PROMPT_FIELDS: Array<{
  key: keyof ScriptPromptOptions;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  {
    key: 'hostName',
    label: '主播称呼',
    placeholder: '如：小白 / 阿兰',
  },
  {
    key: 'hostIdentity',
    label: '主播身份',
    placeholder: '如：资深科技产品经理 / 创业导师',
  },
  {
    key: 'showName',
    label: '节目名称',
    placeholder: '如：深一度 / 晚间复盘',
  },
  {
    key: 'speakingStyle',
    label: '说话风格',
    placeholder: '如：口语化、亲和、略带幽默',
  },
  {
    key: 'audience',
    label: '目标听众',
    placeholder: '如：互联网从业者、创业者',
  },
  {
    key: 'tone',
    label: '语气调性',
    placeholder: '如：沉稳专业 / 轻松吐槽',
  },
  {
    key: 'openingStyle',
    label: '开场偏好',
    placeholder: '如：先抛结论再展开',
  },
  {
    key: 'closingStyle',
    label: '收尾偏好',
    placeholder: '如：行动建议 + 下期预告',
  },
  {
    key: 'extraInstructions',
    label: '额外要求',
    placeholder: '高级干预：如少用黑话、控制在 10 分钟内…',
    multiline: true,
  },
];

export function emptyScriptPrompt(): ScriptPromptOptions {
  return {};
}

export function normalizeScriptPrompt(
  raw?: Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions {
  if (!raw || typeof raw !== 'object') return {};
  const next: ScriptPromptOptions = {};
  for (const { key } of SCRIPT_PROMPT_FIELDS) {
    const v = String(raw[key] || '').trim();
    if (v) next[key] = v;
  }
  return next;
}

export function hasScriptPrompt(
  prompt?: ScriptPromptOptions | null,
): boolean {
  return Object.keys(normalizeScriptPrompt(prompt)).length > 0;
}

export function summarizeScriptPrompt(
  prompt?: ScriptPromptOptions | null,
): string {
  const p = normalizeScriptPrompt(prompt);
  if (!Object.keys(p).length) return '默认人设';
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
