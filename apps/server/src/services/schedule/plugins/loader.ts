/**
 * 外部 Schedule 插件目录扫描与热加载
 *
 * storage/plugins/schedule/<dir>/
 *   plugin.json
 *   <entry>.js
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
} from '../../../plugin-kit/index.js';
import { ensureDir } from '../../../utils/fs.js';
import { SCHEDULE_PLUGINS_DIR } from '../../../utils/paths.js';
import {
  registerSchedulePlugin,
  registerSchedulePluginFailure,
  unregisterExternalSchedulePlugins,
} from './registry.js';
import type {
  SchedulePlugin,
  SchedulePluginCapability,
  SchedulePluginManifest,
} from './types.js';

export type SchedulePluginScanResult = PluginScanResult;

function isCapability(v: unknown): v is SchedulePluginCapability {
  return v === 'poll' || v === 'rss' || v === 'list' || v === 'api';
}

function normalizeManifest(
  raw: unknown,
  dirName: string,
): SchedulePluginManifest {
  const base = normalizeManifestBase(raw, dirName);
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const capabilities = Array.isArray(obj.capabilities)
    ? obj.capabilities.filter(isCapability)
    : undefined;
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

function assertPluginShape(value: unknown, id: string): SchedulePlugin {
  if (!value || typeof value !== 'object') {
    throw new Error('插件导出必须是对象');
  }
  const p = value as Partial<SchedulePlugin>;
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
  return { ...(p as SchedulePlugin), id };
}

async function loadOnePluginDir(dirName: string): Promise<
  | { id: string }
  | {
      error: string;
      id: string;
      dirName: string;
      manifest?: SchedulePluginManifest;
    }
> {
  const dirPath = path.join(SCHEDULE_PLUGINS_DIR, dirName);
  let manifest: SchedulePluginManifest | undefined;

  try {
    const raw = await readPluginJson(dirPath);
    manifest = normalizeManifest(raw, dirName);

    const mod = await importPluginEntry(dirPath, manifest.entry);
    const exported = await resolvePluginExportValue(mod);
    const plugin = assertPluginShape(exported, manifest.id);

    const finalPlugin: SchedulePlugin = {
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
        : manifest.capabilities || ['poll'],
      configSchema: plugin.configSchema || manifest.configSchema,
    };

    const safePlugin: SchedulePlugin =
      finalPlugin.riskLevel === 'high' && finalPlugin.defaultEnabled
        ? { ...finalPlugin, defaultEnabled: false }
        : finalPlugin;

    registerSchedulePlugin(safePlugin, {
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
    registerSchedulePluginFailure({
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

export async function scanAndLoadExternalSchedulePlugins(): Promise<SchedulePluginScanResult> {
  await ensureDir(SCHEDULE_PLUGINS_DIR);
  const removed = unregisterExternalSchedulePlugins();
  const loaded: string[] = [];
  const failed: SchedulePluginScanResult['failed'] = [];

  const dirs = await listPluginDirs(SCHEDULE_PLUGINS_DIR);
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
    pluginsDir: SCHEDULE_PLUGINS_DIR,
    loaded,
    failed,
    removed,
  };
}
