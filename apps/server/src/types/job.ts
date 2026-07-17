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

/** 口播脚本逐行时间轴（用于歌词/跟读对齐） */
export interface ScriptLineTiming {
  text: string;
  startSec: number;
  endSec: number;
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
  /** 口播逐行时间轴（TTS 合成后写入，跟读对齐） */
  scriptTiming?: ScriptLineTiming[];
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
  /** 任务内容语言：口播/闪卡/提示词 + 进度文案（创建时可指定，默认全局 contentLocale） */
  locale?: 'zh-CN' | 'en-US';
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
