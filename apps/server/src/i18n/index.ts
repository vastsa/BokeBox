import type { FastifyRequest } from 'fastify';
import { catalogs, type MessageKey } from './messages.js';
import type { Locale, TranslateParams } from './types.js';

export type { Locale, TranslateParams } from './types.js';
export type { MessageKey } from './messages.js';

export const LOCALES: Locale[] = ['zh-CN', 'en-US'];

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en-US';
}

export function resolveLocale(input?: string | null): Locale {
  if (!input) return 'zh-CN';
  const raw = String(input).toLowerCase();
  // Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8
  const parts = raw.split(',').map((p) => p.trim().split(';')[0]);
  for (const part of parts) {
    if (part.startsWith('zh')) return 'zh-CN';
    if (part.startsWith('en')) return 'en-US';
  }
  return 'zh-CN';
}

export function getRequestLocale(req: FastifyRequest): Locale {
  const q = (req.query || {}) as { lang?: string; locale?: string };
  if (isLocale(q.lang)) return q.lang;
  if (isLocale(q.locale)) return q.locale;
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
  const loc: Locale = isLocale(locale) ? locale : resolveLocale(String(locale || ''));
  const table = catalogs[loc] || catalogs['zh-CN'];
  const raw =
    (table as Record<string, string>)[key] ||
    catalogs['zh-CN'][key as MessageKey] ||
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
    return reply.code(err.statusCode).send({
      error: t(locale, err.key, err.params),
      code: err.code || err.key,
    });
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
    return reply.code(status).send({ error: message });
  }
  const message = errorMessage(locale, err);
  return reply.code(fallbackStatus).send({ error: message });
}
