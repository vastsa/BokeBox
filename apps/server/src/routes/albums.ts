import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { getRequestLocale, t } from '../i18n/index.js';
import {
  createAlbum,
  deleteAlbum,
  filterExistingJobIds,
  getAlbumDetail,
  getAlbumListenDetail,
  listAlbums,
  setAlbumItems,
  updateAlbum,
} from '../services/albumStore.js';
import { listListenRecords } from '../services/listenStore.js';
import { getRequestUser } from './auth.js';

function requireAuth(req: Parameters<typeof getRequestUser>[0], reply: {
  code: (n: number) => { send: (b: unknown) => unknown };
}) {
  if (!getRequestUser(req)) {
    reply.code(401).send({
      error: t(getRequestLocale(req), 'auth.pleaseLogin'),
      code: 'UNAUTHORIZED',
    });
    return false;
  }
  return true;
}

export async function albumRoutes(app: FastifyInstance): Promise<void> {
  /** 前台专辑列表（仅已发布） */
  app.get('/listen/albums', async () => {
    const albums = await listAlbums({ publishedOnly: true });
    return { albums };
  });

  /** 前台专辑详情（含可听单集） */
  app.get<{ Params: { id: string } }>(
    '/listen/albums/:id',
    async (req, reply) => {
      const authed = Boolean(getRequestUser(req));
      const album = await getAlbumListenDetail(req.params.id, { authed });
      if (!album) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.notFound') });
      }

      // 登录用户合并收听进度
      if (authed) {
        const records = await listListenRecords();
        const map = Object.fromEntries(records.map((r) => [r.jobId, r]));
        album.items = album.items.map((it) => ({
          ...it,
          listen: map[it.job.id] || null,
        }));
      }

      return { album };
    },
  );

  /** 管理端：全部专辑 */
  app.get('/albums', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const albums = await listAlbums();
    return { albums };
  });

  app.get<{ Params: { id: string } }>('/albums/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const album = await getAlbumDetail(req.params.id);
    if (!album) {
      return reply
        .code(404)
        .send({ error: t(getRequestLocale(req), 'album.notFound') });
    }
    return { album };
  });

  app.post<{
    Body: {
      title?: string;
      summary?: string;
      coverJobId?: string | null;
      published?: boolean;
      jobIds?: string[];
    };
  }>('/albums', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) {
      return reply
        .code(400)
        .send({ error: t(getRequestLocale(req), 'album.titleRequired') });
    }
    const jobIds = await filterExistingJobIds(
      Array.isArray(body.jobIds) ? body.jobIds.map(String) : [],
    );
    const album = await createAlbum({
      id: nanoid(12),
      title,
      summary: body.summary,
      coverJobId: body.coverJobId ?? null,
      published: body.published,
      jobIds,
    });
    return reply.code(201).send({ album });
  });

  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      summary?: string;
      coverJobId?: string | null;
      published?: boolean;
    };
  }>('/albums/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const body = req.body || {};
    if (body.title !== undefined && !String(body.title).trim()) {
      return reply
        .code(400)
        .send({ error: t(getRequestLocale(req), 'album.titleRequired') });
    }
    const album = await updateAlbum(req.params.id, {
      title: body.title,
      summary: body.summary,
      coverJobId: body.coverJobId,
      published: body.published,
    });
    if (!album) {
      return reply
        .code(404)
        .send({ error: t(getRequestLocale(req), 'album.notFound') });
    }
    return { album };
  });

  app.put<{
    Params: { id: string };
    Body: { jobIds?: string[] };
  }>('/albums/:id/items', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const raw = Array.isArray(req.body?.jobIds)
      ? req.body!.jobIds.map(String)
      : [];
    const jobIds = await filterExistingJobIds(raw);
    const album = await setAlbumItems(req.params.id, jobIds);
    if (!album) {
      return reply
        .code(404)
        .send({ error: t(getRequestLocale(req), 'album.notFound') });
    }
    return { album };
  });

  app.delete<{ Params: { id: string } }>(
    '/albums/:id',
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const prev = await deleteAlbum(req.params.id);
      if (!prev) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.notFound') });
      }
      return { ok: true, deletedId: prev.id };
    },
  );
}
