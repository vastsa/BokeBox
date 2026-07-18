import { getAuthAccount } from '../settings/index.js';
import { getSettingRaw, setSettingRaw } from '../settings/kv.js';

const KEY_MCP_TOKEN = 'mcp_token';

export type McpTokenRecord = {
  /** 长效访问令牌，供 AI / MCP 客户端使用 */
  token: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

function parseRecord(raw: string | null): McpTokenRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<McpTokenRecord>;
    if (!parsed.token || typeof parsed.token !== 'string') return null;
    return {
      token: parsed.token,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || parsed.createdAt || new Date().toISOString(),
      lastUsedAt: parsed.lastUsedAt,
    };
  } catch {
    return null;
  }
}

function mintToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `bbx_mcp_${Buffer.from(bytes).toString('base64url')}`;
}

/** 读取当前 MCP Token（不存在则 null） */
export function getMcpTokenRecord(): McpTokenRecord | null {
  return parseRecord(getSettingRaw(KEY_MCP_TOKEN));
}

/** 后台自动确保存在 MCP Token；已有则复用 */
export function ensureMcpToken(): McpTokenRecord {
  const existing = getMcpTokenRecord();
  if (existing?.token) return existing;
  return regenerateMcpToken();
}

/** 重新生成 MCP Token（旧 token 立即失效） */
export function regenerateMcpToken(): McpTokenRecord {
  const now = new Date().toISOString();
  const prev = getMcpTokenRecord();
  const next: McpTokenRecord = {
    token: mintToken(),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
  setSettingRaw(KEY_MCP_TOKEN, JSON.stringify(next));
  return next;
}

/** 校验 Bearer / 原始 token 是否为有效 MCP Token */
export function verifyMcpToken(token?: string | null): boolean {
  if (!token) return false;
  const record = getMcpTokenRecord();
  if (!record?.token) return false;
  if (record.token !== token) return false;
  // 惰性刷新最近使用时间（失败不影响鉴权）
  try {
    touchMcpToken();
  } catch {
    // ignore
  }
  return true;
}

export function touchMcpToken(): void {
  const record = getMcpTokenRecord();
  if (!record) return;
  const next: McpTokenRecord = {
    ...record,
    lastUsedAt: new Date().toISOString(),
  };
  setSettingRaw(KEY_MCP_TOKEN, JSON.stringify(next));
}

/** 脱敏展示 */
export function maskMcpToken(token?: string): string {
  const t = (token || '').trim();
  if (!t) return '';
  if (t.length <= 12) return `${t.slice(0, 4)}…`;
  return `${t.slice(0, 10)}…${t.slice(-4)}`;
}

export type PublicMcpStatus = {
  enabled: boolean;
  hasToken: boolean;
  tokenHint: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  username?: string;
};

export function toPublicMcpStatus(): PublicMcpStatus {
  const record = getMcpTokenRecord();
  const account = getAuthAccount();
  return {
    enabled: Boolean(record?.token),
    hasToken: Boolean(record?.token),
    tokenHint: maskMcpToken(record?.token),
    createdAt: record?.createdAt,
    updatedAt: record?.updatedAt,
    lastUsedAt: record?.lastUsedAt,
    username: account?.username,
  };
}
