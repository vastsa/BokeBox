/**
 * 管理员账号与会话持久化
 */
import {
  KEY_AUTH,
  KEY_SESSIONS,
  deleteSetting,
  getSettingRaw,
  parseJson,
  setSettingRaw,
} from './kv.js';

export type AuthAccount = {
  username: string;
  /** scrypt 派生：salt:hash（hex） */
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = {
  token: string;
  username: string;
  createdAt: string;
  expiresAt: string;
};

export function getAuthAccount(): AuthAccount | null {
  return parseJson<AuthAccount>(getSettingRaw(KEY_AUTH));
}

export function setAuthAccount(account: AuthAccount): AuthAccount {
  setSettingRaw(KEY_AUTH, JSON.stringify(account));
  return account;
}

function cryptoRandomToken(): string {
  const bytes = new Uint8Array(32);
  // Node 全局 crypto
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}



function listSessions(): SessionRecord[] {
  const all = parseJson<SessionRecord[]>(getSettingRaw(KEY_SESSIONS)) || [];
  const now = Date.now();
  return all.filter((s) => new Date(s.expiresAt).getTime() > now);
}

function saveSessions(sessions: SessionRecord[]): void {
  setSettingRaw(KEY_SESSIONS, JSON.stringify(sessions));
}

export function createSession(
  username: string,
  ttlMs = 1000 * 60 * 60 * 24 * 30,
): SessionRecord {
  const token = cryptoRandomToken();
  const now = new Date();
  const session: SessionRecord = {
    token,
    username,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  const next = listSessions().filter((s) => s.username !== username);
  next.push(session);
  // 最多保留 10 个会话
  saveSessions(next.slice(-10));
  return session;
}

export function getSession(token?: string | null): SessionRecord | null {
  if (!token) return null;
  const found = listSessions().find((s) => s.token === token);
  return found || null;
}

export function revokeSession(token?: string | null): void {
  if (!token) return;
  saveSessions(listSessions().filter((s) => s.token !== token));
}

export function revokeAllSessions(): void {
  deleteSetting(KEY_SESSIONS);
}


