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
import { getLocale, tOutside } from '../i18n';
import { clearAuthSession, getToken } from '../lib/auth';

const BASE = import.meta.env.VITE_API_BASE || '/api';

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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = authHeaders(init?.headers);
  const res = await fetch(`${BASE}${url}`, { ...init, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: string; code?: string };
    if (res.status === 401 && err.code === 'UNAUTHORIZED') {
      clearAuthSession();
      // 同步清 HttpOnly cookie，避免前端游客、后端仍按登录态返回管理员数据
      void fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
    throw new ApiError(
      err.error || tOutside('api.requestFailed', { status: res.status }),
      res.status,
      err.code,
    );
  }
  return data as T;
}

export async function fetchHealth(): Promise<HealthInfo> {
  return request('/health');
}

export async function fetchJobs(): Promise<Job[]> {
  const data = await request<{ jobs: Job[] }>('/jobs');
  return data.jobs;
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
  } = {},
): Promise<Job> {
  const ttsSourceMode = options.ttsSourceMode || 'global';
  const data = await request<{ job: Job }>('/jobs/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      ttsSourceMode,
      tts: ttsSourceMode === 'custom' ? options.tts : undefined,
      published: options.published,
      title: options.title,
      scriptPrompt: options.scriptPrompt,
      scriptPromptMode: options.scriptPromptMode || 'global',
      locale: options.locale,
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

export async function fetchLibrary(): Promise<LibraryItem[]> {
  const data = await request<{ items: LibraryItem[] }>('/listen/library');
  return data.items;
}

export async function fetchHistory(): Promise<LibraryItem[]> {
  const data = await request<{ items: LibraryItem[] }>('/listen/history');
  return data.items;
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

/** AI 播客封面图（hasCoverImage 时可用） */
export function coverImageUrl(id: string, cacheKey?: string): string {
  return appendQuery(`${BASE}/jobs/${id}/cover`, {
    v: cacheKey,
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
  suggestedModels?: Record<string, string>;
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
  /** 内容生成 / AI 提示词默认语言 */
  contentLocale: string;
  /** 服务端注册的可选语言（扩展入口） */
  contentLocales?: LocaleMetaDto[];
  uiLocales?: LocaleMetaDto[];
  /** ASR 提供方 id：mimo | openai | ... */
  asrProvider: string;
  /** TTS 提供方 id：mimo | openai | ... */
  ttsProvider: string;
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
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    // 忽略网络错误，本地仍清会话
  }
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
  voiceDesignModel?: string;
  imageModel?: string;
  defaultVoice?: string;
  contentLocale?: string;
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

