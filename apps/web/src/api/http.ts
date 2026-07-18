/**
 * HTTP 基础层：统一信封解析、鉴权头、GET 去重、分页拉取。
 */
import { getLocale, tOutside } from '../i18n';
import { clearAuthSession, getToken } from '../lib/auth';
import {
  API_OK_CODE,
  ApiErrorCode,
  isApiEnvelope,
  type ApiEnvelope,
} from '../types/api';

export const BASE = import.meta.env.VITE_API_BASE || '/api';

/**
 * 合并同一时刻发出的相同 GET 请求。
 *
 * React StrictMode 会在开发环境复跑挂载 Effect；页面快速切换时也可能在
 * 上一轮请求结束前再次读取同一资源。共享进行中的 Promise 可以保留这些
 * 检查能力，同时避免把重复请求真正发送到服务端。
 */
const inFlightGetRequests = new Map<string, Promise<unknown>>();
let inFlightLogout: Promise<void> | null = null;

export function clearServerSession(): Promise<void> {
  if (inFlightLogout) return inFlightLogout;
  const pending = fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      if (inFlightLogout === pending) inFlightLogout = null;
    });
  inFlightLogout = pending;
  return pending;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', getLocale());
  }
  if (!headers.has('X-Locale')) {
    headers.set('X-Locale', getLocale());
  }
  return headers;
}

/**
 * 解析统一信封；兼容过渡期旧格式 { error, code } 与裸业务对象。
 */
export function parseApiBody<T>(raw: unknown, httpStatus: number): T {
  if (isApiEnvelope(raw)) {
    if (raw.code !== API_OK_CODE) {
      if (
        httpStatus === 401 &&
        (raw.errorCode === ApiErrorCode.UNAUTHORIZED || raw.code === 401)
      ) {
        clearAuthSession();
        void clearServerSession();
      }
      throw new ApiError(
        raw.message || tOutside('api.requestFailed', { status: httpStatus }),
        httpStatus || raw.code || 500,
        raw.errorCode,
      );
    }
    return raw.data as T;
  }

  // 旧错误体
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'error' in raw) {
    const err = raw as { error?: string; code?: string };
    if (httpStatus === 401 && err.code === ApiErrorCode.UNAUTHORIZED) {
      clearAuthSession();
      void clearServerSession();
    }
    throw new ApiError(
      err.error || tOutside('api.requestFailed', { status: httpStatus }),
      httpStatus || 500,
      err.code,
    );
  }

  // 裸业务对象（理论上下线后不应再出现）
  if (httpStatus >= 400) {
    throw new ApiError(
      tOutside('api.requestFailed', { status: httpStatus }),
      httpStatus,
    );
  }
  return raw as T;
}

export async function executeRequest<T>(
  url: string,
  init: RequestInit | undefined,
  headers: Headers,
): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  const raw = await res.json().catch(() => ({}));

  // HTTP 失败时也走统一解析，拿到 message / errorCode
  if (!res.ok) {
    return parseApiBody<T>(raw, res.status);
  }
  return parseApiBody<T>(raw, res.status);
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = authHeaders(init?.headers);
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    // 写请求前后都切断旧 GET 的复用边界，避免保存后仍拿到保存前的响应。
    inFlightGetRequests.clear();
    try {
      return await executeRequest<T>(url, init, headers);
    } finally {
      inFlightGetRequests.clear();
    }
  }

  // 自定义请求控制项可能要求独立的取消或缓存语义，不参与 singleflight。
  if (init?.signal || init?.cache || init?.headers) {
    return executeRequest<T>(url, init, headers);
  }

  // 同一 URL 在不同登录态或语言下可能返回不同内容，必须进入去重键。
  const key = [
    url,
    headers.get('Authorization') || '',
    headers.get('X-Locale') || '',
  ].join('\n');
  const existing = inFlightGetRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = executeRequest<T>(url, init, headers);
  inFlightGetRequests.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inFlightGetRequests.get(key) === pending) {
      inFlightGetRequests.delete(key);
    }
  }
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function fetchAllPages<T>(
  load: (page: number, pageSize: number) => Promise<{
    items: T[];
    totalPages: number;
  }>,
  pageSize = 100,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  // 安全上限，防止异常循环
  for (let i = 0; i < 50; i += 1) {
    const res = await load(page, pageSize);
    all.push(...res.items);
    if (page >= res.totalPages || res.items.length === 0) break;
    page += 1;
  }
  return all;
}


export type { ApiEnvelope };
