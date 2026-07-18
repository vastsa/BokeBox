/**
 * 封面图片压缩与缩略图
 *
 * - 写入时：原图压缩为 WebP，并预生成 thumb/sm/md
 * - 读取时：按 size 出变体；缺失则按需生成并落盘缓存
 * - 目标：列表/播放条默认用小图，显著降低首屏体积
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ensureDir, pathExists, removeIfExists } from '../utils/fs.js';

/** 对外尺寸档位 */
export type CoverImageSize = 'thumb' | 'sm' | 'md' | 'full';

/** 主图候选（不含缩略图变体） */
export const COVER_MASTER_CANDIDATES = [
  'cover.webp',
  'cover.png',
  'cover.jpg',
  'cover.jpeg',
] as const;

/** 变体文件名后缀 */
const VARIANT_SUFFIX: Record<Exclude<CoverImageSize, 'full'>, string> = {
  thumb: 'thumb',
  sm: 'sm',
  md: 'md',
};

/** 各档位：最长边 + WebP 质量 */
const VARIANT_SPEC: Record<
  CoverImageSize,
  { maxEdge: number; quality: number }
> = {
  thumb: { maxEdge: 128, quality: 72 },
  sm: { maxEdge: 256, quality: 76 },
  md: { maxEdge: 512, quality: 80 },
  /** 主图上限，避免 AI 原图（到 1792）过大 */
  full: { maxEdge: 1280, quality: 85 },
};

/** 清理时一并删除的变体文件 */
export const COVER_VARIANT_FILES = [
  'cover.thumb.webp',
  'cover.sm.webp',
  'cover.md.webp',
] as const;

/** 主图 + 变体，用于目录级清理 */
export const COVER_ALL_FILES = [
  ...COVER_MASTER_CANDIDATES,
  ...COVER_VARIANT_FILES,
] as const;

const inflight = new Map<string, Promise<string>>();

export function parseCoverImageSize(
  raw: unknown,
  fallback: CoverImageSize = 'full',
): CoverImageSize {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'thumb' || v === 'xs' || v === 'mini') return 'thumb';
  if (v === 'sm' || v === 'small' || v === 's') return 'sm';
  if (v === 'md' || v === 'medium' || v === 'm') return 'md';
  if (v === 'full' || v === 'lg' || v === 'large' || v === 'orig' || v === 'original') {
    return 'full';
  }
  return fallback;
}

export function coverVariantFileName(size: Exclude<CoverImageSize, 'full'>): string {
  return `cover.${VARIANT_SUFFIX[size]}.webp`;
}

export function coverVariantPath(
  dir: string,
  size: Exclude<CoverImageSize, 'full'>,
): string {
  return path.join(dir, coverVariantFileName(size));
}

/** 在目录中查找主封面（忽略缩略图） */
export async function findCoverMasterFile(dir: string): Promise<string | null> {
  for (const name of COVER_MASTER_CANDIDATES) {
    const p = path.join(dir, name);
    if (await pathExists(p)) return p;
  }
  return null;
}

/** 删除目录下全部封面主图与变体（可保留 keepPath） */
export async function cleanupCoverFiles(
  dir: string,
  keepPath?: string,
): Promise<void> {
  const keep = keepPath ? path.resolve(keepPath) : null;
  for (const name of COVER_ALL_FILES) {
    const p = path.join(dir, name);
    if (keep && path.resolve(p) === keep) continue;
    await removeIfExists(p);
  }
}

/**
 * 将原始字节压缩为主图 WebP，并预生成 thumb/sm/md。
 * 失败时回退写入原始扩展名，保证封面不丢。
 */
export async function writeOptimizedCover(
  dir: string,
  bytes: Buffer,
  preferredExt?: string,
): Promise<{ masterPath: string; optimized: boolean }> {
  await ensureDir(dir);

  try {
    const masterBuf = await encodeWebp(bytes, VARIANT_SPEC.full);
    const masterPath = path.join(dir, 'cover.webp');
    // 先清旧文件，再写主图，避免半新旧混杂
    await cleanupCoverFiles(dir);
    await fs.writeFile(masterPath, masterBuf);

    // 预生成常用缩略图（失败不阻断主流程）
    await Promise.allSettled([
      materializeVariant(masterPath, 'thumb'),
      materializeVariant(masterPath, 'sm'),
      materializeVariant(masterPath, 'md'),
    ]);

    return { masterPath, optimized: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[image] optimize failed, fallback raw write: ${msg}`);

    const ext = normalizeExt(preferredExt) || sniffExt(bytes) || '.png';
    const masterPath = path.join(dir, `cover${ext === '.jpeg' ? '.jpg' : ext}`);
    await cleanupCoverFiles(dir);
    await fs.writeFile(masterPath, bytes);
    return { masterPath, optimized: false };
  }
}

/**
 * 解析要下发的文件路径：
 * - full → 主图（若为非 webp 且可优化，按需生成 cover.webp 并优先返回）
 * - thumb/sm/md → 对应变体（缺失则按需生成）
 */
export async function resolveCoverDelivery(
  dir: string,
  size: CoverImageSize = 'full',
): Promise<{ filePath: string; mime: string; size: CoverImageSize } | null> {
  const master = await findCoverMasterFile(dir);
  if (!master) return null;

  if (size === 'full') {
    // 非 webp 主图：按需转一份 cover.webp，加速后续 full 请求
    const webpMaster = path.join(dir, 'cover.webp');
    if (path.resolve(master) !== path.resolve(webpMaster)) {
      try {
        if (!(await pathExists(webpMaster))) {
          await ensureOptimizedMaster(master, webpMaster);
        }
        if (await pathExists(webpMaster)) {
          return { filePath: webpMaster, mime: 'image/webp', size: 'full' };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[image] full optimize skip: ${msg}`);
      }
    }
    return {
      filePath: master,
      mime: mimeFromPath(master),
      size: 'full',
    };
  }

  const variantPath = await ensureVariantCached(master, size);
  return {
    filePath: variantPath,
    mime: 'image/webp',
    size,
  };
}

async function ensureVariantCached(
  masterPath: string,
  size: Exclude<CoverImageSize, 'full'>,
): Promise<string> {
  const out = coverVariantPath(path.dirname(masterPath), size);
  if (await pathExists(out)) return out;

  const key = out;
  const existing = inflight.get(key);
  if (existing) return existing;

  const task = materializeVariant(masterPath, size).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}

async function materializeVariant(
  masterPath: string,
  size: Exclude<CoverImageSize, 'full'>,
): Promise<string> {
  const out = coverVariantPath(path.dirname(masterPath), size);
  if (await pathExists(out)) return out;

  const input = await fs.readFile(masterPath);
  const buf = await encodeWebp(input, VARIANT_SPEC[size]);
  await ensureDir(path.dirname(out));
  // 原子写：tmp + rename，避免并发读到半截文件
  const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, out);
  return out;
}

async function ensureOptimizedMaster(
  sourcePath: string,
  webpPath: string,
): Promise<string> {
  const key = webpPath;
  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    if (await pathExists(webpPath)) return webpPath;
    const input = await fs.readFile(sourcePath);
    const buf = await encodeWebp(input, VARIANT_SPEC.full);
    const tmp = `${webpPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, webpPath);
    // 主图已转 webp 后，尽量清掉更大的旧主图
    const dir = path.dirname(sourcePath);
    for (const name of ['cover.png', 'cover.jpg', 'cover.jpeg'] as const) {
      const p = path.join(dir, name);
      if (path.resolve(p) !== path.resolve(webpPath)) {
        await removeIfExists(p);
      }
    }
    return webpPath;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

async function encodeWebp(
  bytes: Buffer,
  spec: { maxEdge: number; quality: number },
): Promise<Buffer> {
  // withoutEnlargement：小于目标边长时不放大，省去先读 metadata 的双解析
  return sharp(bytes, { failOn: 'none', sequentialRead: true })
    .rotate()
    .resize({
      width: spec.maxEdge,
      height: spec.maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: spec.quality,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function normalizeExt(ext?: string): string | null {
  if (!ext) return null;
  const e = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (e === '.jpeg') return '.jpg';
  if (['.png', '.jpg', '.webp'].includes(e)) return e;
  return null;
}

/** 简单魔数嗅探，仅用于 fallback 写盘 */
function sniffExt(bytes: Buffer): string | null {
  if (bytes.length >= 12) {
    // RIFF....WEBP
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return '.webp';
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return '.jpg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return '.png';
  }
  return null;
}
