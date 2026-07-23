import { request } from './http';

export type ScheduleKind = 'rss' | 'url_list' | 'plugin';
export type SchedulePreset =
  | 'hourly'
  | 'every_6h'
  | 'daily'
  | 'weekly'
  | 'cron';
export type ScheduleRunStatus = 'running' | 'success' | 'partial' | 'failed';

export interface ScheduleSourceConfig {
  feedUrl?: string;
  urls?: string[];
  pluginId?: string;
  params?: Record<string, unknown>;
}

export interface ScheduleJobDefaults {
  albumId?: string | null;
  published?: boolean;
  locale?: string;
  titlePrefix?: string;
  pluginId?: string;
}

export interface ScheduleLimits {
  maxItemsPerRun: number;
  onlyNew: boolean;
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  kind: ScheduleKind;
  sourceConfig: ScheduleSourceConfig;
  preset: SchedulePreset;
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

export interface SchedulePresetOption {
  id: string;
  cron: string;
  labelZh: string;
  labelEn: string;
}

export interface CreateScheduleBody {
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

export type UpdateScheduleBody = Partial<CreateScheduleBody>;

export async function fetchSchedules(): Promise<Schedule[]> {
  const data = await request<{ schedules: Schedule[] }>('/schedules');
  return data.schedules || [];
}

export async function fetchSchedule(
  id: string,
): Promise<{ schedule: Schedule; runs: ScheduleRun[] }> {
  return request<{ schedule: Schedule; runs: ScheduleRun[] }>(
    `/schedules/${encodeURIComponent(id)}`,
  );
}

export async function createScheduleApi(
  body: CreateScheduleBody,
): Promise<Schedule> {
  const data = await request<{ schedule: Schedule }>('/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.schedule;
}

export async function updateScheduleApi(
  id: string,
  body: UpdateScheduleBody,
): Promise<Schedule> {
  const data = await request<{ schedule: Schedule }>(
    `/schedules/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return data.schedule;
}

export async function deleteScheduleApi(id: string): Promise<void> {
  await request(`/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function runScheduleApi(
  id: string,
  body: { force?: boolean } = {},
): Promise<{ run: ScheduleRun; schedule: Schedule | null }> {
  return request<{ run: ScheduleRun; schedule: Schedule | null }>(
    `/schedules/${encodeURIComponent(id)}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

export async function fetchSchedulePresets(): Promise<SchedulePresetOption[]> {
  const data = await request<{ presets: SchedulePresetOption[] }>(
    '/schedules/meta/presets',
  );
  return data.presets || [];
}

export async function fetchScheduleRuns(
  id: string,
  limit = 5,
): Promise<ScheduleRun[]> {
  const data = await request<{ runs: ScheduleRun[] }>(
    `/schedules/${encodeURIComponent(id)}/runs?limit=${limit}`,
  );
  return data.runs || [];
}
