import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  SQLITE_DB,
  JOBS_JSON,
  LISTEN_JSON,
  STORAGE_DIR,
} from '../utils/paths.js';
import type {
  Job,
  ListenRecord,
  PodcastContent,
  TtsOptions,
} from '../types/job.js';

let db: DatabaseSync | null = null;

/** 初始化 SQLite：建表 + 从旧 JSON 迁移一次 */
export function initDatabase(): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  db = new DatabaseSync(SQLITE_DB);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  const ensureJobColumns = () => {
    const cols = db!
      .prepare(`PRAGMA table_info(jobs)`)
      .all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('source_kind')) {
      db!.exec(`ALTER TABLE jobs ADD COLUMN source_kind TEXT DEFAULT 'video'`);
    }
    if (!names.has('source_url')) {
      db!.exec(`ALTER TABLE jobs ADD COLUMN source_url TEXT`);
    }
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      video_path TEXT NOT NULL DEFAULT '',
      audio_path TEXT,
      podcast_audio_path TEXT,
      transcript TEXT,
      podcast_json TEXT,
      tts_json TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_published
      ON jobs(status, published);

    CREATE TABLE IF NOT EXISTS listen_records (
      job_id TEXT PRIMARY KEY NOT NULL,
      progress_sec REAL NOT NULL DEFAULT 0,
      duration_sec REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      last_listened_at TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_listen_last
      ON listen_records(last_listened_at DESC);
  `);

  ensureJobColumns();
  migrateFromJsonIfNeeded(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) return initDatabase();
  return db;
}

function migrateFromJsonIfNeeded(database: DatabaseSync): void {
  const jobCount = (
    database.prepare('SELECT COUNT(*) AS c FROM jobs').get() as { c: number }
  ).c;
  const listenCount = (
    database
      .prepare('SELECT COUNT(*) AS c FROM listen_records')
      .get() as { c: number }
  ).c;

  if (jobCount === 0 && fs.existsSync(JOBS_JSON)) {
    try {
      const raw = fs.readFileSync(JOBS_JSON, 'utf8');
      const jobs = JSON.parse(raw) as Job[];
      if (Array.isArray(jobs) && jobs.length > 0) {
        const insert = database.prepare(`
          INSERT INTO jobs (
            id, title, original_filename, mime_type, size, status, progress,
            message, video_path, audio_path, podcast_audio_path, transcript,
            podcast_json, tts_json, published, error, created_at, updated_at
          ) VALUES (
            @id, @title, @original_filename, @mime_type, @size, @status, @progress,
            @message, @video_path, @audio_path, @podcast_audio_path, @transcript,
            @podcast_json, @tts_json, @published, @error, @created_at, @updated_at
          )
        `);
        database.exec('BEGIN');
        try {
          for (const job of jobs) {
            insert.run(jobToRow(normalizeJob(job)));
          }
          database.exec('COMMIT');
        } catch (e) {
          database.exec('ROLLBACK');
          throw e;
        }
        fs.renameSync(JOBS_JSON, `${JOBS_JSON}.migrated`);
        console.log(`[db] 已从 jobs.json 迁移 ${jobs.length} 条任务`);
      }
    } catch (err) {
      console.error('[db] jobs.json 迁移失败:', err);
    }
  }

  if (listenCount === 0 && fs.existsSync(LISTEN_JSON)) {
    try {
      const raw = fs.readFileSync(LISTEN_JSON, 'utf8');
      const data = JSON.parse(raw) as Record<string, ListenRecord>;
      const records = Object.values(data || {});
      if (records.length > 0) {
        const insert = database.prepare(`
          INSERT INTO listen_records (
            job_id, progress_sec, duration_sec, completed,
            last_listened_at, play_count
          ) VALUES (
            @job_id, @progress_sec, @duration_sec, @completed,
            @last_listened_at, @play_count
          )
        `);
        database.exec('BEGIN');
        try {
          for (const rec of records) {
            insert.run(listenToRow(rec));
          }
          database.exec('COMMIT');
        } catch (e) {
          database.exec('ROLLBACK');
          throw e;
        }
        fs.renameSync(LISTEN_JSON, `${LISTEN_JSON}.migrated`);
        console.log(`[db] 已从 listen.json 迁移 ${records.length} 条收听记录`);
      }
    } catch (err) {
      console.error('[db] listen.json 迁移失败:', err);
    }
  }
}

// ---------- Job 映射 ----------

export type JobRow = {
  id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  size: number;
  status: string;
  progress: number;
  message: string;
  video_path: string;
  audio_path: string | null;
  podcast_audio_path: string | null;
  transcript: string | null;
  podcast_json: string | null;
  tts_json: string | null;
  published: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  source_kind: string | null;
  source_url: string | null;
};

export function normalizeJob(job: Job): Job {
  const raw = job.tts || { mode: 'default' as const };
  // 历史 sing 回落自然口播；丢弃不再支持的风格指令
  const mode = String(raw.mode || 'default') === 'voicedesign' ? 'voicedesign' : 'default';
  const kindRaw = String(job.sourceKind || '').toLowerCase();
  const sourceKind =
    kindRaw === 'audio' || kindRaw === 'text' || kindRaw === 'video'
      ? (kindRaw as Job['sourceKind'])
      : job.mimeType?.startsWith('audio/')
        ? 'audio'
        : job.mimeType?.startsWith('text/') || job.mimeType?.includes('html')
          ? 'text'
          : 'video';

  return {
    ...job,
    published: job.published ?? true,
    sourceKind,
    sourceUrl: job.sourceUrl?.trim() || undefined,
    tts: {
      mode,
      // 自然口播默认补齐预置音色
      voice: mode === 'voicedesign' ? raw.voice : raw.voice || '冰糖',
      voiceDesign: raw.voiceDesign,
      styleTags: mode === 'voicedesign' ? undefined : raw.styleTags,
    },
  };
}

export function jobToRow(job: Job): JobRow {
  return {
    id: job.id,
    title: job.title,
    original_filename: job.originalFilename,
    mime_type: job.mimeType,
    size: job.size ?? 0,
    status: job.status,
    progress: job.progress ?? 0,
    message: job.message ?? '',
    video_path: job.videoPath ?? '',
    audio_path: job.audioPath ?? null,
    podcast_audio_path: job.podcastAudioPath ?? null,
    transcript: job.transcript ?? null,
    podcast_json: job.podcast ? JSON.stringify(job.podcast) : null,
    tts_json: job.tts ? JSON.stringify(job.tts) : null,
    published: job.published ? 1 : 0,
    error: job.error ?? null,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    source_kind: job.sourceKind || 'video',
    source_url: job.sourceUrl || null,
  };
}

export function rowToJob(row: JobRow): Job {
  let podcast: PodcastContent | undefined;
  let tts: TtsOptions | undefined;

  if (row.podcast_json) {
    try {
      podcast = JSON.parse(row.podcast_json) as PodcastContent;
    } catch {
      podcast = undefined;
    }
  }
  if (row.tts_json) {
    try {
      tts = JSON.parse(row.tts_json) as TtsOptions;
    } catch {
      tts = undefined;
    }
  }

  return normalizeJob({
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    size: Number(row.size) || 0,
    status: row.status as Job['status'],
    progress: Number(row.progress) || 0,
    message: row.message || '',
    videoPath: row.video_path || '',
    audioPath: row.audio_path || undefined,
    podcastAudioPath: row.podcast_audio_path || undefined,
    transcript: row.transcript || undefined,
    podcast,
    tts,
    published: Boolean(row.published),
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceKind: (row.source_kind as Job['sourceKind']) || undefined,
    sourceUrl: row.source_url || undefined,
  });
}

// ---------- Listen 映射 ----------

export type ListenRow = {
  job_id: string;
  progress_sec: number;
  duration_sec: number;
  completed: number;
  last_listened_at: string;
  play_count: number;
};

export function listenToRow(rec: ListenRecord): ListenRow {
  return {
    job_id: rec.jobId,
    progress_sec: rec.progressSec ?? 0,
    duration_sec: rec.durationSec ?? 0,
    completed: rec.completed ? 1 : 0,
    last_listened_at: rec.lastListenedAt,
    play_count: rec.playCount ?? 0,
  };
}

export function rowToListen(row: ListenRow): ListenRecord {
  return {
    jobId: row.job_id,
    progressSec: Number(row.progress_sec) || 0,
    durationSec: Number(row.duration_sec) || 0,
    completed: Boolean(row.completed),
    lastListenedAt: row.last_listened_at,
    playCount: Number(row.play_count) || 0,
  };
}
