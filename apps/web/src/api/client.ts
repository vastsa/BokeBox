import type { HealthInfo, Job, LibraryItem, ListenRecord, PipelineFromStep, TtsOptions } from '../types/job';

const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
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
    published?: boolean;
    onProgress?: (pct: number) => void;
  } = {},
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/jobs`);
    xhr.responseType = 'json';
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
          `上传失败 (${xhr.status})`;
        reject(new Error(err));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    const form = new FormData();
    // 重要：字段必须在 file 之前，否则 @fastify/multipart 的 req.file()
    // 往往拿不到后续字段，TTS 会静默回落到 default
    const tts = options.tts || { mode: 'default' as const };
    form.append('tts', JSON.stringify(tts));
    form.append('ttsMode', tts.mode || 'default');
    if (tts.voice) form.append('voice', tts.voice);
    if (tts.voiceDesign) form.append('voiceDesign', tts.voiceDesign);
    if (tts.styleTags?.length) {
      form.append('styleTags', JSON.stringify(tts.styleTags));
    }
    if (options.published === false) form.append('published', 'false');
    form.append('file', file);
    xhr.send(form);
  });
}

export async function createJobFromUrl(
  url: string,
  options: {
    tts?: TtsOptions;
    published?: boolean;
    title?: string;
  } = {},
): Promise<Job> {
  const data = await request<{ job: Job }>('/jobs/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      tts: options.tts,
      published: options.published,
      title: options.title,
    }),
  });
  return data.job;
}

export async function deleteJob(id: string): Promise<void> {
  await request(`/jobs/${id}`, { method: 'DELETE' });
}

export async function retryJob(
  id: string,
  options: { tts?: TtsOptions; fromStep?: PipelineFromStep } = {},
): Promise<Job> {
  const data = await request<{ job: Job }>(`/jobs/${id}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tts: options.tts,
      ...(options.fromStep ? { fromStep: options.fromStep } : {}),
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
  patch: { published?: boolean; title?: string; tts?: TtsOptions },
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

export function podcastAudioUrl(id: string, download = false): string {
  return `${BASE}/jobs/${id}/audio${download ? '?download=1' : ''}`;
}

export function sourceAudioUrl(id: string): string {
  return `${BASE}/jobs/${id}/source-audio`;
}

export function videoUrl(id: string): string {
  return `${BASE}/jobs/${id}/video`;
}
