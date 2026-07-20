/**
 * AI 连接配置（模型 / 提供方 / 分服务 endpoint）
 */
import type { Locale } from '../../i18n/types.js';
import { isContentLocale, isLocale, listLocaleMeta, type LocaleMeta } from '../../i18n/index.js';
import {
  KEY_AI,
  getSettingRaw,
  parseJson,
  setSettingRaw,
} from './kv.js';

export type AiConfig = {
  /** 全局默认 API Key（各服务未单独配置时回落） */
  apiKey: string;
  /** 全局默认 Base URL */
  baseUrl: string;
  chatModel: string;
  asrModel: string;
  ttsModel: string;
  voiceDesignModel: string;
  /** 图片生成模型；空字符串表示不生成 AI 封面 */
  imageModel: string;
  defaultVoice: string;
  /** 内容生成与 AI 提示词默认语言 */
  contentLocale: Locale;
  /**
   * ASR 提供方：mimo | openai | local-whisper | 自定义 registerAsrProvider 注册 id
   * 热切换：保存后下一请求立即生效
   */
  asrProvider: string;
  /**
   * TTS 提供方：mimo | openai | edge | 自定义 registerTtsProvider 注册 id
   */
  ttsProvider: string;
  /**
   * 本地 Whisper 可执行文件路径；空则自动在 PATH 查找 whisper / whisper-cli
   */
  whisperBin: string;
  /**
   * 本地 Whisper 语言提示，如 zh / en；空则自动检测
   */
  whisperLang: string;
  /** 以下为空字符串时继承全局 baseUrl / apiKey */
  llmBaseUrl: string;
  llmApiKey: string;
  asrBaseUrl: string;
  asrApiKey: string;
  ttsBaseUrl: string;
  ttsApiKey: string;
  imageBaseUrl: string;
  imageApiKey: string;
};

export type PublicServiceEndpoint = {
  /** 服务专属 Base URL；空表示继承全局 */
  baseUrl: string;
  apiKeySet: boolean;
  apiKeyHint: string;
  model: string;
};

export type PublicAiConfig = {
  /** 全局默认连接 */
  apiKeySet: boolean;
  apiKeyHint: string;
  baseUrl: string;
  /** @deprecated 兼容旧前端：等同 llm.model */
  chatModel: string;
  asrModel: string;
  ttsModel: string;
  voiceDesignModel: string;
  imageModel: string;
  defaultVoice: string;
  contentLocale: Locale;
  contentLocales: LocaleMeta[];
  uiLocales: LocaleMeta[];
  asrProvider: string;
  ttsProvider: string;
  whisperBin: string;
  whisperLang: string;
  /** 分功能配置 */
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
  asrProviders?: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
    suggestedModels?: Record<string, string>;
  }>;
  ttsProviders?: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
    enabled?: boolean;
    active?: boolean;
    suggestedModels?: Record<string, string>;
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
  }>;
};

export const DEFAULT_AI: AiConfig = {
  apiKey: '',
  baseUrl: 'https://api.oj.ink/v1',
  chatModel: 'mimo-v2.5',
  asrModel: 'mimo-v2.5-asr',
  ttsModel: 'mimo-v2.5-tts',
  voiceDesignModel: 'mimo-v2.5-tts-voicedesign',
  imageModel: '',
  defaultVoice: '冰糖',
  contentLocale: 'zh-CN',
  asrProvider: 'mimo',
  ttsProvider: 'mimo',
  whisperBin: '',
  whisperLang: '',
  llmBaseUrl: '',
  llmApiKey: '',
  asrBaseUrl: '',
  asrApiKey: '',
  ttsBaseUrl: '',
  ttsApiKey: '',
  imageBaseUrl: '',
  imageApiKey: '',
};

export function getAiConfig(): AiConfig {
  const stored = parseJson<Partial<AiConfig>>(getSettingRaw(KEY_AI));
  const envKey = process.env.OPENAI_API_KEY?.trim() || '';
  const envBase = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
  return {
    apiKey: stored?.apiKey?.trim() || envKey || DEFAULT_AI.apiKey,
    baseUrl: (stored?.baseUrl || envBase || DEFAULT_AI.baseUrl).replace(
      /\/$/,
      '',
    ),
    chatModel:
      stored?.chatModel?.trim() ||
      process.env.OPENAI_CHAT_MODEL ||
      DEFAULT_AI.chatModel,
    asrModel:
      stored?.asrModel?.trim() ||
      process.env.OPENAI_TRANSCRIBE_MODEL ||
      DEFAULT_AI.asrModel,
    ttsModel:
      stored?.ttsModel?.trim() ||
      process.env.OPENAI_TTS_MODEL ||
      DEFAULT_AI.ttsModel,
    asrProvider:
      stored?.asrProvider?.trim() ||
      process.env.BOKEBOX_ASR_PROVIDER ||
      DEFAULT_AI.asrProvider,
    ttsProvider:
      stored?.ttsProvider?.trim() ||
      process.env.BOKEBOX_TTS_PROVIDER ||
      DEFAULT_AI.ttsProvider,
    whisperBin:
      (stored?.whisperBin !== undefined
        ? String(stored.whisperBin || '').trim()
        : '') ||
      process.env.BOKEBOX_WHISPER_BIN?.trim() ||
      process.env.WHISPER_BIN?.trim() ||
      DEFAULT_AI.whisperBin,
    whisperLang:
      (stored?.whisperLang !== undefined
        ? String(stored.whisperLang || '').trim()
        : '') ||
      process.env.BOKEBOX_WHISPER_LANG?.trim() ||
      DEFAULT_AI.whisperLang,
    voiceDesignModel:
      stored?.voiceDesignModel?.trim() ||
      process.env.OPENAI_TTS_VOICEDESIGN_MODEL ||
      DEFAULT_AI.voiceDesignModel,
    // 图片模型允许显式空字符串关闭；仅在字段缺失时回落 env/默认
    imageModel:
      stored && Object.prototype.hasOwnProperty.call(stored, 'imageModel')
        ? String(stored.imageModel || '').trim()
        : (process.env.OPENAI_IMAGE_MODEL || DEFAULT_AI.imageModel).trim(),
    defaultVoice:
      stored?.defaultVoice?.trim() ||
      process.env.OPENAI_TTS_DEFAULT_VOICE ||
      DEFAULT_AI.defaultVoice,
    contentLocale: isContentLocale(stored?.contentLocale)
      ? stored!.contentLocale!
      : DEFAULT_AI.contentLocale,
    llmBaseUrl: String(stored?.llmBaseUrl || '').trim(),
    llmApiKey: String(stored?.llmApiKey || '').trim(),
    asrBaseUrl: String(stored?.asrBaseUrl || '').trim(),
    asrApiKey: String(stored?.asrApiKey || '').trim(),
    ttsBaseUrl: String(stored?.ttsBaseUrl || '').trim(),
    ttsApiKey: String(stored?.ttsApiKey || '').trim(),
    imageBaseUrl: String(stored?.imageBaseUrl || '').trim(),
    imageApiKey: String(stored?.imageApiKey || '').trim(),
  };
}

/** 仅读取库中已保存配置（不含 env 回落），用于判断是否写过 */
export function getStoredAiConfig(): Partial<AiConfig> | null {
  return parseJson<Partial<AiConfig>>(getSettingRaw(KEY_AI));
}

export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const current = getAiConfig();
  const next: AiConfig = {
    apiKey:
      patch.apiKey !== undefined
        ? String(patch.apiKey).trim()
        : current.apiKey,
    baseUrl: (
      patch.baseUrl !== undefined
        ? String(patch.baseUrl).trim()
        : current.baseUrl
    ).replace(/\/$/, ''),
    chatModel:
      patch.chatModel !== undefined
        ? String(patch.chatModel).trim() || current.chatModel
        : current.chatModel,
    asrModel:
      patch.asrModel !== undefined
        ? String(patch.asrModel).trim() || current.asrModel
        : current.asrModel,
    ttsModel:
      patch.ttsModel !== undefined
        ? String(patch.ttsModel).trim() || current.ttsModel
        : current.ttsModel,
    asrProvider:
      patch.asrProvider !== undefined
        ? String(patch.asrProvider).trim() || current.asrProvider
        : current.asrProvider,
    ttsProvider:
      patch.ttsProvider !== undefined
        ? String(patch.ttsProvider).trim() || current.ttsProvider
        : current.ttsProvider,
    // 允许显式空字符串：表示自动探测 PATH
    whisperBin:
      patch.whisperBin !== undefined
        ? String(patch.whisperBin).trim()
        : current.whisperBin,
    whisperLang:
      patch.whisperLang !== undefined
        ? String(patch.whisperLang).trim()
        : current.whisperLang,
    voiceDesignModel:
      patch.voiceDesignModel !== undefined
        ? String(patch.voiceDesignModel).trim() || current.voiceDesignModel
        : current.voiceDesignModel,
    // 允许保存空字符串，用于关闭 AI 封面生成
    imageModel:
      patch.imageModel !== undefined
        ? String(patch.imageModel).trim()
        : current.imageModel,
    defaultVoice:
      patch.defaultVoice !== undefined
        ? String(patch.defaultVoice).trim() || current.defaultVoice
        : current.defaultVoice,
    contentLocale:
      patch.contentLocale !== undefined && isContentLocale(patch.contentLocale)
        ? patch.contentLocale
        : current.contentLocale,
    // 服务专属端点：允许空字符串表示「继承全局」
    llmBaseUrl:
      patch.llmBaseUrl !== undefined
        ? String(patch.llmBaseUrl).trim()
        : current.llmBaseUrl,
    llmApiKey:
      patch.llmApiKey !== undefined
        ? String(patch.llmApiKey).trim()
        : current.llmApiKey,
    asrBaseUrl:
      patch.asrBaseUrl !== undefined
        ? String(patch.asrBaseUrl).trim()
        : current.asrBaseUrl,
    asrApiKey:
      patch.asrApiKey !== undefined
        ? String(patch.asrApiKey).trim()
        : current.asrApiKey,
    ttsBaseUrl:
      patch.ttsBaseUrl !== undefined
        ? String(patch.ttsBaseUrl).trim()
        : current.ttsBaseUrl,
    ttsApiKey:
      patch.ttsApiKey !== undefined
        ? String(patch.ttsApiKey).trim()
        : current.ttsApiKey,
    imageBaseUrl:
      patch.imageBaseUrl !== undefined
        ? String(patch.imageBaseUrl).trim()
        : current.imageBaseUrl,
    imageApiKey:
      patch.imageApiKey !== undefined
        ? String(patch.imageApiKey).trim()
        : current.imageApiKey,
  };
  // 空字符串 apiKey 表示不覆盖（编辑场景）；服务级 key 空字符串 = 继承全局，允许写入
  if (patch.apiKey === '') {
    next.apiKey = current.apiKey;
  }
  setSettingRaw(KEY_AI, JSON.stringify(next));
  return next;
}

export function maskApiKey(apiKey?: string): string {
  const key = (apiKey || '').trim();
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

function publicEndpoint(
  baseUrl: string,
  apiKey: string,
  model: string,
): PublicServiceEndpoint {
  return {
    baseUrl: (baseUrl || '').trim(),
    apiKeySet: Boolean((apiKey || '').trim()),
    apiKeyHint: maskApiKey(apiKey),
    model: model || '',
  };
}

export function toPublicAiConfig(cfg?: AiConfig): PublicAiConfig {
  const c = cfg || getAiConfig();
  return {
    apiKeySet: Boolean(c.apiKey),
    apiKeyHint: maskApiKey(c.apiKey),
    baseUrl: c.baseUrl,
    chatModel: c.chatModel,
    asrModel: c.asrModel,
    ttsModel: c.ttsModel,
    voiceDesignModel: c.voiceDesignModel,
    imageModel: c.imageModel || '',
    defaultVoice: c.defaultVoice,
    contentLocale: c.contentLocale || 'zh-CN',
    contentLocales: listLocaleMeta({ content: true }),
    uiLocales: listLocaleMeta({ ui: true }),
    asrProvider: c.asrProvider || DEFAULT_AI.asrProvider,
    ttsProvider: c.ttsProvider || DEFAULT_AI.ttsProvider,
    whisperBin: c.whisperBin || '',
    whisperLang: c.whisperLang || '',
    llm: publicEndpoint(c.llmBaseUrl, c.llmApiKey, c.chatModel),
    asr: {
      ...publicEndpoint(c.asrBaseUrl, c.asrApiKey, c.asrModel),
      provider: c.asrProvider || DEFAULT_AI.asrProvider,
      whisperBin: c.whisperBin || '',
      whisperLang: c.whisperLang || '',
    },
    tts: {
      ...publicEndpoint(c.ttsBaseUrl, c.ttsApiKey, c.ttsModel),
      provider: c.ttsProvider || DEFAULT_AI.ttsProvider,
      voiceDesignModel: c.voiceDesignModel,
      defaultVoice: c.defaultVoice,
    },
    image: publicEndpoint(c.imageBaseUrl, c.imageApiKey, c.imageModel || ''),
  };
}

/**
 * 附加 Provider 清单。由路由层调用，避免 settingsStore ↔ providers 循环依赖。
 */
export function withProviderCatalog(
  ai: PublicAiConfig,
  catalog?: {
    asrProviders?: PublicAiConfig['asrProviders'];
    ttsProviders?: PublicAiConfig['ttsProviders'];
  },
): PublicAiConfig {
  if (!catalog) return ai;
  return {
    ...ai,
    asrProviders: catalog.asrProviders,
    ttsProviders: catalog.ttsProviders,
  };
}

export function getDefaultAiConfigForSetup(): PublicAiConfig & {
  /** 初始化页可预填明文默认（仅 base/model，不含密钥） */
  suggested: Omit<AiConfig, 'apiKey'>;
} {
  const c = getAiConfig();
  return {
    ...toPublicAiConfig(c),
    suggested: {
      baseUrl: c.baseUrl || DEFAULT_AI.baseUrl,
      chatModel: c.chatModel || DEFAULT_AI.chatModel,
      asrModel: c.asrModel || DEFAULT_AI.asrModel,
      ttsModel: c.ttsModel || DEFAULT_AI.ttsModel,
      voiceDesignModel: c.voiceDesignModel || DEFAULT_AI.voiceDesignModel,
      imageModel: c.imageModel || DEFAULT_AI.imageModel,
      defaultVoice: c.defaultVoice || DEFAULT_AI.defaultVoice,
      contentLocale: c.contentLocale || DEFAULT_AI.contentLocale,
      asrProvider: c.asrProvider || DEFAULT_AI.asrProvider,
      ttsProvider: c.ttsProvider || DEFAULT_AI.ttsProvider,
      whisperBin: c.whisperBin || DEFAULT_AI.whisperBin,
      whisperLang: c.whisperLang || DEFAULT_AI.whisperLang,
      llmBaseUrl: c.llmBaseUrl || '',
      llmApiKey: '',
      asrBaseUrl: c.asrBaseUrl || '',
      asrApiKey: '',
      ttsBaseUrl: c.ttsBaseUrl || '',
      ttsApiKey: '',
      imageBaseUrl: c.imageBaseUrl || '',
      imageApiKey: '',
    },
  };
}

export function getContentLocale(): Locale {
  return getAiConfig().contentLocale || 'zh-CN';
}

export function setContentLocale(locale: Locale): Locale {
  const next = setAiConfig({ contentLocale: locale });
  return next.contentLocale;
}
