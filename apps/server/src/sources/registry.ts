/**
 * Source 插件注册表（内存热插拔）
 *
 * - register / unregister 可在运行时调用
 * - enabled 状态与注册分离：禁用插件仍保留在表中，但不参与自动匹配
 * - 支持 builtin / external 元数据与加载失败占位
 */
import type {
  SourceInput,
  SourcePlugin,
  SourcePluginDescriptor,
  SourcePluginOrigin,
  SourcePluginPermission,
  SourcePluginRegistration,
  SourceRiskLevel,
} from './types.js';
import {
  getSourcePluginEnabledOverride,
  setSourcePluginEnabledOverride,
} from './state.js';

const registry = new Map<string, SourcePluginRegistration>();

export function registerSourcePlugin(
  plugin: SourcePlugin,
  meta?: {
    origin?: SourcePluginOrigin;
    dirName?: string;
    dirPath?: string;
    permissions?: SourcePluginPermission[];
    apiVersion?: number;
  },
): void {
  registry.set(plugin.id, {
    plugin,
    origin: meta?.origin || 'builtin',
    dirName: meta?.dirName,
    dirPath: meta?.dirPath,
    permissions: meta?.permissions,
    apiVersion: meta?.apiVersion,
    loadError: undefined,
    manifestSnapshot: undefined,
    loadedAt: new Date().toISOString(),
  });
}

/** 登记加载失败的外部插件（便于 API 列表展示错误） */
export function registerSourcePluginFailure(input: {
  id: string;
  origin?: SourcePluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: SourcePluginPermission[];
  apiVersion?: number;
  loadError: string;
  manifestSnapshot?: SourcePluginRegistration['manifestSnapshot'];
}): void {
  registry.set(input.id, {
    origin: input.origin || 'external',
    dirName: input.dirName,
    dirPath: input.dirPath,
    permissions: input.permissions,
    apiVersion: input.apiVersion,
    loadError: input.loadError,
    manifestSnapshot: input.manifestSnapshot,
    loadedAt: new Date().toISOString(),
  });
}

export function unregisterSourcePlugin(id: string): boolean {
  return registry.delete(id);
}

/** 卸载全部外部插件（重扫前调用） */
export function unregisterExternalSourcePlugins(): string[] {
  const removed: string[] = [];
  for (const [id, reg] of registry.entries()) {
    if (reg.origin === 'external') {
      registry.delete(id);
      removed.push(id);
    }
  }
  return removed;
}

export function getSourcePlugin(id: string): SourcePlugin | undefined {
  return registry.get(id)?.plugin;
}

export function getSourcePluginRegistration(
  id: string,
): SourcePluginRegistration | undefined {
  return registry.get(id);
}

export function listSourcePlugins(): SourcePlugin[] {
  return [...registry.values()]
    .map((r) => r.plugin)
    .filter((p): p is SourcePlugin => Boolean(p));
}

export function listSourcePluginRegistrations(): SourcePluginRegistration[] {
  return [...registry.values()];
}

export function isSourcePluginEnabled(id: string): boolean {
  const reg = registry.get(id);
  if (!reg) return false;
  const override = getSourcePluginEnabledOverride(id);
  if (override !== undefined) return override;
  if (reg.plugin) return reg.plugin.defaultEnabled;
  // 加载失败的插件默认不启用
  return Boolean(reg.manifestSnapshot?.defaultEnabled);
}

/**
 * 运行时启用/禁用插件（热切换，无需重启进程）。
 * 返回 false 表示插件未注册。
 */
export function setSourcePluginEnabled(id: string, enabled: boolean): boolean {
  if (!registry.has(id)) return false;
  setSourcePluginEnabledOverride(id, enabled);
  return true;
}

/** 清除显式覆盖，回到 defaultEnabled */
export function resetSourcePluginEnabled(id: string): boolean {
  if (!registry.has(id)) return false;
  setSourcePluginEnabledOverride(id, null);
  return true;
}

export function toSourcePluginDescriptor(
  reg: SourcePluginRegistration,
): SourcePluginDescriptor {
  const plugin = reg.plugin;
  const snap = reg.manifestSnapshot;
  const id = plugin?.id || snap?.id || 'unknown';
  const defaultEnabled = plugin
    ? plugin.defaultEnabled
    : Boolean(snap?.defaultEnabled);

  return {
    id,
    name: plugin?.name || snap?.name || id,
    description: plugin?.description || snap?.description || '',
    version: plugin?.version || snap?.version || '0.0.0',
    riskLevel: (plugin?.riskLevel ||
      snap?.riskLevel ||
      'high') as SourceRiskLevel,
    capabilities: [
      ...(plugin?.capabilities || snap?.capabilities || []),
    ],
    defaultEnabled,
    enabled: isSourcePluginEnabled(id),
    available: plugin ? plugin.isAvailable() && !reg.loadError : false,
    origin: reg.origin,
    dirName: reg.dirName,
    dirPath: reg.dirPath,
    permissions: reg.permissions || snap?.permissions,
    apiVersion: reg.apiVersion ?? snap?.apiVersion,
    loadError: reg.loadError,
  };
}

export function listSourcePluginDescriptors(): SourcePluginDescriptor[] {
  return listSourcePluginRegistrations().map(toSourcePluginDescriptor);
}

export function listEnabledSourcePlugins(): SourcePlugin[] {
  return listSourcePlugins().filter((p) => isSourcePluginEnabled(p.id));
}

/**
 * 为输入选择插件：
 * 1. 显式 pluginId 且已启用 → 使用（可用性由 fetch 再校验）
 * 2. 否则在「已启用 + available + canHandle」中按风险从低到高匹配
 */
export function resolveSourcePlugin(input: SourceInput): SourcePlugin {
  if (input.pluginId) {
    const explicit = registry.get(input.pluginId)?.plugin;
    if (!explicit) {
      const err = registry.get(input.pluginId)?.loadError;
      throw new Error(
        err
          ? `Source 插件加载失败: ${input.pluginId} (${err})`
          : `Source 插件未注册: ${input.pluginId}`,
      );
    }
    if (!isSourcePluginEnabled(explicit.id)) {
      throw new Error(`Source 插件未启用: ${explicit.id}`);
    }
    return explicit;
  }

  const candidates = listEnabledSourcePlugins()
    .filter((p) => p.isAvailable() && p.canHandle(input))
    .sort((a, b) => riskRank(a.riskLevel) - riskRank(b.riskLevel));

  if (!candidates.length) {
    const kind =
      input.type === 'url' ? `url=${input.url}` : `file=${input.filePath}`;
    throw new Error(`没有可用的 Source 插件可处理该输入 (${kind})`);
  }

  return candidates[0]!;
}

function riskRank(level: SourceRiskLevel): number {
  if (level === 'low') return 0;
  if (level === 'medium') return 1;
  return 2;
}
