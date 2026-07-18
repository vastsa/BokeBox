/**
 * 全局设置 API
 *
 * GET/PUT  /settings/ai
 * GET/PUT  /settings/access
 * GET/PUT  /settings/script-prompt
 * GET/PUT  /settings/tts
 * GET/PUT  /settings/cover-prompt
 * GET      /settings/ai-prompts
 * GET/PUT  /settings/ai-prompts/:kind
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  getAllAiPromptBundles,
  getAiPromptBundle,
  saveAiPromptTemplate,
  type AiPromptKind,
} from '../services/aiPromptTemplates.js';
import {
  COVER_PROMPT_VARIABLES,
  DEFAULT_COVER_PROMPT_TEMPLATE,
} from '../services/coverGenerator.js';
import {
  getCoverPromptTemplateStored,
  getGlobalScriptPrompt,
  getGlobalTtsOptions,
  getPublicSiteProfile,
  setAiConfig,
  setCoverPromptTemplate,
  setGlobalScriptPrompt,
  setGlobalTtsOptions,
  setGuestHomePublic,
  setSiteName,
  setSiteSeo,
  toPublicAiConfig,
  withProviderCatalog,
  type AiConfig,
  type SiteSeoInput,
} from '../services/settingsStore.js';
import { summarizeScriptPrompt } from '../services/scriptPrompt.js';
import { listAsrProviderDescriptors } from '../providers/asr/index.js';
import { listTtsProviderDescriptors } from '../providers/tts/index.js';
import type { ScriptPromptOptions, TtsOptions } from '../types/job.js';
import {
  getRequestLocale,
  sendAppError,
  t,
  type Locale,
} from '../i18n/index.js';
import { getRequestUser } from './auth.js';

function errStatus(err: unknown, fallback = 500): number {
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

function sendError(reply: FastifyReply, err: unknown, locale: Locale = 'zh-CN') {
  return sendAppError(reply, locale, err, errStatus(err, 400));
}

function publicAiWithProviders(cfg?: Parameters<typeof toPublicAiConfig>[0]) {
  return withProviderCatalog(toPublicAiConfig(cfg), {
    asrProviders: listAsrProviderDescriptors().filter((p) => p.id !== 'demo'),
    ttsProviders: listTtsProviderDescriptors().filter((p) => p.id !== 'demo'),
  });
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  /** AI 配置 */
  app.get('/settings/ai', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
    }
    return { ai: publicAiWithProviders() };
  });

  app.put<{ Body: Partial<AiConfig> }>('/settings/ai', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
    }
    try {
      const body = req.body || {};
      const next = setAiConfig({
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
        chatModel: body.chatModel,
        asrModel: body.asrModel,
        asrProvider: body.asrProvider,
        ttsModel: body.ttsModel,
        ttsProvider: body.ttsProvider,
        whisperBin: body.whisperBin,
        whisperLang: body.whisperLang,
        llmBaseUrl: body.llmBaseUrl,
        llmApiKey: body.llmApiKey,
        asrBaseUrl: body.asrBaseUrl,
        asrApiKey: body.asrApiKey,
        ttsBaseUrl: body.ttsBaseUrl,
        ttsApiKey: body.ttsApiKey,
        imageBaseUrl: body.imageBaseUrl,
        imageApiKey: body.imageApiKey,
        voiceDesignModel: body.voiceDesignModel,
        imageModel: body.imageModel,
        defaultVoice: body.defaultVoice,
        contentLocale: body.contentLocale as import('../i18n/types.js').Locale | undefined,
      });
      return { ai: publicAiWithProviders(next) };
    } catch (err) {
      return sendError(reply, err, getRequestLocale(req));
    }
  });

  /** 站点访问 / 品牌 / SEO */
  app.get('/settings/access', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
    }
    const profile = getPublicSiteProfile(true);
    return {
      guestHomePublic: profile.guestHomePublic,
      siteName: profile.siteName,
      siteTitle: profile.siteTitle,
      seo: profile.seo,
      seoInput: profile.seoInput,
    };
  });

  app.put<{
    Body: {
      guestHomePublic?: boolean;
      siteName?: string | null;
      seo?: Partial<SiteSeoInput> | null;
    };
  }>('/settings/access', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
    }
    const body = req.body || {};
    if (typeof body.guestHomePublic === 'boolean') {
      setGuestHomePublic(body.guestHomePublic);
    }
    if (body.siteName !== undefined) {
      setSiteName(body.siteName);
    }
    if (body.seo !== undefined) {
      setSiteSeo(body.seo);
    }
    const profile = getPublicSiteProfile(true);
    return {
      guestHomePublic: profile.guestHomePublic,
      siteName: profile.siteName,
      siteTitle: profile.siteTitle,
      seo: profile.seo,
      seoInput: profile.seoInput,
    };
  });

  // ── 全局口播提示词设置 ──
  app.get('/settings/script-prompt', async () => {
    const scriptPrompt = getGlobalScriptPrompt();
    return {
      scriptPrompt,
      summary: summarizeScriptPrompt(scriptPrompt),
    };
  });

  app.put<{ Body: { scriptPrompt?: ScriptPromptOptions | null } }>(
    '/settings/script-prompt',
    async (req) => {
      const scriptPrompt = setGlobalScriptPrompt(req.body?.scriptPrompt);
      return {
        scriptPrompt,
        summary: summarizeScriptPrompt(scriptPrompt),
      };
    },
  );

  // ── 全局 TTS 音色设置 ──
  app.get('/settings/tts', async () => {
    const tts = getGlobalTtsOptions();
    return { tts };
  });

  app.put<{ Body: { tts?: TtsOptions | null } }>('/settings/tts', async (req) => {
    const tts = setGlobalTtsOptions(req.body?.tts);
    return { tts };
  });

  // ── 全局封面提示词 ──
  app.get('/settings/cover-prompt', async () => {
    const stored = getCoverPromptTemplateStored();
    return {
      template: stored || DEFAULT_COVER_PROMPT_TEMPLATE,
      stored,
      defaultTemplate: DEFAULT_COVER_PROMPT_TEMPLATE,
      isCustom: Boolean(stored),
      variables: COVER_PROMPT_VARIABLES,
    };
  });

  app.put<{ Body: { template?: string | null; reset?: boolean } }>(
    '/settings/cover-prompt',
    async (req) => {
      const reset = Boolean(req.body?.reset);
      const incoming = String(req.body?.template ?? '').trim();
      // 与默认模板完全一致时不落库，保持「系统默认」状态
      const stored =
        reset || incoming === DEFAULT_COVER_PROMPT_TEMPLATE.trim()
          ? setCoverPromptTemplate('')
          : setCoverPromptTemplate(req.body?.template);
      return {
        template: stored || DEFAULT_COVER_PROMPT_TEMPLATE,
        stored,
        defaultTemplate: DEFAULT_COVER_PROMPT_TEMPLATE,
        isCustom: Boolean(stored),
        variables: COVER_PROMPT_VARIABLES,
      };
    },
  );

  // ── AI 系统提示词（口播 / 改写 / 闪卡） ──
  app.get('/settings/ai-prompts', async () => {
    return { prompts: getAllAiPromptBundles() };
  });

  app.get<{ Params: { kind: string } }>(
    '/settings/ai-prompts/:kind',
    async (req, reply) => {
      const kind = req.params.kind as AiPromptKind;
      if (
        kind !== 'podcastSystem' &&
        kind !== 'rewriteSystem' &&
        kind !== 'flashcardSystem'
      ) {
        return reply.code(400).send({ error: 'unknown prompt kind' });
      }
      return getAiPromptBundle(kind);
    },
  );

  app.put<{
    Params: { kind: string };
    Body: { template?: string | null; reset?: boolean };
  }>('/settings/ai-prompts/:kind', async (req, reply) => {
    const kind = req.params.kind as AiPromptKind;
    if (
      kind !== 'podcastSystem' &&
      kind !== 'rewriteSystem' &&
      kind !== 'flashcardSystem'
    ) {
      return reply.code(400).send({ error: 'unknown prompt kind' });
    }
    return saveAiPromptTemplate(kind, {
      template: req.body?.template,
      reset: req.body?.reset,
    });
  });
}
