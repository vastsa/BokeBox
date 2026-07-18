import {
  getDb,
  jobToRow,
  normalizeJob,
  rowToJob,
  type JobRow,
} from '../db/sqlite.js';
import type { Job, JobPublic } from '../types/job.js';
import {
  likePattern,
  pageResult,
  type PageResult,
} from '../utils/pagination.js';
import { readScriptTiming } from './scriptTiming.js';

export function toPublic(job: Job): JobPublic {
  const { videoPath, audioPath, podcastAudioPath, ...rest } = job;
  const kind = job.sourceKind || 'video';
  return {
    ...rest,
    // 仅真实视频素材算 hasVideo；文本/纯音频不暴露视频播放
    hasVideo: Boolean(videoPath) && kind === 'video',
    hasSourceAudio: Boolean(audioPath) || kind === 'audio',
    hasPodcastAudio: Boolean(podcastAudioPath),
    hasTranscript: Boolean(job.transcript?.trim()),
  };
}

/** 是否可被游客前台收听（已完成 + 有播客 + 未下架） */
export function isPubliclyListenable(job: Job): boolean {
  return (
    job.status === 'done' &&
    Boolean(job.podcast) &&
    job.published !== false
  );
}

/**
 * 游客可见字段：仅保留前台收听所需内容，剥离源文稿 / TTS / 提示词 / 源地址等管理信息
 */
export function toGuestPublic(job: Job): JobPublic {
  const base = toPublic(job);
  return {
    ...base,
    transcript: undefined,
    tts: undefined,
    scriptPrompt: undefined,
    sourceUrl: undefined,
    sourcePluginId: undefined,
    error: undefined,
    message: '',
    originalFilename: '',
    hasTranscript: false,
    hasVideo: false,
    hasSourceAudio: false,
  };
}

/** 把磁盘上的 script-timing.json 合并进 podcast（磁盘优先，不改库） */
export async function withScriptTiming(job: Job): Promise<Job> {
  if (!job.podcast) return job;
  const timing = await readScriptTiming(job.id);
  if (timing?.lines?.length) {
    return {
      ...job,
      podcast: {
        ...job.podcast,
        scriptTiming: timing.lines,
      },
    };
  }
  return job;
}

/** 管理端任务列表筛选 */
export type JobListFilter =
  | 'all'
  | 'active'
  | 'published'
  | 'draft'
  | 'failed'
  | 'done';

export type JobListFacets = Record<JobListFilter, number>;

export const ACTIVE_JOB_STATUSES = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'generating_cover',
  'synthesizing_audio',
] as const;

const ACTIVE_STATUS_SQL = ACTIVE_JOB_STATUSES.map((s) => `'${s}'`).join(', ');

function jobSearchClause(q: string): { sql: string; params: string[] } {
  const pattern = likePattern(q);
  if (!pattern) return { sql: '', params: [] };
  return {
    sql: ` AND (
      title LIKE ? ESCAPE '\\'
      OR original_filename LIKE ? ESCAPE '\\'
      OR IFNULL(source_url, '') LIKE ? ESCAPE '\\'
      OR IFNULL(message, '') LIKE ? ESCAPE '\\'
      OR IFNULL(podcast_json, '') LIKE ? ESCAPE '\\'
    )`,
    params: [pattern, pattern, pattern, pattern, pattern],
  };
}

function jobFilterClause(filter: JobListFilter | undefined): string {
  switch (filter) {
    case 'active':
      return ` AND status IN (${ACTIVE_STATUS_SQL})`;
    case 'published':
      return ' AND published = 1';
    case 'draft':
      return ' AND published = 0';
    case 'failed':
      return " AND status = 'failed'";
    case 'done':
      return " AND status = 'done'";
    default:
      return '';
  }
}

function emptyFacets(): JobListFacets {
  return {
    all: 0,
    active: 0,
    published: 0,
    draft: 0,
    failed: 0,
    done: 0,
  };
}

function countJobs(whereSql: string, params: Array<string | number>): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM jobs WHERE 1=1${whereSql}`)
    .get(...params) as { c: number };
  return Number(row?.c) || 0;
}

/** 全量任务（内部 / MCP 使用） */
export async function listJobs(): Promise<Job[]> {
  const rows = getDb()
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC')
    .all() as JobRow[];
  return rows.map(rowToJob);
}

/** 管理端分页任务列表 + 筛选 facet */
export async function listJobsPage(opts: {
  page: number;
  pageSize: number;
  offset: number;
  q?: string;
  filter?: JobListFilter;
}): Promise<PageResult<Job> & { facets: JobListFacets }> {
  const search = jobSearchClause(opts.q || '');
  const filterSql = jobFilterClause(opts.filter);
  const whereSql = `${search.sql}${filterSql}`;
  const params = [...search.params];

  const total = countJobs(whereSql, params);
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs
       WHERE 1=1${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.pageSize, opts.offset) as JobRow[];

  const facets = emptyFacets();
  // facet 只受搜索影响，不受当前 filter tab 影响
  const facetBase = search.sql;
  const facetParams = [...search.params];
  facets.all = countJobs(facetBase, facetParams);
  facets.active = countJobs(
    `${facetBase} AND status IN (${ACTIVE_STATUS_SQL})`,
    facetParams,
  );
  facets.published = countJobs(`${facetBase} AND published = 1`, facetParams);
  facets.draft = countJobs(`${facetBase} AND published = 0`, facetParams);
  facets.failed = countJobs(`${facetBase} AND status = 'failed'`, facetParams);
  facets.done = countJobs(`${facetBase} AND status = 'done'`, facetParams);

  return {
    ...pageResult(rows.map(rowToJob), total, opts.page, opts.pageSize),
    facets,
  };
}

/** 可听任务：单用户端不再强依赖 published，完成即可听 */
export async function listPublishedJobs(): Promise<Job[]> {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs
       WHERE status = 'done' AND podcast_json IS NOT NULL
       ORDER BY created_at DESC`,
    )
    .all() as JobRow[];
  return rows
    .map(rowToJob)
    .filter((j) => Boolean(j.podcast) && j.published !== false);
}

export type LibraryListFilter = 'all' | 'unplayed' | 'progress' | 'done';

export type LibraryListFacets = Record<LibraryListFilter, number>;

function librarySearchClause(q: string): { sql: string; params: string[] } {
  const pattern = likePattern(q);
  if (!pattern) return { sql: '', params: [] };
  return {
    sql: ` AND (
      j.title LIKE ? ESCAPE '\\'
      OR j.original_filename LIKE ? ESCAPE '\\'
      OR IFNULL(j.source_url, '') LIKE ? ESCAPE '\\'
      OR IFNULL(j.podcast_json, '') LIKE ? ESCAPE '\\'
    )`,
    params: [pattern, pattern, pattern, pattern],
  };
}

function libraryFilterClause(filter: LibraryListFilter | undefined): string {
  switch (filter) {
    case 'unplayed':
      return ` AND (
        l.job_id IS NULL
        OR (IFNULL(l.completed, 0) = 0 AND IFNULL(l.progress_sec, 0) <= 0.5)
      )`;
    case 'progress':
      return ` AND IFNULL(l.completed, 0) = 0 AND IFNULL(l.progress_sec, 0) > 0.5`;
    case 'done':
      return ' AND IFNULL(l.completed, 0) = 1';
    default:
      return '';
  }
}

const LIBRARY_BASE_WHERE = `
  j.status = 'done'
  AND j.podcast_json IS NOT NULL
  AND j.published != 0
`;

function countLibrary(whereExtra: string, params: Array<string | number>): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c
       FROM jobs j
       LEFT JOIN listen_records l ON l.job_id = j.id
       WHERE ${LIBRARY_BASE_WHERE}${whereExtra}`,
    )
    .get(...params) as { c: number };
  return Number(row?.c) || 0;
}

/** 前台曲库分页（可听 + 可选进度筛选） */
export async function listLibraryPage(opts: {
  page: number;
  pageSize: number;
  offset: number;
  q?: string;
  filter?: LibraryListFilter;
}): Promise<
  PageResult<{ job: Job; jobId: string }> & { facets: LibraryListFacets }
> {
  const search = librarySearchClause(opts.q || '');
  const filterSql = libraryFilterClause(opts.filter);
  const whereExtra = `${search.sql}${filterSql}`;
  const params = [...search.params];

  const total = countLibrary(whereExtra, params);
  const rows = getDb()
    .prepare(
      `SELECT j.*
       FROM jobs j
       LEFT JOIN listen_records l ON l.job_id = j.id
       WHERE ${LIBRARY_BASE_WHERE}${whereExtra}
       ORDER BY j.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.pageSize, opts.offset) as JobRow[];

  const facets: LibraryListFacets = {
    all: 0,
    unplayed: 0,
    progress: 0,
    done: 0,
  };
  const facetBase = search.sql;
  const facetParams = [...search.params];
  facets.all = countLibrary(facetBase, facetParams);
  facets.unplayed = countLibrary(
    `${facetBase}${libraryFilterClause('unplayed')}`,
    facetParams,
  );
  facets.progress = countLibrary(
    `${facetBase}${libraryFilterClause('progress')}`,
    facetParams,
  );
  facets.done = countLibrary(
    `${facetBase}${libraryFilterClause('done')}`,
    facetParams,
  );

  const jobs = rows
    .map(rowToJob)
    .filter((j) => Boolean(j.podcast) && j.published !== false);

  return {
    ...pageResult(
      jobs.map((job) => ({ job, jobId: job.id })),
      total,
      opts.page,
      opts.pageSize,
    ),
    facets,
  };
}

export async function getJob(id: string): Promise<Job | undefined> {
  const row = getDb()
    .prepare('SELECT * FROM jobs WHERE id = ?')
    .get(id) as JobRow | undefined;
  return row ? rowToJob(row) : undefined;
}

export async function createJob(job: Job): Promise<Job> {
  const next = normalizeJob(job);
  getDb()
    .prepare(
      `INSERT INTO jobs (
        id, title, original_filename, mime_type, size, status, progress,
        message, locale, video_path, audio_path, podcast_audio_path, transcript,
        podcast_json, tts_json, published, error, created_at, updated_at,
        source_kind, source_url, source_plugin_id, script_prompt_json
      ) VALUES (
        @id, @title, @original_filename, @mime_type, @size, @status, @progress,
        @message, @locale, @video_path, @audio_path, @podcast_audio_path, @transcript,
        @podcast_json, @tts_json, @published, @error, @created_at, @updated_at,
        @source_kind, @source_url, @source_plugin_id, @script_prompt_json
      )`,
    )
    .run(jobToRow(next));
  return next;
}

export async function updateJob(
  id: string,
  patch: Partial<Job>,
): Promise<Job | undefined> {
  const prev = await getJob(id);
  if (!prev) return undefined;

  const next = normalizeJob({
    ...prev,
    ...patch,
    id: prev.id,
    updatedAt: new Date().toISOString(),
  });

  getDb()
    .prepare(
      `UPDATE jobs SET
        title = @title,
        original_filename = @original_filename,
        mime_type = @mime_type,
        size = @size,
        status = @status,
        progress = @progress,
        message = @message,
        locale = @locale,
        video_path = @video_path,
        audio_path = @audio_path,
        podcast_audio_path = @podcast_audio_path,
        transcript = @transcript,
        podcast_json = @podcast_json,
        tts_json = @tts_json,
        published = @published,
        error = @error,
        created_at = @created_at,
        updated_at = @updated_at,
        source_kind = @source_kind,
        source_url = @source_url,
        source_plugin_id = @source_plugin_id,
        script_prompt_json = @script_prompt_json
      WHERE id = @id`,
    )
    .run(jobToRow(next));

  return next;
}

export async function deleteJob(id: string): Promise<Job | undefined> {
  const prev = await getJob(id);
  if (!prev) return undefined;
  getDb().exec('BEGIN');
  try {
    getDb().prepare('DELETE FROM listen_records WHERE job_id = ?').run(id);
    getDb().prepare('DELETE FROM jobs WHERE id = ?').run(id);
    getDb().exec('COMMIT');
  } catch (e) {
    getDb().exec('ROLLBACK');
    throw e;
  }
  return prev;
}
