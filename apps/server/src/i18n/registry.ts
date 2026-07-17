/**
 * 语言注册中心（唯一扩展入口）
 *
 * 新增语言：
 * 1. 在 LOCALE_DEFINITIONS 追加一项
 * 2. 若需要界面文案：补 messages 目录 + catalogs（ui: true）
 * 3. 内容生成：默认走通用 prompt（content: true 即可），zh/en 有专用优化稿
 */

export type ScriptDensity = 'cjk' | 'latin';

export type LocaleDefinition = {
  /** BCP-47 语言标签 */
  code: string;
  /** 英文名 */
  label: string;
  /** 本地名 */
  nativeLabel: string;
  /** 短标签（选择器） */
  short: string;
  /** Accept-Language / 浏览器匹配别名（小写） */
  aliases: string[];
  /** 是否有 UI 文案包 */
  ui: boolean;
  /** 是否可作为内容生成语言 */
  content: boolean;
  /** 口播字数密度 */
  density: ScriptDensity;
  /** 注入 AI 提示词的目标语言名（英文） */
  promptLanguage: string;
};

/**
 * 在此追加语言即可扩展，无需改 isLocale 硬编码分支。
 * ui: 界面文案；content: 口播/闪卡/提示词。
 */
export const LOCALE_DEFINITIONS = [
  {
    code: 'zh-CN',
    label: 'Chinese (Simplified)',
    nativeLabel: '简体中文',
    short: '中文',
    aliases: ['zh', 'zh-cn', 'zh-hans', 'zh-sg'],
    ui: true,
    content: true,
    density: 'cjk',
    promptLanguage: 'Simplified Chinese',
  },
  {
    code: 'zh-TW',
    label: 'Chinese (Traditional)',
    nativeLabel: '繁體中文',
    short: '繁中',
    aliases: ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo'],
    ui: false,
    content: true,
    density: 'cjk',
    promptLanguage: 'Traditional Chinese',
  },
  {
    code: 'en-US',
    label: 'English',
    nativeLabel: 'English',
    short: 'EN',
    aliases: ['en', 'en-us', 'en-gb', 'en-au', 'en-ca'],
    ui: true,
    content: true,
    density: 'latin',
    promptLanguage: 'English',
  },
  {
    code: 'ja-JP',
    label: 'Japanese',
    nativeLabel: '日本語',
    short: 'JA',
    aliases: ['ja', 'ja-jp'],
    ui: false,
    content: true,
    density: 'cjk',
    promptLanguage: 'Japanese',
  },
  {
    code: 'ko-KR',
    label: 'Korean',
    nativeLabel: '한국어',
    short: 'KO',
    aliases: ['ko', 'ko-kr'],
    ui: false,
    content: true,
    density: 'cjk',
    promptLanguage: 'Korean',
  },
  {
    code: 'es-ES',
    label: 'Spanish',
    nativeLabel: 'Español',
    short: 'ES',
    aliases: ['es', 'es-es', 'es-mx', 'es-419', 'es-ar'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Spanish',
  },
  {
    code: 'fr-FR',
    label: 'French',
    nativeLabel: 'Français',
    short: 'FR',
    aliases: ['fr', 'fr-fr', 'fr-ca', 'fr-be'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'French',
  },
  {
    code: 'de-DE',
    label: 'German',
    nativeLabel: 'Deutsch',
    short: 'DE',
    aliases: ['de', 'de-de', 'de-at', 'de-ch'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'German',
  },
  {
    code: 'pt-BR',
    label: 'Portuguese',
    nativeLabel: 'Português',
    short: 'PT',
    aliases: ['pt', 'pt-br', 'pt-pt'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Portuguese',
  },
  {
    code: 'ru-RU',
    label: 'Russian',
    nativeLabel: 'Русский',
    short: 'RU',
    aliases: ['ru', 'ru-ru'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Russian',
  },
  {
    code: 'ar-SA',
    label: 'Arabic',
    nativeLabel: 'العربية',
    short: 'AR',
    aliases: ['ar', 'ar-sa', 'ar-ae', 'ar-eg'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Arabic',
  },
  {
    code: 'hi-IN',
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    short: 'HI',
    aliases: ['hi', 'hi-in'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Hindi',
  },
  {
    code: 'vi-VN',
    label: 'Vietnamese',
    nativeLabel: 'Tiếng Việt',
    short: 'VI',
    aliases: ['vi', 'vi-vn'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Vietnamese',
  },
  {
    code: 'th-TH',
    label: 'Thai',
    nativeLabel: 'ไทย',
    short: 'TH',
    aliases: ['th', 'th-th'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Thai',
  },
  {
    code: 'id-ID',
    label: 'Indonesian',
    nativeLabel: 'Bahasa Indonesia',
    short: 'ID',
    aliases: ['id', 'id-id'],
    ui: false,
    content: true,
    density: 'latin',
    promptLanguage: 'Indonesian',
  },
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof LOCALE_DEFINITIONS)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const DEFAULT_CONTENT_LOCALE: Locale = 'zh-CN';
export const DEFAULT_UI_LOCALE: Locale = 'zh-CN';

export const LOCALES: Locale[] = LOCALE_DEFINITIONS.map((d) => d.code);

export const UI_LOCALES: Locale[] = LOCALE_DEFINITIONS.filter((d) => d.ui).map(
  (d) => d.code,
);

export const CONTENT_LOCALES: Locale[] = LOCALE_DEFINITIONS.filter(
  (d) => d.content,
).map((d) => d.code);

export type LocaleMeta = {
  code: Locale;
  label: string;
  nativeLabel: string;
  short: string;
  ui: boolean;
  content: boolean;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = Object.fromEntries(
  LOCALE_DEFINITIONS.map((d) => [
    d.code,
    {
      code: d.code,
      label: d.label,
      nativeLabel: d.nativeLabel,
      short: d.short,
      ui: d.ui,
      content: d.content,
    },
  ]),
) as Record<Locale, LocaleMeta>;

const CODE_SET = new Set<string>(LOCALES);
const ALIAS_MAP = new Map<string, Locale>();
for (const def of LOCALE_DEFINITIONS) {
  ALIAS_MAP.set(def.code.toLowerCase(), def.code);
  for (const alias of def.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), def.code);
  }
}

export function getLocaleDefinition(
  code: string | null | undefined,
): LocaleDefinition | undefined {
  if (!code) return undefined;
  const resolved = ALIAS_MAP.get(String(code).trim().toLowerCase());
  if (!resolved) return undefined;
  return LOCALE_DEFINITIONS.find((d) => d.code === resolved) as
    | LocaleDefinition
    | undefined;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && CODE_SET.has(value);
}

export function isUiLocale(value: unknown): value is Locale {
  if (!isLocale(value)) return false;
  return Boolean(LOCALE_META[value]?.ui);
}

export function isContentLocale(value: unknown): value is Locale {
  if (!isLocale(value)) return false;
  return Boolean(LOCALE_META[value]?.content);
}

/** 解析任意输入为已注册语言（含别名） */
export function resolveRegisteredLocale(
  input?: string | null,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (!input) return fallback;
  const raw = String(input).trim();
  if (isLocale(raw)) return raw;
  const byAlias = ALIAS_MAP.get(raw.toLowerCase());
  if (byAlias) return byAlias;
  // Accept-Language 片段：en-US,en;q=0.9
  const primary = raw.toLowerCase().split(',')[0]?.split(';')[0]?.trim();
  if (primary) {
    const hit = ALIAS_MAP.get(primary);
    if (hit) return hit;
    const prefix = primary.split('-')[0];
    const prefixHit = ALIAS_MAP.get(prefix);
    if (prefixHit) return prefixHit;
  }
  return fallback;
}

export function resolveUiLocale(
  input?: string | null,
  fallback: Locale = DEFAULT_UI_LOCALE,
): Locale {
  const loc = resolveRegisteredLocale(input, fallback);
  if (isUiLocale(loc)) return loc;
  // 内容语言无 UI 包时回落
  return isUiLocale(fallback) ? fallback : DEFAULT_UI_LOCALE;
}

export function resolveContentLocale(
  input?: string | null,
  fallback: Locale = DEFAULT_CONTENT_LOCALE,
): Locale {
  const loc = resolveRegisteredLocale(input, fallback);
  if (isContentLocale(loc)) return loc;
  return isContentLocale(fallback) ? fallback : DEFAULT_CONTENT_LOCALE;
}

export function contentLanguageLabel(locale: string | null | undefined): string {
  const def = getLocaleDefinition(locale);
  return def?.nativeLabel || def?.label || String(locale || DEFAULT_CONTENT_LOCALE);
}

export function contentPromptLanguage(locale: string | null | undefined): string {
  const def = getLocaleDefinition(locale);
  return def?.promptLanguage || 'English';
}

export function spokenCharsPerMinute(locale: string | null | undefined): number {
  const def = getLocaleDefinition(locale);
  return def?.density === 'latin' ? 750 : 220;
}

/** 对外 API 用的精简列表 */
export function listLocaleMeta(filter?: {
  ui?: boolean;
  content?: boolean;
}): LocaleMeta[] {
  return LOCALE_DEFINITIONS.filter((d) => {
    if (filter?.ui != null && d.ui !== filter.ui) return false;
    if (filter?.content != null && d.content !== filter.content) return false;
    return true;
  }).map((d) => LOCALE_META[d.code]);
}
