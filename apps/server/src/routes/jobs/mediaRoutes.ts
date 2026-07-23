/**
 * 任务媒体：音视频 / 封面 / 转写
 */
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import fs from 'node:fs/promises';
import { jobPaths } from '../../utils/paths.js';
import { getJob, isPubliclyListenable } from '../../services/job/jobStore.js';
import { getRequestUser } from '../auth.js';
import { pathExists } from '../../utils/fs.js';
import { findCoverFile } from '../../services/media/coverGenerator.js';
import {
  parseCoverImageSize,
  resolveCoverDelivery,
} from '../../services/media/imageOptimize.js';
import { getRequestLocale, t } from '../../i18n/index.js';
import { sendMedia } from './helpers.js';


export async function mediaRoutes(app: FastifyInstance): Promise<void> {
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

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
    '/jobs/:id/srt',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
      if (!getRequestUser(req) && !isPubliclyListenable(job)) {
        return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
      }
      const paths = jobPaths(job.id);
      let filePath = paths.podcastSrt;
      if (!(await pathExists(filePath))) {
        // 兼容旧任务：有时间轴则即时生成
        const { readScriptTiming, buildSrtFromTiming, writePodcastSrt } = await import(
          '../../services/job/scriptTiming.js'
        );
        const timing = await readScriptTiming(job.id);
        if (!timing?.lines?.length) {
          return reply.code(404).send({ error: t(getRequestLocale(req), 'job.srtMissing') });
        }
        await writePodcastSrt(job.id, timing);
        if (!(await pathExists(filePath))) {
          const body = buildSrtFromTiming(timing.lines);
          if (!body) {
            return reply.code(404).send({ error: t(getRequestLocale(req), 'job.srtMissing') });
          }
          reply.header('Content-Type', 'application/x-subrip; charset=utf-8');
          const filename = `${(job.podcast?.title || job.title || job.id).replace(/[\\/:*?"<>|]/g, '_')}.srt`;
          if (req.query.download === '1') {
            reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
          }
          return body;
        }
      }
      const filename = `${(job.podcast?.title || job.title || job.id).replace(/[\\/:*?"<>|]/g, '_')}.srt`;
      return sendMedia(req, reply, filePath, filename, req.query.download === '1');
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

}
