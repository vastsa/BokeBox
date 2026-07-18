/**
 * settings KV 读写（SQLite app_settings）
 */
import { getDb } from '../../db/sqlite.js';

export const KEY_SCRIPT_PROMPT = 'script_prompt';
export const KEY_COVER_PROMPT = 'cover_prompt';
export const KEY_PODCAST_SYSTEM_PROMPT = 'podcast_system_prompt';
export const KEY_REWRITE_SYSTEM_PROMPT = 'rewrite_system_prompt';
export const KEY_FLASHCARD_SYSTEM_PROMPT = 'flashcard_system_prompt';
export const KEY_TTS_OPTIONS = 'tts_options';
export const KEY_AUTH = 'auth_account';
export const KEY_AI = 'ai_config';
export const KEY_SESSIONS = 'auth_sessions';
export const KEY_SETUP = 'setup_completed';
export const KEY_GUEST_HOME_PUBLIC = 'guest_home_public';
export const KEY_SITE_NAME = 'site_name';
export const KEY_SITE_SEO = 'site_seo';

export function getSettingRaw(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSettingRaw(key: string, value: string): void {
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

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

export function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

