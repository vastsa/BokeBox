import {
  getDb,
  listenToRow,
  rowToListen,
  type ListenRow,
} from '../db/sqlite.js';
import type { ListenRecord } from '../types/job.js';

export async function listListenRecords(): Promise<ListenRecord[]> {
  const rows = getDb()
    .prepare(
      'SELECT * FROM listen_records ORDER BY last_listened_at DESC',
    )
    .all() as ListenRow[];
  return rows.map(rowToListen);
}

export async function getListenRecord(
  jobId: string,
): Promise<ListenRecord | undefined> {
  const row = getDb()
    .prepare('SELECT * FROM listen_records WHERE job_id = ?')
    .get(jobId) as ListenRow | undefined;
  return row ? rowToListen(row) : undefined;
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

  return next;
}

export async function deleteListenRecord(jobId: string): Promise<void> {
  getDb().prepare('DELETE FROM listen_records WHERE job_id = ?').run(jobId);
}
