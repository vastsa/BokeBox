/**
 * Source 宿主：统一导入入口
 *
 * pipeline / 路由应调用本模块，而不是直接依赖具体抓取实现。
 */
import {
  getSourcePlugin,
  listEnabledSourcePlugins,
  listSourcePluginDescriptors,
  listSourcePlugins,
  registerSourcePlugin,
  resolveSourcePlugin,
  setSourcePluginEnabled,
  unregisterSourcePlugin,
  resetSourcePluginEnabled,
  isSourcePluginEnabled,
} from './registry.js';
import { directHttpSourcePlugin } from './plugins/directHttp.js';
import type {
  SourceArtifact,
  SourceInput,
  SourcePlugin,
  SourcePluginContext,
  SourceProbe,
} from './types.js';

let builtinsRegistered = false;

/** 注册内置插件（幂等） */
export function ensureBuiltinSourcePlugins(): void {
  if (builtinsRegistered) return;
  registerSourcePlugin(directHttpSourcePlugin);
  builtinsRegistered = true;
}

export function createSourceContext(
  input: SourceInput,
  extra?: Partial<SourcePluginContext>,
): SourcePluginContext {
  return {
    jobId: input.jobId,
    signal: extra?.signal,
  };
}

/**
 * 解析并执行 Source 导入。
 * 自动匹配已启用插件；可通过 input.pluginId 指定。
 */
export async function importSource(
  input: SourceInput,
  extra?: Partial<SourcePluginContext>,
): Promise<SourceArtifact> {
  ensureBuiltinSourcePlugins();
  const plugin = resolveSourcePlugin(input);
  if (!plugin.isAvailable()) {
    throw new Error(`Source 插件当前不可用: ${plugin.id}`);
  }
  if (!plugin.canHandle(input)) {
    throw new Error(`Source 插件无法处理该输入: ${plugin.id}`);
  }
  const ctx = createSourceContext(input, extra);
  return plugin.fetch(input, ctx);
}

export async function probeSource(
  input: SourceInput,
  extra?: Partial<SourcePluginContext>,
): Promise<{ plugin: SourcePlugin; probe: SourceProbe } | null> {
  ensureBuiltinSourcePlugins();
  try {
    const plugin = resolveSourcePlugin(input);
    if (!plugin.probe) {
      return {
        plugin,
        probe: { handled: plugin.canHandle(input) },
      };
    }
    const probe = await plugin.probe(input, createSourceContext(input, extra));
    return { plugin, probe };
  } catch {
    return null;
  }
}

/** 供后续插件管理 API / UI 使用 */
export const sourcePluginHost = {
  ensureBuiltinSourcePlugins,
  register: registerSourcePlugin,
  unregister: unregisterSourcePlugin,
  get: getSourcePlugin,
  list: listSourcePlugins,
  listEnabled: listEnabledSourcePlugins,
  listDescriptors: () => {
    ensureBuiltinSourcePlugins();
    return listSourcePluginDescriptors();
  },
  isEnabled: isSourcePluginEnabled,
  setEnabled: setSourcePluginEnabled,
  resetEnabled: resetSourcePluginEnabled,
  resolve: resolveSourcePlugin,
  import: importSource,
  probe: probeSource,
};

// 模块加载时注册内置插件，保证 listDescriptors 立即可用
ensureBuiltinSourcePlugins();
