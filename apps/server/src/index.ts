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
import { refreshExternalSourcePlugins } from './sources/index.js';
import { refreshExternalAsrPlugins } from './providers/asr/index.js';
import { refreshExternalTtsPlugins } from './providers/tts/index.js';
import { JOBS_DIR, ROOT_DIR, SQLITE_DB } from './utils/paths.js';
import { ensureDir, pathExists } from './utils/fs.js';
import { hasApiKey, getBaseUrl, getChatModel } from './utils/aiConfig.js';
import { initDatabase } from './db/sqlite.js';
import { migrateStorageLayout } from './services/storageMigrator.js';
import { buildPublicSiteSeo } from './services/settingsStore.js';
import { injectSeoIntoHtml } from './utils/seoHtml.js';
import { printOpenSourceBanner } from './utils/banner.js';

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

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  });

  await app.register(authRoutes, { prefix: '/api' });
  registerAuthGuard(app);
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(albumRoutes, { prefix: '/api' });
  await app.register(listenRoutes, { prefix: '/api' });
  await app.register(sourceRoutes, { prefix: '/api' });
  await app.register(aiPluginRoutes, { prefix: '/api' });
  await app.register(mcpManageRoutes, { prefix: '/api' });
  // MCP 协议端点挂在根路径 /mcp，便于客户端直接安装
  await app.register(mcpProtocolRoutes);

  const webDist = path.resolve(__dirname, '../../web/dist');
  if (await pathExists(webDist)) {
    const { default: fastifyStatic } = await import('@fastify/static');
    const indexHtmlPath = path.join(webDist, 'index.html');

    const sendSeoIndex = async (reply: import('fastify').FastifyReply) => {
      const raw = await fs.readFile(indexHtmlPath, 'utf8');
      const html = injectSeoIntoHtml(raw, buildPublicSiteSeo());
      return reply.type('text/html; charset=utf-8').send(html);
    };

    // 根路径 / 与 /index.html 直接吐带 SEO 的 index
    // 注意：@fastify/static 在 wildcard:false 时会为每个静态文件单独注册路由，
    // 若再手动注册 /index.html 会触发 FST_ERR_DUPLICATED_ROUTE。
    app.get('/', async (_req, reply) => sendSeoIndex(reply));
    app.get('/index.html', async (_req, reply) => sendSeoIndex(reply));

    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      // 关闭目录 index，避免与自定义 / 冲突
      index: false,
      // 使用通配路由托管其余静态资源，避免预注册 /index.html
      wildcard: true,
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api') || req.url.split('?')[0] === '/mcp') {
        return reply.code(404).send({ error: 'Not Found' });
      }
      // SPA fallback：同样注入 SEO
      return sendSeoIndex(reply);
    });
  }

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
