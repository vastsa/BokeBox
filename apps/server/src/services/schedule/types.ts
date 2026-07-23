/**
 * 定时订阅任务类型
 */
import type { ScriptPromptOptions, TtsOptions } from '../../types/job.js';

export type ScheduleKind = 'rss' | 'url_list';

export type SchedulePreset =
  | 'hourly'
  | 'every_6h'
  | 'daily'
  | 'weekly'
  | 'cron';

export type ScheduleRunStatus = 'running' | 'success' | 'partial' | 'failed';

export interface ScheduleSourceConfig {
  /** RSS / Atom 地址 */
  feedUrl?: string;
  /** 固定 URL 列表（如 GitHub 趋势页、日报页） */
  urls?: string[];
}

export interface ScheduleJobDefaults {
  albumId?: string | null;
  published?: boolean;
  locale?: string;
  titlePrefix?: string;
  ttsSourceMode?: 'global' | 'custom';
  tts?: Partial<TtsOptions> | null;
  scriptPromptMode?: 'global' | 'custom';
  scriptPrompt?: Partial<ScriptPromptOptions> | null;
  pluginId?: string;
}

export interface ScheduleLimits {
  /** 每轮最多新建任务数 */
  maxItemsPerRun: number;
  /** 仅处理订阅中「新条目」 */
  onlyNew: boolean;
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  kind: ScheduleKind;
  sourceConfig: ScheduleSourceConfig;
  /** 预设节奏；cron 时用 cron 表达式 */
  preset: SchedulePreset;
  /** 标准 5 段 cron：分 时 日 月 周 */
  cron: string;
  timezone: string;
  jobDefaults: ScheduleJobDefaults;
  limits: ScheduleLimits;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: ScheduleRunStatus | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  status: ScheduleRunStatus;
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  createdJobs: number;
  skipped: number;
  errors: string[];
  jobIds: string[];
}

export interface ScheduleItemCandidate {
  key: string;
  url: string;
  title?: string;
  publishedAt?: string | null;
  summary?: string;
}

export interface CreateScheduleInput {
  name: string;
  enabled?: boolean;
  kind: ScheduleKind;
  sourceConfig: ScheduleSourceConfig;
  preset?: SchedulePreset;
  cron?: string;
  timezone?: string;
  jobDefaults?: ScheduleJobDefaults;
  limits?: Partial<ScheduleLimits>;
}

export interface UpdateScheduleInput {
  name?: string;
  enabled?: boolean;
  kind?: ScheduleKind;
  sourceConfig?: ScheduleSourceConfig;
  preset?: SchedulePreset;
  cron?: string;
  timezone?: string;
  jobDefaults?: ScheduleJobDefaults;
  limits?: Partial<ScheduleLimits>;
}

export interface SchedulePublic extends Schedule {
  recentRuns?: ScheduleRun[];
}
