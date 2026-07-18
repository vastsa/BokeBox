import path from 'node:path';
import { albumPaths, jobPaths } from '../../utils/paths.js';
import type { PodcastContent } from '../../types/job.js';
import {
  aiFetch,
  getImageModel,
  hasApiKey,
  hasImageModel,
} from '../../utils/aiConfig.js';
import { getCoverPromptTemplateStored } from '../settings/index.js';
import { safeFetch } from '../../utils/ssrf.js';
import {
  findCoverMasterFile,
  writeOptimizedCover,
} from './imageOptimize.js';

/** 封面画幅：9:16 / 3:4 / 1:1 随机，制造列表视觉变化 */
export type CoverAspect = '9:16' | '3:4' | '1:1';

export type CoverFrame = {
  aspect: CoverAspect;
  /** OpenAI 兼容 size 字段 */
  size: string;
  /** 构图提示 */
  compositionHint: string;
  /** 画幅中文描述（日志用） */
  label: string;
};

/**
 * 画幅与尺寸映射
 * - 1:1 → 1024x1024（方图，列表/播放器友好）
 * - 9:16 → 1024x1792（竖屏短视频感，接近 DALL·E 高图）
 * - 3:4 → 1024x1365（竖版海报感；部分网关不认时会回退）
 */
export const COVER_FRAMES: CoverFrame[] = [
  {
    aspect: '1:1',
    size: '1024x1024',
    label: '方形 1:1',
    compositionHint:
      'Square album-tile layout: strong center subject, balanced negative space on all sides, works as a podcast app cover.',
  },
  {
    aspect: '9:16',
    size: '1024x1792',
    label: '竖屏 9:16',
    compositionHint:
      'Tall mobile 9:16 frame: full-height vertical storytelling, subject in upper-middle third, story-ready portrait canvas without text.',
  },
  {
    aspect: '3:4',
    size: '1024x1365',
    label: '竖版 3:4',
    compositionHint:
      'Vertical poster 3:4 frame: taller canvas, subject in upper-middle third, elegant vertical flow, poster/magazine energy without text.',
  },
];

/** 尺寸不被网关接受时的回退链（同画幅优先，最后 1:1） */
const SIZE_FALLBACKS: Record<CoverAspect, string[]> = {
  '1:1': ['1024x1024'],
  '9:16': ['1024x1792', '1080x1920', '768x1344', '1024x1536', '1024x1024'],
  '3:4': ['1024x1365', '1024x1536', '768x1024', '1024x1792', '1024x1024'],
};

export function pickRandomCoverFrame(seed?: string): CoverFrame {
  // 有 seed 时用稳定哈希，避免同任务重试完全漂移；无 seed 则真随机
  if (seed && seed.trim()) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return COVER_FRAMES[h % COVER_FRAMES.length];
  }
  const idx = Math.floor(Math.random() * COVER_FRAMES.length);
  return COVER_FRAMES[idx]!;
}

export function resolveCoverPath(jobId: string, preferredExt?: string): string {
  const dir = jobPaths(jobId).dir;
  if (preferredExt) {
    const ext = preferredExt.startsWith('.') ? preferredExt : `.${preferredExt}`;
    return path.join(dir, `cover${ext}`);
  }
  return path.join(dir, 'cover.webp');
}

/** 查找任务目录下已有封面（主图，不含缩略图） */
export async function findCoverFile(jobId: string): Promise<string | null> {
  return findCoverMasterFile(jobPaths(jobId).dir);
}

function cleanText(raw: unknown, max = 200): string {
  return String(raw || '')
    .replace(/[`*_#>\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** 从标题去掉常见节目前缀，提炼可画的主题词 */
function visualTitle(title: string): string {
  return (
    cleanText(title, 72)
      .replace(/^【[^】]*】\s*/u, '')
      .replace(/^\[[^\]]*\]\s*/u, '')
      .replace(/^(播客|podcast|episode)\s*[:：·-]\s*/i, '')
      .trim() || 'Thoughtful podcast episode'
  );
}

/** 从 outline / tags 拼视觉线索，避免把整段摘要塞进 prompt */
function visualMotifs(podcast: PodcastContent): string {
  const fromOutline = (podcast.outline || [])
    .map((s) => cleanText(s?.title, 28))
    .filter(Boolean)
    .slice(0, 4);
  const fromTags = (podcast.tags || [])
    .map((t) => cleanText(t, 20))
    .filter(Boolean)
    .slice(0, 5);
  const motifs = [...fromOutline, ...fromTags];
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const m of motifs) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(m);
  }
  return uniq.slice(0, 6).join(', ');
}

/** 模板可用变量（设置页展示） */
export const COVER_PROMPT_VARIABLES: Array<{
  key: string;
  label: string;
  sample: string;
}> = [
  { key: 'title', label: '节目标题（已清洗前缀）', sample: '从视频到可收听的内容' },
  { key: 'summary', label: '节目摘要', sample: '本期提炼核心观点并给出行动建议' },
  { key: 'motifs', label: '视觉母题（大纲/标签）', sample: '内容复用, 口播脚本' },
  { key: 'hostIntro', label: '主持人导语/语气', sample: '通勤向精华播客' },
  { key: 'aspect', label: '画幅比例', sample: '1:1' },
  { key: 'size', label: '生成尺寸', sample: '1024x1024' },
  { key: 'compositionHint', label: '该画幅的构图说明', sample: 'Square album-tile layout…' },
];

/**
 * 默认封面提示词模板。
 * 可用 {{title}} {{summary}} {{motifs}} {{hostIntro}} {{aspect}} {{size}} {{compositionHint}}
 */
export const DEFAULT_COVER_PROMPT_TEMPLATE = [
  'Podcast cover artwork about: "{{title}}".',
  'Core idea (visual mood only, never render as text): {{summary}}',
  'Key visual motifs / symbols to hint at: {{motifs}}.',
  'Tone hint: {{hostIntro}}',
  '',
  'FORMAT (hard requirements):',
  '- Aspect ratio MUST be {{aspect}} (canvas size target {{size}}).',
  '- {{compositionHint}}',
  '- Full-bleed artwork edge-to-edge; no borders, no frames, no polaroid edges, no letterboxing/pillarboxing bars.',
  '- Designed as a modern podcast cover that still looks strong when cropped or shown small.',
  '',
  'COMPOSITION:',
  '- One strong primary focal subject; secondary elements soft and sparse.',
  '- Keep important content away from extreme edges (safe area ~8%).',
  '- Readable at small thumbnail sizes; avoid tiny details and dense clutter.',
  '- Depth via soft atmosphere / light falloff; main subject stays sharp.',
  '',
  'STYLE & LOOK:',
  '- Premium editorial illustration or stylized 3D render (not raw photo dump).',
  '- Cohesive limited color palette, rich but clean; soft cinematic lighting.',
  '- Contemporary high-signal aesthetic (top podcast charts / design awards vibe).',
  '- High contrast subject so it pops on both light and dark UI backgrounds.',
  '',
  'STRICT NEGATIVES (do not include):',
  '- Any text, letters, numbers, Chinese characters, titles, captions, subtitles.',
  '- Logos, watermarks, brand marks, QR codes, UI chrome, buttons, progress bars.',
  '- Photorealistic faces of real people / celebrities / identifiable individuals.',
  '- NSFW, gore, political propaganda, screenshots, document pages, slides.',
  '- Multiple unrelated scenes stitched together; messy collage; low-res artifacts.',
  '- Wrong aspect ratio, black bars, or empty padded borders to fake the ratio.',
].join('\n');

export type CoverPromptVars = Record<string, string>;

/** 从播客内容 + 画幅构造模板变量 */
export function buildCoverPromptVars(
  podcast: PodcastContent,
  frame: CoverFrame,
): CoverPromptVars {
  return {
    title: visualTitle(podcast.title || 'Podcast'),
    summary: cleanText(podcast.summary, 160),
    motifs: visualMotifs(podcast),
    hostIntro: cleanText(podcast.hostIntro, 80),
    aspect: frame.aspect,
    size: frame.size,
    compositionHint: frame.compositionHint,
  };
}

/** 渲染 {{var}} 模板；清理多余空行 */
export function renderCoverPromptTemplate(
  template: string,
  vars: CoverPromptVars,
): string {
  const src = (template || '').trim() || DEFAULT_COVER_PROMPT_TEMPLATE;
  const rendered = src.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
  return rendered
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 合成最终图片 prompt：优先使用后台配置的模板，空则回落默认。
 */
export function buildCoverPrompt(
  podcast: PodcastContent,
  frame: CoverFrame,
  template?: string | null,
): string {
  const vars = buildCoverPromptVars(podcast, frame);
  return renderCoverPromptTemplate(template ?? DEFAULT_COVER_PROMPT_TEMPLATE, vars);
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
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  } catch {
    // ignore
  }
  return '.png';
}

async function writeCoverBytes(
  jobId: string,
  bytes: Buffer,
  ext: string,
): Promise<string> {
  const dir = jobPaths(jobId).dir;
  const { masterPath, optimized } = await writeOptimizedCover(dir, bytes, ext);
  if (optimized) {
    console.info(`[cover] job=${jobId} optimized webp + thumbnails`);
  }
  return masterPath;
}

function isLikelySizeError(status: number, body: string): boolean {
  if (status === 400 || status === 422) {
    const t = body.toLowerCase();
    return (
      t.includes('size') ||
      t.includes('dimension') ||
      t.includes('resolution') ||
      t.includes('aspect') ||
      t.includes('invalid')
    );
  }
  return false;
}

async function requestCoverImage(input: {
  model: string;
  prompt: string;
  size: string;
  withResponseFormat: boolean;
}): Promise<Response> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    n: 1,
    size: input.size,
  };
  if (input.withResponseFormat) {
    body.response_format = 'b64_json';
  }
  return aiFetch('/images/generations', {
    method: 'POST',
    body: JSON.stringify(body),
  }, 'image');
}

/**
 * 调用 OpenAI 兼容图片接口生成封面。
 * 画幅在 9:16 / 3:4 / 1:1 中随机；尺寸不被接受时按画幅回退。
 */
export async function generatePodcastCover(
  jobId: string,
  podcast: PodcastContent,
): Promise<boolean> {
  if (!hasApiKey('image') || !hasImageModel()) return false;

  const model = getImageModel();
  // 同任务标题作弱稳定种子，重跑仍有一定随机感（再叠一层 random）
  const base = pickRandomCoverFrame(
    `${jobId}:${podcast.title || ''}:${Math.random().toString(36).slice(2, 8)}`,
  );
  const sizes = SIZE_FALLBACKS[base.aspect] || [base.size];
  const template = getCoverPromptTemplateStored() || DEFAULT_COVER_PROMPT_TEMPLATE;

  let lastError = '';
  let finalRes: Response | null = null;
  let usedSize = sizes[0]!;

  for (const size of sizes) {
    usedSize = size;
    // 先带 b64，失败再去 response_format
    let res = await requestCoverImage({
      model,
      prompt: buildCoverPrompt(podcast, { ...base, size }, template),
      size,
      withResponseFormat: true,
    });

    if (!res.ok) {
      const body = await res.text();
      lastError = body;
      // 尺寸问题 → 试下一个 size
      if (isLikelySizeError(res.status, body)) {
        console.warn(
          `[cover] job=${jobId} size=${size} rejected, try fallback`,
        );
        continue;
      }
      // 其它错误：去掉 response_format 再试同尺寸一次
      res = await requestCoverImage({
        model,
        prompt: buildCoverPrompt(podcast, { ...base, size }, template),
        size,
        withResponseFormat: false,
      });
      if (!res.ok) {
        lastError = await res.text();
        if (isLikelySizeError(res.status, lastError)) {
          console.warn(
            `[cover] job=${jobId} size=${size} rejected (retry), try fallback`,
          );
          continue;
        }
        throw new Error(`封面生成失败 (${res.status}): ${lastError}`);
      }
    }

    finalRes = res;
    break;
  }

  if (!finalRes) {
    throw new Error(
      `封面生成失败：画幅 ${base.aspect} 无可用尺寸。${lastError.slice(0, 200)}`,
    );
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

  console.info(
    `[cover] job=${jobId} aspect=${base.aspect} size=${usedSize} ok`,
  );

  if (item.b64_json) {
    const bytes = Buffer.from(item.b64_json, 'base64');
    await writeCoverBytes(jobId, bytes, '.png');
    return true;
  }

  if (item.url) {
    const imgRes = await safeFetch(item.url);
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
  if (!hasImageModel() || !hasApiKey('image')) {
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

// ---------- 专辑专属封面 ----------

export async function findAlbumCoverFile(albumId: string): Promise<string | null> {
  return findCoverMasterFile(albumPaths(albumId).dir);
}

async function writeAlbumCoverBytes(
  albumId: string,
  bytes: Buffer,
  ext: string,
): Promise<string> {
  const dir = albumPaths(albumId).dir;
  const { masterPath, optimized } = await writeOptimizedCover(dir, bytes, ext);
  if (optimized) {
    console.info(`[album-cover] album=${albumId} optimized webp + thumbnails`);
  }
  return masterPath;
}

/** 把专辑元信息映射为封面生成用的 PodcastContent 形状 */
function albumAsPodcastContent(input: {
  title: string;
  summary?: string;
}): PodcastContent {
  return {
    title: input.title,
    summary: (input.summary || '').trim() || input.title,
    tags: ['album', 'series', '播客专辑'],
    hostIntro: 'Album series cover',
    outline: [],
    script: '',
    showNotes: '',
    estimatedMinutes: 0,
  };
}

/**
 * 生成专辑专属 AI 封面（固定优先 1:1，系列感更强）
 */
export async function generateAlbumCover(
  albumId: string,
  input: { title: string; summary?: string },
): Promise<boolean> {
  if (!hasApiKey('image') || !hasImageModel()) return false;

  const model = getImageModel();
  // 专辑封面优先方形，便于网格展示
  const base =
    COVER_FRAMES.find((f) => f.aspect === '1:1') || pickRandomCoverFrame(albumId);
  const sizes = SIZE_FALLBACKS[base.aspect] || [base.size];
  const template = getCoverPromptTemplateStored() || DEFAULT_COVER_PROMPT_TEMPLATE;
  const podcast = albumAsPodcastContent(input);

  let lastError = '';
  let finalRes: Response | null = null;
  let usedSize = sizes[0]!;

  for (const size of sizes) {
    usedSize = size;
    let res = await requestCoverImage({
      model,
      prompt: buildCoverPrompt(podcast, { ...base, size }, template),
      size,
      withResponseFormat: true,
    });

    if (!res.ok) {
      const body = await res.text();
      lastError = body;
      if (isLikelySizeError(res.status, body)) {
        console.warn(
          `[album-cover] album=${albumId} size=${size} rejected, try fallback`,
        );
        continue;
      }
      res = await requestCoverImage({
        model,
        prompt: buildCoverPrompt(podcast, { ...base, size }, template),
        size,
        withResponseFormat: false,
      });
      if (!res.ok) {
        lastError = await res.text();
        if (isLikelySizeError(res.status, lastError)) {
          console.warn(
            `[album-cover] album=${albumId} size=${size} rejected (retry), try fallback`,
          );
          continue;
        }
        throw new Error(`专辑封面生成失败 (${res.status}): ${lastError}`);
      }
    }

    finalRes = res;
    break;
  }

  if (!finalRes) {
    throw new Error(
      `专辑封面生成失败：画幅 ${base.aspect} 无可用尺寸。${lastError.slice(0, 200)}`,
    );
  }

  const data = (await finalRes.json()) as {
    data?: Array<{
      b64_json?: string;
      url?: string;
    }>;
  };
  const item = data.data?.[0];
  if (!item) throw new Error('专辑封面生成结果为空');

  console.info(
    `[album-cover] album=${albumId} aspect=${base.aspect} size=${usedSize} ok`,
  );

  if (item.b64_json) {
    const bytes = Buffer.from(item.b64_json, 'base64');
    await writeAlbumCoverBytes(albumId, bytes, '.png');
    return true;
  }
  if (item.url) {
    const imgRes = await safeFetch(item.url);
    if (!imgRes.ok) {
      throw new Error(`专辑封面下载失败 (${imgRes.status})`);
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const mime = imgRes.headers.get('content-type');
    const ext = extFromMime(mime) || extFromUrl(item.url);
    await writeAlbumCoverBytes(albumId, buf, ext);
    return true;
  }
  throw new Error('专辑封面生成结果缺少 b64_json/url');
}

export async function maybeGenerateAlbumCover(
  albumId: string,
  input: { title: string; summary?: string },
): Promise<boolean> {
  if (!hasImageModel() || !hasApiKey('image')) return false;
  try {
    return await generateAlbumCover(albumId, input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[album-cover] album=${albumId} generate failed:`, msg);
    return false;
  }
}
