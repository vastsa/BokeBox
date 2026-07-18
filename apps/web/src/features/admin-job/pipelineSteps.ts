import type { Job, JobStatus, PipelineFromStep } from '../../types/job';

export const PIPELINE: Array<{ key: string; labelKey: string; match: JobStatus[] }> = [
  { key: 'queued', labelKey: 'statusShort.queued', match: ['queued'] },
  { key: 'extracting_audio', labelKey: 'statusShort.extracting_audio', match: ['extracting_audio'] },
  { key: 'transcribing', labelKey: 'statusShort.transcribing', match: ['transcribing'] },
  { key: 'generating_podcast', labelKey: 'statusShort.generating_podcast', match: ['generating_podcast'] },
  { key: 'generating_cover', labelKey: 'statusShort.generating_cover', match: ['generating_cover'] },
  { key: 'synthesizing_audio', labelKey: 'statusShort.synthesizing_audio', match: ['synthesizing_audio'] },
  { key: 'done', labelKey: 'statusShort.done', match: ['done'] },
];

export const ACTIVE_STATUSES: JobStatus[] = [
  'queued',
  'extracting_audio',
  'transcribing',
  'generating_podcast',
  'generating_cover',
  'synthesizing_audio',
];

export const RERUN_STEPS: Array<{
  key: PipelineFromStep;
  labelKey: string;
  descKey: string;
  /** 需要哪些已有资产才能选该起点 */
  requires: Array<'audio' | 'transcript' | 'script'>;
}> = [
  {
    key: 'extract',
    labelKey: 'job.stepExtract',
    descKey: 'job.stepExtractDesc',
    requires: [],
  },
  {
    key: 'transcribe',
    labelKey: 'job.stepTranscribe',
    descKey: 'job.stepTranscribeDesc',
    requires: ['audio'],
  },
  {
    key: 'script',
    labelKey: 'job.stepGenerate',
    descKey: 'job.stepGenerateDesc',
    requires: ['audio', 'transcript'],
  },
  {
    key: 'cover',
    labelKey: 'job.stepCover',
    descKey: 'job.stepCoverDesc',
    requires: ['script'],
  },
  {
    key: 'flashcards',
    labelKey: 'job.stepFlashcards',
    descKey: 'job.stepFlashcardsDesc',
    requires: ['transcript', 'script'],
  },
  {
    key: 'synthesize',
    labelKey: 'job.stepSynthesize',
    descKey: 'job.stepSynthesizeDesc',
    requires: ['audio', 'script'],
  },
];

export function pickDefaultFromStep(job: Job): PipelineFromStep {
  const hasAudio = Boolean(job.hasSourceAudio);
  const hasTranscript = Boolean(job.hasTranscript || job.transcript?.trim());
  const hasScript = Boolean(job.podcast?.script?.trim());
  const hasCards = Boolean(job.podcast?.flashcards?.length);
  const hasCover = Boolean(job.podcast?.hasCoverImage);
  // 有脚本无封面时优先补封面
  if (hasScript && !hasCover) return 'cover';
  // 有脚本无闪卡时，默认补闪卡更省时
  if (hasScript && hasTranscript && !hasCards) return 'flashcards';
  if (hasScript && hasAudio) return 'synthesize';
  if (hasTranscript && hasAudio) return 'script';
  if (hasAudio) return 'transcribe';
  return 'extract';
}

export function canSelectFromStep(job: Job, step: PipelineFromStep): boolean {
  const meta = RERUN_STEPS.find((s) => s.key === step);
  if (!meta) return false;
  const hasAudio = Boolean(job.hasSourceAudio);
  const hasTranscript = Boolean(job.hasTranscript || job.transcript?.trim());
  const hasScript = Boolean(job.podcast?.script?.trim());
  // 文本任务无源音频也可生成脚本/闪卡；合成仍建议有占位音频，但后端可处理
  const kind = job.sourceKind || 'video';
  for (const req of meta.requires) {
    if (req === 'audio') {
      if (!hasAudio && kind !== 'text') return false;
      // 闪卡不需要 audio；script 在 text 下也不强制
      if (!hasAudio && kind === 'text' && step === 'synthesize') {
        // 允许：演示/真实 TTS 多数不依赖源音频内容
      }
    }
    if (req === 'transcript' && !hasTranscript) return false;
    if (req === 'script' && !hasScript) return false;
  }
  return true;
}

export function pipelineIndex(status: JobStatus): number {
  if (status === 'failed') return -1;
  if (status === 'done') return PIPELINE.length - 1;
  const idx = PIPELINE.findIndex((s) => s.match.includes(status));
  return idx >= 0 ? idx : 0;
}
