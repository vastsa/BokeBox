import type {
  HealthInfo,
  Job,
  LibraryItem,
  ListenRecord,
  PipelineFromStep,
  ScriptPromptMode,
  ScriptPromptOptions,
  TtsOptions,
  TtsSourceMode,
} from '../types/job';
import type {
  AlbumDetail,
  AlbumListenDetail,
  AlbumSummary,
} from '../types/album';
import type {
  AlbumListResult,
  HistoryListResult,
  JobListFacets,
  JobListFilter,
  JobListResult,
  LibraryListFacets,
  LibraryListFilter,
  LibraryListResult,
  ListQuery,
} from '../types/pagination';
import { getLocale, tOutside } from '../i18n';
import { clearAuthSession, getToken } from '../lib/auth';

const BASE = import.meta.env.VITE_API_BASE || '/api';

/**
 * 合并同一时刻发出的相同 GET 请求。
 *
 * React StrictMode 会在开发环境复跑挂载 Effect；页面快速切换时也可能在
 * 上一轮请求结束前再次读取同一资源。共享进行中的 Promise 可以保留这些
 * 检查能力，同时避免把重复请求真正发送到服务端。
 */
const inFlightGetRequests = new Map<string, Promise<unknown>>();
let inFlightLogout: Promise<void> | null = null;

function clearServerSession(): Promise<void> {
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

function authHeaders(extra?: HeadersInit): Headers {
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

async function executeRequest<T>(
  url: string,
  init: RequestInit | undefined,
  headers: Headers,
): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: string; code?: string };
    if (res.status === 401 && err.code === 'UNAUTHORIZED') {
      clearAuthSession();
      // 同步清 HttpOnly cookie，避免前端游客、后端仍按登录态返回管理员数据
      void clearServerSession();
    }
    throw new ApiError(
      err.error || tOutside('api.requestFailed', { status: res.status }),
      res.status,
      err.code,
    );
  }
  return data as T;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
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

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function fetchAllPages<T>(
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

export async function fetchHealth(): Promise<HealthInfo> {
  return request('/health');
}

export async function fetchJobs(
  params: ListQuery & { filter?: JobListFilter; includeFacets?: boolean } = {},
): Promise<JobListResult> {
  const data = await request<
    {
      jobs: Job[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      facets?: JobListFacets;
    }
  >(
    `/jobs${toQuery({
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      filter: params.filter,
      includeFacets: params.includeFacets === false ? 'false' : undefined,
    })}`,
  );
  return {
    jobs: data.jobs || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 20,
    total: data.total ?? (data.jobs || []).length,
    totalPages: data.totalPages || 1,
    facets: data.facets || {
      all: data.total ?? 0,
      active: 0,
      published: 0,
      draft: 0,
      failed: 0,
      done: 0,
    },
  };
}

/** 拉全部分页任务（选择器 / 轮询活跃任务等） */
export async function fetchAllJobs(
  params: Omit<ListQuery, 'page' | 'pageSize'> & { filter?: JobListFilter } = {},
): Promise<Job[]> {
  return fetchAllPages(async (page, pageSize) => {
    const res = await fetchJobs({ ...params, page, pageSize });
    return { items: res.jobs, totalPages: res.totalPages };
  });
}

export async function fetchJob(id: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/jobs/${id}`);
  return data.job;
}

export async function createJob(
  file: File,
  options: {
    tts?: TtsOptions;
    ttsSourceMode?: TtsSourceMode;
    published?: boolean;
    scriptPrompt?: ScriptPromptOptions;
    scriptPromptMode?: ScriptPromptMode;
    /** 任务内容语言；不传则服务端用全局 contentLocale */
    locale?: string;
    /** 创建后自动加入的专辑 */
    albumId?: string;
    onProgress?: (pct: number) => void;
  } = {},
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/jobs`);
    xhr.responseType = 'json';
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept-Language', getLocale());
    xhr.setRequestHeader('X-Locale', getLocale());
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((xhr.response as { job: Job }).job);
      } else {
        const err =
          (xhr.response as { error?: string } | null)?.error ||
          tOutside('api.uploadFailed', { status: xhr.status });
        reject(new Error(err));
      }
    };
    xhr.onerror = () => reject(new Error(tOutside('api.networkUploadFailed')));
    const form = new FormData();
    // 重要：字段必须在 file 之前，否则 @fastify/multipart 的 req.file()
    // 往往拿不到后续字段，TTS 会静默回落到 default
    const ttsSourceMode = options.ttsSourceMode || 'global';
    form.append('ttsSourceMode', ttsSourceMode);
    if (ttsSourceMode === 'custom') {
      const tts = options.tts || { mode: 'default' as const };
      form.append('tts', JSON.stringify(tts));
      form.append('ttsMode', tts.mode || 'default');
      if (tts.voice) form.append('voice', tts.voice);
      if (tts.voiceDesign) form.append('voiceDesign', tts.voiceDesign);
      if (tts.styleTags?.length) {
        form.append('styleTags', JSON.stringify(tts.styleTags));
      }
    }
    if (options.published === false) form.append('published', 'false');
    const scriptPromptMode = options.scriptPromptMode || 'global';
    form.append('scriptPromptMode', scriptPromptMode);
    if (options.scriptPrompt) {
      form.append('scriptPrompt', JSON.stringify(options.scriptPrompt));
    }
    if (options.locale) {
      form.append('locale', options.locale);
    }
    if (options.albumId) {
      form.append('albumId', options.albumId);
    }
    form.append('file', file);
    xhr.send(form);
  });
}

export async function createJobFromUrl(
  url: string,
  options: {
    tts?: TtsOptions;
    ttsSourceMode?: TtsSourceMode;
    published?: boolean;
    title?: string;
    scriptPrompt?: ScriptPromptOptions;
    scriptPromptMode?: ScriptPromptMode;
    locale?: string;
    /** 指定 Source 插件；缺省自动匹配 */
    pluginId?: string;
    /** 创建后自动加入的专辑 */
    albumId?: string;
  } = {},
): Promise<Job> {
  const ttsSourceMode = options.ttsSourceMode || 'global';
  const data = await request<{ job: Job }>('/jobs/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      pluginId: options.pluginId || undefined,
      ttsSourceMode,
      tts: ttsSourceMode === 'custom' ? options.tts : undefined,
      published: options.published,
      title: options.title,
      scriptPrompt: options.scriptPrompt,
      scriptPromptMode: options.scriptPromptMode || 'global',
      locale: options.locale,
      albumId: options.albumId || undefined,
    }),
  });
  return data.job;
}

export async function deleteJob(id: string): Promise<void> {
  await request(`/jobs/${id}`, { method: 'DELETE' });
}

export async function retryJob(
  id: string,
  options: {
    tts?: TtsOptions;
    fromStep?: PipelineFromStep;
    locale?: string;
  } = {},
): Promise<Job> {
  const data = await request<{ job: Job }>(`/jobs/${id}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tts: options.tts,
      ...(options.fromStep ? { fromStep: options.fromStep } : {}),
      ...(options.locale ? { locale: options.locale } : {}),
    }),
  });
  return data.job;
}

export async function resynthesizeJob(id: string, tts?: TtsOptions): Promise<Job> {
  const data = await request<{ job: Job }>(`/jobs/${id}/resynthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tts }),
  });
  return data.job;
}

export async function generateFlashcards(id: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/jobs/${id}/flashcards`, {
    method: 'POST',
  });
  return data.job;
}

export async function updateJob(
  id: string,
  patch: {
    published?: boolean;
    title?: string;
    tts?: TtsOptions;
    scriptPrompt?: ScriptPromptOptions | null;
    locale?: string;
  },
): Promise<Job> {
  const data = await request<{ job: Job }>(`/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return data.job;
}

export async function fetchLibrary(
  params: ListQuery & { filter?: LibraryListFilter } = {},
): Promise<LibraryListResult> {
  const data = await request<
    {
      items: LibraryItem[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      facets?: LibraryListFacets;
    }
  >(
    `/listen/library${toQuery({
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      filter: params.filter,
    })}`,
  );
  return {
    items: data.items || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 24,
    total: data.total ?? (data.items || []).length,
    totalPages: data.totalPages || 1,
    facets: data.facets || {
      all: data.total ?? 0,
      unplayed: 0,
      progress: 0,
      done: 0,
    },
  };
}

/** 拉全部曲库（标签星图 / 播放队列） */
export async function fetchAllLibrary(
  params: Omit<ListQuery, 'page' | 'pageSize'> & {
    filter?: LibraryListFilter;
  } = {},
): Promise<LibraryItem[]> {
  return fetchAllPages(async (page, pageSize) => {
    const res = await fetchLibrary({ ...params, page, pageSize });
    return { items: res.items, totalPages: res.totalPages };
  });
}

export async function fetchHistory(
  params: ListQuery = {},
): Promise<HistoryListResult> {
  const data = await request<{
    items: LibraryItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(
    `/listen/history${toQuery({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
  );
  return {
    items: data.items || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 20,
    total: data.total ?? (data.items || []).length,
    totalPages: data.totalPages || 1,
  };
}

export async function fetchListenItem(id: string): Promise<LibraryItem> {
  return request(`/listen/${id}`);
}

export async function reportProgress(
  id: string,
  body: {
    progressSec: number;
    durationSec: number;
    completed?: boolean;
    incrementPlay?: boolean;
  },
): Promise<ListenRecord> {
  const data = await request<{ listen: ListenRecord }>(`/listen/${id}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.listen;
}



// ---------- Albums ----------

export async function fetchListenAlbums(
  params: ListQuery = {},
): Promise<AlbumListResult> {
  const data = await request<{
    albums: AlbumSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(
    `/listen/albums${toQuery({
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
    })}`,
  );
  return {
    albums: data.albums || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 20,
    total: data.total ?? (data.albums || []).length,
    totalPages: data.totalPages || 1,
  };
}

export async function fetchAllListenAlbums(
  params: Omit<ListQuery, 'page' | 'pageSize'> = {},
): Promise<AlbumSummary[]> {
  return fetchAllPages(async (page, pageSize) => {
    const res = await fetchListenAlbums({ ...params, page, pageSize });
    return { items: res.albums, totalPages: res.totalPages };
  });
}

export async function fetchListenAlbum(id: string): Promise<AlbumListenDetail> {
  const data = await request<{ album: AlbumListenDetail }>(
    `/listen/albums/${encodeURIComponent(id)}`,
  );
  return data.album;
}

export async function fetchAlbums(
  params: ListQuery = {},
): Promise<AlbumListResult> {
  const data = await request<{
    albums: AlbumSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(
    `/albums${toQuery({
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
    })}`,
  );
  return {
    albums: data.albums || [],
    page: data.page || 1,
    pageSize: data.pageSize || params.pageSize || 20,
    total: data.total ?? (data.albums || []).length,
    totalPages: data.totalPages || 1,
  };
}

export async function fetchAllAlbums(
  params: Omit<ListQuery, 'page' | 'pageSize'> = {},
): Promise<AlbumSummary[]> {
  return fetchAllPages(async (page, pageSize) => {
    const res = await fetchAlbums({ ...params, page, pageSize });
    return { items: res.albums, totalPages: res.totalPages };
  });
}

export async function fetchAlbum(id: string): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}`,
  );
  return data.album;
}

export async function createAlbumApi(body: {
  title: string;
  summary?: string;
  coverJobId?: string | null;
  published?: boolean;
  jobIds?: string[];
}): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>('/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.album;
}

export async function updateAlbumApi(
  id: string,
  body: {
    title?: string;
    summary?: string;
    coverJobId?: string | null;
    published?: boolean;
  },
): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return data.album;
}

export async function setAlbumItemsApi(
  id: string,
  jobIds: string[],
): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}/items`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds }),
    },
  );
  return data.album;
}

export async function deleteAlbumApi(id: string): Promise<void> {
  await request(`/albums/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 封面尺寸：列表默认 sm，详情/播放器 md，下载 full */
export type CoverImageSize = 'thumb' | 'sm' | 'md' | 'full';

/** 读取封面 URL 上的 size 参数 */
export function readCoverImageSize(url: string): CoverImageSize | null {
  try {
    const u = new URL(url, 'http://local.invalid');
    const raw = (u.searchParams.get('size') || '').trim().toLowerCase();
    if (raw === 'thumb' || raw === 'sm' || raw === 'md' || raw === 'full') return raw;
    return null;
  } catch {
    return null;
  }
}

/** 改写封面 URL 的 size（用于渐进加载：先 thumb 再清晰档） */
export function withCoverImageSize(url: string, size: CoverImageSize): string {
  const abs = /^https?:\/\//i.test(url);
  const u = new URL(url, 'http://local.invalid');
  u.searchParams.set('size', size);
  if (abs) return u.toString();
  return `${u.pathname}${u.search}`;
}

export function albumCoverUrl(
  id: string,
  cacheKey?: string,
  size: CoverImageSize = 'sm',
): string {
  // 游客与登录统一走 listen 封面（鉴权钩子已放行）
  // 始终带 size，避免 full 被服务端默认 sm 吃掉
  return appendQuery(`${BASE}/listen/albums/${encodeURIComponent(id)}/cover`, {
    v: cacheKey != null ? String(cacheKey) : undefined,
    size,
  });
}

export async function generateAlbumCoverApi(id: string): Promise<AlbumDetail> {
  const data = await request<{ album: AlbumDetail }>(
    `/albums/${encodeURIComponent(id)}/generate-cover`,
    { method: 'POST' },
  );
  return data.album;
}


export async function fetchScriptPromptSettings(): Promise<{
  scriptPrompt: ScriptPromptOptions;
  summary: string;
}> {
  return request('/settings/script-prompt');
}

export async function saveScriptPromptSettings(
  scriptPrompt?: ScriptPromptOptions | null,
): Promise<ScriptPromptOptions> {
  const data = await request<{
    scriptPrompt: ScriptPromptOptions;
    summary: string;
  }>('/settings/script-prompt', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scriptPrompt: scriptPrompt || {} }),
  });
  return data.scriptPrompt || {};
}


export type CoverPromptVariable = {
  key: string;
  label: string;
  sample: string;
};

export type CoverPromptSettings = {
  template: string;
  stored: string;
  defaultTemplate: string;
  isCustom: boolean;
  variables: CoverPromptVariable[];
};

export async function fetchCoverPromptSettings(): Promise<CoverPromptSettings> {
  return request('/settings/cover-prompt');
}

export async function saveCoverPromptSettings(body: {
  template?: string | null;
  reset?: boolean;
}): Promise<CoverPromptSettings> {
  return request('/settings/cover-prompt', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}


export type AiPromptKind = 'podcastSystem' | 'rewriteSystem' | 'flashcardSystem';

export type AiPromptVariable = {
  key: string;
  label: string;
  sample: string;
};

export type AiPromptSettings = {
  kind: AiPromptKind;
  template: string;
  stored: string;
  defaultTemplate: string;
  isCustom: boolean;
  variables: AiPromptVariable[];
};

export async function fetchAllAiPromptSettings(): Promise<
  Record<AiPromptKind, AiPromptSettings>
> {
  const data = await request<{ prompts: Record<AiPromptKind, AiPromptSettings> }>(
    '/settings/ai-prompts',
  );
  return data.prompts;
}

export async function fetchAiPromptSettings(
  kind: AiPromptKind,
): Promise<AiPromptSettings> {
  return request(`/settings/ai-prompts/${kind}`);
}

export async function saveAiPromptSettings(
  kind: AiPromptKind,
  body: { template?: string | null; reset?: boolean },
): Promise<AiPromptSettings> {
  return request(`/settings/ai-prompts/${kind}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchTtsSettings(): Promise<{ tts: TtsOptions }> {
  return request('/settings/tts');
}

export async function saveTtsSettings(
  tts?: TtsOptions | null,
): Promise<TtsOptions> {
  const data = await request<{ tts: TtsOptions }>('/settings/tts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tts: tts || { mode: 'default' } }),
  });
  return data.tts;
}

function appendQuery(url: string, params: Record<string, string | undefined>): string {
  const abs = /^https?:\/\//i.test(url);
  const u = new URL(url, 'http://local.invalid');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') u.searchParams.set(k, v);
  }
  const token = getToken();
  if (token) u.searchParams.set('access_token', token);
  if (abs) return u.toString();
  return `${u.pathname}${u.search}`;
}

export function podcastAudioUrl(
  id: string,
  download = false,
  cacheKey?: string,
): string {
  return appendQuery(`${BASE}/jobs/${id}/audio`, {
    download: download ? '1' : undefined,
    v: cacheKey,
  });
}

export function sourceAudioUrl(id: string): string {
  return appendQuery(`${BASE}/jobs/${id}/source-audio`, {});
}

export function videoUrl(id: string): string {
  return appendQuery(`${BASE}/jobs/${id}/video`, {});
}

/** AI 播客封面图（hasCoverImage 时可用；默认 sm 加速列表加载） */
export function coverImageUrl(
  id: string,
  cacheKey?: string,
  size: CoverImageSize = 'sm',
): string {
  // 始终带 size，避免 full 被服务端默认 sm 吃掉
  return appendQuery(`${BASE}/jobs/${id}/cover`, {
    v: cacheKey != null ? String(cacheKey) : undefined,
    size,
  });
}


// ── 系统初始化 / 登录 / 设置 ──

export type SetupStatus = {
  initialized: boolean;
  needsSetup: boolean;
  /** 游客是否可浏览首页与收听 */
  guestHomePublic?: boolean;
  /** 站点自定义名称（不含 - BokeBox） */
  siteName?: string;
  /** 最终展示名（含 - BokeBox） */
  siteTitle?: string;
  /** 公开 SEO（已含出处） */
  seo?: PublicSiteSeo;
  ai?: {
    apiKeySet: boolean;
    apiKeyHint: string;
    baseUrl: string;
    chatModel: string;
    asrModel: string;
    asrProvider?: string;
    ttsModel: string;
    ttsProvider?: string;
    voiceDesignModel: string;
    imageModel: string;
    defaultVoice: string;
    contentLocale: string;
    suggested: {
      baseUrl: string;
      chatModel: string;
      asrModel: string;
      asrProvider?: string;
      ttsModel: string;
      ttsProvider?: string;
      whisperBin?: string;
      whisperLang?: string;
      voiceDesignModel: string;
      imageModel: string;
      defaultVoice: string;
      contentLocale: string;
    };
  };
};

export type LocaleMetaDto = {
  code: string;
  label: string;
  nativeLabel: string;
  short: string;
  ui: boolean;
  content: boolean;
};

export type ProviderOptionDto = {
  id: string;
  name: string;
  description: string;
  available: boolean;
  /** 插件是否启用 */
  enabled?: boolean;
  /** 是否为当前 settings 激活提供方 */
  active?: boolean;
  suggestedModels?: Record<string, string>;
};

export type PublicServiceEndpoint = {
  baseUrl: string;
  apiKeySet: boolean;
  apiKeyHint: string;
  model: string;
};

export type PublicAiConfig = {
  apiKeySet: boolean;
  apiKeyHint: string;
  baseUrl: string;
  chatModel: string;
  asrModel: string;
  ttsModel: string;
  voiceDesignModel: string;
  imageModel: string;
  defaultVoice: string;
  contentLocale: string;
  contentLocales?: LocaleMetaDto[];
  uiLocales?: LocaleMetaDto[];
  asrProvider: string;
  ttsProvider: string;
  whisperBin: string;
  whisperLang: string;
  llm: PublicServiceEndpoint;
  asr: PublicServiceEndpoint & {
    provider: string;
    whisperBin: string;
    whisperLang: string;
  };
  tts: PublicServiceEndpoint & {
    provider: string;
    voiceDesignModel: string;
    defaultVoice: string;
  };
  image: PublicServiceEndpoint;
  asrProviders?: ProviderOptionDto[];
  ttsProviders?: ProviderOptionDto[];
};

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return request('/setup/status');
}

export async function completeSetup(body: {
  username: string;
  password: string;
  confirmPassword?: string;
  apiKey: string;
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
  contentLocale?: string;
  tts?: TtsOptions | null;
}): Promise<{ ok: boolean; username: string; token: string; expiresAt: string }> {
  return request('/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function login(body: {
  username: string;
  password: string;
}): Promise<{ ok: boolean; username: string; token: string; expiresAt: string }> {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function logout(): Promise<void> {
  await clearServerSession();
}

export async function fetchMe(): Promise<{ username: string; createdAt?: string }> {
  return request('/auth/me');
}

export async function changePassword(body: {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}): Promise<{ ok: boolean; message?: string }> {
  return request('/auth/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchAiSettings(): Promise<PublicAiConfig> {
  const data = await request<{ ai: PublicAiConfig }>('/settings/ai');
  return data.ai;
}

export async function saveAiSettings(body: {
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
  contentLocale?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  asrBaseUrl?: string;
  asrApiKey?: string;
  ttsBaseUrl?: string;
  ttsApiKey?: string;
  imageBaseUrl?: string;
  imageApiKey?: string;
}): Promise<PublicAiConfig> {
  const data = await request<{ ai: PublicAiConfig }>('/settings/ai', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.ai;
}

export type SiteSeoInput = {
  title: string;
  description: string;
  keywords: string;
};

export type PublicSiteSeo = {
  title: string;
  description: string;
  keywords: string;
  github: string;
  attribution: string;
};

export type AccessSettings = {
  guestHomePublic: boolean;
  siteName: string;
  siteTitle: string;
  seo: PublicSiteSeo;
  seoInput: SiteSeoInput;
};

export async function fetchAccessSettings(): Promise<AccessSettings> {
  return request('/settings/access');
}

export async function saveAccessSettings(
  body: {
    guestHomePublic?: boolean;
    siteName?: string | null;
    seo?: Partial<SiteSeoInput> | null;
  },
): Promise<AccessSettings> {
  return request('/settings/access', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── MCP：AI 可安装的远程工具协议 ──

export type McpToolSummary = {
  name: string;
  description: string;
};

export type McpInstallBundle = {
  endpoint: string;
  token: string;
  headers: Record<string, string>;
  generic: Record<string, unknown>;
  streamableHttp: Record<string, unknown>;
  httpUrl: Record<string, unknown>;
  cursor: Record<string, unknown>;
  claudeDesktop: Record<string, unknown>;
  codex: Record<string, unknown>;
  openclaw: Record<string, unknown>;
  /** 直接粘贴给 AI 的安装提示词 */
  aiPrompt: string;
  snippets: {
    cursorJson: string;
    claudeDesktopJson: string;
    codexJson: string;
    openclawJson: string;
  };
};

export type McpStatus = {
  enabled: boolean;
  hasToken: boolean;
  tokenHint: string;
  token?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  username?: string;
  endpoint: string;
  baseUrl: string;
  tools: McpToolSummary[];
};

export type McpInstallResponse = {
  ok: boolean;
  message: string;
  openSource: string;
  license: string;
  status: Omit<McpStatus, 'endpoint' | 'baseUrl' | 'tools' | 'token'>;
  tools: Array<McpToolSummary & { inputSchema?: Record<string, unknown> }>;
  install: McpInstallBundle;
};

export async function fetchMcpStatus(): Promise<McpStatus> {
  return request('/mcp/status');
}

export async function fetchMcpInstall(baseUrl?: string): Promise<McpInstallResponse> {
  const q = baseUrl?.trim()
    ? `?baseUrl=${encodeURIComponent(baseUrl.trim())}`
    : '';
  return request(`/mcp/install${q}`);
}

export async function regenerateMcpToken(): Promise<
  McpStatus & { ok: boolean; message: string; install: McpInstallBundle }
> {
  return request('/mcp/regenerate', { method: 'POST' });
}

// ── Source 插件 ──────────────────────────────────────────

export type SourceRiskLevel = 'low' | 'medium' | 'high';
export type SourcePluginOrigin = 'builtin' | 'external';
export type SourceCapability = 'url' | 'file' | 'webpage' | 'media';
export type SourcePluginPermission =
  | 'network'
  | 'fs:job-dir'
  | 'process:spawn'
  | 'config'
  | 'cookies';

export type SourcePluginConfigFieldType =
  | 'string'
  | 'password'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea';

export type SourcePluginConfigValue = string | number | boolean;

export type SourcePluginConfigField = {
  key: string;
  label: string;
  type: SourcePluginConfigFieldType;
  description?: string;
  required?: boolean;
  placeholder?: string;
  default?: SourcePluginConfigValue;
  options?: Array<{ value: string; label: string }>;
  secret?: boolean;
};

export type SourcePluginConfigFieldStatus = {
  set: boolean;
  hint?: string;
};

export type SourcePluginDescriptor = {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: SourceRiskLevel;
  capabilities: SourceCapability[];
  defaultEnabled: boolean;
  enabled: boolean;
  available: boolean;
  origin: SourcePluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: SourcePluginPermission[];
  apiVersion?: number;
  loadError?: string;
  configSchema?: SourcePluginConfigField[];
  configValues?: Record<string, SourcePluginConfigValue | ''>;
  configStatus?: Record<string, SourcePluginConfigFieldStatus>;
  configReady?: boolean;
};

export type SourcePluginsResponse = {
  pluginsDir: string;
  plugins: SourcePluginDescriptor[];
};

export type SourcePluginsRescanResponse = {
  ok: boolean;
  scan: {
    pluginsDir: string;
    loaded: string[];
    failed: Array<{ id: string; dirName: string; error: string }>;
    removed: string[];
  };
  plugins: SourcePluginDescriptor[];
};

export async function fetchSourcePlugins(): Promise<SourcePluginsResponse> {
  return request('/source-plugins');
}

export async function rescanSourcePlugins(): Promise<SourcePluginsRescanResponse> {
  return request('/source-plugins/rescan', { method: 'POST' });
}

export async function setSourcePluginEnabledApi(
  id: string,
  enabled: boolean,
): Promise<{ ok: boolean; id: string; enabled: boolean; plugins: SourcePluginDescriptor[] }> {
  return request(`/source-plugins/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function resetSourcePluginEnabledApi(
  id: string,
): Promise<{ ok: boolean; id: string; enabled: boolean; plugins: SourcePluginDescriptor[] }> {
  return request(`/source-plugins/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
  });
}

export async function saveSourcePluginConfigApi(
  id: string,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; id: string; plugins: SourcePluginDescriptor[] }> {
  return request(`/source-plugins/${encodeURIComponent(id)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

export async function resetSourcePluginConfigApi(
  id: string,
): Promise<{ ok: boolean; id: string; plugins: SourcePluginDescriptor[] }> {
  return request(`/source-plugins/${encodeURIComponent(id)}/config/reset`, {
    method: 'POST',
  });
}

// ── ASR / TTS 插件（与 Source 同一套机制） ─────────────────

export type AiPluginKind = 'asr' | 'tts';

export type AiPluginDescriptor = {
  kind?: AiPluginKind;
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: SourceRiskLevel;
  defaultEnabled: boolean;
  enabled: boolean;
  available: boolean;
  origin: SourcePluginOrigin;
  dirName?: string;
  dirPath?: string;
  permissions?: SourcePluginPermission[];
  apiVersion?: number;
  loadError?: string;
  configSchema?: SourcePluginConfigField[];
  configValues?: Record<string, SourcePluginConfigValue | ''>;
  configStatus?: Record<string, SourcePluginConfigFieldStatus>;
  configReady?: boolean;
  active?: boolean;
  suggestedModel?: string;
  supportsStyleTags?: boolean;
  supportsVoiceDesign?: boolean;
};

export type AiPluginsResponse = {
  kind?: AiPluginKind;
  pluginsDir: string;
  plugins: AiPluginDescriptor[];
};

export type AiPluginsRescanResponse = {
  ok: boolean;
  kind?: AiPluginKind;
  scan: {
    pluginsDir: string;
    loaded: string[];
    failed: Array<{ id: string; dirName: string; error: string }>;
    removed: string[];
  };
  plugins: AiPluginDescriptor[];
};

function aiPluginBase(kind: AiPluginKind): string {
  return `/${kind}-plugins`;
}

export async function fetchAiPlugins(kind: AiPluginKind): Promise<AiPluginsResponse> {
  return request(aiPluginBase(kind));
}

export async function rescanAiPlugins(kind: AiPluginKind): Promise<AiPluginsRescanResponse> {
  return request(`${aiPluginBase(kind)}/rescan`, { method: 'POST' });
}

export async function setAiPluginEnabledApi(
  kind: AiPluginKind,
  id: string,
  enabled: boolean,
): Promise<{ ok: boolean; id: string; enabled: boolean; plugins: AiPluginDescriptor[] }> {
  return request(`${aiPluginBase(kind)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function resetAiPluginEnabledApi(
  kind: AiPluginKind,
  id: string,
): Promise<{ ok: boolean; id: string; enabled: boolean; plugins: AiPluginDescriptor[] }> {
  return request(`${aiPluginBase(kind)}/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
  });
}

export async function saveAiPluginConfigApi(
  kind: AiPluginKind,
  id: string,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; id: string; plugins: AiPluginDescriptor[] }> {
  return request(`${aiPluginBase(kind)}/${encodeURIComponent(id)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

export async function resetAiPluginConfigApi(
  kind: AiPluginKind,
  id: string,
): Promise<{ ok: boolean; id: string; plugins: AiPluginDescriptor[] }> {
  return request(`${aiPluginBase(kind)}/${encodeURIComponent(id)}/config/reset`, {
    method: 'POST',
  });
}
