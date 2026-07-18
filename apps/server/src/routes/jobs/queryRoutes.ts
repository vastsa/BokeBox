/**
 * 任务查询：health / 列表 / 详情
 */
import type { FastifyInstance } from 'fastify';
import {
  getJob,
  listJobsPage,
  type JobListFilter,
  toListPublic,
  toPublic,
} from '../../services/job/jobStore.js';
import { parsePageQuery } from '../../utils/pagination.js';
import { getActiveTtsUiMeta } from '../../services/media/ttsSynthesizer.js';
import {
  listAsrProviderDescriptors,
  listTtsProviderDescriptors,
} from '../../providers/index.js';
import {
  getAsrModel,
  getAsrProviderId,
  getBaseUrl,
  getChatModel,
  getDefaultTtsVoice,
  getImageModel,
  getTtsModel,
  getTtsProviderId,
  getVoiceDesignModel,
  hasApiKey,
} from '../../utils/aiConfig.js';
import { errorMessage, getRequestLocale, t } from '../../i18n/index.js';


export async function queryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const ttsUi = getActiveTtsUiMeta();
    return {
      ok: true,
      demoMode: !hasApiKey(),
      baseUrl: getBaseUrl(),
      models: {
        chat: getChatModel(),
        asr: getAsrModel(),
        tts: getTtsModel(),
        voiceDesign: getVoiceDesignModel(),
        image: getImageModel() || undefined,
      },
      providers: {
        asr: getAsrProviderId(),
        tts: getTtsProviderId(),
        asrList: listAsrProviderDescriptors().filter((p) => p.id !== 'demo'),
        ttsList: listTtsProviderDescriptors().filter((p) => p.id !== 'demo'),
      },
      ttsModes: ttsUi.ttsModes,
      presetVoices: ttsUi.presetVoices,
      defaultVoice: getDefaultTtsVoice(),
      speechStyleTags: ttsUi.speechStyleTags,
      audioTagExamples: ttsUi.audioTagExamples,
      ttsCapabilities: {
        providerId: ttsUi.providerId,
        providerName: ttsUi.providerName,
        supportsStyleTags: ttsUi.supportsStyleTags,
        supportsVoiceDesign: ttsUi.supportsVoiceDesign,
      },
      time: new Date().toISOString(),
    };
  });


  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      q?: string;
      filter?: string;
      includeFacets?: string;
    };
  }>('/jobs', async (req) => {
    const page = parsePageQuery(req.query, { pageSize: 20 });
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const rawFilter = String(req.query.filter || 'all').trim();
    const allowed: JobListFilter[] = [
      'all',
      'active',
      'published',
      'draft',
      'failed',
      'done',
      'pipeline',
    ];
    const filter = (allowed.includes(rawFilter as JobListFilter)
      ? rawFilter
      : 'all') as JobListFilter;
    const result = await listJobsPage({
      ...page,
      q,
      filter,
      includeFacets: req.query.includeFacets !== 'false',
    });
    return {
      // 列表只返回卡片摘要；详情 / 写操作响应仍走 toPublic 全量字段。
      jobs: result.items.map(toListPublic),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      facets: result.facets,
    };
  });


  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: t(getRequestLocale(req), 'job.notFound') });
    return { job: toPublic(job) };
  });

}
