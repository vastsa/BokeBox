/**
 * 外部插件加载公共工具
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeConfigSchema } from './config.js';
import type {
  PluginManifestBase,
  PluginPermission,
  PluginRiskLevel,
} from './types.js';
import { PLUGIN_API_VERSION } from './types.js';

export function isRiskLevel(v: unknown): v is PluginRiskLevel {
  return v === 'low' || v === 'medium' || v === 'high';
}

export function isPermission(v: unknown): v is PluginPermission {
  return (
    v === 'network' ||
    v === 'fs:job-dir' ||
    v === 'process:spawn' ||
    v === 'config' ||
    v === 'cookies'
  );
}

export function normalizeManifestBase(
  raw: unknown,
  dirName: string,
): PluginManifestBase {
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
  if (apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(
      `不支持的 apiVersion=${apiVersion}（宿主支持 ${PLUGIN_API_VERSION}）`,
    );
  }

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
      typeof obj.description === 'string'
        ? obj.description
        : `${name} (${dirName})`,
    riskLevel: isRiskLevel(obj.riskLevel) ? obj.riskLevel : 'high',
    defaultEnabled:
      typeof obj.defaultEnabled === 'boolean' ? obj.defaultEnabled : false,
    permissions,
    configSchema: configSchema.length ? configSchema : undefined,
  };
}

export async function readPluginJson(dirPath: string): Promise<unknown> {
  const manifestPath = path.join(dirPath, 'plugin.json');
  const text = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(text) as unknown;
}

export async function importPluginEntry(
  dirPath: string,
  entry: string,
): Promise<Record<string, unknown>> {
  const entryPath = path.resolve(dirPath, entry);
  if (!entryPath.startsWith(path.resolve(dirPath) + path.sep)) {
    throw new Error('entry 路径逃逸插件目录');
  }
  // cache bust：允许 rescan 热更新
  const url = `${pathToFileURL(entryPath).href}?t=${Date.now()}`;
  const mod = (await import(url)) as Record<string, unknown>;
  return mod;
}

export async function resolvePluginExportValue(
  mod: Record<string, unknown>,
): Promise<unknown> {
  if (typeof mod.createPlugin === 'function') {
    return (mod.createPlugin as () => unknown)();
  }
  if (mod.plugin && typeof mod.plugin === 'object') return mod.plugin;
  if (mod.default && typeof mod.default === 'object') return mod.default;
  // 兼容直接导出对象（module.exports 风格经 ESM interop）
  if (typeof mod.id === 'string' || typeof mod.isAvailable === 'function') {
    return mod;
  }
  throw new Error(
    '插件入口需导出 default / plugin / createPlugin()，或直接导出插件对象',
  );
}

export async function listPluginDirs(pluginsDir: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(pluginsDir);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = path.join(pluginsDir, name);
    try {
      const st = await fs.stat(full);
      if (st.isDirectory()) dirs.push(name);
    } catch {
      // skip
    }
  }
  return dirs;
}
