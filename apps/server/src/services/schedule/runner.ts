/**
 * 订阅执行器：拉取条目 → 去重 → 创建 Job → 入队 pipeline
 */
import { nanoid } from 'nanoid';
import type { Job } from '../../types/job.js';
import { createJob } from '../job/jobStore.js';
import { runPipeline } from '../job/pipeline.js';
import { attachJobToAlbumIfNeeded } from '../album/albumStore.js';
import {
  resolveJobLocale,
  resolveScriptPromptForJob,
  resolveTtsForJob,
} from '../../routes/jobs/helpers.js';
import { isValidHttpUrl } from '../import/index.js';
import { fetchScheduleCandidates } from './plugins/host.js';
import {
  finishScheduleRun,
  getSchedule,
  isItemSeen,
  markItemSeen,
  markScheduleRunStart,
} from './store.js';
import type {
  Schedule,
  ScheduleItemCandidate,
  ScheduleRun,
  ScheduleRunStatus,
} from './types.js';

const running = new Set<string>();

/**
 * 从候选中选出本轮要建任务的条目（纯函数，便于单测）
 */
export function selectScheduleItems(
  items: ScheduleItemCandidate[],
  options: {
    maxItems: number;
    onlyNew: boolean;
    isSeen: (key: string) => boolean;
  },
): { selected: ScheduleItemCandidate[]; skipped: number } {
  const selected: ScheduleItemCandidate[] = [];
  let skipped = 0;
  const max = Math.max(1, options.maxItems);
  const batchKeys = new Set<string>();
  for (const item of items) {
    if (!isValidHttpUrl(item.url)) {
      skipped += 1;
      continue;
    }
    const key = String(item.key || '').trim();
    if (!key) {
      skipped += 1;
      continue;
    }
    // 同一轮候选内相同 key 只取第一条
    if (batchKeys.has(key)) {
      skipped += 1;
      continue;
    }
    if (options.onlyNew && options.isSeen(key)) {
      skipped += 1;
      continue;
    }
    batchKeys.add(key);
    selected.push(item);
    if (selected.length >= max) break;
  }
  return { selected, skipped };
}


async function collectCandidates(
  schedule: Schedule,
): Promise<ScheduleItemCandidate[]> {
  const result = await fetchScheduleCandidates(schedule);
  return result.items;
}

/**
 * 解析订阅任务应使用的 Source 插件 id。
 * 只认 jobDefaults.sourcePluginId / pluginId；忽略 schedule.* 发现插件。
 */
export function resolveJobSourcePluginId(
  defaults: Schedule['jobDefaults'] | null | undefined,
): string | undefined {
  const raw = String(
    defaults?.sourcePluginId || defaults?.pluginId || '',
  ).trim();
  if (!raw || raw.startsWith('schedule.')) return undefined;
  return raw;
}

function buildTitle(schedule: Schedule, item: ScheduleItemCandidate): string {
  const prefix = String(schedule.jobDefaults.titlePrefix || '').trim();
  const base =
    String(item.title || '').trim() ||
    (() => {
      try {
        return new URL(item.url).hostname;
      } catch {
        return item.url;
      }
    })();
  if (!prefix) return base.slice(0, 120);
  return `${prefix}${base}`.slice(0, 120);
}

async function createJobFromItem(
  schedule: Schedule,
  item: ScheduleItemCandidate,
): Promise<string> {
  const defaults = schedule.jobDefaults || {};
  const tts = resolveTtsForJob(
    {
      ttsSourceMode: defaults.ttsSourceMode || 'global',
      tts: defaults.tts,
    },
    defaults.tts,
  );
  const scriptPrompt = resolveScriptPromptForJob(
    {
      scriptPromptMode: defaults.scriptPromptMode || 'global',
      scriptPrompt: defaults.scriptPrompt,
    },
    defaults.scriptPrompt,
  );
  const published =
    defaults.published === undefined ? true : Boolean(defaults.published);
  const id = nanoid(12);
  const now = new Date().toISOString();
  const title = buildTitle(schedule, item);
  // 内容采集：仅 jobDefaults.sourcePluginId（或兼容 pluginId）；空则 Source 自动匹配
  const sourcePluginId = resolveJobSourcePluginId(defaults);

  const job: Job = {
    id,
    title,
    originalFilename: item.url,
    mimeType: 'application/octet-stream',
    size: 0,
    status: 'queued',
    progress: 3,
    message: `定时订阅入队：${schedule.name}`,
    locale: resolveJobLocale(defaults.locale),
    videoPath: '',
    sourceUrl: item.url,
    sourcePluginId,
    sourceKind: 'video',
    tts,
    scriptPrompt,
    published,
    createdAt: now,
    updatedAt: now,
  };

  await createJob(job);
  await attachJobToAlbumIfNeeded(defaults.albumId, job.id);
  void runPipeline(id);
  return id;
}

function baseRunStub(
  runId: string,
  scheduleId: string,
  startedAt: string,
): ScheduleRun {
  return {
    id: runId,
    scheduleId,
    status: 'running',
    startedAt,
    finishedAt: null,
    fetched: 0,
    createdJobs: 0,
    skipped: 0,
    errors: [],
    jobIds: [],
  };
}

/** finish 失败时尽量仍返回可用 Run，避免调用方拿不到结果 */
function safeFinishScheduleRun(
  schedule: Schedule,
  run: ScheduleRun,
  result: {
    status: ScheduleRunStatus;
    fetched: number;
    createdJobs: number;
    skipped: number;
    errors: string[];
    jobIds: string[];
  },
): ScheduleRun {
  try {
    return finishScheduleRun(schedule, run, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[schedule] finishScheduleRun failed:', msg);
    const now = new Date().toISOString();
    return {
      ...run,
      status: result.status === 'running' ? 'failed' : result.status,
      finishedAt: now,
      fetched: result.fetched,
      createdJobs: result.createdJobs,
      skipped: result.skipped,
      errors: [...result.errors, `收尾写库失败: ${msg}`].slice(0, 20),
      jobIds: result.jobIds,
    };
  }
}

export async function runScheduleOnce(
  scheduleId: string,
  options: { force?: boolean } = {},
): Promise<ScheduleRun> {
  if (running.has(scheduleId)) {
    throw Object.assign(new Error('该订阅正在执行中'), { statusCode: 409 });
  }

  const schedule = getSchedule(scheduleId);
  if (!schedule) {
    throw Object.assign(new Error('订阅不存在'), { statusCode: 404 });
  }

  running.add(scheduleId);
  const runId = nanoid(12);
  const startedAt = new Date().toISOString();
  // 启动即预占 next_run，避免长任务期间被 scheduler 反复 due
  markScheduleRunStart(schedule, runId, startedAt);

  const errors: string[] = [];
  const jobIds: string[] = [];
  let fetched = 0;
  let createdJobs = 0;
  let skipped = 0;
  const runStub = baseRunStub(runId, scheduleId, startedAt);

  try {
    const items = await collectCandidates(schedule);
    fetched = items.length;

    // RSS 通常新条目在前；url_list 保持配置顺序
    const max = schedule.limits.maxItemsPerRun;
    const onlyNew = schedule.limits.onlyNew && !options.force;

    const picked = selectScheduleItems(items, {
      maxItems: max,
      onlyNew,
      isSeen: (key) => isItemSeen(schedule.id, key),
    });
    const selected = picked.selected;
    skipped = picked.skipped;

    for (const item of selected) {
      try {
        const jobId = await createJobFromItem(schedule, item);
        jobIds.push(jobId);
        createdJobs += 1;
        // 仅成功建 Job 记 seen；失败保留机会下一轮重试（force 可跳过 seen）
        markItemSeen(schedule.id, item.key, jobId, item.url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${item.url}: ${msg}`);
      }
    }

    let status: ScheduleRunStatus = 'success';
    if (errors.length && createdJobs === 0) status = 'failed';
    else if (errors.length) status = 'partial';
    else if (createdJobs === 0 && fetched > 0 && onlyNew) status = 'success';

    const latest = getSchedule(scheduleId) || schedule;
    return safeFinishScheduleRun(latest, runStub, {
      status,
      fetched,
      createdJobs,
      skipped,
      errors,
      jobIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    const latest = getSchedule(scheduleId) || schedule;
    return safeFinishScheduleRun(latest, runStub, {
      status: 'failed',
      fetched,
      createdJobs,
      skipped,
      errors,
      jobIds,
    });
  } finally {
    running.delete(scheduleId);
  }
}

export function isScheduleRunning(scheduleId: string): boolean {
  return running.has(scheduleId);
}
