import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** monorepo 根目录 */
export const ROOT_DIR = path.resolve(__dirname, '../../../../');

/** 统一存储根：媒体 + SQLite */
export const STORAGE_DIR = path.join(ROOT_DIR, 'storage');

/** 任务媒体根：每个 job 独占一个子目录 */
export const JOBS_DIR = path.join(STORAGE_DIR, 'jobs');

/** SQLite 主库 */
export const SQLITE_DB = path.join(STORAGE_DIR, 'app.db');

/** 旧 JSON 存储路径（仅用于一次性迁移） */
export const JOBS_JSON = path.join(STORAGE_DIR, 'jobs.json');
export const LISTEN_JSON = path.join(STORAGE_DIR, 'listen.json');

/** 旧版按类型摊开的目录（仅迁移兼容） */
export const LEGACY_UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
export const LEGACY_AUDIO_DIR = path.join(STORAGE_DIR, 'audio');
export const LEGACY_TRANSCRIPT_DIR = path.join(STORAGE_DIR, 'transcripts');
export const LEGACY_PODCAST_DIR = path.join(STORAGE_DIR, 'podcasts');
export const LEGACY_BLOGS_DIR = path.join(STORAGE_DIR, 'blogs');

/**
 * 单任务目录内的规范文件布局：
 *
 * storage/jobs/{jobId}/
 *   source.{ext}      原始上传
 *   audio.mp3         可听源音频
 *   asr.mp3           ASR 专用
 *   transcript.txt    转写稿
 *   script.txt        播客脚本
 *   shownotes.md      节目笔记
 *   flashcards.json   知识闪卡
 *   podcast.mp3|.wav  合成播客
 */
export interface JobPaths {
  dir: string;
  source: (ext: string) => string;
  audio: string;
  asr: string;
  transcript: string;
  script: string;
  showNotes: string;
  flashcards: string;
  podcastMp3: string;
  podcastWav: string;
}

export function jobDir(jobId: string): string {
  return path.join(JOBS_DIR, jobId);
}

export function jobPaths(jobId: string): JobPaths {
  const dir = jobDir(jobId);
  return {
    dir,
    source: (ext: string) => {
      const normalized = ext.startsWith('.') ? ext : `.${ext}`;
      return path.join(dir, `source${normalized}`);
    },
    audio: path.join(dir, 'audio.mp3'),
    asr: path.join(dir, 'asr.mp3'),
    transcript: path.join(dir, 'transcript.txt'),
    script: path.join(dir, 'script.txt'),
    showNotes: path.join(dir, 'shownotes.md'),
    flashcards: path.join(dir, 'flashcards.json'),
    podcastMp3: path.join(dir, 'podcast.mp3'),
    podcastWav: path.join(dir, 'podcast.wav'),
  };
}
