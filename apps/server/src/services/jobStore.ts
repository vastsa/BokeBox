import {
  getDb,
  jobToRow,
  normalizeJob,
  rowToJob,
  type JobRow,
} from '../db/sqlite.js';
import type { Job, JobPublic, PodcastContent } from '../types/job.js';
import {
  likePattern,
  pageResult,
  type PageResult,
} from '../utils/pagination.js';
import { readScriptTiming } from './scriptTiming.js';

function truncateListText(text: string, max = 160): string {
  const s = text.trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** 详情 / 写操作响应：去掉本地路径，补齐资产标记 */
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
 * 游客详情：仅保留前台收听所需内容，
 * 剥离源文稿 / TTS / 提示词 / 源地址等管理信息。
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

/**
 * 列表卡片播客字段：只保留封面/标题/简介/时长/少量标签。
 * 不回填 script/showNotes/outline/flashcards 等空壳。
 */
export function slimPodcastForList(
  podcast?: PodcastContent,
): PodcastContent | undefined {
  if (!podcast) return undefined;
  const summary = truncateListText(podcast.summary || '', 160);
  const hostIntro = truncateListText(podcast.hostIntro || '', 120);
  const tags = (podcast.tags || []).filter(Boolean).slice(0, 6);

  const slim: Record<string, unknown> = {
    title: podcast.title,
  };
  if (summary) slim.summary = summary;
  // 没有 summary 时才用 hostIntro 兜底卡片文案
  if (!summary && hostIntro) slim.hostIntro = hostIntro;
  if (tags.length) slim.tags = tags;
  if (podcast.estimatedMinutes) slim.estimatedMinutes = podcast.estimatedMinutes;
  if (podcast.coverGradient) slim.coverGradient = podcast.coverGradient;
  if (podcast.hasCoverImage) slim.hasCoverImage = true;
  return slim as unknown as PodcastContent;
}

/**
 * 列表最小白名单：严格按卡片 UI 依赖返回，空值字段直接省略。
 * 管理端列表 / 听播库 / 专辑条目共用；详情与写操作仍走 toPublic。
 *
 * 刻意不返回：tts / locale / mimeType / sourceKind / sourcePluginId /
 * transcript / script* / 资产四元组（除可选 hasPodcastAudio）。
 */
export function toListPublic(job: Job): JobPublic {
  const podcast = slimPodcastForList(job.podcast);
  const out: Record<string, unknown> = {
    id: job.id,
    title: job.title,
    status: job.status,
    published: job.published !== false,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };

  // 进度仅处理中 / 失败需要；完成态固定 100，列表可不传
  if (job.status !== 'done') out.progress = job.progress || 0;

  // 来源展示（管理端卡片）
  if (job.originalFilename) out.originalFilename = job.originalFilename;
  if (job.sourceUrl) out.sourceUrl = job.sourceUrl;
  if (job.size) out.size = job.size;

  // 处理中 / 失败才需要状态文案
  if (job.status !== 'done') {
    const msg = truncateListText(job.message || '', 140);
    if (msg) out.message = msg;
  }
  if (job.status === 'failed' && job.error) {
    out.error = truncateListText(job.error, 180);
  }

  if (podcast) out.podcast = podcast;

  // 听播入口只需知道有没有成品音频；其余资产标记列表不用
  if (job.podcastAudioPath) out.hasPodcastAudio = true;

  return out as unknown as JobPublic;
}

/** 游客列表：重建对象，去掉源信息 / 错误 / 本地文件名 */
export function toGuestListPublic(job: Job): JobPublic {
  const base = toListPublic(job) as Record<string, unknown>;
  const {
    originalFilename: _originalFilename,
    sourceUrl: _sourceUrl,
    error: _error,
    message: _message,
    size: _size,
    ...rest
  } = base;
  return rest as unknown as JobPublic;
}

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
  | 'done'
  /** 首页流水线：制作中 + 失败（不含 done） */
  | 'pipeline';

/** 列表 facet 计数（不含 pipeline 组合筛选） */
export type JobListFacets = {
  all: number;
  active: number;
  published: number;
  draft: number;
  failed: number;
  done: number;
};

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
    case 'pipeline':
      // 首页侧栏：进行中 + 失败，一次请求替代 active/failed 双拉
      return ` AND (status IN (${ACTIVE_STATUS_SQL}) OR status = 'failed')`;
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

function queryJobFacets(
  whereSql: string,
  params: Array<string | number>,
): JobListFacets {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS all_count,
         SUM(CASE WHEN status IN (${ACTIVE_STATUS_SQL}) THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published_count,
         SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END) AS draft_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count
       FROM jobs
       WHERE 1=1${whereSql}`,
    )
    .get(...params) as Record<string, number | null>;
  return {
    all: Number(row?.all_count) || 0,
    active: Number(row?.active_count) || 0,
    published: Number(row?.published_count) || 0,
    draft: Number(row?.draft_count) || 0,
    failed: Number(row?.failed_count) || 0,
    done: Number(row?.done_count) || 0,
  };
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
  includeFacets?: boolean;
}): Promise<PageResult<Job> & { facets: JobListFacets }> {
  const search = jobSearchClause(opts.q || '');
  const filterSql = jobFilterClause(opts.filter);
  const whereSql = `${search.sql}${filterSql}`;
  const params = [...search.params];

  const facets =
    opts.includeFacets === false
      ? emptyFacets()
      : queryJobFacets(search.sql, search.params);
  const total =
    opts.includeFacets !== false && (!opts.filter || opts.filter === 'all')
      ? facets.all
      : countJobs(whereSql, params);
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs
       WHERE 1=1${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.pageSize, opts.offset) as JobRow[];

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

function queryLibraryFacets(
  whereExtra: string,
  params: Array<string | number>,
): LibraryListFacets {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS all_count,
         SUM(CASE WHEN l.job_id IS NULL OR (
           IFNULL(l.completed, 0) = 0 AND IFNULL(l.progress_sec, 0) <= 0.5
         ) THEN 1 ELSE 0 END) AS unplayed_count,
         SUM(CASE WHEN
           IFNULL(l.completed, 0) = 0 AND IFNULL(l.progress_sec, 0) > 0.5
         THEN 1 ELSE 0 END) AS progress_count,
         SUM(CASE WHEN IFNULL(l.completed, 0) = 1 THEN 1 ELSE 0 END) AS done_count
       FROM jobs j
       LEFT JOIN listen_records l ON l.job_id = j.id
       WHERE ${LIBRARY_BASE_WHERE}${whereExtra}`,
    )
    .get(...params) as Record<string, number | null>;
  return {
    all: Number(row?.all_count) || 0,
    unplayed: Number(row?.unplayed_count) || 0,
    progress: Number(row?.progress_count) || 0,
    done: Number(row?.done_count) || 0,
  };
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

  const facets = queryLibraryFacets(search.sql, search.params);
  const total =
    !opts.filter || opts.filter === 'all'
      ? facets.all
      : countLibrary(whereExtra, params);
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

/** 批量读取任务，供专辑等聚合列表避免逐条查询。 */
export function getJobsByIds(ids: string[]): Map<string, Job> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const jobs = new Map<string, Job>();
  // 留出 SQLite 绑定参数余量，大列表按块读取。
  for (let offset = 0; offset < uniqueIds.length; offset += 400) {
    const chunk = uniqueIds.slice(offset, offset + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = getDb()
      .prepare(`SELECT * FROM jobs WHERE id IN (${placeholders})`)
      .all(...chunk) as JobRow[];
    for (const row of rows) {
      const job = rowToJob(row);
      jobs.set(job.id, job);
    }
  }
  return jobs;
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
