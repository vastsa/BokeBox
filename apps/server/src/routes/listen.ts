import type { FastifyInstance } from 'fastify';
import {
  getJob,
  isPubliclyListenable,
  listLibraryPage,
  type LibraryListFilter,
  toGuestListPublic,
  toGuestPublic,
  toListPublic,
  toPublic,
  withScriptTiming,
} from '../services/job/jobStore.js';
import { getRequestLocale, t } from '../i18n/index.js';
import {
  getListenRecord,
  listListenHistoryPage,
  listListenRecordsByJobIds,
  upsertListenProgress,
} from '../services/job/listenStore.js';
import { parsePageQuery } from '../utils/pagination.js';
import { getRequestUser } from './auth.js';

export async function listenRoutes(app: FastifyInstance): Promise<void> {
  /** 前台可听播客库（分页） */
  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      q?: string;
      filter?: string;
    };
  }>('/listen/library', async (req) => {
    const authed = Boolean(getRequestUser(req));
    const page = parsePageQuery(req.query, { pageSize: 10 });
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const rawFilter = String(req.query.filter || 'all').trim();
    const allowed: LibraryListFilter[] = ['all', 'unplayed', 'progress', 'done'];
    const filter = (allowed.includes(rawFilter as LibraryListFilter)
      ? rawFilter
      : 'all') as LibraryListFilter;

    const result = await listLibraryPage({
      ...page,
      q,
      filter,
    });

    const recordMap = authed
      ? await listListenRecordsByJobIds(result.items.map((x) => x.jobId))
      : new Map();

    const items = [];
    for (const row of result.items) {
      items.push({
        // 列表只返回卡片摘要；详情接口再拉取脚本/笔记/时间轴。
        job: authed ? toListPublic(row.job) : toGuestListPublic(row.job),
        listen: authed ? recordMap.get(row.jobId) || null : null,
      });
    }

    return {
      items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      facets: result.facets,
    };
  });

  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
    };
  }>('/listen/history', async (req, reply) => {
    // 收听历史含管理员进度，仅登录可访问
    if (!getRequestUser(req)) {
      return reply.code(401).send({
        error: t(getRequestLocale(req), 'auth.pleaseLogin'),
        code: 'UNAUTHORIZED',
      });
    }
    const page = parsePageQuery(req.query, { pageSize: 20 });
    const result = await listListenHistoryPage(page);
    const items = [];
    for (const rec of result.items) {
      const job = await getJob(rec.jobId);
      // 管理员历史保留未发布已完成条目；仅校验可听内容就绪
      if (!job || job.status !== 'done' || !job.podcast) continue;
      items.push({ job: toListPublic(job), listen: rec });
    }
    return {
      items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
  });

  app.get<{ Params: { id: string } }>('/listen/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job || job.status !== 'done' || !job.podcast) {
      return reply.code(404).send({ error: t(getRequestLocale(req), 'listen.notReady') });
    }

    const authed = Boolean(getRequestUser(req));
    // 游客只能访问已发布内容；未发布草稿对游客 404
    if (!authed && !isPubliclyListenable(job)) {
      return reply.code(404).send({ error: t(getRequestLocale(req), 'listen.notReady') });
    }

    // 游客详情页不返回服务端收听进度
    const listen = authed ? (await getListenRecord(job.id)) || null : null;
    const enriched = await withScriptTiming(job);
    return {
      job: authed ? toPublic(enriched) : toGuestPublic(enriched),
      listen,
    };
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
