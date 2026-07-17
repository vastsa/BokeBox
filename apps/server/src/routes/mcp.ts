import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extractBearerToken } from '../services/authService.js';
import {
  ensureMcpToken,
  getMcpTokenRecord,
  regenerateMcpToken,
  toPublicMcpStatus,
  verifyMcpToken,
} from '../services/mcpTokenStore.js';
import { handleMcpPayload, MCP_SERVER_INFO } from '../services/mcpProtocol.js';
import { listMcpTools } from '../services/mcpTools.js';
import { getRequestUser } from './auth.js';
import { getRequestLocale, t } from '../i18n/index.js';
import { isSetupCompleted } from '../services/settingsStore.js';

function readCookie(req: FastifyRequest, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const p of raw.split(';')) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

function extractMcpToken(req: FastifyRequest): string | null {
  const q = (req.query || {}) as {
    access_token?: string;
    token?: string;
    mcp_token?: string;
  };
  return (
    extractBearerToken(req.headers.authorization) ||
    (typeof req.headers['x-mcp-token'] === 'string'
      ? req.headers['x-mcp-token']
      : null) ||
    q.access_token ||
    q.token ||
    q.mcp_token ||
    null
  );
}

/** 从请求推导对外 base URL（安装配置用） */
export function resolvePublicBaseUrl(
  req: FastifyRequest,
  override?: string | null,
): string {
  const forced = (override || process.env.PUBLIC_BASE_URL || '').trim();
  if (forced) return forced.replace(/\/+$/, '');

  const xfProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    ?.trim();
  const xfHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    ?.trim();
  const host = xfHost || String(req.headers.host || '').trim();
  if (!host) {
    const port = process.env.PORT || '8787';
    return `http://127.0.0.1:${port}`;
  }
  const proto =
    xfProto ||
    (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function buildInstallBundle(baseUrl: string, token: string) {
  const endpoint = `${baseUrl}/mcp`;
  const headers = { Authorization: `Bearer ${token}` };

  const streamableHttp = {
    type: 'streamableHttp' as const,
    url: endpoint,
    headers,
  };

  const httpUrl = {
    url: endpoint,
    headers,
  };

  const cursor = {
    mcpServers: {
      bokebox: {
        url: endpoint,
        headers,
      },
    },
  };

  const claudeDesktop = {
    mcpServers: {
      bokebox: {
        type: 'http',
        url: endpoint,
        headers,
      },
    },
  };

  const codex = {
    mcpServers: {
      bokebox: {
        url: endpoint,
        headers,
      },
    },
  };

  const openclaw = {
    mcpServers: {
      bokebox: streamableHttp,
    },
  };

  // 通用：多数客户端可识别 url + headers
  const generic = {
    name: 'bokebox',
    transport: 'http',
    url: endpoint,
    headers,
    serverInfo: MCP_SERVER_INFO,
  };

  return {
    endpoint,
    token,
    headers,
    generic,
    streamableHttp,
    httpUrl,
    cursor,
    claudeDesktop,
    codex,
    openclaw,
    // 方便 AI 直接「安装」：完整 snippet 字符串
    snippets: {
      cursorJson: JSON.stringify(cursor, null, 2),
      claudeDesktopJson: JSON.stringify(claudeDesktop, null, 2),
      codexJson: JSON.stringify(codex, null, 2),
      openclawJson: JSON.stringify(openclaw, null, 2),
    },
  };
}

/**
 * 管理面：/api/mcp/*
 * - status / install / regenerate
 * 协议面：/mcp （在 index 单独注册）
 */
export async function mcpManageRoutes(app: FastifyInstance): Promise<void> {
  /** MCP 状态（自动确保 token 存在） */
  app.get('/mcp/status', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({
        error: t(getRequestLocale(req), 'auth.pleaseLogin'),
        code: 'UNAUTHORIZED',
      });
    }
    if (!isSetupCompleted()) {
      return reply.code(503).send({
        error: t(getRequestLocale(req), 'auth.setupRequired'),
        code: 'NEEDS_SETUP',
      });
    }

    const record = ensureMcpToken();
    const baseUrl = resolvePublicBaseUrl(req);
    return {
      ...toPublicMcpStatus(),
      endpoint: `${baseUrl}/mcp`,
      baseUrl,
      tools: listMcpTools().map((x) => ({
        name: x.name,
        description: x.description,
      })),
      // 登录用户可拿到明文 token，便于一键安装
      token: record.token,
    };
  });

  /** AI / 前端安装配置：含明文 token 与各客户端 JSON */
  app.get('/mcp/install', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({
        error: t(getRequestLocale(req), 'auth.pleaseLogin'),
        code: 'UNAUTHORIZED',
      });
    }
    if (!isSetupCompleted()) {
      return reply.code(503).send({
        error: t(getRequestLocale(req), 'auth.setupRequired'),
        code: 'NEEDS_SETUP',
      });
    }

    const q = (req.query || {}) as { baseUrl?: string };
    const record = ensureMcpToken();
    const baseUrl = resolvePublicBaseUrl(req, q.baseUrl);
    const install = buildInstallBundle(baseUrl, record.token);

    return {
      ok: true,
      message:
        '将 install.cursor / install.claudeDesktop / install.codex 写入对应 MCP 配置即可。Token 已由后台自动生成。',
      openSource: 'https://github.com/vastsa/BokeBox/',
      license: 'LGPL-3.0-only',
      status: toPublicMcpStatus(),
      tools: listMcpTools(),
      install,
    };
  });

  /** 重新生成 token */
  app.post('/mcp/regenerate', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) {
      return reply.code(401).send({
        error: t(getRequestLocale(req), 'auth.pleaseLogin'),
        code: 'UNAUTHORIZED',
      });
    }
    const record = regenerateMcpToken();
    const baseUrl = resolvePublicBaseUrl(req);
    return {
      ok: true,
      message: 'MCP Token 已重新生成，旧 token 立即失效',
      ...toPublicMcpStatus(),
      token: record.token,
      endpoint: `${baseUrl}/mcp`,
      install: buildInstallBundle(baseUrl, record.token),
    };
  });
}

function unauthorizedMcp(reply: FastifyReply) {
  return reply.code(401).send({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Unauthorized: provide Authorization: Bearer <mcp_token>',
    },
    id: null,
  });
}

/**
 * MCP 协议端点（Streamable HTTP 兼容：POST JSON-RPC）
 * 鉴权：MCP Token（Bearer / X-MCP-Token / query）
 * 也接受已登录会话 Cookie，方便本机调试
 */
export async function mcpProtocolRoutes(app: FastifyInstance): Promise<void> {
  const authOk = (req: FastifyRequest): boolean => {
    if (!isSetupCompleted()) return false;
    const token = extractMcpToken(req);
    if (verifyMcpToken(token)) return true;
    // 兼容：管理员会话也可直接调 MCP
    if (getRequestUser(req)) return true;
    // Cookie 会话（getRequestUser 已覆盖），再兜底读一次
    const cookie = readCookie(req, 'pb_session');
    if (cookie && getRequestUser(req)) return true;
    return false;
  };

  app.options('/mcp', async (_req, reply) => {
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE')
      .header(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Accept, Mcp-Session-Id, X-MCP-Token',
      )
      .header('Access-Control-Expose-Headers', 'Mcp-Session-Id')
      .code(204)
      .send();
  });

  /** 发现 / 健康 */
  app.get('/mcp', async (req, reply) => {
    if (!authOk(req)) return unauthorizedMcp(reply);
    const record = ensureMcpToken();
    const baseUrl = resolvePublicBaseUrl(req);
    return {
      ok: true,
      protocol: 'mcp',
      protocolVersion: '2024-11-05',
      transport: 'streamable-http',
      serverInfo: MCP_SERVER_INFO,
      endpoint: `${baseUrl}/mcp`,
      tools: listMcpTools().map((t) => t.name),
      auth: {
        type: 'bearer',
        header: 'Authorization: Bearer <token>',
        tokenHint: record.token.slice(0, 10) + '…',
      },
      openSource: 'https://github.com/vastsa/BokeBox/',
    };
  });

  /** JSON-RPC 主入口 */
  app.post('/mcp', async (req, reply) => {
    if (!authOk(req)) return unauthorizedMcp(reply);
    // 确保 token 存在（会话调用时也会补齐）
    ensureMcpToken();

    const body = req.body;
    const response = await handleMcpPayload(body);

    reply.header('Content-Type', 'application/json');
    // Streamable HTTP：无响应体的通知返回 202
    if (response == null) {
      return reply.code(202).send();
    }
    return reply.send(response);
  });

  /** 部分客户端用 DELETE 结束会话 —— 无状态实现直接 200 */
  app.delete('/mcp', async (req, reply) => {
    if (!authOk(req)) return unauthorizedMcp(reply);
    return reply.code(200).send({ ok: true });
  });
}

/** 启动时若已初始化则自动签发 MCP Token */
export function bootstrapMcpToken(): void {
  try {
    if (!isSetupCompleted()) return;
    const before = getMcpTokenRecord();
    const record = ensureMcpToken();
    if (!before) {
      console.log(
        `[mcp] 已自动生成 MCP Token（${record.token.slice(0, 12)}…） · endpoint /mcp`,
      );
    } else {
      console.log('[mcp] MCP Token 已就绪 · endpoint /mcp');
    }
  } catch (err) {
    console.error('[mcp] 自动生成 Token 失败:', err);
  }
}
