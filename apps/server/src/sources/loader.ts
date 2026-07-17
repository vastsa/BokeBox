/**
 * 外部 Source 插件目录扫描与热加载
 *
 * 约定：
 *   storage/plugins/source/<dir>/
 *     plugin.json
 *     <entry>.js   # ESM，导出 default / plugin / createPlugin
 *
 * 安全边界（Phase 2）：
 * - 仅加载本地 SOURCE_PLUGINS_DIR，禁止远程 URL 安装
 * - 校验 plugin.json 与路径不逃逸
 * - 不自动启用 high 风险插件（由 defaultEnabled + 用户覆盖控制）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SOURCE_PLUGINS_DIR } from '../utils/paths.js';
import { ensureDir, pathExists } from '../utils/fs.js';
import {
  registerSourcePlugin,
  registerSourcePluginFailure,
  unregisterExternalSourcePlugins,
} from './registry.js';
import type {
  SourceCapability,
  SourcePlugin,
  SourcePluginManifest,
  SourcePluginPermission,
  SourceRiskLevel,
} from './types.js';
import { normalizeConfigSchema } from './config.js';

const SUPPORTED_API_VERSION = 1;

export interface SourcePluginScanResult {
  pluginsDir: string;
  loaded: string[];
  failed: Array<{ id: string; dirName: string; error: string }>;
  removed: string[];
}

function isRiskLevel(v: unknown): v is SourceRiskLevel {
  return v === 'low' || v === 'medium' || v === 'high';
}

function isCapability(v: unknown): v is SourceCapability {
  return v === 'url' || v === 'file' || v === 'webpage' || v === 'media';
}

function isPermission(v: unknown): v is SourcePluginPermission {
  return (
    v === 'network' ||
    v === 'fs:job-dir' ||
    v === 'process:spawn' ||
    v === 'config' ||
    v === 'cookies'
  );
}

function normalizeManifest(raw: unknown, dirName: string): SourcePluginManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('plugin.json 必须是对象');
  }
  const obj = raw as Record<string, unknown>;
  const id = String(obj.id || '').trim();
  const name = String(obj.name || '').trim();
  const version = String(obj.version || '').trim();
  const entry = String(obj.entry || '').trim();
  const apiVersion = Number(obj.apiVersion);

  if (!id) throw new Error('plugin.json 缺少 id');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error(`非法插件 id: ${id}`);
  }
  if (!name) throw new Error('plugin.json 缺少 name');
  if (!version) throw new Error('plugin.json 缺少 version');
  if (!entry) throw new Error('plugin.json 缺少 entry');
  if (entry.includes('..') || path.isAbsolute(entry)) {
    throw new Error('entry 必须是插件目录内的相对路径');
  }
  if (!Number.isInteger(apiVersion) || apiVersion < 1) {
    throw new Error('plugin.json 缺少有效 apiVersion');
  }
  if (apiVersion !== SUPPORTED_API_VERSION) {
    throw new Error(
      `不支持的 apiVersion=${apiVersion}（宿主支持 ${SUPPORTED_API_VERSION}）`,
    );
  }

  const capabilities = Array.isArray(obj.capabilities)
    ? obj.capabilities.filter(isCapability)
    : undefined;
  const permissions = Array.isArray(obj.permissions)
    ? obj.permissions.filter(isPermission)
    : undefined;
  const configSchema = normalizeConfigSchema(obj.configSchema);

  return {
    id,
    name,
    version,
    entry,
    apiVersion,
    description:
      typeof obj.description === 'string' ? obj.description : `${name} (${dirName})`,
    riskLevel: isRiskLevel(obj.riskLevel) ? obj.riskLevel : 'high',
    capabilities,
    defaultEnabled:
      typeof obj.defaultEnabled === 'boolean' ? obj.defaultEnabled : false,
    permissions,
    configSchema: configSchema.length ? configSchema : undefined,
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
  if (typeof p.version !== 'string' || !p.version) throw new Error('插件缺少 version');
  if (typeof p.isAvailable !== 'function') throw new Error('插件缺少 isAvailable()');
  if (typeof p.canHandle !== 'function') throw new Error('插件缺少 canHandle()');
  if (typeof p.fetch !== 'function') throw new Error('插件缺少 fetch()');
  if (!Array.isArray(p.capabilities)) throw new Error('插件缺少 capabilities');
  if (!isRiskLevel(p.riskLevel)) throw new Error('插件 riskLevel 非法');
  if (typeof p.defaultEnabled !== 'boolean') throw new Error('插件缺少 defaultEnabled');

  // 强制使用清单 id，避免导出漏写
  return {
    ...(p as SourcePlugin),
    id,
  };
}

async function resolvePluginExport(
  mod: Record<string, unknown>,
  manifest: SourcePluginManifest,
): Promise<SourcePlugin> {
  if (typeof mod.createPlugin === 'function') {
    const created = await (mod.createPlugin as () => unknown)();
    return assertPluginShape(created, manifest.id);
  }
  if (mod.plugin) return assertPluginShape(mod.plugin, manifest.id);
  if (mod.default) return assertPluginShape(mod.default, manifest.id);
  throw new Error('入口需导出 default / plugin / createPlugin');
}

async function loadOnePluginDir(dirName: string): Promise<{ id: string } | { error: string; id: string; dirName: string; manifest?: SourcePluginManifest }> {
  const dirPath = path.join(SOURCE_PLUGINS_DIR, dirName);
  const manifestPath = path.join(dirPath, 'plugin.json');
  let manifest: SourcePluginManifest | undefined;

  try {
    if (!(await pathExists(manifestPath))) {
      throw new Error('缺少 plugin.json');
    }
    const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as unknown;
    manifest = normalizeManifest(raw, dirName);

    const entryPath = path.resolve(dirPath, manifest.entry);
    if (!entryPath.startsWith(path.resolve(dirPath) + path.sep) && entryPath !== path.resolve(dirPath)) {
      throw new Error('entry 路径逃逸插件目录');
    }
    if (!(await pathExists(entryPath))) {
      throw new Error(`入口文件不存在: ${manifest.entry}`);
    }

    // 用 query  bust 缓存，支持热重载
    const url = `${pathToFileURL(entryPath).href}?t=${Date.now()}`;
    const mod = (await import(url)) as Record<string, unknown>;
    const plugin = await resolvePluginExport(mod, manifest);

    // 清单字段覆盖展示信息（以运行时对象为准，但 risk/default 以清单兜底）
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
    };

    // 安全策略：high 风险清单若写 defaultEnabled=true，强制降为 false
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
 * 扫描并热加载外部插件。
 * - 先卸载既有 external
 * - 再逐目录加载
 */
export async function scanAndLoadExternalSourcePlugins(): Promise<SourcePluginScanResult> {
  await ensureDir(SOURCE_PLUGINS_DIR);
  const removed = unregisterExternalSourcePlugins();

  const loaded: string[] = [];
  const failed: SourcePluginScanResult['failed'] = [];

  let entries: string[] = [];
  try {
    entries = await fs.readdir(SOURCE_PLUGINS_DIR);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      pluginsDir: SOURCE_PLUGINS_DIR,
      loaded,
      failed: [{ id: 'plugins-dir', dirName: '.', error: message }],
      removed,
    };
  }

  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = path.join(SOURCE_PLUGINS_DIR, name);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    const result = await loadOnePluginDir(name);
    if ('error' in result) {
      failed.push({ id: result.id, dirName: result.dirName, error: result.error });
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
