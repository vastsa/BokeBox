/**
 * 外部 ASR 插件目录扫描与热加载
 *
 * 约定：
 *   storage/plugins/asr/<dir>/
 *     plugin.json
 *     <entry>.js
 */
import path from 'node:path';
import {
  importPluginEntry,
  listPluginDirs,
  normalizeManifestBase,
  readPluginJson,
  resolvePluginExportValue,
  type PluginScanResult,
} from '../../plugin-kit/index.js';
import { ensureDir } from '../../utils/fs.js';
import { ASR_PLUGINS_DIR } from '../../utils/paths.js';
import {
  registerAsrPlugin,
  registerAsrPluginFailure,
  unregisterExternalAsrPlugins,
} from './registry.js';
import type { AsrPlugin, AsrPluginManifest } from './types.js';
import { isRiskLevel } from '../../plugin-kit/index.js';

export type AsrPluginScanResult = PluginScanResult;

function assertAsrPluginShape(value: unknown, id: string): AsrPlugin {
  if (!value || typeof value !== 'object') {
    throw new Error('插件导出必须是对象');
  }
  const p = value as Partial<AsrPlugin>;
  if (p.id && p.id !== id) {
    throw new Error(`插件 id 与清单不一致: export=${p.id} manifest=${id}`);
  }
  if (typeof p.name !== 'string' || !p.name) throw new Error('插件缺少 name');
  if (typeof p.version !== 'string' || !p.version) {
    throw new Error('插件缺少 version');
  }
  if (typeof p.isAvailable !== 'function') {
    throw new Error('插件缺少 isAvailable()');
  }
  if (typeof p.transcribe !== 'function') {
    throw new Error('插件缺少 transcribe()');
  }
  if (!isRiskLevel(p.riskLevel)) throw new Error('插件 riskLevel 非法');
  if (typeof p.defaultEnabled !== 'boolean') {
    throw new Error('插件缺少 defaultEnabled');
  }

  return {
    ...(p as AsrPlugin),
    id,
  };
}

async function loadOnePluginDir(dirName: string): Promise<
  | { id: string }
  | { error: string; id: string; dirName: string; manifest?: AsrPluginManifest }
> {
  const dirPath = path.join(ASR_PLUGINS_DIR, dirName);
  let manifest: AsrPluginManifest | undefined;
  try {
    const raw = await readPluginJson(dirPath);
    const base = normalizeManifestBase(raw, dirName);
    const obj = raw as Record<string, unknown>;
    manifest = {
      ...base,
      kind: 'asr',
      suggestedModel:
        typeof obj.suggestedModel === 'string'
          ? obj.suggestedModel
          : undefined,
    };

    const mod = await importPluginEntry(dirPath, manifest.entry);
    const exported = await resolvePluginExportValue(mod);
    const plugin = assertAsrPluginShape(exported, manifest.id);

    // 清单字段补齐导出缺省
    const safePlugin: AsrPlugin = {
      ...plugin,
      id: manifest.id,
      name: plugin.name || manifest.name,
      description: plugin.description || manifest.description || manifest.name,
      version: plugin.version || manifest.version,
      riskLevel: plugin.riskLevel || manifest.riskLevel || 'high',
      defaultEnabled:
        typeof plugin.defaultEnabled === 'boolean'
          ? plugin.defaultEnabled
          : Boolean(manifest.defaultEnabled),
      suggestedModel: plugin.suggestedModel || manifest.suggestedModel,
      configSchema: plugin.configSchema || manifest.configSchema,
    };

    registerAsrPlugin(safePlugin, {
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
    registerAsrPluginFailure({
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

export async function scanAndLoadExternalAsrPlugins(): Promise<AsrPluginScanResult> {
  await ensureDir(ASR_PLUGINS_DIR);
  const removed = unregisterExternalAsrPlugins();
  const loaded: string[] = [];
  const failed: AsrPluginScanResult['failed'] = [];

  const dirs = await listPluginDirs(ASR_PLUGINS_DIR);
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
    pluginsDir: ASR_PLUGINS_DIR,
    loaded,
    failed,
    removed,
  };
}
