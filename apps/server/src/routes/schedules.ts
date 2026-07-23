/**
 * 定时订阅 API
 *
 * GET    /schedules
 * POST   /schedules
 * GET    /schedules/:id
 * PATCH  /schedules/:id
 * DELETE /schedules/:id
 * POST   /schedules/:id/run
 * GET    /schedules/:id/runs
 * GET    /schedules/meta/presets
 */
import type { FastifyInstance } from 'fastify';
import { getRequestLocale, t } from '../i18n/index.js';
import { getRequestUser } from './auth.js';
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listPresetOptions,
  listScheduleRuns,
  listSchedules,
  runScheduleOnce,
  updateSchedule,
  type CreateScheduleInput,
  type UpdateScheduleInput,
} from '../services/schedule/index.js';

function requireAuth(
  req: Parameters<typeof getRequestUser>[0],
  reply: {
    code: (n: number) => { send: (b: unknown) => unknown };
  },
): boolean {
  if (!getRequestUser(req)) {
    reply.code(401).send({
      error: t(getRequestLocale(req), 'auth.pleaseLogin'),
      code: 'UNAUTHORIZED',
    });
    return false;
  }
  return true;
}

function statusOf(err: unknown, fallback = 500): number {
  if (
    err &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
  ) {
    return (err as { statusCode: number }).statusCode;
  }
  return fallback;
}

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/schedules/meta/presets', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return { presets: listPresetOptions() };
  });

  app.get('/schedules', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return { schedules: listSchedules() };
  });

  app.post<{ Body: CreateScheduleInput }>('/schedules', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      const schedule = createSchedule(req.body || ({} as CreateScheduleInput));
      return reply.code(201).send({ schedule });
    } catch (err) {
      return reply.code(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get<{ Params: { id: string } }>('/schedules/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const schedule = getSchedule(req.params.id);
    if (!schedule) {
      return reply
        .code(404)
        .send({ error: t(getRequestLocale(req), 'schedule.notFound') });
    }
    const runs = listScheduleRuns(schedule.id, 10);
    return { schedule, runs };
  });

  app.patch<{
    Params: { id: string };
    Body: UpdateScheduleInput;
  }>('/schedules/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      const schedule = updateSchedule(req.params.id, req.body || {});
      return { schedule };
    } catch (err) {
      return reply.code(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.delete<{ Params: { id: string } }>(
    '/schedules/:id',
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const ok = deleteSchedule(req.params.id);
      if (!ok) {
        return reply
          .code(404)
          .send({ error: t(getRequestLocale(req), 'schedule.notFound') });
      }
      return { ok: true };
    },
  );

  app.post<{
    Params: { id: string };
    Body?: { force?: boolean };
  }>('/schedules/:id/run', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      const run = await runScheduleOnce(req.params.id, {
        force: Boolean(req.body?.force),
      });
      const schedule = getSchedule(req.params.id);
      return { run, schedule };
    } catch (err) {
      return reply.code(statusOf(err, 400)).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/schedules/:id/runs', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const schedule = getSchedule(req.params.id);
    if (!schedule) {
      return reply
        .code(404)
        .send({ error: t(getRequestLocale(req), 'schedule.notFound') });
    }
    const limit = Number(req.query.limit || 20);
    return { runs: listScheduleRuns(schedule.id, limit) };
  });
}
