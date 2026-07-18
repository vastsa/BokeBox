/**
 * 媒体 / 封面 URL 工具（带 access_token 查询参数）。
 */
import { getToken } from '../lib/auth';
import { BASE } from './http';

/** 封面尺寸：列表默认 sm；CoverArt 渐进加载 sm→full；下载/原图 full */
export type CoverImageSize = 'thumb' | 'sm' | 'md' | 'full';

/** 读取封面 URL 上的 size 参数 */
export function readCoverImageSize(url: string): CoverImageSize | null {
  try {
    const u = new URL(url, 'http://local.invalid');
    const raw = (u.searchParams.get('size') || '').trim().toLowerCase();
    if (raw === 'thumb' || raw === 'sm' || raw === 'md' || raw === 'full') return raw;
    return null;
  } catch {
    return null;
  }
}

/** 改写封面 URL 的 size（用于渐进加载：先 sm 再 full 原图） */
export function withCoverImageSize(url: string, size: CoverImageSize): string {
  const abs = /^https?:\/\//i.test(url);
  const u = new URL(url, 'http://local.invalid');
  u.searchParams.set('size', size);
  if (abs) return u.toString();
  return `${u.pathname}${u.search}`;
}

function appendQuery(url: string, params: Record<string, string | undefined>): string {
  const abs = /^https?:\/\//i.test(url);
  const u = new URL(url, 'http://local.invalid');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') u.searchParams.set(k, v);
  }
  const token = getToken();
  if (token) u.searchParams.set('access_token', token);
  if (abs) return u.toString();
  return `${u.pathname}${u.search}`;
}

export function albumCoverUrl(
  id: string,
  cacheKey?: string,
  size: CoverImageSize = 'sm',
): string {
  // 游客与登录统一走 listen 封面（鉴权钩子已放行）
  // 始终带 size，避免 full 被服务端默认 sm 吃掉
  return appendQuery(`${BASE}/listen/albums/${encodeURIComponent(id)}/cover`, {
    v: cacheKey != null ? String(cacheKey) : undefined,
    size,
  });
}

export function podcastAudioUrl(
  id: string,
  download = false,
  cacheKey?: string,
): string {
  return appendQuery(`${BASE}/jobs/${id}/audio`, {
    download: download ? '1' : undefined,
    v: cacheKey,
  });
}

export function sourceAudioUrl(id: string): string {
  return appendQuery(`${BASE}/jobs/${id}/source-audio`, {});
}

export function videoUrl(id: string): string {
  return appendQuery(`${BASE}/jobs/${id}/video`, {});
}

/** AI 播客封面图（hasCoverImage 时可用；默认 sm，CoverArt 会再同步拉 full） */
export function coverImageUrl(
  id: string,
  cacheKey?: string,
  size: CoverImageSize = 'sm',
): string {
  // 始终带 size，避免 full 被服务端默认 sm 吃掉
  return appendQuery(`${BASE}/jobs/${id}/cover`, {
    v: cacheKey != null ? String(cacheKey) : undefined,
    size,
  });
}
