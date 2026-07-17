import type { ScriptPromptOptions } from '../types/job';
import { tOutside, type Translator } from '../i18n';

export const SCRIPT_MAX_CHARS_MIN = 300;
export const SCRIPT_MAX_CHARS_MAX = 8000;
export const SCRIPT_MAX_CHARS_DEFAULT = 1600;

type FieldDef = {
  key: keyof ScriptPromptOptions;
  labelKey: string;
  placeholderKey: string;
  multiline?: boolean;
  inputType?: 'text' | 'number';
};

const FIELD_DEFS: FieldDef[] = [
  { key: 'hostName', labelKey: 'scriptPrompt.fields.hostName', placeholderKey: 'scriptPrompt.fields.hostNamePh' },
  { key: 'hostIdentity', labelKey: 'scriptPrompt.fields.hostRole', placeholderKey: 'scriptPrompt.fields.hostRolePh' },
  { key: 'showName', labelKey: 'scriptPrompt.fields.showName', placeholderKey: 'scriptPrompt.fields.showNamePh' },
  { key: 'speakingStyle', labelKey: 'scriptPrompt.fields.speakingStyle', placeholderKey: 'scriptPrompt.fields.speakingStylePh' },
  { key: 'audience', labelKey: 'scriptPrompt.fields.audience', placeholderKey: 'scriptPrompt.fields.audiencePh' },
  { key: 'tone', labelKey: 'scriptPrompt.fields.tone', placeholderKey: 'scriptPrompt.fields.tonePh' },
  { key: 'openingStyle', labelKey: 'scriptPrompt.fields.opening', placeholderKey: 'scriptPrompt.fields.openingPh' },
  { key: 'closingStyle', labelKey: 'scriptPrompt.fields.closing', placeholderKey: 'scriptPrompt.fields.closingPh' },
  {
    key: 'maxChars',
    labelKey: 'scriptPrompt.fields.maxChars',
    placeholderKey: 'scriptPrompt.fields.maxCharsPh',
    inputType: 'number',
  },
  {
    key: 'extraInstructions',
    labelKey: 'scriptPrompt.fields.extra',
    placeholderKey: 'scriptPrompt.fields.extraPh',
    multiline: true,
  },
];

export function getScriptPromptFields(t: Translator = tOutside): Array<{
  key: keyof ScriptPromptOptions;
  label: string;
  placeholder: string;
  multiline?: boolean;
  inputType?: 'text' | 'number';
}> {
  return FIELD_DEFS.map((f) => ({
    key: f.key,
    label: t(f.labelKey),
    placeholder:
      f.key === 'maxChars'
        ? t(f.placeholderKey, { n: SCRIPT_MAX_CHARS_DEFAULT })
        : t(f.placeholderKey),
    multiline: f.multiline,
    inputType: f.inputType,
  }));
}

/** 兼容旧代码：初始化时按当前语言生成字段文案 */
export const SCRIPT_PROMPT_FIELDS = getScriptPromptFields(tOutside);

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
  if (!Object.keys(p).length) return tOutside('scriptPrompt.defaultPersona');
  const parts: string[] = [];
  if (p.hostName) parts.push(p.hostName);
  if (p.hostIdentity) parts.push(p.hostIdentity);
  if (p.showName) parts.push(`《${p.showName}》`);
  if (p.tone) parts.push(p.tone);
  if (p.speakingStyle) parts.push(p.speakingStyle);
  if (p.maxChars) parts.push(tOutside('scriptPrompt.maxCharsUnit', { n: p.maxChars }));
  if (!parts.length && p.extraInstructions) {
    parts.push(p.extraInstructions.slice(0, 24));
  }
  return parts.join(' · ') || tOutside('scriptPrompt.customized');
}
