/**
 * Source 插件配置门面
 *
 * 实现全部委托 plugin-kit（namespace=source），保持原有导出签名兼容。
 */
import {
  createConfigAccessor as createKitConfigAccessor,
  getPluginConfig,
  isPluginConfigReady,
  isSecretField as kitIsSecretField,
  mergeConfigSchema as mergeKitConfigSchema,
  normalizeConfigSchema as normalizeKitConfigSchema,
  resetPluginConfigStore,
  resolveRuntimeConfig as resolveKitRuntimeConfig,
  toPublicPluginConfig as toKitPublicPluginConfig,
  updatePluginConfig as updateKitPluginConfig,
  type PluginConfigField,
  type PluginConfigMap,
} from '../plugin-kit/index.js';
import type {
  SourcePluginConfigField,
  SourcePluginConfigFieldStatus,
  SourcePluginConfigMap,
  SourcePluginConfigValue,
} from './types.js';
import { SOURCE_PLUGIN_NS } from './state.js';

const NS = SOURCE_PLUGIN_NS;

export function normalizeConfigSchema(
  raw: unknown,
): SourcePluginConfigField[] {
  return normalizeKitConfigSchema(raw) as SourcePluginConfigField[];
}

export function mergeConfigSchema(
  runtime?: readonly SourcePluginConfigField[] | undefined,
  manifest?: readonly SourcePluginConfigField[] | undefined,
): SourcePluginConfigField[] {
  return mergeKitConfigSchema(runtime, manifest) as SourcePluginConfigField[];
}

export function getSourcePluginConfig(
  pluginId: string,
): SourcePluginConfigMap {
  return getPluginConfig(NS, pluginId) as SourcePluginConfigMap;
}

/**
 * 合并写入插件配置（委托 plugin-kit）
 */
export function updateSourcePluginConfig(
  pluginId: string,
  schema: readonly SourcePluginConfigField[],
  patch: Record<string, unknown>,
): SourcePluginConfigMap {
  return updateKitPluginConfig(
    NS,
    pluginId,
    schema as readonly PluginConfigField[],
    patch,
  ) as SourcePluginConfigMap;
}

export function resetSourcePluginConfig(pluginId: string): void {
  resetPluginConfigStore(NS, pluginId);
}

export function isSourcePluginConfigReady(
  pluginId: string,
  schema: readonly SourcePluginConfigField[] | undefined,
): boolean {
  return isPluginConfigReady(
    NS,
    pluginId,
    schema as readonly PluginConfigField[] | undefined,
  );
}

export function resolveRuntimeConfig(
  pluginId: string,
  schema: readonly SourcePluginConfigField[] | undefined,
): SourcePluginConfigMap {
  return resolveKitRuntimeConfig(
    NS,
    pluginId,
    schema as readonly PluginConfigField[] | undefined,
  ) as SourcePluginConfigMap;
}

export function toPublicPluginConfig(
  pluginId: string,
  schema: readonly SourcePluginConfigField[] | undefined,
): {
  configSchema: SourcePluginConfigField[];
  configValues: Record<string, SourcePluginConfigValue | ''>;
  configStatus: Record<string, SourcePluginConfigFieldStatus>;
  configReady: boolean;
} {
  const pub = toKitPublicPluginConfig(
    NS,
    pluginId,
    schema as readonly PluginConfigField[] | undefined,
  );
  return {
    configSchema: pub.configSchema as SourcePluginConfigField[],
    configValues: pub.configValues as Record<
      string,
      SourcePluginConfigValue | ''
    >,
    configStatus: pub.configStatus as Record<
      string,
      SourcePluginConfigFieldStatus
    >,
    configReady: pub.configReady,
  };
}

export function createConfigAccessor(config: SourcePluginConfigMap) {
  return createKitConfigAccessor(config as PluginConfigMap);
}

export function isSecretField(field: SourcePluginConfigField): boolean {
  return kitIsSecretField(field as PluginConfigField);
}

export type {
  SourcePluginConfigField,
  SourcePluginConfigMap,
  SourcePluginConfigValue,
};
