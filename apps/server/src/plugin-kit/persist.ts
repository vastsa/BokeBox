/**
 * 插件启用状态与配置的 app_settings 持久化
 * 按 namespace 隔离：source / asr / tts
 * 与 settings/kv 共用 settings 命名缓存，避免旁路读写打穿缓存。
 */
import { getDb } from '../db/sqlite.js';
import { getCache } from '../utils/memoryCache.js';

export type PluginEnabledMap = Record<string, boolean>;
export type PluginConfigStore = Record<
  string,
  Record<string, string | number | boolean>
>;

const settingsCache = getCache<string | null>('settings', {
  maxSize: 256,
  cacheMissing: true,
});

function getSettingRaw(key: string): string | null {
  return (
    settingsCache.getOrLoad(key, () => {
      const row = getDb()
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(key) as { value: string } | undefined;
      return row?.value ?? null;
    }) ?? null
  );
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
  settingsCache.set(key, value);
}

function enabledKey(namespace: string): string {
  return `${namespace}_plugin_enabled`;
}

function configKey(namespace: string): string {
  return `${namespace}_plugin_config`;
}

function readEnabledMap(namespace: string): PluginEnabledMap {
  const raw = getSettingRaw(enabledKey(namespace));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PluginEnabledMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeEnabledMap(namespace: string, map: PluginEnabledMap): void {
  setSettingRaw(enabledKey(namespace), JSON.stringify(map));
}

/** undefined = 无覆盖，跟随 defaultEnabled */
export function getPluginEnabledOverride(
  namespace: string,
  id: string,
): boolean | undefined {
  const map = readEnabledMap(namespace);
  if (!Object.prototype.hasOwnProperty.call(map, id)) return undefined;
  return map[id];
}

/** null = 删除覆盖 */
export function setPluginEnabledOverride(
  namespace: string,
  id: string,
  enabled: boolean | null,
): void {
  const map = readEnabledMap(namespace);
  if (enabled === null) {
    delete map[id];
  } else {
    map[id] = enabled;
  }
  writeEnabledMap(namespace, map);
}

export function listPluginEnabledOverrides(namespace: string): PluginEnabledMap {
  return readEnabledMap(namespace);
}

function readConfigStore(namespace: string): PluginConfigStore {
  const raw = getSettingRaw(configKey(namespace));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PluginConfigStore = {};
    for (const [pluginId, cfg] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
      const row: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
        if (
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean'
        ) {
          row[k] = v;
        }
      }
      out[pluginId] = row;
    }
    return out;
  } catch {
    return {};
  }
}

function writeConfigStore(namespace: string, map: PluginConfigStore): void {
  setSettingRaw(configKey(namespace), JSON.stringify(map));
}

export function getPluginConfigMap(namespace: string): PluginConfigStore {
  return readConfigStore(namespace);
}

export function setPluginConfigMap(
  namespace: string,
  map: PluginConfigStore,
): void {
  writeConfigStore(namespace, map);
}

export function getPluginConfig(
  namespace: string,
  pluginId: string,
): Record<string, string | number | boolean> {
  return { ...(readConfigStore(namespace)[pluginId] || {}) };
}

export function setPluginConfig(
  namespace: string,
  pluginId: string,
  config: Record<string, string | number | boolean>,
): void {
  const store = readConfigStore(namespace);
  store[pluginId] = { ...config };
  writeConfigStore(namespace, store);
}

export function resetPluginConfig(namespace: string, pluginId: string): void {
  const store = readConfigStore(namespace);
  delete store[pluginId];
  writeConfigStore(namespace, store);
}
