import path from 'node:path';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { getRequestLocale, t } from '../i18n/index.js';
import {
  createAlbum,
  deleteAlbum,
  filterExistingJobIds,
  getAlbum,
  getAlbumDetail,
  getAlbumListenDetail,
  listAlbumsPage,
  setAlbumItems,
  setAlbumOwnCoverImage,
  updateAlbum,
} from '../services/album/albumStore.js';
import {
  generateAlbumCover,
} from '../services/media/coverGenerator.js';
import {
  parseCoverImageSize,
  resolveCoverDelivery,
} from '../services/media/imageOptimize.js';
import { albumPaths } from '../utils/paths.js';
import { listListenRecords } from '../services/job/listenStore.js';
import {
  hasApiKey,
  hasImageModel,
} from '../utils/aiConfig.js';
import { getRequestUser } from './auth.js';
import { parsePageQuery } from '../utils/pagination.js';

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
  /** 前台专辑列表（仅已发布，分页） */
  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      q?: string;
    };
  }>('/listen/albums', async (req) => {
    const page = parsePageQuery(req.query, { pageSize: 20 });
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const result = await listAlbumsPage({
      ...page,
      publishedOnly: true,
      q,
    });
    return {
      albums: result.items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
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

  /** 前台专辑封面（游客可读；?size=thumb|sm|md|full） */
  app.get<{ Params: { id: string }; Querystring: { size?: string } }>(
    '/listen/albums/:id/cover',
    async (req, reply) => {
      const album = await getAlbum(req.params.id);
      if (!album) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.notFound') });
      }
      if (!album.published && !getRequestUser(req)) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.notFound') });
      }
      if (!album.hasOwnCoverImage) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.coverMissing') });
      }
      const size = parseCoverImageSize(req.query.size, 'sm');
      const delivered = await resolveCoverDelivery(albumPaths(album.id).dir, size);
      if (!delivered) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.coverMissing') });
      }
      const ext = path.extname(delivered.filePath).toLowerCase() || '.webp';
      const sizeTag = delivered.size === 'full' ? '' : `-${delivered.size}`;
      const filename = `${(album.title || album.id).replace(/[\\/:*?"<>|]/g, '_')}-cover${sizeTag}${ext}`;
      const stat = await fs.stat(delivered.filePath);
      reply
        .type(delivered.mime)
        .header(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        )
        .header('Cache-Control', 'public, max-age=604800, immutable')
        .header('Content-Length', String(stat.size));
      return reply.send(createReadStream(delivered.filePath));
    },
  );


  /** 管理端：全部专辑（分页） */
  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      q?: string;
    };
  }>('/albums', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const page = parsePageQuery(req.query, { pageSize: 20 });
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const result = await listAlbumsPage({
      ...page,
      q,
    });
    return {
      albums: result.items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    };
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

  app.get<{ Params: { id: string }; Querystring: { size?: string } }>(
    '/albums/:id/cover',
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const album = await getAlbum(req.params.id);
      if (!album) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.notFound') });
      }
      if (!album.hasOwnCoverImage) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.coverMissing') });
      }
      const size = parseCoverImageSize(req.query.size, 'sm');
      const delivered = await resolveCoverDelivery(albumPaths(album.id).dir, size);
      if (!delivered) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.coverMissing') });
      }
      const ext = path.extname(delivered.filePath).toLowerCase() || '.webp';
      const sizeTag = delivered.size === 'full' ? '' : `-${delivered.size}`;
      const filename = `${(album.title || album.id).replace(/[\\/:*?"<>|]/g, '_')}-cover${sizeTag}${ext}`;
      const stat = await fs.stat(delivered.filePath);
      reply
        .type(delivered.mime)
        .header(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        )
        .header('Cache-Control', 'public, max-age=604800, immutable')
        .header('Content-Length', String(stat.size));
      return reply.send(createReadStream(delivered.filePath));
    },
  );

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

  /** 生成专辑专属 AI 封面 */
  app.post<{ Params: { id: string } }>(
    '/albums/:id/generate-cover',
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const album = await getAlbum(req.params.id);
      if (!album) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'album.notFound') });
      }
      if (!hasImageModel() || !hasApiKey('image')) {
        return reply.code(400).send({
          error: t(getRequestLocale(req), 'album.coverNoModel'),
        });
      }
      try {
        const ok = await generateAlbumCover(album.id, {
          title: album.title,
          summary: album.summary,
        });
        if (!ok) {
          return reply.code(500).send({
            error: t(getRequestLocale(req), 'album.coverFailed'),
          });
        }
        const next = await setAlbumOwnCoverImage(album.id, true);
        return { album: next, ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[album-cover] generate route failed:', msg);
        return reply.code(500).send({
          error: t(getRequestLocale(req), 'album.coverFailed'),
          detail: msg,
        });
      }
    },
  );

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

