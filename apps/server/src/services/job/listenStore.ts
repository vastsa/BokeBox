import {
  getDb,
  listenToRow,
  rowToListen,
  type ListenRow,
} from '../../db/sqlite.js';
import type { ListenRecord } from '../../types/job.js';
import { getCache } from '../../utils/memoryCache.js';
import { pageResult, type PageResult } from '../../utils/pagination.js';

/** 听播进度缓存：按 jobId 逐条管理 */
const listenCache = getCache<ListenRecord>('listens', {
  maxSize: 1000,
  cacheMissing: true,
});

export async function listListenRecords(): Promise<ListenRecord[]> {
  const rows = getDb()
    .prepare(
      'SELECT * FROM listen_records ORDER BY last_listened_at DESC',
    )
    .all() as ListenRow[];
  const records = rows.map(rowToListen);
  // 全量列表顺便回填实体缓存
  for (const rec of records) listenCache.set(rec.jobId, rec);
  return records;
}

/** 按 jobId 批量读取收听记录 */
export async function listListenRecordsByJobIds(
  jobIds: string[],
): Promise<Map<string, ListenRecord>> {
  const map = new Map<string, ListenRecord>();
  if (!jobIds.length) return map;
  const uniqueIds = [...new Set(jobIds.filter(Boolean))];
  const missing: string[] = [];

  for (const id of uniqueIds) {
    const cached = listenCache.get(id);
    if (cached.hit) {
      if (cached.value) map.set(id, cached.value);
      continue;
    }
    missing.push(id);
  }

  if (!missing.length) return map;

  for (let offset = 0; offset < missing.length; offset += 400) {
    const chunk = missing.slice(offset, offset + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = getDb()
      .prepare(
        `SELECT * FROM listen_records
         WHERE job_id IN (${placeholders})`,
      )
      .all(...chunk) as ListenRow[];
    const found = new Set<string>();
    for (const row of rows) {
      const rec = rowToListen(row);
      map.set(rec.jobId, rec);
      listenCache.set(rec.jobId, rec);
      found.add(rec.jobId);
    }
    for (const id of chunk) {
      if (!found.has(id)) listenCache.set(id, undefined);
    }
  }
  return map;
}

/** 收听历史分页：仅包含仍可听的任务 */
export async function listListenHistoryPage(opts: {
  page: number;
  pageSize: number;
  offset: number;
}): Promise<PageResult<ListenRecord>> {
  const totalRow = getDb()
    .prepare(
      `SELECT COUNT(*) AS c
       FROM listen_records l
       INNER JOIN jobs j ON j.id = l.job_id
       WHERE j.status = 'done' AND j.podcast_json IS NOT NULL`,
    )
    .get() as { c: number };
  const total = Number(totalRow?.c) || 0;

  const rows = getDb()
    .prepare(
      `SELECT l.*
       FROM listen_records l
       INNER JOIN jobs j ON j.id = l.job_id
       WHERE j.status = 'done' AND j.podcast_json IS NOT NULL
       ORDER BY l.last_listened_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(opts.pageSize, opts.offset) as ListenRow[];

  const records = rows.map(rowToListen);
  for (const rec of records) listenCache.set(rec.jobId, rec);

  return pageResult(records, total, opts.page, opts.pageSize);
}

export async function getListenRecord(
  jobId: string,
): Promise<ListenRecord | undefined> {
  if (!jobId) return undefined;
  return listenCache.getOrLoad(jobId, () => {
    const row = getDb()
      .prepare('SELECT * FROM listen_records WHERE job_id = ?')
      .get(jobId) as ListenRow | undefined;
    return row ? rowToListen(row) : undefined;
  });
}

export async function upsertListenProgress(input: {
  jobId: string;
  progressSec: number;
  durationSec: number;
  completed?: boolean;
  incrementPlay?: boolean;
}): Promise<ListenRecord> {
  const prev = await getListenRecord(input.jobId);
  const completed =
    input.completed ??
    (input.durationSec > 0 && input.progressSec / input.durationSec >= 0.92);

  let playCount = prev?.playCount || 0;
  if (input.incrementPlay) {
    playCount += 1;
  } else if (!prev) {
    playCount = 1;
  }

  const next: ListenRecord = {
    jobId: input.jobId,
    progressSec: Math.max(0, input.progressSec),
    durationSec: Math.max(0, input.durationSec),
    completed: Boolean(completed || prev?.completed),
    lastListenedAt: new Date().toISOString(),
    playCount,
  };

  getDb()
    .prepare(
      `INSERT INTO listen_records (
        job_id, progress_sec, duration_sec, completed,
        last_listened_at, play_count
      ) VALUES (
        @job_id, @progress_sec, @duration_sec, @completed,
        @last_listened_at, @play_count
      )
      ON CONFLICT(job_id) DO UPDATE SET
        progress_sec = excluded.progress_sec,
        duration_sec = excluded.duration_sec,
        completed = excluded.completed,
        last_listened_at = excluded.last_listened_at,
        play_count = excluded.play_count`,
    )
    .run(listenToRow(next));

  listenCache.set(next.jobId, next);
  return next;
}

export async function deleteListenRecord(jobId: string): Promise<void> {
  getDb().prepare('DELETE FROM listen_records WHERE job_id = ?').run(jobId);
  listenCache.set(jobId, undefined);
}

/** 主动失效听播缓存 */
export function invalidateListenCache(jobId?: string): void {
  if (jobId) {
    listenCache.delete(jobId);
    return;
  }
  listenCache.clear();
}
