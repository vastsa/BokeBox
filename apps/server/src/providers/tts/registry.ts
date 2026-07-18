/**
 * TTS 插件注册表（与 Source / ASR 同一套启用/注册模型）
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
import { getTtsProviderId } from '../../utils/aiConfig.js';
import type {
  TtsPlugin,
  TtsPluginDescriptor,
  TtsPluginRegistration,
} from './types.js';

const NS = 'tts';
const registry = new Map<string, TtsPluginRegistration>();

export function registerTtsPlugin(
  plugin: TtsPlugin,
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

/** @deprecated 使用 registerTtsPlugin */
export function registerTtsProvider(provider: TtsPlugin | import('./types.js').TtsProvider): void {
  const p = provider as TtsPlugin;
  registerTtsPlugin(
    {
      ...p,
      version: p.version || '1.0.0',
      riskLevel: p.riskLevel || 'low',
      defaultEnabled:
        typeof p.defaultEnabled === 'boolean' ? p.defaultEnabled : p.id !== 'demo',
    } as TtsPlugin,
    { origin: 'builtin', apiVersion: 1 },
  );
}

export function registerTtsPluginFailure(input: {
  id: string;
  origin?: PluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: PluginPermission[];
  apiVersion?: number;
  configSchema?: PluginConfigField[];
  loadError: string;
  manifestSnapshot?: TtsPluginRegistration['manifestSnapshot'];
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

export function unregisterTtsPlugin(id: string): boolean {
  return registry.delete(id);
}

export function unregisterExternalTtsPlugins(): string[] {
  const removed: string[] = [];
  for (const [id, reg] of registry.entries()) {
    if (reg.origin === 'external') {
      registry.delete(id);
      removed.push(id);
    }
  }
  return removed;
}

export function getTtsPlugin(id: string): TtsPlugin | undefined {
  return registry.get(id)?.plugin;
}

/** @deprecated */
export function getTtsProviderById(id: string): TtsPlugin | undefined {
  return getTtsPlugin(id);
}

export function getTtsPluginRegistration(
  id: string,
): TtsPluginRegistration | undefined {
  return registry.get(id);
}

export function listTtsPlugins(): TtsPlugin[] {
  return [...registry.values()]
    .map((r) => r.plugin)
    .filter((p): p is TtsPlugin => Boolean(p));
}

/** @deprecated */
export function listTtsProviders(): TtsPlugin[] {
  return listTtsPlugins();
}

export function listTtsPluginRegistrations(): TtsPluginRegistration[] {
  return [...registry.values()];
}

export function isTtsPluginEnabled(id: string): boolean {
  const reg = registry.get(id);
  if (!reg) return false;
  const override = getPluginEnabledOverride(NS, id);
  if (override !== undefined) return override;
  if (reg.plugin) return reg.plugin.defaultEnabled;
  return Boolean(reg.manifestSnapshot?.defaultEnabled);
}

export function setTtsPluginEnabled(id: string, enabled: boolean): boolean {
  if (!registry.has(id)) return false;
  setPluginEnabledOverride(NS, id, enabled);
  return true;
}

export function resetTtsPluginEnabled(id: string): boolean {
  if (!registry.has(id)) return false;
  setPluginEnabledOverride(NS, id, null);
  return true;
}

export function toTtsPluginDescriptor(
  reg: TtsPluginRegistration,
): TtsPluginDescriptor {
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
  const activeId = (getTtsProviderId() || 'mimo').trim();
  const name = plugin?.name || plugin?.meta.name || snap?.name || id;
  const description =
    plugin?.description ||
    plugin?.meta.description ||
    snap?.description ||
    '';

  return {
    kind: 'tts',
    id,
    name,
    description,
    version: plugin?.version || snap?.version || '0.0.0',
    riskLevel: plugin?.riskLevel || snap?.riskLevel || 'high',
    defaultEnabled,
    enabled: isTtsPluginEnabled(id),
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
    supportsStyleTags: plugin?.meta.supportsStyleTags,
    supportsVoiceDesign: plugin?.meta.supportsVoiceDesign,
    modes: plugin?.meta.modes,
    voices: plugin?.meta.voices,
    suggestedModels: plugin?.meta.suggestedModels,
    active: id === activeId,
  };
}

export function listTtsPluginDescriptors(): TtsPluginDescriptor[] {
  return listTtsPluginRegistrations().map(toTtsPluginDescriptor);
}

export function listTtsProviderDescriptors() {
  return listTtsPlugins()
    .filter((p) => isTtsPluginEnabled(p.id) || p.id === 'demo')
    .map((p) => ({
      id: p.id,
      name: p.meta.name,
      description: p.meta.description,
      available: p.isAvailable(),
      suggestedModels: p.meta.suggestedModels,
    }));
}

export function resolveTtsPlugin(explicitId?: string): TtsPlugin {
  const preferredId = (explicitId || getTtsProviderId() || 'mimo').trim();
  const preferred = registry.get(preferredId)?.plugin;

  if (preferred && isTtsPluginEnabled(preferred.id)) {
    if (preferred.isAvailable()) return preferred;
    if (preferred.strictAvailability && preferred.id === preferredId) {
      return preferred;
    }
  }

  if (preferred && preferred.strictAvailability && preferred.id === preferredId) {
    return preferred;
  }

  for (const reg of registry.values()) {
    const p = reg.plugin;
    if (!p || p.id === 'demo') continue;
    if (!isTtsPluginEnabled(p.id)) continue;
    if (p.isAvailable()) return p;
  }

  const demo = registry.get('demo')?.plugin;
  if (demo) return demo;

  // 极端回落
  return {
    id: 'demo',
    version: '1.0.0',
    riskLevel: 'low',
    defaultEnabled: true,
    meta: {
      id: 'demo',
      name: '演示模式',
      description: '未配置时的回落',
      modes: [{ id: 'default', label: '演示' }],
      voices: [],
      supportsStyleTags: false,
      supportsVoiceDesign: false,
      maxCharsPerRequest: 10_000,
    },
    isAvailable: () => true,
    async synthesizeChunk() {
      return {
        audio: Buffer.alloc(0),
        format: 'unknown',
        provider: 'demo',
        demo: true,
        mode: 'default',
      };
    },
  };
}

/** @deprecated */
export function resolveTtsProvider(explicitId?: string): TtsPlugin {
  return resolveTtsPlugin(explicitId);
}
