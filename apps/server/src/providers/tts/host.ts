/**
 * TTS 插件宿主：内置注册 + 外部扫描 + 配置上下文
 */
import {
  createConfigAccessor,
  isPluginConfigReady,
  resolveRuntimeConfig,
  updatePluginConfig,
  resetPluginConfigStore,
} from '../../plugin-kit/index.js';
import { STORAGE_DIR } from '../../utils/paths.js';
import { demoTtsProvider } from './demoTts.js';
import { edgeTtsProvider } from './edgeTts.js';
import { scanAndLoadExternalTtsPlugins, type TtsPluginScanResult } from './loader.js';
import { mimoTtsProvider } from './mimoTts.js';
import { openaiTtsProvider } from './openaiTts.js';
import {
  getTtsPluginRegistration,
  listTtsPluginDescriptors,
  registerTtsPlugin,
} from './registry.js';
import type { TtsPlugin, TtsPluginContext, TtsProvider } from './types.js';

const NS = 'tts';
let builtinsRegistered = false;
let externalScanPromise: Promise<TtsPluginScanResult> | null = null;

function asBuiltin(
  p: TtsProvider,
  extras?: Partial<TtsPlugin>,
): TtsPlugin {
  return {
    version: '1.0.0',
    riskLevel: 'low',
    defaultEnabled: p.id !== 'demo',
    name: p.meta.name,
    description: p.meta.description,
    ...p,
    ...extras,
  };
}

export function ensureBuiltinTtsPlugins(): void {
  if (builtinsRegistered) return;

  registerTtsPlugin(
    asBuiltin(mimoTtsProvider, { defaultEnabled: true }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerTtsPlugin(
    asBuiltin(openaiTtsProvider, { defaultEnabled: true }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerTtsPlugin(
    asBuiltin(edgeTtsProvider, {
      defaultEnabled: true,
      description: '微软 Edge 神经音色（免费，无需 API Key）',
    }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerTtsPlugin(
    asBuiltin(demoTtsProvider, {
      defaultEnabled: false,
      description: '演示回落：复用源音频/静音占位（默认关闭，需显式启用并选中）',
    }),
    { origin: 'builtin', apiVersion: 1 },
  );

  builtinsRegistered = true;
}

export function createTtsContext(
  pluginId: string,
  extra?: Partial<TtsPluginContext>,
): TtsPluginContext {
  const reg = getTtsPluginRegistration(pluginId);
  const schema = reg?.configSchema || reg?.plugin?.configSchema;
  const runtimeConfig =
    extra?.config || resolveRuntimeConfig(NS, pluginId, schema);
  const accessor = createConfigAccessor(runtimeConfig);
  return {
    storageDir: extra?.storageDir || STORAGE_DIR,
    signal: extra?.signal,
    config: accessor.config,
    getConfig: accessor.getConfig,
  };
}

export async function refreshExternalTtsPlugins(): Promise<TtsPluginScanResult> {
  ensureBuiltinTtsPlugins();
  if (externalScanPromise) return externalScanPromise;
  externalScanPromise = scanAndLoadExternalTtsPlugins().finally(() => {
    externalScanPromise = null;
  });
  return externalScanPromise;
}

export function listTtsPluginsPublic() {
  ensureBuiltinTtsPlugins();
  return listTtsPluginDescriptors();
}

export function updateTtsPluginConfigForId(
  id: string,
  patch: Record<string, unknown>,
) {
  const reg = getTtsPluginRegistration(id);
  if (!reg) throw new Error(`插件不存在: ${id}`);
  const schema = reg.configSchema || reg.plugin?.configSchema || [];
  return updatePluginConfig(NS, id, schema, patch);
}

export function resetTtsPluginConfigForId(id: string): void {
  resetPluginConfigStore(NS, id);
}

export function assertTtsPluginConfigReady(pluginId: string): void {
  const reg = getTtsPluginRegistration(pluginId);
  const schema = reg?.configSchema || reg?.plugin?.configSchema;
  if (!isPluginConfigReady(NS, pluginId, schema)) {
    throw new Error(`TTS 插件配置未就绪，请先在设置中填写参数: ${pluginId}`);
  }
}

ensureBuiltinTtsPlugins();
