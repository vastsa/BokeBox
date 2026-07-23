/**
 * 定时订阅 SQLite 存储
 */
import { nanoid } from 'nanoid';
import { getDb } from '../../db/sqlite.js';
import type {
  CreateScheduleInput,
  Schedule,
  ScheduleJobDefaults,
  ScheduleKind,
  ScheduleLimits,
  SchedulePreset,
  ScheduleRun,
  ScheduleRunStatus,
  ScheduleSourceConfig,
  UpdateScheduleInput,
} from './types.js';
import { cronFromPreset, getNextRunAt, isValidCron } from './cron.js';

interface ScheduleRow {
  id: string;
  name: string;
  enabled: number;
  kind: string;
  source_config_json: string;
  preset: string;
  cron: string;
  timezone: string;
  job_defaults_json: string;
  limits_json: string;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  schedule_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  fetched: number;
  created_jobs: number;
  skipped: number;
  errors_json: string;
  job_ids_json: string;
}

const DEFAULT_LIMITS: ScheduleLimits = {
  maxItemsPerRun: 3,
  onlyNew: true,
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    kind: row.kind as ScheduleKind,
    sourceConfig: parseJson<ScheduleSourceConfig>(row.source_config_json, {}),
    preset: row.preset as SchedulePreset,
    cron: row.cron,
    timezone: row.timezone || 'Asia/Shanghai',
    jobDefaults: parseJson<ScheduleJobDefaults>(row.job_defaults_json, {}),
    limits: {
      ...DEFAULT_LIMITS,
      ...parseJson<Partial<ScheduleLimits>>(row.limits_json, {}),
    },
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastStatus: (row.last_status as ScheduleRunStatus | null) || null,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRun(row: RunRow): ScheduleRun {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    status: row.status as ScheduleRunStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    fetched: row.fetched || 0,
    createdJobs: row.created_jobs || 0,
    skipped: row.skipped || 0,
    errors: parseJson<string[]>(row.errors_json, []),
    jobIds: parseJson<string[]>(row.job_ids_json, []),
  };
}

function normalizeKind(raw: unknown): ScheduleKind {
  const k = String(raw || '').trim();
  // 兼容历史：rss / url_list 仍可读；新建默认 plugin
  if (k === 'url_list') return 'url_list';
  if (k === 'rss') return 'rss';
  return 'plugin';
}

function normalizePreset(raw: unknown): SchedulePreset {
  const p = String(raw || 'daily').trim();
  if (
    p === 'hourly' ||
    p === 'every_6h' ||
    p === 'daily' ||
    p === 'weekly' ||
    p === 'cron'
  ) {
    return p;
  }
  return 'daily';
}

function normalizeLimits(input?: Partial<ScheduleLimits> | null): ScheduleLimits {
  const max = Number(input?.maxItemsPerRun);
  return {
    maxItemsPerRun: Number.isFinite(max)
      ? Math.min(20, Math.max(1, Math.floor(max)))
      : DEFAULT_LIMITS.maxItemsPerRun,
    onlyNew: input?.onlyNew === undefined ? true : Boolean(input.onlyNew),
  };
}

function normalizeSourceConfig(
  kind: ScheduleKind,
  input?: ScheduleSourceConfig | null,
): ScheduleSourceConfig {
  const cfg = input || {};
  let pluginId = String(cfg.pluginId || '').trim() || undefined;
  // 历史 kind 补齐 pluginId
  if (!pluginId) {
    if (kind === 'rss') pluginId = 'schedule.rss';
    else if (kind === 'url_list') pluginId = 'schedule.url-list';
  }

  let params: Record<string, unknown> | undefined =
    cfg.params && typeof cfg.params === 'object' && !Array.isArray(cfg.params)
      ? { ...(cfg.params as Record<string, unknown>) }
      : undefined;

  const feedUrlRaw = String(cfg.feedUrl || params?.feedUrl || '').trim();
  const urlsRaw = Array.isArray(cfg.urls)
    ? cfg.urls.map((u) => String(u || '').trim()).filter(Boolean)
    : Array.isArray(params?.urls)
      ? (params!.urls as unknown[]).map((u) => String(u || '').trim()).filter(Boolean)
      : String((cfg as { feedUrl?: string }).feedUrl || '')
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);

  // 统一把内置参数写入 params，便于 plugin.fetch
  if (pluginId === 'schedule.rss' || kind === 'rss') {
    params = { ...(params || {}), feedUrl: feedUrlRaw || String(params?.feedUrl || '') };
  }
  if (pluginId === 'schedule.url-list' || kind === 'url_list') {
    params = { ...(params || {}), urls: urlsRaw.length ? urlsRaw : (params?.urls as string[]) || [] };
  }

  return {
    pluginId,
    params,
    feedUrl: feedUrlRaw || undefined,
    urls: urlsRaw.length ? urlsRaw : undefined,
  };
}

function validateSource(kind: ScheduleKind, cfg: ScheduleSourceConfig): string | null {
  const pluginId =
    String(cfg.pluginId || '').trim() ||
    (kind === 'rss'
      ? 'schedule.rss'
      : kind === 'url_list'
        ? 'schedule.url-list'
        : '');
  if (!pluginId) return '请选择订阅插件';

  const feedUrl = String(cfg.feedUrl || cfg.params?.feedUrl || '').trim();
  const urls = Array.isArray(cfg.urls)
    ? cfg.urls
    : Array.isArray(cfg.params?.urls)
      ? (cfg.params?.urls as unknown[])
      : [];

  if (pluginId === 'schedule.rss' || kind === 'rss') {
    if (!feedUrl) return '请填写 RSS 地址';
    return null;
  }
  if (pluginId === 'schedule.url-list' || kind === 'url_list') {
    if (!urls.length) return '请至少填写一个 URL';
    return null;
  }
  return null;
}

export function validateScheduleInput(
  input: CreateScheduleInput | UpdateScheduleInput,
  existing?: Schedule,
): string | null {
  const name = input.name !== undefined ? String(input.name || '').trim() : existing?.name;
  if (!name) return '请填写订阅名称';
  if (name.length > 80) return '名称过长（最多 80 字）';

  const kind = input.kind
    ? normalizeKind(input.kind)
    : existing?.kind || 'plugin';
  const sourceConfig = input.sourceConfig
    ? normalizeSourceConfig(kind, input.sourceConfig)
    : existing
      ? existing.sourceConfig
      : normalizeSourceConfig(kind, {});
  const srcErr = validateSource(kind, sourceConfig);
  if (srcErr) return srcErr;

  const preset = input.preset
    ? normalizePreset(input.preset)
    : existing?.preset || 'daily';
  const cron = cronFromPreset(
    preset,
    input.cron !== undefined ? input.cron : existing?.cron,
  );
  if (!isValidCron(cron)) return 'Cron 表达式无效（需要 5 段：分 时 日 月 周）';

  const timezone = String(
    input.timezone !== undefined ? input.timezone : existing?.timezone || 'Asia/Shanghai',
  ).trim();
  if (!timezone) return '请填写时区';
  try {
    // 校验 IANA 时区
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    return '时区无效';
  }

  return null;
}

function buildScheduleFromInput(
  input: CreateScheduleInput,
  id: string,
  now: string,
): Schedule {
  const kind = normalizeKind(input.kind || 'plugin');
  const preset = normalizePreset(input.preset);
  const cron = cronFromPreset(preset, input.cron);
  const timezone = String(input.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai';
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  return {
    id,
    name: String(input.name || '').trim(),
    enabled,
    kind,
    sourceConfig: normalizeSourceConfig(kind, input.sourceConfig),
    preset,
    cron,
    timezone,
    jobDefaults: input.jobDefaults || {},
    limits: normalizeLimits(input.limits),
    lastRunAt: null,
    nextRunAt: enabled ? getNextRunAt(cron, timezone, new Date(now)) : null,
    lastStatus: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function listSchedules(): Schedule[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM schedules ORDER BY updated_at DESC`)
    .all() as unknown as ScheduleRow[];
  return rows.map(rowToSchedule);
}

export function getSchedule(id: string): Schedule | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM schedules WHERE id = ?`)
    .get(id) as unknown as ScheduleRow | undefined;
  return row ? rowToSchedule(row) : null;
}

export function createSchedule(input: CreateScheduleInput): Schedule {
  const err = validateScheduleInput(input);
  if (err) throw Object.assign(new Error(err), { statusCode: 400 });

  const now = new Date().toISOString();
  const schedule = buildScheduleFromInput(input, nanoid(12), now);
  const db = getDb();
  db.prepare(
    `INSERT INTO schedules (
      id, name, enabled, kind, source_config_json, preset, cron, timezone,
      job_defaults_json, limits_json, last_run_at, next_run_at, last_status,
      last_error, created_at, updated_at
    ) VALUES (
      @id, @name, @enabled, @kind, @source_config_json, @preset, @cron, @timezone,
      @job_defaults_json, @limits_json, @last_run_at, @next_run_at, @last_status,
      @last_error, @created_at, @updated_at
    )`,
  ).run({
    id: schedule.id,
    name: schedule.name,
    enabled: schedule.enabled ? 1 : 0,
    kind: schedule.kind,
    source_config_json: JSON.stringify(schedule.sourceConfig),
    preset: schedule.preset,
    cron: schedule.cron,
    timezone: schedule.timezone,
    job_defaults_json: JSON.stringify(schedule.jobDefaults || {}),
    limits_json: JSON.stringify(schedule.limits),
    last_run_at: schedule.lastRunAt,
    next_run_at: schedule.nextRunAt,
    last_status: schedule.lastStatus,
    last_error: schedule.lastError,
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt,
  });
  return schedule;
}

export function updateSchedule(
  id: string,
  input: UpdateScheduleInput,
): Schedule {
  const existing = getSchedule(id);
  if (!existing) {
    throw Object.assign(new Error('订阅不存在'), { statusCode: 404 });
  }
  const err = validateScheduleInput(input, existing);
  if (err) throw Object.assign(new Error(err), { statusCode: 400 });

  const kind = input.kind ? normalizeKind(input.kind) : existing.kind;
  const preset = input.preset ? normalizePreset(input.preset) : existing.preset;
  const cron = cronFromPreset(
    preset,
    input.cron !== undefined ? input.cron : existing.cron,
  );
  const timezone =
    String(input.timezone !== undefined ? input.timezone : existing.timezone).trim() ||
    'Asia/Shanghai';
  const enabled =
    input.enabled === undefined ? existing.enabled : Boolean(input.enabled);
  const now = new Date().toISOString();

  const next: Schedule = {
    ...existing,
    name:
      input.name !== undefined ? String(input.name || '').trim() : existing.name,
    enabled,
    kind,
    sourceConfig: input.sourceConfig
      ? normalizeSourceConfig(kind, input.sourceConfig)
      : existing.sourceConfig,
    preset,
    cron,
    timezone,
    jobDefaults:
      input.jobDefaults !== undefined
        ? input.jobDefaults || {}
        : existing.jobDefaults,
    limits:
      input.limits !== undefined
        ? normalizeLimits({ ...existing.limits, ...input.limits })
        : existing.limits,
    nextRunAt: enabled ? getNextRunAt(cron, timezone, new Date(now)) : null,
    updatedAt: now,
  };

  const db = getDb();
  db.prepare(
    `UPDATE schedules SET
      name = @name,
      enabled = @enabled,
      kind = @kind,
      source_config_json = @source_config_json,
      preset = @preset,
      cron = @cron,
      timezone = @timezone,
      job_defaults_json = @job_defaults_json,
      limits_json = @limits_json,
      next_run_at = @next_run_at,
      updated_at = @updated_at
    WHERE id = @id`,
  ).run({
    id: next.id,
    name: next.name,
    enabled: next.enabled ? 1 : 0,
    kind: next.kind,
    source_config_json: JSON.stringify(next.sourceConfig),
    preset: next.preset,
    cron: next.cron,
    timezone: next.timezone,
    job_defaults_json: JSON.stringify(next.jobDefaults || {}),
    limits_json: JSON.stringify(next.limits),
    next_run_at: next.nextRunAt,
    updated_at: next.updatedAt,
  });
  return getSchedule(id)!;
}

export function deleteSchedule(id: string): boolean {
  const db = getDb();
  const r = db.prepare(`DELETE FROM schedules WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM schedule_runs WHERE schedule_id = ?`).run(id);
  db.prepare(`DELETE FROM schedule_seen_items WHERE schedule_id = ?`).run(id);
  return Number(r.changes || 0) > 0;
}

export function listDueSchedules(nowIso: string): Schedule[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM schedules
       WHERE enabled = 1
         AND next_run_at IS NOT NULL
         AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
    )
    .all(nowIso) as unknown as ScheduleRow[];
  return rows.map(rowToSchedule);
}

export function markScheduleRunStart(scheduleId: string, runId: string, now: string): ScheduleRun {
  const db = getDb();
  const run: ScheduleRun = {
    id: runId,
    scheduleId,
    status: 'running',
    startedAt: now,
    finishedAt: null,
    fetched: 0,
    createdJobs: 0,
    skipped: 0,
    errors: [],
    jobIds: [],
  };
  db.prepare(
    `INSERT INTO schedule_runs (
      id, schedule_id, status, started_at, finished_at,
      fetched, created_jobs, skipped, errors_json, job_ids_json
    ) VALUES (
      @id, @schedule_id, @status, @started_at, @finished_at,
      @fetched, @created_jobs, @skipped, @errors_json, @job_ids_json
    )`,
  ).run({
    id: run.id,
    schedule_id: run.scheduleId,
    status: run.status,
    started_at: run.startedAt,
    finished_at: null,
    fetched: 0,
    created_jobs: 0,
    skipped: 0,
    errors_json: '[]',
    job_ids_json: '[]',
  });
  db.prepare(
    `UPDATE schedules SET last_run_at = @now, last_status = 'running', last_error = NULL, updated_at = @now
     WHERE id = @id`,
  ).run({ id: scheduleId, now });
  return run;
}

export function finishScheduleRun(
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
  const now = new Date().toISOString();
  const nextRunAt = schedule.enabled
    ? getNextRunAt(schedule.cron, schedule.timezone, new Date(now))
    : null;
  const finished: ScheduleRun = {
    ...run,
    status: result.status,
    finishedAt: now,
    fetched: result.fetched,
    createdJobs: result.createdJobs,
    skipped: result.skipped,
    errors: result.errors.slice(0, 20),
    jobIds: result.jobIds,
  };
  const db = getDb();
  db.prepare(
    `UPDATE schedule_runs SET
      status = @status,
      finished_at = @finished_at,
      fetched = @fetched,
      created_jobs = @created_jobs,
      skipped = @skipped,
      errors_json = @errors_json,
      job_ids_json = @job_ids_json
    WHERE id = @id`,
  ).run({
    id: finished.id,
    status: finished.status,
    finished_at: finished.finishedAt,
    fetched: finished.fetched,
    created_jobs: finished.createdJobs,
    skipped: finished.skipped,
    errors_json: JSON.stringify(finished.errors),
    job_ids_json: JSON.stringify(finished.jobIds),
  });
  db.prepare(
    `UPDATE schedules SET
      last_run_at = @last_run_at,
      next_run_at = @next_run_at,
      last_status = @last_status,
      last_error = @last_error,
      updated_at = @updated_at
    WHERE id = @id`,
  ).run({
    id: schedule.id,
    last_run_at: finished.finishedAt,
    next_run_at: nextRunAt,
    last_status: finished.status,
    last_error: finished.errors[0] || null,
    updated_at: now,
  });
  return finished;
}

export function listScheduleRuns(
  scheduleId: string,
  limit = 20,
): ScheduleRun[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM schedule_runs
       WHERE schedule_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(scheduleId, Math.min(100, Math.max(1, limit))) as unknown as RunRow[];
  return rows.map(rowToRun);
}

export function isItemSeen(scheduleId: string, itemKey: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM schedule_seen_items WHERE schedule_id = ? AND item_key = ?`,
    )
    .get(scheduleId, itemKey) as unknown as { ok: number } | undefined;
  return Boolean(row);
}

export function markItemSeen(
  scheduleId: string,
  itemKey: string,
  jobId: string | null,
  url: string,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO schedule_seen_items (
      schedule_id, item_key, job_id, url, first_seen_at
    ) VALUES (?, ?, ?, ?, COALESCE(
      (SELECT first_seen_at FROM schedule_seen_items WHERE schedule_id = ? AND item_key = ?),
      ?
    ))`,
  ).run(scheduleId, itemKey, jobId, url, scheduleId, itemKey, now);
}

/** 清理过旧运行日志（保留最近 N 条/订阅） */
export function pruneOldRuns(keepPerSchedule = 50): void {
  const db = getDb();
  const ids = db
    .prepare(`SELECT id FROM schedules`)
    .all() as unknown as Array<{ id: string }>;
  const del = db.prepare(
    `DELETE FROM schedule_runs
     WHERE schedule_id = ?
       AND id NOT IN (
         SELECT id FROM schedule_runs
         WHERE schedule_id = ?
         ORDER BY started_at DESC
         LIMIT ?
       )`,
  );
  for (const row of ids) {
    del.run(row.id, row.id, keepPerSchedule);
  }
}
