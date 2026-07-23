import { getDb } from '../../db/sqlite.js';
import type {
  Album,
  AlbumDetail,
  AlbumItem,
  AlbumListenDetail,
  AlbumListenItem,
  AlbumSummary,
} from '../../types/album.js';
import type { Job, JobPublic } from '../../types/job.js';
import {
  getJob,
  getJobsByIds,
  isPubliclyListenable,
  toGuestListPublic,
  toListPublic,
} from '../job/jobStore.js';
import { getCache } from '../../utils/memoryCache.js';
import {
  likePattern,
  pageResult,
  type PageResult,
} from '../../utils/pagination.js';

export type AlbumRow = {
  id: string;
  title: string;
  summary: string;
  cover_job_id: string | null;
  has_cover_image: number | null;
  published: number;
  created_at: string;
  updated_at: string;
};

export type AlbumItemRow = {
  album_id: string;
  job_id: string;
  position: number;
};

export function rowToAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary || '',
    coverJobId: row.cover_job_id || null,
    hasOwnCoverImage: Boolean(row.has_cover_image),
    published: row.published !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function albumToRow(album: Album): AlbumRow {
  return {
    id: album.id,
    title: album.title,
    summary: album.summary || '',
    cover_job_id: album.coverJobId,
    has_cover_image: album.hasOwnCoverImage ? 1 : 0,
    published: album.published ? 1 : 0,
    created_at: album.createdAt,
    updated_at: album.updatedAt,
  };
}

export function rowToAlbumItem(row: AlbumItemRow): AlbumItem {
  return {
    albumId: row.album_id,
    jobId: row.job_id,
    position: row.position,
  };
}

/** 专辑实体缓存：按 id 逐条管理 */
const albumCache = getCache<Album>('albums', {
  maxSize: 500,
  cacheMissing: true,
});

/** 专辑条目缓存：key = albumId */
const albumItemsCache = getCache<AlbumItemRow[]>('album-items', {
  maxSize: 500,
});

function listItemRows(albumId: string): AlbumItemRow[] {
  return (
    albumItemsCache.getOrLoad(albumId, () => {
      return getDb()
        .prepare(
          `SELECT * FROM album_items
           WHERE album_id = ?
           ORDER BY position ASC, job_id ASC`,
        )
        .all(albumId) as AlbumItemRow[];
    }) || []
  );
}

function listItemRowsMany(albumIds: string[]): Map<string, AlbumItemRow[]> {
  const map = new Map<string, AlbumItemRow[]>();
  if (!albumIds.length) return map;
  const uniqueIds = [...new Set(albumIds.filter(Boolean))];
  const missing: string[] = [];

  for (const id of uniqueIds) {
    const cached = albumItemsCache.get(id);
    if (cached.hit) {
      map.set(id, cached.value || []);
      continue;
    }
    missing.push(id);
    map.set(id, []);
  }

  if (!missing.length) return map;

  const placeholders = missing.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT * FROM album_items
       WHERE album_id IN (${placeholders})
       ORDER BY position ASC, job_id ASC`,
    )
    .all(...missing) as AlbumItemRow[];

  const grouped = new Map<string, AlbumItemRow[]>();
  for (const id of missing) grouped.set(id, []);
  for (const row of rows) {
    const list = grouped.get(row.album_id);
    if (list) list.push(row);
    else grouped.set(row.album_id, [row]);
  }
  for (const [id, list] of grouped) {
    map.set(id, list);
    albumItemsCache.set(id, list);
  }
  return map;
}

function touchAlbumCache(album: Album): void {
  albumCache.set(album.id, album);
}

function invalidateAlbum(id: string): void {
  albumCache.delete(id);
  albumItemsCache.delete(id);
}

function resolveCoverMeta(
  album: Album,
  itemRows: AlbumItemRow[],
  jobs: Map<string, Job>,
): {
  resolvedCoverJobId: string | null;
  hasCoverImage?: boolean;
  coverGradient?: string;
} {
  const preferred =
    album.coverJobId ||
    itemRows[0]?.job_id ||
    null;
  if (!preferred) {
    return { resolvedCoverJobId: null };
  }
  const job = jobs.get(preferred);
  if (!job?.podcast) {
    // 封面 job 不可用时回落首集
    const fallbackId = itemRows.find((r) => r.job_id !== preferred)?.job_id;
    if (!fallbackId) return { resolvedCoverJobId: preferred };
    const fb = jobs.get(fallbackId);
    return {
      resolvedCoverJobId: fallbackId,
      hasCoverImage: Boolean(fb?.podcast?.hasCoverImage),
      coverGradient: fb?.podcast?.coverGradient,
    };
  }
  return {
    resolvedCoverJobId: preferred,
    hasCoverImage: Boolean(job.podcast.hasCoverImage),
    coverGradient: job.podcast.coverGradient,
  };
}

function summarizeAlbums(
  albums: Album[],
  itemMap: Map<string, AlbumItemRow[]>,
): AlbumSummary[] {
  const jobIds = new Set<string>();
  for (const album of albums) {
    const itemRows = itemMap.get(album.id) || [];
    const preferred = album.coverJobId || itemRows[0]?.job_id;
    if (preferred) jobIds.add(preferred);
    const fallback = itemRows.find((row) => row.job_id !== preferred)?.job_id;
    if (fallback) jobIds.add(fallback);
  }
  const jobs = getJobsByIds([...jobIds]);
  return albums.map((album) => {
    const itemRows = itemMap.get(album.id) || [];
    return {
      ...album,
      itemCount: itemRows.length,
      ...resolveCoverMeta(album, itemRows, jobs),
    };
  });
}

export async function listAlbums(opts?: {
  /** 仅已发布（前台） */
  publishedOnly?: boolean;
}): Promise<AlbumSummary[]> {
  const rows = (
    opts?.publishedOnly
      ? (getDb()
          .prepare(
            `SELECT * FROM albums
             WHERE published = 1
             ORDER BY updated_at DESC`,
          )
          .all() as AlbumRow[])
      : (getDb()
          .prepare(`SELECT * FROM albums ORDER BY updated_at DESC`)
          .all() as AlbumRow[])
  );
  const albums = rows.map(rowToAlbum);
  const itemMap = listItemRowsMany(albums.map((a) => a.id));
  return summarizeAlbums(albums, itemMap);
}

/** 专辑列表分页（管理端 / 前台） */
export async function listAlbumsPage(opts: {
  page: number;
  pageSize: number;
  offset: number;
  publishedOnly?: boolean;
  q?: string;
}): Promise<PageResult<AlbumSummary>> {
  const pattern = likePattern(opts.q || '');
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (opts.publishedOnly) {
    where.push('published = 1');
  }
  if (pattern) {
    where.push(
      "(title LIKE ? ESCAPE '\\' OR IFNULL(summary, '') LIKE ? ESCAPE '\\')",
    );
    params.push(pattern, pattern);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM albums ${whereSql}`)
    .get(...params) as { c: number };
  const total = Number(totalRow?.c) || 0;
  const rows = getDb()
    .prepare(
      `SELECT * FROM albums
       ${whereSql}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.pageSize, opts.offset) as AlbumRow[];
  const albums = rows.map(rowToAlbum);
  const itemMap = listItemRowsMany(albums.map((a) => a.id));
  const items = summarizeAlbums(albums, itemMap);
  return pageResult(items, total, opts.page, opts.pageSize);
}

export async function getAlbum(id: string): Promise<Album | undefined> {
  if (!id) return undefined;
  return albumCache.getOrLoad(id, () => {
    const row = getDb()
      .prepare('SELECT * FROM albums WHERE id = ?')
      .get(id) as AlbumRow | undefined;
    return row ? rowToAlbum(row) : undefined;
  });
}

export async function getAlbumDetail(
  id: string,
): Promise<AlbumDetail | undefined> {
  const album = await getAlbum(id);
  if (!album) return undefined;
  const itemRows = listItemRows(id);
  const itemMap = new Map([[album.id, itemRows]]);
  const summary = summarizeAlbums([album], itemMap)[0]!;
  return {
    ...summary,
    items: itemRows.map((r) => ({
      jobId: r.job_id,
      position: r.position,
    })),
  };
}

export async function createAlbum(input: {
  id: string;
  title: string;
  summary?: string;
  coverJobId?: string | null;
  published?: boolean;
  jobIds?: string[];
}): Promise<AlbumDetail> {
  const now = new Date().toISOString();
  const album: Album = {
    id: input.id,
    title: input.title.trim(),
    summary: (input.summary || '').trim(),
    coverJobId: input.coverJobId || null,
    hasOwnCoverImage: false,
    published: input.published !== false,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO albums (
        id, title, summary, cover_job_id, has_cover_image, published, created_at, updated_at
      ) VALUES (
        @id, @title, @summary, @cover_job_id, @has_cover_image, @published, @created_at, @updated_at
      )`,
    ).run(albumToRow(album));
    const jobIds = (input.jobIds || []).filter(Boolean);
    const insertItem = db.prepare(
      `INSERT INTO album_items (album_id, job_id, position)
       VALUES (?, ?, ?)`,
    );
    jobIds.forEach((jobId, i) => insertItem.run(album.id, jobId, i));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  touchAlbumCache(album);
  albumItemsCache.delete(album.id);
  const detail = await getAlbumDetail(album.id);
  if (!detail) throw new Error('create album failed');
  return detail;
}

export async function updateAlbum(
  id: string,
  patch: {
    title?: string;
    summary?: string;
    coverJobId?: string | null;
    published?: boolean;
  },
): Promise<AlbumDetail | undefined> {
  const prev = await getAlbum(id);
  if (!prev) return undefined;
  const next: Album = {
    ...prev,
    title:
      patch.title !== undefined ? patch.title.trim() : prev.title,
    summary:
      patch.summary !== undefined ? patch.summary.trim() : prev.summary,
    coverJobId:
      patch.coverJobId !== undefined ? patch.coverJobId : prev.coverJobId,
    published:
      patch.published !== undefined ? Boolean(patch.published) : prev.published,
    updatedAt: new Date().toISOString(),
  };
  // node:sqlite 对命名参数严格校验：对象里多出的字段会直接报 Unknown named parameter
  // 所以这里只绑定 UPDATE 语句实际使用的字段，避免 albumToRow 带上 created_at 触发报错
  const row = albumToRow(next);
  getDb()
    .prepare(
      `UPDATE albums SET
        title = @title,
        summary = @summary,
        cover_job_id = @cover_job_id,
        has_cover_image = @has_cover_image,
        published = @published,
        updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({
      id: row.id,
      title: row.title,
      summary: row.summary,
      cover_job_id: row.cover_job_id,
      has_cover_image: row.has_cover_image,
      published: row.published,
      updated_at: row.updated_at,
    });
  touchAlbumCache(next);
  return getAlbumDetail(id);
}

export async function setAlbumItems(
  id: string,
  jobIds: string[],
): Promise<AlbumDetail | undefined> {
  const prev = await getAlbum(id);
  if (!prev) return undefined;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const jobId of jobIds) {
    const j = String(jobId || '').trim();
    if (!j || seen.has(j)) continue;
    seen.add(j);
    unique.push(j);
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM album_items WHERE album_id = ?').run(id);
    const insert = db.prepare(
      `INSERT INTO album_items (album_id, job_id, position)
       VALUES (?, ?, ?)`,
    );
    unique.forEach((jobId, i) => insert.run(id, jobId, i));
    db.prepare('UPDATE albums SET updated_at = ? WHERE id = ?').run(now, id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  albumItemsCache.delete(id);
  // updated_at 变更，实体缓存直接失效后由 getAlbum 回源
  albumCache.delete(id);
  return getAlbumDetail(id);
}

export async function deleteAlbum(id: string): Promise<Album | undefined> {
  const prev = await getAlbum(id);
  if (!prev) return undefined;
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM album_items WHERE album_id = ?').run(id);
    db.prepare('DELETE FROM albums WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  invalidateAlbum(id);
  return prev;
}

/** 任务删除时清理专辑条目并紧凑排序 */
export function removeJobFromAllAlbums(jobId: string): void {
  const db = getDb();
  const albumIds = (
    db
      .prepare('SELECT DISTINCT album_id FROM album_items WHERE job_id = ?')
      .all(jobId) as Array<{ album_id: string }>
  ).map((r) => r.album_id);
  if (!albumIds.length) return;

  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    // 先失效，避免事务内读到旧缓存条目
    for (const albumId of albumIds) albumItemsCache.delete(albumId);
    db.prepare('DELETE FROM album_items WHERE job_id = ?').run(jobId);
    for (const albumId of albumIds) {
      const rows = listItemRows(albumId);
      db.prepare('DELETE FROM album_items WHERE album_id = ?').run(albumId);
      const insert = db.prepare(
        `INSERT INTO album_items (album_id, job_id, position)
         VALUES (?, ?, ?)`,
      );
      rows.forEach((row, i) => insert.run(albumId, row.job_id, i));
      db.prepare('UPDATE albums SET updated_at = ? WHERE id = ?').run(
        now,
        albumId,
      );
      albumItemsCache.delete(albumId);
      albumCache.delete(albumId);
    }
    // 封面指向已删任务时清空
    db.prepare(
      `UPDATE albums SET cover_job_id = NULL, updated_at = ?
       WHERE cover_job_id = ?`,
    ).run(now, jobId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    for (const albumId of albumIds) invalidateAlbum(albumId);
    throw e;
  }
}


/** 前台可听专辑详情：仅 done + published 的条目 */
export async function getAlbumListenDetail(
  id: string,
  opts: { authed: boolean },
): Promise<AlbumListenDetail | undefined> {
  const detail = await getAlbumDetail(id);
  if (!detail) return undefined;
  if (!opts.authed && !detail.published) return undefined;

  const items: AlbumListenItem[] = [];
  for (const it of detail.items) {
    const job = await getJob(it.jobId);
    if (!job || job.status !== 'done' || !job.podcast) continue;
    if (!opts.authed && !isPubliclyListenable(job)) continue;
    // 专辑详情单集列表只返回摘要；播放页 /listen/:id 再拉完整内容。
    items.push({
      job: opts.authed ? toListPublic(job) : toGuestListPublic(job),
      listen: null,
      position: it.position,
    });
  }

  return {
    ...detail,
    itemCount: items.length,
    items,
  };
}

export async function listAlbumIdsForJob(jobId: string): Promise<string[]> {
  const rows = getDb()
    .prepare(
      `SELECT album_id FROM album_items
       WHERE job_id = ?
       ORDER BY album_id ASC`,
    )
    .all(jobId) as Array<{ album_id: string }>;
  return rows.map((r) => r.album_id);
}

/** 校验 jobIds 是否存在（用于写入） */
export async function filterExistingJobIds(jobIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of jobIds) {
    const job = await getJob(id);
    if (job) out.push(id);
  }
  return out;
}

export type { Job };

/** 把任务追加到专辑末尾（已存在则不动顺序） */
export async function appendJobToAlbum(
  albumId: string,
  jobId: string,
): Promise<AlbumDetail | undefined> {
  const detail = await getAlbumDetail(albumId);
  if (!detail) return undefined;
  const ids = detail.items.map((it) => it.jobId);
  if (!ids.includes(jobId)) ids.push(jobId);
  return setAlbumItems(albumId, ids);
}

/** 标记 / 清除专辑专属封面 */
export async function setAlbumOwnCoverImage(
  albumId: string,
  hasOwnCoverImage: boolean,
): Promise<AlbumDetail | undefined> {
  const prev = await getAlbum(albumId);
  if (!prev) return undefined;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE albums SET has_cover_image = ?, updated_at = ? WHERE id = ?`,
    )
    .run(hasOwnCoverImage ? 1 : 0, now, albumId);
  touchAlbumCache({
    ...prev,
    hasOwnCoverImage: Boolean(hasOwnCoverImage),
    updatedAt: now,
  });
  return getAlbumDetail(albumId);
}

/** 主动失效专辑缓存 */
export function invalidateAlbumCache(id?: string): void {
  if (id) {
    invalidateAlbum(id);
    return;
  }
  albumCache.clear();
  albumItemsCache.clear();
}

/** 任务挂到专辑；专辑不存在时跳过并打日志 */
export async function attachJobToAlbumIfNeeded(
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

