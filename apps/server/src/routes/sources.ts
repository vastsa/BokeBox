/**
 * Source 插件管理 API
 *
 * GET    /source-plugins                 列表
 * POST   /source-plugins/rescan          热扫描加载外部插件
 * POST   /source-plugins/install         上传 zip 安装外部插件
 * DELETE /source-plugins/:id/package     卸载外部插件目录
 * PATCH  /source-plugins/:id             启用/禁用
 * POST   /source-plugins/:id/reset       恢复 defaultEnabled
 * PUT    /source-plugins/:id/config      保存插件配置
 * POST   /source-plugins/:id/config/reset 清空插件配置
 */
import type { FastifyInstance } from 'fastify';
import {
  getSourcePluginRegistration,
  isSourcePluginEnabled,
  listSourcePluginsPublic,
  refreshExternalSourcePlugins,
  resetSourcePluginEnabled,
  setSourcePluginEnabled,
  updateSourcePluginConfigForId,
  resetSourcePluginConfigForId,
} from '../sources/index.js';
import { SOURCE_PLUGINS_DIR } from '../utils/paths.js';
import {
  installPluginPackageFromZip,
  uninstallExternalPlugin,
} from '../services/plugins/pluginPackageInstall.js';

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

  /** 上传 zip 安装 / 覆盖外部 Source 插件 */
  app.post('/source-plugins/install', async (req, reply) => {
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
      // multipart 字段：overwrite=false 可禁止覆盖
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

      const installed = await installPluginPackageFromZip('source', buf, {
        overwrite,
      });
      return {
        ok: true,
        installed,
        plugins: listSourcePluginsPublic(),
      };
    } catch (err) {
      const status =
        err && typeof err === 'object' && typeof (err as { statusCode?: unknown }).statusCode === 'number'
          ? Number((err as { statusCode: number }).statusCode)
          : 400;
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(status).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string } }>(
    '/source-plugins/:id/package',
    async (req, reply) => {
      const id = String(req.params.id || '').trim();
      if (!id) return reply.code(400).send({ error: '缺少插件 id' });
      const reg = getSourcePluginRegistration(id);
      if (reg && reg.origin === 'builtin') {
        return reply.code(400).send({ error: '内置插件不可卸载' });
      }
      try {
        const result = await uninstallExternalPlugin('source', id);
        return {
          ...result,
          plugins: listSourcePluginsPublic(),
        };
      } catch (err) {
        const status =
          err && typeof err === 'object' && typeof (err as { statusCode?: unknown }).statusCode === 'number'
            ? Number((err as { statusCode: number }).statusCode)
            : 400;
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(status).send({ error: message });
      }
    },
  );

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

  /** 保存插件配置（部分更新；敏感字段空串表示保留） */
  app.put<{
    Params: { id: string };
    Body: { config?: Record<string, unknown> };
  }>('/source-plugins/:id/config', async (req, reply) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return reply.code(400).send({ error: '缺少插件 id' });
    }
    const reg = getSourcePluginRegistration(id);
    if (!reg) {
      return reply.code(404).send({ error: `插件不存在: ${id}` });
    }
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
      updateSourcePluginConfigForId(id, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }

    return {
      ok: true,
      id,
      plugins: listSourcePluginsPublic(),
    };
  });

  app.post<{ Params: { id: string } }>(
    '/source-plugins/:id/config/reset',
    async (req, reply) => {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return reply.code(400).send({ error: '缺少插件 id' });
      }
      if (!getSourcePluginRegistration(id)) {
        return reply.code(404).send({ error: `插件不存在: ${id}` });
      }
      resetSourcePluginConfigForId(id);
      return {
        ok: true,
        id,
        plugins: listSourcePluginsPublic(),
      };
    },
  );
}
