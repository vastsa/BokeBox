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
  getAuthAccount,
  getDefaultAiConfigForSetup,
  isSetupCompleted,
  setAiConfig,
  toPublicAiConfig,
  type AiConfig,
} from '../services/settingsStore.js';

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

function sendError(reply: FastifyReply, err: unknown) {
  const status = errStatus(err, 400);
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(status).send({ error: message });
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

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /** 初始化状态：公开 */
  app.get('/setup/status', async () => {
    const initialized = isSetupCompleted();
    return {
      initialized,
      needsSetup: !initialized,
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
      ttsModel?: string;
      voiceDesignModel?: string;
      defaultVoice?: string;
      tts?: import('../types/job.js').TtsOptions | null;
    };
  }>('/setup', async (req, reply) => {
    try {
      const body = req.body || {};
      if (
        body.confirmPassword !== undefined &&
        body.password !== body.confirmPassword
      ) {
        return reply.code(400).send({ error: '两次密码不一致' });
      }
      const result = completeSetup({
        username: String(body.username || ''),
        password: String(body.password || ''),
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
        chatModel: body.chatModel,
        asrModel: body.asrModel,
        ttsModel: body.ttsModel,
        voiceDesignModel: body.voiceDesignModel,
        defaultVoice: body.defaultVoice,
        tts: body.tts,
      });
      setSessionCookie(reply, result.session.token, result.session.expiresAt);
      return {
        ok: true,
        username: result.account.username,
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        ai: toPublicAiConfig(),
      };
    } catch (err) {
      return sendError(reply, err);
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
        return sendError(reply, err);
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
    if (!user) return reply.code(401).send({ error: '未登录' });
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
    if (!user) return reply.code(401).send({ error: '未登录' });
    try {
      const body = req.body || {};
      if (
        body.confirmPassword !== undefined &&
        body.newPassword !== body.confirmPassword
      ) {
        return reply.code(400).send({ error: '两次新密码不一致' });
      }
      changePassword(
        user.username,
        String(body.currentPassword || ''),
        String(body.newPassword || ''),
      );
      return { ok: true, message: '密码已更新，请重新登录' };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /** AI 配置 */
  app.get('/settings/ai', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.code(401).send({ error: '未登录' });
    return { ai: toPublicAiConfig() };
  });

  app.put<{ Body: Partial<AiConfig> }>('/settings/ai', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.code(401).send({ error: '未登录' });
    try {
      const body = req.body || {};
      const next = setAiConfig({
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
        chatModel: body.chatModel,
        asrModel: body.asrModel,
        ttsModel: body.ttsModel,
        voiceDesignModel: body.voiceDesignModel,
        defaultVoice: body.defaultVoice,
      });
      return { ai: toPublicAiConfig(next) };
    } catch (err) {
      return sendError(reply, err);
    }
  });
}

/**
 * 全局鉴权钩子：未初始化仅允许 setup；已初始化需登录
 * 公开路径白名单
 */
export function registerAuthGuard(app: FastifyInstance): void {
  const publicExact = new Set([
    '/api/setup/status',
    '/api/setup',
    '/api/auth/login',
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
        error: '系统尚未初始化',
        code: 'NEEDS_SETUP',
      });
    }

    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({
        error: '请先登录',
        code: 'UNAUTHORIZED',
      });
    }
  });
}
