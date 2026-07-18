/**
 * ASR 插件宿主：内置注册 + 外部扫描 + 配置上下文
 */
import {
  createConfigAccessor,
  isPluginConfigReady,
  resolveRuntimeConfig,
  updatePluginConfig,
  resetPluginConfigStore,
} from '../../plugin-kit/index.js';
import { STORAGE_DIR } from '../../utils/paths.js';
import { demoAsrProvider } from './demoAsr.js';
import { localWhisperAsrProvider } from './localWhisperAsr.js';
import { scanAndLoadExternalAsrPlugins, type AsrPluginScanResult } from './loader.js';
import { mimoAsrProvider } from './mimoAsr.js';
import { openaiAsrProvider } from './openaiAsr.js';
import {
  getAsrPluginRegistration,
  listAsrPluginDescriptors,
  registerAsrPlugin,
} from './registry.js';
import type { AsrPlugin, AsrPluginContext } from './types.js';

const NS = 'asr';
let builtinsRegistered = false;
let externalScanPromise: Promise<AsrPluginScanResult> | null = null;

function asBuiltin(
  p: import('./types.js').AsrProvider,
  extras?: Partial<AsrPlugin>,
): AsrPlugin {
  return {
    version: '1.0.0',
    riskLevel: 'low',
    defaultEnabled: p.id !== 'demo',
    ...p,
    ...extras,
  };
}

/** 注册内置 ASR 插件（幂等） */
export function ensureBuiltinAsrPlugins(): void {
  if (builtinsRegistered) return;

  registerAsrPlugin(
    asBuiltin(mimoAsrProvider, {
      defaultEnabled: true,
      description: '小米 MiMo：chat/completions + input_audio（长音频自动分段）',
    }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerAsrPlugin(
    asBuiltin(openaiAsrProvider, {
      defaultEnabled: true,
      description: 'OpenAI 兼容 /audio/transcriptions',
    }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerAsrPlugin(
    asBuiltin(localWhisperAsrProvider, {
      riskLevel: 'medium',
      defaultEnabled: true,
      strictAvailability: true,
      description: '本地 whisper / whisper.cpp，无需云端密钥',
    }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerAsrPlugin(
    asBuiltin(demoAsrProvider, {
      defaultEnabled: false,
      description: '演示回落：返回固定转写稿（默认关闭，需显式启用并选中）',
    }),
    { origin: 'builtin', apiVersion: 1 },
  );

  builtinsRegistered = true;
}

export function createAsrContext(
  pluginId: string,
  extra?: Partial<AsrPluginContext>,
): AsrPluginContext {
  const reg = getAsrPluginRegistration(pluginId);
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

export async function refreshExternalAsrPlugins(): Promise<AsrPluginScanResult> {
  ensureBuiltinAsrPlugins();
  if (externalScanPromise) return externalScanPromise;
  externalScanPromise = scanAndLoadExternalAsrPlugins().finally(() => {
    externalScanPromise = null;
  });
  return externalScanPromise;
}

export function listAsrPluginsPublic() {
  ensureBuiltinAsrPlugins();
  return listAsrPluginDescriptors();
}

export function updateAsrPluginConfigForId(
  id: string,
  patch: Record<string, unknown>,
) {
  const reg = getAsrPluginRegistration(id);
  if (!reg) throw new Error(`插件不存在: ${id}`);
  const schema = reg.configSchema || reg.plugin?.configSchema || [];
  return updatePluginConfig(NS, id, schema, patch);
}

export function resetAsrPluginConfigForId(id: string): void {
  resetPluginConfigStore(NS, id);
}

export function assertAsrPluginConfigReady(pluginId: string): void {
  const reg = getAsrPluginRegistration(pluginId);
  const schema = reg?.configSchema || reg?.plugin?.configSchema;
  if (!isPluginConfigReady(NS, pluginId, schema)) {
    throw new Error(`ASR 插件配置未就绪，请先在设置中填写参数: ${pluginId}`);
  }
}

// 模块加载时注册内置
ensureBuiltinAsrPlugins();
