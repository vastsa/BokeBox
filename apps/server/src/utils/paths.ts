import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 应用根目录：
 * - 开发/ monorepo：默认回退到仓库根（apps/server/dist/utils → ../../../../）
 * - Docker 精简布局：通过 BOKEBOX_ROOT / ROOT_DIR 指定（如 /app）
 */
function resolveRootDir(): string {
  const fromEnv =
    process.env.BOKEBOX_ROOT?.trim() ||
    process.env.ROOT_DIR?.trim() ||
    '';
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(__dirname, '../../../../');
}

/** monorepo 根目录 / 容器应用根 */
export const ROOT_DIR = resolveRootDir();

/** 统一存储根：媒体 + SQLite（可用 STORAGE_DIR 覆盖，便于挂载） */
export const STORAGE_DIR = process.env.STORAGE_DIR?.trim()
  ? path.resolve(process.env.STORAGE_DIR.trim())
  : path.join(ROOT_DIR, 'storage');

/** 前端静态资源目录（Docker 精简布局用 WEB_DIST=/app/web） */
export function resolveWebDistDir(fromModuleDir: string = __dirname): string {
  const fromEnv = process.env.WEB_DIST?.trim() || process.env.BOKEBOX_WEB_DIST?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  // monorepo: apps/server/dist → apps/web/dist
  return path.resolve(fromModuleDir, '../../web/dist');
}

/** 任务媒体根：每个 job 独占一个子目录 */
export const JOBS_DIR = path.join(STORAGE_DIR, 'jobs');

/** 专辑媒体根：每个 album 独占一个子目录（封面等） */
export const ALBUMS_DIR = path.join(STORAGE_DIR, 'albums');

/**
 * 外部 Source 插件目录（仅本地加载，不支持远程安装）
 * storage/plugins/source/<plugin-dir>/plugin.json + entry
 */
export const SOURCE_PLUGINS_DIR = path.join(STORAGE_DIR, 'plugins', 'source');

/**
 * 外部 ASR 插件目录
 * storage/plugins/asr/<plugin-dir>/plugin.json + entry
 */
export const ASR_PLUGINS_DIR = path.join(STORAGE_DIR, 'plugins', 'asr');

/**
 * 外部 TTS 插件目录
 * storage/plugins/tts/<plugin-dir>/plugin.json + entry
 */
export const TTS_PLUGINS_DIR = path.join(STORAGE_DIR, 'plugins', 'tts');

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
 *   script-timing.json 口播行时间轴
 *   podcast.mp3|.wav  合成播客
 *   cover.webp|png|jpg  AI 封面主图（可选，默认 webp 压缩）
 *   cover.thumb|sm|md.webp  缩略图变体（按需/预生成）
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
  scriptTiming: string;
  podcastMp3: string;
  podcastWav: string;
  /** 默认封面路径（兼容旧 png）；实际多为 cover.webp + 缩略图变体 */
  cover: string;
}

export function jobDir(jobId: string): string {
  return path.join(JOBS_DIR, jobId);
}

export function albumDir(albumId: string): string {
  return path.join(ALBUMS_DIR, albumId);
}

export type AlbumPaths = {
  dir: string;
  /** 默认封面路径（兼容旧 png）；实际多为 cover.webp + 缩略图变体 */
  cover: string;
};

export function albumPaths(albumId: string): AlbumPaths {
  const dir = albumDir(albumId);
  return {
    dir,
    cover: path.join(dir, 'cover.webp'),
  };
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
    scriptTiming: path.join(dir, 'script-timing.json'),
    podcastMp3: path.join(dir, 'podcast.mp3'),
    podcastWav: path.join(dir, 'podcast.wav'),
    cover: path.join(dir, 'cover.webp'),
  };
}
