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
import {
  EDGE_SCHEMA,
  cloudEndpointSchema,
  migrateAsrTtsSecretsFromGlobalOnce,
} from '../pluginEndpoint.js';
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
    asBuiltin(mimoTtsProvider, {
      defaultEnabled: true,
      configSchema: [
        ...cloudEndpointSchema('mimo-v2.5-tts'),
        {
          key: 'cloneModel',
          label: '音色克隆模型',
          type: 'string',
          required: false,
          default: 'mimo-v2.5-tts-voiceclone',
          placeholder: 'mimo-v2.5-tts-voiceclone',
          description: 'mode=voiceclone 时使用的模型 id',
        },
        {
          key: 'cloneAudioPath',
          label: '默认参考音频路径',
          type: 'string',
          required: false,
          placeholder: 'samples/my-voice.mp3',
          description:
            '相对 storage 或绝对路径。任务音色面板未填时作为克隆参考。',
        },
        {
          key: 'cloneAudioDataUri',
          label: '默认参考音频 data URI',
          type: 'textarea',
          required: false,
          placeholder: 'data:audio/mpeg;base64,...',
          description: '可选；优先于路径。体积大时建议用路径而非直接贴 base64。',
        },
        {
          key: 'clonePrompt',
          label: '克隆 user 提示（可选）',
          type: 'string',
          required: false,
          placeholder: '参考音频里说的那句话（可留空）',
          description: '对应官方示例 messages[0].content，多数场景可留空。',
        },
      ],
    }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerTtsPlugin(
    asBuiltin(openaiTtsProvider, {
      defaultEnabled: true,
      configSchema: cloudEndpointSchema('tts-1'),
    }),
    { origin: 'builtin', apiVersion: 1 },
  );
  registerTtsPlugin(
    asBuiltin(edgeTtsProvider, {
      defaultEnabled: true,
      description: '微软 Edge 神经音色（免费，无需 API Key）',
      configSchema: EDGE_SCHEMA,
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
  migrateAsrTtsSecretsFromGlobalOnce();
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
