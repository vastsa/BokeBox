import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, pathExists, removeIfExists } from '../utils/fs.js';
import { jobPaths } from '../utils/paths.js';
import type { PodcastContent } from '../types/job.js';
import {
  aiFetch,
  getImageModel,
  hasApiKey,
  hasImageModel,
} from '../utils/aiConfig.js';

/** 候选封面文件名（按优先级） */
const COVER_CANDIDATES = ['cover.png', 'cover.jpg', 'cover.jpeg', 'cover.webp'] as const;

export function resolveCoverPath(jobId: string, preferredExt?: string): string {
  const dir = jobPaths(jobId).dir;
  if (preferredExt) {
    const ext = preferredExt.startsWith('.') ? preferredExt : `.${preferredExt}`;
    return path.join(dir, `cover${ext}`);
  }
  return path.join(dir, 'cover.png');
}

/** 查找任务目录下已有封面 */
export async function findCoverFile(jobId: string): Promise<string | null> {
  const dir = jobPaths(jobId).dir;
  for (const name of COVER_CANDIDATES) {
    const p = path.join(dir, name);
    if (await pathExists(p)) return p;
  }
  return null;
}

function buildCoverPrompt(podcast: PodcastContent): string {
  const title = (podcast.title || 'Podcast').slice(0, 80);
  const summary = (podcast.summary || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const tags = (podcast.tags || []).slice(0, 5).join(', ');
  const theme = [summary, tags].filter(Boolean).join(' · ');

  return [
    'Create a square podcast cover artwork, 1:1 aspect ratio.',
    `Show title concept: "${title}".`,
    theme ? `Theme and mood: ${theme}.` : '',
    'Style: modern, premium, clean illustration, rich colors, soft cinematic lighting.',
    'Composition suitable for a podcast album cover.',
    'Do NOT render any text, letters, logos, watermarks, or UI elements.',
    'No photorealistic faces of real people. Abstract or stylized imagery preferred.',
  ]
    .filter(Boolean)
    .join(' ');
}

function extFromMime(mime?: string | null): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('webp')) return '.webp';
  if (m.includes('png')) return '.png';
  return '.png';
}

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch {
    // ignore
  }
  return '.png';
}

async function cleanupOldCovers(jobId: string, keepPath?: string): Promise<void> {
  const dir = jobPaths(jobId).dir;
  for (const name of COVER_CANDIDATES) {
    const p = path.join(dir, name);
    if (keepPath && path.resolve(p) === path.resolve(keepPath)) continue;
    await removeIfExists(p);
  }
}

async function writeCoverBytes(
  jobId: string,
  bytes: Buffer,
  ext: string,
): Promise<string> {
  const out = resolveCoverPath(jobId, ext);
  await ensureDir(path.dirname(out));
  await cleanupOldCovers(jobId, out);
  await fs.writeFile(out, bytes);
  return out;
}

/**
 * 调用 OpenAI 兼容图片接口生成封面。
 * 实际请求：{baseUrl}/images/generations
 * 其中 baseUrl 通常为 https://.../v1，即完整路径 /v1/images/generations。
 * 请求体：{ model, prompt, n, size, response_format? }
 * 响应：{ data: [{ b64_json? | url? }] }
 */
export async function generatePodcastCover(
  jobId: string,
  podcast: PodcastContent,
): Promise<boolean> {
  if (!hasApiKey() || !hasImageModel()) return false;

  const model = getImageModel();
  const prompt = buildCoverPrompt(podcast);

  const res = await aiFetch('/images/generations', {
    method: 'POST',
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
      // 优先 b64，便于本地落盘；网关若不支持会忽略或报错，下方有兼容
      response_format: 'b64_json',
    }),
  });

  // 部分网关不认 response_format，降级重试
  let finalRes = res;
  if (!finalRes.ok) {
    const firstBody = await finalRes.text();
    const retry = await aiFetch('/images/generations', {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: '1024x1024',
      }),
    });
    if (!retry.ok) {
      const retryBody = await retry.text();
      throw new Error(
        `封面生成失败 (${retry.status}): ${retryBody || firstBody}`,
      );
    }
    finalRes = retry;
  }

  const data = (await finalRes.json()) as {
    data?: Array<{
      b64_json?: string;
      url?: string;
      revised_prompt?: string;
    }>;
  };

  const item = data.data?.[0];
  if (!item) throw new Error('封面生成结果为空');

  if (item.b64_json) {
    const bytes = Buffer.from(item.b64_json, 'base64');
    await writeCoverBytes(jobId, bytes, '.png');
    return true;
  }

  if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) {
      throw new Error(`封面下载失败 (${imgRes.status})`);
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const mime = imgRes.headers.get('content-type');
    const ext = extFromMime(mime) || extFromUrl(item.url);
    await writeCoverBytes(jobId, buf, ext);
    return true;
  }

  throw new Error('封面生成结果缺少 b64_json/url');
}

/**
 * 若配置了图片模型则尝试生成封面；失败只记日志，回落渐变封面。
 */
export async function maybeGeneratePodcastCover(
  jobId: string,
  podcast: PodcastContent,
): Promise<PodcastContent> {
  if (!hasImageModel() || !hasApiKey()) {
    return { ...podcast, hasCoverImage: false };
  }

  try {
    const ok = await generatePodcastCover(jobId, podcast);
    return { ...podcast, hasCoverImage: ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cover] job=${jobId} generate failed:`, msg);
    return { ...podcast, hasCoverImage: false };
  }
}
