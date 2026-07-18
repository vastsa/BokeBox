import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs/promises';
import { jobPaths } from '../utils/paths.js';
import {
  ensureDir,
  removeIfExists,
  removeDirIfExists,
  pathExists,
} from '../utils/fs.js';
import {
  createJob,
  deleteJob,
  getJob,
  isPubliclyListenable,
  listJobsPage,
  type JobListFilter,
  toListPublic,
  toPublic,
  updateJob,
} from '../services/jobStore.js';
import { parsePageQuery } from '../utils/pagination.js';
import {
  appendJobToAlbum,
  getAlbum,
  removeJobFromAllAlbums,
} from '../services/albumStore.js';
import { getRequestUser } from './auth.js';
import {
  assertPipelinePrereqs,
  buildRetryPatch,
  isPipelineFromStep,
  resolveDefaultFromStep,
  runPipeline,
} from '../services/pipeline.js';
import {
  ALLOWED_MEDIA_EXT,
  detectSourceKind,
  extractReadableText,
  isValidHttpUrl,
} from '../services/urlImporter.js';
import {
  ensureBuiltinSourcePlugins,
  getSourcePluginRegistration,
  isSourcePluginEnabled,
  refreshExternalSourcePlugins,
} from '../sources/index.js';
import { getActiveTtsUiMeta } from '../services/ttsSynthesizer.js';
import {
  listAsrProviderDescriptors,
  listTtsProviderDescriptors,
} from '../providers/index.js';
import type {
  Job,
  PipelineFromStep,
  ScriptPromptOptions,
  TtsMode,
  TtsOptions,
} from '../types/job.js';
import {
  getCoverPromptTemplateStored,
  getGlobalScriptPrompt,
  getGlobalTtsOptions,
  normalizeTtsOptions,
  setCoverPromptTemplate,
  setGlobalScriptPrompt,
  setGlobalTtsOptions,
} from '../services/settingsStore.js';
import {
  normalizeScriptPrompt,
  summarizeScriptPrompt,
} from '../services/scriptPrompt.js';
import { deleteListenRecord } from '../services/listenStore.js';
import {
  getAsrModel,
  getAsrProviderId,
  getBaseUrl,
  getChatModel,
  getDefaultTtsVoice,
  getImageModel,
  getTtsModel,
  getTtsProviderId,
  getVoiceDesignModel,
  hasApiKey,
} from '../utils/aiConfig.js';
import {
  COVER_PROMPT_VARIABLES,
  DEFAULT_COVER_PROMPT_TEMPLATE,
  findCoverFile,
} from '../services/coverGenerator.js';
import {
  parseCoverImageSize,
  resolveCoverDelivery,
} from '../services/imageOptimize.js';
import {
  getAllAiPromptBundles,
  getAiPromptBundle,
  saveAiPromptTemplate,
  type AiPromptKind,
} from '../services/aiPromptTemplates.js';
import {
  errorMessage,
  getRequestLocale,
  isContentLocale,
  kindLabel as i18nKindLabel,
  resolveContentLocale,
  t,
  type Locale,
} from '../i18n/index.js';
import { getContentLocale } from '../services/settingsStore.js';

/** 任务内容语言：请求指定优先，否则回落全局 contentLocale */
function resolveJobLocale(raw: unknown): Locale {
  if (isContentLocale(raw)) return raw;
  const s = String(raw ?? '').trim();
  if (isContentLocale(s)) return s;
  return getContentLocale();
}

/** 本地上传：视频 / 音频 / 文本（与 URL 导入一致） */
const ALLOWED_EXT = ALLOWED_MEDIA_EXT;

const MAX_FILE_SIZE = 500 * 1024 * 1024;

function parseTtsFromBody(fields: Record<string, unknown>): TtsOptions {
  // 优先读取整包 tts JSON，避免 multipart 漏字段时回落 default
  const fromJson = parseTtsJsonField(fields.tts);
  const modeRaw = String(
    fromJson?.mode || fields.ttsMode || fields.mode || 'default',
  );
  // 兼容历史 sing：映射为自然口播
  const mode = normalizeMode(modeRaw);
  const voiceRaw = String(
    fromJson?.voice || fields.voice || '',
  ).trim();
  return normalizeTts({
    mode,
    voice: voiceRaw || undefined,
    voiceDesign:
      fromJson?.voiceDesign ||
      (fields.voiceDesign ? String(fields.voiceDesign) : undefined),
    styleTags:
      fromJson?.styleTags ||
      parseStyleTagsField(fields.styleTags ?? fields.styleTag),
  });
}

/** 合法模式归一；历史 sing 回落自然口播 */
function normalizeMode(raw?: string | null): TtsMode {
  const m = String(raw || 'default').trim();
  if (m === 'voicedesign') return 'voicedesign';
  // default / sing / 其他未知值 → 自然口播
  return 'default';
}

function parseTtsJsonField(raw: unknown): Partial<TtsOptions> | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Partial<TtsOptions>;
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<TtsOptions>;
    }
  } catch {
    // ignore invalid json
  }
  return undefined;
}

function parseStyleTagsField(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  if (Array.isArray(raw)) {
    const tags = raw.map((x) => String(x).trim()).filter(Boolean);
    return tags.length ? tags : undefined;
  }
  const text = String(raw).trim();
  if (!text) return undefined;
  // 兼容 JSON 数组字符串或空格/逗号分隔
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text) as unknown;
      if (Array.isArray(arr)) {
        const tags = arr.map((x) => String(x).trim()).filter(Boolean);
        return tags.length ? tags : undefined;
      }
    } catch {
      // fallthrough
    }
  }
  const tags = text.split(/[\s,，、|]+/).map((s) => s.trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

/** 统一归一化 TTS 配置：default 强制预置音色；不支持风格指令 */
function normalizeTts(tts?: Partial<TtsOptions> | null): TtsOptions {
  return normalizeTtsOptions(tts);
}

/**
 * 解析任务级 TTS：
 * - ttsSourceMode=global（默认）：快照当前全局音色
 * - ttsSourceMode=custom：使用请求体自定义
 */
function resolveTtsForJob(
  fields: Record<string, unknown>,
  explicit?: Partial<TtsOptions> | null,
): TtsOptions {
  const modeRaw = String(
    fields.ttsSourceMode || fields.ttsConfigMode || 'global',
  )
    .trim()
    .toLowerCase();
  const sourceMode = modeRaw === 'custom' ? 'custom' : 'global';

  if (sourceMode === 'custom') {
    if (explicit != null) return normalizeTts(explicit);
    return parseTtsFromBody(fields);
  }

  // 全局：任务创建时快照，保证重跑稳定
  return normalizeTts(getGlobalTtsOptions());
}


/** 解析 multipart / JSON 中的口播提示词干预 */
function parseScriptPromptField(raw: unknown): ScriptPromptOptions | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeScriptPrompt(raw as Partial<ScriptPromptOptions>);
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeScriptPrompt(parsed as Partial<ScriptPromptOptions>);
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * 解析任务级口播提示词：
 * - mode=global（默认）：快照当前全局设置
 * - mode=custom：使用请求体自定义；空则表示无干预
 */
function resolveScriptPromptForJob(
  fields: Record<string, unknown>,
  explicit?: ScriptPromptOptions | Partial<ScriptPromptOptions> | null,
): ScriptPromptOptions | undefined {
  const modeRaw = String(
    fields.scriptPromptMode || fields.promptMode || 'global',
  )
    .trim()
    .toLowerCase();
  const mode = modeRaw === 'custom' ? 'custom' : 'global';

  if (mode === 'custom') {
    const custom =
      explicit != null
        ? normalizeScriptPrompt(explicit)
        : parseScriptPromptField(fields.scriptPrompt);
    return custom;
  }

  // 全局：任务创建时快照，保证重跑稳定
  return normalizeScriptPrompt(getGlobalScriptPrompt());
}

function mediaTypeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/**
 * 支持 HTTP Range，浏览器音视频才能正常快进/拖动进度条。
 */
async function sendMedia(
  req: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
  filePath: string,
  filename: string,
  download: boolean,
) {
  const stat = await fs.stat(filePath);
  const size = stat.size;
  const type = mediaTypeOf(filePath);

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', type);
  reply.header(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  // 有 query v= 做缓存破坏时，图片可长缓存；音频保持 1h
  const isImage = type.startsWith('image/');
  reply.header(
    'Cache-Control',
    isImage ? 'public, max-age=604800, immutable' : 'public, max-age=3600',
  );

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }

    let start = m[1] ? Number(m[1]) : 0;
    let end = m[2] ? Number(m[2]) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || start >= size) {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }
    end = Math.min(end, size - 1);
    const chunkSize = end - start + 1;

    reply.code(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
    reply.header('Content-Length', chunkSize);
    return reply.send(createReadStream(filePath, { start, end }));
  }

  reply.header('Content-Length', size);
  return reply.send(createReadStream(filePath));
}

async function attachJobToAlbumIfNeeded(
  albumIdRaw: unknown,
  jobId: string,
): Promise<void> {
  const albumId = String(albumIdRaw || '').trim();
  if (!albumId) return;
  const album = await getAlbum(albumId);
  if (!album) {
    console.warn(`[album] attach skipped, album not found: ${albumId}`);
    return;
  }
  await appendJobToAlbum(albumId, jobId);
}

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const ttsUi = getActiveTtsUiMeta();
    return {
      ok: true,
      demoMode: !hasApiKey(),
      baseUrl: getBaseUrl(),
      models: {
        chat: getChatModel(),
        asr: getAsrModel(),
        tts: getTtsModel(),
        voiceDesign: getVoiceDesignModel(),
        image: getImageModel() || undefined,
      },
      providers: {
        asr: getAsrProviderId(),
        tts: getTtsProviderId(),
        asrList: listAsrProviderDescriptors().filter((p) => p.id !== 'demo'),
        ttsList: listTtsProviderDescriptors().filter((p) => p.id !== 'demo'),
      },
      ttsModes: ttsUi.ttsModes,
      presetVoices: ttsUi.presetVoices,
      defaultVoice: getDefaultTtsVoice(),
      speechStyleTags: ttsUi.speechStyleTags,
      audioTagExamples: ttsUi.audioTagExamples,
      ttsCapabilities: {
        providerId: ttsUi.providerId,
        providerName: ttsUi.providerName,
        supportsStyleTags: ttsUi.supportsStyleTags,
        supportsVoiceDesign: ttsUi.supportsVoiceDesign,
      },
      time: new Date().toISOString(),
    };
  });


  // ── 全局口播提示词设置 ──
  app.get('/settings/script-prompt', async () => {
    const scriptPrompt = getGlobalScriptPrompt();
    return {
      scriptPrompt,
      summary: summarizeScriptPrompt(scriptPrompt),
    };
  });

  app.put<{ Body: { scriptPrompt?: ScriptPromptOptions | null } }>(
    '/settings/script-prompt',
    async (req) => {
      const scriptPrompt = setGlobalScriptPrompt(req.body?.scriptPrompt);
      return {
        scriptPrompt,
        summary: summarizeScriptPrompt(scriptPrompt),
      };
    },
  );

  // ── 全局 TTS 音色设置 ──
  app.get('/settings/tts', async () => {
    const tts = getGlobalTtsOptions();
    return { tts };
  });

  // ── 全局封面提示词 ──
  app.get('/settings/cover-prompt', async () => {
    const stored = getCoverPromptTemplateStored();
    return {
      template: stored || DEFAULT_COVER_PROMPT_TEMPLATE,
      stored,
      defaultTemplate: DEFAULT_COVER_PROMPT_TEMPLATE,
      isCustom: Boolean(stored),
      variables: COVER_PROMPT_VARIABLES,
    };
  });

  app.put<{ Body: { template?: string | null; reset?: boolean } }>(
    '/settings/cover-prompt',
    async (req) => {
      const reset = Boolean(req.body?.reset);
      const incoming = String(req.body?.template ?? '').trim();
      // 与默认模板完全一致时不落库，保持「系统默认」状态
      const stored = reset || incoming === DEFAULT_COVER_PROMPT_TEMPLATE.trim()
        ? setCoverPromptTemplate('')
        : setCoverPromptTemplate(req.body?.template);
      return {
        template: stored || DEFAULT_COVER_PROMPT_TEMPLATE,
        stored,
        defaultTemplate: DEFAULT_COVER_PROMPT_TEMPLATE,
        isCustom: Boolean(stored),
        variables: COVER_PROMPT_VARIABLES,
      };
    },
  );


  // ── AI 系统提示词（口播 / 改写 / 闪卡） ──
  app.get('/settings/ai-prompts', async () => {
    return { prompts: getAllAiPromptBundles() };
  });

  app.get<{ Params: { kind: string } }>(
    '/settings/ai-prompts/:kind',
    async (req, reply) => {
      const kind = req.params.kind as AiPromptKind;
      if (
        kind !== 'podcastSystem' &&
        kind !== 'rewriteSystem' &&
        kind !== 'flashcardSystem'
      ) {
        return reply.code(400).send({ error: 'unknown prompt kind' });
      }
      return getAiPromptBundle(kind);
    },
  );

  app.put<{
    Params: { kind: string };
    Body: { template?: string | null; reset?: boolean };
  }>('/settings/ai-prompts/:kind', async (req, reply) => {
    const kind = req.params.kind as AiPromptKind;
    if (
      kind !== 'podcastSystem' &&
      kind !== 'rewriteSystem' &&
      kind !== 'flashcardSystem'
    ) {
      return reply.code(400).send({ error: 'unknown prompt kind' });
    }
    return saveAiPromptTemplate(kind, {
      template: req.body?.template,
      reset: req.body?.reset,
    });
  });

  app.put<{ Body: { tts?: TtsOptions | null } }>(
    '/settings/tts',
    async (req) => {
      const tts = setGlobalTtsOptions(req.body?.tts);
      return { tts };
    },
  );

  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      q?: string;
      filter?: string;
      includeFacets?: string;
    };
  }>('/jobs', async (req) => {
    const page = parsePageQuery(req.query, { pageSize: 20 });
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const rawFilter = String(req.query.filter || 'all').trim();
    const allowed: JobListFilter[] = [
      'all',
      'active',
      'published',
      'draft',
      'failed',
      'done',
    ];
    const filter = (allowed.includes(rawFilter as JobListFilter)
      ? rawFilter
      : 'all') as JobListFilter;
    const result = await listJobsPage({
      ...page,
      q,
      filter,
      includeFacets: req.query.includeFacets !== 'false',
    });
    return {
      // 列表只返回卡片摘要；详情 / 写操作响应仍走 toPublic 全量字段。
      jobs: result.items.map(toListPublic),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      facets: result.facets,
    };
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
    return { job: toPublic(job) };
  });

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
    '/jobs/:id/audio',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
      // 游客只能拉取已发布播客音频，防止未发布草稿被直链访问
      if (!getRequestUser(req) && !isPubliclyListenable(job)) {
        return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
      }
      const paths = jobPaths(job.id);
      const audioPath = job.podcastAudioPath || paths.podcastWav;
      const alt = paths.podcastMp3;
      const finalPath = (await pathExists(audioPath))
        ? audioPath
        : (await pathExists(alt))
          ? alt
          : job.audioPath;
      if (!finalPath || !(await pathExists(finalPath))) {
        return reply.code(404).send({ error: t(getRequestLocale(req), 'job.podcastAudioMissing') });
      }
      const filename = `${(job.podcast?.title || job.title || job.id).replace(/[\\/:*?"<>|]/g, '_')}${path.extname(finalPath)}`;
      return sendMedia(req, reply, finalPath, filename, req.query.download === '1');
    },
  );

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
    '/jobs/:id/source-audio',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job?.audioPath || !(await pathExists(job.audioPath))) {
        return reply.code(404).send({ error: t(getRequestLocale(req), 'job.sourceAudioMissing') });
      }
      return sendMedia(
        req,
        reply,
        job.audioPath,
        `${job.id}-source${path.extname(job.audioPath)}`,
        req.query.download === '1',
      );
    },
  );

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
    '/jobs/:id/video',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job?.videoPath || !(await pathExists(job.videoPath))) {
        return reply.code(404).send({ error: t(getRequestLocale(req), 'job.videoMissing') });
      }
      return sendMedia(
        req,
        reply,
        job.videoPath,
        job.originalFilename || `${job.id}${path.extname(job.videoPath)}`,
        req.query.download === '1',
      );
    },
  );

  /** AI 生成的播客封面图（?size=thumb|sm|md|full；页面默认 sm，下载 full） */
  app.get<{
    Params: { id: string };
    Querystring: { download?: string; size?: string };
  }>(
    '/jobs/:id/cover',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
      // 游客只能拉取已发布封面
      if (!getRequestUser(req) && !isPubliclyListenable(job)) {
        return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
      }

      const download = req.query.download === '1';
      // 下载强制原图档；页面浏览默认 sm 加速首屏
      const size = download
        ? 'full'
        : parseCoverImageSize(req.query.size, 'sm');
      const delivered = await resolveCoverDelivery(jobPaths(job.id).dir, size);
      if (!delivered) {
        return reply.code(404).send({ error: t(getRequestLocale(req), 'job.coverMissing') });
      }

      const baseName = (job.podcast?.title || job.title || job.id).replace(
        /[\\/:*?"<>|]/g,
        '_',
      );
      const ext = path.extname(delivered.filePath) || '.webp';
      const sizeTag = delivered.size === 'full' ? '' : `-${delivered.size}`;
      const filename = `${baseName}-cover${sizeTag}${ext}`;
      return sendMedia(req, reply, delivered.filePath, filename, download);
    },
  );

  app.get<{ Params: { id: string } }>('/jobs/:id/transcript', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
    const filePath = jobPaths(job.id).transcript;
    const text =
      job.transcript ||
      ((await pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : '');
    if (!text) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.transcriptMissing') });
    return { transcript: text };
  });

  app.post('/jobs', async (req, reply) => {
    // 用 parts() 顺序消费全部字段+文件，避免 file 在前时字段丢失
    const fields: Record<string, unknown> = {};
    let filePart: {
      filename: string;
      mimetype: string;
      file: NodeJS.ReadableStream & { truncated?: boolean };
    } | null = null;
    let videoPath = '';
    let id = '';


    const parts = req.parts({ limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
    for await (const part of parts) {
      if (part.type === 'file') {
        if (filePart) {
          // 忽略多余文件
          part.file.resume();
          continue;
        }
        const ext = path.extname(part.filename || '').toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
          part.file.resume();
          return reply.code(400).send({
            error: t(getRequestLocale(req), 'job.unsupportedType', { ext: ext || 'unknown' }),
            allowed: [...ALLOWED_EXT],
          });
        }
        id = nanoid(12);
        const paths = jobPaths(id);
        await ensureDir(paths.dir);
        videoPath = paths.source(ext);
        await pipeline(part.file, createWriteStream(videoPath));
        if (part.file.truncated) {
          await removeIfExists(videoPath);
          return reply.code(413).send({ error: t(getRequestLocale(req), 'job.fileTooLarge') });
        }
        filePart = {
          filename: part.filename,
          mimetype: part.mimetype,
          file: part.file,
        };
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    if (!filePart || !videoPath || !id) {
      return reply.code(400).send({ error: t(getRequestLocale(req), 'job.uploadRequired') });
    }

    const now = new Date().toISOString();
    const stat = await fs.stat(videoPath);
    const published =
      fields.published === undefined
        ? true
        : String(fields.published) !== 'false' && fields.published !== false;

    const tts = resolveTtsForJob(fields);
    const scriptPrompt = resolveScriptPromptForJob(fields);
    const safeName = filePart.filename.replace(/[^\w.\u4e00-\u9fa5-]+/g, '_');
    const ext = path.extname(filePart.filename || '').toLowerCase();
    const sourceKind =
      detectSourceKind(filePart.filename, filePart.mimetype) ||
      detectSourceKind(ext, filePart.mimetype) ||
      'video';

    // 本地文本：清洗后写入 transcript，流水线将跳过 ASR
    let transcript: string | undefined;
    let finalSourcePath = videoPath;
    let finalMime = filePart.mimetype || 'application/octet-stream';
    let finalSize = stat.size;

    if (sourceKind === 'text') {
      const raw = await fs.readFile(videoPath, 'utf8');
      const textContent = extractReadableText(raw, filePart.mimetype || ext);
      if (!textContent || textContent.length < 20) {
        await removeIfExists(videoPath);
        return reply.code(400).send({ error: t(getRequestLocale(req), 'job.textTooShort') });
      }
      const paths = jobPaths(id);
      finalSourcePath = paths.source('.txt');
      await fs.writeFile(finalSourcePath, textContent, 'utf8');
      if (finalSourcePath !== videoPath) {
        await removeIfExists(videoPath);
      }
      finalMime = 'text/plain';
      finalSize = Buffer.byteLength(textContent, 'utf8');
      transcript = textContent;
      // 同步落盘，避免仅依赖 DB 字段
      await fs.writeFile(paths.transcript, textContent, 'utf8');
    }

    const job: Job = {
      id,
      title: safeName,
      originalFilename: filePart.filename,
      mimeType: finalMime,
      size: finalSize,
      status: 'queued',
      progress: 5,
      message: t(getRequestLocale(req), 'job.queuedLocal', {
      kind: i18nKindLabel(getRequestLocale(req), sourceKind),
      tts: `${tts.mode}${tts.voice ? ' / ' + tts.voice : ''}`,
    }),
      locale: resolveJobLocale(fields.locale),
      videoPath: finalSourcePath,
      sourceKind,
      transcript,
      tts,
      scriptPrompt,
      published,
      createdAt: now,
      updatedAt: now,
    };

    await createJob(job);
    await attachJobToAlbumIfNeeded(fields.albumId, job.id);
    void runPipeline(id);
    return reply.code(201).send({ job: toPublic(job) });
  });


  /**
   * 从 URL 导入：自动识别视频 / 音频 / 文本并入队处理
   * body: { url, tts?, published? }
   */
  app.post<{
    Body: {
      url?: string;
      /** 指定 Source 插件；缺省自动匹配 */
      pluginId?: string;
      tts?: TtsOptions;
      ttsSourceMode?: 'global' | 'custom';
      published?: boolean;
      albumId?: string;
      title?: string;
      scriptPrompt?: ScriptPromptOptions;
      scriptPromptMode?: 'global' | 'custom';
      locale?: string;
    };
  }>('/jobs/from-url', async (req, reply) => {
    const url = String(req.body?.url || '').trim();
    if (!url) {
      return reply.code(400).send({ error: t(getRequestLocale(req), 'job.urlRequired') });
    }

    const pluginId = String(req.body?.pluginId || '').trim() || undefined;
    const localeMsg = getRequestLocale(req);
    ensureBuiltinSourcePlugins();

    if (pluginId) {
      let reg = getSourcePluginRegistration(pluginId);
      if (!reg) {
        // 可能刚放入目录尚未 rescan
        await refreshExternalSourcePlugins();
        reg = getSourcePluginRegistration(pluginId);
      }
      if (!reg) {
        return reply.code(400).send({
          error: t(localeMsg, 'job.pluginNotFound', { id: pluginId }),
        });
      }
      if (!reg.plugin || reg.loadError) {
        const detail = reg.loadError ? ` (${reg.loadError})` : '';
        return reply.code(400).send({
          error: t(localeMsg, 'job.pluginUnavailable', {
            id: pluginId,
            detail,
          }),
        });
      }
      if (!isSourcePluginEnabled(pluginId)) {
        return reply.code(400).send({
          error: t(localeMsg, 'job.pluginDisabled', { id: pluginId }),
        });
      }
      if (!reg.plugin.isAvailable()) {
        return reply.code(400).send({
          error: t(localeMsg, 'job.pluginUnavailable', {
            id: pluginId,
            detail: '',
          }),
        });
      }
      // jobId 仅用于 canHandle 形状；正式导入时再写真实 id
      if (
        !reg.plugin.canHandle({
          type: 'url',
          url,
          jobId: 'validate',
          pluginId,
        })
      ) {
        return reply.code(400).send({
          error: t(localeMsg, 'job.pluginCannotHandle', { id: pluginId }),
        });
      }
    } else if (!isValidHttpUrl(url)) {
      // 自动匹配仍要求 http(s)，避免无效输入直接进队列
      return reply.code(400).send({ error: t(localeMsg, 'job.urlInvalid') });
    }

    const tts = resolveTtsForJob(
      {
        ttsSourceMode: req.body?.ttsSourceMode,
        tts: req.body?.tts,
      },
      req.body?.tts,
    );
    const scriptPrompt = resolveScriptPromptForJob(
      {
        scriptPromptMode: req.body?.scriptPromptMode,
        scriptPrompt: req.body?.scriptPrompt,
      },
      req.body?.scriptPrompt,
    );
    const published =
      req.body?.published === undefined ? true : Boolean(req.body.published);
    const id = nanoid(12);
    const now = new Date().toISOString();
    const titleHint =
      String(req.body?.title || '').trim() ||
      (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return t(getRequestLocale(req), 'job.urlImport');
        }
      })();

    // 先创建任务（无源文件），流水线内下载识别
    const job: Job = {
      id,
      title: titleHint,
      originalFilename: url,
      mimeType: 'application/octet-stream',
      size: 0,
      status: 'queued',
      progress: 3,
      message: t(getRequestLocale(req), 'job.queuedUrl', {
      tts: `${tts.mode}${tts.voice ? ' / ' + tts.voice : ''}`,
    }),
      locale: resolveJobLocale(req.body?.locale),
      videoPath: '',
      sourceUrl: url,
      sourcePluginId: pluginId,
      sourceKind: 'video', // 下载后会被覆盖
      tts,
      scriptPrompt,
      published,
      createdAt: now,
      updatedAt: now,
    };

    await createJob(job);
    await attachJobToAlbumIfNeeded(req.body?.albumId, job.id);
    void runPipeline(id);
    return reply.code(201).send({ job: toPublic(job) });
  });

  app.patch<{
    Params: { id: string };
    Body: {
      published?: boolean;
      title?: string;
      tts?: TtsOptions;
      scriptPrompt?: ScriptPromptOptions | null;
      locale?: string;
    };
  }>('/jobs/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
    const patch: Partial<Job> = {};
    if (typeof req.body?.published === 'boolean') patch.published = req.body.published;
    if (req.body?.title) patch.title = req.body.title;
    if (req.body?.tts) patch.tts = normalizeTts({ ...job.tts, ...req.body.tts });
    if (req.body && 'scriptPrompt' in req.body) {
      patch.scriptPrompt = normalizeScriptPrompt(req.body.scriptPrompt) || undefined;
    }
    if (req.body && 'locale' in req.body && req.body.locale != null && req.body.locale !== '') {
      patch.locale = resolveJobLocale(req.body.locale);
    }
    const updated = await updateJob(job.id, patch);
    return { job: updated ? toPublic(updated) : null };
  });

  app.post<{
    Params: { id: string };
    Body: {
      tts?: TtsOptions;
      fromStep?: PipelineFromStep;
      scriptPrompt?: ScriptPromptOptions | null;
      locale?: string;
    };
  }>('/jobs/:id/retry', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
    if (job.status !== 'failed' && job.status !== 'done') {
      return reply.code(400).send({ error: t(getRequestLocale(req), 'job.retryNotAllowed') });
    }

    const fromStep: PipelineFromStep = isPipelineFromStep(req.body?.fromStep)
      ? req.body.fromStep
      : await resolveDefaultFromStep(job);

    try {
      await assertPipelinePrereqs(job, fromStep);
    } catch (err) {
      const locale = getRequestLocale(req);
      return reply.code(400).send({ error: errorMessage(locale, err) });
    }

    const tts = req.body?.tts
      ? normalizeTts({ ...job.tts, ...req.body.tts })
      : normalizeTts(job.tts);
    const scriptPrompt =
      req.body && 'scriptPrompt' in req.body
        ? normalizeScriptPrompt(req.body.scriptPrompt) || undefined
        : job.scriptPrompt;

    // 重跑：请求 locale > 任务已有 locale > 全局 contentLocale
    const locale =
      req.body && 'locale' in req.body && req.body.locale
        ? resolveJobLocale(req.body.locale)
        : resolveJobLocale(job.locale);
    await updateJob(job.id, {
      ...buildRetryPatch(
        job,
        fromStep,
        tts,
        req.body && 'scriptPrompt' in req.body ? scriptPrompt : undefined,
        locale,
      ),
      locale,
    });
    void runPipeline(job.id, { fromStep });
    const latest = await getJob(job.id);
    return { job: latest ? toPublic(latest) : null };
  });

  app.post<{
    Params: { id: string };
    Body: { tts?: TtsOptions };
  }>('/jobs/:id/resynthesize', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
    if (!job.podcast?.script || !job.audioPath) {
      return reply.code(400).send({ error: t(getRequestLocale(req), 'job.resynthMissing') });
    }

    const tts = req.body?.tts ? normalizeTts({ ...job.tts, ...req.body.tts }) : normalizeTts(job.tts);
    await updateJob(job.id, {
      status: 'synthesizing_audio',
      progress: 86,
      message: t(getRequestLocale(req), 'job.resynthRunning'),
      tts,
      error: undefined,
    });

    try {
      const { synthesizePodcastAudio } = await import('../services/ttsSynthesizer.js');
      const { audioPath, demo, mode, voice } = await synthesizePodcastAudio({
        script: job.podcast.script,
        sourceAudioPath: job.audioPath,
        jobId: job.id,
        tts,
      });
      const updated = await updateJob(job.id, {
        status: 'done',
        progress: 100,
        message: demo ? t(getRequestLocale(req), 'job.resynthDoneDemo') : t(getRequestLocale(req), 'job.resynthDone', { tts: `${mode}${voice ? ' / ' + voice : ''}` }),
        podcastAudioPath: audioPath,
      });
      return { job: updated ? toPublic(updated) : null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await updateJob(job.id, {
        status: 'failed',
        progress: 100,
        message: t(getRequestLocale(req), 'job.resynthFailed'),
        error: message,
      });
      return reply.code(500).send({
        error: message,
        job: updated ? toPublic(updated) : null,
      });
    }
  });

  /** 单独重新生成知识闪卡（不重跑整条流水线） */
  app.post<{ Params: { id: string } }>(
    '/jobs/:id/flashcards',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
      if (job.status !== 'failed' && job.status !== 'done') {
        return reply.code(400).send({ error: t(getRequestLocale(req), 'job.flashcardsBusy') });
      }

      const transcript = (job.transcript || '').trim();
      const script = (job.podcast?.script || '').trim();
      if (!transcript && !script) {
        return reply.code(400).send({ error: t(getRequestLocale(req), 'job.flashcardsNoTranscript') });
      }
      if (!job.podcast) {
        return reply.code(400).send({ error: t(getRequestLocale(req), 'job.flashcardsNoScript') });
      }

      await updateJob(job.id, {
        status: 'generating_podcast',
        progress: 74,
        message: t(getRequestLocale(req), 'job.flashcardsRunning'),
        error: undefined,
      });

      try {
        const { generateFlashcards } = await import(
          '../services/flashcardGenerator.js'
        );
        const { flashcards, demo } = await generateFlashcards({
          jobId: job.id,
          transcript: transcript || script,
          sourceTitle: job.originalFilename || job.title,
          podcast: job.podcast,
          locale: resolveJobLocale(job.locale),
        });
        const podcast = { ...job.podcast, flashcards };
        const updated = await updateJob(job.id, {
          status: 'done',
          progress: 100,
          message: demo
            ? t(getRequestLocale(req), 'job.flashcardsDoneDemo', { n: flashcards.length })
            : t(getRequestLocale(req), 'job.flashcardsDone', { n: flashcards.length }),
          podcast,
          title: podcast.title || job.title,
        });
        return { job: updated ? toPublic(updated) : null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 闪卡是附加模块：失败时恢复为 done，避免误伤主任务
        const updated = await updateJob(job.id, {
          status: 'done',
          progress: 100,
          message: t(getRequestLocale(req), 'job.flashcardsFailed'),
          error: message,
        });
        return reply.code(500).send({
          error: message,
          job: updated ? toPublic(updated) : null,
        });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const removed = await deleteJob(req.params.id);
    if (!removed) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });

    // 从所有专辑中移除该任务
    removeJobFromAllAlbums(removed.id);

    // 整目录删除，覆盖源文件/音频/转写/脚本/播客等全部产物
    await removeDirIfExists(jobPaths(removed.id).dir);
    await removeIfExists(removed.videoPath);
    await removeIfExists(removed.audioPath);
    await removeIfExists(removed.podcastAudioPath);
    await deleteListenRecord(removed.id);

    return { ok: true };
  });
}
