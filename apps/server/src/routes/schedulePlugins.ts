/**
 * Schedule 订阅插件管理 API
 *
 * GET    /schedule-plugins
 * POST   /schedule-plugins/rescan
 * POST   /schedule-plugins/install
 * DELETE /schedule-plugins/:id/package
 * PATCH  /schedule-plugins/:id
 * POST   /schedule-plugins/:id/reset
 * PUT    /schedule-plugins/:id/config
 * POST   /schedule-plugins/:id/config/reset
 */
import type { FastifyInstance } from 'fastify';
import {
  getSchedulePluginRegistration,
  isSchedulePluginEnabled,
  listSchedulePluginsPublic,
  refreshExternalSchedulePlugins,
  resetSchedulePluginConfigForId,
  resetSchedulePluginEnabled,
  setSchedulePluginEnabled,
  updateSchedulePluginConfigForId,
} from '../services/schedule/index.js';
import { SCHEDULE_PLUGINS_DIR } from '../utils/paths.js';
import {
  installPluginPackageFromZip,
  uninstallExternalPlugin,
} from '../services/plugins/pluginPackageInstall.js';
import { getRequestUser } from './auth.js';
import { getRequestLocale, t } from '../i18n/index.js';

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

export async function schedulePluginRoutes(app: FastifyInstance): Promise<void> {
  app.get('/schedule-plugins', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return {
      pluginsDir: SCHEDULE_PLUGINS_DIR,
      plugins: listSchedulePluginsPublic(),
    };
  });

  app.post('/schedule-plugins/rescan', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const scan = await refreshExternalSchedulePlugins();
    return {
      ok: true,
      scan,
      plugins: listSchedulePluginsPublic(),
    };
  });

  app.post('/schedule-plugins/install', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      const file = await req.file({ limits: { fileSize: 80 * 1024 * 1024 } });
      if (!file) {
        return reply.code(400).send({ error: '请上传插件 zip 文件（字段名 file）' });
      }
      const filename = String(file.filename || '').toLowerCase();
      if (filename && !filename.endsWith('.zip')) {
        return reply.code(400).send({ error: '仅支持 .zip 插件包' });
      }
      const buf = await file.toBuffer();
      if (file.file.truncated) {
        return reply.code(413).send({ error: '插件包过大（上限 80MB）' });
      }
      const overwriteField = (file.fields as Record<string, unknown> | undefined)?.overwrite;
      const overwritePart = Array.isArray(overwriteField)
        ? overwriteField[0]
        : overwriteField;
      const overwriteVal =
        overwritePart &&
        typeof overwritePart === 'object' &&
        overwritePart !== null &&
        'value' in overwritePart
          ? (overwritePart as { value?: unknown }).value
          : undefined;
      const overwrite =
        overwriteVal === undefined
          ? true
          : String(overwriteVal) !== 'false' && overwriteVal !== false;

      const installed = await installPluginPackageFromZip('schedule', buf, {
        overwrite,
      });
      return { ok: true, installed, plugins: listSchedulePluginsPublic() };
    } catch (err) {
      const status =
        err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        typeof (err as { statusCode: unknown }).statusCode === 'number'
          ? Number((err as { statusCode: number }).statusCode)
          : 400;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.delete<{ Params: { id: string } }>(
    '/schedule-plugins/:id/package',
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      try {
        const result = await uninstallExternalPlugin('schedule', req.params.id);
        return { ...result, plugins: listSchedulePluginsPublic() };
      } catch (err) {
        const status =
          err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          typeof (err as { statusCode: unknown }).statusCode === 'number'
            ? Number((err as { statusCode: number }).statusCode)
            : 400;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { enabled?: boolean };
  }>('/schedule-plugins/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      if (typeof req.body?.enabled !== 'boolean') {
        return reply.code(400).send({ error: '请提供 enabled: boolean' });
      }
      setSchedulePluginEnabled(req.params.id, req.body.enabled);
      return {
        ok: true,
        id: req.params.id,
        enabled: isSchedulePluginEnabled(req.params.id),
        plugins: listSchedulePluginsPublic(),
      };
    } catch (err) {
      return reply.code(404).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post<{ Params: { id: string } }>(
    '/schedule-plugins/:id/reset',
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      try {
        resetSchedulePluginEnabled(req.params.id);
        return {
          ok: true,
          id: req.params.id,
          enabled: isSchedulePluginEnabled(req.params.id),
          plugins: listSchedulePluginsPublic(),
        };
      } catch (err) {
        return reply.code(404).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  app.put<{
    Params: { id: string };
    Body: { config?: Record<string, unknown> };
  }>('/schedule-plugins/:id/config', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      if (!getSchedulePluginRegistration(req.params.id)) {
        return reply.code(404).send({ error: '插件不存在' });
      }
      updateSchedulePluginConfigForId(req.params.id, req.body?.config || {});
      return { ok: true, plugins: listSchedulePluginsPublic() };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post<{ Params: { id: string } }>(
    '/schedule-plugins/:id/config/reset',
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      try {
        resetSchedulePluginConfigForId(req.params.id);
        return { ok: true, plugins: listSchedulePluginsPublic() };
      } catch (err) {
        return reply.code(404).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
