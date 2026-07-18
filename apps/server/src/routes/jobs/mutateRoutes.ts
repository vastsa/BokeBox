/**
 * 任务变更：更新 / 重试 / 重合成 / 闪卡 / 删除
 */
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { jobPaths } from '../../utils/paths.js';
import {
  removeIfExists,
  removeDirIfExists,
} from '../../utils/fs.js';
import {
  deleteJob,
  getJob,
  toPublic,
  updateJob,
} from '../../services/job/jobStore.js';
import { removeJobFromAllAlbums } from '../../services/album/albumStore.js';
import {
  assertPipelinePrereqs,
  buildRetryPatch,
  isPipelineFromStep,
  resolveDefaultFromStep,
  runPipeline,
} from '../../services/job/pipeline.js';
import type { Job, PipelineFromStep, ScriptPromptOptions, TtsOptions } from '../../types/job.js';
import { deleteListenRecord } from '../../services/job/listenStore.js';
import {
  errorMessage,
  getRequestLocale,
  isContentLocale,
  resolveContentLocale,
  t,
} from '../../i18n/index.js';
import { normalizeTts, resolveJobLocale } from './helpers.js';
import { normalizeScriptPrompt } from '../../services/content/scriptPrompt.js';


export async function mutateRoutes(app: FastifyInstance): Promise<void> {
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
      const { synthesizePodcastAudio } = await import('../../services/media/ttsSynthesizer.js');
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
          '../../services/content/flashcardGenerator.js'
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
