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
  listJobs,
  toPublic,
  updateJob,
} from '../services/jobStore.js';
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
  kindLabel,
} from '../services/urlImporter.js';
import {
  AUDIO_TAG_EXAMPLES,
  PRESET_VOICES,
  resolvePresetVoice,
  SPEECH_STYLE_TAG_PRESETS,
  TTS_MODE_META,
} from '../services/ttsSynthesizer.js';
import type {
  Job,
  PipelineFromStep,
  ScriptPromptOptions,
  TtsMode,
  TtsOptions,
} from '../types/job.js';
import {
  getGlobalScriptPrompt,
  setGlobalScriptPrompt,
} from '../services/settingsStore.js';
import {
  normalizeScriptPrompt,
  summarizeScriptPrompt,
} from '../services/scriptPrompt.js';
import { deleteListenRecord } from '../services/listenStore.js';
import {
  getAsrModel,
  getBaseUrl,
  getChatModel,
  getDefaultTtsVoice,
  getTtsModel,
  getVoiceDesignModel,
  hasApiKey,
} from '../utils/aiConfig.js';

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
  const mode = normalizeMode(tts?.mode ? String(tts.mode) : 'default');
  const styleTags = parseStyleTagsField(
    (tts as { styleTags?: unknown } | null | undefined)?.styleTags,
  );
  return {
    mode,
    voice:
      mode === 'voicedesign'
        ? undefined
        : resolvePresetVoice(tts?.voice ? String(tts.voice) : undefined),
    voiceDesign: tts?.voiceDesign ? String(tts.voiceDesign) : undefined,
    styleTags: mode === 'voicedesign' ? undefined : styleTags,
  };
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
  // 允许前端媒体缓存，减少重复拉流
  reply.header('Cache-Control', 'public, max-age=3600');

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

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    ok: true,
    demoMode: !hasApiKey(),
    baseUrl: getBaseUrl(),
    models: {
      chat: getChatModel(),
      asr: getAsrModel(),
      tts: getTtsModel(),
      voiceDesign: getVoiceDesignModel(),
    },
    ttsModes: TTS_MODE_META,
    presetVoices: PRESET_VOICES,
    defaultVoice: getDefaultTtsVoice(),
    speechStyleTags: SPEECH_STYLE_TAG_PRESETS,
    audioTagExamples: AUDIO_TAG_EXAMPLES,
    time: new Date().toISOString(),
  }));


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

  app.get('/jobs', async () => {
    const jobs = await listJobs();
    return { jobs: jobs.map(toPublic) };
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    return { job: toPublic(job) };
  });

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
    '/jobs/:id/audio',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: '任务不存在' });
      const paths = jobPaths(job.id);
      const audioPath = job.podcastAudioPath || paths.podcastWav;
      const alt = paths.podcastMp3;
      const finalPath = (await pathExists(audioPath))
        ? audioPath
        : (await pathExists(alt))
          ? alt
          : job.audioPath;
      if (!finalPath || !(await pathExists(finalPath))) {
        return reply.code(404).send({ error: '播客音频尚未生成' });
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
        return reply.code(404).send({ error: '源音频不存在' });
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
        return reply.code(404).send({ error: '视频不存在' });
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

  app.get<{ Params: { id: string } }>('/jobs/:id/transcript', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    const filePath = jobPaths(job.id).transcript;
    const text =
      job.transcript ||
      ((await pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : '');
    if (!text) return reply.code(404).send({ error: '转写不存在' });
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
            error: `不支持的文件类型: ${ext || 'unknown'}`,
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
          return reply.code(413).send({ error: '文件过大，最大 500MB' });
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
      return reply.code(400).send({ error: '请上传视频 / 音频 / 文本文件' });
    }

    const now = new Date().toISOString();
    const stat = await fs.stat(videoPath);
    const published =
      fields.published === undefined
        ? true
        : String(fields.published) !== 'false' && fields.published !== false;

    const tts = parseTtsFromBody(fields);
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
        return reply.code(400).send({ error: '文本内容过短或无法提取有效正文' });
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
      message: `已入队（${kindLabel(sourceKind)} · TTS: ${tts.mode}${tts.voice ? ' / ' + tts.voice : ''}）…`,
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
      tts?: TtsOptions;
      published?: boolean;
      title?: string;
      scriptPrompt?: ScriptPromptOptions;
      scriptPromptMode?: 'global' | 'custom';
    };
  }>('/jobs/from-url', async (req, reply) => {
    const url = String(req.body?.url || '').trim();
    if (!url) {
      return reply.code(400).send({ error: '请提供 url' });
    }
    if (!isValidHttpUrl(url)) {
      return reply.code(400).send({ error: 'url 必须是 http/https 链接' });
    }

    const tts = normalizeTts(req.body?.tts);
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
          return 'URL 导入';
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
      message: `已入队，准备下载 URL…（TTS: ${tts.mode}${tts.voice ? ' / ' + tts.voice : ''}）`,
      videoPath: '',
      sourceUrl: url,
      sourceKind: 'video', // 下载后会被覆盖
      tts,
      scriptPrompt,
      published,
      createdAt: now,
      updatedAt: now,
    };

    await createJob(job);
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
    };
  }>('/jobs/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    const patch: Partial<Job> = {};
    if (typeof req.body?.published === 'boolean') patch.published = req.body.published;
    if (req.body?.title) patch.title = req.body.title;
    if (req.body?.tts) patch.tts = normalizeTts({ ...job.tts, ...req.body.tts });
    if (req.body && 'scriptPrompt' in req.body) {
      patch.scriptPrompt = normalizeScriptPrompt(req.body.scriptPrompt) || undefined;
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
    };
  }>('/jobs/:id/retry', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    if (job.status !== 'failed' && job.status !== 'done') {
      return reply.code(400).send({ error: '当前状态不可重试' });
    }

    const fromStep: PipelineFromStep = isPipelineFromStep(req.body?.fromStep)
      ? req.body.fromStep
      : await resolveDefaultFromStep(job);

    try {
      await assertPipelinePrereqs(job, fromStep);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }

    const tts = req.body?.tts
      ? normalizeTts({ ...job.tts, ...req.body.tts })
      : normalizeTts(job.tts);
    const scriptPrompt =
      req.body && 'scriptPrompt' in req.body
        ? normalizeScriptPrompt(req.body.scriptPrompt) || undefined
        : job.scriptPrompt;

    await updateJob(
      job.id,
      buildRetryPatch(
        job,
        fromStep,
        tts,
        req.body && 'scriptPrompt' in req.body ? scriptPrompt : undefined,
      ),
    );
    void runPipeline(job.id, { fromStep });
    const latest = await getJob(job.id);
    return { job: latest ? toPublic(latest) : null };
  });

  app.post<{
    Params: { id: string };
    Body: { tts?: TtsOptions };
  }>('/jobs/:id/resynthesize', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: '任务不存在' });
    if (!job.podcast?.script || !job.audioPath) {
      return reply.code(400).send({ error: '缺少脚本或源音频，无法仅重合成' });
    }

    const tts = req.body?.tts ? normalizeTts({ ...job.tts, ...req.body.tts }) : normalizeTts(job.tts);
    await updateJob(job.id, {
      status: 'synthesizing_audio',
      progress: 86,
      message: '正在按新模式合成播客音频…',
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
        message: demo ? '音频已更新（演示模式）' : `音频已更新（TTS: ${mode}${voice ? ' / ' + voice : ''}）`,
        podcastAudioPath: audioPath,
      });
      return { job: updated ? toPublic(updated) : null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await updateJob(job.id, {
        status: 'failed',
        progress: 100,
        message: '音频重合成失败',
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
      if (!job) return reply.code(404).send({ error: '任务不存在' });
      if (job.status !== 'failed' && job.status !== 'done') {
        return reply.code(400).send({ error: '任务处理中，暂不可单独生成闪卡' });
      }

      const transcript = (job.transcript || '').trim();
      if (!transcript) {
        return reply.code(400).send({ error: '缺少转写/文本，无法生成知识闪卡' });
      }
      if (!job.podcast) {
        return reply.code(400).send({ error: '请先生成播客脚本，再生成知识闪卡' });
      }

      await updateJob(job.id, {
        status: 'generating_podcast',
        progress: 74,
        message: '正在重新生成知识闪卡…',
        error: undefined,
      });

      try {
        const { generateFlashcards } = await import(
          '../services/flashcardGenerator.js'
        );
        const { flashcards, demo } = await generateFlashcards({
          jobId: job.id,
          transcript,
          sourceTitle: job.originalFilename || job.title,
          podcast: job.podcast,
        });
        const podcast = { ...job.podcast, flashcards };
        const updated = await updateJob(job.id, {
          status: 'done',
          progress: 100,
          message: demo
            ? `知识闪卡已更新（演示模式 · ${flashcards.length} 张）`
            : `知识闪卡已更新（${flashcards.length} 张）`,
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
          message: '知识闪卡生成失败，主内容未改动',
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
    if (!removed) return reply.code(404).send({ error: '任务不存在' });

    // 整目录删除，覆盖源文件/音频/转写/脚本/播客等全部产物
    await removeDirIfExists(jobPaths(removed.id).dir);
    await removeIfExists(removed.videoPath);
    await removeIfExists(removed.audioPath);
    await removeIfExists(removed.podcastAudioPath);
    await deleteListenRecord(removed.id);

    return { ok: true };
  });
}
