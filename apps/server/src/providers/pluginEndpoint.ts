/**
 * ASR / TTS 插件级端点与密钥
 *
 * 运行时只读插件 config store，不再回落全局 asr/tts 密钥。
 * 启动时一次性从历史全局配置迁移，兼容旧数据。
 */
import {
  getPluginConfig,
  setPluginConfig,
} from '../plugin-kit/persist.js';
import type { PluginConfigField, PluginConfigMap } from '../plugin-kit/types.js';
import { getAiConfig } from '../services/settingsStore.js';

export type PluginServiceNs = 'asr' | 'tts';

/** 云端 OpenAI 兼容端点（MiMo / OpenAI ASR·TTS） */
export const CLOUD_ENDPOINT_SCHEMA: PluginConfigField[] = [
  {
    key: 'baseUrl',
    label: 'Base URL',
    type: 'string',
    required: true,
    placeholder: 'https://api.example.com/v1',
    description: 'OpenAI 兼容 API 根路径（不含末尾 /）',
  },
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    description: '该插件专用密钥，不再使用全局 AI 密钥',
  },
  {
    key: 'model',
    label: '默认模型',
    type: 'string',
    required: false,
    description: '未在任务中指定模型时使用',
  },
];

/** 本地 Whisper */
export const WHISPER_SCHEMA: PluginConfigField[] = [
  {
    key: 'bin',
    label: 'Whisper 可执行文件',
    type: 'string',
    required: false,
    placeholder: '留空则自动查找 PATH 中的 whisper / whisper-cli',
    description: 'openai-whisper 或 whisper.cpp 可执行文件路径',
  },
  {
    key: 'lang',
    label: '语言提示',
    type: 'string',
    required: false,
    placeholder: '如 zh / en，留空自动检测',
  },
  {
    key: 'model',
    label: '默认模型',
    type: 'string',
    required: false,
    default: 'base',
    description: 'openai-whisper 用 tiny/base/small…；whisper.cpp 建议填 ggml 绝对路径',
  },
];

/** Edge TTS：可选默认音色 */
export const EDGE_SCHEMA: PluginConfigField[] = [
  {
    key: 'defaultVoice',
    label: '默认音色',
    type: 'string',
    required: false,
    default: 'zh-CN-XiaoxiaoNeural',
    description: '未指定音色时使用（如 zh-CN-XiaoxiaoNeural）',
  },
];

/** 为云端 schema 填入默认模型 */
export function cloudEndpointSchema(modelDefault?: string): PluginConfigField[] {
  return CLOUD_ENDPOINT_SCHEMA.map((field) => {
    if (field.key !== 'model' || !modelDefault) return { ...field };
    return { ...field, default: modelDefault, placeholder: modelDefault };
  });
}

export function resolveCloudEndpoint(
  namespace: PluginServiceNs,
  pluginId: string,
): { baseUrl: string; apiKey: string; model: string } {
  const cfg = getPluginConfig(namespace, pluginId);
  return {
    baseUrl: String(cfg.baseUrl || '')
      .trim()
      .replace(/\/$/, ''),
    apiKey: String(cfg.apiKey || '').trim(),
    model: String(cfg.model || '').trim(),
  };
}

export function hasPluginApiKey(
  namespace: PluginServiceNs,
  pluginId: string,
): boolean {
  return Boolean(resolveCloudEndpoint(namespace, pluginId).apiKey);
}

/** 云端插件是否具备 baseUrl + apiKey */
export function isCloudEndpointReady(
  namespace: PluginServiceNs,
  pluginId: string,
): boolean {
  const ep = resolveCloudEndpoint(namespace, pluginId);
  return Boolean(ep.baseUrl && ep.apiKey);
}

/**
 * 使用插件级端点/密钥发起请求。
 * 不再回落全局 asr/tts 配置。
 */
export async function pluginFetch(
  namespace: PluginServiceNs,
  pluginId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { baseUrl, apiKey } = resolveCloudEndpoint(namespace, pluginId);
  if (!baseUrl) {
    throw new Error(
      `插件「${pluginId}」未配置 Base URL，请在「插件」页填写`,
    );
  }
  if (!apiKey) {
    throw new Error(
      `插件「${pluginId}」未配置 API Key，请在「插件」页填写`,
    );
  }
  const urlPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${apiKey}`);
  if (
    !headers.has('Content-Type') &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${baseUrl}${urlPath}`, { ...init, headers });
}

function strCfg(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** 仅填充插件侧仍为空的字段 */
function fillEmptyPluginConfig(
  namespace: PluginServiceNs,
  pluginId: string,
  seed: PluginConfigMap,
): void {
  const existing = getPluginConfig(namespace, pluginId);
  const next: PluginConfigMap = { ...existing };
  let changed = false;
  for (const [key, raw] of Object.entries(seed)) {
    const value =
      typeof raw === 'string'
        ? raw.trim()
        : typeof raw === 'number' || typeof raw === 'boolean'
          ? raw
          : '';
    if (value === '' || value === undefined) continue;
    const cur = next[key];
    const empty =
      cur === undefined ||
      cur === null ||
      (typeof cur === 'string' && !cur.trim());
    if (empty) {
      next[key] = value;
      changed = true;
    }
  }
  if (changed) setPluginConfig(namespace, pluginId, next);
}

let migrated = false;

/**
 * 一次性：把历史全局 ASR/TTS 端点与密钥灌入对应内置插件。
 * 已有插件配置的字段不覆盖；进程内只执行一次。
 */
export function migrateAsrTtsSecretsFromGlobalOnce(): void {
  if (migrated) return;
  migrated = true;

  try {
    const g = getAiConfig();
    const globalBase = strCfg(g.baseUrl);
    const globalKey = strCfg(g.apiKey);
    const asrBase = strCfg(g.asrBaseUrl) || globalBase;
    const asrKey = strCfg(g.asrApiKey) || globalKey;
    const ttsBase = strCfg(g.ttsBaseUrl) || globalBase;
    const ttsKey = strCfg(g.ttsApiKey) || globalKey;
    const asrModel = strCfg(g.asrModel);
    const ttsModel = strCfg(g.ttsModel);
    const whisperBin = strCfg(g.whisperBin);
    const whisperLang = strCfg(g.whisperLang);
    const defaultVoice = strCfg(g.defaultVoice);

    fillEmptyPluginConfig('asr', 'mimo', {
      baseUrl: asrBase,
      apiKey: asrKey,
      model: asrModel || 'mimo-v2.5-asr',
    });
    fillEmptyPluginConfig('asr', 'openai', {
      baseUrl: asrBase,
      apiKey: asrKey,
      model: asrModel || 'whisper-1',
    });
    fillEmptyPluginConfig('asr', 'local-whisper', {
      bin: whisperBin,
      lang: whisperLang,
      model: asrModel || 'base',
    });

    fillEmptyPluginConfig('tts', 'mimo', {
      baseUrl: ttsBase,
      apiKey: ttsKey,
      model: ttsModel || 'mimo-v2.5-tts',
    });
    fillEmptyPluginConfig('tts', 'openai', {
      baseUrl: ttsBase,
      apiKey: ttsKey,
      model: ttsModel || 'tts-1',
    });
    if (defaultVoice) {
      fillEmptyPluginConfig('tts', 'edge', {
        defaultVoice,
      });
    }
  } catch {
    // 设置存储尚未就绪时跳过；下次 ensureBuiltin 再试
    migrated = false;
  }
}
