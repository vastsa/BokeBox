/**
 * ASR 插件注册表（与 Source 同一套启用/注册模型）
 */
import {
  getPluginEnabledOverride,
  mergeConfigSchema,
  setPluginEnabledOverride,
  toPublicPluginConfig,
} from '../../plugin-kit/index.js';
import type {
  PluginConfigField,
  PluginOrigin,
  PluginPermission,
} from '../../plugin-kit/index.js';
import { getAsrProviderId } from '../../utils/aiConfig.js';
import type {
  AsrPlugin,
  AsrPluginDescriptor,
  AsrPluginRegistration,
} from './types.js';

const NS = 'asr';
const registry = new Map<string, AsrPluginRegistration>();

export function registerAsrPlugin(
  plugin: AsrPlugin,
  meta?: {
    origin?: PluginOrigin;
    dirName?: string;
    dirPath?: string;
    permissions?: PluginPermission[];
    apiVersion?: number;
    configSchema?: PluginConfigField[];
  },
): void {
  const configSchema = mergeConfigSchema(
    plugin.configSchema,
    meta?.configSchema,
  );
  registry.set(plugin.id, {
    plugin,
    origin: meta?.origin || 'builtin',
    dirName: meta?.dirName,
    dirPath: meta?.dirPath,
    permissions: meta?.permissions,
    apiVersion: meta?.apiVersion,
    configSchema: configSchema.length ? configSchema : undefined,
    loadError: undefined,
    manifestSnapshot: undefined,
    loadedAt: new Date().toISOString(),
  });
}

/** @deprecated 使用 registerAsrPlugin */
export function registerAsrProvider(
  provider: AsrPlugin | import('./types.js').AsrProvider,
): void {
  const p = provider as AsrPlugin;
  registerAsrPlugin(
    {
      ...p,
      version: p.version || '1.0.0',
      riskLevel: p.riskLevel || 'low',
      defaultEnabled:
        typeof p.defaultEnabled === 'boolean'
          ? p.defaultEnabled
          : p.id !== 'demo',
    } as AsrPlugin,
    { origin: 'builtin', apiVersion: 1 },
  );
}

export function registerAsrPluginFailure(input: {
  id: string;
  origin?: PluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: PluginPermission[];
  apiVersion?: number;
  configSchema?: PluginConfigField[];
  loadError: string;
  manifestSnapshot?: AsrPluginRegistration['manifestSnapshot'];
}): void {
  const configSchema = mergeConfigSchema(
    input.configSchema,
    input.manifestSnapshot?.configSchema,
  );
  registry.set(input.id, {
    origin: input.origin || 'external',
    dirName: input.dirName,
    dirPath: input.dirPath,
    permissions: input.permissions,
    apiVersion: input.apiVersion,
    configSchema: configSchema.length ? configSchema : undefined,
    loadError: input.loadError,
    manifestSnapshot: input.manifestSnapshot,
    loadedAt: new Date().toISOString(),
  });
}

export function unregisterAsrPlugin(id: string): boolean {
  return registry.delete(id);
}

export function unregisterExternalAsrPlugins(): string[] {
  const removed: string[] = [];
  for (const [id, reg] of registry.entries()) {
    if (reg.origin === 'external') {
      registry.delete(id);
      removed.push(id);
    }
  }
  return removed;
}

export function getAsrPlugin(id: string): AsrPlugin | undefined {
  return registry.get(id)?.plugin;
}

/** @deprecated */
export function getAsrProviderById(id: string): AsrPlugin | undefined {
  return getAsrPlugin(id);
}

export function getAsrPluginRegistration(
  id: string,
): AsrPluginRegistration | undefined {
  return registry.get(id);
}

export function listAsrPlugins(): AsrPlugin[] {
  return [...registry.values()]
    .map((r) => r.plugin)
    .filter((p): p is AsrPlugin => Boolean(p));
}

/** @deprecated */
export function listAsrProviders(): AsrPlugin[] {
  return listAsrPlugins();
}

export function listAsrPluginRegistrations(): AsrPluginRegistration[] {
  return [...registry.values()];
}

export function isAsrPluginEnabled(id: string): boolean {
  const reg = registry.get(id);
  if (!reg) return false;
  const override = getPluginEnabledOverride(NS, id);
  if (override !== undefined) return override;
  if (reg.plugin) return reg.plugin.defaultEnabled;
  return Boolean(reg.manifestSnapshot?.defaultEnabled);
}

export function setAsrPluginEnabled(id: string, enabled: boolean): boolean {
  if (!registry.has(id)) return false;
  setPluginEnabledOverride(NS, id, enabled);
  return true;
}

export function resetAsrPluginEnabled(id: string): boolean {
  if (!registry.has(id)) return false;
  setPluginEnabledOverride(NS, id, null);
  return true;
}

export function toAsrPluginDescriptor(
  reg: AsrPluginRegistration,
): AsrPluginDescriptor {
  const plugin = reg.plugin;
  const snap = reg.manifestSnapshot;
  const id = plugin?.id || snap?.id || 'unknown';
  const defaultEnabled = plugin
    ? plugin.defaultEnabled
    : Boolean(snap?.defaultEnabled);
  const schema =
    reg.configSchema ||
    mergeConfigSchema(plugin?.configSchema, snap?.configSchema);
  const publicConfig = toPublicPluginConfig(NS, id, schema);
  const baseAvailable = plugin ? plugin.isAvailable() && !reg.loadError : false;
  const activeId = (getAsrProviderId() || 'mimo').trim();

  return {
    kind: 'asr',
    id,
    name: plugin?.name || snap?.name || id,
    description: plugin?.description || snap?.description || '',
    version: plugin?.version || snap?.version || '0.0.0',
    riskLevel: plugin?.riskLevel || snap?.riskLevel || 'high',
    defaultEnabled,
    enabled: isAsrPluginEnabled(id),
    available: baseAvailable && publicConfig.configReady,
    origin: reg.origin,
    dirName: reg.dirName,
    dirPath: reg.dirPath,
    permissions: reg.permissions,
    apiVersion: reg.apiVersion,
    loadError: reg.loadError,
    configSchema: publicConfig.configSchema.length
      ? publicConfig.configSchema
      : undefined,
    configValues: publicConfig.configSchema.length
      ? publicConfig.configValues
      : undefined,
    configStatus: publicConfig.configSchema.length
      ? publicConfig.configStatus
      : undefined,
    configReady: publicConfig.configReady,
    suggestedModel: plugin?.suggestedModel || snap?.suggestedModel,
    active: id === activeId,
  };
}

export function listAsrPluginDescriptors(): AsrPluginDescriptor[] {
  return listAsrPluginRegistrations().map(toAsrPluginDescriptor);
}

/**
 * 兼容旧 ProviderDescriptor 列表（设置页下拉 / health）
 */
export function listAsrProviderDescriptors() {
  return listAsrPlugins()
    .filter((p) => isAsrPluginEnabled(p.id) || p.id === 'demo')
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      available: p.isAvailable(),
      suggestedModels: p.suggestedModel
        ? { asr: p.suggestedModel }
        : undefined,
    }));
}

/**
 * 解析当前 ASR 插件：
 * - 优先 settings.asrProvider（需已启用）
 * - 其次其它已启用且可用的插件
 * - 最后 demo
 */
export function resolveAsrPlugin(explicitId?: string): AsrPlugin {
  const preferredId = (explicitId || getAsrProviderId() || 'mimo').trim();
  const preferredReg = registry.get(preferredId);
  const preferred = preferredReg?.plugin;

  if (preferred && isAsrPluginEnabled(preferred.id)) {
    if (preferred.isAvailable()) return preferred;
    if (preferred.strictAvailability && preferred.id === preferredId) {
      return preferred;
    }
  }

  // 显式指定但未启用：若 strict 仍返回（便于报错提示）
  if (preferred && preferred.strictAvailability && preferred.id === preferredId) {
    return preferred;
  }

  for (const reg of registry.values()) {
    const p = reg.plugin;
    if (!p || p.id === 'demo') continue;
    if (!isAsrPluginEnabled(p.id)) continue;
    if (p.isAvailable()) return p;
  }

  return registry.get('demo')?.plugin || {
    id: 'demo',
    name: '演示模式',
    description: '未配置时的回落',
    version: '1.0.0',
    riskLevel: 'low',
    defaultEnabled: true,
    isAvailable: () => true,
    async transcribe() {
      return { text: '【演示转写】', provider: 'demo', demo: true };
    },
  };
}

/** @deprecated */
export function resolveAsrProvider(explicitId?: string): AsrPlugin {
  return resolveAsrPlugin(explicitId);
}
