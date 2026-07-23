/**
 * Schedule 插件注册表（内存热插拔）
 */
import {
  getSchedulePluginEnabledOverride,
  setSchedulePluginEnabledOverride,
} from './state.js';
import {
  isSchedulePluginConfigReady,
  mergeConfigSchema,
  resetSchedulePluginConfig,
  toPublicSchedulePluginConfig,
  updateSchedulePluginConfig,
} from './config.js';
import type {
  SchedulePlugin,
  SchedulePluginConfigField,
  SchedulePluginDescriptor,
  SchedulePluginOrigin,
  SchedulePluginPermission,
  SchedulePluginRegistration,
  SchedulePluginRiskLevel,
} from './types.js';

const registry = new Map<string, SchedulePluginRegistration>();

export function registerSchedulePlugin(
  plugin: SchedulePlugin,
  meta: {
    origin: SchedulePluginOrigin;
    dirName?: string;
    dirPath?: string;
    permissions?: SchedulePluginPermission[];
    apiVersion?: number;
    configSchema?: SchedulePluginConfigField[];
  },
): void {
  const configSchema = mergeConfigSchema(
    plugin.configSchema,
    meta.configSchema,
  );
  registry.set(plugin.id, {
    id: plugin.id,
    plugin: {
      ...plugin,
      configSchema: configSchema.length ? configSchema : plugin.configSchema,
    },
    origin: meta.origin,
    dirName: meta.dirName,
    dirPath: meta.dirPath,
    permissions: meta.permissions,
    apiVersion: meta.apiVersion,
    configSchema: configSchema.length ? configSchema : undefined,
    loadedAt: new Date().toISOString(),
  });
}

export function registerSchedulePluginFailure(input: {
  id: string;
  origin: SchedulePluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: SchedulePluginPermission[];
  apiVersion?: number;
  configSchema?: SchedulePluginConfigField[];
  loadError: string;
  manifestSnapshot?: SchedulePluginRegistration['manifestSnapshot'];
}): void {
  registry.set(input.id, {
    id: input.id,
    origin: input.origin,
    dirName: input.dirName,
    dirPath: input.dirPath,
    permissions: input.permissions,
    apiVersion: input.apiVersion,
    configSchema: input.configSchema,
    loadError: input.loadError,
    manifestSnapshot: input.manifestSnapshot,
    loadedAt: new Date().toISOString(),
  });
}

export function unregisterSchedulePlugin(id: string): boolean {
  return registry.delete(id);
}

export function unregisterExternalSchedulePlugins(): string[] {
  const removed: string[] = [];
  for (const [id, reg] of registry.entries()) {
    if (reg.origin === 'external') {
      registry.delete(id);
      removed.push(id);
    }
  }
  return removed;
}

export function getSchedulePluginRegistration(
  id: string,
): SchedulePluginRegistration | undefined {
  return registry.get(id);
}

export function getSchedulePlugin(id: string): SchedulePlugin | undefined {
  return registry.get(id)?.plugin;
}

export function listSchedulePluginRegistrations(): SchedulePluginRegistration[] {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function listSchedulePlugins(): SchedulePlugin[] {
  return listSchedulePluginRegistrations()
    .map((r) => r.plugin)
    .filter((p): p is SchedulePlugin => Boolean(p));
}

export function isSchedulePluginEnabled(id: string): boolean {
  const reg = registry.get(id);
  if (!reg?.plugin) return false;
  const ov = getSchedulePluginEnabledOverride(id);
  if (ov !== undefined) return ov;
  return Boolean(reg.plugin.defaultEnabled);
}

export function setSchedulePluginEnabled(id: string, enabled: boolean): void {
  if (!registry.has(id)) {
    throw Object.assign(new Error(`插件不存在: ${id}`), { statusCode: 404 });
  }
  setSchedulePluginEnabledOverride(id, enabled);
}

export function resetSchedulePluginEnabled(id: string): void {
  if (!registry.has(id)) {
    throw Object.assign(new Error(`插件不存在: ${id}`), { statusCode: 404 });
  }
  setSchedulePluginEnabledOverride(id, null);
}

export function updateSchedulePluginConfigForId(
  id: string,
  patch: Record<string, unknown>,
) {
  const reg = registry.get(id);
  if (!reg) {
    throw Object.assign(new Error(`插件不存在: ${id}`), { statusCode: 404 });
  }
  const schema = reg.configSchema || reg.plugin?.configSchema || [];
  return updateSchedulePluginConfig(id, schema, patch);
}

export function resetSchedulePluginConfigForId(id: string): void {
  const reg = registry.get(id);
  if (!reg) {
    throw Object.assign(new Error(`插件不存在: ${id}`), { statusCode: 404 });
  }
  resetSchedulePluginConfig(id);
}

export function listSchedulePluginsPublic(): SchedulePluginDescriptor[] {
  return listSchedulePluginRegistrations().map((reg) => {
    const plugin = reg.plugin;
    const schema =
      reg.configSchema ||
      plugin?.configSchema ||
      ([] as SchedulePluginConfigField[]);
    const pub = toPublicSchedulePluginConfig(reg.id, schema);
    const values = (pub.configValues || {}) as Record<
      string,
      string | number | boolean | ''
    >;
    const enabled = plugin ? isSchedulePluginEnabled(reg.id) : false;
    const available = Boolean(
      plugin &&
        !reg.loadError &&
        isSchedulePluginConfigReady(reg.id, schema) &&
        plugin.isAvailable({
          config: values as never,
          getConfig: (k) => values[k] as never,
        }),
    );

    return {
      id: reg.id,
      name: plugin?.name || reg.manifestSnapshot?.name || reg.id,
      description:
        plugin?.description || reg.manifestSnapshot?.description || '',
      version: plugin?.version || reg.manifestSnapshot?.version || '0.0.0',
      riskLevel: (plugin?.riskLevel ||
        reg.manifestSnapshot?.riskLevel ||
        'high') as SchedulePluginRiskLevel,
      capabilities: [
        ...(plugin?.capabilities ||
          reg.manifestSnapshot?.capabilities ||
          []),
      ],
      defaultEnabled: Boolean(
        plugin?.defaultEnabled ?? reg.manifestSnapshot?.defaultEnabled,
      ),
      enabled,
      available,
      origin: reg.origin,
      dirName: reg.dirName,
      dirPath: reg.dirPath,
      permissions: reg.permissions,
      apiVersion: reg.apiVersion,
      loadError: reg.loadError,
      configSchema: schema.length ? [...schema] : undefined,
      configValues: values,
      configStatus: pub.configStatus,
      configReady: pub.configReady,
    };
  });
}
