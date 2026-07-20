export type {
  JobStatus,
  PipelineFromStep,
  SourceKind,
  TtsMode,
  PresetVoiceId,
  PodcastSegment,
  ScriptLineTiming,
  ScriptTimingSource,
  Flashcard,
  PodcastContent,
  ScriptPromptOptions,
  TtsOptions,
  JobPublic,
  ListenRecord,
  ScriptPromptMode,
  TtsSourceMode,
  LibraryItem,
  PresetVoiceMeta,
  HealthInfo,
} from '@bokebox/shared/job';

/** 前端任务即 API 对外公开结构 */
export type { JobPublic as Job } from '@bokebox/shared/job';
