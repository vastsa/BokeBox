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
