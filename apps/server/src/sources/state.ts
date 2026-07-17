/**
 * Source 插件启用状态持久化（app_settings）
 */
import { getDb } from '../db/sqlite.js';

const KEY = 'source_plugin_enabled';

type EnabledMap = Record<string, boolean>;

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

function readMap(): EnabledMap {
  const raw = getSettingRaw(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: EnabledMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: EnabledMap): void {
  setSettingRaw(KEY, JSON.stringify(map));
}

/** undefined = 无覆盖，跟随 defaultEnabled */
export function getSourcePluginEnabledOverride(id: string): boolean | undefined {
  const map = readMap();
  if (!Object.prototype.hasOwnProperty.call(map, id)) return undefined;
  return map[id];
}

/** null = 删除覆盖 */
export function setSourcePluginEnabledOverride(
  id: string,
  enabled: boolean | null,
): void {
  const map = readMap();
  if (enabled === null) {
    delete map[id];
  } else {
    map[id] = enabled;
  }
  writeMap(map);
}

export function listSourcePluginEnabledOverrides(): EnabledMap {
  return readMap();
}
