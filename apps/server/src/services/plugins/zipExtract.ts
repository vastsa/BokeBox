/**
 * 最小安全 ZIP 解压（仅 store / deflate）
 * 用于插件包安装，禁止路径穿越与符号链接。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { ensureDir } from '../../utils/fs.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

export type ZipEntry = {
  name: string;
  isDirectory: boolean;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function readU16(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

function readU32(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

function findEocd(buf: Buffer): number {
  // EOCD 最少 22 字节，注释最长 0xffff
  const min = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (readU32(buf, i) === SIG_EOCD) return i;
  }
  throw new Error('无效的 ZIP 文件：找不到目录结束记录');
}

function decodeName(raw: Buffer, flags: number): string {
  // bit 11 = UTF-8
  if (flags & 0x800) return raw.toString('utf8');
  // 回退 latin1，避免中文路径炸掉
  return raw.toString('utf8');
}

export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const totalEntries = readU16(buf, eocd + 10);
  const centralSize = readU32(buf, eocd + 12);
  const centralOffset = readU32(buf, eocd + 16);
  if (centralOffset + centralSize > buf.length) {
    throw new Error('无效的 ZIP 文件：中央目录越界');
  }

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (offset + 46 > buf.length) {
      throw new Error('无效的 ZIP 文件：中央目录项截断');
    }
    if (readU32(buf, offset) !== SIG_CENTRAL) {
      throw new Error('无效的 ZIP 文件：中央目录签名错误');
    }
    const flags = readU16(buf, offset + 8);
    const compression = readU16(buf, offset + 10);
    const compressedSize = readU32(buf, offset + 20);
    const uncompressedSize = readU32(buf, offset + 24);
    const nameLen = readU16(buf, offset + 28);
    const extraLen = readU16(buf, offset + 30);
    const commentLen = readU16(buf, offset + 32);
    const localHeaderOffset = readU32(buf, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buf.length) {
      throw new Error('无效的 ZIP 文件：文件名截断');
    }
    const name = decodeName(buf.subarray(nameStart, nameEnd), flags).replace(
      /\\/g,
      '/',
    );
    entries.push({
      name,
      isDirectory: name.endsWith('/'),
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nameEnd + extraLen + commentLen;
  }
  return entries;
}

function readLocalFileData(buf: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buf.length) {
    throw new Error(`ZIP 本地头截断: ${entry.name}`);
  }
  if (readU32(buf, offset) !== SIG_LOCAL) {
    throw new Error(`ZIP 本地头签名错误: ${entry.name}`);
  }
  const flags = readU16(buf, offset + 6);
  if (flags & 0x1) {
    throw new Error(`不支持加密 ZIP 条目: ${entry.name}`);
  }
  const compression = readU16(buf, offset + 8);
  const nameLen = readU16(buf, offset + 26);
  const extraLen = readU16(buf, offset + 28);
  const dataStart = offset + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buf.length) {
    throw new Error(`ZIP 数据截断: ${entry.name}`);
  }
  const compressed = buf.subarray(dataStart, dataEnd);
  if (entry.isDirectory) return Buffer.alloc(0);
  if (compression === 0) {
    if (compressed.length !== entry.uncompressedSize) {
      // 某些实现 compressedSize 可信即可
      return Buffer.from(compressed);
    }
    return Buffer.from(compressed);
  }
  if (compression === 8) {
    const out = inflateRawSync(compressed);
    if (entry.uncompressedSize && out.length !== entry.uncompressedSize) {
      throw new Error(`ZIP 解压后大小不匹配: ${entry.name}`);
    }
    return out;
  }
  throw new Error(`不支持的 ZIP 压缩方式 (${compression}): ${entry.name}`);
}

export type ExtractZipOptions = {
  maxEntries?: number;
  maxTotalUncompressed?: number;
  maxSingleFile?: number;
};

/**
 * 将 ZIP 安全解压到目标目录（目标须已存在或可创建）。
 */
export async function extractZipBuffer(
  buf: Buffer,
  destDir: string,
  options: ExtractZipOptions = {},
): Promise<{ files: number; bytes: number }> {
  const maxEntries = options.maxEntries ?? 5000;
  const maxTotal = options.maxTotalUncompressed ?? 200 * 1024 * 1024;
  const maxSingle = options.maxSingleFile ?? 80 * 1024 * 1024;

  const root = path.resolve(destDir);
  await ensureDir(root);

  const entries = listZipEntries(buf);
  if (entries.length > maxEntries) {
    throw new Error(`插件包文件数过多（>${maxEntries}）`);
  }

  let total = 0;
  let files = 0;
  for (const entry of entries) {
    const rawName = entry.name.replace(/^\/+/, '');
    if (!rawName || rawName.includes('\0')) {
      throw new Error('ZIP 含非法路径');
    }
    if (rawName.split('/').some((seg) => seg === '..')) {
      throw new Error(`ZIP 路径穿越被拒绝: ${entry.name}`);
    }
    // 拒绝绝对路径与盘符
    if (path.isAbsolute(rawName) || /^[a-zA-Z]:/.test(rawName)) {
      throw new Error(`ZIP 绝对路径被拒绝: ${entry.name}`);
    }

    const target = path.resolve(root, rawName);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`ZIP 路径逃逸: ${entry.name}`);
    }

    if (entry.isDirectory) {
      await ensureDir(target);
      continue;
    }

    if (entry.uncompressedSize > maxSingle) {
      throw new Error(`插件包单文件过大: ${entry.name}`);
    }
    const data = readLocalFileData(buf, entry);
    if (data.length > maxSingle) {
      throw new Error(`插件包单文件过大: ${entry.name}`);
    }
    total += data.length;
    if (total > maxTotal) {
      throw new Error('插件包解压后体积过大');
    }
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, data, { flag: 'w' });
    files += 1;
  }

  return { files, bytes: total };
}
