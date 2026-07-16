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

/** 素材类型：本地/URL 导入后的识别结果 */
export type SourceKind = 'video' | 'audio' | 'text';

/** TTS 模式：自然口播 / 自定义音色 */
export type TtsMode = 'default' | 'voicedesign';

/**
 * MiMo mimo-v2.5-tts 预置精品音色 Voice ID
 * 文档：{"audio":{"voice":"mimo_default"}}
 */
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
  /** 稳定 id，便于前端状态绑定 */
  id: string;
  /** 正面：概念 / 问题 */
  front: string;
  /** 背面：解释 / 答案 */
  back: string;
  /** 可选提示 */
  hint?: string;
  /** 可选标签，如「概念」「对比」「行动」 */
  tags?: string[];
}

export interface PodcastContent {
  title: string;
  summary: string;
  tags: string[];
  hostIntro: string;
  outline: PodcastSegment[];
  /** 适合口播的完整脚本（可含音频标签） */
  script: string;
  /** 节目笔记（Markdown） */
  showNotes: string;
  /** 知识闪卡（独立 AI 生成） */
  flashcards?: Flashcard[];
  estimatedMinutes: number;
  coverGradient?: string;
}

export interface TtsOptions {
  mode: TtsMode;
  /**
   * 预置精品音色 ID（仅 default 使用 mimo-v2.5-tts）
   * 例：冰糖 / 茉莉 / 苏打 / 白桦 / mimo_default
   */
  voice?: PresetVoiceId | string;
  /** voicedesign 自定义音色描述 */
  voiceDesign?: string;
  /**
   * assistant 文本开头的风格标签（音频标签控制）
   * 例：['磁性','沉稳'] → (磁性 沉稳)正文…
   * 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
   * 注意：自然口播不支持 user 侧「风格指令」
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
  /**
   * 源媒体路径：
   * - video/audio: 下载或上传后的源文件
   * - text: 保存的 .txt 原文路径
   */
  videoPath: string;
  audioPath?: string;
  /** 最终播客音频路径（TTS 或源音频副本） */
  podcastAudioPath?: string;
  transcript?: string;
  podcast?: PodcastContent;
  tts?: TtsOptions;
  /** 是否在前台听播库展示 */
  published: boolean;
  /** 素材类型：视频 / 音频 / 文本 */
  sourceKind?: SourceKind;
  /** 远程导入地址（本地上传为空） */
  sourceUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type JobPublic = Omit<
  Job,
  'videoPath' | 'audioPath' | 'podcastAudioPath'
> & {
  hasVideo: boolean;
  hasSourceAudio: boolean;
  hasPodcastAudio: boolean;
  hasTranscript: boolean;
};

export interface ListenRecord {
  jobId: string;
  progressSec: number;
  durationSec: number;
  completed: boolean;
  lastListenedAt: string;
  playCount: number;
}
