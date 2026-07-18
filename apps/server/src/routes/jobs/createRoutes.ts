/**
 * 任务创建：本地上传 / URL 导入
 */
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs/promises';
import { jobPaths } from '../../utils/paths.js';
import { ensureDir, removeIfExists } from '../../utils/fs.js';
import { createJob, toPublic } from '../../services/job/jobStore.js';
import { runPipeline } from '../../services/job/pipeline.js';
import {
  detectSourceKind,
  extractReadableText,
  isValidHttpUrl,
} from '../../services/import/index.js';
import {
  ensureBuiltinSourcePlugins,
  getSourcePluginRegistration,
  isSourcePluginEnabled,
  refreshExternalSourcePlugins,
} from '../../sources/index.js';
import type { Job, ScriptPromptOptions, TtsOptions } from '../../types/job.js';
import {
  getRequestLocale,
  kindLabel as i18nKindLabel,
  t,
} from '../../i18n/index.js';
import {
  ALLOWED_EXT,
  MAX_FILE_SIZE,
  attachJobToAlbumIfNeeded,
  resolveJobLocale,
  resolveScriptPromptForJob,
  resolveTtsForJob,
} from './helpers.js';


export async function createRoutes(app: FastifyInstance): Promise<void> {
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

}
