/**
 * 解析可用的 ffmpeg 可执行路径。
 * 优先级：
 * 1. 环境变量 FFMPEG_BIN / FFMPEG_PATH（Docker 镜像会指向 /usr/bin/ffmpeg）
 * 2. ffmpeg-static（本地下载的预编译二进制；Docker 生产镜像可剔除该包）
 * 3. 常见系统路径
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const SYSTEM_CANDIDATES = [
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  '/bin/ffmpeg',
];

const require = createRequire(import.meta.url);

function fromStatic(): string | null {
  try {
    // 生产 Docker 镜像可能删除 ffmpeg-static 包，动态加载避免启动即崩溃
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('ffmpeg-static') as string | { default?: string } | null;
    if (typeof mod === 'string' && mod) return mod;
    const def = (mod as { default?: string } | null)?.default;
    return def || null;
  } catch {
    return null;
  }
}

/** 同步解析（启动期配置 fluent-ffmpeg 用） */
export function resolveFfmpegPath(): string | null {
  const envPath =
    process.env.FFMPEG_BIN?.trim() ||
    process.env.FFMPEG_PATH?.trim() ||
    '';
  if (envPath && existsSync(envPath)) return envPath;

  const staticPath = fromStatic();
  if (staticPath && existsSync(staticPath)) return staticPath;

  for (const p of SYSTEM_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}
