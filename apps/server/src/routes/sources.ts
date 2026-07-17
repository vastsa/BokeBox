/**
 * Source 插件管理 API
 *
 * GET    /source-plugins           列表
 * POST   /source-plugins/rescan    热扫描加载外部插件
 * PATCH  /source-plugins/:id       启用/禁用
 * POST   /source-plugins/:id/reset 恢复 defaultEnabled
 */
import type { FastifyInstance } from 'fastify';
import {
  getSourcePluginRegistration,
  isSourcePluginEnabled,
  listSourcePluginsPublic,
  refreshExternalSourcePlugins,
  resetSourcePluginEnabled,
  setSourcePluginEnabled,
} from '../sources/index.js';
import { SOURCE_PLUGINS_DIR } from '../utils/paths.js';

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/source-plugins', async () => {
    return {
      pluginsDir: SOURCE_PLUGINS_DIR,
      plugins: listSourcePluginsPublic(),
    };
  });

  app.post('/source-plugins/rescan', async () => {
    const scan = await refreshExternalSourcePlugins();
    return {
      ok: true,
      scan,
      plugins: listSourcePluginsPublic(),
    };
  });

  app.patch<{
    Params: { id: string };
    Body: { enabled?: boolean };
  }>('/source-plugins/:id', async (req, reply) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return reply.code(400).send({ error: '缺少插件 id' });
    }

    const reg = getSourcePluginRegistration(id);
    if (!reg) {
      return reply.code(404).send({ error: `插件不存在: ${id}` });
    }

    if (typeof req.body?.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'body.enabled 必须是 boolean' });
    }

    // 加载失败的插件不允许启用
    if (req.body.enabled && (!reg.plugin || reg.loadError)) {
      return reply.code(400).send({
        error: `插件不可用，无法启用: ${reg.loadError || '未成功加载'}`,
      });
    }

    // high 风险启用时仅允许，不阻断（由用户显式操作）
    const ok = setSourcePluginEnabled(id, req.body.enabled);
    if (!ok) {
      return reply.code(404).send({ error: `插件不存在: ${id}` });
    }

    return {
      ok: true,
      id,
      enabled: isSourcePluginEnabled(id),
      plugins: listSourcePluginsPublic(),
    };
  });

  app.post<{ Params: { id: string } }>(
    '/source-plugins/:id/reset',
    async (req, reply) => {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return reply.code(400).send({ error: '缺少插件 id' });
      }
      if (!getSourcePluginRegistration(id)) {
        return reply.code(404).send({ error: `插件不存在: ${id}` });
      }
      resetSourcePluginEnabled(id);
      return {
        ok: true,
        id,
        enabled: isSourcePluginEnabled(id),
        plugins: listSourcePluginsPublic(),
      };
    },
  );
}
