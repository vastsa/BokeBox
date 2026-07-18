/**
 * settings KV 读写（SQLite app_settings）
 * 读路径走命名内存缓存，写路径同步更新/失效，避免热点配置反复查库。
 */
import { getDb } from '../../db/sqlite.js';
import { getCache } from '../../utils/memoryCache.js';

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

/** settings 键值缓存：缺失也缓存，配置 key 集合稳定 */
const settingsCache = getCache<string | null>('settings', {
  maxSize: 256,
  cacheMissing: true,
});

export function getSettingRaw(key: string): string | null {
  return (
    settingsCache.getOrLoad(key, () => {
      const row = getDb()
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(key) as { value: string } | undefined;
      return row?.value ?? null;
    }) ?? null
  );
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
  // 写后立即回填，保证同进程后续读一致
  settingsCache.set(key, value);
}

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  settingsCache.set(key, null);
}

export function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 主动失效单个 settings key（外部旁路写入时用） */
export function invalidateSettingCache(key?: string): void {
  if (key) {
    settingsCache.delete(key);
    return;
  }
  settingsCache.clear();
}
