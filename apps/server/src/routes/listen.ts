import type { FastifyInstance } from 'fastify';
import {
  getJob,
  listPublishedJobs,
  toPublic,
  withScriptTiming,
} from '../services/jobStore.js';
import { getRequestLocale, t } from '../i18n/index.js';
import {
  getListenRecord,
  listListenRecords,
  upsertListenProgress,
} from '../services/listenStore.js';
import { getRequestUser } from './auth.js';

export async function listenRoutes(app: FastifyInstance): Promise<void> {
  /** 前台可听播客库 */
  app.get('/listen/library', async (req) => {
    const authed = Boolean(getRequestUser(req));
    const jobs = await listPublishedJobs();
    // 游客不返回管理员服务端进度，避免污染游客续播
    const records = authed ? await listListenRecords() : [];
    const recordMap = Object.fromEntries(records.map((r) => [r.jobId, r]));
    const items = [];
    for (const job of jobs) {
      const enriched = await withScriptTiming(job);
      items.push({
        job: toPublic(enriched),
        listen: authed ? recordMap[job.id] || null : null,
      });
    }
    return { items };
  });

  app.get('/listen/history', async () => {
    const records = await listListenRecords();
    const items = [];
    for (const rec of records) {
      const job = await getJob(rec.jobId);
      if (!job || job.status !== 'done' || !job.podcast) continue;
      const enriched = await withScriptTiming(job);
      items.push({ job: toPublic(enriched), listen: rec });
    }
    return { items };
  });

  app.get<{ Params: { id: string } }>('/listen/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job || job.status !== 'done' || !job.podcast) {
      return reply.code(404).send({ error: t(getRequestLocale(req), 'listen.notReady') });
    }
    const authed = Boolean(getRequestUser(req));
    // 游客详情页不返回服务端收听进度
    const listen = authed ? (await getListenRecord(job.id)) || null : null;
    const enriched = await withScriptTiming(job);
    return { job: toPublic(enriched), listen };
  });

  app.post<{
    Params: { id: string };
    Body: {
      progressSec: number;
      durationSec: number;
      completed?: boolean;
      incrementPlay?: boolean;
    };
  }>('/listen/:id/progress', async (req, reply) => {
    // 进度写入仅限已登录管理员，游客只应写浏览器本地
    if (!getRequestUser(req)) {
      return reply.code(401).send({
        error: t(getRequestLocale(req), 'auth.pleaseLogin'),
        code: 'UNAUTHORIZED',
      });
    }
    const job = await getJob(req.params.id);
    if (!job || job.status !== 'done') {
      return reply.code(404).send({ error: t(getRequestLocale(req), 'listen.notFound') });
    }
    const body = req.body || { progressSec: 0, durationSec: 0 };
    const listen = await upsertListenProgress({
      jobId: job.id,
      progressSec: Number(body.progressSec) || 0,
      durationSec: Number(body.durationSec) || 0,
      completed: body.completed,
      incrementPlay: body.incrementPlay,
    });
    return { listen };
  });
}
