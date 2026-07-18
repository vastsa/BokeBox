import type {
  HealthInfo,
  Job,
  PipelineFromStep,
  ScriptPromptMode,
  ScriptPromptOptions,
  TtsOptions,
  TtsSourceMode,
} from '../types/job';
import type {
  JobListFacets,
  JobListFilter,
  JobListResult,
  ListQuery,
} from '../types/pagination';
import { getLocale, tOutside } from '../i18n';
import { getToken } from '../lib/auth';
import type { ApiEnvelope } from '../types/api';
import {
  ApiError,
  BASE,
  fetchAllPages,
  parseApiBody,
  request,
  toQuery,
} from './http';

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
      try {
        const body = parseApiBody<{ job: Job }>(xhr.response, xhr.status);
        resolve(body.job);
      } catch (e) {
        if (e instanceof ApiError) {
          reject(e);
          return;
        }
        const err =
          (xhr.response as ApiEnvelope | { error?: string } | null) &&
          typeof xhr.response === 'object' &&
          xhr.response &&
          'message' in (xhr.response as object)
            ? String((xhr.response as ApiEnvelope).message || '')
            : (xhr.response as { error?: string } | null)?.error ||
              tOutside('api.uploadFailed', { status: xhr.status });
        reject(new ApiError(err || tOutside('api.uploadFailed', { status: xhr.status }), xhr.status));
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
