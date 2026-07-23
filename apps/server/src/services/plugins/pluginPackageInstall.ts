/**
 * 后台上传安装外部插件（zip）
 *
 * 支持结构：
 * 1) plugin.json 在 zip 根目录
 * 2) 唯一顶层目录 /plugin.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeManifestBase,
  type PluginScanResult,
} from '../../plugin-kit/index.js';
import {
  ASR_PLUGINS_DIR,
  SOURCE_PLUGINS_DIR,
  STORAGE_DIR,
  TTS_PLUGINS_DIR,
  SCHEDULE_PLUGINS_DIR,
} from '../../utils/paths.js';
import {
  ensureDir,
  pathExists,
  removeDirIfExists,
} from '../../utils/fs.js';
import { extractZipBuffer } from './zipExtract.js';
import { refreshExternalSourcePlugins } from '../../sources/index.js';
import { refreshExternalAsrPlugins } from '../../providers/asr/index.js';
import { refreshExternalTtsPlugins } from '../../providers/tts/index.js';
import { refreshExternalSchedulePlugins } from '../schedule/index.js';

export type PluginPackageKind = 'source' | 'asr' | 'tts' | 'schedule';

export type PluginInstallResult = {
  ok: true;
  kind: PluginPackageKind;
  pluginId: string;
  dirName: string;
  dirPath: string;
  replaced: boolean;
  version: string;
  name: string;
  files: number;
  scan: PluginScanResult;
};

const MAX_ZIP_BYTES = 80 * 1024 * 1024;

function pluginsRoot(kind: PluginPackageKind): string {
  if (kind === 'source') return SOURCE_PLUGINS_DIR;
  if (kind === 'asr') return ASR_PLUGINS_DIR;
  if (kind === 'schedule') return SCHEDULE_PLUGINS_DIR;
  return TTS_PLUGINS_DIR;
}

function safeDirName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function pathIsDir(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 在解压目录中定位 plugin.json 根（支持单层包裹目录）
 */
export async function resolvePluginRoot(extractDir: string): Promise<string> {
  const direct = path.join(extractDir, 'plugin.json');
  if (await pathExists(direct)) return extractDir;

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith('__MACOSX') && e.name !== '.DS_Store',
  );
  const files = entries.filter((e) => e.isFile() && e.name !== '.DS_Store');

  if (dirs.length === 1 && files.length === 0) {
    const nested = path.join(extractDir, dirs[0].name);
    if (await pathExists(path.join(nested, 'plugin.json'))) return nested;
  }

  // 多个顶层目录时，找第一个含 plugin.json 的
  for (const d of dirs) {
    const nested = path.join(extractDir, d.name);
    if (await pathExists(path.join(nested, 'plugin.json'))) return nested;
  }

  throw new Error('插件包中未找到 plugin.json（需在根目录或唯一子目录内）');
}

async function copyDir(src: string, dest: string): Promise<number> {
  await ensureDir(dest);
  let count = 0;
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name === '__MACOSX') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(from, to);
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(to));
      await fs.copyFile(from, to);
      count += 1;
    } else {
      throw new Error(`插件包含不支持的文件类型: ${entry.name}`);
    }
  }
  return count;
}

async function refreshKind(kind: PluginPackageKind): Promise<PluginScanResult> {
  if (kind === 'source') return refreshExternalSourcePlugins();
  if (kind === 'asr') return refreshExternalAsrPlugins();
  if (kind === 'schedule') return refreshExternalSchedulePlugins();
  return refreshExternalTtsPlugins();
}

/**
 * 从 zip buffer 安装插件到 storage/plugins/<kind>/<dir>
 */
export async function installPluginPackageFromZip(
  kind: PluginPackageKind,
  zipBuffer: Buffer,
  options?: { overwrite?: boolean },
): Promise<PluginInstallResult> {
  const overwrite = options?.overwrite !== false;
  if (!zipBuffer?.length) {
    throw Object.assign(new Error('请上传插件 zip 包'), { statusCode: 400 });
  }
  if (zipBuffer.length > MAX_ZIP_BYTES) {
    throw Object.assign(new Error('插件包过大（上限 80MB）'), {
      statusCode: 413,
    });
  }
  // ZIP 魔数 PK
  if (zipBuffer.length < 4 || zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b) {
    throw Object.assign(new Error('仅支持 .zip 插件包'), { statusCode: 400 });
  }

  const tmpRoot = path.join(
    STORAGE_DIR,
    '.tmp',
    'plugin-install',
    `${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  );
  const extractDir = path.join(tmpRoot, 'extract');
  const stageDir = path.join(tmpRoot, 'stage');

  try {
    await ensureDir(extractDir);
    const extracted = await extractZipBuffer(zipBuffer, extractDir, {
      maxEntries: 4000,
      maxTotalUncompressed: 200 * 1024 * 1024,
      maxSingleFile: 80 * 1024 * 1024,
    });
    if (!extracted.files) {
      throw Object.assign(new Error('插件包为空'), { statusCode: 400 });
    }

    const pluginRoot = await resolvePluginRoot(extractDir);
    const rawManifest = JSON.parse(
      await fs.readFile(path.join(pluginRoot, 'plugin.json'), 'utf8'),
    ) as unknown;
    const manifest = normalizeManifestBase(rawManifest, path.basename(pluginRoot));

    // entry 文件必须存在
    const entryPath = path.resolve(pluginRoot, manifest.entry);
    if (
      entryPath !== pluginRoot &&
      !entryPath.startsWith(pluginRoot + path.sep)
    ) {
      throw Object.assign(new Error('plugin.json entry 非法'), {
        statusCode: 400,
      });
    }
    if (!(await pathExists(entryPath))) {
      throw Object.assign(
        new Error(`插件入口不存在: ${manifest.entry}`),
        { statusCode: 400 },
      );
    }

    const dirName = safeDirName(manifest.id) || safeDirName(path.basename(pluginRoot));
    if (!dirName) {
      throw Object.assign(new Error('无法从插件 id 生成目录名'), {
        statusCode: 400,
      });
    }

    const targetRoot = pluginsRoot(kind);
    await ensureDir(targetRoot);
    const targetDir = path.join(targetRoot, dirName);
    const targetResolved = path.resolve(targetDir);
    if (!targetResolved.startsWith(path.resolve(targetRoot) + path.sep)) {
      throw Object.assign(new Error('插件安装路径非法'), { statusCode: 400 });
    }

    const existed = await pathIsDir(targetDir);
    if (existed && !overwrite) {
      throw Object.assign(
        new Error(`插件目录已存在: ${dirName}（请勾选覆盖安装）`),
        { statusCode: 409 },
      );
    }

    // 先拷到 stage，再原子替换
    await removeDirIfExists(stageDir);
    const files = await copyDir(pluginRoot, stageDir);

    if (existed) {
      await removeDirIfExists(targetDir);
    }
    await fs.rename(stageDir, targetDir).catch(async () => {
      // 跨设备时 fallback
      await copyDir(stageDir, targetDir);
      await removeDirIfExists(stageDir);
    });

    const scan = await refreshKind(kind);
    const loadedOk = scan.loaded.includes(manifest.id);
    const failed = scan.failed.find(
      (f) => f.id === manifest.id || f.dirName === dirName,
    );
    if (!loadedOk && failed) {
      // 安装了但加载失败：保留目录，让用户看 loadError
      // 不回滚，便于修配置后 rescan
    }

    return {
      ok: true,
      kind,
      pluginId: manifest.id,
      dirName,
      dirPath: targetDir,
      replaced: existed,
      version: manifest.version,
      name: manifest.name,
      files,
      scan,
    };
  } finally {
    await removeDirIfExists(tmpRoot);
  }
}

/**
 * 删除已安装的外部插件目录并热扫描
 */
export async function uninstallExternalPlugin(
  kind: PluginPackageKind,
  pluginId: string,
): Promise<{ ok: true; pluginId: string; dirName: string; scan: PluginScanResult }> {
  const id = String(pluginId || '').trim();
  if (!id) {
    throw Object.assign(new Error('缺少插件 id'), { statusCode: 400 });
  }

  // 通过扫描结果定位目录：以 id 安全名为主，兼容目录名=id
  const root = pluginsRoot(kind);
  const candidates = [
    safeDirName(id),
    id,
    id.toLowerCase(),
  ].filter(Boolean);

  let dirName = '';
  let dirPath = '';
  for (const name of [...new Set(candidates)]) {
    const full = path.join(root, name);
    if (await pathIsDir(full)) {
      // 校验 plugin.json id 匹配，避免误删
      try {
        const raw = JSON.parse(
          await fs.readFile(path.join(full, 'plugin.json'), 'utf8'),
        ) as { id?: string };
        if (String(raw.id || '').trim() === id) {
          dirName = name;
          dirPath = full;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  if (!dirPath) {
    // 遍历查找
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const full = path.join(root, entry.name);
        try {
          const raw = JSON.parse(
            await fs.readFile(path.join(full, 'plugin.json'), 'utf8'),
          ) as { id?: string };
          if (String(raw.id || '').trim() === id) {
            dirName = entry.name;
            dirPath = full;
            break;
          }
        } catch {
          // skip
        }
      }
    } catch {
      // empty root
    }
  }

  if (!dirPath) {
    throw Object.assign(new Error(`未找到外部插件目录: ${id}`), {
      statusCode: 404,
    });
  }

  const resolved = path.resolve(dirPath);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw Object.assign(new Error('插件卸载路径非法'), { statusCode: 400 });
  }

  await removeDirIfExists(dirPath);
  const scan = await refreshKind(kind);
  return { ok: true, pluginId: id, dirName, scan };
}
