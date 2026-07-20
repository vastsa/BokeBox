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

export type TtsVoiceUi = 'preset' | 'reference' | 'freeform' | 'none';

export type TtsVoicePanelWhen = {
  mode?: string | string[];
};

export type TtsVoicePanelOption = {
  id: string;
  name?: string;
  label?: string;
  language?: string;
  gender?: string;
  description?: string;
};

export type TtsVoicePanelField =
  | {
      type: 'info';
      text: string;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'modeTabs';
      options?: Array<{ id: string; label: string; description?: string }>;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'voiceGrid';
      options?: TtsVoicePanelOption[];
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'text' | 'textarea';
      bind: 'voice' | 'voiceDesign';
      label: string;
      placeholder?: string;
      description?: string;
      rows?: number;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'select';
      bind: 'voice' | 'voiceDesign';
      label: string;
      options: Array<{ value: string; label: string }>;
      description?: string;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'tags';
      bind: 'styleTags';
      label: string;
      options: string[];
      optional?: boolean;
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'effectiveSummary';
      when?: TtsVoicePanelWhen;
    }
  | {
      type: 'actions';
      items: Array<'usePluginDefault' | 'clearOverride' | 'openPluginSettings'>;
      when?: TtsVoicePanelWhen;
    };

export type TtsVoicePanelSpec = {
  version?: 1;
  title?: string;
  description?: string;
  fields: TtsVoicePanelField[];
};


export type AiPluginVoiceMeta = {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  description?: string;
};

export type AiPluginModeMeta = {
  id: string;
  label: string;
  modelHint?: string;
  description?: string;
};

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
  /** TTS：音色面板形态 */
  voiceUi?: TtsVoiceUi;
  /** TTS：插件配置中默认音色字段 key */
  voiceConfigKey?: string;
  /** TTS：插件声明的音色面板（宿主通用渲染） */
  voicePanel?: TtsVoicePanelSpec;
  modes?: AiPluginModeMeta[];
  voices?: AiPluginVoiceMeta[];
  suggestedModels?: {
    tts?: string;
    voiceDesign?: string;
    defaultVoice?: string;
    asr?: string;
  };
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


// ── 插件包上传安装 / 卸载 ───────────────────────────────

export type PluginPackageInstallInfo = {
  ok: true;
  kind: 'source' | 'asr' | 'tts';
  pluginId: string;
  dirName: string;
  dirPath: string;
  replaced: boolean;
  version: string;
  name: string;
  files: number;
  scan: SourcePluginsRescanResponse['scan'];
};

export type PluginPackageInstallResponse = {
  ok: boolean;
  kind?: 'source' | 'asr' | 'tts';
  installed: PluginPackageInstallInfo;
  plugins: SourcePluginDescriptor[] | AiPluginDescriptor[];
};

export type PluginPackageUninstallResponse = {
  ok: boolean;
  kind?: 'source' | 'asr' | 'tts';
  pluginId: string;
  dirName: string;
  scan: SourcePluginsRescanResponse['scan'];
  plugins: SourcePluginDescriptor[] | AiPluginDescriptor[];
};

async function postPluginZip(
  path: string,
  file: File,
  overwrite = true,
): Promise<PluginPackageInstallResponse> {
  const body = new FormData();
  body.append('file', file);
  body.append('overwrite', overwrite ? 'true' : 'false');
  return request(path, {
    method: 'POST',
    body,
  });
}

export async function installSourcePluginPackage(
  file: File,
  overwrite = true,
): Promise<PluginPackageInstallResponse> {
  return postPluginZip('/source-plugins/install', file, overwrite);
}

export async function uninstallSourcePluginPackage(
  id: string,
): Promise<PluginPackageUninstallResponse> {
  return request(`/source-plugins/${encodeURIComponent(id)}/package`, {
    method: 'DELETE',
  });
}

export async function installAiPluginPackage(
  kind: AiPluginKind,
  file: File,
  overwrite = true,
): Promise<PluginPackageInstallResponse> {
  return postPluginZip(`${aiPluginBase(kind)}/install`, file, overwrite);
}

export async function uninstallAiPluginPackage(
  kind: AiPluginKind,
  id: string,
): Promise<PluginPackageUninstallResponse> {
  return request(`${aiPluginBase(kind)}/${encodeURIComponent(id)}/package`, {
    method: 'DELETE',
  });
}
