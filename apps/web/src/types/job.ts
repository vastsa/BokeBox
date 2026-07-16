export type JobStatus =
  | 'queued'
  | 'extracting_audio'
  | 'transcribing'
  | 'generating_podcast'
  | 'synthesizing_audio'
  | 'done'
  | 'failed';

/** 重跑流水线起点：可跳过已完成步骤 */
export type PipelineFromStep =
  | 'extract'
  | 'transcribe'
  | 'script'
  | 'flashcards'
  | 'synthesize';

/** 素材类型 */
export type SourceKind = 'video' | 'audio' | 'text';

export type TtsMode = 'default' | 'voicedesign';

/** MiMo mimo-v2.5-tts 预置精品音色 Voice ID */
export type PresetVoiceId =
  | 'mimo_default'
  | '冰糖'
  | '茉莉'
  | '苏打'
  | '白桦'
  | 'Mia'
  | 'Chloe'
  | 'Milo'
  | 'Dean';

export interface PodcastSegment {
  title: string;
  summary: string;
}

/** 知识闪卡：问答对，便于复习记忆 */
export interface Flashcard {
  id: string;
  front: string;
  back: string;
  hint?: string;
  tags?: string[];
}

export interface PodcastContent {
  title: string;
  summary: string;
  tags: string[];
  hostIntro: string;
  outline: PodcastSegment[];
  script: string;
  showNotes: string;
  /** 知识闪卡（独立 AI 生成） */
  flashcards?: Flashcard[];
  estimatedMinutes: number;
  coverGradient?: string;
}

export interface TtsOptions {
  mode: TtsMode;
  /** 预置精品音色（default） */
  voice?: PresetVoiceId | string;
  voiceDesign?: string;
  /**
   * assistant 开头风格标签（音频标签控制）
   * 例：['磁性','沉稳'] → (磁性 沉稳)正文…
   * 自然口播不支持 user 侧风格指令
   */
  styleTags?: string[];
}

export interface Job {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  status: JobStatus;
  progress: number;
  message: string;
  transcript?: string;
  podcast?: PodcastContent;
  tts?: TtsOptions;
  published: boolean;
  /** 素材类型：视频 / 音频 / 文本 */
  sourceKind?: SourceKind;
  /** 远程导入地址 */
  sourceUrl?: string;
  hasVideo?: boolean;
  hasSourceAudio?: boolean;
  hasPodcastAudio?: boolean;
  hasTranscript?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListenRecord {
  jobId: string;
  progressSec: number;
  durationSec: number;
  completed: boolean;
  lastListenedAt: string;
  playCount: number;
}

export interface LibraryItem {
  job: Job;
  listen: ListenRecord | null;
}

export interface PresetVoiceMeta {
  id: string;
  name: string;
  language: string;
  gender: string;
  description?: string;
}

export interface HealthInfo {
  ok: boolean;
  demoMode: boolean;
  baseUrl?: string;
  models?: Record<string, string>;
  ttsModes?: Record<string, { label: string; modelHint: string; description: string }>;
  presetVoices?: PresetVoiceMeta[];
  defaultVoice?: string;
  /** 自然口播可选开头风格标签 */
  speechStyleTags?: string[];
  /** 正文细粒度音频标签示例 */
  audioTagExamples?: string[];
  /** @deprecated 兼容旧字段 */
  singStyleTags?: string[];
}
