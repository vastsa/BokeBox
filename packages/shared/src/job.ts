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

/** 素材类型：本地/URL 导入后的识别结果 */
export type SourceKind = 'video' | 'audio' | 'text';

/** TTS 模式：自然口播 / 文字设计音色 / 参考音频克隆 */
export type TtsMode = 'default' | 'voicedesign' | 'voiceclone';

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

/** 口播脚本逐行时间轴（用于歌词/跟读对齐） */
export interface ScriptLineTiming {
  text: string;
  startSec: number;
  endSec: number;
}

export type ScriptTimingSource = 'estimated' | 'measured' | 'silence-aligned';

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
  /** 口播逐行时间轴（TTS 合成后写入，跟读对齐） */
  scriptTiming?: ScriptLineTiming[];
  /** 时间轴精度来源，前端据此明确展示“估算”或“已对齐” */
  scriptTimingSource?: ScriptTimingSource;
  estimatedMinutes: number;
  coverGradient?: string;
  /** 是否已生成并落盘 AI 封面图 */
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

export interface TtsOptions {
  mode: TtsMode;
  /**
   * - default：预置音色 ID（冰糖 / 茉莉 / …）
   * - voiceclone：参考音频路径或 data:audio/...;base64,...（也可用插件默认 cloneAudioPath）
   */
  voice?: PresetVoiceId | string;
  /** voicedesign 自定义音色描述 */
  voiceDesign?: string;
  /**
   * assistant 文本开头的风格标签（音频标签控制，仅 default）
   * 例：['磁性','沉稳'] → (磁性 沉稳)正文…
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
  /** 口播稿提示词干预（任务级快照） */
  scriptPrompt?: ScriptPromptOptions;
  /** 是否在前台听播库展示 */
  published: boolean;
  /** 素材类型：视频 / 音频 / 文本 */
  sourceKind?: SourceKind;
  /** 远程导入地址（本地上传为空） */
  sourceUrl?: string;
  /** 指定 Source 插件 id；缺省则自动匹配 */
  sourcePluginId?: string;
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

/** 上传时选择：用全局默认 或 本次单独设置 */
export type ScriptPromptMode = 'global' | 'custom';

/** TTS 音色来源：全局默认 或 本次单独 */
export type TtsSourceMode = 'global' | 'custom';

export interface LibraryItem {
  job: JobPublic;
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
