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
import {
  candidatesFromUrlList,
  fetchRssItems,
} from './rss.js';
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

async function collectCandidates(
  schedule: Schedule,
): Promise<ScheduleItemCandidate[]> {
  if (schedule.kind === 'url_list') {
    return candidatesFromUrlList(schedule.sourceConfig.urls || []);
  }
  const feedUrl = String(schedule.sourceConfig.feedUrl || '').trim();
  return fetchRssItems(feedUrl);
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
  const pluginId = String(defaults.pluginId || '').trim() || undefined;

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
    sourcePluginId: pluginId,
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
  markScheduleRunStart(scheduleId, runId, startedAt);

  const errors: string[] = [];
  const jobIds: string[] = [];
  let fetched = 0;
  let createdJobs = 0;
  let skipped = 0;

  try {
    let items = await collectCandidates(schedule);
    fetched = items.length;

    // RSS 通常新条目在前；url_list 保持配置顺序
    const max = schedule.limits.maxItemsPerRun;
    const onlyNew = schedule.limits.onlyNew && !options.force;

    const selected: ScheduleItemCandidate[] = [];
    for (const item of items) {
      if (!isValidHttpUrl(item.url)) {
        skipped += 1;
        continue;
      }
      if (onlyNew && isItemSeen(schedule.id, item.key)) {
        skipped += 1;
        continue;
      }
      selected.push(item);
      if (selected.length >= max) break;
    }

    for (const item of selected) {
      try {
        const jobId = await createJobFromItem(schedule, item);
        jobIds.push(jobId);
        createdJobs += 1;
        markItemSeen(schedule.id, item.key, jobId, item.url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${item.url}: ${msg}`);
        // 失败也记 seen，避免毒条目反复重试把额度打爆；force 时可再试
        if (onlyNew) {
          markItemSeen(schedule.id, item.key, null, item.url);
        }
      }
    }

    let status: ScheduleRunStatus = 'success';
    if (errors.length && createdJobs === 0) status = 'failed';
    else if (errors.length) status = 'partial';
    else if (createdJobs === 0 && fetched > 0 && onlyNew) status = 'success';

    const latest = getSchedule(scheduleId) || schedule;
    return finishScheduleRun(latest, {
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
    }, {
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
    return finishScheduleRun(latest, {
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
    }, {
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
