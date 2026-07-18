import { request } from './http';

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
