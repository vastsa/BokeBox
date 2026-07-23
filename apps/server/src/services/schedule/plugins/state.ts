/**
 * Schedule 插件启停 / 配置持久化（plugin-kit namespace=schedule）
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
} from '../../../plugin-kit/index.js';

const NS = 'schedule';

export function getSchedulePluginEnabledOverride(
  id: string,
): boolean | undefined {
  return getPluginEnabledOverride(NS, id);
}

export function setSchedulePluginEnabledOverride(
  id: string,
  enabled: boolean | null,
): void {
  setPluginEnabledOverride(NS, id, enabled);
}

export function listSchedulePluginEnabledOverrides(): Record<string, boolean> {
  return listPluginEnabledOverrides(NS);
}

export function getSchedulePluginConfigMap(): Record<
  string,
  Record<string, string | number | boolean>
> {
  return getPluginConfigMap(NS);
}

export function setSchedulePluginConfigMap(
  map: Record<string, Record<string, string | number | boolean>>,
): void {
  setPluginConfigMap(NS, map || {});
}

export function getSchedulePluginConfigRaw(
  pluginId: string,
): Record<string, string | number | boolean> {
  return getPluginConfig(NS, pluginId);
}

export function setSchedulePluginConfigRaw(
  pluginId: string,
  config: Record<string, string | number | boolean>,
): void {
  setPluginConfig(NS, pluginId, config);
}

export function resetSchedulePluginConfigRaw(pluginId: string): void {
  resetPluginConfig(NS, pluginId);
}

export const SCHEDULE_PLUGIN_NS = NS;
