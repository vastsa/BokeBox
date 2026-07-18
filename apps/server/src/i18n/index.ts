import type { FastifyRequest } from 'fastify';
import { catalogs, type MessageKey } from './messages.js';
import {
  DEFAULT_UI_LOCALE,
  isLocale,
  isUiLocale,
  resolveRegisteredLocale,
  resolveUiLocale,
  type Locale,
} from './registry.js';
import type { TranslateParams } from './types.js';
import { fail } from '../utils/apiResponse.js';

export type { Locale, TranslateParams } from './types.js';
export type { MessageKey } from './messages.js';
export {
  CONTENT_LOCALES,
  DEFAULT_CONTENT_LOCALE,
  DEFAULT_LOCALE,
  DEFAULT_UI_LOCALE,
  LOCALES,
  LOCALE_DEFINITIONS,
  LOCALE_META,
  UI_LOCALES,
  contentLanguageLabel,
  contentPromptLanguage,
  getLocaleDefinition,
  isContentLocale,
  isLocale,
  isUiLocale,
  listLocaleMeta,
  resolveContentLocale,
  resolveRegisteredLocale,
  resolveUiLocale,
  spokenCharsPerMinute,
  type LocaleDefinition,
  type LocaleMeta,
  type ScriptDensity,
} from './registry.js';

/** 解析请求 / Accept-Language 为 UI 语言（无 UI 包时回落默认） */
export function resolveLocale(input?: string | null): Locale {
  if (!input) return DEFAULT_UI_LOCALE;
  const raw = String(input).toLowerCase();
  const parts = raw.split(',').map((p) => p.trim().split(';')[0]).filter(Boolean);
  for (const part of parts) {
    const reg = resolveRegisteredLocale(part, DEFAULT_UI_LOCALE);
    if (isUiLocale(reg)) return reg;
  }
  return DEFAULT_UI_LOCALE;
}

export function getRequestLocale(req: FastifyRequest): Locale {
  const q = (req.query || {}) as { lang?: string; locale?: string };
  if (isUiLocale(q.lang)) return q.lang;
  if (isUiLocale(q.locale)) return q.locale;
  if (isLocale(q.lang) && isUiLocale(q.lang)) return q.lang;
  const header =
    (req.headers['x-locale'] as string | undefined) ||
    (req.headers['accept-language'] as string | undefined);
  return resolveLocale(header);
}

export function interpolate(
  template: string,
  params?: TranslateParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === null || value === undefined) return `{${name}}`;
    return String(value);
  });
}

export function t(
  locale: Locale | string | null | undefined,
  key: MessageKey | string,
  params?: TranslateParams,
): string {
  // 进度/错误文案仅使用有 UI 包的语言
  const loc: Locale = resolveUiLocale(
    isLocale(locale) ? locale : String(locale || ''),
    DEFAULT_UI_LOCALE,
  );
  const fallbackTable = catalogs['zh-CN']!;
  const table = catalogs[loc as keyof typeof catalogs] || fallbackTable;
  const raw =
    (table as Record<string, string>)[key] ||
    (fallbackTable as Record<string, string>)[key as MessageKey] ||
    key;
  return interpolate(raw, params);
}

export function kindLabel(locale: Locale, kind: 'video' | 'audio' | 'text'): string {
  if (kind === 'audio') return t(locale, 'kind.audio');
  if (kind === 'text') return t(locale, 'kind.text');
  return t(locale, 'kind.video');
}

export class AppError extends Error {
  statusCode: number;
  key: MessageKey | string;
  params?: TranslateParams;
  code?: string;

  constructor(
    key: MessageKey | string,
    statusCode = 400,
    params?: TranslateParams,
    code?: string,
  ) {
    super(key);
    this.name = 'AppError';
    this.key = key;
    this.statusCode = statusCode;
    this.params = params;
    this.code = code;
  }
}

export function errorMessage(
  locale: Locale,
  err: unknown,
  fallbackKey: MessageKey | string = 'pipeline.failed',
): string {
  if (err instanceof AppError) {
    return t(locale, err.key, err.params);
  }
  if (err instanceof Error) {
    // 若 message 本身是已知 key，则翻译
    const maybeKey = err.message;
    if ((catalogs['zh-CN'] as Record<string, string>)[maybeKey]) {
      return t(locale, maybeKey);
    }
    return err.message || t(locale, fallbackKey);
  }
  return String(err || t(locale, fallbackKey));
}

export function sendAppError(
  reply: { code: (n: number) => { send: (body: unknown) => unknown } },
  locale: Locale,
  err: unknown,
  fallbackStatus = 400,
) {
  if (err instanceof AppError) {
    const status = err.statusCode;
    const message = t(locale, err.key, err.params);
    const errorCode = err.code || String(err.key);
    return reply.code(status).send(fail(status, message, errorCode));
  }
  if (
    err &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
  ) {
    const status = (err as { statusCode: number }).statusCode;
    const message =
      err instanceof Error ? errorMessage(locale, err) : String(err);
    return reply.code(status).send(fail(status, message));
  }
  const message = errorMessage(locale, err);
  return reply.code(fallbackStatus).send(fail(fallbackStatus, message));
}
