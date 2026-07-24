import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { jobRoutes } from './routes/jobs.js';
import { listenRoutes } from './routes/listen.js';
import { authRoutes, registerAuthGuard } from './routes/auth.js';
import {
  bootstrapMcpToken,
  mcpManageRoutes,
  mcpProtocolRoutes,
} from './routes/mcp.js';
import { sourceRoutes } from './routes/sources.js';
import { aiPluginRoutes } from './routes/aiPlugins.js';
import { albumRoutes } from './routes/albums.js';
import { settingsRoutes } from './routes/settings.js';
import { scheduleRoutes } from './routes/schedules.js';
import { schedulePluginRoutes } from './routes/schedulePlugins.js';
import {
  startScheduler,
  refreshExternalSchedulePlugins,
  recoverStuckScheduleRuns,
} from './services/schedule/index.js';
import { refreshExternalSourcePlugins } from './sources/index.js';
import { refreshExternalAsrPlugins } from './providers/asr/index.js';
import { refreshExternalTtsPlugins } from './providers/tts/index.js';
import { JOBS_DIR, ROOT_DIR, SQLITE_DB, resolveWebDistDir } from './utils/paths.js';
import { ensureDir, pathExists } from './utils/fs.js';
import { hasApiKey, getBaseUrl, getChatModel } from './utils/aiConfig.js';
import { initDatabase } from './db/sqlite.js';
import { migrateStorageLayout } from './services/storageMigrator.js';
import { buildPublicSiteSeo } from './services/settings/index.js';
import { injectSeoIntoHtml } from './utils/seoHtml.js';
import { printOpenSourceBanner } from './utils/banner.js';
import { fail, wrapApiPayload } from './utils/apiResponse.js';
import { getRequestLocale, t } from './i18n/index.js';

loadEnv({ path: path.join(ROOT_DIR, '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // 启动即输出开源信息（纯 ASCII，不依赖 listen 成功）
  printOpenSourceBanner({ version: '1.0.0' });

  await ensureDir(JOBS_DIR);

  // 初始化 SQLite，必要时从旧 JSON 迁移
  initDatabase();
  // 旧版按类型摊开 → 按任务聚合
  await migrateStorageLayout();
  // 后台自动签发 MCP Token（已初始化时）
  bootstrapMcpToken();
  // 扫描本地 Source / ASR / TTS 外部插件（失败不阻断启动）
  try {
    const scan = await refreshExternalSourcePlugins();
    if (scan.loaded.length || scan.failed.length) {
      console.info(
        '[sources] external plugins loaded=%s failed=%s dir=%s',
        scan.loaded.join(',') || '-',
        scan.failed.map((f) => `${f.dirName}:${f.error}`).join('; ') || '-',
        scan.pluginsDir,
      );
    }
  } catch (err) {
    console.warn('[sources] external plugin scan failed:', err);
  }
  try {
    const scan = await refreshExternalAsrPlugins();
    if (scan.loaded.length || scan.failed.length) {
      console.info(
        '[asr] external plugins loaded=%s failed=%s dir=%s',
        scan.loaded.join(',') || '-',
        scan.failed.map((f) => `${f.dirName}:${f.error}`).join('; ') || '-',
        scan.pluginsDir,
      );
    }
  } catch (err) {
    console.warn('[asr] external plugin scan failed:', err);
  }
  try {
    const scan = await refreshExternalTtsPlugins();
    if (scan.loaded.length || scan.failed.length) {
      console.info(
        '[tts] external plugins loaded=%s failed=%s dir=%s',
        scan.loaded.join(',') || '-',
        scan.failed.map((f) => `${f.dirName}:${f.error}`).join('; ') || '-',
        scan.pluginsDir,
      );
    }
  } catch (err) {
    console.warn('[tts] external plugin scan failed:', err);
  }

  const app = Fastify({
    logger: true,
    bodyLimit: 520 * 1024 * 1024,
  });

  /**
   * 全局 JSON 响应信封：/api/* 成功/失败统一为 { code, message, data }。
   * Fastify 对 stream/Buffer/string 不会触发 preSerialization，媒体下载不受影响。
   */
  app.addHook('preSerialization', async (req, reply, payload) => {
    const pathOnly = req.url.split('?')[0];
    if (!pathOnly.startsWith('/api')) return payload;
    return wrapApiPayload(payload, reply.statusCode);
  });

  // 未捕获异常也走统一信封（媒体流等非 /api 保持 Fastify 默认）
  app.setErrorHandler((err, req, reply) => {
    const pathOnly = req.url.split('?')[0];
    req.log.error({ err, url: req.url }, 'request error');
    const status =
      err && typeof err === 'object' && typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? Number((err as { statusCode: number }).statusCode)
        : 500;
    if (!pathOnly.startsWith('/api')) {
      return reply.code(status).send(err);
    }
    const message =
      err instanceof Error && err.message
        ? err.message
        : t(getRequestLocale(req), 'api.internalError');
    const errorCode =
      err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
        ? String((err as { code: string }).code)
        : undefined;
    return reply.code(status).send(fail(status, message, errorCode));
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  });

  await app.register(authRoutes, { prefix: '/api' });
  registerAuthGuard(app);
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(albumRoutes, { prefix: '/api' });
  await app.register(scheduleRoutes, { prefix: '/api' });
  await app.register(schedulePluginRoutes, { prefix: '/api' });
  await app.register(listenRoutes, { prefix: '/api' });
  await app.register(sourceRoutes, { prefix: '/api' });
  await app.register(aiPluginRoutes, { prefix: '/api' });
  await app.register(mcpManageRoutes, { prefix: '/api' });
  // MCP 协议端点挂在根路径 /mcp，便于客户端直接安装
  await app.register(mcpProtocolRoutes);

  const webDist = resolveWebDistDir(__dirname);
  if (await pathExists(webDist)) {
    const { default: fastifyStatic } = await import('@fastify/static');
    const indexHtmlPath = path.join(webDist, 'index.html');

    const resolvePublicBase = (req: import('fastify').FastifyRequest): string => {
      const envBase = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
      if (envBase) return envBase;
      const xfProto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        ?.trim();
      const proto = xfProto || (req.protocol || 'http');
      const xfHost = String(req.headers['x-forwarded-host'] || '')
        .split(',')[0]
        ?.trim();
      const host = xfHost || req.headers.host || `localhost:${PORT}`;
      return `${proto}://${host}`.replace(/\/$/, '');
    };

    const sendSeoIndex = async (
      req: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => {
      const raw = await fs.readFile(indexHtmlPath, 'utf8');
      const base = resolvePublicBase(req);
      const pathOnly = req.url.split('?')[0] || '/';
      // history 伪静态：canonical 使用当前 path（/ 归一为 /home）
      const cleanPath =
        pathOnly === '/' || pathOnly === '/index.html' ? '/home' : pathOnly;
      const html = injectSeoIntoHtml(raw, buildPublicSiteSeo(), {
        canonicalUrl: `${base}${cleanPath}`,
        imageUrl: `${base}/logo.webp`,
        locale: 'zh_CN',
      });
      return reply.type('text/html; charset=utf-8').send(html);
    };

    // 根路径 / 与 /index.html 直接吐带 SEO 的 index
    // 注意：@fastify/static 在 wildcard:false 时会为每个静态文件单独注册路由，
    // 若再手动注册 /index.html 会触发 FST_ERR_DUPLICATED_ROUTE。
    app.get('/', async (req, reply) => sendSeoIndex(req, reply));
    app.get('/index.html', async (req, reply) => sendSeoIndex(req, reply));

    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      // 关闭目录 index，避免与自定义 / 冲突
      index: false,
      // 使用通配路由托管其余静态资源，避免预注册 /index.html
      wildcard: true,
    });
    // history 模式伪静态：未知前端路由回退 index.html（带 SEO）
    app.setNotFoundHandler(async (req, reply) => {
      const pathOnly = req.url.split('?')[0] || '/';
      if (
        pathOnly.startsWith('/api') ||
        pathOnly === '/mcp' ||
        pathOnly.startsWith('/mcp/')
      ) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      // 带扩展名的静态资源（js/css/图）不回退 HTML，避免掩盖真实 404
      const last = pathOnly.split('/').pop() || '';
      if (last.includes('.') && !last.endsWith('.html')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return sendSeoIndex(req, reply);
    });
  }

  try {
    const scan = await refreshExternalSchedulePlugins();
    if (scan.loaded.length || scan.failed.length) {
      console.info(
        '[schedule] external plugins loaded=%s failed=%s dir=%s',
        scan.loaded.join(',') || '-',
        scan.failed.map((f) => `${f.dirName}:${f.error}`).join('; ') || '-',
        scan.pluginsDir,
      );
    }
  } catch (err) {
    console.warn('[schedule] external plugin scan failed:', err);
  }

  try {
    const recovered = recoverStuckScheduleRuns();
    if (recovered.runs || recovered.schedules) {
      console.info(
        '[schedule] recovered stuck running runs=%s schedules=%s',
        recovered.runs,
        recovered.schedules,
      );
    }
  } catch (err) {
    console.warn('[schedule] recover stuck runs failed:', err);
  }

  startScheduler();

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`BokeBox listening on http://${HOST}:${PORT}`);
  app.log.info('Open source (LGPL-3.0): https://github.com/vastsa/BokeBox/');
  app.log.info(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
  app.log.info(`SQLite: ${SQLITE_DB}`);
  app.log.info(
    hasApiKey()
      ? `AI mode: ${getBaseUrl()} / ${getChatModel()}`
      : 'AI mode: demo',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
