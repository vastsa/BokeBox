import type { TtsOptions } from '../types/job';
import { clearServerSession, request } from './http';

// ── 系统初始化 / 登录 / 设置 ──

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
  /** TTS 插件音色面板相关（setup / 设置页） */
  voiceUi?: string;
  voiceConfigKey?: string;
  voicePanel?: unknown;
  supportsStyleTags?: boolean;
  supportsVoiceDesign?: boolean;
  voices?: Array<{
    id: string;
    name: string;
    language?: string;
    gender?: string;
    description?: string;
  }>;
};

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
    asrProviders?: ProviderOptionDto[];
    ttsProviders?: ProviderOptionDto[];
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
