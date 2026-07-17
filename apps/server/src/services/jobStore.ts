import {
  getDb,
  jobToRow,
  normalizeJob,
  rowToJob,
  type JobRow,
} from '../db/sqlite.js';
import type { Job, JobPublic } from '../types/job.js';
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

export async function listJobs(): Promise<Job[]> {
  const rows = getDb()
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC')
    .all() as JobRow[];
  return rows.map(rowToJob);
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
    .filter((j) => Boolean(j.podcast) && (j.published !== false));
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
        source_kind, source_url, script_prompt_json
      ) VALUES (
        @id, @title, @original_filename, @mime_type, @size, @status, @progress,
        @message, @locale, @video_path, @audio_path, @podcast_audio_path, @transcript,
        @podcast_json, @tts_json, @published, @error, @created_at, @updated_at,
        @source_kind, @source_url, @script_prompt_json
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
