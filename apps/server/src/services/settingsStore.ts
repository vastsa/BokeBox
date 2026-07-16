import { getDb } from '../db/sqlite.js';
import type { ScriptPromptOptions } from '../types/job.js';
import { normalizeScriptPrompt } from './scriptPrompt.js';

const KEY_SCRIPT_PROMPT = 'script_prompt';

function getSettingRaw(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSettingRaw(key: string, value: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (@key, @value, @updated_at)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run({ key, value, updated_at: now });
}

/** 读取全局口播提示词干预 */
export function getGlobalScriptPrompt(): ScriptPromptOptions {
  const raw = getSettingRaw(KEY_SCRIPT_PROMPT);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<ScriptPromptOptions>;
    return normalizeScriptPrompt(parsed) || {};
  } catch {
    return {};
  }
}

/** 保存全局口播提示词干预（空对象表示清空） */
export function setGlobalScriptPrompt(
  prompt?: Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions {
  const next = normalizeScriptPrompt(prompt) || {};
  setSettingRaw(KEY_SCRIPT_PROMPT, JSON.stringify(next));
  return next;
}
