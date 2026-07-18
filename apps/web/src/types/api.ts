/** 与后端统一的 API 响应信封 */
export type ApiEnvelope<T = unknown> = {
  /** 0 = 成功；非 0 = 失败（通常等于 HTTP status） */
  code: number;
  message: string;
  data: T | null;
  /** 稳定业务错误码，如 UNAUTHORIZED / NEEDS_SETUP */
  errorCode?: string;
};

export const API_OK_CODE = 0;

/** 与后端 ApiErrorCode 对齐的稳定业务码 */
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
