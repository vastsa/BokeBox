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
} from '../settings/index.js';
import { ensureMcpToken } from '../mcp/mcpTokenStore.js';
import type { TtsOptions } from '../../types/job.js';
import { AppError, isContentLocale, isLocale } from '../../i18n/index.js';
import {
  ensureBuiltinAsrPlugins,
  updateAsrPluginConfigForId,
} from '../../providers/asr/index.js';
import {
  ensureBuiltinTtsPlugins,
  updateTtsPluginConfigForId,
} from '../../providers/tts/index.js';
import { migrateAsrTtsSecretsFromGlobalOnce } from '../../providers/pluginEndpoint.js';

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
  /** 全局音色（初始化时写入，制作默认使用） */
  tts?: Partial<TtsOptions> | null;
  /** 内容生成语言 */
  contentLocale?: string | null;
  /** 所选 ASR 插件参数（baseUrl / apiKey / bin 等） */
  asrPluginConfig?: Record<string, unknown> | null;
  /** 所选 TTS 插件参数 */
  ttsPluginConfig?: Record<string, unknown> | null;
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
    llmBaseUrl: input.llmBaseUrl,
    llmApiKey: input.llmApiKey,
    asrBaseUrl: input.asrBaseUrl,
    asrApiKey: input.asrApiKey,
    ttsBaseUrl: input.ttsBaseUrl,
    ttsApiKey: input.ttsApiKey,
    imageBaseUrl: input.imageBaseUrl,
    imageApiKey: input.imageApiKey,
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

  // 插件级端点/密钥：先灌入历史全局字段，再覆盖 setup 显式填写
  try {
    ensureBuiltinAsrPlugins();
    ensureBuiltinTtsPlugins();
    migrateAsrTtsSecretsFromGlobalOnce();
    const asrId = String(input.asrProvider || 'mimo').trim() || 'mimo';
    const ttsId = String(input.ttsProvider || 'mimo').trim() || 'mimo';
    const asrPatch = {
      ...(input.asrPluginConfig && typeof input.asrPluginConfig === 'object'
        ? input.asrPluginConfig
        : {}),
    } as Record<string, unknown>;
    const ttsPatch = {
      ...(input.ttsPluginConfig && typeof input.ttsPluginConfig === 'object'
        ? input.ttsPluginConfig
        : {}),
    } as Record<string, unknown>;
    // 兼容：顶层模型名写入插件 model
    if (input.asrModel?.trim() && asrPatch.model === undefined) {
      asrPatch.model = input.asrModel.trim();
    }
    if (input.ttsModel?.trim() && ttsPatch.model === undefined) {
      ttsPatch.model = input.ttsModel.trim();
    }
    // 兼容旧字段 whisper / 分服务 endpoint
    if (input.whisperBin?.trim() && asrPatch.bin === undefined) {
      asrPatch.bin = input.whisperBin.trim();
    }
    if (input.whisperLang?.trim() && asrPatch.lang === undefined) {
      asrPatch.lang = input.whisperLang.trim();
    }
    if (input.asrBaseUrl?.trim() && asrPatch.baseUrl === undefined) {
      asrPatch.baseUrl = input.asrBaseUrl.trim();
    }
    if (input.asrApiKey?.trim() && asrPatch.apiKey === undefined) {
      asrPatch.apiKey = input.asrApiKey.trim();
    }
    if (input.ttsBaseUrl?.trim() && ttsPatch.baseUrl === undefined) {
      ttsPatch.baseUrl = input.ttsBaseUrl.trim();
    }
    if (input.ttsApiKey?.trim() && ttsPatch.apiKey === undefined) {
      ttsPatch.apiKey = input.ttsApiKey.trim();
    }
    // 云端插件：全局 base/key 回落（仅当插件 patch 未给）
    const globalBase = String(input.baseUrl || '').trim();
    const globalKey = String(input.apiKey || '').trim();
    if (globalBase) {
      if (asrPatch.baseUrl === undefined || asrPatch.baseUrl === '') {
        asrPatch.baseUrl = globalBase;
      }
      if (ttsPatch.baseUrl === undefined || ttsPatch.baseUrl === '') {
        ttsPatch.baseUrl = globalBase;
      }
    }
    if (globalKey) {
      if (asrPatch.apiKey === undefined || asrPatch.apiKey === '') {
        asrPatch.apiKey = globalKey;
      }
      if (ttsPatch.apiKey === undefined || ttsPatch.apiKey === '') {
        ttsPatch.apiKey = globalKey;
      }
    }
    // Edge 默认音色
    if (
      ttsId === 'edge' &&
      input.defaultVoice?.trim() &&
      ttsPatch.defaultVoice === undefined
    ) {
      ttsPatch.defaultVoice = input.defaultVoice.trim();
    }
    if (Object.keys(asrPatch).length) {
      try {
        updateAsrPluginConfigForId(asrId, asrPatch);
      } catch (err) {
        console.warn('[setup] ASR 插件参数写入跳过:', asrId, err);
      }
    }
    if (Object.keys(ttsPatch).length) {
      try {
        updateTtsPluginConfigForId(ttsId, ttsPatch);
      } catch (err) {
        console.warn('[setup] TTS 插件参数写入跳过:', ttsId, err);
      }
    }
  } catch (err) {
    console.warn('[setup] 插件参数初始化失败:', err);
  }

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
