/**
 * Schedule 插件配置门面
 */
import {
  createConfigAccessor as createKitConfigAccessor,
  getPluginConfig,
  isPluginConfigReady,
  mergeConfigSchema as mergeKitConfigSchema,
  normalizeConfigSchema as normalizeKitConfigSchema,
  resetPluginConfigStore,
  resolveRuntimeConfig as resolveKitRuntimeConfig,
  toPublicPluginConfig as toKitPublicPluginConfig,
  updatePluginConfig as updateKitPluginConfig,
  type PluginConfigField,
} from '../../../plugin-kit/index.js';
import type {
  SchedulePluginConfigField,
  SchedulePluginConfigMap,
} from './types.js';
import { SCHEDULE_PLUGIN_NS } from './state.js';

const NS = SCHEDULE_PLUGIN_NS;

export function normalizeConfigSchema(
  raw: unknown,
): SchedulePluginConfigField[] {
  return normalizeKitConfigSchema(raw) as SchedulePluginConfigField[];
}

export function mergeConfigSchema(
  runtime?: readonly SchedulePluginConfigField[] | undefined,
  manifest?: readonly SchedulePluginConfigField[] | undefined,
): SchedulePluginConfigField[] {
  return mergeKitConfigSchema(runtime, manifest) as SchedulePluginConfigField[];
}

export function getSchedulePluginConfig(
  pluginId: string,
): SchedulePluginConfigMap {
  return getPluginConfig(NS, pluginId) as SchedulePluginConfigMap;
}

export function updateSchedulePluginConfig(
  pluginId: string,
  schema: readonly SchedulePluginConfigField[],
  patch: Record<string, unknown>,
): SchedulePluginConfigMap {
  return updateKitPluginConfig(
    NS,
    pluginId,
    schema as readonly PluginConfigField[],
    patch,
  ) as SchedulePluginConfigMap;
}

export function resetSchedulePluginConfig(pluginId: string): void {
  resetPluginConfigStore(NS, pluginId);
}

export function isSchedulePluginConfigReady(
  pluginId: string,
  schema: readonly SchedulePluginConfigField[] | undefined,
): boolean {
  return isPluginConfigReady(
    NS,
    pluginId,
    schema as readonly PluginConfigField[] | undefined,
  );
}

export function resolveRuntimeConfig(
  pluginId: string,
  schema: readonly SchedulePluginConfigField[] | undefined,
): SchedulePluginConfigMap {
  return resolveKitRuntimeConfig(
    NS,
    pluginId,
    schema as readonly PluginConfigField[] | undefined,
  ) as SchedulePluginConfigMap;
}

export function toPublicSchedulePluginConfig(
  pluginId: string,
  schema: readonly SchedulePluginConfigField[] | undefined,
) {
  return toKitPublicPluginConfig(
    NS,
    pluginId,
    schema as readonly PluginConfigField[] | undefined,
  );
}

export function createConfigAccessor(config: SchedulePluginConfigMap) {
  return createKitConfigAccessor(config);
}
