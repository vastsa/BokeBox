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
import { ensureMcpToken } from './mcpTokenStore.js';
import type { TtsOptions } from '../types/job.js';
import { AppError, isContentLocale, isLocale } from '../i18n/index.js';

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
  asrProvider?: string;
  ttsModel?: string;
  ttsProvider?: string;
  whisperBin?: string;
  whisperLang?: string;
  voiceDesignModel?: string;
  imageModel?: string;
  defaultVoice?: string;
  /** 全局音色（初始化时写入，制作默认使用） */
  tts?: Partial<TtsOptions> | null;
  /** 内容生成语言 */
  contentLocale?: string | null;
};

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 2) return 'auth.usernameMin';
  if (u.length > 32) return 'auth.usernameMax';
  if (!/^[\w\u4e00-\u9fff.-]+$/u.test(u)) {
    return 'auth.usernameCharset';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'auth.passwordMin';
  if (password.length > 128) return 'auth.passwordMax';
  return null;
}

/** 首次系统初始化：创建账号 + 写入 AI 配置 */
export function completeSetup(input: SetupInput): {
  account: { username: string };
  session: SessionRecord;
} {
  if (isSetupCompleted()) {
    throw new AppError('auth.alreadySetup', 409);
  }

  const username = input.username.trim();
  const userErr = validateUsername(username);
  if (userErr) throw new AppError(userErr, 400);

  const passErr = validatePassword(input.password);
  if (passErr) throw new AppError(passErr, 400);

  // API Key 可选：本地 Whisper + Edge TTS 可不配云端密钥（对话模型将走演示）
  const apiKey = (input.apiKey || '').trim();

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
    asrProvider: input.asrProvider,
    ttsModel: input.ttsModel,
    ttsProvider: input.ttsProvider,
    whisperBin: input.whisperBin,
    whisperLang: input.whisperLang,
    voiceDesignModel: input.voiceDesignModel,
    imageModel: input.imageModel,
    defaultVoice:
      globalTts.mode === 'default'
        ? globalTts.voice || input.defaultVoice
        : input.defaultVoice || globalTts.voice,
    contentLocale: isContentLocale(input.contentLocale)
      ? input.contentLocale
      : undefined,
  };
  setAiConfig(aiPatch);
  markSetupCompleted();
  // 初始化完成后自动签发 MCP Token，供 AI 安装/调用
  ensureMcpToken();

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
    throw new AppError('auth.setupRequired', 409);
  }
  const account = getAuthAccount();
  if (!account) {
    throw new AppError('auth.accountMissing', 500);
  }
  if (account.username !== username.trim()) {
    throw new AppError('auth.badCredentials', 401);
  }
  if (!verifyPassword(password, account.passwordHash)) {
    throw new AppError('auth.badCredentials', 401);
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
    throw new AppError('auth.notLoggedIn', 401);
  }
  if (!verifyPassword(currentPassword, account.passwordHash)) {
    throw new AppError('auth.currentPasswordWrong', 400);
  }
  const passErr = validatePassword(newPassword);
  if (passErr) throw new AppError(passErr, 400);

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
