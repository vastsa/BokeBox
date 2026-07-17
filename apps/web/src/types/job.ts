export type JobStatus =
  | 'queued'
  | 'extracting_audio'
  | 'transcribing'
  | 'generating_podcast'
  | 'generating_cover'
  | 'synthesizing_audio'
  | 'done'
  | 'failed';

/** 重跑流水线起点：可跳过已完成步骤 */
export type PipelineFromStep =
  | 'extract'
  | 'transcribe'
  | 'script'
  | 'cover'
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

/** 口播脚本逐行时间轴（用于歌词/跟读对齐） */
export interface ScriptLineTiming {
  text: string;
  startSec: number;
  endSec: number;
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
  /** 口播逐行时间轴（TTS 合成后写入，跟读对齐） */
  scriptTiming?: ScriptLineTiming[];
  estimatedMinutes: number;
  coverGradient?: string;
  /** 是否已生成 AI 封面图 */
  hasCoverImage?: boolean;
}

/** 口播稿提示词干预：角色 / 主播身份 / 风格等 */
export interface ScriptPromptOptions {
  /** 主播称呼，如「小白」 */
  hostName?: string;
  /** 主播身份角色，如「资深科技产品经理」 */
  hostIdentity?: string;
  /** 节目/品牌名，如「深一度」 */
  showName?: string;
  /** 说话风格，如「口语化、亲和、略带幽默」 */
  speakingStyle?: string;
  /** 目标听众，如「互联网从业者 / 创业者」 */
  audience?: string;
  /** 语气调性，如「沉稳专业」「轻松吐槽」 */
  tone?: string;
  /** 开场偏好，如「先抛结论再展开」 */
  openingStyle?: string;
  /** 收尾偏好，如「行动建议 + 下期预告」 */
  closingStyle?: string;
  /**
   * 口播稿字数上限（去除音频标签后的正文字数）
   * 例："1500"；未设置时使用系统默认 1600
   */
  maxChars?: string;
  /** 额外自由提示词（高级干预） */
  extraInstructions?: string;
}

/** 上传时选择：用全局默认 或 本次单独设置 */
export type ScriptPromptMode = 'global' | 'custom';

/** TTS 音色来源：全局默认 或 本次单独 */
export type TtsSourceMode = 'global' | 'custom';

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
  /** 任务内容语言：口播/闪卡/提示词 + 进度文案（创建时可指定，默认全局 contentLocale） */
  locale?: string;
  transcript?: string;
  podcast?: PodcastContent;
  tts?: TtsOptions;
  /** 口播稿提示词干预（任务级快照） */
  scriptPrompt?: ScriptPromptOptions;
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
