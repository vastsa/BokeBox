/**
 * 解析可用的 ffmpeg 可执行路径。
 * 优先级：
 * 1. 环境变量 FFMPEG_BIN / FFMPEG_PATH（Docker 国内镜像会指向 /usr/bin/ffmpeg）
 * 2. ffmpeg-static（本地下载的预编译二进制；FFMPEG_BIN 已设时其导出即为该值）
 * 3. 常见系统路径
 */
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';

const SYSTEM_CANDIDATES = [
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  '/bin/ffmpeg',
];

function fromStatic(): string | null {
  if (typeof ffmpegStatic === 'string' && ffmpegStatic) return ffmpegStatic;
  const def = (ffmpegStatic as { default?: string } | null)?.default;
  return def || null;
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
