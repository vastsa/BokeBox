/**
 * Source 插件启停/配置持久化
 *
 * 统一走 plugin-kit（namespace = source）。
 * 存储 key 仍为 source_plugin_enabled / source_plugin_config，与历史数据兼容。
 */
import {
  getPluginConfig,
  getPluginConfigMap,
  getPluginEnabledOverride,
  listPluginEnabledOverrides,
  resetPluginConfig,
  setPluginConfig,
  setPluginConfigMap,
  setPluginEnabledOverride,
} from '../plugin-kit/index.js';

const NS = 'source';

/** undefined = 无覆盖，跟随 defaultEnabled */
export function getSourcePluginEnabledOverride(id: string): boolean | undefined {
  return getPluginEnabledOverride(NS, id);
}

/** null = 删除覆盖 */
export function setSourcePluginEnabledOverride(
  id: string,
  enabled: boolean | null,
): void {
  setPluginEnabledOverride(NS, id, enabled);
}

export function listSourcePluginEnabledOverrides(): Record<string, boolean> {
  return listPluginEnabledOverrides(NS);
}

export function getSourcePluginConfigMap(): Record<
  string,
  Record<string, string | number | boolean>
> {
  return getPluginConfigMap(NS);
}

export function setSourcePluginConfigMap(
  map: Record<string, Record<string, string | number | boolean>>,
): void {
  setPluginConfigMap(NS, map || {});
}

/** 单插件配置（明文） */
export function getSourcePluginConfigRaw(
  pluginId: string,
): Record<string, string | number | boolean> {
  return getPluginConfig(NS, pluginId);
}

export function setSourcePluginConfigRaw(
  pluginId: string,
  config: Record<string, string | number | boolean>,
): void {
  setPluginConfig(NS, pluginId, config);
}

export function resetSourcePluginConfigRaw(pluginId: string): void {
  resetPluginConfig(NS, pluginId);
}

export const SOURCE_PLUGIN_NS = NS;
