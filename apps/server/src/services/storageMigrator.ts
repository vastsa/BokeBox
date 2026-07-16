import fs from 'node:fs';
import path from 'node:path';
import {
  JOBS_DIR,
  LEGACY_AUDIO_DIR,
  LEGACY_BLOGS_DIR,
  LEGACY_PODCAST_DIR,
  LEGACY_TRANSCRIPT_DIR,
  LEGACY_UPLOAD_DIR,
  STORAGE_DIR,
  jobPaths,
} from '../utils/paths.js';
import { ensureDir, moveFile, pathExists, removeDirIfExists } from '../utils/fs.js';
import { getDb } from '../db/sqlite.js';

interface JobPathRow {
  id: string;
  video_path: string;
  audio_path: string | null;
  podcast_audio_path: string | null;
}

/**
 * 将旧版「按类型摊开」布局迁移为「按任务聚合」：
 * storage/uploads|audio|transcripts|podcasts/{id}.*
 *   → storage/jobs/{id}/{规范文件名}
 *
 * 同时回写 SQLite 中的绝对路径。
 */
export async function migrateStorageLayout(): Promise<void> {
  await ensureDir(JOBS_DIR);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, video_path, audio_path, podcast_audio_path FROM jobs`,
    )
    .all() as unknown as JobPathRow[];

  const update = db.prepare(`
    UPDATE jobs
    SET video_path = @video_path,
        audio_path = @audio_path,
        podcast_audio_path = @podcast_audio_path,
        updated_at = @updated_at
    WHERE id = @id
  `);

  let migrated = 0;

  for (const row of rows) {
    const paths = jobPaths(row.id);
    await ensureDir(paths.dir);

    let videoPath = row.video_path || '';
    let audioPath = row.audio_path || '';
    let podcastAudioPath = row.podcast_audio_path || '';
    let changed = false;

    // 1) 原始上传
    const sourceCandidate = await resolveSourceFile(row.id, videoPath);
    if (sourceCandidate) {
      const ext = path.extname(sourceCandidate) || '.bin';
      const dest = paths.source(ext);
      if (await moveFile(sourceCandidate, dest)) {
        if (videoPath !== dest) {
          videoPath = dest;
          changed = true;
        }
      }
    }

    // 2) 可听音频 + ASR
    const listenSrc =
      (audioPath && (await pathExists(audioPath)) ? audioPath : null) ||
      path.join(LEGACY_AUDIO_DIR, `${row.id}.mp3`);
    if (await pathExists(listenSrc)) {
      if (await moveFile(listenSrc, paths.audio)) {
        if (audioPath !== paths.audio) {
          audioPath = paths.audio;
          changed = true;
        }
      }
    }

    const asrSrc = path.join(LEGACY_AUDIO_DIR, `${row.id}.asr.mp3`);
    if (await pathExists(asrSrc)) {
      await moveFile(asrSrc, paths.asr);
    }

    // 3) 转写 / 脚本 / 笔记
    const transcriptSrc = path.join(LEGACY_TRANSCRIPT_DIR, `${row.id}.txt`);
    if (await pathExists(transcriptSrc)) {
      await moveFile(transcriptSrc, paths.transcript);
    }

    const scriptSrc = path.join(LEGACY_PODCAST_DIR, `${row.id}.script.txt`);
    if (await pathExists(scriptSrc)) {
      await moveFile(scriptSrc, paths.script);
    }

    const notesSrc = path.join(LEGACY_PODCAST_DIR, `${row.id}.shownotes.md`);
    if (await pathExists(notesSrc)) {
      await moveFile(notesSrc, paths.showNotes);
    }

    // 4) 播客成品
    const podcastCandidates = [
      podcastAudioPath,
      path.join(LEGACY_PODCAST_DIR, `${row.id}.mp3`),
      path.join(LEGACY_PODCAST_DIR, `${row.id}.wav`),
    ].filter(Boolean) as string[];

    for (const candidate of podcastCandidates) {
      if (!(await pathExists(candidate))) continue;
      const ext = path.extname(candidate).toLowerCase();
      const dest = ext === '.wav' ? paths.podcastWav : paths.podcastMp3;
      if (await moveFile(candidate, dest)) {
        if (podcastAudioPath !== dest) {
          podcastAudioPath = dest;
          changed = true;
        }
        break;
      }
    }

    // 5) 若 DB 路径已在新目录但文件名仍是旧风格 {id}.xxx，规范化
    const normalized = await normalizeInJobDir(row.id, {
      videoPath,
      audioPath,
      podcastAudioPath,
    });
    if (normalized.changed) {
      videoPath = normalized.videoPath;
      audioPath = normalized.audioPath;
      podcastAudioPath = normalized.podcastAudioPath;
      changed = true;
    }

    if (changed) {
      update.run({
        id: row.id,
        video_path: videoPath,
        audio_path: audioPath || null,
        podcast_audio_path: podcastAudioPath || null,
        updated_at: new Date().toISOString(),
      });
      migrated += 1;
    }
  }

  // 兜底：扫描遗留目录中未入库但仍带 jobId 前缀的文件
  await migrateOrphanLegacyFiles();

  // 清空已无用的旧类型目录（保留 .gitkeep 也一并移除，根下只留 jobs + db）
  await cleanupEmptyLegacyDirs();

  if (migrated > 0) {
    console.info(`[storage] 已迁移 ${migrated} 个任务到 jobs/{id}/ 布局`);
  }
}

async function resolveSourceFile(
  jobId: string,
  videoPath: string,
): Promise<string | null> {
  if (videoPath && (await pathExists(videoPath))) return videoPath;

  if (!fs.existsSync(LEGACY_UPLOAD_DIR)) return null;
  const entries = fs.readdirSync(LEGACY_UPLOAD_DIR);
  const match = entries.find(
    (name) => name === jobId || name.startsWith(`${jobId}.`),
  );
  if (!match) return null;
  return path.join(LEGACY_UPLOAD_DIR, match);
}

async function normalizeInJobDir(
  jobId: string,
  current: {
    videoPath: string;
    audioPath: string;
    podcastAudioPath: string;
  },
): Promise<{
  changed: boolean;
  videoPath: string;
  audioPath: string;
  podcastAudioPath: string;
}> {
  const paths = jobPaths(jobId);
  let { videoPath, audioPath, podcastAudioPath } = current;
  let changed = false;

  if (!(await pathExists(paths.dir))) {
    return { changed, videoPath, audioPath, podcastAudioPath };
  }

  const files = fs.readdirSync(paths.dir);

  // {id}.mp4 / source.mp4 等 → source.ext
  for (const name of files) {
    const full = path.join(paths.dir, name);
    if (name.startsWith('source.')) {
      if (videoPath !== full) {
        videoPath = full;
        changed = true;
      }
      continue;
    }
    if (name === `${jobId}.mp3` && name !== 'audio.mp3') {
      // 可能是源音频或播客，优先归 audio，若 audio 已存在则归 podcast
      if (!(await pathExists(paths.audio))) {
        await moveFile(full, paths.audio);
        audioPath = paths.audio;
        changed = true;
      } else if (!(await pathExists(paths.podcastMp3))) {
        await moveFile(full, paths.podcastMp3);
        podcastAudioPath = paths.podcastMp3;
        changed = true;
      }
      continue;
    }
    if (name === `${jobId}.asr.mp3`) {
      await moveFile(full, paths.asr);
      continue;
    }
    if (name === `${jobId}.txt` || name === 'transcript.txt') {
      if (name !== 'transcript.txt') await moveFile(full, paths.transcript);
      continue;
    }
    if (name === `${jobId}.script.txt`) {
      await moveFile(full, paths.script);
      continue;
    }
    if (name === `${jobId}.shownotes.md`) {
      await moveFile(full, paths.showNotes);
      continue;
    }
    if (name === `${jobId}.wav`) {
      await moveFile(full, paths.podcastWav);
      if (podcastAudioPath !== paths.podcastWav && !(await pathExists(paths.podcastMp3))) {
        podcastAudioPath = paths.podcastWav;
        changed = true;
      }
      continue;
    }
    if (name === `${jobId}.mp4` || name === `${jobId}.mov` || name === `${jobId}.webm` || name === `${jobId}.mkv`) {
      const dest = paths.source(path.extname(name));
      await moveFile(full, dest);
      videoPath = dest;
      changed = true;
    }
  }

  // 若 audio/podcast 路径指向任务目录内旧文件名，纠正为规范名
  if (audioPath && audioPath.startsWith(paths.dir) && (await pathExists(paths.audio))) {
    if (audioPath !== paths.audio) {
      audioPath = paths.audio;
      changed = true;
    }
  }
  if (
    podcastAudioPath &&
    podcastAudioPath.startsWith(paths.dir)
  ) {
    if (await pathExists(paths.podcastMp3) && podcastAudioPath !== paths.podcastMp3) {
      podcastAudioPath = paths.podcastMp3;
      changed = true;
    } else if (
      !(await pathExists(paths.podcastMp3)) &&
      (await pathExists(paths.podcastWav)) &&
      podcastAudioPath !== paths.podcastWav
    ) {
      podcastAudioPath = paths.podcastWav;
      changed = true;
    }
  }

  return { changed, videoPath, audioPath, podcastAudioPath };
}

async function migrateOrphanLegacyFiles(): Promise<void> {
  const legacyPairs: Array<{ dir: string; mapName: (name: string, jobId: string) => string | null }> = [
    {
      dir: LEGACY_UPLOAD_DIR,
      mapName: (name, jobId) => {
        if (!name.startsWith(jobId)) return null;
        const ext = path.extname(name) || '.bin';
        return jobPaths(jobId).source(ext);
      },
    },
    {
      dir: LEGACY_AUDIO_DIR,
      mapName: (name, jobId) => {
        if (name === `${jobId}.mp3`) return jobPaths(jobId).audio;
        if (name === `${jobId}.asr.mp3`) return jobPaths(jobId).asr;
        return null;
      },
    },
    {
      dir: LEGACY_TRANSCRIPT_DIR,
      mapName: (name, jobId) =>
        name === `${jobId}.txt` ? jobPaths(jobId).transcript : null,
    },
    {
      dir: LEGACY_PODCAST_DIR,
      mapName: (name, jobId) => {
        if (name === `${jobId}.mp3`) return jobPaths(jobId).podcastMp3;
        if (name === `${jobId}.wav`) return jobPaths(jobId).podcastWav;
        if (name === `${jobId}.script.txt`) return jobPaths(jobId).script;
        if (name === `${jobId}.shownotes.md`) return jobPaths(jobId).showNotes;
        return null;
      },
    },
  ];

  for (const { dir, mapName } of legacyPairs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name === '.gitkeep') continue;
      const jobId = extractJobId(name);
      if (!jobId) continue;
      const dest = mapName(name, jobId);
      if (!dest) continue;
      await ensureDir(jobPaths(jobId).dir);
      await moveFile(path.join(dir, name), dest);
    }
  }
}

function extractJobId(filename: string): string | null {
  // nanoid 默认 url-safe，长度常见 12；兼容 source 扩展
  const base = filename.replace(/\.(asr\.mp3|script\.txt|shownotes\.md|mp3|wav|txt|mp4|mov|webm|mkv|avi|m4v|mpeg|mpg)$/i, '');
  if (!base || base === filename && filename.includes('.')) {
    // 再试：取第一段
    const m = filename.match(/^([A-Za-z0-9_-]{8,})/);
    return m ? m[1] : null;
  }
  if (/^[A-Za-z0-9_-]{8,}$/.test(base)) return base;
  return null;
}

async function cleanupEmptyLegacyDirs(): Promise<void> {
  const legacyDirs = [
    LEGACY_UPLOAD_DIR,
    LEGACY_AUDIO_DIR,
    LEGACY_TRANSCRIPT_DIR,
    LEGACY_PODCAST_DIR,
    LEGACY_BLOGS_DIR,
  ];

  for (const dir of legacyDirs) {
    if (!fs.existsSync(dir)) continue;
    const left = fs
      .readdirSync(dir)
      .filter((name) => name !== '.gitkeep' && name !== '.DS_Store');
    if (left.length === 0) {
      await removeDirIfExists(dir);
    }
  }

  // 根下的 sample 之类无关文件不碰；仅确保 jobs 存在
  await ensureDir(JOBS_DIR);

  // 提示仍残留的遗留文件
  for (const dir of legacyDirs) {
    if (!fs.existsSync(dir)) continue;
    const left = fs.readdirSync(dir).filter((n) => n !== '.DS_Store');
    if (left.length > 0) {
      console.warn(
        `[storage] 遗留目录仍有文件，未自动删除: ${path.relative(STORAGE_DIR, dir)} (${left.join(', ')})`,
      );
    }
  }
}
