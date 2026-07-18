import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  changePassword,
  completeSetup,
  extractBearerToken,
  login,
  logout,
  resolveSession,
} from '../services/authService.js';
import {
  getRequestLocale,
  sendAppError,
  t,
  type Locale,
} from '../i18n/index.js';
import {
  buildPublicSiteSeo,
  formatSiteTitle,
  getAuthAccount,
  getDefaultAiConfigForSetup,
  getPublicSiteProfile,
  getSiteBrand,
  isGuestHomePublic,
  isSetupCompleted,
  setAiConfig,
  setGuestHomePublic,
  setSiteName,
  setSiteSeo,
  toPublicAiConfig,
  withProviderCatalog,
  type AiConfig,
  type SiteSeoInput,
} from '../services/settingsStore.js';
import { listAsrProviderDescriptors } from '../providers/asr/index.js';
import { listTtsProviderDescriptors } from '../providers/tts/index.js';

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

const SESSION_COOKIE = 'pb_session';

function readCookie(req: FastifyRequest, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: string) {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
}

function clearSessionCookie(reply: FastifyReply) {
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

/** 从请求解析当前会话用户（Bearer / Cookie / query token） */
export function getRequestUser(
  req: FastifyRequest,
): { username: string; token: string } | null {
  const q = (req.query || {}) as { access_token?: string; token?: string };
  const token =
    extractBearerToken(req.headers.authorization) ||
    readCookie(req, SESSION_COOKIE) ||
    q.access_token ||
    q.token ||
    null;
  const session = resolveSession(token);
  if (!token || !session) return null;
  return { username: session.username, token };
}


function publicAiWithProviders(cfg?: Parameters<typeof toPublicAiConfig>[0]) {
  return withProviderCatalog(toPublicAiConfig(cfg), {
    asrProviders: listAsrProviderDescriptors().filter((p) => p.id !== 'demo'),
    ttsProviders: listTtsProviderDescriptors().filter((p) => p.id !== 'demo'),
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /** 初始化状态：公开 */
  app.get('/setup/status', async () => {
    const initialized = isSetupCompleted();
    const profile = initialized
      ? getPublicSiteProfile(false)
      : {
          guestHomePublic: false,
          siteName: '',
          siteTitle: formatSiteTitle(''),
          seo: buildPublicSiteSeo({ title: '', description: '', keywords: '' }),
        };
    return {
      initialized,
      needsSetup: !initialized,
      guestHomePublic: profile.guestHomePublic,
      siteName: profile.siteName,
      siteTitle: profile.siteTitle,
      seo: profile.seo,
      ai: initialized ? undefined : getDefaultAiConfigForSetup(),
    };
  });

  /** 首次初始化：公开且仅一次 */
  app.post<{
    Body: {
      username?: string;
      password?: string;
      confirmPassword?: string;
      apiKey?: string;
      baseUrl?: string;
      chatModel?: string;
      asrModel?: string;
      asrProvider?: string;
      ttsModel?: string;
      ttsProvider?: string;
      whisperBin?: string;
      whisperLang?: string;
      llmBaseUrl?: string;
      llmApiKey?: string;
      asrBaseUrl?: string;
      asrApiKey?: string;
      ttsBaseUrl?: string;
      ttsApiKey?: string;
      imageBaseUrl?: string;
      imageApiKey?: string;
      voiceDesignModel?: string;
      imageModel?: string;
      defaultVoice?: string;
      contentLocale?: string;
      tts?: import('../types/job.js').TtsOptions | null;
    };
  }>('/setup', async (req, reply) => {
    try {
      const body = req.body || {};
      if (
        body.confirmPassword !== undefined &&
        body.password !== body.confirmPassword
      ) {
        return reply.code(400).send({ error: t(getRequestLocale(req), 'auth.passwordMismatch') });
      }
      const result = completeSetup({
        username: String(body.username || ''),
        password: String(body.password || ''),
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
        contentLocale: body.contentLocale,
        tts: body.tts,
      });
      setSessionCookie(reply, result.session.token, result.session.expiresAt);
      return {
        ok: true,
        username: result.account.username,
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        ai: publicAiWithProviders(),
      };
    } catch (err) {
      return sendError(reply, err, getRequestLocale(req));
    }
  });

  /** 登录 */
  app.post<{ Body: { username?: string; password?: string } }>(
    '/auth/login',
    async (req, reply) => {
      try {
        const body = req.body || {};
        const result = login(
          String(body.username || ''),
          String(body.password || ''),
        );
        setSessionCookie(reply, result.session.token, result.session.expiresAt);
        return {
          ok: true,
          username: result.account.username,
          token: result.session.token,
          expiresAt: result.session.expiresAt,
        };
      } catch (err) {
        return sendError(reply, err, getRequestLocale(req));
      }
    },
  );

  /** 退出 */
  app.post('/auth/logout', async (req, reply) => {
    const user = getRequestUser(req);
    logout(user?.token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  /** 当前用户 */
  app.get('/auth/me', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
    const account = getAuthAccount();
    return {
      username: user.username,
      createdAt: account?.createdAt,
    };
  });

  /** 修改密码 */
  app.put<{
    Body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  }>('/auth/password', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
    try {
      const body = req.body || {};
      if (
        body.confirmPassword !== undefined &&
        body.newPassword !== body.confirmPassword
      ) {
        return reply.code(400).send({ error: t(getRequestLocale(req), 'auth.newPasswordMismatch') });
      }
      changePassword(
        user.username,
        String(body.currentPassword || ''),
        String(body.newPassword || ''),
      );
      return { ok: true, message: t(getRequestLocale(req), 'auth.passwordUpdated') };
    } catch (err) {
      return sendError(reply, err, getRequestLocale(req));
    }
  });

  /** AI 配置 */
  app.get('/settings/ai', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
    return { ai: publicAiWithProviders() };
  });

  app.put<{ Body: Partial<AiConfig> }>('/settings/ai', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
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

  /** 站点访问 / 品牌 / SEO（挂在现有设置体系，不新增管理模块） */
  app.get('/settings/access', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
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
    if (!user) return reply.code(401).send({ error: t(getRequestLocale(req), 'auth.notLoggedIn') });
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
}

/** 游客开放首页时允许的只读接口（曲库 / 详情 / 已发布媒体） */
function isGuestHomePublicPath(method: string, url: string): boolean {
  if (!isGuestHomePublic()) return false;
  const m = method.toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return false;
  if (url === '/api/listen/library') return true;
  if (url === '/api/listen/albums') return true;
  // 专辑详情：/api/listen/albums/:id
  if (/^\/api\/listen\/albums\/[^/]+$/.test(url)) return true;

  // 仅开放 listen 详情，排除 history 等管理向路径（防进度/历史泄露）
  const listenMatch = url.match(/^\/api\/listen\/([^/]+)$/);
  if (listenMatch) {
    const id = listenMatch[1];
    if (id === 'library' || id === 'history' || id === 'progress' || id === 'albums') return false;
    return true;
  }

  if (/^\/api\/jobs\/[^/]+\/(audio|cover)$/.test(url)) return true;
  return false;
}

/**
 * 全局鉴权钩子：未初始化仅允许 setup；已初始化默认需登录
 * 可选：开放游客首页只读接口
 */
export function registerAuthGuard(app: FastifyInstance): void {
  const publicExact = new Set([
    '/api/setup/status',
    '/api/setup',
    '/api/auth/login',
    // 登出必须可匿名调用，以便清理残留 HttpOnly cookie
    '/api/auth/logout',
    '/api/health',
  ]);

  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0];
    // 非 API 或静态资源放行
    if (!url.startsWith('/api')) return;

    if (publicExact.has(url)) return;

    // 未初始化时，除公开接口外一律拦截
    if (!isSetupCompleted()) {
      return reply.code(503).send({
        error: t(getRequestLocale(req), 'auth.setupRequired'),
        code: 'NEEDS_SETUP',
      });
    }

    const user = getRequestUser(req);
    if (!user) {
      if (isGuestHomePublicPath(req.method, url)) return;
      return reply.code(401).send({
        error: t(getRequestLocale(req), 'auth.pleaseLogin'),
        code: 'UNAUTHORIZED',
      });
    }
  });
}
