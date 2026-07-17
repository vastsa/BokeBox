/**
 * Source 插件注册表（内存热插拔）
 *
 * - register / unregister 可在运行时调用
 * - enabled 状态与注册分离：禁用插件仍保留在表中，但不参与自动匹配
 */
import type {
  SourceInput,
  SourcePlugin,
  SourcePluginDescriptor,
  SourceRiskLevel,
} from './types.js';

const registry = new Map<string, SourcePlugin>();
/** 显式启用覆盖：undefined 表示跟随 defaultEnabled */
const enabledOverrides = new Map<string, boolean>();

export function registerSourcePlugin(plugin: SourcePlugin): void {
  registry.set(plugin.id, plugin);
}

export function unregisterSourcePlugin(id: string): boolean {
  enabledOverrides.delete(id);
  return registry.delete(id);
}

export function getSourcePlugin(id: string): SourcePlugin | undefined {
  return registry.get(id);
}

export function listSourcePlugins(): SourcePlugin[] {
  return [...registry.values()];
}

export function isSourcePluginEnabled(id: string): boolean {
  const plugin = registry.get(id);
  if (!plugin) return false;
  if (enabledOverrides.has(id)) return Boolean(enabledOverrides.get(id));
  return plugin.defaultEnabled;
}

/**
 * 运行时启用/禁用插件（热切换，无需重启进程）。
 * 返回 false 表示插件未注册。
 */
export function setSourcePluginEnabled(id: string, enabled: boolean): boolean {
  if (!registry.has(id)) return false;
  enabledOverrides.set(id, enabled);
  return true;
}

/** 清除显式覆盖，回到 defaultEnabled */
export function resetSourcePluginEnabled(id: string): boolean {
  if (!registry.has(id)) return false;
  enabledOverrides.delete(id);
  return true;
}

export function toSourcePluginDescriptor(plugin: SourcePlugin): SourcePluginDescriptor {
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    riskLevel: plugin.riskLevel,
    capabilities: [...plugin.capabilities],
    defaultEnabled: plugin.defaultEnabled,
    enabled: isSourcePluginEnabled(plugin.id),
    available: plugin.isAvailable(),
  };
}

export function listSourcePluginDescriptors(): SourcePluginDescriptor[] {
  return listSourcePlugins().map(toSourcePluginDescriptor);
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
    const explicit = registry.get(input.pluginId);
    if (!explicit) {
      throw new Error(`Source 插件未注册: ${input.pluginId}`);
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
    const kind = input.type === 'url' ? `url=${input.url}` : `file=${input.filePath}`;
    throw new Error(`没有可用的 Source 插件可处理该输入 (${kind})`);
  }

  return candidates[0]!;
}

function riskRank(level: SourceRiskLevel): number {
  if (level === 'low') return 0;
  if (level === 'medium') return 1;
  return 2;
}
