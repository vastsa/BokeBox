import type { ScriptPromptOptions } from '../types/job';

export const SCRIPT_MAX_CHARS_MIN = 300;
export const SCRIPT_MAX_CHARS_MAX = 8000;
export const SCRIPT_MAX_CHARS_DEFAULT = 1600;

export const SCRIPT_PROMPT_FIELDS: Array<{
  key: keyof ScriptPromptOptions;
  label: string;
  placeholder: string;
  multiline?: boolean;
  inputType?: 'text' | 'number';
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
    key: 'maxChars',
    label: '字数上限',
    placeholder: `默认 ${SCRIPT_MAX_CHARS_DEFAULT}，约 8-10 分钟`,
    inputType: 'number',
  },
  {
    key: 'extraInstructions',
    label: '额外要求',
    placeholder: '高级干预：如少用黑话、补充禁忌…',
    multiline: true,
  },
];

export function emptyScriptPrompt(): ScriptPromptOptions {
  return {};
}

/** 输入中：只保留数字，不做上下限夹取（避免打字被立刻改写） */
export function sanitizeMaxCharsInput(raw: string): string {
  return String(raw || '').replace(/[^\d]/g, '');
}

/** blur/保存：夹取到合法字数；空串表示清除 */
export function clampMaxChars(raw?: string | null): string | undefined {
  const digits = sanitizeMaxCharsInput(String(raw || ''));
  if (!digits) return undefined;
  const n = Number(digits);
  if (!Number.isFinite(n)) return undefined;
  return String(
    Math.min(
      SCRIPT_MAX_CHARS_MAX,
      Math.max(SCRIPT_MAX_CHARS_MIN, Math.round(n)),
    ),
  );
}

export function normalizeScriptPrompt(
  raw?: Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions {
  if (!raw || typeof raw !== 'object') return {};
  const next: ScriptPromptOptions = {};
  for (const { key } of SCRIPT_PROMPT_FIELDS) {
    if (key === 'maxChars') {
      const clamped = clampMaxChars(raw.maxChars);
      if (clamped) next.maxChars = clamped;
      continue;
    }
    const v = String(raw[key] || '').trim();
    if (v) next[key] = v;
  }
  return next;
}

/**
 * 编辑中的草稿归一：文本字段 trim 可选；maxChars 仅清非法字符，不夹上下限
 */
export function draftScriptPromptField(
  prev: ScriptPromptOptions,
  key: keyof ScriptPromptOptions,
  text: string,
): ScriptPromptOptions {
  const next: ScriptPromptOptions = { ...prev };
  if (key === 'maxChars') {
    const digits = sanitizeMaxCharsInput(text);
    if (digits) next.maxChars = digits;
    else delete next.maxChars;
    return next;
  }
  const v = text; // 输入中保留原样，blur 再 trim
  if (v) next[key] = v;
  else delete next[key];
  return next;
}

/** 单个字段 blur 修正 */
export function commitScriptPromptField(
  prev: ScriptPromptOptions,
  key: keyof ScriptPromptOptions,
): ScriptPromptOptions {
  if (key === 'maxChars') {
    const clamped = clampMaxChars(prev.maxChars);
    const next = { ...prev };
    if (clamped) next.maxChars = clamped;
    else delete next.maxChars;
    return next;
  }
  const v = String(prev[key] || '').trim();
  const next = { ...prev };
  if (v) next[key] = v;
  else delete next[key];
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
  if (p.maxChars) parts.push(`≤${p.maxChars}字`);
  if (!parts.length && p.extraInstructions) {
    parts.push(p.extraInstructions.slice(0, 24));
  }
  return parts.join(' · ') || '已自定义';
}
