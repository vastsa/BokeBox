/**
 * 外部 TTS 插件目录扫描与热加载
 *
 * 约定：
 *   storage/plugins/tts/<dir>/
 *     plugin.json
 *     <entry>.js
 */
import path from 'node:path';
import {
  importPluginEntry,
  isRiskLevel,
  listPluginDirs,
  normalizeManifestBase,
  readPluginJson,
  resolvePluginExportValue,
  type PluginScanResult,
} from '../../plugin-kit/index.js';
import { ensureDir } from '../../utils/fs.js';
import { TTS_PLUGINS_DIR } from '../../utils/paths.js';
import {
  registerTtsPlugin,
  registerTtsPluginFailure,
  unregisterExternalTtsPlugins,
} from './registry.js';
import type { TtsPlugin, TtsPluginManifest, TtsProviderMeta } from './types.js';

export type TtsPluginScanResult = PluginScanResult;

function assertTtsPluginShape(value: unknown, id: string): TtsPlugin {
  if (!value || typeof value !== 'object') {
    throw new Error('插件导出必须是对象');
  }
  const p = value as Partial<TtsPlugin> & { meta?: Partial<TtsProviderMeta> };
  if (p.id && p.id !== id) {
    throw new Error(`插件 id 与清单不一致: export=${p.id} manifest=${id}`);
  }
  if (!p.meta || typeof p.meta !== 'object') {
    throw new Error('插件缺少 meta');
  }
  if (typeof p.meta.name !== 'string' || !p.meta.name) {
    throw new Error('插件 meta.name 缺失');
  }
  if (typeof p.isAvailable !== 'function') {
    throw new Error('插件缺少 isAvailable()');
  }
  if (typeof p.synthesizeChunk !== 'function') {
    throw new Error('插件缺少 synthesizeChunk()');
  }
  if (typeof p.version !== 'string' || !p.version) {
    throw new Error('插件缺少 version');
  }
  if (!isRiskLevel(p.riskLevel)) throw new Error('插件 riskLevel 非法');
  if (typeof p.defaultEnabled !== 'boolean') {
    throw new Error('插件缺少 defaultEnabled');
  }

  const voiceUiRaw = String((p.meta as { voiceUi?: string }).voiceUi || '').trim();
  const voiceUi =
    voiceUiRaw === 'preset' ||
    voiceUiRaw === 'reference' ||
    voiceUiRaw === 'freeform' ||
    voiceUiRaw === 'none'
      ? voiceUiRaw
      : undefined;

  const meta: TtsProviderMeta = {
    id,
    name: p.meta.name,
    description: String(p.meta.description || p.meta.name),
    modes: Array.isArray(p.meta.modes) ? p.meta.modes : [],
    voices: Array.isArray(p.meta.voices) ? p.meta.voices : [],
    supportsStyleTags: Boolean(p.meta.supportsStyleTags),
    supportsVoiceDesign: Boolean(p.meta.supportsVoiceDesign),
    voiceUi,
    maxCharsPerRequest: Number(p.meta.maxCharsPerRequest) || 2000,
    suggestedModels: p.meta.suggestedModels,
  };

  return {
    ...(p as TtsPlugin),
    id,
    meta,
  };
}

async function loadOnePluginDir(dirName: string): Promise<
  | { id: string }
  | { error: string; id: string; dirName: string; manifest?: TtsPluginManifest }
> {
  const dirPath = path.join(TTS_PLUGINS_DIR, dirName);
  let manifest: TtsPluginManifest | undefined;
  try {
    const raw = await readPluginJson(dirPath);
    const base = normalizeManifestBase(raw, dirName);
    manifest = { ...base, kind: 'tts' };

    const mod = await importPluginEntry(dirPath, manifest.entry);
    const exported = await resolvePluginExportValue(mod);
    const plugin = assertTtsPluginShape(exported, manifest.id);

    const merged: TtsPlugin = {
      ...plugin,
      id: manifest.id,
      version: plugin.version || manifest.version,
      riskLevel: plugin.riskLevel || manifest.riskLevel || 'high',
      defaultEnabled:
        typeof plugin.defaultEnabled === 'boolean'
          ? plugin.defaultEnabled
          : Boolean(manifest.defaultEnabled),
      name: plugin.name || plugin.meta.name || manifest.name,
      description:
        plugin.description ||
        plugin.meta.description ||
        manifest.description ||
        manifest.name,
      configSchema: plugin.configSchema || manifest.configSchema,
      meta: {
        ...plugin.meta,
        id: manifest.id,
        name: plugin.meta.name || manifest.name,
        description:
          plugin.meta.description || manifest.description || manifest.name,
      },
    };

    // 安全策略：high 风险不得默认启用
    const safePlugin: TtsPlugin =
      merged.riskLevel === 'high' && merged.defaultEnabled
        ? { ...merged, defaultEnabled: false }
        : merged;

    registerTtsPlugin(safePlugin, {
      origin: 'external',
      dirName,
      dirPath,
      permissions: manifest.permissions,
      apiVersion: manifest.apiVersion,
      configSchema: manifest.configSchema,
    });

    return { id: safePlugin.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const id = manifest?.id || `invalid:${dirName}`;
    registerTtsPluginFailure({
      id,
      origin: 'external',
      dirName,
      dirPath,
      permissions: manifest?.permissions,
      apiVersion: manifest?.apiVersion,
      configSchema: manifest?.configSchema,
      loadError: message,
      manifestSnapshot: manifest,
    });
    return { error: message, id, dirName, manifest };
  }
}

export async function scanAndLoadExternalTtsPlugins(): Promise<TtsPluginScanResult> {
  await ensureDir(TTS_PLUGINS_DIR);
  const removed = unregisterExternalTtsPlugins();
  const loaded: string[] = [];
  const failed: TtsPluginScanResult['failed'] = [];

  const dirs = await listPluginDirs(TTS_PLUGINS_DIR);
  for (const name of dirs) {
    const result = await loadOnePluginDir(name);
    if ('error' in result) {
      failed.push({
        id: result.id,
        dirName: result.dirName,
        error: result.error,
      });
    } else {
      loaded.push(result.id);
    }
  }

  return {
    pluginsDir: TTS_PLUGINS_DIR,
    loaded,
    failed,
    removed,
  };
}
