import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function removeIfExists(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore missing files
  }
}

/** 递归删除目录（任务级清理） */
export async function removeDirIfExists(dirPath?: string): Promise<void> {
  if (!dirPath) return;
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // ignore missing dirs
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

/** 存在则移动（跨目录优先 rename，失败则 copy+unlink） */
export async function moveFile(src: string, dest: string): Promise<boolean> {
  if (!(await pathExists(src))) return false;
  if (path.resolve(src) === path.resolve(dest)) return true;
  await ensureDir(path.dirname(dest));
  try {
    await fs.rename(src, dest);
    return true;
  } catch {
    await fs.copyFile(src, dest);
    await removeIfExists(src);
    return true;
  }
}
