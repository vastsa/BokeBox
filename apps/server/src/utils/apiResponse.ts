/**
 * 统一 API 响应信封
 *
 * 成功:
 *   { code: 0, message: 'ok', data: T }
 *
 * 失败:
 *   { code: <HTTP 或业务数字码>, message: string, data: null, errorCode?: string }
 *
 * 约定:
 * - code === 0 表示成功
 * - code !== 0 表示失败，通常等于 HTTP status
 * - errorCode 为稳定业务码（UNAUTHORIZED / NEEDS_SETUP），供前端精确分支
 * - 媒体流 / Buffer / 非 JSON 响应不走此信封（Fastify 会跳过 preSerialization）
 */

export const API_OK_CODE = 0;

/** 稳定业务错误码 */
export const ApiErrorCode = {
  OK: 'OK',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  NEEDS_SETUP: 'NEEDS_SETUP',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCodeName =
  (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type ApiEnvelope<T = unknown> = {
  code: number;
  message: string;
  data: T | null;
  errorCode?: string;
};

export function ok<T>(data: T, message = 'ok'): ApiEnvelope<T> {
  return {
    code: API_OK_CODE,
    message,
    data,
  };
}

export function fail(
  code: number,
  message: string,
  errorCode?: string,
): ApiEnvelope<null> {
  const safeCode =
    Number.isFinite(code) && code !== API_OK_CODE ? Math.floor(code) : 500;
  return {
    code: safeCode,
    message: message || 'error',
    data: null,
    ...(errorCode ? { errorCode } : {}),
  };
}

/** 按 HTTP status 推断默认业务码 */
export function defaultErrorCode(status: number): string {
  switch (status) {
    case 400:
      return ApiErrorCode.BAD_REQUEST;
    case 401:
      return ApiErrorCode.UNAUTHORIZED;
    case 403:
      return ApiErrorCode.FORBIDDEN;
    case 404:
      return ApiErrorCode.NOT_FOUND;
    case 409:
      return ApiErrorCode.CONFLICT;
    case 413:
      return ApiErrorCode.PAYLOAD_TOO_LARGE;
    case 503:
      return ApiErrorCode.NEEDS_SETUP;
    default:
      return status >= 500
        ? ApiErrorCode.INTERNAL_ERROR
        : ApiErrorCode.BAD_REQUEST;
  }
}

/**
 * 路由内快捷失败返回：
 *   return sendFail(reply, 404, 'not found', ApiErrorCode.NOT_FOUND)
 */
export function sendFail(
  reply: { code: (n: number) => { send: (body: unknown) => unknown } },
  status: number,
  message: string,
  errorCode?: string,
) {
  const code = Number.isFinite(status) ? Math.floor(status) : 500;
  return reply
    .code(code)
    .send(fail(code, message, errorCode || defaultErrorCode(code)));
}

export function isApiEnvelope(payload: unknown): payload is ApiEnvelope {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const p = payload as Record<string, unknown>;
  return (
    typeof p.code === 'number' &&
    typeof p.message === 'string' &&
    'data' in p
  );
}

/** 旧版错误体 { error, code? } */
function isLegacyErrorBody(
  payload: unknown,
): payload is { error: string; code?: string; message?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  // 已是信封则不算 legacy
  if (isApiEnvelope(payload)) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.error === 'string';
}

/**
 * 把路由 handler 的原始返回值规范为统一信封。
 * - 已是信封：原样返回
 * - 旧错误体 { error, code }：转为 fail
 * - HTTP 4xx/5xx 其它对象：尽量提取 message
 * - 成功对象/数组：包进 data
 */
export function wrapApiPayload(
  payload: unknown,
  statusCode: number,
): ApiEnvelope<unknown> | unknown {
  if (isApiEnvelope(payload)) {
    // 失败信封若缺 errorCode，补默认业务码
    if (
      payload.code !== API_OK_CODE &&
      !payload.errorCode &&
      statusCode >= 400
    ) {
      return fail(
        payload.code || statusCode,
        payload.message,
        defaultErrorCode(statusCode),
      );
    }
    return payload;
  }

  if (isLegacyErrorBody(payload)) {
    const status = statusCode >= 400 ? statusCode : 400;
    // Fastify 默认错误体也有 error 字段，优先更具体的 message
    const message =
      typeof payload.message === 'string' && payload.message.trim()
        ? payload.message
        : payload.error;
    return fail(
      status,
      message,
      payload.code || defaultErrorCode(status),
    );
  }

  if (statusCode >= 400) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const p = payload as Record<string, unknown>;
      const message =
        (typeof p.message === 'string' && p.message) ||
        (typeof p.error === 'string' && p.error) ||
        'error';
      const errorCode =
        typeof p.errorCode === 'string'
          ? p.errorCode
          : typeof p.code === 'string'
            ? p.code
            : defaultErrorCode(statusCode);
      return fail(statusCode, message, errorCode);
    }
    if (typeof payload === 'string' && payload) {
      return fail(statusCode, payload, defaultErrorCode(statusCode));
    }
    return fail(statusCode, 'error', defaultErrorCode(statusCode));
  }

  // 成功：整包放入 data（含 null 业务数据）
  return ok(payload as unknown);
}
