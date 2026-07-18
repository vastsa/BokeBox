/**
 * 任务 API 路由聚合
 */
import type { FastifyInstance } from 'fastify';
import { queryRoutes } from './queryRoutes.js';
import { mediaRoutes } from './mediaRoutes.js';
import { createRoutes } from './createRoutes.js';
import { mutateRoutes } from './mutateRoutes.js';

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  await queryRoutes(app);
  await mediaRoutes(app);
  await createRoutes(app);
  await mutateRoutes(app);
}
