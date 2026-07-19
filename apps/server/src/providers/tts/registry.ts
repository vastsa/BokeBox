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

/**
 * 设置页下拉 / health：
 * 含已启用 + 当前激活（即使停用），避免 select 脏值
 */
export function listTtsProviderDescriptors() {
  const activeId = (getTtsProviderId() || 'mimo').trim();
  return listTtsPlugins()
    .filter((p) => {
      if (p.id === activeId) return true;
      if (p.id === 'demo') return false;
      return isTtsPluginEnabled(p.id);
    })
    .map((p) => ({
      id: p.id,
      name: p.meta.name,
      description: p.meta.description,
      available: p.isAvailable(),
      enabled: isTtsPluginEnabled(p.id),
      active: p.id === activeId,
      suggestedModels: p.meta.suggestedModels,
      voiceUi: p.meta.voiceUi,
      voiceConfigKey: p.meta.voiceConfigKey,
      supportsStyleTags: p.meta.supportsStyleTags,
      supportsVoiceDesign: p.meta.supportsVoiceDesign,
      voices: p.meta.voices,
    }));
}

/**
 * 解析当前 TTS 插件（严格）：
 * - 仅使用 settings.ttsProvider / 显式 id
 * - 未注册、未启用、不可用 → 抛错，禁止静默换源
 */
export function resolveTtsPlugin(explicitId?: string): TtsPlugin {
  const preferredId = (explicitId || getTtsProviderId() || 'mimo').trim();
  if (!preferredId) {
    throw new Error('未配置 TTS 提供方（ttsProvider）');
  }

  const preferredReg = registry.get(preferredId);
  const preferred = preferredReg?.plugin;

  if (!preferred) {
    const loadError = preferredReg?.loadError;
    throw new Error(
      loadError
        ? `TTS 插件加载失败: ${preferredId}（${loadError}）`
        : `TTS 插件未注册: ${preferredId}。请在「设置 → 插件 → 语音合成」扫描/启用，或在 AI 服务中切换提供方。`,
    );
  }

  if (!isTtsPluginEnabled(preferred.id)) {
    throw new Error(
      `TTS 插件未启用: ${preferred.meta?.name || preferred.id}。请在「设置 → 插件 → 语音合成」中启用，或改选其他提供方。`,
    );
  }

  if (!preferred.isAvailable()) {
    throw new Error(
      `TTS 插件「${preferred.meta?.name || preferred.id}」当前不可用。请检查 API Key / 网络，或在 AI 服务中切换提供方。`,
    );
  }

  return preferred;
}

/** @deprecated */
export function resolveTtsProvider(explicitId?: string): TtsPlugin {
  return resolveTtsPlugin(explicitId);
}
