/**
 * ASR / TTS 插件管理 API（与 Source 插件同一套机制）
 *
 * GET    /asr-plugins                 列表
 * POST   /asr-plugins/rescan          热扫描
 * PATCH  /asr-plugins/:id             启用/禁用
 * POST   /asr-plugins/:id/reset       恢复 defaultEnabled
 * PUT    /asr-plugins/:id/config      保存配置
 * POST   /asr-plugins/:id/config/reset
 *
 * TTS 同上：/tts-plugins...
 */
import type { FastifyInstance } from 'fastify';
import {
  getAsrPluginRegistration,
  isAsrPluginEnabled,
  listAsrPluginsPublic,
  refreshExternalAsrPlugins,
  resetAsrPluginConfigForId,
  resetAsrPluginEnabled,
  setAsrPluginEnabled,
  updateAsrPluginConfigForId,
} from '../providers/asr/index.js';
import {
  getTtsPluginRegistration,
  isTtsPluginEnabled,
  listTtsPluginsPublic,
  refreshExternalTtsPlugins,
  resetTtsPluginConfigForId,
  resetTtsPluginEnabled,
  setTtsPluginEnabled,
  updateTtsPluginConfigForId,
} from '../providers/tts/index.js';
import { ASR_PLUGINS_DIR, TTS_PLUGINS_DIR } from '../utils/paths.js';

type Kind = 'asr' | 'tts';

function host(kind: Kind) {
  if (kind === 'asr') {
    return {
      pluginsDir: ASR_PLUGINS_DIR,
      list: listAsrPluginsPublic,
      refresh: refreshExternalAsrPlugins,
      getReg: getAsrPluginRegistration,
      isEnabled: isAsrPluginEnabled,
      setEnabled: setAsrPluginEnabled,
      resetEnabled: resetAsrPluginEnabled,
      updateConfig: updateAsrPluginConfigForId,
      resetConfig: resetAsrPluginConfigForId,
    };
  }
  return {
    pluginsDir: TTS_PLUGINS_DIR,
    list: listTtsPluginsPublic,
    refresh: refreshExternalTtsPlugins,
    getReg: getTtsPluginRegistration,
    isEnabled: isTtsPluginEnabled,
    setEnabled: setTtsPluginEnabled,
    resetEnabled: resetTtsPluginEnabled,
    updateConfig: updateTtsPluginConfigForId,
    resetConfig: resetTtsPluginConfigForId,
  };
}

function mountPluginRoutes(app: FastifyInstance, kind: Kind): void {
  const base = `/${kind}-plugins`;
  const h = host(kind);

  app.get(base, async () => ({
    kind,
    pluginsDir: h.pluginsDir,
    plugins: h.list(),
  }));

  app.post(`${base}/rescan`, async () => {
    const scan = await h.refresh();
    return {
      ok: true,
      kind,
      scan,
      plugins: h.list(),
    };
  });

  app.patch<{
    Params: { id: string };
    Body: { enabled?: boolean };
  }>(`${base}/:id`, async (req, reply) => {
    const id = String(req.params.id || '').trim();
    if (!id) return reply.code(400).send({ error: '缺少插件 id' });

    const reg = h.getReg(id);
    if (!reg) return reply.code(404).send({ error: `插件不存在: ${id}` });

    if (typeof req.body?.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'body.enabled 必须是 boolean' });
    }

    if (req.body.enabled && (!reg.plugin || reg.loadError)) {
      return reply.code(400).send({
        error: `插件不可用，无法启用: ${reg.loadError || '未成功加载'}`,
      });
    }

    const ok = h.setEnabled(id, req.body.enabled);
    if (!ok) return reply.code(404).send({ error: `插件不存在: ${id}` });

    return {
      ok: true,
      kind,
      id,
      enabled: h.isEnabled(id),
      plugins: h.list(),
    };
  });

  app.post<{ Params: { id: string } }>(`${base}/:id/reset`, async (req, reply) => {
    const id = String(req.params.id || '').trim();
    if (!id) return reply.code(400).send({ error: '缺少插件 id' });
    if (!h.getReg(id)) return reply.code(404).send({ error: `插件不存在: ${id}` });
    h.resetEnabled(id);
    return {
      ok: true,
      kind,
      id,
      enabled: h.isEnabled(id),
      plugins: h.list(),
    };
  });

  app.put<{
    Params: { id: string };
    Body: { config?: Record<string, unknown> };
  }>(`${base}/:id/config`, async (req, reply) => {
    const id = String(req.params.id || '').trim();
    if (!id) return reply.code(400).send({ error: '缺少插件 id' });
    const reg = h.getReg(id);
    if (!reg) return reply.code(404).send({ error: `插件不存在: ${id}` });
    if (!reg.plugin || reg.loadError) {
      return reply.code(400).send({
        error: `插件不可用，无法保存配置: ${reg.loadError || '未成功加载'}`,
      });
    }

    const schema = reg.configSchema || reg.plugin.configSchema || [];
    if (!schema.length) {
      return reply.code(400).send({ error: '该插件未声明可配置参数' });
    }

    const config = req.body?.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return reply.code(400).send({ error: 'body.config 必须是对象' });
    }

    try {
      h.updateConfig(id, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }

    return {
      ok: true,
      kind,
      id,
      plugins: h.list(),
    };
  });

  app.post<{ Params: { id: string } }>(
    `${base}/:id/config/reset`,
    async (req, reply) => {
      const id = String(req.params.id || '').trim();
      if (!id) return reply.code(400).send({ error: '缺少插件 id' });
      if (!h.getReg(id)) {
        return reply.code(404).send({ error: `插件不存在: ${id}` });
      }
      h.resetConfig(id);
      return {
        ok: true,
        kind,
        id,
        plugins: h.list(),
      };
    },
  );
}

export async function aiPluginRoutes(app: FastifyInstance): Promise<void> {
  mountPluginRoutes(app, 'asr');
  mountPluginRoutes(app, 'tts');
}
