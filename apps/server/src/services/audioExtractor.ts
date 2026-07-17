import ffmpeg from 'fluent-ffmpeg';
import path from 'node:path';
import { jobPaths } from '../utils/paths.js';
import { ensureDir, pathExists } from '../utils/fs.js';
import { resolveFfmpegPath } from '../utils/ffmpeg.js';

const ffmpegPath = resolveFfmpegPath();

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface ExtractedAudio {
  /** 可听高质量源音频（前台/后台播放） */
  listenPath: string;
  /** ASR 专用 16k 单声道 */
  asrPath: string;
}

function runFfmpeg(
  input: string,
  build: (cmd: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = build(ffmpeg(input));
    cmd
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        const msg = err.message || String(err);
        if (/does not contain any stream|Stream map|no audio|Output file does not contain/i.test(msg)) {
          reject(new Error('媒体没有可用音轨，无法提取音频'));
          return;
        }
        if (/Cannot find ffprobe/i.test(msg)) {
          reject(new Error('音频处理失败：缺少 ffprobe（已修复，请重试）'));
          return;
        }
        reject(err);
      })
      .run();
  });
}

/**
 * 从视频提取音频（不依赖 ffprobe）：
 * 1. 高质量可听 mp3（44.1kHz 立体声 + 响度标准化）
 * 2. ASR 用 16kHz 单声道 mp3
 */
export async function extractAudio(
  videoPath: string,
  jobId: string,
): Promise<ExtractedAudio> {
  const paths = jobPaths(jobId);
  await ensureDir(paths.dir);

  if (!(await pathExists(videoPath))) {
    throw new Error('源媒体文件不存在');
  }

  const listenPath = paths.audio;
  const asrPath = paths.asr;

  // 高质量可听版本：立体声 + 响度标准化
  // 注意：不调用 ffprobe，避免 ffmpeg-static 环境缺少 ffprobe
  try {
    await runFfmpeg(videoPath, (cmd) =>
      cmd
        .noVideo()
        .audioCodec('libmp3lame')
        .audioChannels(2)
        .audioFrequency(44100)
        .audioBitrate('192k')
        .audioFilters(['dynaudnorm=f=150:g=15', 'loudnorm=I=-16:TP=-1.5:LRA=11'])
        .format('mp3')
        .output(listenPath),
    );
  } catch (err) {
    // 部分滤镜失败时降级为纯提取，保证主流程可用
    const msg = err instanceof Error ? err.message : String(err);
    if (/没有可用音轨/.test(msg)) throw err;
    await runFfmpeg(videoPath, (cmd) =>
      cmd
        .noVideo()
        .audioCodec('libmp3lame')
        .audioChannels(2)
        .audioFrequency(44100)
        .audioBitrate('192k')
        .format('mp3')
        .output(listenPath),
    );
  }

  if (!(await pathExists(listenPath))) {
    throw new Error('音频提取失败：未生成可听文件');
  }

  // ASR 版本：小体积，便于上传识别
  await runFfmpeg(listenPath, (cmd) =>
    cmd
      .noVideo()
      .audioCodec('libmp3lame')
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('64k')
      .format('mp3')
      .output(asrPath),
  );

  return { listenPath, asrPath };
}

/** 将 wav/任意音频转成可 seek 的 mp3 */
export async function convertToMp3(inputPath: string, outputPath: string): Promise<string> {
  await ensureDir(path.dirname(outputPath));
  await runFfmpeg(inputPath, (cmd) =>
    cmd
      .noVideo()
      .audioCodec('libmp3lame')
      .audioChannels(2)
      .audioFrequency(44100)
      .audioBitrate('192k')
      .format('mp3')
      .output(outputPath),
  );
  return outputPath;
}


/** 生成极短静音 mp3（文本任务演示回退 / 占位用） */
export async function generateSilentMp3(
  outputPath: string,
  seconds = 1,
): Promise<string> {
  await ensureDir(path.dirname(outputPath));
  const dur = Math.max(0.3, seconds);
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputFormat('lavfi')
      .noVideo()
      .duration(dur)
      .audioCodec('libmp3lame')
      .audioChannels(2)
      .audioFrequency(44100)
      .audioBitrate('96k')
      .format('mp3')
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error, _stdout?: string | null, stderr?: string | null) => {
        const detail = (stderr || err.message || '').toString().trim();
        reject(new Error(`生成占位静音失败: ${detail.slice(-300) || err.message}`));
      })
      .run();
  });
}
