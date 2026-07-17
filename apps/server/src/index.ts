import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { jobRoutes } from './routes/jobs.js';
import { listenRoutes } from './routes/listen.js';
import { authRoutes, registerAuthGuard } from './routes/auth.js';
import { JOBS_DIR, ROOT_DIR, SQLITE_DB } from './utils/paths.js';
import { ensureDir, pathExists } from './utils/fs.js';
import { hasApiKey, getBaseUrl, getChatModel } from './utils/aiConfig.js';
import { initDatabase } from './db/sqlite.js';
import { migrateStorageLayout } from './services/storageMigrator.js';

loadEnv({ path: path.join(ROOT_DIR, '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  await ensureDir(JOBS_DIR);

  // 初始化 SQLite，必要时从旧 JSON 迁移
  initDatabase();
  // 旧版按类型摊开 → 按任务聚合
  await migrateStorageLayout();

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
  await app.register(listenRoutes, { prefix: '/api' });

  const webDist = path.resolve(__dirname, '../../web/dist');
  if (await pathExists(webDist)) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`BokeBox listening on http://${HOST}:${PORT}`);
  app.log.info('Open source (LGPL-3.0): https://github.com/vastsa/BokeBox/');
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
