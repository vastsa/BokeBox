/**
 * 外部 Source 插件目录扫描与热加载
 *
 * 约定：
 *   storage/plugins/source/<dir>/
 *     plugin.json
 *     <entry>.js   # ESM，导出 default / plugin / createPlugin
 *
 * 与 ASR/TTS 共用 plugin-kit 加载工具；Source 专属 capabilities / high-risk 策略保留。
 */
import path from 'node:path';
import {
  importPluginEntry,
  isPermission,
  isRiskLevel,
  listPluginDirs,
  normalizeManifestBase,
  readPluginJson,
  resolvePluginExportValue,
  type PluginScanResult,
} from '../plugin-kit/index.js';
import { ensureDir } from '../utils/fs.js';
import { SOURCE_PLUGINS_DIR } from '../utils/paths.js';
import {
  registerSourcePlugin,
  registerSourcePluginFailure,
  unregisterExternalSourcePlugins,
} from './registry.js';
import type {
  SourceCapability,
  SourcePlugin,
  SourcePluginManifest,
} from './types.js';

export type SourcePluginScanResult = PluginScanResult;

function isCapability(v: unknown): v is SourceCapability {
  return v === 'url' || v === 'file' || v === 'webpage' || v === 'media';
}

function normalizeManifest(
  raw: unknown,
  dirName: string,
): SourcePluginManifest {
  const base = normalizeManifestBase(raw, dirName);
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const capabilities = Array.isArray(obj.capabilities)
    ? obj.capabilities.filter(isCapability)
    : undefined;

  // 二次过滤 permissions（normalizeManifestBase 已过滤一遍，保持显式）
  const permissions = Array.isArray(obj.permissions)
    ? obj.permissions.filter(isPermission)
    : base.permissions;

  return {
    ...base,
    capabilities,
    permissions,
    riskLevel: isRiskLevel(base.riskLevel) ? base.riskLevel : 'high',
  };
}

function assertPluginShape(value: unknown, id: string): SourcePlugin {
  if (!value || typeof value !== 'object') {
    throw new Error('插件导出必须是对象');
  }
  const p = value as Partial<SourcePlugin>;
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
  if (typeof p.canHandle !== 'function') {
    throw new Error('插件缺少 canHandle()');
  }
  if (typeof p.fetch !== 'function') throw new Error('插件缺少 fetch()');
  if (!Array.isArray(p.capabilities)) throw new Error('插件缺少 capabilities');
  if (!isRiskLevel(p.riskLevel)) throw new Error('插件 riskLevel 非法');
  if (typeof p.defaultEnabled !== 'boolean') {
    throw new Error('插件缺少 defaultEnabled');
  }

  return {
    ...(p as SourcePlugin),
    id,
  };
}

async function loadOnePluginDir(dirName: string): Promise<
  | { id: string }
  | {
      error: string;
      id: string;
      dirName: string;
      manifest?: SourcePluginManifest;
    }
> {
  const dirPath = path.join(SOURCE_PLUGINS_DIR, dirName);
  let manifest: SourcePluginManifest | undefined;

  try {
    const raw = await readPluginJson(dirPath);
    manifest = normalizeManifest(raw, dirName);

    const mod = await importPluginEntry(dirPath, manifest.entry);
    const exported = await resolvePluginExportValue(mod);
    const plugin = assertPluginShape(exported, manifest.id);

    const finalPlugin: SourcePlugin = {
      ...plugin,
      id: manifest.id,
      name: plugin.name || manifest.name,
      description: plugin.description || manifest.description || '',
      version: plugin.version || manifest.version,
      riskLevel: plugin.riskLevel || manifest.riskLevel || 'high',
      defaultEnabled:
        typeof plugin.defaultEnabled === 'boolean'
          ? plugin.defaultEnabled
          : Boolean(manifest.defaultEnabled),
      capabilities: plugin.capabilities?.length
        ? plugin.capabilities
        : manifest.capabilities || [],
      configSchema: plugin.configSchema || manifest.configSchema,
    };

    // 安全策略：high 风险不得默认启用
    const safePlugin: SourcePlugin =
      finalPlugin.riskLevel === 'high' && finalPlugin.defaultEnabled
        ? { ...finalPlugin, defaultEnabled: false }
        : finalPlugin;

    registerSourcePlugin(safePlugin, {
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
    registerSourcePluginFailure({
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

/**
 * 扫描并热加载外部 Source 插件。
 * - 先卸载既有 external
 * - 再逐目录加载
 */
export async function scanAndLoadExternalSourcePlugins(): Promise<SourcePluginScanResult> {
  await ensureDir(SOURCE_PLUGINS_DIR);
  const removed = unregisterExternalSourcePlugins();
  const loaded: string[] = [];
  const failed: SourcePluginScanResult['failed'] = [];

  const dirs = await listPluginDirs(SOURCE_PLUGINS_DIR);
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
    pluginsDir: SOURCE_PLUGINS_DIR,
    loaded,
    failed,
    removed,
  };
}
