import type { ScriptPromptOptions, TtsOptions } from '../types/job';
import { request } from './http';


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
