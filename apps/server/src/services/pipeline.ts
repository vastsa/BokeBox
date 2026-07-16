import fs from 'node:fs/promises';
import { extractAudio, generateSilentMp3 } from './audioExtractor.js';
import { transcribeAudio } from './transcriber.js';
import { generatePodcast } from './podcastGenerator.js';
import { maybeGeneratePodcastCover } from './coverGenerator.js';
import { hasImageModel } from '../utils/aiConfig.js';
import { generateFlashcards } from './flashcardGenerator.js';
import { synthesizePodcastAudio } from './ttsSynthesizer.js';
import { importUrlContent, isPlaceholderTitle } from './urlImporter.js';
import { getJob, updateJob } from './jobStore.js';
import { pathExists, writeText } from '../utils/fs.js';
import { jobPaths } from '../utils/paths.js';
import type { Job, JobStatus, PipelineFromStep, SourceKind } from '../types/job.js';

const running = new Set<string>();

export const PIPELINE_FROM_STEPS: PipelineFromStep[] = [
  'extract',
  'transcribe',
  'script',
  'cover',
  'flashcards',
  'synthesize',
];

export function isPipelineFromStep(value: unknown): value is PipelineFromStep {
  return (
    typeof value === 'string' &&
    (PIPELINE_FROM_STEPS as string[]).includes(value)
  );
}

export function stepIndex(step: PipelineFromStep): number {
  return PIPELINE_FROM_STEPS.indexOf(step);
}

async function setProgress(
  id: string,
  status: JobStatus,
  progress: number,
  message: string,
  extra: Parameters<typeof updateJob>[1] = {},
) {
  await updateJob(id, { status, progress, message, ...extra });
}

function kindOf(job: Job): SourceKind {
  return job.sourceKind || 'video';
}

function kindLabel(kind: SourceKind): string {
  if (kind === 'audio') return '音频';
  if (kind === 'text') return '文本';
  return '视频';
}

/** 读取文本素材正文：优先 DB transcript，其次源文件 */
async function loadTextContent(job: Job): Promise<string> {
  if (job.transcript?.trim()) return job.transcript.trim();
  if (job.videoPath && (await pathExists(job.videoPath))) {
    const raw = await fs.readFile(job.videoPath, 'utf8');
    return raw.trim();
  }
  const fallback = jobPaths(job.id).transcript;
  if (await pathExists(fallback)) {
    return (await fs.readFile(fallback, 'utf8')).trim();
  }
  return '';
}

/** 根据已有资产自动选最省时的可行起点 */
export async function resolveDefaultFromStep(job: Job): Promise<PipelineFromStep> {
  const paths = jobPaths(job.id);
  const kind = kindOf(job);
  const listenPath = job.audioPath || paths.audio;
  const hasAudio = Boolean(listenPath && (await pathExists(listenPath)));
  const hasTranscript =
    Boolean(job.transcript?.trim()) ||
    (kind === 'text' && Boolean(await loadTextContent(job)));
  const hasScript = Boolean(job.podcast?.script?.trim());
  const hasCards = Boolean(job.podcast?.flashcards?.length);
  const hasCover = Boolean(job.podcast?.hasCoverImage);

  // 有脚本但未生成封面，且配置了图片模型：补封面
  if (hasScript && !hasCover && hasImageModel()) return 'cover';
  // 有脚本但无闪卡：优先补闪卡
  if (hasScript && hasTranscript && !hasCards) return 'flashcards';
  if (hasScript && (hasAudio || kind === 'text')) return 'synthesize';
  if (hasTranscript) return 'script';
  if (hasAudio) return 'transcribe';
  return 'extract';
}

/** 根据起点清理下游产物字段，保留可复用资产 */
export function buildRetryPatch(
  job: Job,
  fromStep: PipelineFromStep,
  tts: Job['tts'],
  scriptPrompt?: Job['scriptPrompt'],
): Partial<Job> {
  const start = stepIndex(fromStep);
  const kind = kindOf(job);
  const patch: Partial<Job> = {
    status: 'queued',
    progress: 5,
    message: retryQueueMessage(fromStep),
    error: undefined,
    tts,
  };
  if (scriptPrompt !== undefined) {
    patch.scriptPrompt = scriptPrompt || undefined;
  }

  // 从提取开始：清空全部中间产物
  // 文本源的正文在源文件里，不清 transcript 也可；为一致起见文本保留 transcript
  if (start <= 0) {
    patch.audioPath = undefined;
    if (kind !== 'text') patch.transcript = undefined;
    patch.podcast = undefined;
    patch.podcastAudioPath = undefined;
    return patch;
  }

  // 从转写开始：保留音频
  if (start <= 1) {
    if (kind !== 'text') patch.transcript = undefined;
    patch.podcast = undefined;
    patch.podcastAudioPath = undefined;
    return patch;
  }

  // 从脚本开始：保留音频 + 转写，重做脚本/封面/笔记/闪卡/合成
  if (start <= 2) {
    patch.podcast = undefined;
    patch.podcastAudioPath = undefined;
    return patch;
  }

  // 仅重做封面：保留脚本/闪卡/音频，标记封面待生成
  if (fromStep === 'cover' || start === 3) {
    if (job.podcast) {
      patch.podcast = { ...job.podcast, hasCoverImage: false };
    }
    return patch;
  }

  // 从知识闪卡开始：保留脚本/笔记/封面，仅清闪卡；不强制重合成
  if (start <= 4) {
    if (job.podcast) {
      const { flashcards: _drop, ...rest } = job.podcast;
      patch.podcast = { ...rest, flashcards: undefined };
    }
    return patch;
  }

  // 仅合成：保留脚本与闪卡，清旧播客音频路径（文件会被覆盖）
  patch.podcastAudioPath = undefined;
  return patch;
}

function retryQueueMessage(fromStep: PipelineFromStep): string {
  switch (fromStep) {
    case 'extract':
      return '重新入队：从提取音频开始…';
    case 'transcribe':
      return '重新入队：复用已有音频，从转写开始…';
    case 'script':
      return '重新入队：复用转写，从脚本生成开始…';
    case 'cover':
      return '重新入队：复用脚本，仅重新生成封面…';
    case 'flashcards':
      return '重新入队：复用脚本，仅重新生成知识闪卡…';
    case 'synthesize':
      return '重新入队：复用脚本，仅重新合成…';
    default:
      return '重新入队…';
  }
}

/** 校验从某步启动所需的前置资产是否齐全 */
export async function assertPipelinePrereqs(
  job: Job,
  fromStep: PipelineFromStep,
): Promise<void> {
  const start = stepIndex(fromStep);
  const paths = jobPaths(job.id);
  const kind = kindOf(job);

  if (start >= 1) {
    // 文本任务不依赖已提取音频
    if (kind !== 'text') {
      const listenPath = job.audioPath || paths.audio;
      if (!(await pathExists(listenPath))) {
        throw new Error('缺少已提取的源音频，请从「提取音频」开始');
      }
    }
  }

  if (start >= 2) {
    const text =
      kind === 'text' ? await loadTextContent(job) : job.transcript?.trim();
    if (!text) {
      throw new Error('缺少转写文本，请从「转写」或更早步骤开始');
    }
  }

  if (start >= 3) {
    if (!job.podcast?.script?.trim()) {
      throw new Error('缺少播客脚本，请从「生成脚本」或更早步骤开始');
    }
  }
}

/**
 * 异步处理流水线：
 * - URL 未落盘 → 先下载识别
 * - text → 跳过抽音频/转写
 * - video/audio → 抽音频 → 转写 → 脚本 → (封面 ∥ 知识闪卡 ∥ TTS)
 * 脚本就绪后，封面 / 闪卡 / 合成彼此无依赖，默认并发执行以缩短总耗时。
 * fromStep 指定起点，可跳过已完成的前置步骤；仅封面 / 仅闪卡仍单独跑完即结束。
 */
export async function runPipeline(
  jobId: string,
  options: { fromStep?: PipelineFromStep } = {},
): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);

  const fromStep: PipelineFromStep = options.fromStep || 'extract';
  const start = stepIndex(fromStep);

  try {
    let job = await getJob(jobId);
    if (!job) return;

    // ── 0. URL 下载识别（无源文件时） ──
    if (job.sourceUrl && !job.videoPath) {
      await setProgress(jobId, 'queued', 8, '正在下载并识别远程内容…');
      const imported = await importUrlContent(job.sourceUrl, jobId);
      await setProgress(
        jobId,
        'queued',
        14,
        `已识别为${kindLabel(imported.kind)}，准备处理…`,
        {
          videoPath: imported.sourcePath,
          sourceKind: imported.kind,
          mimeType: imported.mimeType,
          size: imported.size,
          originalFilename: imported.filename,
          // 占位标题（hostname / 原 URL）优先用网页真实标题
          title: isPlaceholderTitle(job.title)
            ? imported.title || imported.filename
            : job.title || imported.title || imported.filename,
          transcript: imported.textContent,
        },
      );
      job = (await getJob(jobId))!;
    }

    await assertPipelinePrereqs(job, fromStep);

    const paths = jobPaths(jobId);
    const kind = kindOf(job);
    let listenPath = job.audioPath || paths.audio;
    let transcript = job.transcript || '';
    let podcast = job.podcast;

    // ── 文本：跳过抽音频 + ASR ──
    if (kind === 'text') {
      if (start <= 1) {
        await setProgress(jobId, 'transcribing', 20, '正在读取文本内容…');
        const text = await loadTextContent(job);
        if (!text || text.length < 20) {
          throw new Error('文本内容过短或为空，无法生成播客');
        }
        transcript = text;
        await writeText(paths.transcript, text);

        // TTS 演示回退需要占位音频；真实 TTS 不依赖其内容
        try {
          await generateSilentMp3(paths.audio, 1.2);
          listenPath = paths.audio;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // 静音生成失败不阻断：后续 TTS 有 API 时不需要源音频内容
          console.warn('[pipeline] generateSilentMp3 failed:', msg);
          listenPath = paths.audio;
        }

        await setProgress(jobId, 'transcribing', 55, '文本已就绪，已跳过语音转写', {
          transcript: text,
          audioPath: (await pathExists(paths.audio)) ? paths.audio : undefined,
        });
      } else {
        transcript = (await loadTextContent(job)) || transcript;
        await setProgress(jobId, 'transcribing', 55, '已跳过转写（复用文本）', {
          transcript,
        });
      }
    } else {
      // ── 1. 提取/规范化音频（视频或音频源） ──
      if (start <= 0) {
        if (!job.videoPath || !(await pathExists(job.videoPath))) {
          throw new Error(
            kind === 'audio' ? '音频源文件不存在' : '视频源文件不存在',
          );
        }
        await setProgress(
          jobId,
          'extracting_audio',
          12,
          kind === 'audio' ? '正在规范化音频…' : '正在从视频提取音频…',
        );
        const extracted = await extractAudio(job.videoPath, jobId);
        listenPath = extracted.listenPath;
        await setProgress(
          jobId,
          'extracting_audio',
          28,
          kind === 'audio' ? '音频准备完成' : '音频提取完成',
          { audioPath: listenPath },
        );
      } else {
        listenPath = job.audioPath || paths.audio;
        if (!(await pathExists(paths.asr))) {
          await setProgress(
            jobId,
            'extracting_audio',
            18,
            '源音频已有，补齐 ASR 音频…',
          );
          if (!job.videoPath || !(await pathExists(job.videoPath))) {
            throw new Error('缺少源媒体，无法补齐 ASR 音频');
          }
          const extracted = await extractAudio(job.videoPath, jobId);
          listenPath = extracted.listenPath;
          await setProgress(jobId, 'extracting_audio', 28, 'ASR 音频已就绪', {
            audioPath: listenPath,
          });
        } else {
          await setProgress(
            jobId,
            'extracting_audio',
            28,
            '已跳过音频提取（复用已有文件）',
            { audioPath: listenPath },
          );
        }
      }

      // ── 2. 转写 ──
      if (start <= 1) {
        await setProgress(jobId, 'transcribing', 38, '正在将语音转成文字…');
        const asrPath = (await pathExists(paths.asr)) ? paths.asr : listenPath;
        const { text, demo: demoAsr } = await transcribeAudio(asrPath, jobId);
        transcript = text;
        await setProgress(
          jobId,
          'transcribing',
          55,
          demoAsr ? '转写完成（演示模式）' : '转写完成',
          { transcript: text },
        );
      } else {
        await setProgress(
          jobId,
          'transcribing',
          55,
          '已跳过转写（复用已有文本）',
          { transcript },
        );
      }
    }

    // ── 3. 脚本 / 节目笔记 ──
    if (start <= 2) {
      if (!transcript.trim()) {
        transcript = (await getJob(jobId))?.transcript || '';
      }
      if (!transcript.trim()) {
        throw new Error('转写/文本为空，无法生成播客脚本');
      }
      await setProgress(jobId, 'generating_podcast', 65, '正在总结并生成播客脚本…');
      const latest = (await getJob(jobId)) || job;
      const { podcast: generated, demo: demoScript } = await generatePodcast(
        transcript,
        latest.originalFilename || latest.title,
        jobId,
        latest.scriptPrompt,
      );
      podcast = generated;
      await setProgress(
        jobId,
        'generating_podcast',
        72,
        demoScript ? '播客脚本已生成（演示模式）' : '播客脚本已生成',
        {
          podcast,
          title: podcast.title,
        },
      );
    } else if (fromStep !== 'flashcards' && fromStep !== 'cover') {
      await setProgress(
        jobId,
        'generating_podcast',
        72,
        '已跳过脚本生成（复用已有脚本）',
        {
          podcast,
          title: podcast?.title || job.title,
        },
      );
    }

    // ── 后半段：封面 / 闪卡 / TTS ──
    // 仅封面、仅闪卡仍串行并提前结束；完整路径下三者并发。
    if (!podcast) {
      podcast = (await getJob(jobId))?.podcast;
    }

    // ── 仅封面 ──
    if (fromStep === 'cover') {
      if (!podcast?.title && !podcast?.script?.trim()) {
        throw new Error('缺少播客脚本，无法生成封面');
      }

      if (hasImageModel()) {
        await setProgress(
          jobId,
          'generating_cover',
          40,
          '正在生成播客封面…',
          { podcast, title: podcast?.title || job.title },
        );
        podcast = await maybeGeneratePodcastCover(jobId, podcast!);
        await setProgress(
          jobId,
          'done',
          100,
          podcast.hasCoverImage
            ? '播客封面已更新'
            : '封面处理完成（未生成 AI 图）',
          {
            podcast,
            title: podcast.title,
            published: job.published ?? true,
          },
        );
      } else {
        podcast = podcast
          ? { ...podcast, hasCoverImage: false }
          : podcast;
        await setProgress(
          jobId,
          'done',
          100,
          '未配置图片模型，跳过 AI 封面',
          {
            podcast,
            title: podcast?.title || job.title,
            published: job.published ?? true,
          },
        );
      }
      return;
    }

    // ── 仅知识闪卡 ──
    if (fromStep === 'flashcards') {
      if (!transcript.trim()) {
        transcript = (await getJob(jobId))?.transcript || '';
      }
      if (!transcript.trim()) {
        throw new Error('转写/文本为空，无法生成知识闪卡');
      }
      if (!podcast?.script?.trim()) {
        throw new Error('缺少播客脚本，无法生成知识闪卡');
      }

      await setProgress(jobId, 'generating_podcast', 80, '正在生成知识闪卡…');
      const latestCards = (await getJob(jobId)) || job;
      const { flashcards, demo: demoCards } = await generateFlashcards({
        jobId,
        transcript,
        sourceTitle: latestCards.originalFilename || latestCards.title,
        podcast,
      });
      podcast = { ...podcast, flashcards };
      await setProgress(
        jobId,
        'done',
        100,
        demoCards
          ? '知识闪卡已更新（演示模式）'
          : `知识闪卡已更新（${flashcards.length} 张）`,
        {
          podcast,
          title: podcast.title,
          published: job.published ?? true,
        },
      );
      return;
    }

    if (!podcast?.script?.trim()) {
      throw new Error('缺少播客脚本，无法合成音频');
    }

    // ── 并发：封面 + 闪卡 + TTS（互不依赖） ──
    const needCover = start <= 3;
    const needFlashcards = start <= 4;

    job = (await getJob(jobId)) || job;
    // 文本任务可能没有有效 listenPath：再尝试生成静音占位
    if (!(await pathExists(listenPath))) {
      try {
        await generateSilentMp3(paths.audio, 1.2);
        listenPath = paths.audio;
      } catch {
        // TTS 正式模式不依赖源音频；演示模式才会 copy
        listenPath = paths.audio;
      }
    }

    const parallelLabels: string[] = [];
    if (needCover && hasImageModel()) parallelLabels.push('封面');
    if (needFlashcards) parallelLabels.push('闪卡');
    parallelLabels.push('音频');

    await setProgress(
      jobId,
      'synthesizing_audio',
      78,
      parallelLabels.length > 1
        ? `正在并发生成${parallelLabels.join(' / ')}…`
        : '正在合成播客音频…',
      {
        podcast,
        title: podcast.title,
      },
    );

    // 并发任务只读本地快照，避免互相覆盖 DB 写
    const podcastSnapshot = podcast;
    const transcriptSnapshot =
      transcript.trim() || (await getJob(jobId))?.transcript || '';
    const sourceTitle =
      job.originalFilename || job.title || podcastSnapshot.title;
    const ttsOptions = job.tts;
    const ttsSourcePath = listenPath;

    const coverTask = async () => {
      if (!needCover) return null;
      if (!hasImageModel()) {
        if (podcastSnapshot.hasCoverImage == null) {
          return { ...podcastSnapshot, hasCoverImage: false as const };
        }
        return podcastSnapshot;
      }
      return maybeGeneratePodcastCover(jobId, podcastSnapshot);
    };

    const cardsTask = async () => {
      if (!needFlashcards) return null;
      if (!transcriptSnapshot.trim()) {
        throw new Error('转写/文本为空，无法生成知识闪卡');
      }
      return generateFlashcards({
        jobId,
        transcript: transcriptSnapshot,
        sourceTitle,
        podcast: podcastSnapshot,
      });
    };

    const ttsTask = async () =>
      synthesizePodcastAudio({
        script: podcastSnapshot.script,
        sourceAudioPath: ttsSourcePath,
        jobId,
        tts: ttsOptions,
      });

    // allSettled：闪卡失败不拖垮封面与 TTS
    const [coverSettled, cardsSettled, ttsSettled] = await Promise.allSettled([
      coverTask(),
      cardsTask(),
      ttsTask(),
    ]);

    if (coverSettled.status === 'fulfilled' && coverSettled.value) {
      podcast = {
        ...podcast,
        hasCoverImage: coverSettled.value.hasCoverImage,
      };
    } else if (coverSettled.status === 'rejected') {
      const msg =
        coverSettled.reason instanceof Error
          ? coverSettled.reason.message
          : String(coverSettled.reason);
      console.warn('[pipeline] cover failed:', msg);
      podcast = { ...podcast, hasCoverImage: false };
    }

    let flashcardNote = '';
    if (needFlashcards) {
      if (cardsSettled.status === 'fulfilled' && cardsSettled.value) {
        const { flashcards, demo: demoCards } = cardsSettled.value;
        podcast = { ...podcast, flashcards };
        flashcardNote = demoCards
          ? ' · 闪卡演示'
          : ` · 闪卡${flashcards.length}张`;
      } else if (cardsSettled.status === 'rejected') {
        const msg =
          cardsSettled.reason instanceof Error
            ? cardsSettled.reason.message
            : String(cardsSettled.reason);
        console.warn('[pipeline] flashcards failed:', msg);
        flashcardNote = ` · 闪卡跳过`;
      }
    }

    if (ttsSettled.status === 'rejected') {
      throw ttsSettled.reason instanceof Error
        ? ttsSettled.reason
        : new Error(String(ttsSettled.reason));
    }

    const {
      audioPath: podcastAudioPath,
      demo: demoTts,
      mode,
      voice,
      scriptTiming,
    } = ttsSettled.value;

    if (scriptTiming?.length) {
      podcast = { ...podcast, scriptTiming };
    }

    const coverNote =
      needCover && hasImageModel()
        ? podcast.hasCoverImage
          ? ' · 含封面'
          : ' · 封面回退'
        : '';

    await setProgress(
      jobId,
      'done',
      100,
      demoTts
        ? `播客已生成（演示模式 · ${kindLabel(kind)}${coverNote}${flashcardNote}）`
        : `播客生成完成（${kindLabel(kind)} · TTS: ${mode}${voice ? ' / ' + voice : ''}${coverNote}${flashcardNote}）`,
      {
        podcastAudioPath,
        podcast,
        title: podcast.title,
        published: job.published ?? true,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'failed',
      progress: 100,
      message: '处理失败',
      error: message,
    });
  } finally {
    running.delete(jobId);
  }
}
