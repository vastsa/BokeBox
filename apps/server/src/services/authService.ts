import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  createSession,
  getAuthAccount,
  getSession,
  isSetupCompleted,
  markSetupCompleted,
  revokeAllSessions,
  revokeSession,
  setAiConfig,
  setAuthAccount,
  setGlobalTtsOptions,
  type AiConfig,
  type AuthAccount,
  type SessionRecord,
} from './settingsStore.js';
import type { TtsOptions } from '../types/job.js';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string, salt?: string): string {
  const s = salt || randomBytes(16).toString('hex');
  const hash = scryptSync(password, s, SCRYPT_KEYLEN).toString('hex');
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export type SetupInput = {
  username: string;
  password: string;
  apiKey?: string;
  baseUrl?: string;
  chatModel?: string;
  asrModel?: string;
  ttsModel?: string;
  voiceDesignModel?: string;
  imageModel?: string;
  defaultVoice?: string;
  /** 全局音色（初始化时写入，制作默认使用） */
  tts?: Partial<TtsOptions> | null;
};

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 2) return '用户名至少 2 个字符';
  if (u.length > 32) return '用户名最多 32 个字符';
  if (!/^[\w\u4e00-\u9fff.-]+$/u.test(u)) {
    return '用户名仅支持中文、字母、数字、_ . -';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return '密码至少 6 位';
  if (password.length > 128) return '密码过长';
  return null;
}

/** 首次系统初始化：创建账号 + 写入 AI 配置 */
export function completeSetup(input: SetupInput): {
  account: { username: string };
  session: SessionRecord;
} {
  if (isSetupCompleted()) {
    throw Object.assign(new Error('系统已初始化，请直接登录'), { statusCode: 409 });
  }

  const username = input.username.trim();
  const userErr = validateUsername(username);
  if (userErr) throw Object.assign(new Error(userErr), { statusCode: 400 });

  const passErr = validatePassword(input.password);
  if (passErr) throw Object.assign(new Error(passErr), { statusCode: 400 });

  const apiKey = (input.apiKey || '').trim();
  if (!apiKey) {
    throw Object.assign(new Error('请填写 API Key'), { statusCode: 400 });
  }

  const now = new Date().toISOString();
  const account: AuthAccount = {
    username,
    passwordHash: hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };
  setAuthAccount(account);

  // 全局音色优先；兼容旧字段 defaultVoice
  const globalTts = setGlobalTtsOptions(
    input.tts || {
      mode: 'default',
      voice: input.defaultVoice || undefined,
    },
  );

  const aiPatch: Partial<AiConfig> = {
    apiKey,
    baseUrl: input.baseUrl,
    chatModel: input.chatModel,
    asrModel: input.asrModel,
    ttsModel: input.ttsModel,
    voiceDesignModel: input.voiceDesignModel,
    imageModel: input.imageModel,
    defaultVoice:
      globalTts.mode === 'default'
        ? globalTts.voice || input.defaultVoice
        : input.defaultVoice || globalTts.voice,
  };
  setAiConfig(aiPatch);
  markSetupCompleted();

  const session = createSession(username);
  return {
    account: { username },
    session,
  };
}

export function login(
  username: string,
  password: string,
): { account: { username: string }; session: SessionRecord } {
  if (!isSetupCompleted()) {
    throw Object.assign(new Error('系统尚未初始化'), { statusCode: 409 });
  }
  const account = getAuthAccount();
  if (!account) {
    throw Object.assign(new Error('账号不存在，请重新初始化'), {
      statusCode: 500,
    });
  }
  if (account.username !== username.trim()) {
    throw Object.assign(new Error('用户名或密码错误'), { statusCode: 401 });
  }
  if (!verifyPassword(password, account.passwordHash)) {
    throw Object.assign(new Error('用户名或密码错误'), { statusCode: 401 });
  }
  const session = createSession(account.username);
  return {
    account: { username: account.username },
    session,
  };
}

export function logout(token?: string | null): void {
  revokeSession(token);
}

export function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string,
): void {
  const account = getAuthAccount();
  if (!account || account.username !== username) {
    throw Object.assign(new Error('未登录'), { statusCode: 401 });
  }
  if (!verifyPassword(currentPassword, account.passwordHash)) {
    throw Object.assign(new Error('当前密码不正确'), { statusCode: 400 });
  }
  const passErr = validatePassword(newPassword);
  if (passErr) throw Object.assign(new Error(passErr), { statusCode: 400 });

  const now = new Date().toISOString();
  setAuthAccount({
    ...account,
    passwordHash: hashPassword(newPassword),
    updatedAt: now,
  });
  revokeAllSessions();
}

export function resolveSession(token?: string | null): SessionRecord | null {
  return getSession(token);
}

export function extractBearerToken(
  header?: string | string[],
): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}
